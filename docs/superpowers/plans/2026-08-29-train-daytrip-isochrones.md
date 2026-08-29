# Day-trip Isochrones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Статичний веб-застосунок, що для кожної з ~800 німецьких станцій показує на карті, куди можна з'їздити потягом туди-назад у понеділок (виїзд після 09:00, повернення до 23:00) і скільки корисних годин лишиться на місці.

**Architecture:** Python-збірка офлайн парсить GTFS-фід Deutsche Bahn у компактні numpy-масиви, ганяє RAPTOR у двох напрямках від кожної станції відправлення й пише по одному JSON на станцію — два числа на кожну досяжну станцію призначення (найраніший приїзд, найпізніше відправлення назад). Фронтенд — статика без бекенду: читає цей JSON і рахує `useful_time`, фільтри та контури зон у браузері.

**Tech Stack:** Python 3.13 + numpy + pytest (збірка); vanilla JS + Vite + Vitest + MapLibre GL + turf.js (фронтенд); GitHub Pages (хостинг).

**Спека:** `docs/superpowers/specs/2026-08-29-train-daytrip-isochrones-design.md`

---

## Рішення, зафіксовані цим планом

Спека їх не суперечить, але й не деталізує — фіксуємо тут, щоб не вигадувати під час імплементації:

- **Пересадки**: тільки в межах однієї станції (спільний `parent_station`), мінімум **5 хвилин**. Пішохідних пересадок між різними станціями немає — це узгоджено з «пішохідний роутинг поза межами» у спеці.
- **Максимум пересадок**: 4 (5 раундів RAPTOR). Більше за день туди-назад не має сенсу.
- **Дата**: перший понеділок, повністю покритий `calendar.txt` фіду. Вибирається автоматично, друкується в лог збірки.
- **Backward profile** рахується не окремим алгоритмом, а тим самим RAPTOR на **розвернутому фіді** (порядок зупинок у патерні перевернуто, часи помножено на −1, arrival/departure поміняно місцями). «Найраніший приїзд» у розвернутому фіді = «найпізніше відправлення» в оригінальному.
- **Час** усюди — секунди від півночі сервісного дня; значення > 86400 (нічні рейси) допустимі й не обрізаються.

## File Structure

```
pyproject.toml              залежності й конфіг pytest
build/feed.py               Feed: компактне представлення розкладу, save/load/reverse
build/gtfs_ingest.py        GTFS zip -> Feed
build/raptor.py             RAPTOR: Feed + origin + час -> масив найраніших приїздів
build/daytrip.py            два профілі -> {station: [arrival, departure]}
build/origins.py            вибір ~800 станцій відправлення
build/cli.py                CLI збірки: zip -> data/*.json
tests/conftest.py           фікстурний GTFS-zip (5 станцій, 3 рейси)
tests/test_gtfs_ingest.py
tests/test_feed.py
tests/test_raptor.py
tests/test_daytrip.py
tests/test_origins.py
tests/test_smoke.py         повільний тест на реальному фіді (маркер slow)
web/package.json
web/index.html
web/src/metrics.js          useful_time, фільтр по слайдерах — чисті функції
web/src/metrics.test.js
web/src/grid.js             точки -> сітка 2 км -> контури через turf.isobands
web/src/grid.test.js
web/src/map.js              MapLibre, шари, слайдери, завантаження даних
.github/workflows/pages.yml
```

Межі модулів: `raptor` не знає про день-трипи, `daytrip` не знає про карти, `web/metrics.js` і `web/grid.js` — чисті функції без DOM, `map.js` — єдине місце з DOM і MapLibre.

---

### Task 1: Каркас проєкту

**Files:**
- Create: `pyproject.toml`, `.gitignore`, `build/__init__.py`, `tests/__init__.py`

- [ ] **Step 1: Створити `.gitignore`**

```
.venv/
__pycache__/
*.pyc
.pytest_cache/
build/cache/
gtfs/
web/node_modules/
web/dist/
```

- [ ] **Step 2: Створити `pyproject.toml`**

```toml
[project]
name = "train-daytrip"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = ["numpy>=2.0"]

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[tool.pytest.ini_options]
testpaths = ["tests"]
markers = ["slow: потребує реального GTFS-фіду"]
addopts = "-m 'not slow'"
```

- [ ] **Step 3: Створити порожні `build/__init__.py` і `tests/__init__.py`**

```bash
touch build/__init__.py tests/__init__.py
```

- [ ] **Step 4: Створити venv і встановити залежності**

```bash
python3 -m venv .venv && .venv/bin/pip install -q -e '.[dev]' && .venv/bin/pytest --version
```

Expected: друкує версію pytest (наприклад `pytest 8.x.y`).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: project scaffold"
```

---

### Task 2: Фікстурний GTFS

Маленький штучний фід, на якому перевіряються ingest, raptor і daytrip. Топологія навмисне асиметрична: назад з D є лише один пізній потяг — саме той кейс, заради якого існує проєкт.

**Files:**
- Create: `tests/conftest.py`

Станції: `A` (дім), `B`, `C` (на одній лінії A-B-C), `D` (окрема лінія A-D), `E` (недосяжна).
Рейси (усі в понеділок, час у секундах від півночі — у файлі пишемо `HH:MM:SS`):

| trip | pattern | розклад |
|---|---|---|
| `t_ABC_am` | A→B→C | A 09:30, B 10:00, C 10:30 |
| `t_CBA_pm` | C→B→A | C 18:00, B 18:30, A 19:00 |
| `t_AD_am`  | A→D    | A 10:00, D 12:00 |
| `t_DA_pm`  | D→A    | D 22:30, A 24:30 (тобто 00:30 наступного дня — повернення після 23:00) |

Очікування: B і C — придатні для день-трипу, D — ні (повернення надто пізно), E — недосяжна.

- [ ] **Step 1: Написати `tests/conftest.py`**

```python
import zipfile
from pathlib import Path

import pytest

STOPS = """stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station
A,Aville Hbf,52.5,13.4,0,
B,Beeburg Hbf,52.0,13.0,0,
C,Ceestadt Hbf,51.5,12.6,0,
D,Deeheim Hbf,53.0,10.0,0,
E,Eedorf,48.0,9.0,0,
"""

ROUTES = """route_id,route_short_name,route_type
r_line1,L1,2
r_line2,L2,2
r_bus,BUS,3
"""

TRIPS = """route_id,service_id,trip_id
r_line1,mon,t_ABC_am
r_line1,mon,t_CBA_pm
r_line2,mon,t_AD_am
r_line2,mon,t_DA_pm
r_bus,mon,t_bus
"""

STOP_TIMES = """trip_id,arrival_time,departure_time,stop_id,stop_sequence
t_ABC_am,09:30:00,09:30:00,A,1
t_ABC_am,10:00:00,10:00:00,B,2
t_ABC_am,10:30:00,10:30:00,C,3
t_CBA_pm,18:00:00,18:00:00,C,1
t_CBA_pm,18:30:00,18:30:00,B,2
t_CBA_pm,19:00:00,19:00:00,A,3
t_AD_am,10:00:00,10:00:00,A,1
t_AD_am,12:00:00,12:00:00,D,2
t_DA_pm,22:30:00,22:30:00,D,1
t_DA_pm,24:30:00,24:30:00,A,2
t_bus,09:00:00,09:00:00,A,1
t_bus,09:15:00,09:15:00,E,2
"""

