from logging.config import fileConfig

from alembic import context

from app import models  # noqa: F401  (регистрирует таблицы в Base.metadata)
from app.database import Base, engine

config = context.config
target_metadata = Base.metadata


def _run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # SQLite не умеет большую часть ALTER TABLE — Alembic в batch-режиме
        # пересоздаёт таблицу целиком. На Postgres это обычные ALTER.
        render_as_batch=connection.dialect.name == "sqlite",
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# При старте приложения соединение (с уже взятой блокировкой) передаёт
# app/migrations.py. Без него — это запуск команды `alembic` из терминала.
connection = config.attributes.get("connection")
if connection is not None:
    _run(connection)
else:
    if config.config_file_name:
        fileConfig(config.config_file_name)
    with engine.begin() as conn:
        _run(conn)
