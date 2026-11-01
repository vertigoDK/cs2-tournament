"""Аватарки из Steam.

Cybershoke показывает обычные аватарки Steam, а Steam ID у участников есть.
Открытый XML профиля отдаёт ссылку на аватарку без ключа API.

Аватарку из Steam сохраняем под id `steam-<хэш ссылки>`. По префиксу видно,
что фото пришло из Steam (его можно обновлять), а не загружено самим игроком
(его не трогаем). По хэшу видно, сменилась ли аватарка: если ссылка та же,
картинку не качаем и не пересохраняем.
"""

import hashlib
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.orm import Session

from . import models
from .models import Role, User
from .uploads import PUBLIC_PREFIX, delete_image, store_image

_AVATAR = re.compile(r"<avatarFull><!\[CDATA\[(.*?)\]\]></avatarFull>")
_PERSONA = re.compile(r"<steamID><!\[CDATA\[(.*?)\]\]></steamID>", re.S)
_ALLOWED = ("https://avatars.steamstatic.com/", "https://avatars.fastly.steamstatic.com/",
            "https://avatars.akamai.steamstatic.com/", "https://avatars.cloudflare.steamstatic.com/")
TIMEOUT = 8
STEAM_PREFIX = f"{PUBLIC_PREFIX}/steam-"


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "thirteen-cs2/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read(4 * 1024 * 1024)


def avatar_link(steam_id: str) -> str | None:
    """Ссылка на текущую аватарку или None, если профиль закрыт или Steam молчит."""
    try:
        xml = _get(f"https://steamcommunity.com/profiles/{int(steam_id)}/?xml=1").decode("utf-8", "replace")
    except (OSError, ValueError):
        return None
    match = _AVATAR.search(xml)
    # Качаем только с CDN Steam: ссылка пришла извне.
    if not match or not match.group(1).startswith(_ALLOWED):
        return None
    return match.group(1)


def _image_id(link: str) -> str:
    # Хост CDN у одной и той же картинки бывает разный — хэшируем только имя файла.
    return "steam-" + hashlib.sha1(link.rsplit("/", 1)[-1].encode()).hexdigest()[:20]


def refresh_avatars(db: Session, force: bool = False) -> dict[str, list[str]]:
    """Ставит аватарки из Steam тем, у кого фото нет или оно тоже из Steam.

    Загруженное вручную фото не трогаем; `force` заменяет и его. Коммит — здесь же.
    """
    users = [
        u for u in db.query(User).filter(User.role == Role.player, User.steam_id.isnot(None)).all()
        if force or not u.avatar_url or u.avatar_url.startswith(STEAM_PREFIX)
    ]
    # Параллельно: у функции на Vercel ограничено время, а игроков десяток.
    with ThreadPoolExecutor(max_workers=8) as pool:
        links = list(pool.map(avatar_link, [u.steam_id for u in users]))

    changed = []
    out = {"updated": [], "unchanged": [], "failed": []}
    for u, link in zip(users, links):
        if not link:
            out["failed"].append(u.display_name)
            continue
        new_id = _image_id(link)
        if u.avatar_url == f"{PUBLIC_PREFIX}/{new_id}.png":
            out["unchanged"].append(u.display_name)
            continue
        changed.append((u, link, new_id))

    with ThreadPoolExecutor(max_workers=8) as pool:
        images = list(pool.map(lambda item: _safe_get(item[1]), changed))

    for (u, _, new_id), raw in zip(changed, images):
        if not raw:
            out["failed"].append(u.display_name)
            continue
        # У двух игроков может быть одна и та же аватарка — картинка уже лежит.
        if db.get(models.Image, new_id):
            url = f"{PUBLIC_PREFIX}/{new_id}.png"
        else:
            try:
                url = store_image(raw, "avatars", db, image_id=new_id)
            except Exception:  # битая картинка — просто пропускаем игрока
                out["failed"].append(u.display_name)
                continue
        old = u.avatar_url
        u.avatar_url = url
        db.flush()
        if old and not _still_used(db, old):
            delete_image(db, old)
        out["updated"].append(u.display_name)
    db.commit()
    return out


def _safe_get(url: str) -> bytes | None:
    try:
        return _get(url)
    except OSError:
        return None


def _still_used(db: Session, url: str) -> bool:
    return db.query(User).filter(User.avatar_url == url).first() is not None


def profile(steam_id: str) -> dict | None:
    """Ник и аватарка из открытого профиля Steam — для личного кабинета."""
    try:
        xml = _get(f"https://steamcommunity.com/profiles/{int(steam_id)}/?xml=1").decode("utf-8", "replace")
    except (OSError, ValueError):
        return None
    persona = _PERSONA.search(xml)
    avatar = _AVATAR.search(xml)
    return {
        "persona": persona.group(1).strip() if persona else None,
        "avatar": avatar.group(1) if avatar and avatar.group(1).startswith(_ALLOWED) else None,
    }


def use_steam_avatar(db: Session, user: User) -> bool:
    """Ставит игроку его текущую аватарку из Steam (по его же просьбе). Коммит — здесь."""
    link = avatar_link(user.steam_id) if user.steam_id else None
    if not link:
        return False
    new_id = _image_id(link)
    url = f"{PUBLIC_PREFIX}/{new_id}.png"
    if user.avatar_url == url:
        return True
    if not db.get(models.Image, new_id):
        raw = _safe_get(link)
        if not raw:
            return False
        try:
            url = store_image(raw, "avatars", db, image_id=new_id)
        except Exception:
            return False
    old = user.avatar_url
    user.avatar_url = url
    db.flush()
    if old and not _still_used(db, old):
        delete_image(db, old)
    db.commit()
    db.refresh(user)
    return True
