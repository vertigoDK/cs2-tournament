import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field


# ---------- auth ----------

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    id: int
    role: str
    username: str
    display_name: str
    avatar_color: str
    avatar_url: str | None = None


class MeOut(BaseModel):
    id: int
    username: str
    role: str
    display_name: str
    avatar_color: str
    avatar_url: str | None = None


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    avatar_color: str | None = None
    # Явный флаг нужен, чтобы отличить «не трогать» от «убрать картинку».
    clear_avatar: bool = False


# ---------- users (участники = аккаунты) ----------

class UserCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_color: str
    avatar_url: str | None = None
    role: str
    password_issued: bool = False


class CredentialsOut(BaseModel):
    """Логин и пароль показываются админу ровно один раз — после этого пароль
    хранится только в виде хэша и восстановить его нельзя, можно лишь выдать
    новый."""

    id: int
    display_name: str
    username: str
    password: str


# ---------- личный кабинет ----------

class CabinetMap(BaseModel):
    map: str
    mine: int
    theirs: int
    won: bool | None = None


class CabinetMatch(BaseModel):
    tournament_id: int
    tournament_name: str
    round_label: str
    opponent: str | None
    partner: str | None
    map: str | None
    result: Literal["win", "loss", "pending"]
    # Сыгранные карты со счётом с твоей стороны и счёт серии.
    maps: list[CabinetMap] = []
    series: list[int] | None = None


class CabinetUpcoming(BaseModel):
    """Ближайший незавершённый турнир, в котором ты в составе."""
    tournament_id: int
    name: str
    status: str
    starts_at: str | None = None
    started_at: str | None = None
    prize_pool: str = ""
    team: str | None = None
    partner: str | None = None
    partner_id: int | None = None
    captain: str | None = None
    is_captain: bool = False
    best_of: int = 1
    final_best_of: int = 1
    teams_count: int = 0


class SteamInfo(BaseModel):
    steam_id: str | None = None
    persona: str | None = None
    avatar: str | None = None
    profile_url: str | None = None
    # Стоит ли сейчас в профиле аватарка из Steam.
    avatar_from_steam: bool = False


class ActiveVetoOut(BaseModel):
    """Идущий драфт, к которому вошедшего нужно перекинуть."""

    tournament_id: int
    tournament_name: str
    round: int
    index: int
    my_turn: bool
    # Драфт открыт, но ждёт «Готов» от капитанов; need_ready — от тебя.
    ready_check: bool = False
    need_ready: bool = False


class CabinetStats(BaseModel):
    tournaments: int
    matches_played: int
    wins: int
    losses: int
    titles: int


class CabinetOut(BaseModel):
    stats: CabinetStats
    current: CabinetMatch | None
    history: list[CabinetMatch]
    upcoming: CabinetUpcoming | None = None


# ---------- tournaments ----------

class TeamIn(BaseModel):
    player_a_id: int
    player_b_id: int
    # Кто из двоих драфтит карты. Должен быть одним из них; по умолчанию первый.
    captain_id: int | None = None
    # Своё название и логотип — опционально. Без них команда зовётся «ник + ник».
    name: str | None = Field(default=None, max_length=60)
    logo_url: str | None = None


SeedMode = Literal["seed", "order", "random"]
BestOf = Literal[1, 3, 5]

# Время на весь драфт (секунды): у каждой команды половина. 0 — без таймера.
VetoTime = Field(default=0, ge=0, le=3600)


class TournamentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    prize_pool: str = ""
    mode: SeedMode = "seed"
    teams: list[TeamIn]
    maps_pool: list[str] | None = None
    best_of: BestOf = 1
    # Финал часто играют дольше остальных; не задан — как обычные матчи.
    final_best_of: BestOf | None = None
    veto_time: int = VetoTime
    starts_at: dt.datetime | None = None


