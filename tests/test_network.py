from build.gtfs_ingest import load_gtfs
from build.network import network_edges, network_geojson


def test_edges_follow_consecutive_stops(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    edges = network_edges(feed)
    a, b, c = (feed.stop_index[x] for x in ("A", "B", "C"))
    assert (min(a, b), max(a, b)) in edges
    assert (min(b, c), max(b, c)) in edges


def test_opposite_directions_collapse_into_one_edge(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    # A->B->C і C->B->A дають дві ділянки, а не чотири
    a, b = (feed.stop_index[x] for x in ("A", "B"))
    assert sum(1 for e in network_edges(feed) if e == (min(a, b), max(a, b))) == 1


def test_bus_only_stop_has_no_edges(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    e = feed.stop_index["E"]
    assert all(e not in edge for edge in network_edges(feed))


def test_geojson_is_linestring_collection(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    gj = network_geojson(feed)
    assert gj["type"] == "FeatureCollection"
    assert all(f["geometry"]["type"] == "LineString" for f in gj["features"])
    assert all(len(f["geometry"]["coordinates"]) == 2 for f in gj["features"])


def test_drops_edges_longer_than_the_limit(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    a, d = (feed.stop_index[x] for x in ("A", "D"))
    # A(52.5, 13.4) -> D(53.0, 10.0) — це понад 230 км
    assert (min(a, d), max(a, d)) in network_edges(feed, max_km=1000)
    assert (min(a, d), max(a, d)) not in network_edges(feed)


def test_short_edges_survive(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    a, b = (feed.stop_index[x] for x in ("A", "B"))
    # A -> B це ~65 км
    assert (min(a, b), max(a, b)) in network_edges(feed)