CALENDAR = """service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
mon,1,0,0,0,0,0,0,20260101,20261231
"""


@pytest.fixture
def gtfs_zip(tmp_path: Path) -> Path:
    path = tmp_path / "fixture.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("stops.txt", STOPS)
        z.writestr("routes.txt", ROUTES)
        z.writestr("trips.txt", TRIPS)
        z.writestr("stop_times.txt", STOP_TIMES)
        z.writestr("calendar.txt", CALENDAR)
    return path
```

- [ ] **Step 2: Перевірити, що фікстура створюється**

```bash
.venv/bin/pytest tests/ --collect-only -q
```

Expected: `no tests ran` без помилок імпорту.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: GTFS fixture feed"
```

---

### Task 3: Feed — компактне представлення

`Feed` тримає розклад у пласких numpy-масивах. Патерн — унікальна послідовність зупинок; рейси згруповані по патернах і відсортовані за часом відправлення.

**Files:**
- Create: `build/feed.py`, `tests/test_feed.py`

- [ ] **Step 1: Написати падаючий тест на round-trip save/load**

```python
import numpy as np

from build.feed import Feed


def tiny_feed() -> Feed:
    return Feed(
        stop_ids=np.array(["A", "B"]),
        stop_names=np.array(["Aville", "Beeburg"]),
        stop_lats=np.array([52.5, 52.0]),
        stop_lons=np.array([13.4, 13.0]),
        pattern_ptr=np.array([0, 2], dtype=np.int32),
        pattern_stops=np.array([0, 1], dtype=np.int32),
        pattern_trip_ptr=np.array([0, 1], dtype=np.int32),
        trip_arr=np.array([34200, 36000], dtype=np.int32),
        trip_dep=np.array([34200, 36000], dtype=np.int32),
        transfer_from=np.array([], dtype=np.int32),
        transfer_to=np.array([], dtype=np.int32),
        transfer_time=np.array([], dtype=np.int32),
    )


def test_save_load_roundtrip(tmp_path):
    feed = tiny_feed()
    path = tmp_path / "feed.npz"
    feed.save(path)
    loaded = Feed.load(path)
    assert loaded.stop_ids.tolist() == ["A", "B"]
    assert loaded.trip_dep.tolist() == [34200, 36000]


def test_stop_index_maps_ids_to_positions():
    feed = tiny_feed()
    assert feed.stop_index["B"] == 1
```

- [ ] **Step 2: Запустити — має впасти**

```bash
.venv/bin/pytest tests/test_feed.py -v
```

Expected: FAIL, `ModuleNotFoundError: No module named 'build.feed'`.

- [ ] **Step 3: Написати `build/feed.py`**

```python
"""Компактне представлення GTFS-розкладу для RAPTOR."""

from __future__ import annotations

from dataclasses import dataclass, fields
from functools import cached_property
from pathlib import Path

import numpy as np

MAX_TIME = np.int32(2**31 - 1)


@dataclass
class Feed:
    """Розклад у пласких масивах.

    Патерн — унікальна послідовність зупинок. Зупинки патерна p лежать у
    pattern_stops[pattern_ptr[p]:pattern_ptr[p + 1]]. Рейси патерна p — це
    індекси [pattern_trip_ptr[p], pattern_trip_ptr[p + 1]), відсортовані за
    часом відправлення з першої зупинки. Часи рейсу t лежать у
    trip_arr / trip_dep блоком тієї ж довжини, що й патерн.
    """

    stop_ids: np.ndarray
    stop_names: np.ndarray
    stop_lats: np.ndarray
    stop_lons: np.ndarray
    pattern_ptr: np.ndarray
    pattern_stops: np.ndarray
    pattern_trip_ptr: np.ndarray
    trip_arr: np.ndarray
    trip_dep: np.ndarray
    transfer_from: np.ndarray
    transfer_to: np.ndarray
    transfer_time: np.ndarray

    @property
    def n_stops(self) -> int:
        return len(self.stop_ids)

    @property
    def n_patterns(self) -> int:
        return len(self.pattern_ptr) - 1

    def pattern_length(self, p: int) -> int:
        return int(self.pattern_ptr[p + 1] - self.pattern_ptr[p])

    def trip_slice(self, p: int, trip: int) -> slice:
        """Зріз trip_arr/trip_dep для рейсу trip патерна p."""
        length = self.pattern_length(p)
        offset = int(self.pattern_trip_ptr[p]) * 0
        base = int(self.trip_block_start[trip])
        del offset
        return slice(base, base + length)

    @cached_property
    def trip_block_start(self) -> np.ndarray:
        """Початок блоку часів для кожного рейсу."""
        lengths = np.zeros(int(self.pattern_trip_ptr[-1]), dtype=np.int64)
        for p in range(self.n_patterns):
            lo, hi = int(self.pattern_trip_ptr[p]), int(self.pattern_trip_ptr[p + 1])
            lengths[lo:hi] = self.pattern_length(p)
        starts = np.zeros(len(lengths) + 1, dtype=np.int64)
        np.cumsum(lengths, out=starts[1:])
        return starts

    @cached_property
    def stop_index(self) -> dict[str, int]:
        return {str(s): i for i, s in enumerate(self.stop_ids)}

    @cached_property
    def stop_patterns(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Для кожної зупинки — які патерни її обслуговують і на якій позиції.

        Повертає (ptr, patterns, positions): патерни зупинки s лежать у
        patterns[ptr[s]:ptr[s + 1]].
        """
        pairs: list[list[tuple[int, int]]] = [[] for _ in range(self.n_stops)]
        for p in range(self.n_patterns):
            lo, hi = int(self.pattern_ptr[p]), int(self.pattern_ptr[p + 1])
            for pos, stop in enumerate(self.pattern_stops[lo:hi]):
                pairs[int(stop)].append((p, pos))
        ptr = np.zeros(self.n_stops + 1, dtype=np.int32)
        flat_pat: list[int] = []
        flat_pos: list[int] = []
        for s, entries in enumerate(pairs):
            ptr[s + 1] = ptr[s] + len(entries)
            for p, pos in entries:
                flat_pat.append(p)
                flat_pos.append(pos)
        return ptr, np.array(flat_pat, dtype=np.int32), np.array(flat_pos, dtype=np.int32)

    @cached_property
    def transfers_by_stop(self) -> dict[int, list[tuple[int, int]]]:
        out: dict[int, list[tuple[int, int]]] = {}
        for f, t, dt in zip(self.transfer_from, self.transfer_to, self.transfer_time):
            out.setdefault(int(f), []).append((int(t), int(dt)))
        return out

    def save(self, path: Path) -> None:
        np.savez_compressed(path, **{f.name: getattr(self, f.name) for f in fields(self)})

    @classmethod
    def load(cls, path: Path) -> Feed:
        with np.load(path, allow_pickle=False) as data:
            return cls(**{f.name: data[f.name] for f in fields(cls)})

    def reversed(self) -> Feed:
        """Фід із розвернутим часом.

        Порядок зупинок у кожному патерні перевернуто, часи помножено на −1,
        arrival і departure поміняно місцями. Найраніший приїзд у цьому фіді
        відповідає найпізнішому відправленню в оригінальному.
        """
        new_pattern_stops = np.empty_like(self.pattern_stops)
        for p in range(self.n_patterns):
            lo, hi = int(self.pattern_ptr[p]), int(self.pattern_ptr[p + 1])
            new_pattern_stops[lo:hi] = self.pattern_stops[lo:hi][::-1]

        new_arr = np.empty_like(self.trip_arr)
        new_dep = np.empty_like(self.trip_dep)
        for p in range(self.n_patterns):
            for trip in range(int(self.pattern_trip_ptr[p]), int(self.pattern_trip_ptr[p + 1])):
                sl = self.trip_slice(p, trip)
                new_arr[sl] = -self.trip_dep[sl][::-1]
                new_dep[sl] = -self.trip_arr[sl][::-1]

        reversed_feed = Feed(
            stop_ids=self.stop_ids,
            stop_names=self.stop_names,
            stop_lats=self.stop_lats,
            stop_lons=self.stop_lons,
            pattern_ptr=self.pattern_ptr,
            pattern_stops=new_pattern_stops,
            pattern_trip_ptr=self.pattern_trip_ptr,
            trip_arr=new_arr,
            trip_dep=new_dep,
            transfer_from=self.transfer_to,
            transfer_to=self.transfer_from,
            transfer_time=self.transfer_time,
        )
        return reversed_feed.with_sorted_trips()

    def with_sorted_trips(self) -> Feed:
        """Пересортувати рейси кожного патерна за часом відправлення."""
        new_arr = np.empty_like(self.trip_arr)
        new_dep = np.empty_like(self.trip_dep)
        for p in range(self.n_patterns):
            lo, hi = int(self.pattern_trip_ptr[p]), int(self.pattern_trip_ptr[p + 1])
            trips = list(range(lo, hi))
            trips.sort(key=lambda t: int(self.trip_dep[self.trip_slice(p, t)][0]))
            for new_pos, old_trip in enumerate(trips):
                src = self.trip_slice(p, old_trip)
                dst = self.trip_slice(p, lo + new_pos)
                new_arr[dst] = self.trip_arr[src]
                new_dep[dst] = self.trip_dep[src]
        return Feed(
            stop_ids=self.stop_ids,
            stop_names=self.stop_names,
            stop_lats=self.stop_lats,
            stop_lons=self.stop_lons,
            pattern_ptr=self.pattern_ptr,
            pattern_stops=self.pattern_stops,
            pattern_trip_ptr=self.pattern_trip_ptr,
            trip_arr=new_arr,
            trip_dep=new_dep,
            transfer_from=self.transfer_from,
            transfer_to=self.transfer_to,
            transfer_time=self.transfer_time,
        )
```

