/**
 * Звірка JS-роутингу проти пітонівського еталона на справжньому фіді.
 *
 * Порт RAPTOR легко зробити «майже правильним»: фікстурні тести проходять,
 * а на країні результати розходяться. Тому обидві реалізації ганяються на
 * тому самому фіді, і різниця має бути нульовою.
 *
 * Запуск (з кореня проєкту): node tools/crosscheck.mjs
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DATA = 'web/public/data';
const STATIONS = ['Berlin Hbf', 'Köln Hbf', 'Ulm Hauptbahnhof', 'Bremen Hbf'];

const { decodeFeed } = await import('../web/src/feed.js');
const { reverseFeed } = await import('../web/src/raptor.js');
const { dayTripWindows } = await import('../web/src/daytrip.js');

const python = `
import json
from build.calendar_pick import monday_service_days
from build.daytrip import day_trip_windows
from build.gtfs_ingest import load_gtfs

days, _ = monday_service_days("gtfs/db.zip")
feed = load_gtfs("gtfs/db.zip", days=days)
rev = feed.reversed()
names = {str(n): i for i, n in enumerate(feed.stop_names)}
out = {}
for name in ${JSON.stringify(STATIONS)}:
    idx = names[name]
    w = day_trip_windows(feed, str(feed.stop_ids[idx]), reversed_feed=rev)
    out[name] = {"origin": int(idx), "windows": {str(feed.stop_index[k]): v for k, v in w.items()}}
print(json.dumps(out))
`;

console.log('рахую еталон у Python…');
const reference = JSON.parse(execFileSync('.venv/bin/python', ['-c', python], { maxBuffer: 1 << 28 }));

const meta = JSON.parse(fs.readFileSync(`${DATA}/feed.meta.json`));
const bin = fs.readFileSync(`${DATA}/feed.bin`);
const feed = decodeFeed(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta);
const reversed = reverseFeed(feed);

let ok = true;
for (const [name, ref] of Object.entries(reference)) {
  const started = Date.now();
  const got = dayTripWindows(feed, reversed, ref.origin);
  const ms = Date.now() - started;

  const mine = new Map();
  for (let k = 0; k < got.stops.length; k += 1) {
    mine.set(String(got.stops[k]), [got.arrivals[k], got.departures[k]]);
  }

  let mismatch = 0;
  let missing = 0;
  let extra = 0;
  for (const [key, expected] of Object.entries(ref.windows)) {
    const actual = mine.get(key);
    if (!actual) missing += 1;
    else if (actual[0] !== expected[0] || actual[1] !== expected[1]) mismatch += 1;
  }
  for (const key of mine.keys()) if (!(key in ref.windows)) extra += 1;

  const clean = !mismatch && !missing && !extra;
  ok &&= clean;
  console.log(
    `${clean ? 'OK ' : 'РІЗНИЦЯ'} ${name.padEnd(18)} станцій ${mine.size}` +
      `  розбіжність ${mismatch}  бракує ${missing}  зайвих ${extra}  | ${ms} ms`,
  );
}

if (!ok) {
  console.error('\nJS і Python розходяться');
  process.exit(1);
}
console.log('\nJS збігається з Python до секунди');
