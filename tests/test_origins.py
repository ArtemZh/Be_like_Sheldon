from build.gtfs_ingest import load_gtfs
from build.origins import pick_origins


def test_returns_busiest_stops_first(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert pick_origins(feed, limit=2)[0] == "A"


def test_excludes_stops_without_rail_service(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert "E" not in pick_origins(feed, limit=10)


def test_respects_limit(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert len(pick_origins(feed, limit=2)) == 2
