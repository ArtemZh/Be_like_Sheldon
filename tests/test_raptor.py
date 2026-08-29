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
