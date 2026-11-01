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
        "status": "pending" | "ready_check" | "in_progress" | "done",
        "ready": [bool, bool],        # ready_check: кто из капитанов нажал «Готов»
        "turn": 0 | 1 | None,
        "log": [{"action": "ban" | "pick", "team": 0|1, "map": str}, ...],
        "picks": [str, ...],          # maps chosen via "pick" steps, in order
        "remaining": [str, ...],
        "decider": str | None,        # the one map left after the sequence — always played
    },
}
bracket: {
    "teams": [team, ...], "mode": str,
    "best_of": 1 | 3 | 5,        # обычные матчи
    "final_best_of": 1 | 3 | 5,  # финал
    "veto_time": int,            # секунд на весь драфт, 0 — без таймера
    "maps_pool": [str, ...], "rounds": [[match, ...], ...],
}
У каждого матча свой "bo" (финал может играться дольше остальных); у сеток,
созданных раньше, его нет — берётся общий best_of.

Veto sequence
-------------
Порядок задаётся форматом матча и размером пула: сначала до двух банов, потом
все пики серии (BO3 — два, BO5 — четыре), потом баны, пока не останется одна
карта — решающая. 7 карт, BO3: бан, бан, пик, пик, бан, бан → решающая
(обычное вето CS2); 5 карт, BO5: пик ×4 → решающая; 12 карт, BO1: 11 банов.

