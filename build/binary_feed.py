"""Розклад у бінарному вигляді для браузера.

Замість того щоб передраховувати відповіді для сотень станцій, віддаємо
браузеру сам розклад: у секундах і без втрат він займає 1.7 МБ у gzip —
менше, ніж передрахунок навіть для 40 станцій. Роутинг тоді рахується на
льоту для будь-якої станції.

Формат: один feed.bin із секціями, вирівняними на 4 байти, і feed.meta.json,
який описує зміщення. Кожна секція читається як типізований масив без копії.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from build.feed import Feed

# (назва в meta, атрибут Feed, тип)
SECTIONS = (
    ("patternPtr", "pattern_ptr", np.uint32),
    ("patternStops", "pattern_stops", np.uint16),
    ("patternTripPtr", "pattern_trip_ptr", np.uint32),
    ("tripBlockStart", "trip_block_start", np.uint32),
    ("tripArr", "trip_arr", np.uint32),
    ("tripDep", "trip_dep", np.uint32),
)

ALIGN = 4


def write_binary_feed(feed: Feed, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    chunks: list[bytes] = []
    sections: dict[str, dict[str, int]] = {}
    offset = 0

    for name, attr, dtype in SECTIONS:
        data = np.asarray(getattr(feed, attr)).astype(dtype).tobytes()
        sections[name] = {"offset": offset, "count": len(data) // np.dtype(dtype).itemsize}
        chunks.append(data)
        offset += len(data)

        padding = (-offset) % ALIGN
        if padding:
            chunks.append(b"\0" * padding)
            offset += padding

    (out_dir / "feed.bin").write_bytes(b"".join(chunks))
    (out_dir / "feed.meta.json").write_text(
        json.dumps(
            {
                "version": 1,
                "nStops": feed.n_stops,
                "nPatterns": feed.n_patterns,
                "sections": sections,
            },
            separators=(",", ":"),
        )
    )


def read_binary_feed(out_dir: Path) -> dict[str, np.ndarray]:
    """Зворотне читання — існує заради тестів і звірки з JS-реалізацією."""
    meta = json.loads((out_dir / "feed.meta.json").read_text())
    blob = (out_dir / "feed.bin").read_bytes()

    result: dict[str, np.ndarray] = {}
    for name, attr, dtype in SECTIONS:
        section = meta["sections"][name]
        start = section["offset"]
        end = start + section["count"] * np.dtype(dtype).itemsize
        result[attr] = np.frombuffer(blob[start:end], dtype=dtype)
    return result
