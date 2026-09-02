# Where can I get in a day — project handover

State as of 2026-09-02. Branch `main-deploy`; the screen saver work and the
board rework are committed.

## What this is

Three applications on one map of Germany. The mode switch sits top left,
right next to the panel; language, theme, base map and "Sources" are on the
right.

1. **Where can I get** — click anywhere, we take the nearest station and
   show where you can go there and back in a day.
2. **Sheldon's route** — a narrated map: the trip from *Young Sheldon*
   (season 7, episode 3) as three routes and six paragraphs.
3. **Screen saver** — a non-interactive board: one Monday's timetable in
   motion, a clock, dashboards, and every half minute either a live train
   with its route or a fact about German railways.

The key decision behind the first mode, the one the project grew from: the
metric is not travel time but **useful time on the ground**. The window
between arriving and the last train back, minus an hour for the station, a
coffee and a hotdog.

## How it works

Nothing is precomputed. The build turns GTFS into a compact binary
timetable, the browser loads it once and runs RAPTOR in a Web Worker —
10–40 ms per query. That is why the origin can be any of the 7737 stations.

```
GTFS zip
  │  build/  — Python: ingest, service-day selection, binary export
  ▼
web/public/data/  feed.bin (9.7 MB) + stations.json + network.json + patterns.json
  ▼
web/src/worker.js — RAPTOR, zones, the "who is standing now" index, off the main thread
  ▼
web/src/map.js — MapLibre: three modes, our own base map, the board
```

### Python (`build/`)

| Module | Responsibility |
|---|---|
| `gtfs_ingest.py` | GTFS → `Feed`; trains only, platforms merged, line names |
| `calendar_pick.py` | which service_ids run on Monday and the next day |
| `feed.py` | the compact timetable representation, `reversed()` |
| `raptor.py` | RAPTOR: earliest arrivals from a station |
| `daytrip.py` | merging the forward and return profiles into a window |
| `binary_feed.py` | `Feed` → `feed.bin` + `feed.meta.json` |
| `network.py` | the network diagram: transitive reduction, corridor rule, threshold |
| `germany.py` | whether a station is in Germany and in which state, by map geometry |
| `origins.py` | departure stations: state capitals plus the largest hubs |
| `story_paths.py` | the lines of Sheldon's route along real stations |
| `cli.py` | the whole build |

### Frontend (`web/src/`)

`raptor.js` and `daytrip.js` are ports of the Python modules onto typed
arrays. `feed.js` reads the binary feed. `grid.js` builds the zones.
`live.js` is the "what is happening at 14:37" index for the screen saver.
`metrics.js`, `timeline.js`, `flap.js`, `tour.js`, `theme.js`, `names.js`,
`regions.js` are pure logic with tests. `map.js` is the only place with DOM
and MapLibre. `worker.js` does the heavy lifting.

Data that does not depend on the timetable lives in modules: `strings.js`
(all texts, key plus four languages), `facts.js` + `sources.js` (facts and
sources), `sheldon.js` (the story routes), `walk-route.js` and
`story-paths.js` (geometry generated once).

## Running it

```bash
# the data is already in the repository — the frontend is enough
cd web && npm install && npm run dev

# rebuild the timetable (needs gtfs/db.zip, see README)
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/python -m build.cli gtfs/db.zip --out web/public/data
```

## Checks

```bash
.venv/bin/pytest              # 58 tests on the fixture feed
.venv/bin/pytest -m slow      # 2 tests on the real one, needs gtfs/db.zip
cd web && npm test            # 127 frontend tests
node tools/crosscheck.mjs     # JS against Python on the real feed
```

**`crosscheck.mjs` is the main safeguard.** A RAPTOR port is easy to get
"almost right": the fixture tests pass while the results diverge across the
country. The script runs both implementations on the same feed and demands
zero difference. If you touch routing, run it.

## Decisions worth knowing before editing

**Platforms are merged into stations.** In the DELFI feed every platform is
a separate stop sharing a `parent_station`: 16566 rows for 7737 stations.
A station's name is the most frequent one among its platforms, because
Berlin's parent row is called "S+U Berlin Hauptbahnhof" and Hamburg has no
parent row at all.

