using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;

namespace NineCupLobby;

public class NineCupLobbyConfig : BasePluginConfig
{
    [JsonPropertyName("SiteUrl")] public string SiteUrl { get; set; } = "https://cs2-tournament-virid.vercel.app";
    // Ключ с сайта: админ → GET /api/server/key.
    [JsonPropertyName("ServerKey")] public string ServerKey { get; set; } = "";
    [JsonPropertyName("RefreshSeconds")] public float RefreshSeconds { get; set; } = 15;
    // Кикать тех, кому сюда нельзя (не в лобби / не участник сайта).
    [JsonPropertyName("KickStrangers")] public bool KickStrangers { get; set; } = true;
}

// Лобби nine cup на нашем сервере. Всё решает сайт: какое лобби играем, кто в
// нём и на какой карте. Плагин пускает только этих игроков, грузит карту и
// режим, ждёт !ready, ведёт счёт по командам и присылает его на сайт.
public class NineCupLobby : BasePlugin, IPluginConfig<NineCupLobbyConfig>
{
    public override string ModuleName => "nine cup lobby";
    public override string ModuleVersion => "0.1.0";
    public override string ModuleAuthor => "nine cup";

    public NineCupLobbyConfig Config { get; set; } = new();
    private SiteApi? _api;
    private LobbyState? _state;

    private Lobby? _lobby;            // то, что играем сейчас
    private int _loadedLobby;         // для какого лобби уже загружали карту
    private readonly HashSet<string> _ready = [];
    private bool _starting;           // после !ready идёт разминка до начала матча
    private bool _live;               // матч идёт, раунды считаются
    private readonly int[] _score = new int[2];

    private static readonly string Tag = $" {ChatColors.Orange}nine cup{ChatColors.Default} ·";

    public void OnConfigParsed(NineCupLobbyConfig config)
    {
        Config = config;
        _api = string.IsNullOrWhiteSpace(config.ServerKey) ? null : new SiteApi(config.SiteUrl, config.ServerKey);
    }

    public override void Load(bool hotReload)
    {
        if (_api is null)
            Logger.LogWarning("ServerKey не задан в configs/plugins/NineCupLobby/NineCupLobby.json — плагин ничего не делает");
        RegisterListener<Listeners.OnMapStart>(_ => AddTimer(3f, Warmup));
        AddTimer(Config.RefreshSeconds, () => Refresh(), TimerFlags.REPEAT);
        Refresh();
    }

    // ---------------- состояние с сайта ----------------

    private void Refresh(Action? then = null)
    {
        if (_api is null) return;
        var api = _api;
        Task.Run(async () =>
        {
            try
            {
                var st = await api.State();
                Server.NextFrame(() => Apply(st, then));
            }
            catch (Exception e)
            {
                Logger.LogWarning("Сайт не ответил: {Message}", e.Message);
            }
        });
    }

    private void Apply(LobbyState st, Action? then = null)
    {
        _state = st;
        // Пока идёт матч, лобби не подменяем; отменили на сайте — сворачиваем.
        if (_live || _starting)
        {
            if (st.Lobby is null || st.Lobby.Id != _lobby?.Id)
            {
                _live = _starting = false;
                Server.PrintToChatAll($"{Tag} лобби закрыто на сайте");
                _lobby = st.Lobby;
            }
        }
        else
        {
            if (_lobby?.Id != st.Lobby?.Id) _ready.Clear();
            _lobby = st.Lobby;
        }
        KickStrangers();
        EnsureMap();
        then?.Invoke();
    }

    private bool IsAllowed(string steam)
    {
        if (_state is null) return true; // сайт не ответил — не выгоняем никого
        // Заходить можно всем участникам сайта: те, кто не в лобби, смотрят.
        // Посторонних (нет в базе сайта) не пускаем.
        return _state.Admins.Contains(steam) || _state.Known.Contains(steam) ||
               (_lobby?.Players.Any(p => p.SteamId == steam) ?? false);
    }

    private bool IsAdmin(CCSPlayerController? p) => p is null || (_state?.Admins.Contains(p.SteamID.ToString()) ?? false);

