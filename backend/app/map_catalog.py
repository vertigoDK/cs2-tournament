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
