"""Компактне представлення GTFS-розкладу для RAPTOR."""

from __future__ import annotations

from dataclasses import dataclass, fields
from functools import cached_property
from pathlib import Path

import numpy as np


@dataclass
class Feed:
    """Розклад у пласких масивах.

    Патерн — унікальна послідовність зупинок. Зупинки патерна p лежать у
    pattern_stops[pattern_ptr[p]:pattern_ptr[p + 1]]. Рейси патерна p — це
    індекси [pattern_trip_ptr[p], pattern_trip_ptr[p + 1]), відсортовані за
    часом відправлення з першої зупинки. Часи рейсу лежать у trip_arr /
    trip_dep блоком тієї ж довжини, що й патерн.
    """

    stop_ids: np.ndarray
    stop_names: np.ndarray
    stop_lats: np.ndarray
    stop_lons: np.ndarray
    pattern_ptr: np.ndarray
    pattern_stops: np.ndarray
    pattern_trip_ptr: np.ndarray
    trip_arr: np.ndarray
    trip_dep: np.ndarray
    transfer_from: np.ndarray
    transfer_to: np.ndarray
    transfer_time: np.ndarray

    @property
    def n_stops(self) -> int:
        return len(self.stop_ids)

    @property
    def n_patterns(self) -> int:
        return len(self.pattern_ptr) - 1

    def pattern_length(self, p: int) -> int:
        return int(self.pattern_ptr[p + 1] - self.pattern_ptr[p])

    def trip_slice(self, p: int, trip: int) -> slice:
        """Зріз trip_arr/trip_dep для рейсу trip патерна p."""
        base = int(self.trip_block_start[trip])
        return slice(base, base + self.pattern_length(p))

    @cached_property
    def trip_block_start(self) -> np.ndarray:
        """Початок блоку часів для кожного рейсу."""
        lengths = np.zeros(int(self.pattern_trip_ptr[-1]), dtype=np.int64)
        for p in range(self.n_patterns):
            lo, hi = int(self.pattern_trip_ptr[p]), int(self.pattern_trip_ptr[p + 1])
            lengths[lo:hi] = self.pattern_length(p)
        starts = np.zeros(len(lengths) + 1, dtype=np.int64)
        np.cumsum(lengths, out=starts[1:])
        return starts

    @cached_property
    def stop_index(self) -> dict[str, int]:
        return {str(s): i for i, s in enumerate(self.stop_ids)}

    @cached_property
    def stop_patterns(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Для кожної зупинки — які патерни її обслуговують і на якій позиції.

        Повертає (ptr, patterns, positions): патерни зупинки s лежать у
        patterns[ptr[s]:ptr[s + 1]].
        """
        pairs: list[list[tuple[int, int]]] = [[] for _ in range(self.n_stops)]
        for p in range(self.n_patterns):
            lo, hi = int(self.pattern_ptr[p]), int(self.pattern_ptr[p + 1])
            for pos, stop in enumerate(self.pattern_stops[lo:hi]):
                pairs[int(stop)].append((p, pos))
        ptr = np.zeros(self.n_stops + 1, dtype=np.int32)
        flat_pat: list[int] = []
        flat_pos: list[int] = []
        for s, entries in enumerate(pairs):
            ptr[s + 1] = ptr[s] + len(entries)
            for p, pos in entries:
                flat_pat.append(p)
                flat_pos.append(pos)
        return ptr, np.array(flat_pat, dtype=np.int32), np.array(flat_pos, dtype=np.int32)

    @cached_property
    def transfers_by_stop(self) -> dict[int, list[tuple[int, int]]]:
        out: dict[int, list[tuple[int, int]]] = {}
        for f, t, dt in zip(self.transfer_from, self.transfer_to, self.transfer_time):
            out.setdefault(int(f), []).append((int(t), int(dt)))
        return out

    def save(self, path: Path) -> None:
        np.savez_compressed(path, **{f.name: getattr(self, f.name) for f in fields(self)})

    @classmethod
    def load(cls, path: Path) -> Feed:
        with np.load(path, allow_pickle=False) as data:
            return cls(**{f.name: data[f.name] for f in fields(cls)})

    def _replace(self, **changes) -> Feed:
        current = {f.name: getattr(self, f.name) for f in fields(self)}
        current.update(changes)
        return Feed(**current)

    def reversed(self) -> Feed:
        """Фід із розвернутим часом.

        Порядок зупинок у кожному патерні перевернуто, часи помножено на −1,
        arrival і departure поміняно місцями. Найраніший приїзд у цьому фіді
        відповідає найпізнішому відправленню в оригінальному.
        """
        new_pattern_stops = np.empty_like(self.pattern_stops)
        for p in range(self.n_patterns):
            lo, hi = int(self.pattern_ptr[p]), int(self.pattern_ptr[p + 1])
            new_pattern_stops[lo:hi] = self.pattern_stops[lo:hi][::-1]

        new_arr = np.empty_like(self.trip_arr)
        new_dep = np.empty_like(self.trip_dep)
        for p in range(self.n_patterns):
            for trip in range(int(self.pattern_trip_ptr[p]), int(self.pattern_trip_ptr[p + 1])):
                sl = self.trip_slice(p, trip)
                new_arr[sl] = -self.trip_dep[sl][::-1]
                new_dep[sl] = -self.trip_arr[sl][::-1]

        return self._replace(
            pattern_stops=new_pattern_stops,
            trip_arr=new_arr,
            trip_dep=new_dep,
            transfer_from=self.transfer_to,
            transfer_to=self.transfer_from,
        ).with_sorted_trips()

    def with_sorted_trips(self) -> Feed:
        """Пересортувати рейси кожного патерна за часом відправлення."""
        new_arr = np.empty_like(self.trip_arr)
        new_dep = np.empty_like(self.trip_dep)
        for p in range(self.n_patterns):
            lo, hi = int(self.pattern_trip_ptr[p]), int(self.pattern_trip_ptr[p + 1])
            trips = sorted(range(lo, hi), key=lambda t: int(self.trip_dep[self.trip_slice(p, t)][0]))
            for new_pos, old_trip in enumerate(trips):
                new_arr[self.trip_slice(p, lo + new_pos)] = self.trip_arr[self.trip_slice(p, old_trip)]
                new_dep[self.trip_slice(p, lo + new_pos)] = self.trip_dep[self.trip_slice(p, old_trip)]
        return self._replace(trip_arr=new_arr, trip_dep=new_dep)
