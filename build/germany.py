"""Чи всередині Німеччини — за тією самою геометрією, що малює карта.

Фід gtfs.de тягне за собою сусідів: Париж, Прага, Мілан. Для розрахунку вони
чесні (туди справді їдуть потяги), але на власній карті, де є лише Німеччина,
вони висять у порожнечі. Тому станції поза країною позначаємо один раз на
збірці, а фронтенд їх просто не малює.
"""

from __future__ import annotations

import json
from pathlib import Path

# Та сама геометрія, що й у базовій карті: якщо межа зсунеться, зсунеться
# і фільтр.
GEOMETRY = Path("web/public/geo/germany-states.json")


def load_rings(path: Path = GEOMETRY) -> list[tuple[tuple[float, float, float, float], list]]:
    """Зовнішні контури земель разом з їхніми bbox."""
    data = json.loads(path.read_text())
    rings: list[tuple[tuple[float, float, float, float], list]] = []
    for feature in data["features"]:
        geometry = feature["geometry"]
        polygons = (
            geometry["coordinates"]
            if geometry["type"] == "MultiPolygon"
            else [geometry["coordinates"]]
        )
        for polygon in polygons:
            ring = polygon[0]
            lons = [p[0] for p in ring]
            lats = [p[1] for p in ring]
            rings.append(((min(lons), min(lats), max(lons), max(lats)), ring))
    return rings


def _in_ring(lon: float, lat: float, ring: list) -> bool:
    """Промінь праворуч: непарна кількість перетинів — точка всередині."""
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > lat) != (y2 > lat):
            x = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if x > lon:
                inside = not inside
    return inside


def inside_germany(lon: float, lat: float, rings: list) -> bool:
    """Bbox відсіює 99% точок, і лише решта доходить до променя."""
    for (min_lon, min_lat, max_lon, max_lat), ring in rings:
        if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat and _in_ring(lon, lat, ring):
            return True
    return False


def load_states(path: Path = GEOMETRY) -> tuple[list[str], list[tuple[int, tuple, list]]]:
    """Те саме, але з памʼяттю про те, якій землі належить контур."""
    data = json.loads(path.read_text())
    names: list[str] = []
    rings: list[tuple[int, tuple, list]] = []
    for feature in data["features"]:
        names.append(feature["properties"]["name"])
        geometry = feature["geometry"]
        polygons = (
            geometry["coordinates"]
            if geometry["type"] == "MultiPolygon"
            else [geometry["coordinates"]]
        )
        for polygon in polygons:
            ring = polygon[0]
            lons = [p[0] for p in ring]
            lats = [p[1] for p in ring]
            rings.append((len(names) - 1, (min(lons), min(lats), max(lons), max(lats)), ring))
    return names, rings


def state_of(lon: float, lat: float, rings: list[tuple[int, tuple, list]]) -> int:
    """Індекс землі або -1, якщо точка поза Німеччиною."""
    for state, (min_lon, min_lat, max_lon, max_lat), ring in rings:
        if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat and _in_ring(lon, lat, ring):
            return state
    return -1
