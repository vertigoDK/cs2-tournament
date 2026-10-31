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

class CabinetMatch(BaseModel):
    tournament_id: int
    tournament_name: str
    round_label: str
    opponent: str | None
    partner: str | None
    map: str | None
    result: Literal["win", "loss", "pending"]


class ActiveVetoOut(BaseModel):
    """Идущий драфт, к которому вошедшего нужно перекинуть."""

    tournament_id: int
    tournament_name: str
    round: int
    index: int
    my_turn: bool


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


class TournamentOut(TournamentSummary):
    maps_pool: list[str]
    bracket: dict
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
    prize_pool: str
    champion: str | None
    teams_count: int
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
