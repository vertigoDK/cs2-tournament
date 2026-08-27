"""Pure bracket / veto logic — a Python port of the original single-file
prototype's JS engine, adapted to team-index references so the whole
tournament state round-trips cleanly through JSON in the DB.

Shapes
------
team:  {"seed": int, "a": str, "b": str, "name": str, "player_a_id": int, "player_b_id": int}
match: {
    "p": [team_idx | None, team_idx | None],
    "win": 0 | 1 | None,
    "bye": bool,
    "veto": {
        "status": "pending" | "in_progress" | "done",
        "turn": 0 | 1 | None,
        "log": [{"action": "ban" | "pick", "team": 0|1, "map": str}, ...],
        "picks": [str, ...],          # maps chosen via "pick" steps, in order
        "remaining": [str, ...],
        "decider": str | None,        # the one map left after the sequence — always played
    },
}
bracket: {
    "teams": [team, ...], "mode": str, "best_of": 1 | 3,
    "maps_pool": [str, ...], "rounds": [[match, ...], ...],
}

Veto sequence
-------------
BO1: ban, ban, ban, ban -> 1 map left = the decider (whole series is that map).
BO3: ban, ban, pick, pick -> 1 map left = the decider. The series is played on
     the two picked maps plus the decider if the score is tied 1-1.
"""

import random

_BO3_PATTERN = ["ban", "ban", "pick", "pick"]


def step_action(best_of: int, step_index: int) -> str:
    if best_of == 3:
        return _BO3_PATTERN[step_index % len(_BO3_PATTERN)]
    return "ban"


def team_name(a: str, b: str, custom: str | None = None) -> str:
    """Своё название, если задано; иначе состав через плюс."""
    if custom:
        return custom
    return f"{a} + {b}" if b else a


def next_pow2(n: int) -> int:
    p = 1
    while p < n:
        p *= 2
    return max(p, 2)


def seed_order(size: int) -> list[int]:
    """Classic bracket seeding: 1,2 -> 1,4,2,3 -> 1,8,4,5,2,7,3,6 -> ..."""
    order = [1]
    while len(order) < size:
        m = len(order) * 2 + 1
        order = [x for s in order for x in (s, m - s)]
    return order


def default_veto() -> dict:
    return {"status": "pending", "turn": None, "log": [], "picks": [], "remaining": [], "decider": None}


def wins_needed(best_of: int) -> int:
    """BO1 — одна карта, BO3 — до двух побед."""
    return 2 if best_of == 3 else 1


def series_maps(veto: dict) -> list[str]:
    """Карты серии по порядку: сначала выбранные пиками, решающая последней."""
    if veto.get("status") != "done":
        return []
    picks = list(veto.get("picks") or [])
    decider = veto.get("decider")
    return [*picks, decider] if decider else picks


def build_bracket(teams_in: list[dict], mode: str, maps_pool: list[str], best_of: int = 1) -> dict:
    teams = [dict(t) for t in teams_in]
    for t in teams:
        t["name"] = team_name(t["a"], t.get("b", ""), t.get("custom_name"))

    if mode == "random":
        random.shuffle(teams)
    # "seed" / "order" keep the given list order (the order teams were added) as-is

    for i, t in enumerate(teams):
        t["seed"] = i + 1

    size = next_pow2(len(teams))
    order = list(range(1, size + 1)) if mode == "order" else seed_order(size)

    first_round = []
    for i in range(0, size, 2):
        idx_a = order[i] - 1
        idx_b = order[i + 1] - 1
        slot_a = idx_a if idx_a < len(teams) else None
        slot_b = idx_b if idx_b < len(teams) else None
        first_round.append(
            {"p": [slot_a, slot_b], "win": None, "bye": False, "veto": default_veto(), "maps": []}
        )

    rounds = [first_round]
    n = len(first_round)
    while n > 1:
        cnt = (n + 1) // 2
        rounds.append(
            [
                {"p": [None, None], "win": None, "bye": False, "veto": default_veto(), "maps": []}
                for _ in range(cnt)
            ]
        )
        n = cnt

    bracket = {
        "teams": teams,
        "mode": mode,
        "best_of": 3 if best_of == 3 else 1,
        "maps_pool": list(maps_pool),
        "rounds": rounds,
    }
    _auto_byes(bracket)
    return bracket


