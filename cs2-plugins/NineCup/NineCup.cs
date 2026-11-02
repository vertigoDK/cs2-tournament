using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;

namespace NineCup;

public class NineCupConfig : BasePluginConfig
{
    [JsonPropertyName("SiteUrl")] public string SiteUrl { get; set; } = "https://cs2-tournament-virid.vercel.app";
    // Ключ с сайта: админ → GET /api/server/key.
    [JsonPropertyName("ServerKey")] public string ServerKey { get; set; } = "";
    // 0 — идущий турнир, иначе конкретный.
    [JsonPropertyName("TournamentId")] public int TournamentId { get; set; } = 0;
    // Кикать тех, кого нет в турнире.
    [JsonPropertyName("KickStrangers")] public bool KickStrangers { get; set; } = true;
    // Steam ID, кому можно всегда (кастеры, гости) и кто может !start / !stop.
    [JsonPropertyName("ExtraAllowed")] public List<string> ExtraAllowed { get; set; } = [];
    [JsonPropertyName("Admins")] public List<string> Admins { get; set; } = [];
    // Карта дуэлей из Мастерской (aim_map_s2).
    [JsonPropertyName("DuelWorkshopId")] public string DuelWorkshopId { get; set; } = "3074525246";
    [JsonPropertyName("RefreshSeconds")] public float RefreshSeconds { get; set; } = 20;
}

// Турнир nine cup на нашем сервере: пускает только участников, проводит
// дуэли 1×1 и отправляет счёт на сайт. Всё о сетке знает сайт — плагин
// только спрашивает, кто играет, и сообщает результат.
public class NineCup : BasePlugin, IPluginConfig<NineCupConfig>
{
    public override string ModuleName => "nine cup";
    public override string ModuleVersion => "0.1.0";
    public override string ModuleAuthor => "nine cup";

    public NineCupConfig Config { get; set; } = new();
    private SiteApi? _api;
    private ServerState? _state;

    // Текущая дуэль на сервере.
    private ServerDuel? _duel;
    private readonly HashSet<string> _ready = [];
    private bool _starting;   // ждём начала матча после разминки
    private bool _live;       // идёт, раунды считаются
    private readonly Dictionary<string, int> _wins = [];
    private bool _mapRequested;

    private static readonly string Tag = $" {ChatColors.Orange}nine cup{ChatColors.Default} ·";

    public void OnConfigParsed(NineCupConfig config)
    {
        Config = config;
        _api = string.IsNullOrWhiteSpace(config.ServerKey) ? null : new SiteApi(config.SiteUrl, config.ServerKey);
    }

    public override void Load(bool hotReload)
    {
        if (_api is null)
            Logger.LogWarning("ServerKey не задан в configs/plugins/NineCup/NineCup.json — плагин ничего не делает");
        RegisterListener<Listeners.OnMapStart>(_ => AddTimer(3f, Warmup));
        AddTimer(Config.RefreshSeconds, () => Refresh(), CounterStrikeSharp.API.Modules.Timers.TimerFlags.REPEAT);
        Refresh();
        if (hotReload) AddTimer(1f, Warmup);
    }

    // ---------------- состояние с сайта ----------------

    private void Refresh(Action? then = null)
    {
        if (_api is null) return;
        var api = _api;
        var id = Config.TournamentId;
        Task.Run(async () =>
        {
            try
            {
                var st = await api.State(id);
                Server.NextFrame(() =>
                {
                    _state = st;
                    if (!_live && !_starting) _duel = st.Duel;
                    KickStrangers();
                    EnsureDuelMap();
                    then?.Invoke();
                });
            }
            catch (Exception e)
            {
                Logger.LogWarning("Сайт не ответил: {Message}", e.Message);
            }
        });
    }

    private bool IsAllowed(string steam) =>
        Config.ExtraAllowed.Contains(steam) || Config.Admins.Contains(steam) ||
        (_state?.Allowed.Any(p => p.SteamId == steam) ?? true);

    private bool IsAdmin(CCSPlayerController? p) => p is null || Config.Admins.Contains(p.SteamID.ToString());

