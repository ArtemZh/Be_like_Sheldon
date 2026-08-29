"""Вибір сервісного понеділка з calendar.txt."""

from __future__ import annotations

import csv
import datetime as dt
import io
import zipfile
from pathlib import Path


def _next_monday(date: dt.date) -> dt.date:
    while date.weekday() != 0:
        date += dt.timedelta(days=1)
    return date


def monday_service_ids(path: Path) -> tuple[set[str], dt.date]:
    """Повертає service_id, що їздять у понеділок, і саму дату.

    Береться перший понеділок, покритий діапазонами якнайбільшої кількості
    сервісів.
    """
    with zipfile.ZipFile(path) as z:
        if "calendar.txt" not in z.namelist():
            raise ValueError("GTFS-фід не містить calendar.txt")
        with z.open("calendar.txt") as fh:
            rows = list(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig")))

    monday_rows = [r for r in rows if r["monday"] == "1"]
    if not monday_rows:
        raise ValueError("у calendar.txt немає жодного сервісу, що їздить у понеділок")

    starts = [dt.datetime.strptime(r["start_date"], "%Y%m%d").date() for r in monday_rows]
    ends = [dt.datetime.strptime(r["end_date"], "%Y%m%d").date() for r in monday_rows]

    date = _next_monday(max(starts))
    if date > min(ends):
        # діапазони не перетинаються — беремо понеділок від найранішого старту
        date = _next_monday(min(starts))

    active = {
        r["service_id"]
        for r, start, end in zip(monday_rows, starts, ends)
        if start <= date <= end
    }
    return active, date
