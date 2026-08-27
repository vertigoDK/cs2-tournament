"""Одноразовые правки схемы для баз, созданных прошлыми версиями.

В проекте нет Alembic, а `create_all()` умеет только создавать недостающие
таблицы — добавить колонку в существующую он не может. Здесь ровно то, что
нужно, чтобы боевая база (с уже идущим турниром) пережила переход от схемы
«отдельно игроки, отдельно аккаунты» к схеме «участник = аккаунт».

Каждый шаг идемпотентен: повторный запуск ничего не ломает.
"""

import json

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .models import DEFAULT_AVATAR_COLOR
from .security import generate_password, generate_username, hash_password


def _columns(conn, table: str) -> set[str]:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {r[1] for r in rows}


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"), {"n": table}
    ).fetchone()
    return row is not None


def run_migrations(engine: Engine) -> None:
    if not engine.url.get_backend_name().startswith("sqlite"):
        return  # миграции написаны под SQLite, другие СУБД тут не используются

    with engine.begin() as conn:
        if not _table_exists(conn, "users"):
            return  # свежая база — create_all() уже сделал всё правильно

        _add_user_columns(conn)
        _add_tournament_columns(conn)
        _merge_players_into_users(conn)
        _drop_guest_account(conn)


def _add_user_columns(conn) -> None:
    cols = _columns(conn, "users")
    if "display_name" not in cols:
        conn.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR(80) DEFAULT ''"))
    if "avatar_color" not in cols:
        conn.execute(
            text(f"ALTER TABLE users ADD COLUMN avatar_color VARCHAR(20) DEFAULT '{DEFAULT_AVATAR_COLOR}'")
        )
    if "created_at" not in cols:
        conn.execute(text("ALTER TABLE users ADD COLUMN created_at DATETIME"))
        conn.execute(text("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
    if "avatar_url" not in cols:
        conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255)"))
    if "password_issued" not in cols:
        conn.execute(text("ALTER TABLE users ADD COLUMN password_issued BOOLEAN DEFAULT 0"))
        # Пароль админа задаётся в .env, он известен; остальным нужно выдать.
        conn.execute(text("UPDATE users SET password_issued = (role = 'admin')"))

    # У админа из старой схемы ника не было — покажем хоть что-то осмысленное.
    conn.execute(text("UPDATE users SET display_name = username WHERE display_name IS NULL OR display_name = ''"))
    conn.execute(
        text(f"UPDATE users SET avatar_color = '{DEFAULT_AVATAR_COLOR}' WHERE avatar_color IS NULL OR avatar_color = ''")
    )


def _add_tournament_columns(conn) -> None:
    if not _table_exists(conn, "tournaments"):
        return
    cols = _columns(conn, "tournaments")
    if "starts_at" not in cols:
        conn.execute(text("ALTER TABLE tournaments ADD COLUMN starts_at DATETIME"))
    if "started_at" not in cols:
        conn.execute(text("ALTER TABLE tournaments ADD COLUMN started_at DATETIME"))


def _merge_players_into_users(conn) -> None:
    """Каждый игрок из старой таблицы становится полноценным аккаунтом.

    Идентификаторы игроков зашиты в JSON уже созданных сеток, поэтому после
    переноса переписываем `player_a_id`/`player_b_id` на новые id аккаунтов —
    иначе идущий турнир потеряет составы команд.
    """
    if not _table_exists(conn, "players"):
        return

    players = conn.execute(text("SELECT id, name FROM players ORDER BY id")).fetchall()
    id_map: dict[int, int] = {}

    for old_id, name in players:
        existing = conn.execute(
            text("SELECT id FROM users WHERE display_name = :n AND role = 'player'"), {"n": name}
        ).fetchone()
        if existing:
            id_map[old_id] = existing[0]
            continue

        username = _unique_username(conn)
        conn.execute(
            text(
                "INSERT INTO users (username, password_hash, role, display_name, avatar_color, created_at)"
                " VALUES (:u, :p, 'player', :d, :c, CURRENT_TIMESTAMP)"
            ),
            {
                "u": username,
                "p": hash_password(generate_password()),
                "d": name,
                "c": DEFAULT_AVATAR_COLOR,
            },
        )
        new_id = conn.execute(text("SELECT id FROM users WHERE username = :u"), {"u": username}).fetchone()[0]
        id_map[old_id] = new_id

    _remap_bracket_ids(conn, id_map)
    conn.execute(text("DROP TABLE players"))


def _unique_username(conn) -> str:
    for _ in range(50):
        candidate = generate_username()
        clash = conn.execute(text("SELECT 1 FROM users WHERE username = :u"), {"u": candidate}).fetchone()
        if not clash:
            return candidate
    raise RuntimeError("Не удалось сгенерировать уникальный логин")


def _remap_bracket_ids(conn, id_map: dict[int, int]) -> None:
    if not id_map:
        return
    rows = conn.execute(text("SELECT id, bracket FROM tournaments")).fetchall()
    for tid, raw in rows:
        if not raw:
            continue
        try:
            bracket = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            continue
        changed = False
        for team in bracket.get("teams", []):
            for key in ("player_a_id", "player_b_id"):
                old = team.get(key)
                if old in id_map:
                    team[key] = id_map[old]
                    changed = True
        if changed:
            conn.execute(
                text("UPDATE tournaments SET bracket = :b WHERE id = :i"),
                {"b": json.dumps(bracket, ensure_ascii=False), "i": tid},
            )


def _drop_guest_account(conn) -> None:
    """Общий гостевой доступ убран — теперь у каждого свой аккаунт."""
    conn.execute(text("DELETE FROM users WHERE role = 'guest'"))
