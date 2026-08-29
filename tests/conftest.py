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
"""

CALENDAR = """service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
mon,1,0,0,0,0,0,0,20260101,20261231
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
