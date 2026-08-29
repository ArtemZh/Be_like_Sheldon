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
        if arrival >= UNREACHABLE or int(backward[i]) >= UNREACHABLE:
            continue
        latest_departure = -int(backward[i])
        if latest_departure < arrival:
            continue
        out[str(stop_id)] = [arrival, latest_departure]
    return out
