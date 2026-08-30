"""Лінії сюжетного режиму, прокладені по справжніх станціях.

Пряма між Гейдельбергом і Штутгартом — брехня: поїзд туди так не їде. Тому
маршрут Шелдона малюємо не хордами, а шляхом по мережі: беремо ті самі
ділянки, з яких складається схема на карті, і шукаємо найкоротший шлях між
опорними станціями.

Результат — статичний модуль для фронтенду: геометрія не залежить від
розкладу й не має сенсу перераховуватись у браузері.
"""

from __future__ import annotations

import heapq
import json
import math
from pathlib import Path

from build.feed import Feed
from build.network import _distance_km, network_edges

# Опорні точки. Кільце — те, що Шелдон планував; поїздка й речі — те, що
# сталося. Координати беремо не з фіду, а звідси: головних вокзалів
# Штутгарта й Карлсруе в регіональному фіді немає, і найближчу станцію до
# них шукаємо по координатах.
WAYPOINTS = {
    "heidelberg": (49.40393, 8.67583),
    "weinheim": (49.55332, 8.66552),
    "frankfurt": (50.10675, 8.66274),
    "stuttgart": (48.7838, 9.1817),
    "karlsruhe": (48.9937, 8.4017),
    "mannheim": (49.47955, 8.46943),
}

PATHS = {
    "loop": ["heidelberg", "frankfurt", "stuttgart", "karlsruhe", "mannheim", "heidelberg"],
    "ride": ["heidelberg", "weinheim"],
    "luggage": ["weinheim", "frankfurt"],
}

EARTH_RADIUS_KM = 6371.0


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlon = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def nearest_node(feed: Feed, nodes: set[int], lat: float, lon: float) -> int:
    """Станція мережі, найближча до опорної точки.

    Шукаємо серед вузлів графа, а не серед усіх зупинок: точка, до якої не
    підходить жодна ділянка, шляху не дасть.
    """
    return min(nodes, key=lambda i: _haversine(lat, lon, float(feed.stop_lats[i]), float(feed.stop_lons[i])))


def shortest_path(graph: dict[int, list[tuple[int, float]]], start: int, goal: int) -> list[int]:
    """Дейкстра по мережі; порожній список, якщо шляху немає."""
    best = {start: 0.0}
    previous: dict[int, int] = {}
    queue = [(0.0, start)]
    while queue:
        dist, node = heapq.heappop(queue)
        if node == goal:
            break
        if dist > best.get(node, math.inf):
            continue
        for nxt, step in graph.get(node, ()):
            through = dist + step
            if through < best.get(nxt, math.inf):
                best[nxt] = through
                previous[nxt] = node
                heapq.heappush(queue, (through, nxt))

    if goal not in best:
        return []
    path = [goal]
    while path[-1] != start:
        path.append(previous[path[-1]])
    return path[::-1]


def build_graph(feed: Feed) -> dict[int, list[tuple[int, float]]]:
    graph: dict[int, list[tuple[int, float]]] = {}
    for a, b in network_edges(feed):
        km = _distance_km(feed, a, b)
        graph.setdefault(a, []).append((b, km))
        graph.setdefault(b, []).append((a, km))
    return graph


def story_paths(feed: Feed) -> dict[str, list[dict]]:
    """Кожна лінія сюжету як послідовність справжніх станцій із назвами."""
    graph = build_graph(feed)
    nodes = set(graph)
    anchors = {name: nearest_node(feed, nodes, *point) for name, point in WAYPOINTS.items()}

    out: dict[str, list[list[float]]] = {}
    for name, waypoints in PATHS.items():
        line: list[int] = []
        for first, second in zip(waypoints, waypoints[1:]):
            leg = shortest_path(graph, anchors[first], anchors[second])
            if not leg:
                raise ValueError(f"немає шляху {first} -> {second}")
            line += leg[1:] if line else leg
        out[name] = [
            {
                "name": str(feed.stop_names[i]),
                "lon": round(float(feed.stop_lons[i]), 5),
                "lat": round(float(feed.stop_lats[i]), 5),
            }
            for i in line
        ]
    return out


def write_module(feed: Feed, path: Path) -> None:
    """Записати модуль для фронтенду."""
    paths = story_paths(feed)
    stops = ",\n".join(
        f"  {name}: {json.dumps(line, ensure_ascii=False, separators=(', ', ': '))}"
        for name, line in paths.items()
    )
    path.write_text(
        "/**\n"
        " * Маршрут Шелдона по справжніх станціях.\n"
        " *\n"
        " * Згенеровано `python -m build.story_paths` з того самого фіду, що й карта:\n"
        " * найкоротший шлях мережею між опорними вокзалами, з усіма проміжними\n"
        " * зупинками. Не редагувати руками.\n"
        " */\n\n"
        "export const STORY_STOPS = {\n" + stops + ",\n};\n\n"
        "/** Ті самі шляхи, але лише координатами — для ліній на карті. */\n"
        "export const STORY_PATHS = Object.fromEntries(\n"
        "  Object.entries(STORY_STOPS).map(([name, stops]) => "
        "[name, stops.map((s) => [s.lon, s.lat])]),\n"
        ");\n"
    )


def main() -> None:
    import argparse

    from build.gtfs_ingest import load_gtfs

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gtfs", type=Path)
    parser.add_argument("--out", type=Path, default=Path("web/src/story-paths.js"))
    args = parser.parse_args()

    feed = load_gtfs(args.gtfs)
    write_module(feed, args.out)
    paths = story_paths(feed)
    for name, line in paths.items():
        print(f"{name}: {len(line)} станцій")


if __name__ == "__main__":
    main()
