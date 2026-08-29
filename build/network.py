"""Схема залізничної мережі з патернів руху.

У фіді немає shapes.txt, тобто справжньої геометрії колій. Але послідовність
зупинок у патерні задає, які станції зʼєднані напряму, і прямі відрізки між
ними дають чесну схему мережі — не карту колій, а граф сполучень.
"""

from __future__ import annotations

import math

from build.feed import Feed

# Ділянка = пара сусідніх зупинок у патерні, тому експрес, що йде без
# зупинок через пів країни, малює одну пряму лінію через усю карту.
# Такі відрізки не несуть інформації про мережу — лише заважають.
MAX_EDGE_KM = 100
EARTH_RADIUS_KM = 6371.0


def _distance_km(feed: Feed, a: int, b: int) -> float:
    lat1, lon1 = math.radians(float(feed.stop_lats[a])), math.radians(float(feed.stop_lons[a]))
    lat2, lon2 = math.radians(float(feed.stop_lats[b])), math.radians(float(feed.stop_lons[b]))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def network_edges(feed: Feed, max_km: float = MAX_EDGE_KM) -> list[tuple[int, int]]:
    """Унікальні ділянки між сусідніми зупинками, без урахування напрямку.

    Ділянки, довші за max_km, відкидаються: це не перегони, а експреси, що
    пропускають проміжні станції. Самі станції на карті лишаються, і той
    самий шлях уже намальовано короткими відрізками місцевих поїздів.
    """
    edges: set[tuple[int, int]] = set()
    for p in range(feed.n_patterns):
        lo, hi = int(feed.pattern_ptr[p]), int(feed.pattern_ptr[p + 1])
        stops = feed.pattern_stops[lo:hi]
        for first, second in zip(stops, stops[1:]):
            a, b = int(first), int(second)
            if a != b:
                edges.add((min(a, b), max(a, b)))
    return sorted(e for e in edges if _distance_km(feed, *e) <= max_km)


def network_geojson(feed: Feed) -> dict:
    """Мережа як GeoJSON: одна LineString на ділянку."""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [round(float(feed.stop_lons[a]), 5), round(float(feed.stop_lats[a]), 5)],
                        [round(float(feed.stop_lons[b]), 5), round(float(feed.stop_lats[b]), 5)],
                    ],
                },
                "properties": {},
            }
            for a, b in network_edges(feed)
        ],
    }
