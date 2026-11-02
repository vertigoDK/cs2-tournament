"""Награды за места в отборочных дуэлях.

Что даёт каждое место, задаётся в самом турнире (bracket["rewards"]) — в код
это не зашито. В коде только *типы* наград и их правила:

- perma_pickban — постоянные пик и бан: команда один раз за турнир выбирает
  карту, которую всегда пикает, и карту, которую всегда банит; на её ходах
  драфта сайт делает их сам (см. bracket.apply_perma);
- side_choice — выбор стороны: на count картах за турнир капитан заранее
  выбирает сторону (CT/T) на карте серии;
- swap_opponent — один раз поменять соперника в первом матче: поменяться им
  с другой командой первого раунда, пока те матчи не начались.

Всё выбирается в окне «Готов» перед драфтом. Награду получает игрок, занявший
место, а использует её капитан его команды.

bracket["rewards"] = [{"place": 1, "type": "perma_pickban"},
                      {"place": 2, "type": "side_choice", "count": 3}, ...]
bracket["reward_state"] = {"<team_idx>": {"perma": {"pick": str, "ban": str},
                                          "swap_used": bool}}
match["veto"]["sides"] = {"<slot>": {"<map_index>": "CT" | "T"}}
"""

from . import bracket as B

TYPES = ("perma_pickban", "side_choice", "swap_opponent")
SIDES = ("CT", "T")


def _state(bracket: dict, team_idx: int) -> dict:
    return bracket.setdefault("reward_state", {}).setdefault(str(team_idx), {})


def _team_of(bracket: dict, player_id: int) -> int | None:
    for idx, team in enumerate(bracket.get("teams") or []):
        if player_id in (team.get("player_a_id"), team.get("player_b_id")):
            return idx
    return None


def sides_used(bracket: dict, team_idx: int, skip: tuple[int, int] | None = None) -> int:
    """Сколько выборов стороны команда уже потратила (во всех матчах, кроме skip)."""
    used = 0
    for r, round_ in enumerate(bracket.get("rounds") or []):
        for i, m in enumerate(round_):
            if skip == (r, i) or team_idx not in m.get("p", []):
                continue
            slot = m["p"].index(team_idx)
            used += len(((m.get("veto") or {}).get("sides") or {}).get(str(slot)) or {})
    return used


def team_rewards(bracket: dict) -> dict[str, list[dict]]:
    """Награды каждой команды: {team_idx: [{type, place, player_id, ...}]}."""
    config = bracket.get("rewards") or []
    q = bracket.get("qualifier") or {}
    if not config or not q:
        return {}
    places = B.qualifier_places(q)
    by_place = {place: pid for pid, place in places.items()}
    out: dict[str, list[dict]] = {}
    for cfg in config:
        pid = by_place.get(cfg.get("place"))
        team_idx = _team_of(bracket, pid) if pid else None
        if team_idx is None:
            continue
        state = (bracket.get("reward_state") or {}).get(str(team_idx)) or {}
        item = {"type": cfg["type"], "place": cfg["place"], "player_id": pid}
        if cfg["type"] == "perma_pickban":
            item["perma"] = state.get("perma")
        elif cfg["type"] == "side_choice":
            item["count"] = int(cfg.get("count") or 1)
        elif cfg["type"] == "swap_opponent":
            item["used"] = bool(state.get("swap_used"))
        out.setdefault(str(team_idx), []).append(item)
    # Выборы стороны складываются по всем наградам этого типа у команды.
    for team_idx, items in out.items():
        total = sum(it["count"] for it in items if it["type"] == "side_choice")
        if total:
            used = sides_used(bracket, int(team_idx))
            for it in items:
                if it["type"] == "side_choice":
                    it["total"], it["used"] = total, used
    return out


def _has(bracket: dict, team_idx: int, kind: str) -> list[dict]:
    return [it for it in team_rewards(bracket).get(str(team_idx), []) if it["type"] == kind]


