"""RAPTOR: найраніші приїзди від однієї станції."""

from __future__ import annotations

import numpy as np

from build.feed import Feed

UNREACHABLE = int(np.iinfo(np.int32).max)
MAX_ROUNDS = 5  # до 4 пересадок
MIN_TRANSFER_SECONDS = 5 * 60


def earliest_arrivals(
    feed: Feed, origin: int, departure_after: int, max_rounds: int = MAX_ROUNDS
) -> np.ndarray:
    """Найраніший час приїзду в кожну зупинку.

    Раунд k читає лише результати раунду k−1 і пише у власний масив, тому
    результат не залежить від порядку сканування патернів. Якщо оновлювати
    один спільний масив просто по ходу, відповідь починає залежати від
    порядку обходу — саме на цьому розійшлися Python і JS.

    Працює і на розвернутому фіді: там «приїзд» означає «−відправлення»,
    а departure_after — це −(дедлайн повернення).
    """
    best = np.full(feed.n_stops, UNREACHABLE, dtype=np.int64)
    best[origin] = departure_after
    prev = best.copy()
    marked = {origin}
    stop_ptr, stop_pat, stop_pos = feed.stop_patterns

    for _ in range(max_rounds):
        queue: dict[int, int] = {}
        for stop in marked:
            for i in range(int(stop_ptr[stop]), int(stop_ptr[stop + 1])):
                pattern, pos = int(stop_pat[i]), int(stop_pos[i])
                if pattern not in queue or pos < queue[pattern]:
                    queue[pattern] = pos

        curr = best.copy()
        improved: set[int] = set()
        for pattern, start_pos in queue.items():
            _scan_pattern(feed, pattern, start_pos, prev, curr, best, origin, improved)

        _apply_transfers(feed, improved, curr)
        np.minimum(best, curr, out=best)

        if not improved:
            break
        marked = improved
        prev = curr

    return best


def _scan_pattern(
    feed: Feed,
    pattern: int,
    start_pos: int,
    prev: np.ndarray,
    curr: np.ndarray,
    best: np.ndarray,
    origin: int,
    improved: set[int],
) -> None:
    """Проїхати патерн, підхопивши найраніший придатний рейс.

    Посадка вирішується за prev (результат попереднього раунду), приїзди
    пишуться в curr. Посадка на іншому вузлі, ніж origin, вимагає
    MIN_TRANSFER_SECONDS запасу: станції зведені до одного вузла, тому
    перехід між платформами більше не коштує часу сам собою.
    """
    length = feed.pattern_length(pattern)
    lo = int(feed.pattern_ptr[pattern])
    stops = feed.pattern_stops[lo : lo + length]
    trip_lo = int(feed.pattern_trip_ptr[pattern])
    trip_hi = int(feed.pattern_trip_ptr[pattern + 1])

    current_trip: int | None = None

    for pos in range(start_pos, length):
        stop = int(stops[pos])

        if current_trip is not None:
            arr = int(feed.trip_arr[feed.trip_slice(pattern, current_trip)][pos])
            if arr < best[stop] and arr < curr[stop]:
                curr[stop] = arr
                improved.add(stop)

        if prev[stop] < UNREACHABLE:
            slack = 0 if stop == origin else MIN_TRANSFER_SECONDS
            boardable = _first_trip_after(
                feed, pattern, pos, int(prev[stop]) + slack, trip_lo, trip_hi
            )
            if boardable is not None and (current_trip is None or boardable < current_trip):
                current_trip = boardable


def _first_trip_after(
    feed: Feed, pattern: int, pos: int, time: int, trip_lo: int, trip_hi: int
) -> int | None:
    """Перший рейс патерна, що відходить із позиції pos не раніше за time."""
    for trip in range(trip_lo, trip_hi):
        dep = int(feed.trip_dep[feed.trip_slice(pattern, trip)][pos])
        if dep >= time:
            return trip
    return None


def _apply_transfers(feed: Feed, improved: set[int], curr: np.ndarray) -> None:
    """Пішохідні пересадки між станціями. Після зведення платформ у вузли
    таких у фіді немає, але формат їх допускає."""
    for stop in list(improved):
        for target, cost in feed.transfers_by_stop.get(stop, ()):
            candidate = int(curr[stop]) + cost
            if candidate < curr[target]:
                curr[target] = candidate
                improved.add(target)