**A transfer costs 5 minutes** of boarding penalty in RAPTOR — a
consequence of merging platforms.

**RAPTOR rounds read only the previous round.** There was a bug: both
implementations updated a shared array of times during a round, and the
answer depended on the order patterns were visited. Do not "optimise" that
back.

**Two service days.** The overnight mode needs Tuesday morning trains. A
trip whose service runs on both days enters the timetable twice — those are
different trains, not duplicates.

**Zones are built by the worker.** A rebuild costs up to 280 ms and does
not fit into a frame.

**The network diagram is cleaned by three rules**, each catching its own
case: transitive reduction drops a chord when the same path is already
drawn by shorter segments; the corridor rule drops a line that runs past
stations it skips (more than 4 within a 5 km band); the 100 km threshold
cuts long jumps that a regional feed has no replacement for. Together:
9346 → 6637 segments.

**Nothing outside Germany is on the map.** `germany.py` marks stations by
the same geometry that draws the base map; a segment reaches the map only
when both ends are inside. **The binary feed stays complete** — routing to
Prague works exactly as it did.

**Our base map is not tiles but one GeoJSON** of 16 states. Tracks and
stations are drawn by the application. The second base map (CARTO) stayed
on a switch, for when context is needed.

**The screen saver has its own index.** `live.js` spreads every stop across
the minutes of the day (CSR arrays), so "who is standing now" is a slice of
an array rather than a walk over trips. Events are deliberately smeared
across the minute by a deterministic offset: GTFS records time to the
minute, and without the jitter the whole country changed colour at once.

**The live stations layer updates once per timetable second, not per
frame.** Redrawing 1700 dots 60 times a second ate every tenth frame:
MapLibre re-tiles the whole layer each time. After the throttle the p99
frame dropped from 70 to 18 ms.

**All texts live in `strings.js`.** Key and four languages side by side; a
test watches that every key has all languages, that the placeholders match,
and that every key used in the markup or the code actually exists — a
missing key is silently rendered as its own name.

**Dashboards refresh one widget per cycle.** The panel used to redraw
whole, once a minute, and nobody noticed the change. Now a single widget is
repainted in turn: text widgets roll over on the mechanical board
(`flap.js`), bar widgets grow their width. The first batch of data paints
everything at once, otherwise half the panel sits empty while each widget
waits for its turn.

## The macOS screen saver (`macos/`)

An ordinary `.saver`: the same site in a `WKWebView` inside the screen
saver window. Four parts:

| File | What it does |
|---|---|
| `Site.h/.m` | serves the site from the bundle over the custom `sheldon://` scheme (with `file://` WebKit forbids fetch and workers) |
| `SheldonSaver.m` | the saver itself: the web view, the "Options" window, the log |
| `Companion.m` | `Be like Sheldon Screen.app` — the same map as an ordinary application, for launching by hand |
| `idle-watch.sh` + `install-agent.sh` | a launchd agent that starts the application after an idle period — the fallback if the system screen saver does not suit |

```bash
macos/build.sh
cp -R "macos/build/Be like Sheldon.saver" ~/Library/Screen\ Savers/ && pkill -f legacyScreenSaver
open -a ScreenSaverEngine          # start the saver now
```

The `pkill` is mandatory: the system keeps the old bundle in memory and
goes on showing it after the files are replaced. The saver's log is
`sheldon-saver.log` in
`~/Library/Containers/com.apple.ScreenSaver.Engine.legacyScreenSaver/Data/tmp/`;
`NSLog` does not escape the sandbox. The page writes there through
`webkit.messageHandlers.saver` (`reportToSaver` in `map.js`, every 30 s).

