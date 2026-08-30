from build.gtfs_ingest import load_gtfs
from build.network import _corridor_stations, network_edges, network_geojson


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


def test_drops_an_edge_longer_than_the_limit(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    a, d = (feed.stop_index[x] for x in ("A", "D"))
    # A(52.5, 13.4) -> D(53.0, 10.0) — понад 230 км. Заміни їй нема, але це
    # й не перегін, а пряма через пів карти
    assert (min(a, d), max(a, d)) not in network_edges(feed)
    assert (min(a, d), max(a, d)) in network_edges(feed, max_km=1000)


def test_drops_a_chord_over_an_already_drawn_path(gtfs_zip_express):
    feed = load_gtfs(gtfs_zip_express)
    a, b, c = (feed.stop_index[x] for x in ("A", "B", "C"))
    edges = network_edges(feed)
    # A-B-C намальовано перегонами, тож хорда A-C (експрес повз B) — дубль
    assert (min(a, b), max(a, b)) in edges
    assert (min(b, c), max(b, c)) in edges
    assert (min(a, c), max(a, c)) not in edges


def test_reduction_off_keeps_the_chord(gtfs_zip_express):
    feed = load_gtfs(gtfs_zip_express)
    a, c = (feed.stop_index[x] for x in ("A", "C"))
    # без редукції хорду лишає — тут її прибирає саме редукція, не довжина
    assert (min(a, c), max(a, c)) in network_edges(feed, detour=0, max_km=1000)
    assert (min(a, c), max(a, c)) not in network_edges(feed, max_km=1000)


def test_corridor_counts_stations_the_line_skips(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    a, b, c, d = (feed.stop_index[x] for x in ("A", "B", "C", "D"))
    # A, B, C майже на одній прямій: відрізок A-C проходить повз B
    assert _corridor_stations(feed, a, c) == 1
    # A-D іде іншим напрямком, там пропускати нема кого
    assert _corridor_stations(feed, a, d) == 0