def _promote(bracket: dict, r: int, i: int) -> None:
    rounds = bracket["rounds"]
    if r + 1 >= len(rounds):
        return
    m = rounds[r][i]
    target = rounds[r + 1][i // 2]
    target["p"][i % 2] = None if m["win"] is None else m["p"][m["win"]]


def _clear_downstream(bracket: dict, r: int, i: int) -> None:
    rounds = bracket["rounds"]
    cr, ci = r, i
    while cr + 1 < len(rounds):
        ni = ci // 2
        nm = rounds[cr + 1][ni]
        nm["p"][ci % 2] = None
        if nm["win"] is not None:
            nm["win"] = None
            nm["bye"] = False
            nm["veto"] = default_veto()
            nm["maps"] = []
        cr, ci = cr + 1, ni


def _auto_byes(bracket: dict) -> None:
    for i, m in enumerate(bracket["rounds"][0]):
        a, b = m["p"]
        if a is not None and b is None:
            m["win"] = 0
            m["bye"] = True
            _promote(bracket, 0, i)
        elif a is None and b is not None:
            m["win"] = 1
            m["bye"] = True
            _promote(bracket, 0, i)


def pick_winner(bracket: dict, r: int, i: int, slot: int) -> None:
    m = bracket["rounds"][r][i]
    if m["p"][slot] is None or m["bye"]:
        raise ValueError("Слот пуст или матч уже решён (bye)")
    m["win"] = None if m["win"] == slot else slot
    _clear_downstream(bracket, r, i)
    _promote(bracket, r, i)


def reset_results(bracket: dict) -> None:
    for r, round_ in enumerate(bracket["rounds"]):
        for m in round_:
            if r > 0:
                m["p"] = [None, None]
            m["win"] = None
            m["bye"] = False
            m["veto"] = default_veto()
            m["maps"] = []
    _auto_byes(bracket)


def champion(bracket: dict) -> dict | None:
    rounds = bracket["rounds"]
    final = rounds[-1][0]
    if final["win"] is None:
        return None
    idx = final["p"][final["win"]]
    return bracket["teams"][idx] if idx is not None else None


def is_finished(bracket: dict) -> bool:
    return champion(bracket) is not None


# ---------------- veto ----------------

def veto_start(bracket: dict, r: int, i: int) -> None:
    m = bracket["rounds"][r][i]
    if m["bye"] or m["p"][0] is None or m["p"][1] is None:
        raise ValueError("Обеим командам нужно быть определены и матч не должен быть bye")
    m["veto"] = {
        "status": "in_progress",
        "turn": random.choice([0, 1]),
        "log": [],
        "picks": [],
        "remaining": list(bracket["maps_pool"]),
        "decider": None,
    }


def veto_choose(bracket: dict, r: int, i: int, map_name: str) -> None:
    """Advance the veto by one step. Whether this step is a ban or a pick is
    determined by the tournament's best_of and how many steps already happened —
    the caller doesn't choose the action, just the map."""
    m = bracket["rounds"][r][i]
    v = m["veto"]
    if v["status"] != "in_progress":
        raise ValueError("Пик/бан ещё не начат или уже завершён")
    if map_name not in v["remaining"]:
        raise ValueError("Эта карта недоступна")

    action = step_action(bracket.get("best_of", 1), len(v["log"]))
    v["remaining"].remove(map_name)
    v["log"].append({"action": action, "team": v["turn"], "map": map_name})
    if action == "pick":
        v["picks"].append(map_name)

    if len(v["remaining"]) == 1:
        v["decider"] = v["remaining"][0]
        v["status"] = "done"
        v["turn"] = None
        # Драфт закончен — заводим карты серии, счёт по ним ведётся отдельно.
        m["maps"] = [
            {"map": name, "winner": None, "rounds": None, "stats": {}} for name in series_maps(v)
        ]
    else:
        v["turn"] = 1 - v["turn"]


def veto_reset(bracket: dict, r: int, i: int) -> None:
    m = bracket["rounds"][r][i]
    m["veto"] = default_veto()
    m["maps"] = []


def _recompute_match(bracket: dict, r: int, i: int) -> None:
    """Итог матча — производное от карт: побеждает тот, кто первым набрал
    нужное число карт. Если счёт откатили, проход по сетке тоже снимается."""
    m = bracket["rounds"][r][i]
    need = wins_needed(bracket.get("best_of", 1))
    scores = map_score(m)
    winner = 0 if scores[0] >= need else 1 if scores[1] >= need else None
    if m["win"] != winner:
        m["win"] = winner
        _clear_downstream(bracket, r, i)
        _promote(bracket, r, i)


def _map_entry(bracket: dict, r: int, i: int, map_index: int) -> dict:
    m = bracket["rounds"][r][i]
    maps = m.get("maps") or []
    if not maps:
        raise ValueError("Драфт ещё не завершён")
    if map_index < 0 or map_index >= len(maps):
        raise ValueError("Такой карты в серии нет")
    return maps[map_index]


def set_map_stats(
    bracket: dict,
    r: int,
    i: int,
    map_index: int,
    rounds: list[int] | None,
    stats: dict[str, dict] | None,
) -> None:
    """Статистика карты, которую админ переносит со скорборда.

    Счёт по раундам заодно определяет победителя карты — отдельно его
    отмечать не нужно.
    """
    m = bracket["rounds"][r][i]
    entry = _map_entry(bracket, r, i, map_index)

    if rounds is not None:
        if len(rounds) != 2 or any(v < 0 for v in rounds):
            raise ValueError("Счёт по раундам указан неверно")
        # Верхней границы нет: с овертаймами бывает и 16:14, и 19:17.
        entry["rounds"] = list(rounds)
        if rounds[0] == rounds[1]:
            # Равный счёт победителя не даёт — его можно проставить вручную.
            entry["winner"] = None
        else:
            entry["winner"] = 0 if rounds[0] > rounds[1] else 1

    if stats is not None:
        allowed = set()
        for team_idx in m["p"]:
            if team_idx is None:
                continue
            team = bracket["teams"][team_idx]
            allowed.update(str(pid) for pid in (team.get("player_a_id"), team.get("player_b_id")) if pid)
        cleaned = {}
        for pid, line in stats.items():
            if str(pid) not in allowed:
                raise ValueError("Этот игрок не участвует в матче")
            cleaned[str(pid)] = {
                "k": max(0, int(line.get("k") or 0)),
                "d": max(0, int(line.get("d") or 0)),
                "a": max(0, int(line.get("a") or 0)),
            }
        entry["stats"] = cleaned

    _recompute_match(bracket, r, i)


def set_map_winner(bracket: dict, r: int, i: int, map_index: int, slot: int | None) -> None:
    """Отмечает победителя одной карты серии.

    Итог матча — производное от карт: как только команда набирает нужное
    число побед, она проходит дальше; если счёт откатили, проход снимается
    вместе со всей веткой ниже.
    """
    if slot not in (0, 1, None):
        raise ValueError("Некорректный победитель")
    entry = _map_entry(bracket, r, i, map_index)
    # Повторное нажатие по той же команде снимает результат карты.
    entry["winner"] = None if entry["winner"] == slot else slot
    _recompute_match(bracket, r, i)


def map_score(match: dict) -> list[int]:
    scores = [0, 0]
    for entry in match.get("maps") or []:
        if entry.get("winner") in (0, 1):
            scores[entry["winner"]] += 1
    return scores


def has_any_result(bracket: dict) -> bool:
    return any(m["win"] is not None for round_ in bracket["rounds"] for m in round_)


def round_label(r: int, total: int) -> str:
    left = total - r
    if left == 1:
        return "Финал"
    if left == 2:
        return "Полуфинал"
    if left == 3:
        return "1/4 финала"
    return f"Раунд {r + 1}"
