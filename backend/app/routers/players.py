"""Профили игроков: «пятиугольник» стиля игры и вся статистика за всё время.

Как и сводная статистика, считается на лету по JSON-сеткам турниров: игроков
десяток, турниров единицы.

Оси пятиугольника — по тому, что у нас есть (K/D/A и счёт по раундам):
стрельба, выживание, командность, победы и стабильность. Каждая ось — от 1 до
10 относительно остальных игроков: 10 у лучшего в компании, 1 у худшего.
"""

import statistics
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import bracket as B
from .. import schemas
from ..deps import get_db
from ..hydrate import hydrate_bracket
from ..models import Role, Tournament, TournamentStatus, User
from .stats import _parse_prize

router = APIRouter(prefix="/api/players", tags=["players"])

AXES = [
    ("aim", "Стрельба", "убийств за раунд"),
    ("survival", "Выживание", "как часто доживает до конца раунда"),
    ("team", "Командность", "ассистов за раунд"),
    ("wins", "Победы", "доля выигранных карт"),
    ("steady", "Стабильность", "насколько ровно играет от карты к карте"),
]


def _empty() -> dict:
    return {
        "kills": 0, "deaths": 0, "assists": 0, "rounds": 0, "maps": 0,
        "map_wins": 0, "map_losses": 0, "duel_wins": 0, "duel_losses": 0,
        "tournaments": 0, "titles": 0, "prize": 0.0,
        "map_ratings": [], "per_map": defaultdict(lambda: defaultdict(int)), "history": [],
    }


def _placement(bracket: dict, team_idx: int, finished: bool) -> str:
    """Чем турнир закончился для команды: «Чемпион», «Финал», «Полуфинал»…"""
    rounds = bracket.get("rounds") or []
    total = len(rounds)
    for r, round_ in enumerate(rounds):
        for m in round_:
            if team_idx not in m.get("p", []) or m.get("bye"):
                continue
            win = m.get("win")
            if win is None:
                continue
            slot = m["p"].index(team_idx)
            if win != slot:
                return B.round_label(r, total)
            if r == total - 1:
                return "Чемпион"
    return "В игре" if not finished else "Участник"


def _collect(db: Session) -> tuple[dict[int, User], dict[int, dict]]:
    users = {u.id: u for u in db.query(User).filter(User.role == Role.player).all()}
    data = {pid: _empty() for pid in users}

    for t in db.query(Tournament).order_by(Tournament.created_at.desc()).all():
        bracket = hydrate_bracket(db, t.bracket)
        teams = bracket.get("teams") or []
        rounds = bracket.get("rounds") or []
        if not rounds:
            continue
        champ = B.champion(bracket)
        amount, currency = _parse_prize(t.prize_pool)
        finished = t.status == TournamentStatus.finished

        # Турнир в истории игрока — один раз, даже если он играл за две команды:
        # берём команду с лучшим результатом.
        seen: dict[int, dict] = {}
        for idx, team in enumerate(teams):
            members = B.team_member_ids(team)
            place = _placement(bracket, idx, finished)
            is_champ = champ is not None and champ.get("seed") == team.get("seed")
            for pid in members:
                if pid not in data:
                    continue
                row = {
                    "id": t.id, "name": t.name, "status": t.status.value, "team": team.get("name"),
                    "place": place, "champion": is_champ, "prize_pool": t.prize_pool,
                    "date": (t.started_at or t.starts_at or t.created_at).isoformat(),
                }
                if pid not in seen or (is_champ and not seen[pid]["champion"]):
                    seen[pid] = row
            if is_champ:
                main = [pid for pid in (team.get("player_a_id"), team.get("player_b_id")) if pid]
                for pid in main:
                    if pid in data:
                        data[pid]["titles"] += 1
                        if amount:
                            data[pid]["prize"] += amount / len(main)
        for pid, row in seen.items():
            data[pid]["tournaments"] += 1
            data[pid]["history"].append(row)

        for winner, loser in B.qualifier_results(bracket):
            if winner in data:
                data[winner]["duel_wins"] += 1
            if loser in data:
                data[loser]["duel_losses"] += 1

        for round_ in rounds:
            for m in round_:
                sides = [teams[i] if i is not None else None for i in m.get("p", [None, None])]
                for entry in m.get("maps") or []:
                    total = sum(entry.get("rounds") or [])
                    for key, line in (entry.get("stats") or {}).items():
                        pid = int(key)
                        if pid not in data:
                            continue
                        p = data[pid]
                        k, d, a = line.get("k", 0), line.get("d", 0), line.get("a", 0)
                        p["kills"] += k
                        p["deaths"] += d
                        p["assists"] += a
                        p["rounds"] += total
                        p["maps"] += 1
                        pm = p["per_map"][entry["map"]]
                        pm["kills"] += k
                        pm["deaths"] += d
                        pm["assists"] += a
                        pm["rounds"] += total
                        if total:
                            p["map_ratings"].append(B.player_rating(k, d, total))
                        slot = next(
                            (s for s, side in enumerate(sides) if side and pid in B.team_member_ids(side)), None
                        )
                        if entry.get("winner") in (0, 1) and slot is not None:
                            won = entry["winner"] == slot
                            p["map_wins" if won else "map_losses"] += 1
                            pm["wins" if won else "losses"] += 1
    return users, data


