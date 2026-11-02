using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Timers;
using Microsoft.Extensions.Logging;
using MySqlConnector;

namespace NineCupSkins;

public class NineCupSkinsConfig : BasePluginConfig
{
    [JsonPropertyName("SiteUrl")] public string SiteUrl { get; set; } = "https://cs2-tournament-virid.vercel.app";
    // Ключ с сайта: админ → GET /api/server/key.
    [JsonPropertyName("ServerKey")] public string ServerKey { get; set; } = "";
    // Та же база, что у WeaponPaints.
    [JsonPropertyName("DatabaseHost")] public string DatabaseHost { get; set; } = "";
    [JsonPropertyName("DatabasePort")] public int DatabasePort { get; set; } = 3306;
    [JsonPropertyName("DatabaseUser")] public string DatabaseUser { get; set; } = "";
    [JsonPropertyName("DatabasePassword")] public string DatabasePassword { get; set; } = "";
    [JsonPropertyName("DatabaseName")] public string DatabaseName { get; set; } = "";
    [JsonPropertyName("RefreshSeconds")] public float RefreshSeconds { get; set; } = 30;
}

public record SkinRow(int Defindex, int Paint, float Wear, int Seed);

public record SkinsPlayer(string SteamId, string? Knife, int? GloveDefindex, List<SkinRow> Skins);

public record SkinsOut(List<SkinsPlayer> Players);

// Скины выбирают на сайте, а выдаёт их в игре WeaponPaints из своей базы
// MySQL. Сайт до этой базы не достаёт (она видна только с сервера), поэтому
// плагин раз в полминуты забирает выбор с сайта, переписывает изменившихся
// игроков в таблицы WeaponPaints и обновляет им скины командой wp_refresh.
//
// Записываем со стороной 0 — WeaponPaints понимает её как «обе стороны».
public class NineCupSkins : BasePlugin, IPluginConfig<NineCupSkinsConfig>
{
    public override string ModuleName => "nine cup skins";
    public override string ModuleVersion => "0.2.0";
    public override string ModuleAuthor => "nine cup";

    public NineCupSkinsConfig Config { get; set; } = new();

    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    private HttpClient? _http;
    private string _db = "";
    // Что уже записано: steamid → снимок выбора. Сравниваем, чтобы не трогать базу зря.
    private readonly Dictionary<string, string> _synced = [];
    private bool _busy;

    public void OnConfigParsed(NineCupSkinsConfig config)
    {
        Config = config;
        _db = new MySqlConnectionStringBuilder
        {
            Server = config.DatabaseHost,
            Port = (uint)config.DatabasePort,
            UserID = config.DatabaseUser,
            Password = config.DatabasePassword,
            Database = config.DatabaseName,
            Pooling = true,
        }.ConnectionString;
        _http = string.IsNullOrWhiteSpace(config.ServerKey)
            ? null
            : new HttpClient
            {
                BaseAddress = new Uri(config.SiteUrl.TrimEnd('/') + "/"),
                Timeout = TimeSpan.FromSeconds(20),
                DefaultRequestHeaders = { { "X-Server-Key", config.ServerKey } },
            };
    }

    public override void Load(bool hotReload)
    {
        if (_http is null || string.IsNullOrWhiteSpace(Config.DatabaseHost))
        {
            Logger.LogWarning("Не заданы ServerKey или база в configs/plugins/NineCupSkins/NineCupSkins.json");
            return;
        }
        // Первый раз — чуть позже: WeaponPaints должен успеть создать таблицы.
        AddTimer(10f, Sync);
        AddTimer(Config.RefreshSeconds, Sync, TimerFlags.REPEAT);
        // После смены карты WeaponPaints сам раздаёт скины не сразу (иногда через пару
        // минут) — подталкиваем всем, кто на сервере: на 10-й и 30-й секундах.
        RegisterListener<Listeners.OnMapStart>(_ =>
        {
            AddTimer(10f, RefreshOnline);
            AddTimer(30f, RefreshOnline);
        });
    }

    private void RefreshOnline()
    {
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
            Server.ExecuteCommand($"wp_refresh {p.SteamID}");
    }

