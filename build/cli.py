"""CLI збірки: GTFS zip -> бінарний фід + індекси для фронтенду.

Передрахунку відповідей більше немає. Браузер отримує сам розклад і рахує
RAPTOR у Web Worker, тому стартом може бути будь-яка станція фіду, а не
одна з наперед обраних.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from build.binary_feed import write_binary_feed
from build.calendar_pick import monday_service_ids
from build.daytrip import DEPART_AFTER, RETURN_BY
from build.gtfs_ingest import load_gtfs
from build.network import network_geojson
from build.origins import pick_major_stations


def build_all(gtfs_path: Path, out_dir: Path, major_limit: int = 15) -> None:
    service_ids, date = monday_service_ids(gtfs_path)
    print(f"сервісний понеділок: {date} ({len(service_ids)} service_id)", file=sys.stderr)

    feed = load_gtfs(gtfs_path, service_ids=service_ids)
    print(f"{feed.n_stops} станцій, {feed.n_patterns} патернів", file=sys.stderr)

    out_dir.mkdir(parents=True, exist_ok=True)

    write_binary_feed(feed, out_dir)
    print(f"бінарний фід: {(out_dir / 'feed.bin').stat().st_size / 1e6:.1f} МБ", file=sys.stderr)

    network = network_geojson(feed)
    (out_dir / "network.json").write_text(json.dumps(network, separators=(",", ":")))
    print(f"мережа: {len(network['features'])} ділянок", file=sys.stderr)

    major = pick_major_stations(feed, limit=major_limit)

    # Індекс покриває всі станції: клік по карті може влучити в будь-яку.
    stations = {
        str(sid): {
            "i": i,
            "name": str(feed.stop_names[i]),
            "lat": round(float(feed.stop_lats[i]), 5),
            "lon": round(float(feed.stop_lons[i]), 5),
        }
        for i, sid in enumerate(feed.stop_ids)
    }
    (out_dir / "stations.json").write_text(
        json.dumps(
            {
                "date": date.isoformat(),
                "departAfter": DEPART_AFTER,
                "returnBy": RETURN_BY,
                "major": major,
                "stations": stations,
            },
            separators=(",", ":"),
        )
    )
    print(f"готово: {len(stations)} станцій, {len(major)} головних вокзалів", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="Зібрати дані з GTFS-фіду")
    parser.add_argument("gtfs", type=Path, help="шлях до GTFS zip")
    parser.add_argument("--out", type=Path, default=Path("web/public/data"))
    parser.add_argument("--major", type=int, default=15)
    args = parser.parse_args()
    build_all(args.gtfs, args.out, args.major)


if __name__ == "__main__":
    main()
