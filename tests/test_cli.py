import json

from build.cli import build_all


def test_writes_binary_feed_and_meta(gtfs_zip, tmp_path):
    build_all(gtfs_zip, tmp_path)
    assert (tmp_path / "feed.bin").exists()
    meta = json.loads((tmp_path / "feed.meta.json").read_text())
    assert meta["nStops"] > 0


def test_station_index_covers_every_station(gtfs_zip, tmp_path):
    build_all(gtfs_zip, tmp_path)
    index = json.loads((tmp_path / "stations.json").read_text())
    # клік по карті може влучити в будь-яку станцію, тому індекс повний
    assert set(index["stations"]) == {"A", "B", "C", "D", "E"}
    assert index["stations"]["A"]["name"] == "Aville Hbf"
    assert index["stations"]["A"]["i"] == 0


def test_index_lists_major_stations(gtfs_zip, tmp_path):
    build_all(gtfs_zip, tmp_path)
    index = json.loads((tmp_path / "stations.json").read_text())
    assert index["major"]
    assert set(index["major"]) <= set(index["stations"])


def test_writes_network_geojson(gtfs_zip, tmp_path):
    build_all(gtfs_zip, tmp_path)
    network = json.loads((tmp_path / "network.json").read_text())
    assert network["type"] == "FeatureCollection"
    assert len(network["features"]) == 3
