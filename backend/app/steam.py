"""Аватарки из Steam.

Cybershoke показывает обычные аватарки Steam, а Steam ID у участников есть.
Открытый XML профиля отдаёт ссылку на аватарку без ключа API.
"""

import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

_AVATAR = re.compile(r"<avatarFull><!\[CDATA\[(.*?)\]\]></avatarFull>")
_ALLOWED = ("https://avatars.steamstatic.com/", "https://avatars.fastly.steamstatic.com/",
            "https://avatars.akamai.steamstatic.com/", "https://avatars.cloudflare.steamstatic.com/")
TIMEOUT = 8


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "thirteen-cs2/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read(4 * 1024 * 1024)


def fetch_avatar(steam_id: str) -> bytes | None:
    """Картинка аватарки игрока или None, если профиль закрыт или Steam молчит."""
    try:
        xml = _get(f"https://steamcommunity.com/profiles/{int(steam_id)}/?xml=1").decode("utf-8", "replace")
        match = _AVATAR.search(xml)
        # Качаем только с CDN Steam: ссылка пришла извне.
        if not match or not match.group(1).startswith(_ALLOWED):
            return None
        return _get(match.group(1))
    except (OSError, ValueError):
        return None


def fetch_avatars(steam_ids: list[str]) -> dict[str, bytes | None]:
    """Параллельно: у функции на Vercel ограничено время, а игроков десяток."""
    with ThreadPoolExecutor(max_workers=8) as pool:
        return dict(zip(steam_ids, pool.map(fetch_avatar, steam_ids)))
