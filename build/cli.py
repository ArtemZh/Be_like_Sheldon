"""CLI збірки: GTFS zip -> JSON для фронтенду."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from build.calendar_pick import monday_service_ids
from build.daytrip import DEPART_AFTER, RETURN_BY, day_trip_windows
from build.gtfs_ingest import load_gtfs
from build.origins import DEFAULT_LIMIT, pick_origins


def build_all(gtfs_path: Path, out_dir: Path, limit: int = DEFAULT_LIMIT) -> None:
    service_ids, date = monday_service_ids(gtfs_path)
    print(f"сервісний понеділок: {date} ({len(service_ids)} service_id)", file=sys.stderr)

    feed = load_gtfs(gtfs_path, service_ids=service_ids)
    print(f"{feed.n_stops} зупинок, {feed.n_patterns} патернів", file=sys.stderr)

    reversed_feed = feed.reversed()
    origins = pick_origins(feed, limit=limit)

    origins_dir = out_dir / "origins"
    origins_dir.mkdir(parents=True, exist_ok=True)

    used: set[str] = set()
    for n, origin in enumerate(origins, 1):
        windows = day_trip_windows(
            feed, origin, DEPART_AFTER, RETURN_BY, reversed_feed=reversed_feed
        )
        (origins_dir / f"{origin}.json").write_text(
            json.dumps({"origin": origin, "stations": windows}, separators=(",", ":"))
        )
        used.add(origin)
        used.update(windows)
        if n % 50 == 0:
            print(f"  {n}/{len(origins)}", file=sys.stderr)

    stations = {
        str(sid): {
            "name": str(feed.stop_names[i]),
            "lat": round(float(feed.stop_lats[i]), 5),
            "lon": round(float(feed.stop_lons[i]), 5),
        }
        for i, sid in enumerate(feed.stop_ids)
        if str(sid) in used
    }
    (out_dir / "stations.json").write_text(
        json.dumps(
            {
                "date": date.isoformat(),
                "depart_after": DEPART_AFTER,
                "return_by": RETURN_BY,
                "origins": origins,
                "stations": stations,
            },
            separators=(",", ":"),
        )
    )
    print(f"готово: {len(origins)} origin-ів, {len(stations)} станцій", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="Зібрати day-trip дані з GTFS-фіду")
    parser.add_argument("gtfs", type=Path, help="шлях до GTFS zip")
    parser.add_argument("--out", type=Path, default=Path("web/public/data"))
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    args = parser.parse_args()
    build_all(args.gtfs, args.out, args.limit)


if __name__ == "__main__":
    main()
