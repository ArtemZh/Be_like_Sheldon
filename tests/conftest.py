import zipfile
from pathlib import Path

import pytest

STOPS = """stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station
A,Aville Hbf,52.5,13.4,0,
B,Beeburg Hbf,52.0,13.0,0,
C,Ceestadt Hbf,51.5,12.6,0,
D,Deeheim Hbf,53.0,10.0,0,
E,Eedorf,48.0,9.0,0,
"""

ROUTES = """route_id,route_short_name,route_type
r_line1,L1,2
r_line2,L2,2
r_bus,BUS,3
"""

TRIPS = """route_id,service_id,trip_id
r_line1,mon,t_ABC_am
r_line1,mon,t_CBA_pm
r_line2,mon,t_AD_am
r_line2,mon,t_DA_pm
r_bus,mon,t_bus
r_line2,tue,t_DA_early
"""

STOP_TIMES = """trip_id,arrival_time,departure_time,stop_id,stop_sequence
t_ABC_am,09:30:00,09:30:00,A,1
t_ABC_am,10:00:00,10:00:00,B,2
t_ABC_am,10:30:00,10:30:00,C,3
t_CBA_pm,18:00:00,18:00:00,C,1
t_CBA_pm,18:30:00,18:30:00,B,2
t_CBA_pm,19:00:00,19:00:00,A,3
t_AD_am,10:00:00,10:00:00,A,1
t_AD_am,12:00:00,12:00:00,D,2
t_DA_pm,22:30:00,22:30:00,D,1
t_DA_pm,24:30:00,24:30:00,A,2
t_bus,09:00:00,09:00:00,A,1
t_bus,09:15:00,09:15:00,E,2
t_DA_early,06:00:00,06:00:00,D,1
t_DA_early,08:00:00,08:00:00,A,2
"""

CALENDAR = """service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
mon,1,0,0,0,0,0,0,20260101,20261231
tue,0,1,0,0,0,0,0,20260101,20261231
"""


@pytest.fixture
def gtfs_zip(tmp_path: Path) -> Path:
    path = tmp_path / "fixture.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("stops.txt", STOPS)
        z.writestr("routes.txt", ROUTES)
        z.writestr("trips.txt", TRIPS)
        z.writestr("stop_times.txt", STOP_TIMES)
        z.writestr("calendar.txt", CALENDAR)
    return path


PLATFORM_STOPS = """stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station
P,Pville Hbf,52.500,13.400,1,
P1,Pville Hbf,52.5001,13.4001,0,P
P2,Pville Hbf,52.4999,13.3999,0,P
Q,Qtown Hbf,52.000,13.000,1,
Q1,Qtown Hbf,52.0,13.0,0,Q
"""

PLATFORM_TRIPS = """route_id,service_id,trip_id
r_line1,mon,t_P1Q1
r_line1,mon,t_Q1P2
"""

PLATFORM_STOP_TIMES = """trip_id,arrival_time,departure_time,stop_id,stop_sequence
t_P1Q1,09:30:00,09:30:00,P1,1
t_P1Q1,10:30:00,10:30:00,Q1,2
t_Q1P2,18:00:00,18:00:00,Q1,1
t_Q1P2,19:00:00,19:00:00,P2,2
"""


@pytest.fixture
def gtfs_zip_platforms(tmp_path: Path) -> Path:
    """Фід, де станція складається з кількох платформ — як у справжньому DELFI."""
    path = tmp_path / "platforms.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("stops.txt", PLATFORM_STOPS)
        z.writestr("routes.txt", ROUTES)
        z.writestr("trips.txt", PLATFORM_TRIPS)
        z.writestr("stop_times.txt", PLATFORM_STOP_TIMES)
        z.writestr("calendar.txt", CALENDAR)
    return path


EXPRESS_TRIPS = """route_id,service_id,trip_id
r_line1,mon,t_ABC
r_line2,mon,t_AC_express
"""

EXPRESS_STOP_TIMES = """trip_id,arrival_time,departure_time,stop_id,stop_sequence
t_ABC,09:00:00,09:00:00,A,1
t_ABC,09:40:00,09:40:00,B,2
t_ABC,10:20:00,10:20:00,C,3
t_AC_express,11:00:00,11:00:00,A,1
t_AC_express,11:50:00,11:50:00,C,2
"""


@pytest.fixture
def gtfs_zip_express(tmp_path: Path) -> Path:
    """Місцевий A-B-C і експрес A-C повз B — той самий шлях двома лініями."""
    path = tmp_path / "express.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("stops.txt", STOPS)
        z.writestr("routes.txt", ROUTES)
        z.writestr("trips.txt", EXPRESS_TRIPS)
        z.writestr("stop_times.txt", EXPRESS_STOP_TIMES)
        z.writestr("calendar.txt", CALENDAR)
    return path
