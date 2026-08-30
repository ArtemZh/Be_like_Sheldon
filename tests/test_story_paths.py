from build.gtfs_ingest import load_gtfs
from build.story_paths import build_graph, nearest_node, shortest_path, story_paths


def test_path_runs_through_intermediate_stations(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    graph = build_graph(feed)
    a, b, c = (feed.stop_index[x] for x in ("A", "B", "C"))
    # A-B-C намальовано перегонами, тож шлях A->C іде через B, а не по прямій
    assert shortest_path(graph, a, c) == [a, b, c]


def test_nearest_node_ignores_stops_outside_the_network(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    graph = build_graph(feed)
    e = feed.stop_index["E"]  # автобусна зупинка, ділянок не має
    near_e = nearest_node(feed, set(graph), float(feed.stop_lats[e]), float(feed.stop_lons[e]))
    assert near_e != e


def test_story_paths_are_named_stations(gtfs_zip, monkeypatch):
    feed = load_gtfs(gtfs_zip)
    # фікстура — не Німеччина, тому опорні точки підміняємо її ж станціями
    from build import story_paths as module

    monkeypatch.setattr(
        module,
        "WAYPOINTS",
        {name: (float(feed.stop_lats[feed.stop_index[sid]]), float(feed.stop_lons[feed.stop_index[sid]]))
         for name, sid in [("heidelberg", "A"), ("weinheim", "B"), ("frankfurt", "C"),
                           ("stuttgart", "C"), ("karlsruhe", "B"), ("mannheim", "A")]},
    )
    paths = story_paths(feed)
    assert set(paths) == {"loop", "ride", "luggage"}
    for line in paths.values():
        assert len(line) >= 2
        assert all({"name", "lat", "lon"} <= set(stop) for stop in line)
