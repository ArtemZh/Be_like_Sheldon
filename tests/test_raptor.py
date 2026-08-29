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
    times = earliest_arrivals(rev, home, departure_after=-23 * 3600)
    assert -int(times[feed.stop_index["C"]]) == 18 * 3600


import numpy as np

from build.feed import Feed
from build.raptor import MIN_TRANSFER_SECONDS


def _transfer_feed() -> Feed:
    """A -> B одним патерном; з B два рейси на C: через 1 хв і через 10 хв."""
    return Feed(
        stop_ids=np.array(["A", "B", "C"]),
        stop_names=np.array(["A", "B", "C"]),
        stop_lats=np.array([1.0, 2.0, 3.0]),
        stop_lons=np.array([1.0, 2.0, 3.0]),
        pattern_ptr=np.array([0, 2, 4], dtype=np.int32),
        pattern_stops=np.array([0, 1, 1, 2], dtype=np.int32),
        pattern_trip_ptr=np.array([0, 1, 3], dtype=np.int32),
        trip_arr=np.array([35000, 36000, 36060, 37000, 36600, 38000], dtype=np.int32),
        trip_dep=np.array([35000, 36000, 36060, 37000, 36600, 38000], dtype=np.int32),
        transfer_from=np.array([], dtype=np.int32),
        transfer_to=np.array([], dtype=np.int32),
        transfer_time=np.array([], dtype=np.int32),
    )


def test_transfer_needs_minimum_slack():
    feed = _transfer_feed()
    times = earliest_arrivals(feed, 0, departure_after=35000)
    # рейс через хвилину після приїзду не встигаєш — тільки той, що через 10
    assert times[2] == 38000


def test_no_transfer_penalty_at_origin():
    feed = _transfer_feed()
    times = earliest_arrivals(feed, 0, departure_after=35000)
    assert times[1] == 36000


def test_minimum_transfer_is_five_minutes():
    assert MIN_TRANSFER_SECONDS == 5 * 60
