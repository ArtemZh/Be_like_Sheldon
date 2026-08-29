import zipfile

from build.gtfs_ingest import load_gtfs


def test_keeps_only_rail_routes(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    ptr, _, _ = feed.stop_patterns
    e = feed.stop_index["E"]
    assert ptr[e + 1] - ptr[e] == 0


def test_builds_patterns_from_stop_sequences(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert feed.n_patterns == 4


def test_parses_times_past_midnight(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert feed.trip_dep.max() >= 24 * 3600


def test_missing_file_raises_clear_error(tmp_path):
    broken = tmp_path / "broken.zip"
    with zipfile.ZipFile(broken, "w") as z:
        z.writestr("stops.txt", "stop_id\nA\n")
    try:
        load_gtfs(broken)
    except ValueError as exc:
        assert "routes.txt" in str(exc)
    else:
        raise AssertionError("очікувалась ValueError")


def test_collapses_platforms_into_parent_station(gtfs_zip_platforms):
    feed = load_gtfs(gtfs_zip_platforms)
    assert sorted(feed.stop_ids.tolist()) == ["P", "Q"]


def test_station_keeps_name_and_averaged_coordinates(gtfs_zip_platforms):
    feed = load_gtfs(gtfs_zip_platforms)
    p = feed.stop_index["P"]
    assert str(feed.stop_names[p]) == "Pville Hbf"
    assert abs(float(feed.stop_lats[p]) - 52.5) < 1e-6


def test_trips_through_different_platforms_share_one_station(gtfs_zip_platforms):
    feed = load_gtfs(gtfs_zip_platforms)
    # P1 -> Q1 і Q1 -> P2 стають патернами P -> Q і Q -> P
    assert feed.n_patterns == 2
