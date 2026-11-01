"""Вход через Steam (OpenID 2.0).

Steam не отдаёт нам ни пароля, ни почты — только Steam ID, и то после того,
как сам подтвердит, что ответ настоящий (запрос check_authentication). По
Steam ID находим игрока в базе: Steam ID участников и так хранятся (по ним
подтягиваются аватарки). Незнакомый Steam ID никого не создаёт — вход только
для тех, кто уже есть в базе.

Поток: /api/auth/steam/login → страница Steam → /api/auth/steam/callback →
фронт /login/steam#token=… (токен во фрагменте: он не уходит на сервер и не
попадает в логи).
"""

import re
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..deps import get_db
from ..models import User
from ..security import create_access_token

router = APIRouter(prefix="/api/auth/steam", tags=["auth"])

STEAM_OPENID = "https://steamcommunity.com/openid/login"
OPENID_NS = "http://specs.openid.net/auth/2.0"
IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select"
CLAIMED_ID = re.compile(r"^https://steamcommunity\.com/openid/id/(\d{17})$")
TIMEOUT = 10


def _origin(request: Request) -> str:
    """Адрес сайта, на котором сейчас пользователь.

    На Vercel фронт и API на одном домене, Vercel передаёт его в X-Forwarded-*;
    локально Vite проксирует /api с xfwd и тоже передаёт адрес фронта (:5173).
    """
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    return f"{proto.split(',')[0].strip()}://{host.split(',')[0].strip()}"


def _safe_next(path: str | None) -> str:
    # Возвращаем только на свои страницы: «/что-то», но не «//чужой-сайт».
    if path and path.startswith("/") and not path.startswith("//") and "\\" not in path:
        return path
    return "/"


@router.get("/login")
def steam_login(request: Request, next: str | None = None):
    origin = _origin(request)
    return_to = f"{origin}/api/auth/steam/callback?" + urllib.parse.urlencode({"next": _safe_next(next)})
    params = {
        "openid.ns": OPENID_NS,
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": origin,
        "openid.identity": IDENTIFIER_SELECT,
        "openid.claimed_id": IDENTIFIER_SELECT,
    }
    return RedirectResponse(f"{STEAM_OPENID}?{urllib.parse.urlencode(params)}", status_code=302)


def _verify(params: dict[str, str]) -> bool:
    """Спрашиваем у самого Steam, выдавал ли он этот ответ."""
    body = {k: v for k, v in params.items() if k.startswith("openid.")}
    body["openid.mode"] = "check_authentication"
    req = urllib.request.Request(
        STEAM_OPENID,
        data=urllib.parse.urlencode(body).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "thirteen-cs2/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            text = resp.read(4096).decode("utf-8", "replace")
    except OSError:
        return False
    return "is_valid:true" in text


@router.get("/callback")
def steam_callback(request: Request, db: Session = Depends(get_db)):
    origin = _origin(request)
    params = dict(request.query_params)
    nxt = _safe_next(params.get("next"))

    def fail(reason: str, steam_id: str | None = None) -> RedirectResponse:
        q = {"steam": reason, "next": nxt}
        if steam_id:
            q["sid"] = steam_id
        return RedirectResponse(f"{origin}/login?{urllib.parse.urlencode(q)}", status_code=302)

    if params.get("openid.mode") != "id_res":
        return fail("cancel")
    match = CLAIMED_ID.match(params.get("openid.claimed_id", ""))
    # Ответ должен прийти от Steam и именно на наш адрес возврата.
    if (
        not match
        or params.get("openid.op_endpoint") != STEAM_OPENID
        or not params.get("openid.return_to", "").startswith(f"{origin}/api/auth/steam/callback")
        or not _verify(params)
    ):
        return fail("invalid")

    steam_id = match.group(1)
    user = db.query(User).filter(User.steam_id == steam_id).first()
    if not user:
        return fail("unknown", steam_id)

    token = create_access_token(user.username, user.role.value)
    frag = urllib.parse.urlencode({"token": token, "next": nxt})
    return RedirectResponse(f"{origin}/login/steam#{frag}", status_code=302)