Таймер — как в Доте: у каждой команды свой запас времени (половина veto_time),
он тратится только в её ход. Кончился запас — ход за команду делается
случайно, и все её следующие ходы тоже, сразу как подходит очередь.
"""

import random

BEST_OF = (1, 3, 5)


def min_pool(best_of: int) -> int:
    """Пиков в серии best_of-1 плюс решающая; в BO1 — хотя бы один бан."""
    return max(2, best_of)


def veto_actions(best_of: int, pool_size: int) -> list[str]:
    """Все ходы драфта по порядку (без решающей карты — она остаётся сама)."""
    picks = max(0, min(best_of - 1, pool_size - 1))
    bans = max(0, pool_size - 1 - picks)
    lead = min(2, bans)
    return ["ban"] * lead + ["pick"] * picks + ["ban"] * (bans - lead)


def step_action(best_of: int, step_index: int, pool_size: int) -> str:
    actions = veto_actions(best_of, pool_size)
    return actions[step_index] if step_index < len(actions) else "ban"


def match_bo(bracket: dict, m: dict) -> int:
    return m.get("bo") or bracket.get("best_of", 1)


def clean_pool(maps_pool: list[str], best_of: int) -> list[str]:
    """Пул карт без пустых строк и повторов (без учёта регистра).

    Повтор в пуле сломал бы драфт: карта убирается из оставшихся по имени.
    """
    seen, pool = set(), []
    for name in maps_pool:
        name = (name or "").strip()
        if name and name.lower() not in seen:
            seen.add(name.lower())
            pool.append(name)
    need = min_pool(best_of)
    if len(pool) < need:
        raise ValueError(f"Для BO{best_of} нужно минимум {need} карт в пуле")
    return pool


def team_member_ids(team: dict) -> list[int]:
    """Кто играл за команду: основной состав и те, кто сыграл за неё часть карт.

    В дружеских турнирах бывает, что человеку надо уйти посреди турнира и за
    него доигрывает другой. Состав (и титул с призовым) — у тех, кто довёл
    турнир, а статистика всех, кто выходил за команду, пишется к ней.
    """
    ids = [team.get("player_a_id"), team.get("player_b_id"), *(team.get("subs") or [])]
    return [pid for pid in ids if pid]


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
    """BO1 — одна карта, BO3 — до двух побед, BO5 — до трёх."""
    return best_of // 2 + 1


def series_maps(veto: dict) -> list[str]:
    """Карты серии по порядку: сначала выбранные пиками, решающая последней."""
    if veto.get("status") != "done":
        return []
    picks = list(veto.get("picks") or [])
    decider = veto.get("decider")
    return [*picks, decider] if decider else picks


def build_bracket(
    teams_in: list[dict],
    mode: str,
    maps_pool: list[str],
    best_of: int = 1,
    final_best_of: int | None = None,
    veto_time: int = 0,
) -> dict:
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

    best_of = best_of if best_of in BEST_OF else 1
    final_best_of = final_best_of if final_best_of in BEST_OF else best_of
    for r, round_ in enumerate(rounds):
        for m in round_:
            m["bo"] = final_best_of if r == len(rounds) - 1 else best_of

    bracket = {
        "teams": teams,
        "mode": mode,
        "best_of": best_of,
        "final_best_of": final_best_of,
        "veto_time": max(0, int(veto_time or 0)),
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

def veto_start(bracket: dict, r: int, i: int, now: float) -> None:
    m = bracket["rounds"][r][i]
    if m["bye"] or m["p"][0] is None or m["p"][1] is None:
        raise ValueError("Обеим командам нужно быть определены и матч не должен быть bye")
    total = bracket.get("veto_time") or 0
    # Сначала — проверка готовности: часы стоят, пока оба капитана не нажмут
    # «Готов» (или админ не запустит драфт без ожидания).
    m["veto"] = {
        "status": "ready_check",
        "ready": [False, False],
        "turn": random.choice([0, 1]),
        "log": [],
        "picks": [],
        "remaining": list(bracket["maps_pool"]),
        "decider": None,
        # Запас времени каждой команды в секундах; None — драфт без таймера.
        "bank": [total / 2, total / 2] if total else None,
        "turn_started_at": None,
    }


def _veto_begin(v: dict, now: float) -> None:
    v["status"] = "in_progress"
    v["turn_started_at"] = now


def veto_ready(bracket: dict, r: int, i: int, slot: int, now: float) -> None:
    """Капитан команды slot готов. Оба готовы — драфт пошёл, часы запущены."""
    v = bracket["rounds"][r][i]["veto"]
    if v.get("status") != "ready_check":
        raise ValueError("Драфт уже идёт или ещё не открыт")
    ready = v.setdefault("ready", [False, False])
    ready[slot] = True
    if all(ready):
        _veto_begin(v, now)


def veto_skip_ready(bracket: dict, r: int, i: int, now: float) -> None:
    """Админ запускает драфт, не дожидаясь второго капитана."""
    v = bracket["rounds"][r][i]["veto"]
    if v.get("status") != "ready_check":
        raise ValueError("Драфт уже идёт или ещё не открыт")
    v["skipped_ready"] = True
    _veto_begin(v, now)


def veto_choose(bracket: dict, r: int, i: int, map_name: str, now: float, auto: bool = False) -> None:
    """Advance the veto by one step. Whether this step is a ban or a pick is
    determined by the match's best_of, the pool size and how many steps already
    happened — the caller doesn't choose the action, just the map."""
    m = bracket["rounds"][r][i]
    v = m["veto"]
    if v["status"] == "ready_check":
        raise ValueError("Ждём, пока оба капитана нажмут «Готов»")
    if v["status"] != "in_progress":
        raise ValueError("Пик/бан ещё не начат или уже завершён")
    if map_name not in v["remaining"]:
        raise ValueError("Эта карта недоступна")

    if v.get("bank"):
        spent = max(0.0, now - (v.get("turn_started_at") or now))
        v["bank"][v["turn"]] = max(0.0, v["bank"][v["turn"]] - spent)
    v["turn_started_at"] = now

    action = step_action(match_bo(bracket, m), len(v["log"]), len(bracket["maps_pool"]))
    v["remaining"].remove(map_name)
    entry = {"action": action, "team": v["turn"], "map": map_name}
    if auto:
        entry["auto"] = True
    v["log"].append(entry)
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


