"""Сводная статистика по всем турнирам.

Данные лежат внутри JSON-сеток турниров, отдельной таблицы матчей нет —
турниров у нас единицы, поэтому дешевле собрать сводку на лету, чем
поддерживать дублирующие таблицы и следить за их согласованностью.
"""

import re
from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import bracket as B
from .. import schemas
from ..deps import get_current_user, get_db
from ..hydrate import hydrate_bracket
from ..models import Role, Tournament, User

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _round_div(a: float, b: float) -> float:
    return round(a / b, 2) if b else round(float(a), 2)


# Призовой фонд админ пишет свободным текстом («20 000 ₸», «50000 тг»),
# поэтому вытаскиваем число и валюту из строки, а не требуем формат.
_NUMBER = re.compile(r"[\d][\d\s\u00a0.,]*")


def _parse_prize(text: str) -> tuple[float, str]:
    if not text:
        return 0.0, ""
    match = _NUMBER.search(text)
    if not match:
        return 0.0, text.strip()

    raw = match.group(0).strip(" .,\u00a0")
    # Пробелы — всегда разделители разрядов.
    cleaned = raw.replace(" ", "").replace("\u00a0", "").replace(",", ".")
    if cleaned.count(".") > 1:
        # «1.234.567» — разряды.
        cleaned = cleaned.replace(".", "")
    elif "." in cleaned:
        head, tail = cleaned.split(".")
        # Ровно три цифры после разделителя — это тоже разряды («10.000»),
        # иначе десятичная часть («1,5»).
        cleaned = head + tail if len(tail) == 3 else cleaned
    try:
        amount = float(cleaned)
    except ValueError:
        amount = 0.0

    currency = (text[: match.start()] + text[match.end() :]).strip()
    return amount, currency


@router.get("", response_model=schemas.StatsOut)
def stats(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    players = {
        u.id: schemas.PlayerStat(
            id=u.id,
            display_name=u.display_name,
            avatar_color=u.avatar_color,
            avatar_url=u.avatar_url,
        )
        for u in db.query(User).filter(User.role == Role.player).all()
    }
    maps: dict[str, schemas.MapStat] = {}
    history: list[schemas.HistoryTournament] = []
    currencies: Counter[str] = Counter()
    prize_total = 0.0

    def map_row(name: str) -> schemas.MapStat:
        return maps.setdefault(name, schemas.MapStat(map=name))

    for t in db.query(Tournament).order_by(Tournament.created_at.desc()).all():
        bracket = hydrate_bracket(db, t.bracket)
        rounds = bracket.get("rounds") or []
        teams = bracket.get("teams") or []
        if not rounds:
            continue

        champion = B.champion(bracket)
        champion_seed = champion.get("seed") if champion else None

        amount, currency = _parse_prize(t.prize_pool)
        if currency:
            currencies[currency] += 1

        # Участие в турнире и титулы считаем один раз на человека.
        for team in teams:
            members = [pid for pid in (team.get("player_a_id"), team.get("player_b_id")) if pid]
            is_champion = champion_seed is not None and team.get("seed") == champion_seed
            if is_champion and amount:
                prize_total += amount
            for pid in members:
                if pid not in players:
                    continue
                players[pid].tournaments += 1
                if is_champion:
                    players[pid].titles += 1
                    # Турниры 2×2 — фонд делится на состав команды.
                    if amount and members:
                        players[pid].prize += amount / len(members)

        matches: list[schemas.HistoryMatch] = []
        for r, round_ in enumerate(rounds):
            for m in round_:
                if m.get("bye"):
                    continue
                team_a = teams[m["p"][0]] if m["p"][0] is not None else None
                team_b = teams[m["p"][1]] if m["p"][1] is not None else None
                veto = m.get("veto") or {}

                picked_by: dict[str, str] = {}
                bans: list[str] = []
                for entry in veto.get("log") or []:
                    side = team_a if entry.get("team") == 0 else team_b
                    who = (side or {}).get("captain_name") or (side or {}).get("name")
                    if entry.get("action") == "pick":
                        map_row(entry["map"]).picked += 1
                        if who:
                            picked_by[entry["map"]] = who
                    else:
                        map_row(entry["map"]).banned += 1
                        bans.append(entry["map"])

                hmaps: list[schemas.HistoryMap] = []
                for entry in m.get("maps") or []:
                    name = entry["map"]
                    winner = entry.get("winner")
                    rounds_score = entry.get("rounds")
                    played = winner is not None or bool(rounds_score)
                    if played:
                        map_row(name).played += 1

                    for pid_str, line in (entry.get("stats") or {}).items():
                        pid = int(pid_str)
                        p = players.get(pid)
                        if not p:
                            continue
                        p.maps += 1
                        p.kills += line.get("k", 0)
                        p.deaths += line.get("d", 0)
                        p.assists += line.get("a", 0)
                        if rounds_score:
                            p.rounds += sum(rounds_score)
                        # Победу на карте засчитываем команде игрока.
                        for slot, side in ((0, team_a), (1, team_b)):
                            if not side:
                                continue
                            if pid in (side.get("player_a_id"), side.get("player_b_id")):
                                if winner == slot:
                                    p.map_wins += 1
                                elif winner is not None:
                                    p.map_losses += 1

                    hmaps.append(
                        schemas.HistoryMap(
                            map=name,
                            rounds=rounds_score,
                            winner=winner,
                            picked_by=picked_by.get(name),
                        )
                    )

                matches.append(
                    schemas.HistoryMatch(
                        round_label=B.round_label(r, len(rounds)),
                        team_a=(team_a or {}).get("name"),
                        team_b=(team_b or {}).get("name"),
                        winner=m.get("win"),
                        maps=hmaps,
                        bans=bans,
                    )
                )

        history.append(
            schemas.HistoryTournament(
                id=t.id,
                name=t.name,
                status=t.status.value,
                created_at=t.created_at.isoformat(),
                prize_pool=t.prize_pool,
                champion=champion["name"] if champion else None,
                teams_count=len(teams),
                matches=matches,
            )
        )

    for p in players.values():
        # K/D — только убийства к смертям; ассисты остаются отдельной цифрой.
        # Без смертей делить не на что — показываем сами убийства.
        p.kd = _round_div(p.kills, p.deaths)
        p.kpr = _round_div(p.kills, p.rounds)

    for p in players.values():
        p.prize = round(p.prize, 2)

    ranked = sorted(players.values(), key=lambda p: (-p.kills, p.display_name.lower()))
    map_list = sorted(maps.values(), key=lambda m: (-(m.played + m.picked + m.banned), m.map))
    return schemas.StatsOut(
        players=ranked,
        maps=map_list,
        tournaments=history,
        currency=currencies.most_common(1)[0][0] if currencies else "",
        prize_total=round(prize_total, 2),
    )
