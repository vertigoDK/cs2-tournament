"""Каталог скинов для страницы «Скины».

Берём открытую базу ByMykel/CSGO-API (en/skins.json, ~5 МБ) и раскладываем
по оружию в маленькие файлы: страница грузит список оружия, а скины —
только того оружия, которое открыли.

    python3 scripts/build_skins_catalog.py [путь к skins.json]

Без аргумента скачивает свежий файл. Результат — frontend/public/skins/.
"""

import json
import pathlib
import sys
import urllib.request

SRC = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json"
OUT = pathlib.Path(__file__).resolve().parent.parent / "frontend" / "public" / "skins"
IMG_PREFIX = "https://community.akamai.steamstatic.com/economy/image/"

# Порядок и подписи групп на странице.
GROUPS = [
    ("Knives", "knives", "Ножи"),
    ("Gloves", "gloves", "Перчатки"),
    ("Rifles", "rifles", "Винтовки"),
    ("Pistols", "pistols", "Пистолеты"),
    ("SMGs", "smgs", "Пистолеты-пулемёты"),
    ("Heavy", "heavy", "Тяжёлое"),
    ("Equipment", "equipment", "Снаряжение"),
]
RARITY = ["#b0c3d9", "#5e98d9", "#4b69ff", "#8847ff", "#d32ce6", "#eb4b4b", "#e4ae39"]


def short(url: str) -> str:
    return url[len(IMG_PREFIX):] if url and url.startswith(IMG_PREFIX) else url or ""


def main() -> None:
    if len(sys.argv) > 1:
        items = json.loads(pathlib.Path(sys.argv[1]).read_text())
    else:
        with urllib.request.urlopen(SRC, timeout=120) as r:
            items = json.load(r)

    weapons: dict[int, dict] = {}
    skins: dict[int, list] = {}
    for it in items:
        cat = (it.get("category") or {}).get("name")
        w = it.get("weapon") or {}
        if cat not in {g[0] for g in GROUPS} or not w.get("weapon_id"):
            continue
        d = int(w["weapon_id"])
        weapons.setdefault(d, {"d": d, "id": w["id"], "n": w["name"], "g": cat, "c": 0, "i": ""})
        paint = int(it["paint_index"]) if it.get("paint_index") not in (None, "") else 0
        color = (it.get("rarity") or {}).get("color") or RARITY[0]
        row = {
            "p": paint,
            # Название после «|», у допплеров — с фазой («Doppler Phase 2»).
            "n": " ".join(
                x for x in (it["name"].split(" | ", 1)[1] if " | " in it.get("name", "") else "Стандартный", it.get("phase")) if x
            ),
            "r": color,
            "i": short(it.get("image")),
            "min": it.get("min_float") if it.get("min_float") is not None else 0,
            "max": it.get("max_float") if it.get("max_float") is not None else 1,
        }
        skins.setdefault(d, []).append(row)
        if paint == 0 or not weapons[d]["i"]:
            weapons[d]["i"] = row["i"]  # обложка оружия — стандартный вид, если есть

    # Стандартный вид оружия (без скина) — из base_weapons.
    with urllib.request.urlopen(SRC.rsplit("/", 1)[0] + "/base_weapons.json", timeout=120) as r:
        base = {int(b["def_index"]): short(b.get("image")) for b in json.load(r) if b.get("def_index") is not None}
    for d, w in weapons.items():
        w["b"] = base.get(d) or (base.get(42, "") if w["g"] == "Knives" else "")

    order = {c: k for k, (c, *_) in enumerate(GROUPS)}
    (OUT / "w").mkdir(parents=True, exist_ok=True)
    for d, rows in skins.items():
        # Сначала стандартный (p=0), дальше от редких к обычным, по имени.
        rows.sort(key=lambda r: (r["p"] != 0, -RARITY.index(r["r"]) if r["r"] in RARITY else 0, r["n"]))
        weapons[d]["c"] = sum(1 for r in rows if r["p"])
        (OUT / "w" / f"{d}.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))

    catalog = {
        "knife_default": base.get(42, ""),
        "img": IMG_PREFIX,
        "groups": [
            {
                "id": gid,
                "name": name,
                "weapons": sorted((w for w in weapons.values() if w["g"] == cat), key=lambda w: w["n"]),
            }
            for cat, gid, name in GROUPS
        ],
    }
    for g in catalog["groups"]:
        for w in g["weapons"]:
            w.pop("g")
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")))
    total = sum(len(r) for r in skins.values())
    print(f"{len(weapons)} оружий, {total} скинов → {OUT}")


if __name__ == "__main__":
    main()
