"""Лобби на нашем CS2-сервере: админ собирает игроков, сервер их играет.

Смотреть могут все (как и остальные страницы), создавать и отменять — только
админ. Статус и счёт меняет игровой сервер (см. routers/game_server.py).
"""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, require_admin
from ..map_catalog import AIM_MAP, MAP_NAMES, SERVER_MAPS
from ..models import Lobby, Role, Tournament, User

router = APIRouter(prefix="/api/lobbies", tags=["lobbies"])

POOL = MAP_NAMES

# per_team — сколько игроков должно быть в каждой команде (None — любое число).
MODES = {
    "duel": {"name": "Дуэль 1×1", "hint": "Aim Map, до 13 раундов", "per_team": 1, "maps": [AIM_MAP]},
    "wingman": {"name": "Wingman 2×2", "hint": "Два на два на карте из пула", "per_team": 2, "maps": POOL},
    "free": {"name": "Свободная игра", "hint": "Любые игроки и карта, без счёта в матче", "per_team": None, "maps": [AIM_MAP, *POOL]},
}
# waiting — сервер ещё грузит карту, ready — карта загружена, можно заходить.
ACTIVE = ("waiting", "ready", "live")


def _out(lobby: Lobby, users: dict[int, User], creators: dict[int, str], tnames: dict[int, str]) -> schemas.LobbyOut:
    players = []
    for p in lobby.players or []:
        u = users.get(p["user_id"])
        if not u:
            continue
        kda = (lobby.stats or {}).get(u.steam_id or "")
        players.append(
            schemas.LobbyPlayerOut(
                user_id=u.id, name=u.display_name, team=p["team"],
                avatar_color=u.avatar_color, avatar_url=u.avatar_url,
                kills=kda[0] if kda else None, deaths=kda[1] if kda else None, assists=kda[2] if kda else None,
            )
        )
    return schemas.LobbyOut(
        id=lobby.id, tournament_id=lobby.tournament_id, tournament=tnames.get(lobby.tournament_id),
        kind=lobby.kind, label=lobby.label or "", mode=lobby.mode, map=lobby.map, server_address=lobby.server_address,
        status=lobby.status, players=players, score=lobby.score, winner=lobby.winner,
        created_by=creators.get(lobby.created_by), created_at=lobby.created_at,
        started_at=lobby.started_at, finished_at=lobby.finished_at,
    )


def render(db: Session, lobbies: list[Lobby]) -> list[schemas.LobbyOut]:
    ids = {p["user_id"] for lo in lobbies for p in lo.players or []} | {lo.created_by for lo in lobbies if lo.created_by}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}
    creators = {uid: u.display_name for uid, u in users.items()}
    tids = {lo.tournament_id for lo in lobbies if lo.tournament_id}
    tnames = {t.id: t.name for t in db.query(Tournament).filter(Tournament.id.in_(tids)).all()} if tids else {}
    return [_out(lo, users, creators, tnames) for lo in lobbies]


