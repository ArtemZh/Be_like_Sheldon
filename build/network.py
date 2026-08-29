"""Схема залізничної мережі з патернів руху.

У фіді немає shapes.txt, тобто справжньої геометрії колій. Але послідовність
зупинок у патерні задає, які станції зʼєднані напряму, і прямі відрізки між
ними дають чесну схему мережі — не карту колій, а граф сполучень.
"""

from __future__ import annotations

from build.feed import Feed


def network_edges(feed: Feed) -> list[tuple[int, int]]:
    """Унікальні ділянки між сусідніми зупинками, без урахування напрямку."""
    edges: set[tuple[int, int]] = set()
    for p in range(feed.n_patterns):
        lo, hi = int(feed.pattern_ptr[p]), int(feed.pattern_ptr[p + 1])
        stops = feed.pattern_stops[lo:hi]
        for first, second in zip(stops, stops[1:]):
            a, b = int(first), int(second)
            if a != b:
                edges.add((min(a, b), max(a, b)))
    return sorted(edges)


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