class QualifierCreate(BaseModel):
    player_ids: list[int]
    mode: SeedMode = "order"
    map: str = Field(default="aim_map_s2", max_length=60)
    note: str = Field(default="", max_length=300)
    # Утешительные дуэли: у каждого своё место (для 8 человек — 1–8).
    places: bool = True


class RewardIn(BaseModel):
    place: int = Field(ge=1, le=64)
    type: Literal["perma_pickban", "side_choice", "swap_opponent"]
    count: int = Field(default=1, ge=1, le=20)


class RewardUse(BaseModel):
    """Использование награды в окне «Готов». slot — за какую команду матча
    (капитану не нужен, админ указывает)."""

    kind: Literal["perma", "sides", "swap"]
    slot: Literal[0, 1] | None = None
    pick: str | None = None
    ban: str | None = None
    sides: dict[str, str] = {}
    other: int | None = None
    other_slot: Literal[0, 1] | None = None


class DuelResult(BaseModel):
    """Пустой счёт и победитель — снять результат."""

    score: list[int] | None = None
    win: Literal[0, 1] | None = None


class TournamentPatch(BaseModel):
    name: str | None = None
    prize_pool: str | None = None
    status: Literal["setup", "active", "finished"] | None = None
    starts_at: dt.datetime | None = None
    clear_starts_at: bool = False
    # Время на драфт можно поменять в любой момент: идущие драфты доигрывают
    # со своим запасом, новое время действует со следующего.
    veto_time: int | None = Field(default=None, ge=0, le=3600)


class TournamentRegenerate(BaseModel):
    mode: SeedMode = "seed"
    teams: list[TeamIn]
    maps_pool: list[str] | None = None
    best_of: BestOf = 1
    final_best_of: BestOf | None = None
    veto_time: int = VetoTime


class MvpOut(BaseModel):
    player_id: int
    display_name: str
    avatar_color: str
    avatar_url: str | None = None
    rating: float
    kills: int
    deaths: int
    assists: int
    rounds: int
    maps: int


class TournamentSummary(BaseModel):
    id: int
    name: str
    prize_pool: str
    status: str
    mode: str
    created_at: str
    starts_at: str | None = None
    started_at: str | None = None
    teams_count: int = 0
    stage: str | None = None
    matches_played: int = 0
    matches_total: int = 0
    champion: str | None = None
    # Лучший игрок завершённого турнира (см. bracket.tournament_mvp).
    mvp: MvpOut | None = None
    # Порядковый номер турнира: первый созданный — №1. Он же стоит на медали MVP.
    number: int = 0


class TournamentOut(TournamentSummary):
    maps_pool: list[str]
    bracket: dict
    # Награды за места в дуэлях по командам: {team_idx: [...]} (см. rewards.py).
    rewards: dict[str, list[dict]] = {}
    # Часы сервера (unix, сек): таймер драфта в браузере считается по ним.
    server_time: float = 0


class PickRequest(BaseModel):
    slot: Literal[0, 1]


class VetoChooseRequest(BaseModel):
    map: str


class MapWinnerRequest(BaseModel):
    slot: Literal[0, 1] | None = None


class PlayerLine(BaseModel):
    # Только неотрицательность: длинные овертаймы дают большие числа.
    k: int = Field(ge=0, default=0)
    d: int = Field(ge=0, default=0)
    a: int = Field(ge=0, default=0)


class MapStatsRequest(BaseModel):
    """Строка скорборда за карту: счёт по раундам и K/D/A по игрокам."""

    rounds: list[int] | None = None
    stats: dict[str, PlayerLine] | None = None


# ---------- сводная статистика ----------

class PlayerStat(BaseModel):
    id: int
    display_name: str
    avatar_color: str
    avatar_url: str | None = None
    maps: int = 0
    rounds: int = 0
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    kd: float = 0.0
    kpr: float = 0.0
    map_wins: int = 0
    map_losses: int = 0
    tournaments: int = 0
    titles: int = 0
    # Доля призовых: фонд делится между двумя игроками команды-победителя.
    prize: float = 0.0
    # Отборочные дуэли 1×1 — отдельно от карт 2×2.
    duel_wins: int = 0
    duel_losses: int = 0