@router.put("/server-address", response_model=schemas.LobbyOptionsOut)
def set_server_address(payload: schemas.ServerAddressIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Адрес нашего сервера — для всех лобби: сохраняем и сразу ставим ждущим/идущим."""
    from ..models import Setting

    addr = payload.address.strip()
    row = db.get(Setting, "server_address") or Setting(key="server_address")
    row.value = addr
    db.add(row)
    for lo in db.query(Lobby).filter(Lobby.status.in_(ACTIVE)).all():
        lo.server_address = addr
    db.commit()
    return options(db)


@router.get("/options", response_model=schemas.LobbyOptionsOut)
def options(db: Session = Depends(get_db)):
    from ..server_sync import server_address

    saved = server_address(db)
    last = db.query(Lobby).order_by(Lobby.id.desc()).first()
    return schemas.LobbyOptionsOut(
        modes=[schemas.LobbyModeOut(id=k, **v) for k, v in MODES.items()],
        players=[
            schemas.LobbyCandidate(
                id=u.id, name=u.display_name, avatar_color=u.avatar_color, avatar_url=u.avatar_url,
                steam_linked=bool(u.steam_id),
            )
            for u in db.query(User).filter(User.role == Role.player).order_by(User.display_name).all()
        ],
        server_address=saved or (last.server_address if last else ""),
    )


@router.get("", response_model=list[schemas.LobbyOut])
def list_lobbies(db: Session = Depends(get_db)):
    """Активные сверху (самое раннее — первое, его играет сервер), затем
    последние оконченные."""
    active = db.query(Lobby).filter(Lobby.status.in_(ACTIVE)).order_by(Lobby.id).all()
    done = db.query(Lobby).filter(Lobby.status.notin_(ACTIVE)).order_by(Lobby.id.desc()).limit(30).all()
    return render(db, [*active, *done])


@router.get("/{lobby_id}", response_model=schemas.LobbyOut)
def get_lobby(lobby_id: int, db: Session = Depends(get_db)):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(status_code=404, detail="Лобби не найдено")
    return render(db, [lobby])[0]


@router.post("", response_model=schemas.LobbyOut, status_code=201)
def create_lobby(payload: schemas.LobbyCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    mode = MODES.get(payload.mode)
    if not mode:
        raise HTTPException(status_code=400, detail="Неизвестный режим")
    if payload.map not in mode["maps"] or payload.map not in SERVER_MAPS:
        raise HTTPException(status_code=400, detail="Эта карта не подходит для режима")
    ids = [p.user_id for p in payload.players]
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail="Игрок указан дважды")
    users = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()}
    if len(users) != len(ids):
        raise HTTPException(status_code=404, detail="Участник не найден")
    if no_steam := [u.display_name for u in users.values() if not u.steam_id]:
        raise HTTPException(status_code=400, detail=f"Нет Steam ID у: {', '.join(no_steam)}")
    teams = {1: [p for p in payload.players if p.team == 1], 2: [p for p in payload.players if p.team == 2]}
    per = mode["per_team"]
    if per is not None and (len(teams[1]) != per or len(teams[2]) != per):
        raise HTTPException(status_code=400, detail=f"В каждой команде должно быть по {per} игрока")
    if per is None and (len(ids) < 2 or not teams[1] or not teams[2]):
        raise HTTPException(status_code=400, detail="Нужны игроки в обеих командах")

    # Новое лобби заменяет прежние, которые ещё ждут игроков: сервер один, и очередь
    # из забытых лобби только путает (он играл бы самое старое). Идущую игру не трогаем.
    for old in db.query(Lobby).filter(Lobby.status.in_(("waiting", "ready")), Lobby.tournament_id.is_(None)).all():
        old.status = "cancelled"
        old.finished_at = dt.datetime.utcnow()

    lobby = Lobby(
        mode=payload.mode, map=payload.map, server_address=payload.server_address.strip(),
        players=[{"user_id": p.user_id, "team": p.team} for p in payload.players],
        created_by=admin.id,
    )
    db.add(lobby)
    db.commit()
    db.refresh(lobby)
    return render(db, [lobby])[0]


@router.post("/{lobby_id}/cancel", response_model=schemas.LobbyOut)
def cancel_lobby(lobby_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(status_code=404, detail="Лобби не найдено")
    if lobby.status not in ACTIVE:
        raise HTTPException(status_code=409, detail="Лобби уже закончено")
    lobby.status = "cancelled"
    lobby.finished_at = dt.datetime.utcnow()
    db.commit()
    return render(db, [lobby])[0]


@router.delete("/{lobby_id}", status_code=204)
def delete_lobby(lobby_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Удалить лобби совсем (например, тестовые). В статистику лобби и так не идут."""
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(status_code=404, detail="Лобби не найдено")
    db.delete(lobby)
    db.commit()