    private static IEnumerable<CCSPlayerController> Humans() =>
        Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false, IsHLTV: false });

    private void KickStrangers()
    {
        if (!Config.KickStrangers || _state is null) return;
        foreach (var p in Humans().ToList())
        {
            if (IsAllowed(p.SteamID.ToString())) continue;
            Logger.LogInformation("Кик {Name} ({Steam}) — нет в турнире", p.PlayerName, p.SteamID);
            Server.ExecuteCommand($"kickid {p.UserId} \"Тебя нет в турнире {_state.Tournament}\"");
        }
    }

    private void EnsureDuelMap()
    {
        if (_duel is null || _live || _starting || _mapRequested) return;
        if (Server.MapName.Equals(_state?.DuelMap ?? "", StringComparison.OrdinalIgnoreCase)) return;
        _mapRequested = true;
        Server.PrintToChatAll($"{Tag} загружаем карту дуэлей…");
        // Соревновательный режим: свои правила раундов, без случайного респавна.
        Server.ExecuteCommand("game_type 0; game_mode 1");
        Server.ExecuteCommand($"host_workshop_map {Config.DuelWorkshopId}");
    }

    // ---------------- разминка и старт ----------------

    private void Warmup()
    {
        _mapRequested = false;
        if (_live) return;
        Server.ExecuteCommand(
            "bot_quota 0; bot_kick; mp_autoteambalance 0; mp_limitteams 0; " +
            "mp_warmuptime 9999; mp_warmup_pausetimer 1; mp_warmup_start");
        Announce();
    }

    private void Announce(CCSPlayerController? to = null)
    {
        void Say(string msg)
        {
            if (to is null) Server.PrintToChatAll(msg);
            else to.PrintToChat(msg);
        }

        if (_state is null) { Say($"{Tag} нет связи с сайтом"); return; }
        if (_duel is null)
        {
            Say($"{Tag} {_state.Tournament}: дуэлей больше нет");
            if (_state.DuelPlaces.Count > 0)
                Say($"{Tag} " + string.Join(", ", _state.DuelPlaces.Select(p => $"{p.Place}. {p.Name}")));
            return;
        }
        var (a, b) = (_duel.Players[0], _duel.Players[1]);
        Say($"{Tag} дуэль {_duel.Label}: {ChatColors.Green}{a.Name}{ChatColors.Default} vs {ChatColors.Green}{b.Name}{ChatColors.Default} (осталось {_state.DuelsLeft})");
        if (_live) return;
        var missing = _duel.Players.Where(p => Find(p) is null).Select(p => p.Name).ToList();
        Say(missing.Count > 0
            ? $"{Tag} ждём: {string.Join(", ", missing)}"
            : $"{Tag} оба на месте — пишите {ChatColors.Green}!ready{ChatColors.Default} ({_ready.Count}/2)");
    }

    private CCSPlayerController? Find(ServerPlayer p) =>
        Humans().FirstOrDefault(h => h.SteamID.ToString() == p.SteamId);

    private void StartDuel()
    {
        if (_duel is null) return;
        var a = Find(_duel.Players[0]);
        var b = Find(_duel.Players[1]);
        if (a is null || b is null) { Announce(); return; }

        foreach (var p in Humans())
            if (p != a && p != b) p.ChangeTeam(CsTeam.Spectator);
        a.ChangeTeam(CsTeam.Terrorist);
        b.ChangeTeam(CsTeam.CounterTerrorist);

        _wins.Clear();
        foreach (var p in _duel.Players) _wins[p.SteamId!] = 0;
        _starting = true;
        // Как дуэли на Cybershoke: до 13, овертаймы, без заморозки, 2 минуты на раунд.
        Server.ExecuteCommand(
            "mp_maxrounds 24; mp_overtime_enable 1; mp_overtime_maxrounds 6; mp_match_can_clinch 1; " +
            "mp_freezetime 0; mp_roundtime 2; mp_roundtime_defuse 2; mp_halftime 1; " +
            "mp_warmup_pausetimer 0; mp_warmuptime 10; mp_warmup_end");
        Server.PrintToChatAll($"{Tag} поехали: {ChatColors.Green}{a.PlayerName}{ChatColors.Default} vs {ChatColors.Green}{b.PlayerName}{ChatColors.Default}, до 13");
    }

    [GameEventHandler]
    public HookResult OnMatchStart(EventRoundAnnounceMatchStart @event, GameEventInfo info)
    {
        if (_starting)
        {
            _starting = false;
            _live = true;
            foreach (var key in _wins.Keys.ToList()) _wins[key] = 0;
        }
        return HookResult.Continue;
    }

    // Запасной путь: если объявление начала матча не пришло, матч начался с
    // первым раундом вне разминки.
    [GameEventHandler]
    public HookResult OnRoundStart(EventRoundStart @event, GameEventInfo info)
    {
        if (_starting && !InWarmup()) OnMatchStart(null!, info);
        return HookResult.Continue;
    }

    private static bool InWarmup() =>
        Utilities.FindAllEntitiesByDesignerName<CCSGameRulesProxy>("cs_gamerules")
            .FirstOrDefault()?.GameRules?.WarmupPeriod ?? false;

    [GameEventHandler]
    public HookResult OnRoundEnd(EventRoundEnd @event, GameEventInfo info)
    {
        if (!_live || _duel is null || InWarmup()) return HookResult.Continue;
        // Раунд — тому дуэлянту, чья сторона выиграла. Считаем по людям, а не по
        // сторонам: на смене сторон счёт команд переезжает.
        var winner = Humans().FirstOrDefault(p => p.TeamNum == @event.Winner && _wins.ContainsKey(p.SteamID.ToString()));
        if (winner is not null) _wins[winner.SteamID.ToString()]++;
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult OnMatchEnd(EventCsWinPanelMatch @event, GameEventInfo info)
    {
        if (!_live || _duel is null) return HookResult.Continue;
        _live = false;
        var steams = _duel.Players.Select(p => p.SteamId!).ToList();
        var score = steams.Select(s => _wins.GetValueOrDefault(s)).ToList();
        Server.PrintToChatAll($"{Tag} счёт {score[0]}:{score[1]}, отправляем на сайт…");
        Report(steams, score);
        return HookResult.Continue;
    }

    private void Report(List<string> steams, List<int> score)
    {
        if (_api is null) return;
        var api = _api;
        var body = new DuelResultIn(Config.TournamentId > 0 ? Config.TournamentId : _state?.TournamentId, steams, score);
        Task.Run(async () =>
        {
            try
            {
                var res = await api.DuelResult(body);
                Server.NextFrame(() =>
                {
                    foreach (var line in res.Chat) Server.PrintToChatAll($"{Tag} {line}");
                    _state = res.State;
                    _duel = res.State.Duel;
                    _ready.Clear();
                    // Чистая карта к следующей дуэли.
                    AddTimer(12f, () => Server.ExecuteCommand($"host_workshop_map {Config.DuelWorkshopId}"));
                });
            }
            catch (Exception e)
            {
                Logger.LogError("Не удалось отправить счёт {A}:{B}: {Message}", score[0], score[1], e.Message);
                Server.NextFrame(() =>
                    Server.PrintToChatAll($"{Tag} {ChatColors.Red}сайт не принял счёт{ChatColors.Default} ({e.Message}) — внесите вручную"));
            }
        });
    }

    // ---------------- игроки и команды ----------------

    [GameEventHandler]
    public HookResult OnPlayerConnectFull(EventPlayerConnectFull @event, GameEventInfo info)
    {
        var p = @event.Userid;
        if (p is null || !p.IsValid || p.IsBot) return HookResult.Continue;
        if (Config.KickStrangers && _state is not null && !IsAllowed(p.SteamID.ToString()))
        {
            KickStrangers();
            return HookResult.Continue;
        }
        AddTimer(3f, () => { if (p.IsValid) Announce(p); });
        return HookResult.Continue;
    }

    [ConsoleCommand("css_ready", "Готов к дуэли")]
    public void OnReady(CCSPlayerController? player, CommandInfo cmd)
    {
        if (player is null || _duel is null || _live || _starting) return;
        var steam = player.SteamID.ToString();
        if (_duel.Players.All(p => p.SteamId != steam))
        {
            player.PrintToChat($"{Tag} сейчас играют другие — ты зритель");
            return;
        }
        _ready.Add(steam);
        Server.PrintToChatAll($"{Tag} {player.PlayerName} готов ({_ready.Count}/2)");
        if (_duel.Players.All(p => _ready.Contains(p.SteamId!))) StartDuel();
    }

    [ConsoleCommand("css_unready", "Не готов")]
    public void OnUnready(CCSPlayerController? player, CommandInfo cmd)
    {
        if (player is null || _live || _starting) return;
        if (_ready.Remove(player.SteamID.ToString()))
            Server.PrintToChatAll($"{Tag} {player.PlayerName} не готов ({_ready.Count}/2)");
    }

    [ConsoleCommand("css_duel", "Текущая дуэль и места")]
    public void OnDuel(CCSPlayerController? player, CommandInfo cmd) => Refresh(() => Announce(player));

    [ConsoleCommand("css_start", "Админ: начать дуэль без !ready")]
    public void OnStart(CCSPlayerController? player, CommandInfo cmd)
    {
        if (!IsAdmin(player) || _live || _starting) return;
        StartDuel();
    }

    [ConsoleCommand("css_stop", "Админ: отменить идущую дуэль, счёт не отправляется")]
    public void OnStop(CCSPlayerController? player, CommandInfo cmd)
    {
        if (!IsAdmin(player)) return;
        _live = _starting = false;
        _ready.Clear();
        Server.PrintToChatAll($"{Tag} дуэль отменена админом");
        Warmup();
    }
}
