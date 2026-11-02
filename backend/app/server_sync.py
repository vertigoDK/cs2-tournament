"""Турнир на нашем сервере: лобби под матчи сетки создаются сами.

Админ включает у турнира «Играем на нашем сервере» (bracket["server"]). После
каждого изменения сетки (save_bracket) смотрим, чего не хватает:

- дуэли отбора — всегда есть лобби на следующую несыгранную дуэль (по одной за раз,
  в порядке игры: 1/4 → полуфиналы и игры за места → финал);
- матчи 2×2 — как только драфт закончен, лобби на первую несыгранную карту серии;
  карта сыграна — лобби на следующую, пока серия не решится.

Сервер один и играет самое раннее неоконченное лобби, так что очередь получается сама.
Результат лобби пишется обратно в сетку в routers/game_server.py (lobby-status).
"""

from sqlalchemy.orm import Session

from . import bracket as B
from .map_catalog import AIM_MAP
from .models import Lobby, Tournament

ACTIVE = ("waiting", "ready", "live")


def _duel_lobby(t: Tournament, q: dict, g: int, r: int, i: int, m: dict) -> Lobby:
    from .routers.game_server import _duel_label

    return Lobby(
        mode="duel", map=AIM_MAP, status="waiting", tournament_id=t.id, kind="duel",
        ref={"g": g, "r": r, "i": i},
        label=f"Отбор · {_duel_label(q, g, r)}",
        players=[{"user_id": m["p"][0], "team": 1}, {"user_id": m["p"][1], "team": 2}],
    )


def _match_lobby(t: Tournament, b: dict, r: int, i: int, idx: int, m: dict) -> Lobby:
    maps = m["maps"]
    label = B.round_label(r, len(b["rounds"]))
    if len(maps) > 1:
        label += f" · карта {idx + 1} из {len(maps)}"
    players = []
    for team_no, team_idx in ((1, m["p"][0]), (2, m["p"][1])):
        players += [{"user_id": pid, "team": team_no} for pid in B.team_member_ids(b["teams"][team_idx])]
    # Награда «выбор стороны»: капитан заранее выбрал CT/T на этой карте (окно «Готов»).
    # Тогда ножевого раунда нет — команды сразу на своих сторонах.
    sides = (m.get("veto") or {}).get("sides") or {}
    side1 = None
    if (s0 := (sides.get("0") or {}).get(str(idx))) in ("CT", "T"):
        side1 = s0
    elif (s1 := (sides.get("1") or {}).get(str(idx))) in ("CT", "T"):
        side1 = "T" if s1 == "CT" else "CT"
    ref = {"r": r, "i": i, "map": idx}
    if side1:
        ref["side1"] = side1
        label += f" · стороны выбраны"
    return Lobby(
        mode="wingman", map=maps[idx]["map"], status="waiting", tournament_id=t.id, kind="match",
        ref=ref, label=label, players=players,
    )


def sync_lobbies(db: Session, t: Tournament) -> None:
    b = t.bracket or {}
    if not b.get("server"):
        return
    from .routers.game_server import _playable

    lobbies = db.query(Lobby).filter(Lobby.tournament_id == t.id).all()
    taken = [{k: v for k, v in (lo.ref or {}).items() if k != "side1"} for lo in lobbies if lo.status in (*ACTIVE, "finished")]
    added = []

    q = b.get("qualifier")
    if q and not any(lo.kind == "duel" and lo.status in ACTIVE for lo in lobbies):
        playable = _playable(q)
        if playable:
            added.append(_duel_lobby(t, q, *playable[0]))

    for r, round_ in enumerate(b.get("rounds") or []):
        for i, m in enumerate(round_):
            if m.get("win") is not None or None in m["p"] or not m.get("maps"):
                continue
            idx = next((k for k, e in enumerate(m["maps"]) if e.get("winner") is None), None)
            if idx is None or {"r": r, "i": i, "map": idx} in taken:
                continue
            added.append(_match_lobby(t, b, r, i, idx, m))

    if added:
        db.add_all(added)
        db.commit()


def stop_lobbies(db: Session, t: Tournament) -> None:
    """Выключили сервер у турнира — ждущие лобби убираем, идущую игру не трогаем."""
    import datetime as dt

    for lo in db.query(Lobby).filter(Lobby.tournament_id == t.id, Lobby.status.in_(("waiting", "ready"))).all():
        lo.status = "cancelled"
        lo.finished_at = dt.datetime.utcnow()
    db.commit()


def apply_result(db: Session, lobby: Lobby) -> None:
    """Сыгранное турнирное лобби → результат в сетке. Пишем, только если в сетке
    это место всё ещё ждёт результата и состав тот же (сетку могли поправить руками)."""
    import logging

    from .models import User
    from .store import save_bracket

    t = db.get(Tournament, lobby.tournament_id) if lobby.tournament_id else None
    if not t or not lobby.score or len(lobby.score) != 2:
        return
    b = dict(t.bracket or {})
    ref = lobby.ref or {}
    by_team = {1: [p["user_id"] for p in lobby.players if p["team"] == 1], 2: [p["user_id"] for p in lobby.players if p["team"] == 2]}
    try:
        if lobby.kind == "duel":
            q = b.get("qualifier") or {}
            g, r, i = ref["g"], ref["r"], ref["i"]
            rounds = q["rounds"] if g == -1 else q["places"][g]["rounds"]
            m = rounds[r][i]
            if m.get("win") is not None or m["p"] != [by_team[1][0], by_team[2][0]] or lobby.score[0] == lobby.score[1]:
                return
            B.qualifier_set_result(q, r, i, list(lobby.score), None, g)
        elif lobby.kind == "match":
            r, i, idx = ref["r"], ref["i"], ref["map"]
            m = b["rounds"][r][i]
            if m.get("maps", [])[idx].get("winner") is not None:
                return
            steam_to_id = {
                u.steam_id: u.id
                for u in db.query(User).filter(User.id.in_(by_team[1] + by_team[2])).all()
                if u.steam_id
            }
            stats = {
                str(steam_to_id[s]): {"k": v[0], "d": v[1], "a": v[2]}
                for s, v in (lobby.stats or {}).items()
                if s in steam_to_id
            }
            B.set_map_stats(b, r, i, idx, list(lobby.score), stats or None)
        else:
            return
    except (ValueError, KeyError, IndexError) as e:
        logging.getLogger(__name__).warning("Результат лобби %s не записан в сетку: %s", lobby.id, e)
        return
    save_bracket(db, t, b)
