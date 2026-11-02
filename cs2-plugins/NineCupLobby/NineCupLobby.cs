using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;
using Timer = CounterStrikeSharp.API.Modules.Timers.Timer;
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
    // Steam ID админов сервера: !start без всех игроков (пустые места — боты), !stop.
    [JsonPropertyName("Admins")] public List<string> Admins { get; set; } = [];
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
    // Ножевой раунд в wingman: сначала нож, потом победители выбирают сторону.
    private bool _knife;              // идёт ножевой раунд
    private bool _choosing;           // ждём !switch / !stay от победителей ножа
    private int _knifeWinner;         // сторона (2 — T, 3 — CT), выигравшая нож
    private Timer? _chooseTimer;
    private int _bots;                // сколько ботов заменяют отсутствующих (для !start админа)
    private int _botsTeam1, _botsTeam2; // из них — за команду 1 и команду 2 лобби
    private bool _awaitingMap;        // грузим карту лобби; как загрузится — сообщим сайту «готово»
    private readonly int[] _score = new int[2];
    // Убийства / смерти / ассисты игроков лобби за матч: steamid → [k, d, a].
    private readonly Dictionary<string, int[]> _kda = [];

    // Игра уже запущена (нож, выбор стороны, разминка перед матчем или сам матч).
    private bool InGame => _live || _starting || _knife || _choosing;

    private static readonly string Tag = $" {ChatColors.Orange}nine cup{ChatColors.Default} ·";

    public void OnConfigParsed(NineCupLobbyConfig config)
    {
        Config = config;
        _api = string.IsNullOrWhiteSpace(config.ServerKey) ? null : new SiteApi(config.SiteUrl, config.ServerKey);
    }

    private Watchdog? _watch;

    public override void Load(bool hotReload)
    {
        _watch = new Watchdog(Logger);
        RegisterListener<Listeners.OnTick>(() => _watch.OnTick());
        // Отметки событий для сторожа: что было перед зависанием.
        RegisterEventHandler<EventRoundStart>((_, _) => { _watch.Mark("round_start"); return HookResult.Continue; }, HookMode.Pre);
        RegisterEventHandler<EventRoundFreezeEnd>((_, _) => { _watch.Mark("freeze_end"); return HookResult.Continue; }, HookMode.Pre);
        RegisterEventHandler<EventRoundEnd>((_, _) => { _watch.Mark("round_end"); return HookResult.Continue; }, HookMode.Pre);
        RegisterEventHandler<EventPlayerSpawn>((_, _) => { _watch.Mark("player_spawn"); return HookResult.Continue; }, HookMode.Pre);
        RegisterEventHandler<EventPlayerDeath>((_, _) => { _watch.Mark("player_death"); return HookResult.Continue; }, HookMode.Pre);
        RegisterEventHandler<EventItemPurchase>((_, _) => { _watch.Mark("item_purchase"); return HookResult.Continue; }, HookMode.Pre);
        RegisterEventHandler<EventWeaponFire>((_, _) => { _watch.Mark("weapon_fire"); return HookResult.Continue; }, HookMode.Pre);
        RegisterEventHandler<EventPlayerConnectFull>((_, _) => { _watch.Mark("player_connect_full"); return HookResult.Continue; }, HookMode.Pre);
        RegisterListener<Listeners.OnMapStart>(_ => _watch.Mark("map_start"));
        if (_api is null)
            Logger.LogWarning("ServerKey не задан в configs/plugins/NineCupLobby/NineCupLobby.json — плагин ничего не делает");
        RegisterListener<Listeners.OnMapStart>(_ => AddTimer(3f, () =>
        {
            Warmup();
            if (_awaitingMap) { _awaitingMap = false; PostReady(); }
        }));
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
        if (InGame)
        {
            if (st.Lobby is null || st.Lobby.Id != _lobby?.Id)
            {
                _live = _starting = _knife = _choosing = false;
                _chooseTimer?.Kill();
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
        return Config.Admins.Contains(steam) || _state.Admins.Contains(steam) || _state.Known.Contains(steam) ||
               (_lobby?.Players.Any(p => p.SteamId == steam) ?? false);
    }

    private bool IsAdmin(CCSPlayerController? p) =>
        p is null || Config.Admins.Contains(p.SteamID.ToString()) || (_state?.Admins.Contains(p.SteamID.ToString()) ?? false);

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
        if (_lobby is null || InGame || _loadedLobby == _lobby.Id) return;
        _loadedLobby = _lobby.Id;
        if (Server.MapName.Equals(_lobby.MapId, StringComparison.OrdinalIgnoreCase))
        {
            Warmup();
            PostReady();
            return;
        }
        _awaitingMap = true;
        Server.PrintToChatAll($"{Tag} лобби #{_lobby.Id}: грузим {_lobby.Map}…");
        LoadMap(_lobby);
    }

    private static void LoadMap(Lobby l)
    {
        // Режимы: дуэль — соревновательный, wingman — 2×2, свободная — казуал.
        var (type, mode) = l.Mode switch { "wingman" => (0, 2), "free" => (0, 0), _ => (0, 1) };
        Server.ExecuteCommand($"game_type {type}; game_mode {mode}");
        Server.ExecuteCommand(l.WorkshopId is not null ? $"host_workshop_map {l.WorkshopId}" : $"map {l.MapId}");
    }

    // Карта загружена — сайт показывает адрес только теперь: заходящие во время смены карты вылетали.
    private void PostReady()
    {
        if (_lobby is { Status: "waiting" } l) Post(new StatusIn(l.Id, "ready", null), st => Apply(st));
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

    private void StartMatch(bool withBots = false)
    {
        if (_lobby is null) return;
        if (!withBots && _lobby.Players.Any(p => Find(p) is null)) { Announce(); return; }

        var inLobby = _lobby.Players.ToDictionary(p => p.SteamId);
        foreach (var h in Humans())
        {
            if (inLobby.TryGetValue(h.SteamID.ToString(), out var lp))
                h.ChangeTeam(SideOf(lp.Team));
            else
                h.ChangeTeam(CsTeam.Spectator);
        }

        _bots = _botsTeam1 = _botsTeam2 = 0;
        if (withBots)
        {
            // Кого нет — того заменяет бот на его стороне (для проверки в одиночку).
            var missing = _lobby.Players.Where(p => Find(p) is null).ToList();
            // Сначала убираем всех ботов: файл режима wingman сам держит bot_quota 1.
            Server.ExecuteCommand("bot_kick; bot_quota_mode normal; bot_quota 0; bot_join_after_player 0");
            _bots = missing.Count;
            _botsTeam1 = missing.Count(p => p.Team == 1);
            _botsTeam2 = missing.Count(p => p.Team == 2);
            if (missing.Count > 0)
            {
                foreach (var p in missing) Server.ExecuteCommand(SideOf(p.Team) == CsTeam.Terrorist ? "bot_add_t" : "bot_add_ct");
                // Менеджер ботов игры любит докинуть своего — через секунду-другую выравниваем сами.
                AddTimer(1.5f, FixBots);
                Server.PrintToChatAll($"{Tag} вместо {string.Join(", ", missing.Select(p => p.Name))} — боты");
            }
        }

        _score[0] = _score[1] = 0;
        if (_lobby.Mode == "wingman" && _lobby.Side1 is null)
        {
            StartKnife();
            return;
        }
        if (_lobby.Mode == "wingman")
        {
            // Стороны выбраны наградой на сайте — без ножа, сразу матч по правилам wingman.
            Server.PrintToChatAll($"{Tag} стороны выбраны наградой: команда 1 — {_lobby.Side1}, ножевого раунда нет");
            Server.ExecuteCommand(
                "mp_maxrounds 16; mp_overtime_enable 1; mp_overtime_maxrounds 6; mp_match_can_clinch 1; mp_halftime 1");
        }
        _starting = true;
        // Допы без конца: при ничьей играем овертаймы, пока кто-то не выиграет.
        if (_lobby.Mode == "duel")
        {
            // Как дуэли на Cybershoke: до 13, без заморозки, 2 минуты на раунд.
            Server.ExecuteCommand(
                "mp_maxrounds 24; mp_overtime_enable 1; mp_overtime_maxrounds 6; mp_match_can_clinch 1; " +
                "mp_freezetime 0; mp_roundtime 2; mp_roundtime_defuse 2; mp_halftime 1");
        }
        Server.ExecuteCommand("mp_warmup_pausetimer 0; mp_warmuptime 10; mp_warmup_end");
        Server.PrintToChatAll($"{Tag} поехали!");
    }

    // ---------------- ножевой раунд (wingman) ----------------

    // На какой стороне начинает команда лобби: обычно команда 1 — T, если наградой не выбрано иное.
    private CsTeam SideOf(int team)
    {
        var t1 = _lobby?.Side1 == "CT" ? CsTeam.CounterTerrorist : CsTeam.Terrorist;
        return team == 1 ? t1 : (t1 == CsTeam.Terrorist ? CsTeam.CounterTerrorist : CsTeam.Terrorist);
    }

    private void StartKnife()
    {
        _knife = true;
        _choosing = false;
        // Только ножи: без пистолетов по умолчанию, денег, закупки и бомбы.
        Server.ExecuteCommand(
            "mp_give_player_c4 0; mp_startmoney 0; mp_buytime 0; mp_free_armor 0; " +
            "mp_t_default_secondary \"\"; mp_ct_default_secondary \"\"; " +
            "mp_warmup_pausetimer 0; mp_warmuptime 5; mp_warmup_end");
        Server.PrintToChatAll($"{Tag} {ChatColors.Green}ножевой раунд{ChatColors.Default}: у всех только ножи. Выигравшая команда выберет сторону (!switch / !stay)");
    }

    private void StripToKnife()
    {
        foreach (var h in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsHLTV: false, PawnIsAlive: true } && p.TeamNum is 2 or 3))
        {
            h.RemoveWeapons();
            h.GiveNamedItem("weapon_knife");
        }
    }

    private void KnifeOver(int winnerSide)
    {
        _knife = false;
        if (winnerSide != 2 && winnerSide != 3)
        {
            // Ничья в ноже (никто не убит до конца времени) — переигрываем.
            Server.PrintToChatAll($"{Tag} нож без победителя — ещё раз");
            AddTimer(4f, StartKnife);
            return;
        }
        _knifeWinner = winnerSide;
        _choosing = true;
        Server.ExecuteCommand("mp_warmup_pausetimer 1; mp_warmuptime 9999; mp_warmup_start");
        var side = winnerSide == 2 ? "T" : "CT";
        Server.PrintToChatAll($"{Tag} нож выиграли {ChatColors.Green}{side}{ChatColors.Default}: пишите {ChatColors.Green}!switch{ChatColors.Default} — сменить сторону, {ChatColors.Green}!stay{ChatColors.Default} — остаться (30 сек)");
        _chooseTimer?.Kill();
        _chooseTimer = AddTimer(30f, () =>
        {
            if (!_choosing) return;
            Server.PrintToChatAll($"{Tag} выбора нет — остаёмся");
            Choose(false);
        });
    }

    private void Choose(bool swap)
    {
        if (!_choosing || _lobby is null) return;
        _choosing = false;
        _chooseTimer?.Kill();
        _chooseTimer = null;
        if (swap)
        {
            // Меняются все на сторонах — и игроки, и боты, иначе команды разъедутся.
            foreach (var h in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsHLTV: false } && p.TeamNum is 2 or 3).ToList())
                h.ChangeTeam(h.TeamNum == 2 ? CsTeam.CounterTerrorist : CsTeam.Terrorist);
        }
        Server.PrintToChatAll($"{Tag} {(swap ? "меняемся сторонами" : "остаёмся")} — матч начинается заново");
        // Правила wingman по умолчанию обратно, плюс допы без конца.
        _starting = true;
        Server.ExecuteCommand("exec gamemode_competitive2v2");
        // Файл режима снова включает автоботов — держим ровно тех, что заменяют отсутствующих.
        Server.ExecuteCommand($"bot_quota_mode normal; bot_quota {_bots}; bot_join_after_player 0");
        if (_bots > 0) AddTimer(1.5f, FixBots);
        Server.ExecuteCommand(
            "mp_t_default_secondary weapon_glock; mp_ct_default_secondary weapon_hkp2000; mp_give_player_c4 1; " +
            "mp_startmoney 800; mp_buytime 20; " +
            "mp_maxrounds 16; mp_overtime_enable 1; mp_overtime_maxrounds 6; mp_match_can_clinch 1; mp_halftime 1; " +
            "mp_warmup_pausetimer 0; mp_warmuptime 5; mp_warmup_end");
    }

    // Ровно столько ботов, сколько не хватает игроков, и каждый — на стороне своей команды лобби.
    private void FixBots()
    {
        if (_lobby is null) return;
        Server.ExecuteCommand($"bot_quota_mode normal; bot_quota {_bots}");
        var teamOf = _lobby.Players.ToDictionary(p => p.SteamId, p => p.Team);
        // Где сейчас команда 1: по её живому игроку, иначе — напротив игрока команды 2, иначе T.
        var h1 = Humans().FirstOrDefault(h => h.TeamNum is 2 or 3 && teamOf.GetValueOrDefault(h.SteamID.ToString()) == 1);
        var h2 = Humans().FirstOrDefault(h => h.TeamNum is 2 or 3 && teamOf.GetValueOrDefault(h.SteamID.ToString()) == 2);
        int side1 = h1?.TeamNum ?? (h2 is not null ? (h2.TeamNum == 2 ? 3 : 2) : 2);
        int side2 = side1 == 2 ? 3 : 2;
        var bots = Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: true, IsHLTV: false }).ToList();
        int i = 0;
        foreach (var b in bots)
        {
            int want = i < _botsTeam1 ? side1 : i < _botsTeam1 + _botsTeam2 ? side2 : 0;
            i++;
            if (want == 0) { Server.ExecuteCommand($"kickid {b.UserId}"); continue; }
            if (b.TeamNum != want) b.ChangeTeam(want == 2 ? CsTeam.Terrorist : CsTeam.CounterTerrorist);
        }
    }

    private void OnSideCommand(CCSPlayerController? player, bool swap)
    {
        if (player is null || _lobby is null) return;
        if (!_choosing)
        {
            player.PrintToChat(_knife
                ? $"{Tag} сначала выиграйте ножевой раунд — потом выбор стороны"
                : $"{Tag} выбор стороны — только после ножевого раунда");
            return;
        }
        if (_lobby.Players.All(p => p.SteamId != player.SteamID.ToString()) || player.TeamNum != _knifeWinner)
        {
            player.PrintToChat($"{Tag} сторону выбирает команда, выигравшая нож");
            return;
        }
        Choose(swap);
    }

    [ConsoleCommand("css_switch", "После ножа: сменить сторону")]
    public void OnSwitch(CCSPlayerController? player, CommandInfo cmd) => OnSideCommand(player, true);

    [ConsoleCommand("css_stay", "После ножа: остаться")]
    public void OnStay(CCSPlayerController? player, CommandInfo cmd) => OnSideCommand(player, false);

    private void BeginLive()
    {
        if (!_starting) return;
        _starting = false;
        _live = true;
        _score[0] = _score[1] = 0;
        _kda.Clear();
        if (_lobby is not null)
            foreach (var p in _lobby.Players) _kda[p.SteamId] = [0, 0, 0];
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
        if (_knife && !InWarmup()) AddTimer(0.3f, StripToKnife);
        if (_starting && !InWarmup()) BeginLive();
        return HookResult.Continue;
    }

    private static bool InWarmup() =>
        Utilities.FindAllEntitiesByDesignerName<CCSGameRulesProxy>("cs_gamerules")
            .FirstOrDefault()?.GameRules?.WarmupPeriod ?? false;

    [GameEventHandler]
    public HookResult OnRoundEnd(EventRoundEnd @event, GameEventInfo info)
    {
        if (_knife && !InWarmup())
        {
            var winner = @event.Winner;
            AddTimer(2f, () => KnifeOver(winner));
            return HookResult.Continue;
        }
        if (!_live || _lobby is null || InWarmup()) return HookResult.Continue;
        // Раунд — команде лобби того игрока, чья сторона выиграла. Считаем по
        // людям, а не по сторонам: на смене сторон счёт команд переезжает.
        var teams = _lobby.Players.ToDictionary(p => p.SteamId, p => p.Team);
        var any = Humans().FirstOrDefault(p => p.TeamNum == @event.Winner && teams.ContainsKey(p.SteamID.ToString()));
        if (any is not null) _score[teams[any.SteamID.ToString()] - 1]++;
        else
        {
            // На стороне победителя одни боты — значит, выиграла команда, противоположная
            // игрокам лобби на проигравшей стороне.
            var loser = Humans().FirstOrDefault(p => p.TeamNum is 2 or 3 && p.TeamNum != @event.Winner && teams.ContainsKey(p.SteamID.ToString()));
            if (loser is not null) _score[2 - teams[loser.SteamID.ToString()]]++;
        }
        // Счёт и K/D/A на сайт после каждого раунда — страница лобби обновляется по ходу игры.
        var lobbyId = _lobby.Id;
        var score = new List<int> { _score[0], _score[1] };
        AddTimer(1f, () => { if (_live) Post(new StatusIn(lobbyId, "live", score, Stats()), null); });
        return HookResult.Continue;
    }

    [GameEventHandler]
    public HookResult OnPlayerDeath(EventPlayerDeath @event, GameEventInfo info)
    {
        if (!_live || InWarmup()) return HookResult.Continue;
        var victim = @event.Userid;
        var attacker = @event.Attacker;
        var assister = @event.Assister;
        if (victim is { IsValid: true } && _kda.TryGetValue(victim.SteamID.ToString(), out var v)) v[1]++;
        // Убийство своего или самоубийство не считаем.
        if (attacker is { IsValid: true } && attacker != victim && attacker.TeamNum != victim?.TeamNum &&
            _kda.TryGetValue(attacker.SteamID.ToString(), out var a)) a[0]++;
        if (assister is { IsValid: true } && assister.TeamNum != victim?.TeamNum &&
            _kda.TryGetValue(assister.SteamID.ToString(), out var s)) s[2]++;
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
        Post(new StatusIn(lobby.Id, "finished", score, Stats()), st =>
        {
            Server.PrintToChatAll($"{Tag} счёт отправлен на сайт");
            _ready.Clear();
            Apply(st);
        });
        return HookResult.Continue;
    }

    private List<PlayerStat> Stats() =>
        _kda.Select(kv => new PlayerStat(kv.Key, kv.Value[0], kv.Value[1], kv.Value[2])).ToList();

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
        if (player is null || _lobby is null || _live || _starting || _knife || _choosing) return;
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
        if (player is null || InGame || _lobby is null) return;
        if (_ready.Remove(player.SteamID.ToString()))
            Server.PrintToChatAll($"{Tag} {player.PlayerName} не готов ({_ready.Count}/{_lobby.Players.Count})");
    }

    [ConsoleCommand("css_lobby", "Текущее лобби")]
    public void OnLobby(CCSPlayerController? player, CommandInfo cmd) => Refresh(() => Announce(player));

    [ConsoleCommand("css_start", "Админ: начать без !ready")]
    public void OnStart(CCSPlayerController? player, CommandInfo cmd)
    {
        if (!IsAdmin(player)) { player?.PrintToChat($"{Tag} !start — только для админа сервера"); return; }
        if (_lobby is null) { player?.PrintToChat($"{Tag} лобби нет — создай на сайте"); return; }
        if (InGame) { player?.PrintToChat($"{Tag} игра уже идёт (!stop — остановить)"); return; }
        StartMatch(withBots: true);
    }

    [ConsoleCommand("css_stop", "Админ: остановить игру, счёт не отправляется")]
    public void OnStop(CCSPlayerController? player, CommandInfo cmd)
    {
        if (!IsAdmin(player)) return;
        _live = _starting = _knife = _choosing = false;
        _chooseTimer?.Kill();
        _ready.Clear();
        _bots = _botsTeam1 = _botsTeam2 = 0;
        Server.ExecuteCommand("bot_kick; bot_quota 0");
        Server.PrintToChatAll($"{Tag} игра остановлена админом");
        Warmup();
    }
}
