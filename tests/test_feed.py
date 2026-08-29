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
    assert rev.trip_arr.tolist() == [-310, -210, -110]
    assert rev.trip_dep.tolist() == [-300, -200, -100]