**The one non-obvious thing is `_setWindowOcclusionDetectionEnabled:NO`.**
Since Sonoma, ScreenSaverEngine holds the saver view in such a way that
WebKit considers its own window occluded by other windows and puts the page
to sleep: `document.hidden` becomes true, rAF dies after the first frame,
workers sleep, layers stop updating. The private call turns that check off;
after it the page lives as it does in a browser (`hidden=false`, rAF at
~50 fps, verified by screenshots taken at intervals). WebViewScreenSaver
(`liquidx/webviewscreensaver`) uses the same call.

The history, so that nobody repeats it: before that fix we tried replacing
rAF with a timer, copying the WebGL frame into a 2D canvas, nudging the
compositor, `WKSnapshot`, an own window on top, and finally a companion
application launched by a thin saver — and macOS does not show other
applications' windows above a running screen saver, so that was a black
screen. All of it treated the symptoms of a single flag, and was deleted
once the flag was found (`frames.js`, `mirror.js`, `nudgeCompositor`); look
for the traces in `git log` before `f5c3b79`.

Settings live in two places and must be kept in step: the saver's
"Options" window (`SheldonSaver.m`, with its own four-language dictionary —
native code cannot reach `strings.js`) and the panel in the web version.
The saver also has the second-screen delay and "same content on both
screens"; the web version has neither, because there is only one window.

The page knows it is in kiosk mode from the address parameters (`mode`,
`chrome`, `lang`, `speed`, `minutes`, `board`, `fact`, `pause`, `refresh`,
`tour`, `delay`, `region`, `sync`, `display`); the mode is set by a small
inline script in `index.html` before the first frame, otherwise the day
view flashes.

## Data

The feed is gtfs.de (which aggregates the national DELFI), licensed
CC-BY 4.0. It is currently built from `rv_free` — **regional trains only,
no ICE**. Long-distance directions are therefore poorer than they should
be. The full feed (272 MB) fixes that without a code change.

**The built data is in the repository** — `web/public/data/`, 11.2 MB, a
snapshot of Monday 2026-08-31. That way the site and a fresh clone work
without Python, and CI only checks the code and builds the frontend. The
price: the snapshot does not refresh itself, and one day it will have to be
rebuilt with the same command — free feeds only cover the coming weeks.

The state borders (`web/public/geo/`) are committed for the same reason,
but they do not depend on the timetable at all.

## Known gaps

- **The data is frozen at 2026-08-31.** That is deliberate (see above), but
  when the timetable goes stale the site will quietly show an old Monday —
  visible only from the date in `stations.json`.
- **`walk-route.js` is built by hand.** The Weinheim — Heidelberg walking
  route was routed once through OSRM and saved into the code; the command
  is in the README. The rest of the geometry is generated by the build.
- **The mobile layout is new** and has only been checked at 375 px: map on
  top, panel below, switches at the bottom. Tablets were never looked at.
- **The frames from the series are not in the repository** —
  `web/public/intro.webp` and `sheldon.webp` are in `.gitignore`: the
  studio owns the rights. The code survives their absence (the picture
  simply disappears), and the "Sources" window says so plainly. Local
  copies sit next to the code.
- The spec in `docs/superpowers/specs/` describes an architecture that no
  longer exists (static precomputation).
- **The platform number on the train board is invented** — 1 to 4, derived
  from the trip id so that it stays put during the animation. The feed has
  no platform: they were merged into stations at build time. Nothing claims
  it is real, but nothing says it is not either.
- **The companion and the idle agent** duplicate the saver; if the `.saver`
  proves reliable on other Macs, they can go along with
  `install-agent.sh`.
- **The flag is private.** If Apple removes it, the saver will freeze again
  — the log will show it (`hidden=true` in the page reports, if the probe
  is put back).
- **The tour across states has only been seen on one screen.** With two
  screens the second one is supposed to travel while the main one holds the
  chosen state; nobody has watched that yet.

## What to do next

The full feed with ICE is the cheapest change with the biggest effect.
After that: an arbitrary departure time instead of the hardcoded 09:00 (the
worker already takes it as a parameter), translations of station names
where they are technical (`Wernigerode Brm_Bro 004 P4`), and
`feature-state` instead of rebuilding GeoJSON, should the screen saver
start to lag on weaker machines.
