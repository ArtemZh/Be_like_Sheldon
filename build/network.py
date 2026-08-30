"""Схема залізничної мережі з патернів руху.

У фіді немає shapes.txt, тобто справжньої геометрії колій. Але послідовність
зупинок у патерні задає, які станції зʼєднані напряму, і прямі відрізки між
ними дають чесну схему мережі — не карту колій, а граф сполучень.
"""

from __future__ import annotations

import heapq
import math

from build.feed import Feed

# Експрес, що йде через пів країни без зупинок, дає ділянку від А одразу до Б,
# хоч той самий шлях уже намальовано перегонами місцевих поїздів. Такі хорди
# прибираємо транзитивною редукцією, а не порогом довжини: довга ділянка, якій
# нема заміни коротшими (єдина лінія в глушині), лишається на карті.
#
# Обхід уздовж мережі завжди довший за пряму. DETOUR — у скільки разів довшим
# він може бути, щоб ми ще вважали хорду дублем.
DETOUR = 1.7

# Редукція безсила там, де проміжних станцій у фіді просто немає: далекі рейси
# (TGV, FlixTrain, закордон) дають хорду, якій нема заміни коротшими ділянками.
# Такі відрізки — не перегони, а стрибок через пів карти, тому ріжемо за
# довжиною. 100 км: коротший поріг забирав би й справжні сільські перегони на
# кшталт Niebüll — Westerland, де проміжних станцій просто нема.
MAX_EDGE_KM = 100

# Третій випадок: рейс пропускає станції, які в мережі є, але зʼєднані іншими
# лініями, — редукція обходу не знаходить, а на карті це пряма через півкраїни.
# Впізнаємо за коридором: якщо вздовж відрізка стоять чужі станції, це не
# перегін, а стрибок повз них. Порожній коридор (Ніббюль — Вестерланд через
# дамбу) означає, що пропускати нема чого, і відрізок чесний.
CORRIDOR_KM = 5.0
CORRIDOR_MIN_EDGE_KM = 15.0
CORRIDOR_MAX_STATIONS = 4
EARTH_RADIUS_KM = 6371.0


def _distance_km(feed: Feed, a: int, b: int) -> float:
    lat1, lon1 = math.radians(float(feed.stop_lats[a])), math.radians(float(feed.stop_lons[a]))
    lat2, lon2 = math.radians(float(feed.stop_lats[b])), math.radians(float(feed.stop_lons[b]))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def _shortest_path_km(adjacency: dict[int, list[tuple[int, float]]], a: int, b: int, limit: float) -> float | None:
    """Довжина найкоротшого шляху a->b уздовж уже прийнятих ділянок.

    Пошук обмежений `limit`: щойно черга виходить за нього, відповіді немає.
    Саме межа й робить редукцію придатною для країни — інакше кожна ділянка
    коштувала б обходу всього графа.
    """
    best = {a: 0.0}
    queue = [(0.0, a)]
    while queue:
        dist, node = heapq.heappop(queue)
        if node == b:
            return dist
        if dist > best.get(node, math.inf) or dist > limit:
            continue
        for nxt, step in adjacency.get(node, ()):
            through = dist + step
            if through <= limit and through < best.get(nxt, math.inf):
                best[nxt] = through
                heapq.heappush(queue, (through, nxt))
    return None


def _corridor_stations(feed: Feed, a: int, b: int, corridor: float = CORRIDOR_KM) -> int:
    """Скільки чужих станцій стоїть у коридорі вздовж відрізка a-b."""
    lats, lons = feed.stop_lats.astype(float), feed.stop_lons.astype(float)
    scale = math.cos(math.radians(float(lats[a])))
    ax, ay = lons[a] * 111.32 * scale, lats[a] * 110.57
    bx, by = lons[b] * 111.32 * scale, lats[b] * 110.57
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    if length2 == 0:
        return 0

    xs, ys = lons * 111.32 * scale, lats * 110.57
    t = ((xs - ax) * dx + (ys - ay) * dy) / length2
    # кінці не рахуємо: коло станції завжди тісно, і це нічого не каже
    inside = (t > 0.05) & (t < 0.95)
    dist2 = (xs - (ax + t * dx)) ** 2 + (ys - (ay + t * dy)) ** 2
    return int((inside & (dist2 < corridor * corridor)).sum())


def network_edges(
    feed: Feed, detour: float = DETOUR, max_km: float = MAX_EDGE_KM
) -> list[tuple[int, int]]:
    """Унікальні ділянки між сусідніми зупинками, без урахування напрямку.

    Ділянки перебираємо від найкоротшої до найдовшої й лишаємо лише ті, яких
    ще не видно: якщо між кінцями вже є шлях із прийнятих (тобто коротших)
    ділянок, не довший за `detour` прямих відстаней, — це експрес поверх
    місцевої лінії, і другий раз малювати його нема сенсу.

    Те, що лишилось довшим за `max_km`, теж прибираємо: заміни йому нема, але
    це й не перегін, а пряма через пів карти.
    """
    edges: set[tuple[int, int]] = set()
    for p in range(feed.n_patterns):
        lo, hi = int(feed.pattern_ptr[p]), int(feed.pattern_ptr[p + 1])
        stops = feed.pattern_stops[lo:hi]
        for first, second in zip(stops, stops[1:]):
            a, b = int(first), int(second)
            if a != b:
                edges.add((min(a, b), max(a, b)))

    ranked = sorted(edges, key=lambda e: _distance_km(feed, *e))
    adjacency: dict[int, list[tuple[int, float]]] = {}
    kept: list[tuple[int, int]] = []
    for a, b in ranked:
        direct = _distance_km(feed, a, b)
        limit = direct * detour
        if _shortest_path_km(adjacency, a, b, limit) is not None:
            continue
        # у графі обходів лишаємо й задовгі: вони допомагають упізнати дубль,
        # навіть якщо самі на карту не потраплять
        adjacency.setdefault(a, []).append((b, direct))
        adjacency.setdefault(b, []).append((a, direct))
        if direct > max_km:
            continue
        if (
            direct >= CORRIDOR_MIN_EDGE_KM
            and _corridor_stations(feed, a, b) > CORRIDOR_MAX_STATIONS
        ):
            continue
        kept.append((a, b))
    return sorted(kept)


def network_geojson(feed: Feed, inside: list[bool] | None = None) -> dict:
    """Мережа як GeoJSON: одна LineString на ділянку.

    `inside` — маска станцій, які лишаються на карті. Ділянку малюємо, лише
    коли обидва кінці всередині: гілка, що йде за кордон, обривалась би на
    краю країни в нікуди.
    """
    edges = [
        (a, b)
        for a, b in network_edges(feed)
        if inside is None or (inside[a] and inside[b])
    ]
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
            for a, b in edges
        ],
    }