class PlayerMapStat(BaseModel):
    wins: int = 0
    losses: int = 0
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    rounds: int = 0
    rating: float = 0.0


class MapStat(BaseModel):
    map: str
    picked: int = 0
    banned: int = 0
    played: int = 0


class HistoryMap(BaseModel):
    map: str
    rounds: list[int] | None = None
    winner: int | None = None
    picked_by: str | None = None


class HistoryMatch(BaseModel):
    round_label: str
    team_a: str | None
    team_b: str | None
    winner: int | None
    maps: list[HistoryMap]
    bans: list[str]


class HistoryTournament(BaseModel):
    id: int
    name: str
    status: str
    created_at: str
    # Когда турнир играли (или когда сыграют): старт, иначе дата создания.
    date: str = ""
    prize_pool: str
    champion: str | None
    teams_count: int
    teams: list[str] = []
    best_of: int = 1
    final_best_of: int = 1
    maps_pool: list[str] = []
    mvp: MvpOut | None = None
    number: int = 0
    duel_winner: str | None = None
    # Призовой числом и кому он достался (основной состав чемпионов).
    prize_amount: float = 0.0
    champion_ids: list[int] = []
    matches: list[HistoryMatch]


class StatsOut(BaseModel):
    players: list[PlayerStat]
    maps: list[MapStat]
    tournaments: list[HistoryTournament]
    # Валюта из призовых фондов — показываем рядом с суммами как есть.
    currency: str = ""
    prize_total: float = 0.0


class UploadOut(BaseModel):
    url: str


class SteamAvatarsOut(BaseModel):
    updated: list[str]
    unchanged: list[str] = []
    failed: list[str]


class AxisInfo(BaseModel):
    key: str
    label: str
    hint: str


class PlayerProfileSummary(BaseModel):
    id: int
    display_name: str
    avatar_color: str
    avatar_url: str | None = None
    rating: float = 0.0
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    rounds: int = 0
    maps: int = 0
    map_wins: int = 0
    map_losses: int = 0
    duel_wins: int = 0
    duel_losses: int = 0
    tournaments: int = 0
    titles: int = 0
    prize: float = 0.0
    # Оси пятиугольника, 1–10 относительно остальных; None — ещё не играл.
    axes: dict[str, float] | None = None
    score: float | None = None


class PlayerMapLine(BaseModel):
    map: str
    wins: int
    losses: int
    kills: int
    deaths: int
    assists: int
    rounds: int
    rating: float


class PlayerHistoryRow(BaseModel):
    id: int
    name: str
    status: str
    team: str | None = None
    place: str
    champion: bool
    prize_pool: str = ""
    date: str
    number: int = 0


class PlayerMvpRow(BaseModel):
    """Медаль MVP: за какой турнир и с какой игрой."""
    id: int
    name: str
    number: int
    date: str
    rating: float
    kills: int
    deaths: int
    assists: int
    maps: int


class PlayerProfile(PlayerProfileSummary):
    best_map_rating: float | None = None
    maps_breakdown: list[PlayerMapLine] = []
    history: list[PlayerHistoryRow] = []
    mvps: list[PlayerMvpRow] = []
    players_rated: int = 0
    axes_info: list[AxisInfo] = []


# ---------------- наш CS2-сервер ----------------

class ServerKeyOut(BaseModel):
    key: str


class ServerPlayer(BaseModel):
    id: int
    name: str
    steam_id: str | None = None


class ServerDuel(BaseModel):
    # Где дуэль в сетке: g — группа (-1 основная), r — раунд, i — номер.
    g: int
    r: int
    i: int
    label: str
    players: list[ServerPlayer]


class ServerPlace(BaseModel):
    place: int
    name: str


