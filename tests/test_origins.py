from build.gtfs_ingest import load_gtfs
from build.origins import pick_major_stations


def test_major_stations_are_main_stations_only(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    # у фікстурі всі станції звуться "... Hbf", крім Eedorf
    majors = pick_major_stations(feed, limit=10)
    names = [str(feed.stop_names[feed.stop_index[s]]) for s in majors]
    assert all("Hbf" in n for n in names)
    assert "Eedorf" not in names


def test_major_stations_keep_one_per_city(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    majors = pick_major_stations(feed, limit=10)
    cities = [str(feed.stop_names[feed.stop_index[s]]).split()[0] for s in majors]
    assert len(cities) == len(set(cities))


def test_major_stations_respect_limit(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    assert len(pick_major_stations(feed, limit=2)) == 2


def test_major_skips_nameless_hauptbahnhof(tmp_path):
    """У фіді є станції з назвою просто 'Hauptbahnhof', без міста."""
    import zipfile

    from tests.conftest import CALENDAR, ROUTES

    stops = (
        "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\n"
        "X,Hauptbahnhof (U· Tram),52.5,13.4,0,\n"
        "Y,Xanten Hbf,51.6,6.4,0,\n"
    )
    trips = "route_id,service_id,trip_id\nr_line1,mon,t1\n"
    stop_times = (
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
        "t1,09:00:00,09:00:00,X,1\n"
        "t1,10:00:00,10:00:00,Y,2\n"
    )
    path = tmp_path / "nameless.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("stops.txt", stops)
        z.writestr("routes.txt", ROUTES)
        z.writestr("trips.txt", trips)
        z.writestr("stop_times.txt", stop_times)
        z.writestr("calendar.txt", CALENDAR)

    feed = load_gtfs(path)
    majors = pick_major_stations(feed, limit=5)
    names = [str(feed.stop_names[feed.stop_index[s]]) for s in majors]
    assert names == ["Xanten Hbf"]


def test_capitals_go_first_even_when_quiet(gtfs_zip):
    feed = load_gtfs(gtfs_zip)
    # Ceestadt обслуговує менше рейсів за Aville, але як «обласний центр»
    # має бути на карті першим
    majors = pick_major_stations(feed, limit=2, capitals=("ceestadt",))
    names = [str(feed.stop_names[feed.stop_index[s]]) for s in majors]
    assert names[0] == "Ceestadt Hbf"
    assert len(names) == 2


def test_prefers_the_plain_main_station_name(gtfs_zip_platforms):
    feed = load_gtfs(gtfs_zip_platforms)
    majors = pick_major_stations(feed, limit=5)
    assert all("Hbf" in str(feed.stop_names[feed.stop_index[s]]) for s in majors)
