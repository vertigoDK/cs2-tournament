"""API для нашего CS2-сервера (плагин NineCup на CounterStrikeSharp).

Сервер ходит сюда сам: узнаёт, кого пускать и какую дуэль играть следующей,
и присылает счёт сыгранной дуэли. Вместо отдельной таблицы ключей ключ
выводится из SECRET_KEY сайта: админ видит его на сайте и вписывает в конфиг
плагина. Сменили SECRET_KEY — сменился и ключ сервера.

Игроков сервер знает по Steam ID, сайт — по id участника; связь — поле
users.steam_id.
"""

import hashlib
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .. import bracket as B
from .. import schemas
from ..config import get_settings
from ..deps import get_db, require_admin
from ..models import Role, Tournament, TournamentStatus, User
from ..store import save_bracket

router = APIRouter(prefix="/api/server", tags=["game-server"])


def server_key() -> str:
    secret = get_settings().secret_key.encode()
    return hmac.new(secret, b"nine-cup-game-server-v1", hashlib.sha256).hexdigest()[:40]


def require_server(x_server_key: str | None = Header(None)) -> None:
    if not x_server_key or not hmac.compare_digest(x_server_key, server_key()):
        raise HTTPException(status_code=401, detail="Неверный ключ сервера")


@router.get("/key", response_model=schemas.ServerKeyOut)
def get_key(_: User = Depends(require_admin)):
    """Ключ для конфига плагина — только админу."""
    return schemas.ServerKeyOut(key=server_key())


# ---------------- выбор турнира и дуэли ----------------

def _tournament(db: Session, tournament_id: int | None) -> Tournament:
    if tournament_id:
        t = db.get(Tournament, tournament_id)
        if not t:
            raise HTTPException(status_code=404, detail="Турнир не найден")
        return t
    # Без явного id — идущий турнир, иначе ближайший незавершённый.
    q = db.query(Tournament).filter(Tournament.status != TournamentStatus.finished)
    t = q.filter(Tournament.started_at.isnot(None)).order_by(Tournament.started_at.desc()).first()
    t = t or q.order_by(Tournament.created_at.desc()).first()
    if not t:
        raise HTTPException(status_code=404, detail="Нет незавершённых турниров")
    return t


def _participant_ids(bracket: dict) -> set[int]:
    ids: set[int] = set()
    for team in bracket.get("teams") or []:
        ids.update(B.team_member_ids(team))
    for m in B.all_duels(bracket.get("qualifier") or {}):
        ids.update(pid for pid in m["p"] if pid)
    return ids


def _duel_label(q: dict, g: int, r: int) -> str:
    """«1/4 финала», «Финал», «за 3-е место», «за 5–8 места» — что разыгрывают."""
    if g == -1:
        return B.round_label(r, len(q["rounds"]))
    grp = q["places"][g]
    size = 2 * len(grp["rounds"][0])
    if r == len(grp["rounds"]) - 1:
        return f"за {grp['place']}-е место"
    return f"за {grp['place']}–{grp['place'] + size - 1} места"


def _depth(q: dict, g: int, r: int) -> int:
    """Сколько дуэлей игрок уже сыграл к этой: для основной сетки — номер
    раунда, для игр за места — глубина источника плюс один."""
    if g == -1:
        return r
    sg, sr = q["places"][g]["src"]
    return _depth(q, sg, sr) + 1 + r


def _playable(q: dict) -> list[tuple[int, int, int, dict]]:
    """Дуэли, где оба соперника известны, а результата нет — в порядке игры:
    по этапам (1/4 → полуфиналы и 5–8 → матчи за места), внутри этапа — от
    дальних мест к ближним, так что финал всегда последний."""
    out = []
    groups = [(-1, q.get("rounds") or [])] + [(k, grp["rounds"]) for k, grp in enumerate(q.get("places") or [])]
    for g, rounds in groups:
        for r, round_ in enumerate(rounds):
            for i, m in enumerate(round_):
                if None not in m["p"] and m.get("win") is None:
                    out.append((g, r, i, m))
    place = lambda g: 1 if g == -1 else q["places"][g]["place"]
    return sorted(out, key=lambda x: (_depth(q, x[0], x[1]), -place(x[0]), x[2]))