    // Пустой сервер «спит», и таймеры стоят — поэтому сверяемся ещё и при входе.
    [GameEventHandler]
    public HookResult OnPlayerConnectFull(EventPlayerConnectFull @event, GameEventInfo info)
    {
        if (@event.Userid is not { IsValid: true, IsBot: false } p) return HookResult.Continue;
        Sync();
        // Зашедшему обновляем скины после того, как он прогрузился, и ещё раз для надёжности.
        var steam = p.SteamID;
        AddTimer(8f, () => Server.ExecuteCommand($"wp_refresh {steam}"));
        AddTimer(25f, () => Server.ExecuteCommand($"wp_refresh {steam}"));
        return HookResult.Continue;
    }

    private void Sync()
    {
        if (_busy || _http is null) return;
        _busy = true;
        var http = _http;
        Task.Run(async () =>
        {
            try
            {
                var data = await http.GetFromJsonAsync<SkinsOut>("api/server/skins", Json) ?? new SkinsOut([]);
                var changed = await Write(data);
                if (changed.Count == 0) return;
                Logger.LogInformation("Скины обновлены: {Players}", string.Join(", ", changed));
                // Обновляем в игре тем, кто сейчас на сервере (остальным — при входе).
                Server.NextFrame(() =>
                {
                    var online = Utilities.GetPlayers()
                        .Where(p => p is { IsValid: true, IsBot: false })
                        .Select(p => p.SteamID.ToString())
                        .ToHashSet();
                    foreach (var steam in changed.Where(online.Contains))
                        Server.ExecuteCommand($"wp_refresh {steam}");
                });
            }
            catch (Exception e)
            {
                Logger.LogWarning("Синхронизация скинов не удалась: {Message}", e.Message);
            }
            finally
            {
                _busy = false;
            }
        });
    }

    private async Task<List<string>> Write(SkinsOut data)
    {
        var want = data.Players
            .Where(p => ulong.TryParse(p.SteamId, out _))
            .ToDictionary(p => p.SteamId, p => p);
        var snapshot = want.ToDictionary(kv => kv.Key, kv => JsonSerializer.Serialize(kv.Value, Json));
        // Изменился выбор или игрок пропал с сайта (всё сбросил) — переписываем.
        var changed = snapshot.Where(kv => !_synced.TryGetValue(kv.Key, out var old) || old != kv.Value)
            .Select(kv => kv.Key)
            .Concat(_synced.Keys.Where(k => !want.ContainsKey(k)))
            .Distinct()
            .ToList();
        if (changed.Count == 0) return changed;

        await using var conn = new MySqlConnection(_db);
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();
        foreach (var steam in changed)
        {
            foreach (var table in new[] { "wp_player_skins", "wp_player_knife", "wp_player_gloves" })
                await Exec(conn, tx, $"DELETE FROM `{table}` WHERE `steamid` = @s", ("@s", steam));

            if (!want.TryGetValue(steam, out var p)) continue;
            foreach (var s in p.Skins)
                await Exec(conn, tx,
                    "INSERT INTO `wp_player_skins` (`steamid`, `weapon_team`, `weapon_defindex`, `weapon_paint_id`, `weapon_wear`, `weapon_seed`) " +
                    "VALUES (@s, 0, @d, @p, @w, @seed)",
                    ("@s", steam), ("@d", s.Defindex), ("@p", s.Paint), ("@w", s.Wear), ("@seed", s.Seed));
            if (!string.IsNullOrEmpty(p.Knife))
                await Exec(conn, tx, "INSERT INTO `wp_player_knife` (`steamid`, `weapon_team`, `knife`) VALUES (@s, 0, @k)",
                    ("@s", steam), ("@k", p.Knife));
            if (p.GloveDefindex is int g)
                await Exec(conn, tx, "INSERT INTO `wp_player_gloves` (`steamid`, `weapon_team`, `weapon_defindex`) VALUES (@s, 0, @g)",
                    ("@s", steam), ("@g", g));
        }
        await tx.CommitAsync();

        foreach (var steam in changed)
        {
            if (snapshot.TryGetValue(steam, out var snap)) _synced[steam] = snap;
            else _synced.Remove(steam);
        }
        return changed;
    }

    private static async Task Exec(MySqlConnection conn, MySqlTransaction tx, string sql, params (string Name, object Value)[] args)
    {
        await using var cmd = new MySqlCommand(sql, conn, tx);
        foreach (var (name, value) in args) cmd.Parameters.AddWithValue(name, value);
        await cmd.ExecuteNonQueryAsync();
    }
}
