import zipfile

from build.calendar_pick import monday_service_ids


def test_picks_services_running_on_monday(gtfs_zip):
    service_ids, date = monday_service_ids(gtfs_zip)
    assert service_ids == {"mon"}
    assert date.weekday() == 0


def test_raises_when_no_monday_service(tmp_path):
    path = tmp_path / "sunday_only.zip"
    calendar = (
        "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,"
        "start_date,end_date\nsun,0,0,0,0,0,0,1,20260101,20261231\n"
    )
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("calendar.txt", calendar)
    try:
        monday_service_ids(path)
    except ValueError as exc:
        assert "понеділок" in str(exc)
    else:
        raise AssertionError("очікувалась ValueError")


def test_days_cover_monday_and_the_next_morning(gtfs_zip):
    from build.calendar_pick import monday_service_days

    days, date = monday_service_days(gtfs_zip)
    assert date.weekday() == 0
    assert days == [({"mon"}, 0), ({"tue"}, 24 * 3600)]


def test_second_day_may_be_empty(tmp_path):
    import zipfile

    from build.calendar_pick import monday_service_days

    calendar = (
        "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,"
        "start_date,end_date\nmon,1,0,0,0,0,0,0,20260101,20261231\n"
    )
    path = tmp_path / "monday_only.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("calendar.txt", calendar)

    days, _ = monday_service_days(path)
    assert days == [({"mon"}, 0), (set(), 24 * 3600)]