def _duel_out(q: dict, users: dict[int, User], g: int, r: int, i: int, m: dict) -> schemas.ServerDuel:
    return schemas.ServerDuel(
        g=g,
        r=r,
        i=i,
        label=_duel_label(q, g, r),
        players=[
            schemas.ServerPlayer(id=pid, name=users[pid].display_name, steam_id=users[pid].steam_id)
            for pid in m["p"]
        ],
    )


def _users(db: Session, ids: set[int]) -> dict[int, User]:
    return {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}


def _state(db: Session, t: Tournament) -> schemas.ServerState:
    bracket = t.bracket or {}
    q = bracket.get("qualifier") or {}
    ids = _participant_ids(bracket)
    users = _users(db, ids)
    admins = db.query(User).filter(User.role == Role.admin, User.steam_id.isnot(None)).all()
    allowed = [
        schemas.ServerPlayer(id=u.id, name=u.display_name, steam_id=u.steam_id)
        for u in [*users.values(), *admins]
        if u.steam_id
    ]
    playable = _playable(q) if q else []
    places = B.qualifier_places(q) if q else {}
    return schemas.ServerState(
        tournament_id=t.id,
        tournament=t.name,
        allowed=allowed,
        missing_steam=[u.display_name for u in users.values() if not u.steam_id],
        duel_map=q.get("map") or None,
        duel=_duel_out(q, users, *playable[0]) if playable else None,
        duels_left=len(playable),
        duel_places=[
            schemas.ServerPlace(place=place, name=users[pid].display_name)
            for pid, place in sorted(places.items(), key=lambda kv: kv[1])
            if pid in users
        ],
    )


@router.get("/state", response_model=schemas.ServerState, dependencies=[Depends(require_server)])
def state(tournament_id: int | None = None, db: Session = Depends(get_db)):
    return _state(db, _tournament(db, tournament_id))


@router.post("/duel-result", response_model=schemas.ServerDuelResultOut, dependencies=[Depends(require_server)])
def duel_result(payload: schemas.ServerDuelResultIn, db: Session = Depends(get_db)):
    """Счёт дуэли от сервера. Дуэль ищем по паре игроков среди несыгранных —
    сервер не обязан помнить номера в сетке."""
    t = _tournament(db, payload.tournament_id)
    bracket = dict(t.bracket or {})
    q = bracket.get("qualifier")
    if not q:
        raise HTTPException(status_code=404, detail="У турнира нет дуэлей")
    if len(payload.steam_ids) != 2 or len(payload.score) != 2:
        raise HTTPException(status_code=400, detail="Нужны два Steam ID и счёт из двух чисел")
    if payload.score[0] == payload.score[1]:
        raise HTTPException(status_code=400, detail="Ничья в дуэли не бывает")

    by_steam = {u.steam_id: u for u in db.query(User).filter(User.steam_id.in_(payload.steam_ids)).all()}
    if missing := [s for s in payload.steam_ids if s not in by_steam]:
        raise HTTPException(status_code=404, detail=f"Steam ID не привязан к участнику: {', '.join(missing)}")
    a, b = (by_steam[s].id for s in payload.steam_ids)

    found = next(((g, r, i, m) for g, r, i, m in _playable(q) if set(m["p"]) == {a, b}), None)
    if not found:
        raise HTTPException(status_code=409, detail="Несыгранной дуэли этих игроков нет")
    g, r, i, m = found
    label = _duel_label(q, g, r)
    # Счёт — в порядке слотов дуэли на сайте.
    score = payload.score if m["p"] == [a, b] else payload.score[::-1]
    B.qualifier_set_result(q, r, i, score, None, g)
    save_bracket(db, t, bracket)

    win_id = m["p"][m["win"]]
    lose_id = m["p"][1 - m["win"]]
    names = {u.id: u.display_name for u in by_steam.values()}
    hi, lo = max(score), min(score)
    after = _state(db, t)
    chat = [f"{names[win_id]} {hi}:{lo} {names[lose_id]} — {label}"]
    place_of = {p.name: p.place for p in after.duel_places}
    for pid in (win_id, lose_id):
        if names[pid] in place_of:
            chat.append(f"{names[pid]} — {place_of[names[pid]]}-е место")
    if after.duel:
        n1, n2 = (p.name for p in after.duel.players)
        chat.append(f"Дальше: {n1} vs {n2} ({after.duel.label}), осталось дуэлей: {after.duels_left}")
    else:
        chat.append("Все дуэли сыграны. Итог: " + ", ".join(f"{p.place}. {p.name}" for p in after.duel_places))
    return schemas.ServerDuelResultOut(chat=chat, state=after)