class ServerState(BaseModel):
    tournament_id: int
    tournament: str
    # Кого пускать на сервер: участники турнира и админы с привязанным Steam ID.
    allowed: list[ServerPlayer]
    # Участники без Steam ID — сервер их не узнает, о них надо предупредить.
    missing_steam: list[str] = []
    duel_map: str | None = None
    duel: ServerDuel | None = None
    duels_left: int = 0
    duel_places: list[ServerPlace] = []


class ServerDuelResultIn(BaseModel):
    tournament_id: int | None = None
    steam_ids: list[str]
    # Счёт в том же порядке, что steam_ids.
    score: list[int]


class ServerDuelResultOut(BaseModel):
    # Готовые строки для чата сервера.
    chat: list[str]
    state: ServerState


# ---------------- скины ----------------

class SkinIn(BaseModel):
    paint: int = Field(ge=0, le=100000)
    wear: float = Field(default=0.01, ge=0, le=1)
    seed: int = Field(default=0, ge=0, le=1000)


class SkinOut(SkinIn):
    defindex: int


class LoadoutIn(BaseModel):
    knife: str | None = Field(default=None, max_length=64)
    knife_defindex: int | None = None
    glove_defindex: int | None = None


class LoadoutOut(BaseModel):
    # Без Steam ID сервер не узнает игрока — выбор не применится.
    steam_linked: bool
    knife: str | None = None
    knife_defindex: int | None = None
    glove_defindex: int | None = None
    skins: list[SkinOut] = []


class ServerSkinsPlayer(BaseModel):
    steam_id: str
    knife: str | None = None
    glove_defindex: int | None = None
    skins: list[SkinOut] = []


class ServerSkinsOut(BaseModel):
    players: list[ServerSkinsPlayer]


# ---------------- лобби ----------------

class LobbyPlayerIn(BaseModel):
    user_id: int
    team: int = Field(ge=1, le=2)


class LobbyCreate(BaseModel):
    mode: str
    map: str
    server_address: str = Field(default="", max_length=80)
    players: list[LobbyPlayerIn]


class LobbyPlayerOut(BaseModel):
    user_id: int
    name: str
    team: int
    avatar_color: str
    avatar_url: str | None = None
    kills: int | None = None
    deaths: int | None = None
    assists: int | None = None


class LobbyOut(BaseModel):
    id: int
    mode: str
    map: str
    server_address: str
    status: str
    players: list[LobbyPlayerOut]
    score: list[int] | None = None
    winner: int | None = None
    created_by: str | None = None
    created_at: dt.datetime
    started_at: dt.datetime | None = None
    finished_at: dt.datetime | None = None


class LobbyModeOut(BaseModel):
    id: str
    name: str
    hint: str
    per_team: int | None
    maps: list[str]


class LobbyCandidate(BaseModel):
    id: int
    name: str
    avatar_color: str
    avatar_url: str | None = None
    steam_linked: bool


class LobbyOptionsOut(BaseModel):
    modes: list[LobbyModeOut]
    players: list[LobbyCandidate]
    server_address: str


class ServerLobbyPlayer(BaseModel):
    steam_id: str
    name: str
    team: int


class ServerLobby(BaseModel):
    id: int
    mode: str
    map: str
    map_id: str  # имя карты для changelevel
    workshop_id: str | None = None
    status: str
    players: list[ServerLobbyPlayer]


class ServerLobbyOut(BaseModel):
    lobby: ServerLobby | None = None
    # Админы с привязанным Steam — им можно всегда.
    admins: list[str] = []
    # Все участники сайта с привязанным Steam — их пускаем, пока лобби нет.
    known: list[str] = []


class ServerPlayerStat(BaseModel):
    steam_id: str
    kills: int = 0
    deaths: int = 0
    assists: int = 0


class ServerLobbyStatusIn(BaseModel):
    lobby_id: int
    status: str  # live | finished
    score: list[int] | None = None
    stats: list[ServerPlayerStat] | None = None