Прибрати мертві рядки в `trip_slice` (`offset`, `del offset`) — вони лишились від чернетки; метод має бути таким:

```python
    def trip_slice(self, p: int, trip: int) -> slice:
        """Зріз trip_arr/trip_dep для рейсу trip патерна p."""
        base = int(self.trip_block_start[trip])
        return slice(base, base + self.pattern_length(p))
```

- [ ] **Step 4: Запустити тести — мають пройти**

```bash
.venv/bin/pytest tests/test_feed.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: compact Feed representation"
```

---

### Task 4: Тест на `Feed.reversed()`

**Files:**
- Modify: `tests/test_feed.py`

- [ ] **Step 1: Дописати падаючий тест**

```python
def test_reversed_flips_stop_order_and_negates_times():
    feed = Feed(
        stop_ids=np.array(["A", "B", "C"]),
        stop_names=np.array(["A", "B", "C"]),
        stop_lats=np.array([1.0, 2.0, 3.0]),
        stop_lons=np.array([1.0, 2.0, 3.0]),
        pattern_ptr=np.array([0, 3], dtype=np.int32),
        pattern_stops=np.array([0, 1, 2], dtype=np.int32),
        pattern_trip_ptr=np.array([0, 1], dtype=np.int32),
        trip_arr=np.array([100, 200, 300], dtype=np.int32),
        trip_dep=np.array([110, 210, 310], dtype=np.int32),
        transfer_from=np.array([], dtype=np.int32),
        transfer_to=np.array([], dtype=np.int32),
        transfer_time=np.array([], dtype=np.int32),
    )
    rev = feed.reversed()
    assert rev.pattern_stops.tolist() == [2, 1, 0]
    # приїзд у розвернутому фіді = −відправлення в оригінальному, у зворотному порядку
    assert rev.trip_arr.tolist() == [-310, -210, -110]
    assert rev.trip_dep.tolist() == [-300, -200, -100]
```

- [ ] **Step 2: Запустити**

```bash
.venv/bin/pytest tests/test_feed.py -v
```

Expected: 3 passed (реалізація вже є з Task 3; якщо падає — виправити `reversed()`).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: Feed.reversed time inversion"
```

---

### Task 5: GTFS ingest

**Files:**
- Create: `build/gtfs_ingest.py`, `tests/test_gtfs_ingest.py`

- [ ] **Step 1: Написати падаючий тест**

```python
from build.gtfs_ingest import load_gtfs


