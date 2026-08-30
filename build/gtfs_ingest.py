"""GTFS zip -> Feed."""

from __future__ import annotations

import csv
import io
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from build.feed import Feed

RAIL_ROUTE_TYPES = {"2", "100", "101", "102", "103", "105", "106", "109"}
MIN_TRANSFER_SECONDS = 5 * 60
REQUIRED_FILES = ("stops.txt", "routes.txt", "trips.txt", "stop_times.txt")


def _read_csv(z: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    with z.open(name) as fh:
        return list(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig")))


def parse_time(value: str) -> int:
    """'25:30:00' -> 91800. GTFS дозволяє години >= 24."""
    h, m, s = (int(part) for part in value.split(":"))
    return h * 3600 + m * 60 + s


def load_gtfs(path: Path, days: list[tuple[set[str], int]] | None = None) -> Feed:
    """Зібрати Feed із GTFS.

    days — це послідовність сервісних днів: (які service_id їздять, зсув у
    секундах). Наприклад [(понеділкові, 0), (вівторкові, 86400)].

    Рейс, чий сервіс їздить обидва дні, входить у розклад двічі — окремими
    рейсами з різними часами. Це не дублювання: понеділковий о 06:00 і
    вівторковий о 06:00 — різні потяги, і для поїздки «до ранку наступного
    дня» потрібен саме другий.

    None означає «усі рейси без зсуву» — так зручно в тестах.
    """
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        for required in REQUIRED_FILES:
            if required not in names:
                raise ValueError(
                    f"GTFS-фід не містить {required}; "
                    f"очікувались файли: {', '.join(REQUIRED_FILES)}"
                )
        stops = _read_csv(z, "stops.txt")
        routes = _read_csv(z, "routes.txt")
        trips = _read_csv(z, "trips.txt")
        stop_times = _read_csv(z, "stop_times.txt")

    stop_ids, index, names, lats, lons = _collapse_to_stations(stops)

    rail_routes = {r["route_id"] for r in routes if r["route_type"] in RAIL_ROUTE_TYPES}
    # Назва лінії: коротка, якщо є (RE 5), інакше довга. Далі вона доїде до
    # фронтенду тільки заради підпису «що це за потяг».
    route_names = {
        r["route_id"]: (r.get("route_short_name") or r.get("route_long_name") or "").strip()
        for r in routes
    }
    route_of_trip = {t["trip_id"]: route_names.get(t["route_id"], "") for t in trips}
    schedule = days if days is not None else [(None, 0)]
    offsets_of_trip: dict[str, list[int]] = {}
    for trip in trips:
        if trip["route_id"] not in rail_routes:
            continue
        for service_ids, offset in schedule:
            if service_ids is None or trip["service_id"] in service_ids:
                offsets_of_trip.setdefault(trip["trip_id"], []).append(offset)
    keep_trips = set(offsets_of_trip)

    by_trip: dict[str, list[dict[str, str]]] = defaultdict(list)
    for st in stop_times:
        if st["trip_id"] in keep_trips:
            by_trip[st["trip_id"]].append(st)

    patterns: dict[tuple[int, ...], list[tuple[list[int], list[int]]]] = defaultdict(list)
    pattern_names: dict[tuple[int, ...], Counter] = defaultdict(Counter)
    for trip_id, rows in by_trip.items():
        rows.sort(key=lambda r: int(r["stop_sequence"]))
        key = tuple(index[r["stop_id"]] for r in rows)
        pattern_names[key][route_of_trip.get(trip_id, "")] += 1
        base_arr = [parse_time(r["arrival_time"]) for r in rows]
        base_dep = [parse_time(r["departure_time"]) for r in rows]
        for offset in offsets_of_trip[trip_id]:
            patterns[key].append(
                ([a + offset for a in base_arr], [d + offset for d in base_dep])
            )

    pattern_ptr = [0]
    pattern_stops: list[int] = []
    pattern_trip_ptr = [0]
    trip_arr: list[int] = []
    trip_dep: list[int] = []

    routes_of_pattern: list[str] = []
    for key in sorted(patterns):
        # у патерна можуть бути рейси різних ліній — беремо найчастішу
        routes_of_pattern.append(pattern_names[key].most_common(1)[0][0])
        pattern_stops.extend(key)
        pattern_ptr.append(len(pattern_stops))
        runs = sorted(patterns[key], key=lambda ad: ad[1][0])
        for arr, dep in runs:
            trip_arr.extend(arr)
            trip_dep.extend(dep)
        pattern_trip_ptr.append(pattern_trip_ptr[-1] + len(runs))


    return Feed(
        stop_ids=np.array(stop_ids),
        stop_names=np.array(names),
        stop_lats=np.array(lats),
        stop_lons=np.array(lons),
        pattern_ptr=np.array(pattern_ptr, dtype=np.int32),
        pattern_stops=np.array(pattern_stops, dtype=np.int32),
        pattern_trip_ptr=np.array(pattern_trip_ptr, dtype=np.int32),
        trip_arr=np.array(trip_arr, dtype=np.int32),
        trip_dep=np.array(trip_dep, dtype=np.int32),
        transfer_from=np.array([], dtype=np.int32),
        transfer_to=np.array([], dtype=np.int32),
        transfer_time=np.array([], dtype=np.int32),
        pattern_routes=np.array(routes_of_pattern),
    )

def _collapse_to_stations(
    stops: list[dict[str, str]],
) -> tuple[list[str], dict[str, int], list[str], list[float], list[float]]:
    """Звести платформи до станцій.

    У DELFI-фіді кожна платформа — окрема зупинка зі спільним parent_station.
    Для день-трипів платформа не має сенсу: людину цікавить вокзал. Тому
    ключ станції — parent_station, якщо він є, інакше сам stop_id.

    Назви у фіді неузгоджені: батьківський рядок Берліна називається
    "S+U Berlin Hauptbahnhof", хоча всі залізничні платформи — "Berlin Hbf",
    а в Гамбурга батьківського рядка немає взагалі. Тому назва станції — це
    найчастіша назва серед її платформ. Координати — середні по платформах.
    """
    key_of: dict[str, str] = {}
    for row in stops:
        stop_id = row["stop_id"]
        key_of[stop_id] = row.get("parent_station") or stop_id

    name_votes: dict[str, Counter[str]] = defaultdict(Counter)
    coords: dict[str, list[tuple[float, float]]] = defaultdict(list)
    order: list[str] = []
    seen: set[str] = set()

    for row in stops:
        key = key_of[row["stop_id"]]
        if key not in seen:
            seen.add(key)
            order.append(key)
        name_votes[key][row.get("stop_name", "")] += 1
        coords[key].append((float(row["stop_lat"]), float(row["stop_lon"])))

    index = {key: i for i, key in enumerate(order)}
    names = [name_votes[key].most_common(1)[0][0] for key in order]
    lats = [sum(c[0] for c in coords[key]) / len(coords[key]) for key in order]
    lons = [sum(c[1] for c in coords[key]) / len(coords[key]) for key in order]

    # index має відповідати на будь-який stop_id, не лише на ключ станції
    full_index = {stop_id: index[key] for stop_id, key in key_of.items()}
    return order, full_index, names, lats, lons
