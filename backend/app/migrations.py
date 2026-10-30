"""Схема базы ведётся миграциями Alembic (backend/alembic/versions).

Применяются они сами при старте приложения — и локально, и на Vercel, — так
что после деплоя база уже в актуальном виде, руками `alembic upgrade` никто
не запускает. Нужно только сгенерировать файл миграции и закоммитить его
(см. README, раздел «Миграции»).
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from .database import engine

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Схема, которую до Alembic создавал `create_all()`. Боевая база появилась
# раньше миграций, поэтому её не создаём заново, а помечаем этой версией.
BASELINE = "0001"

# Произвольное число: под этим ключом держим блокировку на время миграций.
_LOCK_KEY = 724001


def alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return cfg


def upgrade_db() -> None:
    cfg = alembic_config()
    # Одна транзакция на всё: DDL в Postgres транзакционный, и если миграция
    # упадёт на середине, база останется как была.
    with engine.begin() as conn:
        if conn.dialect.name == "postgresql":
            # На Vercel несколько экземпляров функции могут стартовать разом —
            # миграции должен применить кто-то один, остальные ждут его.
            # Блокировка уровня транзакции: пулер Neon не держит сессию.
            conn.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _LOCK_KEY})

        cfg.attributes["connection"] = conn
        tables = inspect(conn)
        if tables.has_table("users") and not tables.has_table("alembic_version"):
            command.stamp(cfg, BASELINE)
        command.upgrade(cfg, "head")
