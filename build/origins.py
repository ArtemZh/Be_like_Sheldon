"""Вибір головних вокзалів для позначок на карті."""

from __future__ import annotations

from build.feed import Feed

def stop_trip_counts(feed: Feed) -> dict[int, int]:
    """Скільки рейсів обслуговує кожну зупинку."""
    counts: dict[int, int] = {}
    for p in range(feed.n_patterns):
        n_trips = int(feed.pattern_trip_ptr[p + 1]) - int(feed.pattern_trip_ptr[p])
        lo, hi = int(feed.pattern_ptr[p]), int(feed.pattern_ptr[p + 1])
        for stop in feed.pattern_stops[lo:hi]:
            counts[int(stop)] = counts.get(int(stop), 0) + n_trips
    return counts


MAJOR_LIMIT = 15
MAIN_STATION_MARKERS = ("hbf", "hauptbahnhof")


def _city_of(name: str) -> str:
    """Місто зі станційної назви: перше слово до коми чи пробілу.

    'Berlin Hbf', 'Berlin Gesundbrunnen', 'Berlin, Hbf' -> 'berlin'.
    """
    return name.replace(",", " ").split()[0].casefold() if name.strip() else ""


def pick_major_stations(feed: Feed, limit: int = MAJOR_LIMIT) -> list[str]:
    """Головні вокзали — по одному на місто, від найзавантаженішого.

    Це не те саме, що станції відправлення: тих сотні, і половина з них —
    міські платформи S-Bahn. На карті ж потрібні впізнавані точки, тому
    беремо лише те, що зветься Hbf або Hauptbahnhof.
    """
    counts = stop_trip_counts(feed)
    candidates = []
    for i, trips in counts.items():
        name = str(feed.stop_names[i])
        if any(marker in name.casefold() for marker in MAIN_STATION_MARKERS):
            candidates.append((trips, name, i))
    candidates.sort(key=lambda c: (-c[0], c[1]))

    chosen: list[str] = []
    seen_cities: set[str] = set()
    for _, name, i in candidates:
        city = _city_of(name)
        # у фіді трапляється назва просто 'Hauptbahnhof', без міста —
        # на карті така точка нічого не каже
        if not city or city in MAIN_STATION_MARKERS:
            continue
        if city in seen_cities:
            continue
        seen_cities.add(city)
        chosen.append(str(feed.stop_ids[i]))
        if len(chosen) == limit:
            break
    return chosen
