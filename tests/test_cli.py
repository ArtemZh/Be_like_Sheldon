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
    assert "E" not in index["stations"]


def test_writes_network_geojson(gtfs_zip, tmp_path):
    build_all(gtfs_zip, tmp_path, limit=2)
    network = json.loads((tmp_path / "network.json").read_text())
    assert network["type"] == "FeatureCollection"
    assert len(network["features"]) == 3  # A-B, B-C, A-D


def test_index_lists_major_stations_separately(gtfs_zip, tmp_path):
    build_all(gtfs_zip, tmp_path, limit=2)
    index = json.loads((tmp_path / "stations.json").read_text())
    assert index["major"], "головні вокзали мають бути в індексі"
    assert set(index["major"]) <= set(index["origins"]), "усі вони прораховані"