    private static IEnumerable<CCSPlayerController> Humans() =>
        Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false, IsHLTV: false });

    private void KickStrangers()
    {
        if (!Config.KickStrangers || _state is null) return;
        foreach (var p in Humans().ToList())
        {
            if (IsAllowed(p.SteamID.ToString())) continue;
            Logger.LogInformation("Кик {Name} ({Steam}) — нет на сайте", p.PlayerName, p.SteamID);
            Server.ExecuteCommand($"kickid {p.UserId} \"Тебя нет в списке участников nine cup\"");
        }
    }

    // ---------------- карта и разминка ----------------

    private void EnsureMap()
    {
        if (_lobby is null || _live || _starting || _loadedLobby == _lobby.Id) return;
        _loadedLobby = _lobby.Id;
        if (Server.MapName.Equals(_lobby.MapId, StringComparison.OrdinalIgnoreCase) && _lobby.WorkshopId is null)
        {
            Warmup();
            return;
        }
        Server.PrintToChatAll($"{Tag} лобби #{_lobby.Id}: грузим {_lobby.Map}…");
        LoadMap(_lobby);
    }

    private static void LoadMap(Lobby l)
    {
        // Режимы: дуэль — соревновательный, wingman — 2×2, свободная — казуал.
        var (type, mode) = l.Mode switch { "wingman" => (0, 2), "free" => (0, 0), _ => (0, 1) };
        Server.ExecuteCommand($"game_type {type}; game_mode {mode}");
        Server.ExecuteCommand(l.WorkshopId is not null ? $"host_workshop_map {l.WorkshopId}" : $"changelevel {l.MapId}");
    }

    private void Warmup()
    {
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
        if (_lobby is null) { Say($"{Tag} лобби нет — создай на сайте"); return; }
        string Team(int t) => string.Join(", ", _lobby.Players.Where(p => p.Team == t).Select(p => p.Name));
        Say($"{Tag} {ModeName(_lobby.Mode)}, {_lobby.Map}: {ChatColors.Green}{Team(1)}{ChatColors.Default} vs {ChatColors.Green}{Team(2)}{ChatColors.Default}");
        if (_live) { Say($"{Tag} счёт {_score[0]}:{_score[1]}"); return; }
        var missing = _lobby.Players.Where(p => Find(p) is null).Select(p => p.Name).ToList();
        Say(missing.Count > 0
            ? $"{Tag} ждём: {string.Join(", ", missing)}"
            : $"{Tag} все на месте — пишите {ChatColors.Green}!ready{ChatColors.Default} ({_ready.Count}/{_lobby.Players.Count})");
    }

    private static string ModeName(string mode) => mode switch { "duel" => "дуэль 1×1", "wingman" => "wingman 2×2", _ => "свободная игра" };

    private CCSPlayerController? Find(LobbyPlayer p) =>
        Humans().FirstOrDefault(h => h.SteamID.ToString() == p.SteamId);

    // ---------------- старт, счёт, конец ----------------

    private void StartMatch()
    {
        if (_lobby is null) return;
        if (_lobby.Players.Any(p => Find(p) is null)) { Announce(); return; }

        var inLobby = _lobby.Players.ToDictionary(p => p.SteamId);
        foreach (var h in Humans())
        {
            if (inLobby.TryGetValue(h.SteamID.ToString(), out var lp))
                h.ChangeTeam(lp.Team == 1 ? CsTeam.Terrorist : CsTeam.CounterTerrorist);
            else
                h.ChangeTeam(CsTeam.Spectator);
        }

        _score[0] = _score[1] = 0;
        _starting = true;
        if (_lobby.Mode == "duel")
        {
            // Как дуэли на Cybershoke: до 13, овертаймы, без заморозки, 2 минуты на раунд.
            Server.ExecuteCommand(
                "mp_maxrounds 24; mp_overtime_enable 1; mp_overtime_maxrounds 6; mp_match_can_clinch 1; " +
                "mp_freezetime 0; mp_roundtime 2; mp_roundtime_defuse 2; mp_halftime 1");
        }
        Server.ExecuteCommand("mp_warmup_pausetimer 0; mp_warmuptime 10; mp_warmup_end");
        Server.PrintToChatAll($"{Tag} поехали!");
    }

    private void BeginLive()
    {
        if (!_starting) return;
        _starting = false;
        _live = true;
        _score[0] = _score[1] = 0;
        if (_lobby is not null) Post(new StatusIn(_lobby.Id, "live", null), null);
    }

    [GameEventHandler]
    public HookResult OnMatchStart(EventRoundAnnounceMatchStart @event, GameEventInfo info)
    {
        BeginLive();
        return HookResult.Continue;
    }

    // Запасной путь: если объявление начала матча не пришло, матч начался с
    // первым раундом вне разминки.
    [GameEventHandler]
    public HookResult OnRoundStart(EventRoundStart @event, GameEventInfo info)
    {
        if (_starting && !InWarmup()) BeginLive();
        return HookResult.Continue;
    }

    private static bool InWarmup() =>
        Utilities.FindAllEntitiesByDesignerName<CCSGameRulesProxy>("cs_gamerules")
            .FirstOrDefault()?.GameRules?.WarmupPeriod ?? false;

    [GameEventHandler]
    public HookResult OnRoundEnd(EventRoundEnd @event, GameEventInfo info)
    {
        if (!_live || _lobby is null || InWarmup()) return HookResult.Continue;
        // Раунд — команде лобби того игрока, чья сторона выиграла. Считаем по
        // людям, а не по сторонам: на смене сторон счёт команд переезжает.
        var teams = _lobby.Players.ToDictionary(p => p.SteamId, p => p.Team);
        var any = Humans().FirstOrDefault(p => p.TeamNum == @event.Winner && teams.ContainsKey(p.SteamID.ToString()));
        if (any is not null) _score[teams[any.SteamID.ToString()] - 1]++;
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult OnMatchEnd(EventCsWinPanelMatch @event, GameEventInfo info)
    {
        if (!_live || _lobby is null) return HookResult.Continue;
        _live = false;
        var lobby = _lobby;
        var score = new List<int> { _score[0], _score[1] };
        Server.PrintToChatAll($"{Tag} итог: команда 1 {score[0]}:{score[1]} команда 2");
        Post(new StatusIn(lobby.Id, "finished", score), st =>
        {
            Server.PrintToChatAll($"{Tag} счёт отправлен на сайт");
            _ready.Clear();
            Apply(st);
        });
        return HookResult.Continue;
    }

    private void Post(StatusIn body, Action<LobbyState>? done)
    {
        if (_api is null) return;
        var api = _api;
        Task.Run(async () =>
        {
            try
            {
                var st = await api.Status(body);
                if (done is not null) Server.NextFrame(() => done(st));
            }
            catch (Exception e)
            {
                Logger.LogError("Не удалось отправить статус {Status}: {Message}", body.Status, e.Message);
                Server.NextFrame(() =>
                    Server.PrintToChatAll($"{Tag} {ChatColors.Red}сайт не принял результат{ChatColors.Default} ({e.Message}) — внесите вручную"));
            }
        });
    }

    // ---------------- игроки и команды ----------------

    [GameEventHandler]
    public HookResult OnPlayerConnectFull(EventPlayerConnectFull @event, GameEventInfo info)
    {
        var p = @event.Userid;
        if (p is null || !p.IsValid || p.IsBot) return HookResult.Continue;
        // Сначала свежее состояние с сайта: лобби могли создать прямо сейчас, а
        // пустой сервер «спит», и таймер мог стоять.
        Refresh(() =>
        {
            if (p.IsValid) AddTimer(2f, () => { if (p.IsValid) Announce(p); });
        });
        return HookResult.Continue;
    }

    [ConsoleCommand("css_ready", "Готов к игре")]
    public void OnReady(CCSPlayerController? player, CommandInfo cmd)
    {
        if (player is null || _lobby is null || _live || _starting) return;
        var steam = player.SteamID.ToString();
        if (_lobby.Players.All(p => p.SteamId != steam))
        {
            player.PrintToChat($"{Tag} сейчас играют другие — ты зритель");
            return;
        }
        _ready.Add(steam);
        Server.PrintToChatAll($"{Tag} {player.PlayerName} готов ({_ready.Count}/{_lobby.Players.Count})");
        if (_lobby.Players.All(p => _ready.Contains(p.SteamId))) StartMatch();
    }

    [ConsoleCommand("css_unready", "Не готов")]
    public void OnUnready(CCSPlayerController? player, CommandInfo cmd)
    {
        if (player is null || _live || _starting || _lobby is null) return;
        if (_ready.Remove(player.SteamID.ToString()))
            Server.PrintToChatAll($"{Tag} {player.PlayerName} не готов ({_ready.Count}/{_lobby.Players.Count})");
    }

    [ConsoleCommand("css_lobby", "Текущее лобби")]
    public void OnLobby(CCSPlayerController? player, CommandInfo cmd) => Refresh(() => Announce(player));

    [ConsoleCommand("css_start", "Админ: начать без !ready")]
    public void OnStart(CCSPlayerController? player, CommandInfo cmd)
    {
        if (!IsAdmin(player) || _live || _starting) return;
        StartMatch();
    }

    [ConsoleCommand("css_stop", "Админ: остановить игру, счёт не отправляется")]
    public void OnStop(CCSPlayerController? player, CommandInfo cmd)
    {
        if (!IsAdmin(player)) return;
        _live = _starting = false;
        _ready.Clear();
        Server.PrintToChatAll($"{Tag} игра остановлена админом");
        Warmup();
    }
}
