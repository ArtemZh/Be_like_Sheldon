"""Повільний тест на справжньому фіді DB.

Потребує gtfs/db.zip. Запуск: .venv/bin/pytest -m slow
"""

from pathlib import Path

import pytest

from build.calendar_pick import monday_service_ids
from build.daytrip import day_trip_windows
from build.gtfs_ingest import load_gtfs

FEED = Path("gtfs/db.zip")
BERLIN_HBF = "8011160"


@pytest.mark.slow
def test_berlin_hbf_reaches_many_stations():
    if not FEED.exists():
        pytest.skip("немає gtfs/db.zip — див. README")
    service_ids, _ = monday_service_ids(FEED)
    feed = load_gtfs(FEED, service_ids=service_ids)
    windows = day_trip_windows(feed, BERLIN_HBF)
    assert len(windows) > 100
    for arrival, departure in windows.values():
        assert departure >= arrival