def _ready_match(bracket: dict, r: int, i: int) -> dict:
    m = bracket["rounds"][r][i]
    if (m.get("veto") or {}).get("status") != "ready_check":
        raise ValueError("Награды выбираются до начала драфта — в окне «Готов»")
    return m


def set_perma(bracket: dict, r: int, i: int, slot: int, pick: str, ban: str) -> None:
    m = _ready_match(bracket, r, i)
    team_idx = m["p"][slot]
    if not _has(bracket, team_idx, "perma_pickban"):
        raise ValueError("У команды нет постоянного пика и бана")
    state = _state(bracket, team_idx)
    if state.get("perma"):
        raise ValueError("Постоянные пик и бан уже выбраны — они на весь турнир")
    pool = bracket.get("maps_pool") or []
    if pick not in pool or ban not in pool:
        raise ValueError("Такой карты нет в пуле")
    if pick == ban:
        raise ValueError("Пик и бан должны быть разными картами")
    state["perma"] = {"pick": pick, "ban": ban}


def set_sides(bracket: dict, r: int, i: int, slot: int, sides: dict[str, str]) -> None:
    m = _ready_match(bracket, r, i)
    team_idx = m["p"][slot]
    items = _has(bracket, team_idx, "side_choice")
    if not items:
        raise ValueError("У команды нет выбора стороны")
    bo = B.match_bo(bracket, m)
    clean = {}
    for k, side in sides.items():
        if side not in SIDES or not str(k).isdigit() or not (0 <= int(k) < bo):
            raise ValueError("Сторона указана неверно")
        clean[str(int(k))] = side
    total = items[0]["total"]
    if sides_used(bracket, team_idx, skip=(r, i)) + len(clean) > total:
        raise ValueError(f"Выборов стороны осталось меньше, чем карт: всего {total} за турнир")
    m["veto"].setdefault("sides", {})[str(slot)] = clean


def swap_opponent(bracket: dict, r: int, i: int, slot: int, other: int, other_slot: int) -> None:
    """Команда из слота slot матча (0, i) меняется соперником: её соперник и
    команда из other_slot матча (0, other) меняются местами."""
    if r != 0:
        raise ValueError("Соперника можно поменять только в первом матче")
    m = _ready_match(bracket, r, i)
    team_idx = m["p"][slot]
    items = _has(bracket, team_idx, "swap_opponent")
    if not items:
        raise ValueError("У команды нет замены соперника")
    if items[0]["used"]:
        raise ValueError("Замена соперника уже использована")
    first = bracket["rounds"][0]
    if not (0 <= other < len(first)) or other == i or other_slot not in (0, 1):
        raise ValueError("Выберите команду из другого матча первого раунда")
    om = first[other]
    ov = (om.get("veto") or {}).get("status", "pending")
    if ov not in ("pending", "ready_check") or om.get("win") is not None or om["p"][other_slot] is None:
        raise ValueError("Тот матч уже начался — поменяться с ним нельзя")
    opp = 1 - slot
    m["p"][opp], om["p"][other_slot] = om["p"][other_slot], m["p"][opp]
    # Состав матчей сменился — готовность и выбранные стороны соперников сбрасываем.
    for match, s in ((m, opp), (om, other_slot)):
        v = match.get("veto") or {}
        if v.get("status") == "ready_check":
            v["ready"] = [False, False]
            (v.get("sides") or {}).pop(str(s), None)
    _state(bracket, team_idx)["swap_used"] = True


def validate_config(config: list[dict]) -> list[dict]:
    out, seen = [], set()
    for cfg in config:
        place, kind = int(cfg.get("place") or 0), cfg.get("type")
        if kind not in TYPES or not (1 <= place <= 64):
            raise ValueError("Награда указана неверно")
        if (place, kind) in seen:
            raise ValueError("Одна и та же награда за место указана дважды")
        seen.add((place, kind))
        item = {"place": place, "type": kind}
        if kind == "side_choice":
            item["count"] = max(1, min(20, int(cfg.get("count") or 1)))
        out.append(item)
    return sorted(out, key=lambda c: c["place"])