def _raw_axes(p: dict) -> dict[str, float] | None:
    r = p["rounds"]
    if not r:
        return None
    games = p["map_wins"] + p["map_losses"]
    spread = statistics.pstdev(p["map_ratings"]) if len(p["map_ratings"]) > 1 else 0.5
    return {
        "aim": p["kills"] / r,
        "survival": (r - p["deaths"]) / r,
        "team": p["assists"] / r,
        "wins": p["map_wins"] / games if games else 0.0,
        "steady": -spread,
    }


def _scores(data: dict[int, dict]) -> dict[int, dict[str, float]]:
    raw = {pid: axes for pid, p in data.items() if (axes := _raw_axes(p))}
    out: dict[int, dict[str, float]] = {}
    for key, _, _ in AXES:
        values = [axes[key] for axes in raw.values()]
        lo, hi = min(values, default=0), max(values, default=0)
        for pid, axes in raw.items():
            score = 1 + 9 * (axes[key] - lo) / (hi - lo) if hi > lo else 5.5
            out.setdefault(pid, {})[key] = round(score, 1)
    return out


def _summary(u: User, p: dict, axes: dict[str, float] | None) -> schemas.PlayerProfileSummary:
    return schemas.PlayerProfileSummary(
        id=u.id,
        display_name=u.display_name,
        avatar_color=u.avatar_color,
        avatar_url=u.avatar_url,
        rating=round(B.player_rating(p["kills"], p["deaths"], p["rounds"]), 2),
        kills=p["kills"], deaths=p["deaths"], assists=p["assists"], rounds=p["rounds"], maps=p["maps"],
        map_wins=p["map_wins"], map_losses=p["map_losses"],
        duel_wins=p["duel_wins"], duel_losses=p["duel_losses"],
        tournaments=p["tournaments"], titles=p["titles"], prize=round(p["prize"], 2),
        axes=axes,
        score=round(sum(axes.values()) / len(axes), 1) if axes else None,
    )


@router.get("", response_model=list[schemas.PlayerProfileSummary])
def players(db: Session = Depends(get_db)):
    users, data = _collect(db)
    scores = _scores(data)
    rows = [_summary(users[pid], p, scores.get(pid)) for pid, p in data.items()]
    # Сначала те, у кого есть сыгранные карты, — по общему баллу.
    return sorted(rows, key=lambda r: (r.score is None, -(r.score or 0), r.display_name.lower()))


@router.get("/{player_id}", response_model=schemas.PlayerProfile)
def player(player_id: int, db: Session = Depends(get_db)):
    users, data = _collect(db)
    if player_id not in users:
        raise HTTPException(status_code=404, detail="Игрок не найден")
    scores = _scores(data)
    p = data[player_id]
    maps = [
        schemas.PlayerMapLine(
            map=name,
            wins=m["wins"], losses=m["losses"],
            kills=m["kills"], deaths=m["deaths"], assists=m["assists"], rounds=m["rounds"],
            rating=round(B.player_rating(m["kills"], m["deaths"], m["rounds"]), 2),
        )
        for name, m in p["per_map"].items()
    ]
    maps.sort(key=lambda m: (-(m.wins + m.losses), -m.rating))
    best = max(p["map_ratings"], default=None)
    return schemas.PlayerProfile(
        **_summary(users[player_id], p, scores.get(player_id)).model_dump(),
        best_map_rating=round(best, 2) if best is not None else None,
        maps_breakdown=maps,
        history=[schemas.PlayerHistoryRow(**row) for row in p["history"]],
        players_rated=len(scores),
        axes_info=[schemas.AxisInfo(key=k, label=label, hint=hint) for k, label, hint in AXES],
    )
