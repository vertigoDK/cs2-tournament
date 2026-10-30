from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

settings = get_settings()


def _engine_args(url: str) -> tuple[str, dict]:
    if url.startswith("sqlite"):
        # Локальная разработка: один файл, без отдельного сервера БД.
        return url, {"connect_args": {"check_same_thread": False}}

    # Neon и Vercel отдают строку вида postgres://… — SQLAlchemy нужен явный
    # драйвер, иначе он ищет psycopg2.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            url = "postgresql+psycopg://" + url[len(prefix):]
            break
    return url, {
        # Neon усыпляет базу без нагрузки и рвёт простаивающие соединения —
        # проверяем соединение перед выдачей из пула, а не падаем на запросе.
        "pool_pre_ping": True,
        # Пулер Neon (PgBouncer) работает в режиме транзакций: серверные
        # prepared statements там не живут между запросами.
        "connect_args": {"prepare_threshold": None},
    }


_url, _args = _engine_args(settings.database_url)
engine = create_engine(_url, **_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass

