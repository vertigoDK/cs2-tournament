"""Каталог карт: пул режима 2×2 (Wingman) на Cybershoke.

Порядок здесь — порядок по умолчанию в пуле нового турнира и в статистике.
`cybershoke_id` понадобится, чтобы создавать лобби на Cybershoke под матч.
Обложка карты ищется на фронте по имени: frontend/public/img/maps/<slug>.webp.
"""

from typing import NamedTuple


class MapInfo(NamedTuple):
    name: str
    cybershoke_id: str


MAPS: list[MapInfo] = [
    MapInfo("Nuke", "de_nuke"),
    MapInfo("Inferno", "de_inferno"),
    MapInfo("Dust2", "de_dust2_wingman"),
    MapInfo("Mirage", "de_mirage_wingman"),
    MapInfo("Train", "de_train_wingman"),
    MapInfo("Anubis", "de_anubis_wingman"),
    MapInfo("Rialto", "gd_rialto"),
    MapInfo("Overpass", "de_overpass"),
    MapInfo("Vertigo", "de_vertigo"),
    MapInfo("Lake", "de_lake"),
    MapInfo("Eldorado", "de_eldorado"),
    MapInfo("Debris", "de_debris"),
]

MAP_NAMES: list[str] = [m.name for m in MAPS]


# Для своего сервера: имя карты на сайте → (карта для changelevel, id мастерской или None).
# Номера Мастерской взяты из списка карт самого Cybershoke (maps_list.id_workshop): wingman-версии
# и Lake/Rialto — воркшоп-карты, остальные встроены в игру.
# «Aim Map» — карта для дуэлей 1×1 из мастерской.
AIM_MAP = "Aim Map"
SERVER_MAPS: dict[str, tuple[str, str | None]] = {
    "Nuke": ("de_nuke", None),
    "Inferno": ("de_inferno", None),
    "Dust2": ("de_dust2_wingman", "3607203422"),
    "Mirage": ("de_mirage_wingman", "3607111961"),
    "Train": ("de_train_wingman", "3608859758"),
    "Anubis": ("de_anubis_wingman", "3608867276"),
    "Rialto": ("gd_rialto", "3358474789"),
    "Overpass": ("de_overpass", None),
    "Vertigo": ("de_vertigo", None),
    "Lake": ("de_lake", "3219506727"),
    "Eldorado": ("de_eldorado", None),
    "Debris": ("de_debris", None),
    AIM_MAP: ("aim_map_s2", "3074525246"),
}
