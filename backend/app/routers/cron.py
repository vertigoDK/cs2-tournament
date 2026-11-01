"""Задачи по расписанию (Vercel Cron, см. vercel.json).

Vercel вызывает их обычным GET и подписывает заголовком
`Authorization: Bearer <CRON_SECRET>`. Без заданного секрета эндпоинт закрыт.
"""

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..config import get_settings
from ..deps import get_db
from ..steam import refresh_avatars

router = APIRouter(prefix="/api/cron", tags=["cron"])


def _check(authorization: str | None) -> None:
    secret = get_settings().cron_secret
    if not secret or not hmac.compare_digest(authorization or "", f"Bearer {secret}"):
        raise HTTPException(status_code=401, detail="Нет доступа")


@router.get("/steam-avatars", response_model=schemas.SteamAvatarsOut)
def cron_steam_avatars(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    """Раз в сутки обновляет аватарки из Steam: вдруг кто-то сменил."""
    _check(authorization)
    return schemas.SteamAvatarsOut(**refresh_avatars(db))