def veto_tick(bracket: dict, now: float) -> bool:
    """Делает просроченные ходы: у кого кончился запас — за того случайная карта.

    Отдельного фонового процесса нет (на Vercel его и не держать) — проверка
    идёт при каждом чтении и ходе, а пока драфт идёт, страницу опрашивают раз в
    пару секунд. Ход засчитывается моментом, когда время вышло, а не моментом
    проверки, поэтому часы соперника не страдают от задержки опроса.
    Возвращает True, если что-то изменилось и сетку нужно сохранить.
    """
    changed = False
    for r, round_ in enumerate(bracket.get("rounds", [])):
        for i, m in enumerate(round_):
            v = m.get("veto") or {}
            while v.get("status") == "in_progress" and v.get("bank"):
                started = v.get("turn_started_at") or now
                if v["bank"][v["turn"]] - (now - started) > 0:
                    break
                expired_at = started + v["bank"][v["turn"]]
                # Один и тот же выбор при любом числе одновременных проверок.
                pick = random.Random(f"{r}-{i}-{len(v['log'])}-{started}").choice(sorted(v["remaining"]))
                veto_choose(bracket, r, i, pick, now=expired_at, auto=True)
                changed = True
    return changed


def veto_reset(bracket: dict, r: int, i: int) -> None:
    m = bracket["rounds"][r][i]
    m["veto"] = default_veto()
    m["maps"] = []


def _recompute_match(bracket: dict, r: int, i: int) -> None:
    """Итог матча — производное от карт: побеждает тот, кто первым набрал
    нужное число карт. Если счёт откатили, проход по сетке тоже снимается."""
    m = bracket["rounds"][r][i]
    need = wins_needed(match_bo(bracket, m))
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
            allowed.update(str(pid) for pid in team_member_ids(bracket["teams"][team_idx]))
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


# ---------------- отборочные дуэли ----------------
#
# Этап перед основной сеткой: дуэли 1×1 (обычно на аим-карте), по итогам
# которых составляют пары или посев. Своего призового и титула у него нет,
# поэтому это не отдельный турнир, а часть основного.
#
# Кроме основной сетки на выбывание есть утешительные — за все места: кто
# проиграл в раунде, играет мини-сетку за следующие места. Для 8 человек:
# проигравшие в 1/4 разыгрывают 5–8 (их проигравшие — 7–8), проигравшие в
# полуфинале — 3-е место. Каждый играет одинаково (3 дуэли), и в конце у всех
# своё место от 1 до 8.
#
# bracket["qualifier"] = {
#     "mode": "1×1", "map": "aim_map_s2",
#     "note": str,                       # на что повлиял итог
#     "rounds": [[duel, ...], ...],      # основная сетка (места 1–2)
#     "places": [                        # утешительные сетки, если включены
#         {"place": 5, "src": [-1, 0], "rounds": [[duel, ...], ...]},
#         ...                            # src: [группа (-1 — основная), раунд],
#     ],                                 # чьи проигравшие сюда попадают
# }
# duel = {"p": [user_id, user_id], "score": [a, b], "win": 0 | 1, "cybershoke_lobby": int | None}
# Статистика дуэлей в K/D и рейтинг турниров 2×2 не идёт — на аим-карте один
# на один это совсем другие цифры.

def _duel() -> dict:
    return {"p": [None, None], "score": None, "win": None, "cybershoke_lobby": None}


def _elim_rounds(n_first: int) -> list[list[dict]]:
    """Пустая сетка на выбывание с n_first матчами в первом раунде."""
    rounds, n = [[_duel() for _ in range(n_first)]], n_first
    while n > 1:
        n = (n + 1) // 2
        rounds.append([_duel() for _ in range(n)])
    return rounds


