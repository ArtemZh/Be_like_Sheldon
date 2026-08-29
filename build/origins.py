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
