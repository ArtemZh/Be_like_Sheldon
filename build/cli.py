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
from build.calendar_pick import monday_service_days
from build.daytrip import DEPART_AFTER, RETURN_BY
from build.germany import load_states, state_of
from build.gtfs_ingest import load_gtfs
from build.network import network_geojson
from build.origins import MAJOR_LIMIT, pick_major_stations
from build.story_paths import write_module as write_story_paths


# Лінії сюжетного режиму — не дані відповіді, а частина фронтенду, тому
# лежать модулем у web/src. Будуються з того самого фіду: якщо фід
# перезібрати без них, вони тихо розійдуться з мережею на карті.
#
# За замовчуванням `build_all` їх не чіпає, і шлях підставляє лише CLI:
# інакше будь-який тест, що зібрав фікстурний фід, перезаписував би цей
# файл трьома станціями з фікстури. Один раз так і сталося.
STORY_PATHS = Path("web/src/story-paths.js")


def build_all(
    gtfs_path: Path,
    out_dir: Path,
    major_limit: int = MAJOR_LIMIT,
    story_paths: Path | None = None,
) -> None:
    days, date = monday_service_days(gtfs_path)
    print(
        f"сервісний понеділок: {date}; "
        + ", ".join(f"{len(s)} service_id зі зсувом {o // 3600} год" for s, o in days),
        file=sys.stderr,
    )

    feed = load_gtfs(gtfs_path, days=days)
    print(f"{feed.n_stops} станцій, {feed.n_patterns} патернів", file=sys.stderr)

    out_dir.mkdir(parents=True, exist_ok=True)

    write_binary_feed(feed, out_dir)
    print(f"бінарний фід: {(out_dir / 'feed.bin').stat().st_size / 1e6:.1f} МБ", file=sys.stderr)

    # Усе поза Німеччиною на карту не йде: власна підкладка — сама країна,
    # і паризька гілка висіла б у порожнечі. На розрахунок це не впливає,
    # бінарний фід лишається повним.
    state_names, rings = load_states()
    states = [
        state_of(float(feed.stop_lons[i]), float(feed.stop_lats[i]), rings)
        for i in range(len(feed.stop_ids))
    ]
    german = [state >= 0 for state in states]

    network = network_geojson(feed, inside=german)
    (out_dir / "network.json").write_text(json.dumps(network, separators=(",", ":")))
    print(
        f"мережа: {len(network['features'])} ділянок; "
        f"{sum(german)} станцій у Німеччині з {len(german)}",
        file=sys.stderr,
    )

    # Назви ліній по патернах: потрібні лише щоб підписати «що це за потяг».
    (out_dir / "patterns.json").write_text(
        json.dumps({"routes": [str(name) for name in feed.pattern_routes]}, ensure_ascii=False,
                   separators=(",", ":"))
    )

    major = pick_major_stations(feed, limit=major_limit)

    # Індекс покриває всі станції: клік по карті може влучити в будь-яку.
    stations = {
        str(sid): {
            "i": i,
            "name": str(feed.stop_names[i]),
            "lat": round(float(feed.stop_lats[i]), 5),
            "lon": round(float(feed.stop_lons[i]), 5),
            **({"s": states[i]} if german[i] else {"out": 1}),
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
                "states": state_names,
                "stations": stations,
            },
            separators=(",", ":"),
        )
    )
    if story_paths is not None and story_paths.parent.exists():
        write_story_paths(feed, story_paths)
        print(f"маршрут Шелдона: {story_paths}", file=sys.stderr)

    print(f"готово: {len(stations)} станцій, {len(major)} головних вокзалів", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="Зібрати дані з GTFS-фіду")
    parser.add_argument("gtfs", type=Path, help="шлях до GTFS zip")
    parser.add_argument("--out", type=Path, default=Path("web/public/data"))
    parser.add_argument("--major", type=int, default=MAJOR_LIMIT)
    parser.add_argument("--story-paths", type=Path, default=STORY_PATHS)
    args = parser.parse_args()
    build_all(args.gtfs, args.out, args.major, args.story_paths)


if __name__ == "__main__":
    main()
