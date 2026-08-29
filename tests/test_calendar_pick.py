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
