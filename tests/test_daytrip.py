from build.daytrip import DEPART_AFTER, RETURN_BY, day_trip_windows
from build.gtfs_ingest import load_gtfs


def test_reachable_station_has_arrival_and_departure(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    windows = day_trip_windows(feed, "A")
    assert windows["C"] == [10 * 3600 + 1800, 18 * 3600]


def test_station_without_return_is_excluded(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert "D" not in day_trip_windows(feed, "A")


def test_unreachable_station_is_excluded(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert "E" not in day_trip_windows(feed, "A")


def test_origin_itself_is_excluded(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert "A" not in day_trip_windows(feed, "A")


def test_defaults_match_spec():
    assert DEPART_AFTER == 9 * 3600
    assert RETURN_BY == 23 * 3600
