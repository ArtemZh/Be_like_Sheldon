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


MAJOR_LIMIT = 24
MAIN_STATION_MARKERS = ("hbf", "hauptbahnhof")

# Столиці земель — це і є «обласні центри» Німеччини. Їх ставимо на карту
# завжди: за самим лише трафіком у регіональному фіді половина з них не
# проходить (Кіль — 116 рейсів проти 7938 у берлінського Осткройца), і карта
# лишалась би без Штутгарта, зате з Нойсом.
CAPITALS = (
    "berlin",
    "hamburg",
    "münchen",
    "köln",
    "frankfurt",
    "stuttgart",
    "düsseldorf",
    "hannover",
    "bremen",
    "dresden",
    "leipzig",
    "nürnberg",
    "mainz",
    "wiesbaden",
    "saarbrücken",
    "kiel",
    "magdeburg",
    "erfurt",
    "schwerin",
    "potsdam",
)


def _city_of(name: str) -> str:
    """Місто зі станційної назви: перше слово до коми чи пробілу.

    'Berlin Hbf', 'Berlin Gesundbrunnen', 'Berlin, Hbf' -> 'berlin'.
    """
    return name.replace(",", " ").split()[0].casefold() if name.strip() else ""


def _best_stops_by_city(feed: Feed, counts: dict[int, int]) -> dict[str, tuple[int, int]]:
    """Для кожного міста: найзавантаженіший головний вокзал, інакше — станція.

    У DELFI головний вокзал не завжди найзавантаженіший: у Берліні попереду
    Осткройц, у Мюнхені — Ост. Тому спершу шукаємо Hbf, а «просто найбільша
    станція» лишається запасним варіантом для міст без нього.
    """
    main: dict[str, tuple[int, int]] = {}
    any_stop: dict[str, tuple[int, int]] = {}
    for i, trips in counts.items():
        name = str(feed.stop_names[i])
        city = _city_of(name)
        if not city or city in MAIN_STATION_MARKERS:
            continue
        is_main = any(marker in name.casefold() for marker in MAIN_STATION_MARKERS)
        if is_main:
            # серед головних вокзалів міста беремо з найкоротшою назвою:
            # 'Frankfurt (Main) Hauptbahnhof' замість того самого з 'tief',
            # 'Hamburg Hbf' замість 'Hamburg Hbf (S-Bahn)'
            if city not in main or len(name) < len(str(feed.stop_names[main[city][1]])):
                main[city] = (trips, i)
        elif trips > any_stop.get(city, (-1, -1))[0]:
            any_stop[city] = (trips, i)
    return {city: main.get(city) or any_stop[city] for city in {**any_stop, **main}}


def pick_major_stations(
    feed: Feed, limit: int = MAJOR_LIMIT, capitals: tuple[str, ...] = CAPITALS
) -> list[str]:
    """Станції відправлення, позначені на карті.

    Спершу обласні центри — усі, які є у фіді. Далі добираємо найбільші
    міста, поки не набереться `limit`. По одному вокзалу на місто: точок на
    карті мало, і два кружечки на один Берлін нічого не додають.
    """
    best = _best_stops_by_city(feed, stop_trip_counts(feed))

    chosen: list[str] = []
    seen: set[str] = set()
    for city in capitals:
        if city in best and len(chosen) < limit:
            seen.add(city)
            chosen.append(str(feed.stop_ids[best[city][1]]))

    rest = sorted(
        ((trips, city, i) for city, (trips, i) in best.items() if city not in seen),
        key=lambda c: (-c[0], c[1]),
    )
    for trips, city, i in rest:
        if len(chosen) == limit:
            break
        name = str(feed.stop_names[i])
        # добірка поза столицями — лише впізнавані головні вокзали
        if not any(marker in name.casefold() for marker in MAIN_STATION_MARKERS):
            continue
        chosen.append(str(feed.stop_ids[i]))
    return chosen
