"""GTFS zip -> Feed."""

from __future__ import annotations

import csv
import io
import zipfile
from collections import defaultdict
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


def load_gtfs(path: Path, service_ids: set[str] | None = None) -> Feed:
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

    stop_ids = [r["stop_id"] for r in stops]
    index = {sid: i for i, sid in enumerate(stop_ids)}

    rail_routes = {r["route_id"] for r in routes if r["route_type"] in RAIL_ROUTE_TYPES}
    keep_trips = {
        t["trip_id"]
        for t in trips
        if t["route_id"] in rail_routes
        and (service_ids is None or t["service_id"] in service_ids)
    }

    by_trip: dict[str, list[dict[str, str]]] = defaultdict(list)
    for st in stop_times:
        if st["trip_id"] in keep_trips:
            by_trip[st["trip_id"]].append(st)

    patterns: dict[tuple[int, ...], list[tuple[list[int], list[int]]]] = defaultdict(list)
    for rows in by_trip.values():
        rows.sort(key=lambda r: int(r["stop_sequence"]))
        key = tuple(index[r["stop_id"]] for r in rows)
        arr = [parse_time(r["arrival_time"]) for r in rows]
        dep = [parse_time(r["departure_time"]) for r in rows]
        patterns[key].append((arr, dep))

    pattern_ptr = [0]
    pattern_stops: list[int] = []
    pattern_trip_ptr = [0]
    trip_arr: list[int] = []
    trip_dep: list[int] = []

    for key in sorted(patterns):
        pattern_stops.extend(key)
        pattern_ptr.append(len(pattern_stops))
        runs = sorted(patterns[key], key=lambda ad: ad[1][0])
        for arr, dep in runs:
            trip_arr.extend(arr)
            trip_dep.extend(dep)
        pattern_trip_ptr.append(pattern_trip_ptr[-1] + len(runs))

    transfer_from, transfer_to, transfer_time = _build_transfers(stops, index)

    return Feed(
        stop_ids=np.array(stop_ids),
        stop_names=np.array([r.get("stop_name", "") for r in stops]),
        stop_lats=np.array([float(r["stop_lat"]) for r in stops]),
        stop_lons=np.array([float(r["stop_lon"]) for r in stops]),
        pattern_ptr=np.array(pattern_ptr, dtype=np.int32),
        pattern_stops=np.array(pattern_stops, dtype=np.int32),
        pattern_trip_ptr=np.array(pattern_trip_ptr, dtype=np.int32),
        trip_arr=np.array(trip_arr, dtype=np.int32),
        trip_dep=np.array(trip_dep, dtype=np.int32),
        transfer_from=transfer_from,
        transfer_to=transfer_to,
        transfer_time=transfer_time,
    )


def _build_transfers(
    stops: list[dict[str, str]], index: dict[str, int]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Пересадки лише в межах спільного parent_station, фіксовані 5 хвилин."""
    groups: dict[str, list[int]] = defaultdict(list)
    for row in stops:
        parent = row.get("parent_station") or ""
        if parent:
            groups[parent].append(index[row["stop_id"]])

    src: list[int] = []
    dst: list[int] = []
    cost: list[int] = []
    for members in groups.values():
        for a in members:
            for b in members:
                if a != b:
                    src.append(a)
                    dst.append(b)
                    cost.append(MIN_TRANSFER_SECONDS)
    return (
        np.array(src, dtype=np.int32),
        np.array(dst, dtype=np.int32),
        np.array(cost, dtype=np.int32),
    )
