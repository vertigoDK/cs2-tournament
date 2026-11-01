"""Мгновенные обновления через Pusher Channels.

Любое изменение турнира (ход драфта, «Готов», счёт, правка сетки) после
коммита в базу отправляет короткий сигнал в Pusher: канал `tournament-<id>`
и общий `tournaments`. Открытые страницы, получив его, сразу перечитывают
данные, а не ждут очередного опроса. Сами данные через Pusher не ходят —
только «что-то изменилось», так что секретов в сигнале нет.

Ловим изменения на уровне сессии SQLAlchemy (after_flush → after_commit),
чтобы не расставлять вызовы по всем роутерам. Без ключей в окружении модуль
молчит. Ошибки Pusher не должны ломать запрос — их глотаем.
"""

import hashlib
import hmac
import json
import time
import urllib.parse
import urllib.request

from sqlalchemy import event
from sqlalchemy.orm import Session

from .config import get_settings
from .models import Tournament

settings = get_settings()
TIMEOUT = 2


def enabled() -> bool:
    return bool(settings.pusher_app_id and settings.pusher_key and settings.pusher_secret)


def trigger(channels: list[str], name: str = "updated", data: dict | None = None) -> None:
    """Событие в Pusher через HTTP API (подпись HMAC-SHA256, как в их SDK)."""
    if not enabled() or not channels:
        return
    body = json.dumps({"name": name, "channels": channels[:100], "data": json.dumps(data or {})})
    path = f"/apps/{settings.pusher_app_id}/events"
    params = {
        "auth_key": settings.pusher_key,
        "auth_timestamp": str(int(time.time())),
        "auth_version": "1.0",
        "body_md5": hashlib.md5(body.encode()).hexdigest(),
    }
    query = "&".join(f"{k}={params[k]}" for k in sorted(params))
    sig = hmac.new(settings.pusher_secret.encode(), f"POST\n{path}\n{query}".encode(), hashlib.sha256).hexdigest()
    host = f"api-{settings.pusher_cluster}.pusher.com" if settings.pusher_cluster else "api.pusherapp.com"
    req = urllib.request.Request(
        f"https://{host}{path}?{query}&auth_signature={sig}",
        data=body.encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=TIMEOUT).read()
    except OSError:
        pass  # страницы всё равно подтянут изменения опросом


def _collect(session: Session, _flush_context) -> None:
    ids = session.info.setdefault("live_tournaments", set())
    for obj in (*session.new, *session.dirty, *session.deleted):
        if isinstance(obj, Tournament) and obj.id is not None:
            ids.add(obj.id)


def _send(session: Session) -> None:
    ids = session.info.pop("live_tournaments", None)
    if ids:
        trigger(["tournaments", *(f"tournament-{i}" for i in sorted(ids))], data={"ids": sorted(ids)})


def _drop(session: Session) -> None:
    session.info.pop("live_tournaments", None)


def install(session_factory) -> None:
    event.listen(session_factory, "after_flush", _collect)
    event.listen(session_factory, "after_commit", _send)
    event.listen(session_factory, "after_rollback", _drop)
