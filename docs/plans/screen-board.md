# The screen saver board — plan

Status: **done** (2026-09-02). The changes live in the page (`web/src`), so
they reached the macOS saver automatically — it only needs a rebuild with
`macos/build.sh`.

What turned out differently from the plan: the "departure" row shows the
minutes and the track together ("in 1 min · track 2") rather than in two
slots; the window is 560 px wide, not 490, because the label column takes
13 characters. The second-screen tour has only been checked on a single
screen — nobody has seen it on two.

## 1. The train card as a mechanical board

It used to be three lines of running text, centred: lines of different
length, and everything jumped when the train changed. We make it like the
station hint: a monospaced grid, every character in its own cell, aligned
left. The skeleton of dashes appears at once and never moves; the animation
fills in only what changes. Dashes disappear instantly when the animation
starts and are never animated themselves.

```
line         ————————————————
train from   ————————————————————————————————
heading to   ————————————————————————————————
departure    —— min · track —
stop         —— of ——  ·  ——:——
```

**37 characters for the station name.** The feed has 7737 stations: half of
the names are ≤ 13 characters, 90% ≤ 25, 99% ≤ 37, and the longest is 50
("Zugspitze Bahnhof Zugspitzplatt, Garmisch-Partenki"). A window sized for
50 would stand half empty 99% of the time, so anything longer than 37 is
cut with an ellipsis.

**Minutes to departure are counted honestly** — departure time minus the
current time. The text used to hardcode "in 1 minute", which was fiction:
the train picked is simply the one leaving within the next minute.

**The time in the last row is the departure, not the arrival.**

**The feed has no platform** — at build time all platforms are merged into
stations (16566 feed rows for 7737 stations). The number is invented: 1 to
4, but **stable for the trip** (derived from the trip id, not from
`Math.random`), otherwise the digit would jump every frame during the
animation. Nothing anywhere claims it is real.

**The Wikipedia fact gets a simple animation.** No letter-by-letter roll
here: a long paragraph typed out character by character is unreadable.
Instead the lines appear with a short fade and a small shift — you can see
the board has changed, and the text is readable immediately.

## 2. One window instead of three elements

The clock, the train card and the fact must be one window in one place,
with only the contents changing. They used to be separate elements, and on
the second screen the fact surfaced in the top right corner rather than
where the clock had been.

## 3. Small text fixes

- **The operator was doubled**: "HSB · Eisfelder Talmühle → Wernigerode Hbf
  (HSB)" — the line name already contains the operator.
- **Technical station names**: "Benneckenstein Bek_Klb 001 P1",
  "Hegelsbergstraße Ri. Holländ. Straße" — strip the tails of codes and
  platform numbers with a careful rule.
- **The heading "Monday in motion"** hung there on any day of the week. The
  heading becomes neutral, and "Monday timetable" moves under the figures
  as a quiet note.

## 4. New widgets in the panel

Below the "about to depart" ticker there is empty space. Three widgets,
deliberately different in character — not yet more counters:

1. **Where the movement is — by federal state.** The three busiest states
   with their share. The data is already there: the `s` field on a station,
   the list in `states` (`stations.json`). Cheap.
2. **What is running — by line type.** One bar of shares: S-Bahn / RE / RB
   / the rest. At night mostly S-Bahn remains; by day the picture is
   different. The line names live in `patterns.json`; **the worker needs a
   change** — the `live` reply carries stations only, no trip id.
3. **Far ends.** The northernmost and the southernmost train about to
   depart, with station names. Computed from coordinates, different every
   minute.

## 5. Your own state and a tour of the country

Accelerated mode only; in real time everything stays as it is.

- In "Options" — a choice of your own state **by the name of its capital**
  (16 states: Berlin, München, Stuttgart, Dresden, Erfurt, Hannover, Kiel,
  Magdeburg, Mainz, Potsdam, Saarbrücken, Schwerin, Wiesbaden, Düsseldorf,
  Bremen, Hamburg).
- **The main screen** holds the zoom on the chosen state.
- **The second screen** travels: it shows a random state, then either moves
  on to another one or pulls back to the whole of Germany and returns.

State bounds are computed from `web/public/geo/germany-states.json` — it is
already in the project, no separate data needed.

The saver has to tell the page which screen is the main one:
`self.window.screen` against the first entry in `NSScreen.screens`, then
`?display=main|second`. Outside accelerated mode the parameter changes
nothing — both screens keep showing randomly different trains and facts,
which is good.

## 6. Rhythms into the settings

They used to be constants in `map.js` (`TRAIN_EVERY` 30 s, `FACT_SHOWN`
22 s). They move into "Options" with the rest; the window is reshaped into
three groups:

**What to show** — language, time (real / accelerated), whole day in
10–60 min, my region.

**Rhythm** — board changes, fact stays, pause between shows, widget
refresh, second screen delay, tour step.

**System** — hide the system clock and date.

The values reach the page through the same address parameters as
everything else.

## Done along the way

- **The system clock of the screen saver.** The large date and time on top
  of the saver are drawn by macOS (`showClock` in `com.apple.screensaver`),
  and they overlapped our board. "Options" now has a "Hide the system clock
  and date" checkbox; writing into another domain from the sandbox does go
  through (verified), and if it ever stops, the window says so plainly and
  offers to open the screen saver settings.
- **Settings did not take effect** until the bundle was reinstalled: the
  saver reads them in its own process while they are changed in System
  Settings, so it kept reading its own cache. A `synchronize` before the
  read fixed it.
- **A pause between shows** (default one minute): after a train or a fact
  the board goes quiet and only the map with the clock is left. Without it
  the board flickered from one show straight into the next.
- **Dashboards refresh one widget per cycle**, with text widgets rolling
  over on the mechanical board and bar widgets growing their width.
