import json

import numpy as np

from build.binary_feed import read_binary_feed, write_binary_feed
from build.gtfs_ingest import load_gtfs


def test_roundtrip_preserves_schedule(gtfs_zip, tmp_path):
    feed = load_gtfs(gtfs_zip)
    write_binary_feed(feed, tmp_path)
    restored = read_binary_feed(tmp_path)

    assert restored["pattern_ptr"].tolist() == feed.pattern_ptr.tolist()
    assert restored["pattern_stops"].tolist() == feed.pattern_stops.tolist()
    assert restored["pattern_trip_ptr"].tolist() == feed.pattern_trip_ptr.tolist()
    assert restored["trip_arr"].tolist() == feed.trip_arr.tolist()
    assert restored["trip_dep"].tolist() == feed.trip_dep.tolist()


def test_meta_describes_layout(gtfs_zip, tmp_path):
    feed = load_gtfs(gtfs_zip)
    write_binary_feed(feed, tmp_path)
    meta = json.loads((tmp_path / "feed.meta.json").read_text())

    assert meta["nStops"] == feed.n_stops
    assert meta["nPatterns"] == feed.n_patterns
    for section in ("patternPtr", "patternStops", "patternTripPtr", "tripBlockStart", "tripArr", "tripDep"):
        assert section in meta["sections"]
        assert meta["sections"][section]["offset"] % 4 == 0, "секції вирівняні для типізованих масивів"


def test_trip_block_start_matches_feed(gtfs_zip, tmp_path):
    feed = load_gtfs(gtfs_zip)
    write_binary_feed(feed, tmp_path)
    restored = read_binary_feed(tmp_path)
    assert restored["trip_block_start"].tolist() == feed.trip_block_start.tolist()


def test_times_stay_exact_in_seconds(gtfs_zip, tmp_path):
    """Секундну точність не округлюємо: 13% часів реального фіду не кратні хвилині."""
    feed = load_gtfs(gtfs_zip)
    write_binary_feed(feed, tmp_path)
    restored = read_binary_feed(tmp_path)
    assert np.array_equal(restored["trip_arr"], feed.trip_arr.astype(np.uint32))
