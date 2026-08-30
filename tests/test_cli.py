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
    # A-B і B-C; A-D довша за поріг і на карту не йде
    assert len(network["features"]) == 2


def test_writes_story_paths_module(gtfs_zip, tmp_path):
    out = tmp_path / "web" / "src"
    out.mkdir(parents=True)
    build_all(gtfs_zip, tmp_path, story_paths=out / "story-paths.js")
    module = (out / "story-paths.js").read_text()
    assert "STORY_STOPS" in module
    assert "loop" in module


def test_skips_story_paths_when_target_missing(gtfs_zip, tmp_path):
    # у чужому дереві каталогу web/src немає — збірка не має падати
    build_all(gtfs_zip, tmp_path, story_paths=tmp_path / "nowhere" / "story-paths.js")
    assert (tmp_path / "stations.json").exists()


def test_does_not_touch_story_paths_by_default(gtfs_zip, tmp_path):
    """Збірка без явного шляху не пише у web/src.

    Інакше будь-який тест на фікстурному фіді перезаписував би справжній
    модуль трьома станціями з фікстури — так уже один раз і поїхало в
    коміт, і на CI впали тести фронтенду.
    """
    from build.cli import STORY_PATHS

    before = STORY_PATHS.read_bytes() if STORY_PATHS.exists() else None
    build_all(gtfs_zip, tmp_path)
    after = STORY_PATHS.read_bytes() if STORY_PATHS.exists() else None
    assert before == after
