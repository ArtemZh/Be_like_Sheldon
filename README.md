# Where can I get in a day

Three modes on one map of Germany:

- **Where can I get** — where a train can take you there and back on a
  Monday (leaving after 09:00, back by 23:00), and how many useful hours
  are left once you arrive. The metric is not travel time but **useful
  time on the ground**: the window between arriving and the last train
  back, minus an hour for the station, a coffee and a hotdog.
- **Sheldon's route** — a narrated map: the trip from *Young Sheldon* as
  three routes, where the text and the map drive each other.
- **Screen saver** — one Monday's timetable in motion: stations light up
  while a train is standing there, and a board alternates between a live
  train and a fact about German railways.

## How it works

Nothing is precomputed. The build turns GTFS into a compact binary
timetable (4.7 MB, 1.7 MB gzipped); the browser loads it once and runs
RAPTOR in a Web Worker — 10–40 ms per query. That is why the origin can be
**any** of the 7737 stations, wherever you click on the map.

The Python implementation of RAPTOR stays the reference: both run against
the same fixture, and on the real feed the results are compared number by
number (`tools/crosscheck.mjs`).

## The map

The base map is our own: one GeoJSON with the borders of the sixteen
federal states, while tracks and stations are drawn by the application
itself. Anything outside Germany never reaches the map. A second base map
(CARTO) is still available on a switch, for when context is needed: roads,
towns, neighbouring countries.

## Languages

The interface is translated into English, German, Polish and Ukrainian;
English is the default and the choice is remembered in the browser. **All
texts live in `web/src/strings.js`**: the key and four languages side by
side, facts, story and guided tour included. Tests check that every key has
all four languages and that the placeholders match.

## Sources

The "Sources" button in the right-hand panel opens the full list: the feed,
the country geometry, the walking route, base maps, fonts and every
Wikipedia article the facts are drawn from.

Two frames from *Young Sheldon* (`web/public/intro.webp`, `sheldon.webp`)
are not in the repository: the studio owns the rights. The intro window and
the story page work without them — put the files next to the code locally
and they will be picked up.

MIT covers the code. The data keeps its own licences: the gtfs.de timetable
is CC BY 4.0, the state borders dl-de/by-2-0, the walking route ODbL
(OpenStreetMap), and the fact texts CC BY-SA 4.0, because they retell
Wikipedia articles.

## Data

**The data is already in the repository.** `web/public/data/` (11.2 MB) is
a built snapshot of the timetable for Monday 2026-08-31 from the `rv_free`
feed. Clone it, run `npm run dev`, and everything works: no Python and no
trip to gtfs.de are needed, and CI builds nothing either.

The price of that decision is that the data does not refresh itself. Free
feeds only cover the coming weeks, so one day the timetable will have to be
rebuilt with the script below; the current site runs on a frozen snapshot.

### Rebuilding it

1. Download a GTFS feed into `gtfs/db.zip`. Sources (gtfs.de, CC-BY 4.0):
   - regional trains, 12 MB: `https://download.gtfs.de/germany/rv_free/latest.zip`
   - everything including ICE, 272 MB: `https://download.gtfs.de/germany/free/latest.zip`
2. Build:

```bash
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/python -m build.cli gtfs/db.zip --out web/public/data
```

It takes about ten seconds. The output is `feed.bin`, `feed.meta.json`,
`stations.json`, `network.json` and `patterns.json` — plus the build
rewrites `web/src/story-paths.js` (the lines of Sheldon's route along real
stations), because they have to stay consistent with the network.

The walking route Weinheim — Heidelberg in `web/src/walk-route.js` was
routed once through OSRM and saved into the code; it does not depend on the
timetable:

```bash
curl -s 'https://router.project-osrm.org/route/v1/foot/8.66552,49.55332;8.67583,49.40393?overview=full&geometries=geojson'
```

The GitHub Pages deploy builds the data itself: the workflow downloads a
fresh `rv_free`, runs `build.cli` and the tests, and only then builds the
site.

## The macOS screen saver

`macos/` holds an ordinary `.saver` screen saver with this map. It works
**entirely offline**: the built site together with the timetable lives
inside the bundle and is served to the web view over a custom `sheldon://`
scheme, so no network is needed at all.

```bash
macos/build.sh
cp -R "macos/build/Be like Sheldon.saver" ~/Library/Screen\ Savers/ && pkill -f legacyScreenSaver
```

Then open "System Settings → Screen Saver" and pick "Be like Sheldon". The
`pkill` is needed because the system keeps the old bundle in memory and
would otherwise go on showing it after the files are replaced.

One thing inside is not obvious. Since Sonoma, ScreenSaverEngine holds the
saver view in such a way that WebKit considers its window occluded by other
windows and puts the page to sleep: `requestAnimationFrame` dies, workers
sleep, and the picture freezes after the first frame. A single call to
`_setWindowOcclusionDetectionEnabled:NO` fixes it — private, but the same
one WebViewScreenSaver uses. Without it the saver shows a frozen or black
screen.

`Be like Sheldon Screen.app` is built alongside: the same map as an
ordinary full-screen application that any mouse movement closes. It is
there to be launched by hand, or by an idle agent
(`macos/install-agent.sh 300`), if the system screen saver does not suit
for some reason:

```bash
open "macos/build/Be like Sheldon Screen.app"
```

It builds without Xcode: Command Line Tools are enough. The code is
Objective-C on purpose — in CLT the Swift compiler is newer than the SDK
and cannot build `WebKit.swiftinterface`; clang has no such limitation.

There is no Apple Developer signature, so the bundles are signed ad-hoc:
they work on your own machine, but cannot be shared.

Settings — language, real time or an accelerated day, day length, your own
federal state, and the rhythm of the board, facts, pauses, widget refresh
and second-screen delay — live in `ScreenSaverDefaults` of the
`ua.zhavrotskyi.sheldonsaver` module. They are set in the saver's "Options"
window, and the page receives them as address parameters. The whole address
can be replaced:

```bash
defaults write ua.zhavrotskyi.sheldonsaver url "http://localhost:5180/?mode=screen&chrome=off"
```

The page understands `?mode=day|sheldon|screen`, `?chrome=off` (keep the
dashboards but remove everything clickable), `?panel=off` (hide the side
panel entirely) and the screen saver settings — `?lang=en|de|pl|uk`,
`?speed=real|fast`, `?scope=all|view`, `?minutes=10…60`, `?board=`,
`?fact=`, `?pause=`, `?refresh=`, `?tour=`, `?delay=` (all in seconds),
`?region=<capital city>`, `?sync=on|off`, `?display=main|second`. The same
parameters come in handy for a kiosk.

## Tests

```bash
.venv/bin/pytest              # fast, on the fixture feed
.venv/bin/pytest -m slow      # on the real feed, needs gtfs/db.zip
cd web && npm test            # frontend and the JS routing
node tools/crosscheck.mjs     # JS against Python on the real feed
```

## Frontend

```bash
cd web && npm install && npm run dev
```
