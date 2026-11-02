import datetime as dt
import enum

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .map_catalog import MAP_NAMES


class Role(str, enum.Enum):
    admin = "admin"
    player = "player"


# Палитра аватарок: игрок выбирает цвет в личном кабинете.
AVATAR_COLORS = ["sand", "sky", "moss", "clay", "plum", "steel", "amber", "rose"]
DEFAULT_AVATAR_COLOR = "sand"


class User(Base):
    """Аккаунт и участник турниров — одна сущность.

    Админ заводит человека, система выдаёт ему случайные `username` и пароль;
    `display_name` — это ник, который видно в сетке и в составах команд.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.player)

    display_name: Mapped[str] = mapped_column(String(80), default="")
    # SteamID64: по нему Cybershoke опознаёт игрока в лобби и в результатах
    # матча (ник там игровой и меняется). Пусто — аккаунт ещё не привязан.
    steam_id: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True, index=True)
    avatar_color: Mapped[str] = mapped_column(String(20), default=DEFAULT_AVATAR_COLOR)
    # Загруженная картинка. Пусто — рисуем инициал на цветной подложке.
    avatar_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Пароли хранятся только хэшем. Флаг помнит, показывали ли пароль админу:
    # у перенесённых со старой схемы его никто не видел, им нужно выдать новый.
    password_issued: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)


# Пул нового турнира по умолчанию — весь каталог карт (см. map_catalog.py).
DEFAULT_MAPS = list(MAP_NAMES)


class TournamentStatus(str, enum.Enum):
    setup = "setup"          # bracket generated, nobody has played yet
    active = "active"        # at least one match decided
    finished = "finished"    # champion decided


class Tournament(Base):
    __tablename__ = "tournaments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    prize_pool: Mapped[str] = mapped_column(String(200), default="")
    mode: Mapped[str] = mapped_column(String(20), default="seed")
    status: Mapped[TournamentStatus] = mapped_column(Enum(TournamentStatus), default=TournamentStatus.setup)
    maps_pool: Mapped[list] = mapped_column(JSON, default=lambda: list(DEFAULT_MAPS))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    # Запланированное время старта. Naive UTC — конвертацию из UTC+5 делает клиент.
    starts_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    # Фактическое начало: админ может запустить турнир раньше объявленного
    # времени. Пока пусто — идёт обратный отсчёт до `starts_at`.
    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)

    # {"teams": [...], "rounds": [...]}  — see bracket.py for the exact shape
    bracket: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow
    )

    creator: Mapped["User | None"] = relationship()


class Image(Base):
    """Загруженная картинка (аватарка или логотип), уже ужатая до 256px PNG.

    Лежит прямо в базе: у Vercel нет постоянного диска, а отдельное файловое
    хранилище ради пары десятков картинок по ~50 КБ не нужно.
    """

    __tablename__ = "images"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)


class SkinChoice(Base):
    """Скин, выбранный игроком на сайте, для одного предмета: оружия, ножа
    или перчаток (defindex предмета). Сервер забирает выбор через
    /api/server/skins и раздаёт в игре плагином WeaponPaints."""

    __tablename__ = "skin_choices"
    __table_args__ = (UniqueConstraint("user_id", "defindex"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    defindex: Mapped[int] = mapped_column(Integer)
    paint: Mapped[int] = mapped_column(Integer)
    wear: Mapped[float] = mapped_column(Float, default=0.01)
    seed: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)


class Loadout(Base):
    """Какой нож и какие перчатки носит игрок (сам скин — в SkinChoice)."""

    __tablename__ = "loadouts"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    # Название ножа для WeaponPaints, например weapon_knife_karambit.
    knife: Mapped[str | None] = mapped_column(String(64), nullable=True)
    knife_defindex: Mapped[int | None] = mapped_column(Integer, nullable=True)
    glove_defindex: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)


class Lobby(Base):
    """Лобби на нашем CS2-сервере: админ собирает игроков и карту, сервер
    (плагин nine cup) забирает активное лобби, пускает только этих игроков,
    запускает игру и присылает счёт.

    Сервер один, поэтому лобби идут по очереди: плагин берёт самое раннее
    неоконченное. Статусы: waiting → live → finished (или cancelled).
    Состав — JSON [{user_id, team}], team 1 или 2.
    """

    __tablename__ = "lobbies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mode: Mapped[str] = mapped_column(String(16))  # duel | wingman | free
    map: Mapped[str] = mapped_column(String(40))
    server_address: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[str] = mapped_column(String(16), default="waiting", index=True)
    players: Mapped[list] = mapped_column(JSON, default=list)
    # Счёт по командам [t1, t2] и победитель (1, 2 или 0 — ничья), когда игра окончена.
    score: Mapped[list | None] = mapped_column(JSON, nullable=True)
    winner: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Убийства/смерти/ассисты по Steam ID: {"7656…": [k, d, a]}. Это данные самого
    # лобби — в общую статистику сайта они не попадают.
    stats: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)
    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
