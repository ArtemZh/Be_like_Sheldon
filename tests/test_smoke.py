"""Повільний тест на справжньому фіді gtfs.de.

Потребує gtfs/db.zip. Запуск: .venv/bin/pytest -m slow
"""

from pathlib import Path

import pytest

from build.calendar_pick import monday_service_days
from build.daytrip import day_trip_windows
from build.gtfs_ingest import load_gtfs

FEED = Path("gtfs/db.zip")


@pytest.fixture(scope="module")
def real_feed():
    if not FEED.exists():
        pytest.skip("немає gtfs/db.zip — див. README")
    days, _ = monday_service_days(FEED)
    return load_gtfs(FEED, days=days)


def find_station(feed, name: str) -> str:
    """Id станції за точною назвою. Платформи вже зведені, тож збіг один."""
    matches = [str(sid) for sid, n in zip(feed.stop_ids, feed.stop_names) if str(n) == name]
    assert matches, f"станції {name!r} немає у фіді"
    return matches[0]


@pytest.mark.slow
def test_platforms_are_collapsed(real_feed):
    berlin = [str(n) for n in real_feed.stop_names if str(n) == "Berlin Hbf"]
    assert len(berlin) == 1


@pytest.mark.slow
def test_berlin_hbf_reaches_many_stations(real_feed):
    windows = day_trip_windows(real_feed, find_station(real_feed, "Berlin Hbf"))
    assert len(windows) > 100
    for arrival, departure in windows.values():
        assert departure >= arrival