def _add_places(q: dict, g: int, rounds: list, place: int) -> None:
    """Утешительные сетки для группы g: проигравшие раунда r играют за места
    place + (сколько было матчей в раунде r) и дальше. Финальный проигравший
    берёт place + 1 без отдельной сетки."""
    for r in range(len(rounds) - 1):
        losers = len(rounds[r])
        if losers < 2:
            continue
        sub = {"place": place + losers, "src": [g, r], "rounds": _elim_rounds(losers // 2)}
        q["places"].append(sub)
        _add_places(q, len(q["places"]) - 1, sub["rounds"], sub["place"])


def build_qualifier(player_ids: list[int], mode: str, map_name: str, note: str = "", places: bool = True) -> dict:
    """Сетка дуэлей: те же правила посева и bye, что у команд, плюс (по
    умолчанию) утешительные сетки за все места."""
    ids = list(dict.fromkeys(player_ids))
    if len(ids) < 2:
        raise ValueError("Для дуэлей нужно минимум 2 участника")
    if mode == "random":
        random.shuffle(ids)
    size = next_pow2(len(ids))
    order = seed_order(size)
    rounds = _elim_rounds(size // 2)
    for k, m in enumerate(rounds[0]):
        a, b = order[2 * k] - 1, order[2 * k + 1] - 1
        m["p"] = [ids[a] if a < len(ids) else None, ids[b] if b < len(ids) else None]
    q = {"mode": "1×1", "map": map_name or "aim_map_s2", "note": note, "rounds": rounds}
    if places:
        q["places"] = []
        _add_places(q, -1, rounds, 1)
    _qualifier_sync(q)
    return q


def qualifier_add_places(q: dict) -> None:
    """Дособирает игры за места к уже созданным дуэлям — внесённые результаты
    остаются, проигравшие сразу попадают в утешительные сетки."""
    if q.get("places") is not None:
        raise ValueError("Игры за места уже есть")
    q["places"] = []
    _add_places(q, -1, q.get("rounds") or [], 1)
    _qualifier_sync(q)


def _group_rounds(q: dict, g: int) -> list:
    return q["rounds"] if g == -1 else q["places"][g]["rounds"]


def _qualifier_sync(q: dict) -> None:
    """Расставляет участников по всем сеткам заново из уже внесённых
    результатов: победители — дальше, проигравшие — в утешительную сетку.
    Если в дуэли поменялся участник, её результат снимается. Пустые слоты
    (bye) пропускают соперника дальше без игры.

    Группы идут так, что источник всегда раньше получателя, поэтому хватает
    одного прохода.
    """
    # Итог каждой дуэли: (решена ли, победитель, проигравший).
    outcome: dict[tuple[int, int, int], tuple[bool, int | None, int | None]] = {}

    def resolve(g: int, r: int, i: int, m: dict, settled: list[bool]) -> None:
        a, b = m["p"]
        if settled[0] and settled[1] and (a is None) != (b is None):
            # Соперника не будет — проходит без игры.
            m["score"], m["win"] = None, 0 if a is not None else 1
        if m["win"] in (0, 1) and None not in m["p"]:
            outcome[(g, r, i)] = (True, m["p"][m["win"]], m["p"][1 - m["win"]])
        elif m["win"] in (0, 1):
            outcome[(g, r, i)] = (True, m["p"][m["win"]], None)
        elif settled[0] and settled[1] and a is None and b is None:
            outcome[(g, r, i)] = (True, None, None)
        else:
            outcome[(g, r, i)] = (False, None, None)

    def place(m: dict, values: list) -> None:
        if m["p"] != values:
            m["p"] = values
            m["score"], m["win"] = None, None

    groups = [(-1, None)] + [(k, grp["src"]) for k, grp in enumerate(q.get("places") or [])]
    for g, src in groups:
        rounds = _group_rounds(q, g)
        for r, round_ in enumerate(rounds):
            for i, m in enumerate(round_):
                if r == 0 and g == -1:
                    settled = [True, True]
                else:
                    vals, settled = [], []
                    for slot in (0, 1):
                        if r == 0:
                            sg, sr = src
                            done, _, loser = outcome[(sg, sr, 2 * i + slot)]
                            vals.append(loser if done else None)
                        else:
                            done, winner, _ = outcome[(g, r - 1, 2 * i + slot)]
                            vals.append(winner if done else None)
                        settled.append(done)
                    place(m, vals)
                resolve(g, r, i, m, settled)


def qualifier_set_result(q: dict, r: int, i: int, score: list[int] | None, win: int | None, g: int = -1) -> None:
    """Результат дуэли: счёт и/или победитель. Победитель по счёту, если он не указан."""
    if g != -1 and not (0 <= g < len(q.get("places") or [])):
        raise ValueError("Такой дуэли нет")
    rounds = _group_rounds(q, g) or []
    if not (0 <= r < len(rounds) and 0 <= i < len(rounds[r])):
        raise ValueError("Такой дуэли нет")
    m = rounds[r][i]
    if None in m["p"]:
        raise ValueError("Соперник ещё не определён")
    if score is not None:
        if len(score) != 2 or any(v < 0 for v in score):
            raise ValueError("Счёт указан неверно")
        if win is None and score[0] != score[1]:
            win = 0 if score[0] > score[1] else 1
    if score is not None and win is None:
        raise ValueError("При равном счёте укажите победителя")
    m["score"], m["win"] = score, win
    _qualifier_sync(q)


def all_duels(q: dict):
    for round_ in q.get("rounds") or []:
        yield from round_
    for grp in q.get("places") or []:
        for round_ in grp["rounds"]:
            yield from round_


def qualifier_results(bracket: dict) -> list[tuple[int, int]]:
    """(победитель, проигравший) по всем сыгранным дуэлям, включая утешительные."""
    out = []
    for m in all_duels(bracket.get("qualifier") or {}):
        if m.get("win") in (0, 1) and None not in m["p"]:
            out.append((m["p"][m["win"]], m["p"][1 - m["win"]]))
    return out


def qualifier_winner(bracket: dict) -> int | None:
    rounds = (bracket.get("qualifier") or {}).get("rounds") or []
    final = rounds[-1][0] if rounds and rounds[-1] else None
    return final["p"][final["win"]] if final and final.get("win") in (0, 1) else None


def qualifier_places(q: dict) -> dict[int, int]:
    """Итоговые места {user_id: место} — у кого уже определились."""
    out: dict[int, int] = {}
    groups = [(1, q.get("rounds") or [])] + [(grp["place"], grp["rounds"]) for grp in q.get("places") or []]
    for place, rounds in groups:
        final = rounds[-1][0] if rounds and rounds[-1] else None
        if final and final.get("win") in (0, 1):
            w, l = final["p"][final["win"]], final["p"][1 - final["win"]]
            if w is not None:
                out[w] = place
            if l is not None:
                out[l] = place + 1
    return out


# ---------------- MVP ----------------

def player_rating(kills: int, deaths: int, rounds: int) -> float:
    """Упрощённый рейтинг HLTV 1.0: килы и выживаемость за раунд относительно
    средних значений (0.679 и 0.317). Слагаемое за мультикиллы выброшено —
    их у нас нет. 1.00 — средний игрок."""
    if not rounds:
        return 0.0
    kill_rating = kills / rounds / 0.679
    survival_rating = (rounds - deaths) / rounds / 0.317
    return (kill_rating + 0.7 * survival_rating) / 1.7


def tournament_mvp(bracket: dict) -> dict | None:
    """Лучший игрок турнира по рейтингу за все сыгранные карты.

    Чтобы MVP не доставался за одну удачную карту, в зачёт идут только те, кто
    сыграл хотя бы половину раундов от самого активного участника.
    """
    totals: dict[str, dict] = {}
    for round_ in bracket.get("rounds", []):
        for m in round_:
            for entry in m.get("maps") or []:
                rounds = sum(entry.get("rounds") or [])
                if not rounds:
                    continue
                for pid, line in (entry.get("stats") or {}).items():
                    t = totals.setdefault(pid, {"kills": 0, "deaths": 0, "assists": 0, "rounds": 0, "maps": 0})
                    t["kills"] += line.get("k", 0)
                    t["deaths"] += line.get("d", 0)
                    t["assists"] += line.get("a", 0)
                    t["rounds"] += rounds
                    t["maps"] += 1
    if not totals:
        return None
    need = max(t["rounds"] for t in totals.values()) / 2
    eligible = {pid: t for pid, t in totals.items() if t["rounds"] >= need}
    pid, best = max(eligible.items(), key=lambda kv: player_rating(kv[1]["kills"], kv[1]["deaths"], kv[1]["rounds"]))
    return {"player_id": int(pid), **best, "rating": round(player_rating(best["kills"], best["deaths"], best["rounds"]), 2)}
