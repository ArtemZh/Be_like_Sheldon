# The screen saver mode — plan

Status: **done**. Implemented with two differences from the plan: the
dashboards were reworked (instead of "hottest stations" and states — peak
minute, train-kilometres and a departures ticker), and the live stations
layer updates once per timetable second rather than every frame.

## What it is

The third mode of the map: a non-interactive board. The whole of Germany,
with stations lighting up where **a train is standing right now**. Time
either follows the computer's clock or runs accelerated — the whole Monday
in 10 to 60 minutes.

There are no clicks and no hovers in this mode: the only controls are the
"real time / accelerated" switch and the day-length slider.

## Data: where "a train is standing here now" comes from

The timetable is already in the browser (`feed.bin`) and RAPTOR reads it.
The board needs a different slice: not "where can I get" but "what is
happening at 14:37".

Once the feed is loaded, the worker builds an **index of events by
minute**:

```
for every trip, for every stop:
  event = (station, arrival, departure)
spread the events across 2880 buckets (a day plus the overnight shift), as CSR arrays:
  minute_ptr: Uint32Array(2881)
  event_stop:  Uint32Array(all events)
```

A `live(t)` query returns the stations where `arrival <= t <= departure +
window`. In this feed arrival and departure often coincide, so the window
is 60 seconds: otherwise a "stop" lasts zero and nothing blinks on the map.

The same index also gives the dashboard figures: how many trips are moving
(first stop ≤ t ≤ last), how many are standing, how many stations have been
served since the start of the day.

Estimate: ~1M events, two typed arrays — a few megabytes, built once in a
few hundred milliseconds. A per-frame query is an array slice, with no walk
over trips.

## The clock

- **Real time**: the time of day from `Date`, with a Monday timetable. We
  admit that honestly with a caption: "Monday timetable".
- **Accelerated**: `t = 00:00 + elapsed * (86400 / duration)`, the duration
  set by a slider from 10 to 60 minutes. After 24:00 the cycle starts over.

Both modes are driven by one rAF loop; one worker query and one `setData`
per frame.

## What is on the screen

**The central board** — the same glass window as the station hint, the same
size. Inside, large `HH:MM` digits on the same mechanical board
(`flap.js`). In accelerated mode this is simulation time, in real time the
computer's clock.

**The map**: base map and tracks as they are; on top, a `live-stops` layer:
a circle on every station where a train is standing. The radius grows with
the number of trains at a station, and the brightness fades a second after
departure — that is how the wave of the timetable becomes visible.

**The side panel** — dashboards worth watching without interaction:

1. **Moving / standing** — two large numbers, updated every frame.
2. **Pulse of the day** — a histogram of departures by hour with the
   current hour marked. The morning and evening peaks are visible.
3. **Hottest stations** — the top five over the last simulated hour.
4. **Coverage** — how many of the 6761 stations have been served since the
   start of the day, as a cumulative bar.

**The settings** sit there too, at the bottom: the time-source switch and
the "whole day in 10…60 min" slider.

## Implementation steps

1. `web/src/live.js` — pure functions: building the by-minute index,
   `activeAt(index, t)`, the "elapsed time → simulation time" mapping. With
   tests.
2. `worker.js` — builds the index after `init`, answers `live`.
3. `map.js` — the `screen` mode: the `live-stops` layer, the rAF loop,
   click and hover handlers switched off.
4. Markup and styles: the central board, the dashboard panel.
5. i18n: labels in Ukrainian (translations in a separate pass).

## Open questions

- The overnight shift: events after 24:00 belong to Tuesday's service.
  Should the board show them as "00:xx of the next day" or cut the day at
  24:00? I propose cutting: this is one day on show.
- Should the result of the day mode stay on the map if it has been
  computed? I propose no: the screen saver is a separate picture.