def test_keeps_only_rail_routes(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    # E обслуговується лише автобусом, тому зупинка лишається, але патернів у неї немає
    ptr, patterns, _ = feed.stop_patterns
    e = feed.stop_index["E"]
    assert ptr[e + 1] - ptr[e] == 0


def test_builds_patterns_from_stop_sequences(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert feed.n_patterns == 4  # A-B-C, C-B-A, A-D, D-A


def test_parses_times_past_midnight(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert feed.trip_dep.max() >= 24 * 3600  # рейс D->A прибуває о 24:30


def test_missing_file_raises_clear_error(tmp_path):
    import zipfile

    broken = tmp_path / "broken.zip"
    with zipfile.ZipFile(broken, "w") as z:
        z.writestr("stops.txt", "stop_id\nA\n")
    try:
        load_gtfs(broken)
    except ValueError as exc:
        assert "routes.txt" in str(exc)
    else:
        raise AssertionError("очікувалась ValueError")
```

- [ ] **Step 2: Запустити — має впасти**

```bash
.venv/bin/pytest tests/test_gtfs_ingest.py -v
```

Expected: FAIL, `ModuleNotFoundError: No module named 'build.gtfs_ingest'`.

- [ ] **Step 3: Написати `build/gtfs_ingest.py`**

```python
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
    if name not in z.namelist():
        raise ValueError(f"GTFS-фід не містить {name}; очікувались файли: {', '.join(REQUIRED_FILES)}")
    with z.open(name) as fh:
        text = io.TextIOWrapper(fh, encoding="utf-8-sig")
        return list(csv.DictReader(text))


def parse_time(value: str) -> int:
    """'25:30:00' -> 91800. GTFS дозволяє години >= 24."""
    h, m, s = (int(part) for part in value.split(":"))
    return h * 3600 + m * 60 + s


def load_gtfs(path: Path, service_ids: set[str] | None = None) -> Feed:
    with zipfile.ZipFile(path) as z:
        for name in REQUIRED_FILES:
            if name not in z.namelist():
                raise ValueError(
                    f"GTFS-фід не містить {name}; очікувались файли: {', '.join(REQUIRED_FILES)}"
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
        if t["route_id"] in rail_routes and (service_ids is None or t["service_id"] in service_ids)
    }

    by_trip: dict[str, list[dict[str, str]]] = defaultdict(list)
    for st in stop_times:
        if st["trip_id"] in keep_trips:
            by_trip[st["trip_id"]].append(st)

    # групуємо рейси по патернах (однакова послідовність зупинок)
    patterns: dict[tuple[int, ...], list[tuple[list[int], list[int]]]] = defaultdict(list)
    for trip_id, rows in by_trip.items():
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
```

- [ ] **Step 4: Запустити тести**

```bash
.venv/bin/pytest tests/test_gtfs_ingest.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: GTFS ingest with rail filtering and pattern grouping"
```

---

### Task 6: Вибір сервісного дня

**Files:**
- Create: `build/calendar_pick.py`, `tests/test_calendar_pick.py`

- [ ] **Step 1: Написати падаючий тест**

```python
from build.calendar_pick import monday_service_ids


def test_picks_services_running_on_monday(gtfs_zip):
    service_ids, date = monday_service_ids(gtfs_zip)
    assert service_ids == {"mon"}
    assert date.weekday() == 0


def test_raises_when_no_monday_service(tmp_path):
    import zipfile

    path = tmp_path / "sunday_only.zip"
    calendar = (
        "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,"
        "start_date,end_date\nsun,0,0,0,0,0,0,1,20260101,20261231\n"
    )
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("calendar.txt", calendar)
    try:
        monday_service_ids(path)
    except ValueError as exc:
        assert "понеділок" in str(exc)
    else:
        raise AssertionError("очікувалась ValueError")
```

- [ ] **Step 2: Запустити — має впасти**

```bash
.venv/bin/pytest tests/test_calendar_pick.py -v
```

Expected: FAIL, `ModuleNotFoundError`.

- [ ] **Step 3: Написати `build/calendar_pick.py`**

```python
"""Вибір сервісного понеділка з calendar.txt."""

from __future__ import annotations

import csv
import datetime as dt
import io
import zipfile
from pathlib import Path


def monday_service_ids(path: Path) -> tuple[set[str], dt.date]:
    """Повертає service_id, що їздять у понеділок, і саму дату.

    Береться перший понеділок, покритий діапазоном найбільшої кількості сервісів.
    """
    with zipfile.ZipFile(path) as z:
        if "calendar.txt" not in z.namelist():
            raise ValueError("GTFS-фід не містить calendar.txt")
        with z.open("calendar.txt") as fh:
            rows = list(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig")))

    monday_rows = [r for r in rows if r["monday"] == "1"]
    if not monday_rows:
        raise ValueError("у calendar.txt немає жодного сервісу, що їздить у понеділок")

    starts = [dt.datetime.strptime(r["start_date"], "%Y%m%d").date() for r in monday_rows]
    ends = [dt.datetime.strptime(r["end_date"], "%Y%m%d").date() for r in monday_rows]
    latest_start, earliest_end = max(starts), min(ends)

    date = latest_start
    while date.weekday() != 0:
        date += dt.timedelta(days=1)
    if date > earliest_end:
        # діапазони не перетинаються — беремо понеділок від найранішого старту
        date = min(starts)
        while date.weekday() != 0:
            date += dt.timedelta(days=1)

    active = {
        r["service_id"]
        for r in monday_rows
        if dt.datetime.strptime(r["start_date"], "%Y%m%d").date()
        <= date
        <= dt.datetime.strptime(r["end_date"], "%Y%m%d").date()
    }
    return active, date
```

- [ ] **Step 4: Запустити тести**

```bash
.venv/bin/pytest tests/test_calendar_pick.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: pick Monday service ids from calendar.txt"
```

---

### Task 7: RAPTOR

**Files:**
- Create: `build/raptor.py`, `tests/test_raptor.py`

- [ ] **Step 1: Написати падаючий тест**

```python
import numpy as np

from build.gtfs_ingest import load_gtfs
from build.raptor import UNREACHABLE, earliest_arrivals


def test_direct_ride(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    times = earliest_arrivals(feed, feed.stop_index["A"], departure_after=9 * 3600)
    assert times[feed.stop_index["B"]] == 10 * 3600
    assert times[feed.stop_index["C"]] == 10 * 3600 + 1800


def test_bus_only_stop_unreachable(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    times = earliest_arrivals(feed, feed.stop_index["A"], departure_after=9 * 3600)
    assert times[feed.stop_index["E"]] == UNREACHABLE


def test_departure_cutoff_excludes_earlier_trips(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    times = earliest_arrivals(feed, feed.stop_index["A"], departure_after=11 * 3600)
    # єдиний потяг A->D відходить о 10:00, тобто після відсічки нічого немає
    assert times[feed.stop_index["D"]] == UNREACHABLE


def test_origin_arrival_is_departure_time(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    origin = feed.stop_index["A"]
    times = earliest_arrivals(feed, origin, departure_after=9 * 3600)
    assert times[origin] == 9 * 3600


def test_reversed_feed_gives_latest_departure(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    rev = feed.reversed()
    home = feed.stop_index["A"]
    # «приїзд додому не пізніше 23:00» -> у розвернутому часі це відсічка −23:00
    times = earliest_arrivals(rev, home, departure_after=-23 * 3600)
    latest_dep_from_c = -int(times[feed.stop_index["C"]])
    assert latest_dep_from_c == 18 * 3600  # єдиний потяг C->A о 18:00
```

- [ ] **Step 2: Запустити — має впасти**

```bash
.venv/bin/pytest tests/test_raptor.py -v
```

Expected: FAIL, `ModuleNotFoundError: No module named 'build.raptor'`.

- [ ] **Step 3: Написати `build/raptor.py`**

```python
"""RAPTOR: найраніші приїзди від однієї станції."""

from __future__ import annotations

import numpy as np

from build.feed import Feed

UNREACHABLE = np.iinfo(np.int32).max
MAX_ROUNDS = 5  # до 4 пересадок


def earliest_arrivals(feed: Feed, origin: int, departure_after: int, max_rounds: int = MAX_ROUNDS) -> np.ndarray:
    """Найраніший час приїзду в кожну зупинку.

    Працює і на розвернутому фіді: там «приїзд» означає «−відправлення»,
    а departure_after — це −(дедлайн повернення).
    """
    best = np.full(feed.n_stops, UNREACHABLE, dtype=np.int64)
    best[origin] = departure_after
    marked = {origin}
    stop_ptr, stop_pat, stop_pos = feed.stop_patterns

    for _ in range(max_rounds):
        # які патерни зачепити і з якої найранішої позиції
        queue: dict[int, int] = {}
        for stop in marked:
            for i in range(int(stop_ptr[stop]), int(stop_ptr[stop + 1])):
                pattern, pos = int(stop_pat[i]), int(stop_pos[i])
                if pattern not in queue or pos < queue[pattern]:
                    queue[pattern] = pos

        improved: set[int] = set()
        for pattern, start_pos in queue.items():
            improved |= _scan_pattern(feed, pattern, start_pos, best)

        improved |= _apply_transfers(feed, improved, best)

        if not improved:
            break
        marked = improved

    return best


def _scan_pattern(feed: Feed, pattern: int, start_pos: int, best: np.ndarray) -> set[int]:
    """Проїхати патерн, підхопивши найраніший придатний рейс."""
    length = feed.pattern_length(pattern)
    lo = int(feed.pattern_ptr[pattern])
    stops = feed.pattern_stops[lo : lo + length]
    trip_lo = int(feed.pattern_trip_ptr[pattern])
    trip_hi = int(feed.pattern_trip_ptr[pattern + 1])

    improved: set[int] = set()
    current_trip: int | None = None

    for pos in range(start_pos, length):
        stop = int(stops[pos])

        if current_trip is not None:
            arr = int(feed.trip_arr[feed.trip_slice(pattern, current_trip)][pos])
            if arr < best[stop]:
                best[stop] = arr
                improved.add(stop)

        # чи можна тут сісти на щось раніше
        if best[stop] < UNREACHABLE:
            boardable = _first_trip_after(feed, pattern, pos, int(best[stop]), trip_lo, trip_hi)
            if boardable is not None and (current_trip is None or boardable < current_trip):
                current_trip = boardable

    return improved


def _first_trip_after(
    feed: Feed, pattern: int, pos: int, time: int, trip_lo: int, trip_hi: int
) -> int | None:
    """Перший рейс патерна, що відходить із позиції pos не раніше за time."""
    for trip in range(trip_lo, trip_hi):
        dep = int(feed.trip_dep[feed.trip_slice(pattern, trip)][pos])
        if dep >= time:
            return trip
    return None


def _apply_transfers(feed: Feed, improved: set[int], best: np.ndarray) -> set[int]:
    extra: set[int] = set()
    for stop in list(improved):
        for target, cost in feed.transfers_by_stop.get(stop, ()):
            candidate = int(best[stop]) + cost
            if candidate < best[target]:
                best[target] = candidate
                extra.add(target)
    return extra
```

- [ ] **Step 4: Запустити тести**

```bash
.venv/bin/pytest tests/test_raptor.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: RAPTOR earliest-arrival profile"
```

---

### Task 8: daytrip — злиття двох профілів

**Files:**
- Create: `build/daytrip.py`, `tests/test_daytrip.py`

- [ ] **Step 1: Написати падаючий тест**

```python
from build.daytrip import DEPART_AFTER, RETURN_BY, day_trip_windows
from build.gtfs_ingest import load_gtfs


def test_reachable_station_has_arrival_and_departure(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    windows = day_trip_windows(feed, "A")
    assert windows["C"] == [10 * 3600 + 1800, 18 * 3600]


def test_station_without_return_is_excluded(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    windows = day_trip_windows(feed, "A")
    # D досяжна вранці, але єдиний потяг назад приїжджає о 00:30 — після 23:00
    assert "D" not in windows


def test_unreachable_station_is_excluded(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    windows = day_trip_windows(feed, "A")
    assert "E" not in windows


def test_origin_itself_is_excluded(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    windows = day_trip_windows(feed, "A")
    assert "A" not in windows


def test_defaults_match_spec():
    assert DEPART_AFTER == 9 * 3600
    assert RETURN_BY == 23 * 3600
```

- [ ] **Step 2: Запустити — має впасти**

```bash
.venv/bin/pytest tests/test_daytrip.py -v
```

Expected: FAIL, `ModuleNotFoundError: No module named 'build.daytrip'`.

- [ ] **Step 3: Написати `build/daytrip.py`**

```python
"""Злиття forward і backward профілів у вікно перебування."""

from __future__ import annotations

from build.feed import Feed
from build.raptor import UNREACHABLE, earliest_arrivals

DEPART_AFTER = 9 * 3600
RETURN_BY = 23 * 3600


def day_trip_windows(
    feed: Feed,
    origin_stop_id: str,
    depart_after: int = DEPART_AFTER,
    return_by: int = RETURN_BY,
    reversed_feed: Feed | None = None,
) -> dict[str, list[int]]:
    """{stop_id: [найраніший приїзд, найпізніше відправлення назад]}.

    Станція потрапляє в результат, лише якщо досяжна в обидва боки й
    відправлення назад не раніше за приїзд. Фільтрації по min_stay чи
    overhead тут немає — це робота фронтенду.

    reversed_feed можна передати наперед порахованим: він однаковий для всіх
    станцій відправлення, а будувати його дорого.
    """
    origin = feed.stop_index[origin_stop_id]
    forward = earliest_arrivals(feed, origin, depart_after)

    rev = reversed_feed if reversed_feed is not None else feed.reversed()
    backward = earliest_arrivals(rev, origin, -return_by)

    out: dict[str, list[int]] = {}
    for i, stop_id in enumerate(feed.stop_ids):
        if i == origin:
            continue
        arrival = int(forward[i])
        if arrival >= UNREACHABLE:
            continue
        if int(backward[i]) >= UNREACHABLE:
            continue
        latest_departure = -int(backward[i])
        if latest_departure < arrival:
            continue
        out[str(stop_id)] = [arrival, latest_departure]
    return out
```

- [ ] **Step 4: Запустити тести**

```bash
.venv/bin/pytest tests/test_daytrip.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: day-trip window merging"
```

---

### Task 9: Вибір 800 станцій відправлення

Ранжуємо станції за кількістю рейсів, що їх обслуговують, і беремо топ-800. Це грубий, але правильний проксі «місто, де людина живе»: полустанок у полі має два рейси на день.

**Files:**
- Create: `build/origins.py`, `tests/test_origins.py`

- [ ] **Step 1: Написати падаючий тест**

```python
from build.gtfs_ingest import load_gtfs
from build.origins import pick_origins


def test_returns_busiest_stops_first(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    origins = pick_origins(feed, limit=2)
    assert origins[0] == "A"  # A обслуговується чотирма рейсами


def test_excludes_stops_without_rail_service(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert "E" not in pick_origins(feed, limit=10)


def test_respects_limit(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert len(pick_origins(feed, limit=2)) == 2
```

- [ ] **Step 2: Запустити — має впасти**

```bash
.venv/bin/pytest tests/test_origins.py -v
```

Expected: FAIL, `ModuleNotFoundError: No module named 'build.origins'`.

- [ ] **Step 3: Написати `build/origins.py`**

```python
"""Вибір станцій відправлення."""

from __future__ import annotations

from build.feed import Feed

DEFAULT_LIMIT = 800


def stop_trip_counts(feed: Feed) -> dict[int, int]:
    """Скільки рейсів обслуговує кожну зупинку."""
    counts: dict[int, int] = {}
    for p in range(feed.n_patterns):
        n_trips = int(feed.pattern_trip_ptr[p + 1]) - int(feed.pattern_trip_ptr[p])
        lo, hi = int(feed.pattern_ptr[p]), int(feed.pattern_ptr[p + 1])
        for stop in feed.pattern_stops[lo:hi]:
            counts[int(stop)] = counts.get(int(stop), 0) + n_trips
    return counts


def pick_origins(feed: Feed, limit: int = DEFAULT_LIMIT) -> list[str]:
    """Топ-limit зупинок за кількістю рейсів, від найзавантаженішої."""
    counts = stop_trip_counts(feed)
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], str(feed.stop_ids[kv[0]])))
    return [str(feed.stop_ids[i]) for i, _ in ranked[:limit]]
```

- [ ] **Step 4: Запустити тести**

```bash
.venv/bin/pytest tests/test_origins.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: origin station selection by service frequency"
```

---

### Task 10: CLI збірки

**Files:**
- Create: `build/cli.py`, `tests/test_cli.py`

Пише два види файлів:
- `web/public/data/stations.json` — координати й назви всіх станцій + список origin-ів
- `web/public/data/origins/{stop_id}.json` — вікна для однієї станції відправлення

- [ ] **Step 1: Написати падаючий тест**

```python
import json

from build.cli import build_all


def test_writes_stations_index_and_per_origin_files(gtfs_zip, tmp_path):
    build_all(gtfs_zip, tmp_path, limit=2)

    index = json.loads((tmp_path / "stations.json").read_text())
    assert "A" in index["origins"]
    assert index["stations"]["A"]["name"] == "Aville Hbf"
    assert index["stations"]["A"]["lat"] == 52.5

    payload = json.loads((tmp_path / "origins" / "A.json").read_text())
    assert payload["origin"] == "A"
    assert payload["stations"]["C"] == [37800, 64800]


def test_index_contains_only_stations_used_in_results(gtfs_zip, tmp_path):
    build_all(gtfs_zip, tmp_path, limit=2)
    index = json.loads((tmp_path / "stations.json").read_text())
    assert "E" not in index["stations"]  # автобусна зупинка нікуди не входить
```

- [ ] **Step 2: Запустити — має впасти**

```bash
.venv/bin/pytest tests/test_cli.py -v
```

Expected: FAIL, `ModuleNotFoundError: No module named 'build.cli'`.

- [ ] **Step 3: Написати `build/cli.py`**

```python
"""CLI збірки: GTFS zip -> JSON для фронтенду."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from build.calendar_pick import monday_service_ids
from build.daytrip import DEPART_AFTER, RETURN_BY, day_trip_windows
from build.gtfs_ingest import load_gtfs
from build.origins import DEFAULT_LIMIT, pick_origins


def build_all(gtfs_path: Path, out_dir: Path, limit: int = DEFAULT_LIMIT) -> None:
    service_ids, date = monday_service_ids(gtfs_path)
    print(f"сервісний понеділок: {date} ({len(service_ids)} service_id)", file=sys.stderr)

    feed = load_gtfs(gtfs_path, service_ids=service_ids)
    print(f"{feed.n_stops} зупинок, {feed.n_patterns} патернів", file=sys.stderr)

    reversed_feed = feed.reversed()
    origins = pick_origins(feed, limit=limit)

    origins_dir = out_dir / "origins"
    origins_dir.mkdir(parents=True, exist_ok=True)

    used: set[str] = set()
    for n, origin in enumerate(origins, 1):
        windows = day_trip_windows(
            feed, origin, DEPART_AFTER, RETURN_BY, reversed_feed=reversed_feed
        )
        (origins_dir / f"{origin}.json").write_text(
            json.dumps({"origin": origin, "stations": windows}, separators=(",", ":"))
        )
        used.add(origin)
        used.update(windows)
        if n % 50 == 0:
            print(f"  {n}/{len(origins)}", file=sys.stderr)

    stations = {
        str(sid): {
            "name": str(feed.stop_names[i]),
            "lat": round(float(feed.stop_lats[i]), 5),
            "lon": round(float(feed.stop_lons[i]), 5),
        }
        for i, sid in enumerate(feed.stop_ids)
        if str(sid) in used
    }
    (out_dir / "stations.json").write_text(
        json.dumps(
            {
                "date": date.isoformat(),
                "depart_after": DEPART_AFTER,
                "return_by": RETURN_BY,
                "origins": origins,
                "stations": stations,
            },
            separators=(",", ":"),
        )
    )
    print(f"готово: {len(origins)} origin-ів, {len(stations)} станцій", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="Зібрати day-trip дані з GTFS-фіду")
    parser.add_argument("gtfs", type=Path, help="шлях до GTFS zip")
    parser.add_argument("--out", type=Path, default=Path("web/public/data"))
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    args = parser.parse_args()
    build_all(args.gtfs, args.out, args.limit)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Запустити тести**

```bash
.venv/bin/pytest tests/test_cli.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Прогнати всі python-тести**

```bash
.venv/bin/pytest -v
```

Expected: усі passed, жоден не skipped окрім позначених `slow`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: build CLI producing per-origin JSON"
```

---

### Task 11: Smoke-тест на реальному фіді

**Files:**
- Create: `tests/test_smoke.py`, `README.md`

- [ ] **Step 1: Написати `tests/test_smoke.py`**

```python
"""Повільний тест на справжньому фіді DB.

Потребує gtfs/db.zip. Запуск: .venv/bin/pytest -m slow
"""

from pathlib import Path

import pytest

from build.calendar_pick import monday_service_ids
from build.daytrip import day_trip_windows
from build.gtfs_ingest import load_gtfs

FEED = Path("gtfs/db.zip")
BERLIN_HBF = "8011160"


@pytest.mark.slow
def test_berlin_hbf_reaches_many_stations():
    if not FEED.exists():
        pytest.skip("немає gtfs/db.zip — див. README")
    service_ids, _ = monday_service_ids(FEED)
    feed = load_gtfs(FEED, service_ids=service_ids)
    windows = day_trip_windows(feed, BERLIN_HBF)
    assert len(windows) > 100
    for arrival, departure in windows.values():
        assert departure >= arrival
```

- [ ] **Step 2: Написати `README.md`**

````markdown
# Куди доїду за день

Куди можна з'їздити потягом по Німеччині туди-назад у понеділок
(виїзд після 09:00, повернення до 23:00) — і скільки корисних годин
лишиться на місці.

## Збірка даних

1. Завантажити GTFS-фід Deutsche Bahn у `gtfs/db.zip`
   (джерело: https://gtfs.de/en/feeds/de_full/).
2. Створити оточення й зібрати:

```bash
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/python -m build.cli gtfs/db.zip --out web/public/data
```

Збірка займає десятки хвилин і пише ~800 файлів у `web/public/data/origins/`.

## Тести

```bash
.venv/bin/pytest              # швидкі, на фікстурному фіді
.venv/bin/pytest -m slow      # на справжньому фіді, потребує gtfs/db.zip
```

## Фронтенд

```bash
cd web && npm install && npm run dev
```
````

- [ ] **Step 3: Перевірити, що slow-тест коректно пропускається**

```bash
.venv/bin/pytest -m slow -v
```

Expected: `1 skipped` (бо `gtfs/db.zip` ще немає).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: smoke test on real feed + README"
```

---

### Task 12: Фронтенд — каркас і метрики

**Files:**
- Create: `web/package.json`, `web/src/metrics.js`, `web/src/metrics.test.js`

- [ ] **Step 1: Створити `web/package.json`**

```json
{
  "name": "train-daytrip-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@turf/turf": "^7.1.0",
    "maplibre-gl": "^5.0.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Встановити залежності**

```bash
cd web && npm install
```

Expected: `node_modules` створено, без помилок.

- [ ] **Step 3: Написати падаючий тест `web/src/metrics.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { usefulTime, filterStations, formatHours } from './metrics.js';

describe('usefulTime', () => {
  it('віднімає overhead від вікна перебування', () => {
    // приїзд 10:30, від'їзд 18:00, overhead 1 год -> 6.5 год
    expect(usefulTime([37800, 64800], 3600)).toBe(23400);
  });

  it('може бути відʼємним, якщо вікно коротше за overhead', () => {
    expect(usefulTime([36000, 37800], 3600)).toBe(-1800);
  });
});

describe('filterStations', () => {
  const windows = {
    B: [36000, 66600], // вікно 8.5 год
    C: [37800, 64800], // вікно 7.5 год
    F: [36000, 37800], // вікно 0.5 год
  };

  it('лишає лише станції з достатнім корисним часом', () => {
    const result = filterStations(windows, { minStay: 4 * 3600, overhead: 3600 });
    expect(Object.keys(result).sort()).toEqual(['B', 'C']);
  });

  it('віддає корисний час, а не сире вікно', () => {
    const result = filterStations(windows, { minStay: 0, overhead: 3600 });
    expect(result.B.useful).toBe(27000);
    expect(result.B.window).toEqual([36000, 66600]);
  });

  it('порожній результат, коли нічого не проходить', () => {
    expect(filterStations(windows, { minStay: 12 * 3600, overhead: 3600 })).toEqual({});
  });
});

describe('formatHours', () => {
  it('форматує секунди як години й хвилини', () => {
    expect(formatHours(23400)).toBe('6 год 30 хв');
    expect(formatHours(3600)).toBe('1 год');
  });
});
```

- [ ] **Step 4: Запустити — має впасти**

```bash
cd web && npm test
```

Expected: FAIL, `Failed to resolve import "./metrics.js"`.

- [ ] **Step 5: Написати `web/src/metrics.js`**

```js
/**
 * Арифметика день-трипу. Чисті функції, без DOM і без карти.
 *
 * Вікно станції — пара [найраніший приїзд, найпізніше відправлення назад]
 * у секундах від півночі, як його порахувала збірка.
 */

/** Корисний час на місці: вікно мінус накладні витрати (вокзал, кава, хотдог). */
export function usefulTime(window, overhead) {
  const [arrival, departure] = window;
  return departure - arrival - overhead;
}

/**
 * Відфільтрувати станції за слайдерами.
 * @returns {Record<string, {window: number[], useful: number}>}
 */
export function filterStations(windows, { minStay, overhead }) {
  const out = {};
  for (const [stopId, window] of Object.entries(windows)) {
    const useful = usefulTime(window, overhead);
    if (useful >= minStay) {
      out[stopId] = { window, useful };
    }
  }
  return out;
}

/** 23400 -> "6 год 30 хв" */
export function formatHours(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (minutes === 0) return `${hours} год`;
  return `${hours} год ${minutes} хв`;
}
```

- [ ] **Step 6: Запустити тести**

```bash
cd web && npm test
```

Expected: 6 passed.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): day-trip metrics as pure functions"
```

---

### Task 13: Фронтенд — сітка й контури зон

**Files:**
- Create: `web/src/grid.js`, `web/src/grid.test.js`

Кожна станція «фарбує» комірки сітки навколо себе, з пішохідним штрафом: що далі комірка від станції, то менше корисного часу лишається. Комірка бере максимум по всіх станціях.

- [ ] **Step 1: Написати падаючий тест `web/src/grid.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { walkPenalty, buildGrid, buildZones } from './grid.js';

describe('walkPenalty', () => {
  it('нуль у самій станції', () => {
    expect(walkPenalty(0)).toBe(0);
  });

  it('пішки 5 км/год, туди й назад', () => {
    // 2.5 км в один бік = 30 хв пішки, туди-назад = 3600 с
    expect(walkPenalty(2.5)).toBeCloseTo(3600, 0);
  });
});

describe('buildGrid', () => {
  const points = [{ lat: 52.5, lon: 13.4, useful: 7200 }];

  it('комірка в станції отримує повний корисний час', () => {
    const cells = buildGrid(points, { cellKm: 2, radiusKm: 4 });
    const best = Math.max(...cells.map((c) => c.value));
    expect(best).toBeCloseTo(7200, -2);
  });

  it('віддалені комірки отримують менше', () => {
    const cells = buildGrid(points, { cellKm: 2, radiusKm: 4 });
    const far = cells.filter((c) => c.value < 7200);
    expect(far.length).toBeGreaterThan(0);
  });

  it('порожній вхід дає порожню сітку', () => {
    expect(buildGrid([], { cellKm: 2, radiusKm: 4 })).toEqual([]);
  });
});

describe('buildZones', () => {
  it('повертає FeatureCollection', () => {
    const points = [{ lat: 52.5, lon: 13.4, useful: 7200 }];
    const zones = buildZones(points, [3600, 7200]);
    expect(zones.type).toBe('FeatureCollection');
  });

  it('порожній вхід дає порожню колекцію', () => {
    expect(buildZones([], [3600]).features).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустити — має впасти**

```bash
cd web && npm test
```

Expected: FAIL, `Failed to resolve import "./grid.js"`.

- [ ] **Step 3: Написати `web/src/grid.js`**

```js
/**
 * Точки станцій -> сітка -> контури зон.
 *
 * Зони приблизні: потяг зупиняється тільки на станціях, але навколо станції
 * є пішохідна доступність. Що далі від станції, то більше часу зʼїдає дорога
 * пішки — це й є walkPenalty.
 */

import { featureCollection } from '@turf/helpers';
import isobands from '@turf/isobands';
import interpolate from '@turf/interpolate';

const WALK_KMH = 5;
const KM_PER_DEG_LAT = 111.32;

/** Скільки секунд зʼїдає дорога пішки на distanceKm в один бік — рахуємо туди й назад. */
export function walkPenalty(distanceKm) {
  return (distanceKm / WALK_KMH) * 3600 * 2;
}

function kmPerDegLon(lat) {
  return KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/**
 * Побудувати сітку комірок зі значенням корисного часу.
 * @param {{lat: number, lon: number, useful: number}[]} points
 * @returns {{lat: number, lon: number, value: number}[]}
 */
export function buildGrid(points, { cellKm = 2, radiusKm = 8 } = {}) {
  if (points.length === 0) return [];

  const cells = new Map();
  for (const point of points) {
    const dLat = cellKm / KM_PER_DEG_LAT;
    const dLon = cellKm / kmPerDegLon(point.lat);
    const steps = Math.ceil(radiusKm / cellKm);

    for (let i = -steps; i <= steps; i += 1) {
      for (let j = -steps; j <= steps; j += 1) {
        const lat = point.lat + i * dLat;
        const lon = point.lon + j * dLon;
        const distKm = Math.hypot(i * cellKm, j * cellKm);
        if (distKm > radiusKm) continue;

        const value = point.useful - walkPenalty(distKm);
        if (value <= 0) continue;

        const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
        const existing = cells.get(key);
        if (!existing || existing.value < value) {
          cells.set(key, { lat, lon, value });
        }
      }
    }
  }
  return [...cells.values()];
}

/**
 * Контури зон за порогами корисного часу (у секундах, за зростанням).
 * @returns GeoJSON FeatureCollection з полігонами
 */
export function buildZones(points, breaks, options = {}) {
  const cells = buildGrid(points, options);
  if (cells.length === 0) return featureCollection([]);

  const pointFeatures = featureCollection(
    cells.map((cell) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [cell.lon, cell.lat] },
      properties: { value: cell.value },
    })),
  );

  const surface = interpolate(pointFeatures, 5, { gridType: 'points', property: 'value', units: 'kilometers' });
  const bands = [...breaks, Number.MAX_SAFE_INTEGER];
  return isobands(surface, bands, { zProperty: 'value' });
}
```

- [ ] **Step 4: Запустити тести**

```bash
cd web && npm test
```

Expected: 11 passed (6 з metrics + 5 з grid... якщо `buildZones` падає на turf-імпортах, замінити імпорти на `import * as turf from '@turf/turf'` і викликати `turf.isobands` / `turf.interpolate` / `turf.featureCollection`).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): grid and isoband zone construction"
```

---

### Task 14: Фронтенд — карта

**Files:**
- Create: `web/index.html`, `web/src/map.js`, `web/src/style.css`

- [ ] **Step 1: Створити `web/index.html`**

```html
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Куди доїду за день</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <aside id="panel">
      <h1>Куди доїду за день</h1>
      <p class="sub">Понеділок, виїзд після 09:00, повернення до 23:00</p>

      <label for="origin">Звідки</label>
      <select id="origin"></select>

      <label for="min-stay">Мінімум на місці: <output id="min-stay-value">4 год</output></label>
      <input id="min-stay" type="range" min="0" max="43200" step="1800" value="14400" />

      <label for="overhead">Кава й хотдог: <output id="overhead-value">1 год</output></label>
      <input id="overhead" type="range" min="0" max="7200" step="900" value="3600" />

      <label><input id="show-zones" type="checkbox" checked /> Показувати зони</label>

      <p id="status"></p>
    </aside>
    <div id="map"></div>
    <script type="module" src="/src/map.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Створити `web/src/style.css`**

```css
:root {
  --bg: #10161d;
  --panel: #18202a;
  --text: #e8edf2;
  --muted: #8b9aab;
  --accent: #4cc9a0;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  display: flex;
  height: 100vh;
  font: 15px/1.5 system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
}

#panel {
  width: 320px;
  flex: 0 0 320px;
  padding: 20px;
  overflow-y: auto;
  background: var(--panel);
}

#panel h1 { font-size: 20px; margin: 0 0 4px; }
.sub { color: var(--muted); margin: 0 0 24px; font-size: 13px; }
label { display: block; margin: 16px 0 6px; font-size: 13px; color: var(--muted); }
select, input[type='range'] { width: 100%; }
output { color: var(--accent); font-variant-numeric: tabular-nums; }
#status { margin-top: 24px; color: var(--muted); font-size: 13px; }
#map { flex: 1; }

@media (max-width: 700px) {
  body { flex-direction: column; }
  #panel { width: 100%; flex: 0 0 auto; }
  #map { flex: 1; min-height: 50vh; }
}
```

- [ ] **Step 3: Створити `web/src/map.js`**

```js
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { filterStations, formatHours } from './metrics.js';
import { buildZones } from './grid.js';

const DATA = '/data';
const BREAKS = [2 * 3600, 4 * 3600, 6 * 3600, 8 * 3600];
const COLORS = ['#2b4a5a', '#2f7d78', '#4cc9a0', '#a8e05f', '#f9d423'];

const el = (id) => document.getElementById(id);
const state = { index: null, windows: null };

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [10.4, 51.1],
  zoom: 5.2,
});

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

function fail(message) {
  el('status').innerHTML = `${message} <button id="retry">Спробувати ще</button>`;
  el('retry').onclick = () => window.location.reload();
}

function currentPoints() {
  const minStay = Number(el('min-stay').value);
  const overhead = Number(el('overhead').value);
  const passing = filterStations(state.windows, { minStay, overhead });

  return Object.entries(passing).flatMap(([stopId, info]) => {
    const station = state.index.stations[stopId];
    if (!station) return [];
    return [{ ...station, id: stopId, useful: info.useful, window: info.window }];
  });
}

function render() {
  el('min-stay-value').textContent = formatHours(Number(el('min-stay').value));
  el('overhead-value').textContent = formatHours(Number(el('overhead').value));

  const points = currentPoints();
  el('status').textContent = points.length
    ? `${points.length} станцій підходить`
    : 'Звідси за цей день нікуди не зʼїздиш';

  map.getSource('stations').setData({
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { name: p.name, useful: p.useful, label: formatHours(p.useful) },
    })),
  });

  const zones = el('show-zones').checked ? buildZones(points, BREAKS) : { type: 'FeatureCollection', features: [] };
  map.getSource('zones').setData(zones);
}

async function selectOrigin(stopId) {
  el('status').textContent = 'Рахую…';
  try {
    const payload = await loadJson(`${DATA}/origins/${stopId}.json`);
    state.windows = payload.stations;
    render();
  } catch (error) {
    fail(`Не вдалося завантажити дані (${error.message}).`);
  }
}

map.on('load', async () => {
  const empty = { type: 'FeatureCollection', features: [] };
  map.addSource('zones', { type: 'geojson', data: empty });
  map.addLayer({
    id: 'zones',
    type: 'fill',
    source: 'zones',
    paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'value'], 0, COLORS[0], 8 * 3600, COLORS[4]],
      'fill-opacity': 0.25,
    },
  });

  map.addSource('stations', { type: 'geojson', data: empty });
  map.addLayer({
    id: 'stations',
    type: 'circle',
    source: 'stations',
    paint: {
      'circle-radius': 5,
      'circle-color': [
        'interpolate',
        ['linear'],
        ['get', 'useful'],
        0,
        COLORS[0],
        4 * 3600,
        COLORS[2],
        8 * 3600,
        COLORS[4],
      ],
      'circle-stroke-width': 1,
      'circle-stroke-color': '#10161d',
    },
  });

  map.on('click', 'stations', (event) => {
    const { name, label } = event.features[0].properties;
    new maplibregl.Popup()
      .setLngLat(event.lngLat)
      .setHTML(`<strong>${name}</strong><br>${label} на місці`)
      .addTo(map);
  });

  try {
    state.index = await loadJson(`${DATA}/stations.json`);
  } catch (error) {
    fail(`Не вдалося завантажити список станцій (${error.message}).`);
    return;
  }

  const select = el('origin');
  for (const stopId of state.index.origins) {
    const option = document.createElement('option');
    option.value = stopId;
    option.textContent = state.index.stations[stopId]?.name ?? stopId;
    select.append(option);
  }

  select.onchange = () => selectOrigin(select.value);
  for (const id of ['min-stay', 'overhead', 'show-zones']) {
    el(id).oninput = render;
  }

  await selectOrigin(state.index.origins[0]);
});
```

- [ ] **Step 4: Зібрати дані на фікстурі й запустити dev-сервер**

```bash
.venv/bin/python -m build.cli /dev/null --out web/public/data 2>/dev/null || echo "потрібен реальний фід — див. README"
cd web && npm run build
```

Expected: `npm run build` завершується без помилок (дані можуть бути відсутні — це перевіряється вручну після збірки реального фіду).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): MapLibre UI with station and zone layers"
```

---

### Task 15: Публікація на GitHub Pages

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `web/vite.config.js` (create)

- [ ] **Step 1: Створити `web/vite.config.js`**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
});
```

- [ ] **Step 2: Створити `.github/workflows/pages.yml`**

```yaml
name: Deploy to Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
        working-directory: web
      - run: npm test
        working-directory: web
      - run: npm run build
        working-directory: web
        env:
          VITE_BASE: /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Перевірити, що збірка з базовим шляхом працює**

```bash
cd web && VITE_BASE=/train/ npm run build && grep -q '/train/' dist/index.html && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "ci: GitHub Pages deployment"
```

- [ ] **Step 5: Фінальна перевірка всього**

```bash
.venv/bin/pytest -v && cd web && npm test
```

Expected: усі python-тести passed, усі js-тести passed.

Пуш не робимо — тільки за окремою командою.

---

## Що лишається зробити вручну після плану

- Завантажити реальний GTFS-фід у `gtfs/db.zip` і прогнати повну збірку.
- Перевірити час збірки для 800 origin-ів; якщо RAPTOR виявиться надто
  повільним на чистому Python, векторизувати `_scan_pattern` через numpy
  (окрема задача, з тим самим набором тестів як страховкою).
