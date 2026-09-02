/**
 * Роутинг і побудова зон у фоновому потоці.
 *
 * Один прогін RAPTOR — 10–40 мс, а зона по країні — до 280 мс. Обидва
 * числа не влазять у кадр, тому вся важка робота живе тут: головний потік
 * лише малює те, що прийшло, і анімація тримає 60 к/с.
 */

import { loadFeed } from './feed.js';
import { reverseFeed } from './raptor.js';
import { dayTripWindows } from './daytrip.js';
import { buildZones } from './grid.js';
import { filterWindows } from './metrics.js';
import { phaseAt, LIVE } from './timeline.js';
import {
  buildKilometres,
  buildLiveIndex,
  departuresByHour,
  peakMinute,
  randomTrain,
  statesAt,
  kindsAt,
} from './live.js';

let feed = null;
let reversed = null;
let lastResult = null;
let coords = null; // { lat: Float32Array, lon: Float32Array } за індексом станції
let live = null; // індекс «хвилина -> зайняті станції» для скрінсейвера
let routes = null; // назви ліній: потрібні лише для розподілу «хто зараз їде»

/** Той самий генератор, що й на сторінці: одне зерно — та сама послідовність. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let kilometres = null; // накопичені поїздо-кілометри по хвилинах доби

/** Станції, придатні для зони на заданий момент часу. */
function zonePoints({ minStay, overhead, clock }) {
  const points = [];
  for (const entry of filterWindows(lastResult, { minStay, overhead })) {
    // згасла чи ще не досяжна станція в зону не входить:
    // зона має і наростати, і стягуватись разом із крапками
    if (clock !== null && phaseAt(entry.window, clock) !== LIVE) continue;
    points.push({
      lat: coords.lat[entry.stop],
      lon: coords.lon[entry.stop],
      useful: entry.useful,
    });
  }
  return points;
}

self.onmessage = async (event) => {
  const message = event.data;

  if (message.type === 'init') {
    try {
      feed = await loadFeed(message.dataUrl);
      reversed = reverseFeed(feed);
      self.postMessage({ type: 'ready', nStops: feed.nStops });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error.message ?? error) });
    }
    return;
  }

  // Скрінсейвер питає стан мережі щокадру, тому індекс будуємо один раз і
  // ліниво: денному режиму він не потрібен взагалі.
  if (message.type === 'routes') {
    routes = message.routes;
    return;
  }

  if (message.type === 'live') {
    if (!feed) return;
    if (!live) {
      live = buildLiveIndex(feed);
      // кілометри рахуємо, лише коли вже приїхали координати станцій
      if (coords) kilometres = buildKilometres(feed, coords);
      self.postMessage({
        type: 'live-ready',
        hours: departuresByHour(live),
        peak: peakMinute(live),
      });
    }

    // Три стани: стоїть, рушає за півхвилини, щойно поїхав. Пласкі масиви,
    // бо це йде в головний потік щокадру.
    const { standing, leaving, arrived } = statesAt(live, message.time);
    const size = standing.size + leaving.length + arrived.length;
    const stops = new Uint16Array(size);
    const phase = new Uint8Array(size);
    const value = new Float32Array(size); // потягів для «стоїть», вік для решти
    let i = 0;
    for (const [stop, trains] of standing) {
      stops[i] = stop;
      phase[i] = 1;
      value[i] = Math.min(trains, 255);
      i += 1;
    }
    for (const { stop, age } of leaving) {
      stops[i] = stop;
      phase[i] = 2;
      value[i] = age;
      i += 1;
    }
    for (const { stop, age } of arrived) {
      stops[i] = stop;
      phase[i] = 0;
      value[i] = age;
      i += 1;
    }

    self.postMessage(
      {
        type: 'live',
        time: message.time,
        stops,
        phase,
        value,
        counts: {
          standing: standing.size,
          leaving: leaving.length,
          arrived: arrived.length,
          // скільки країна проїхала від початку доби і як часто зараз
          // рушають потяги
          km: kilometres ? kilometres[Math.floor(message.time / 60)] : null,
          departuresThisMinute: live.departures[Math.floor((message.time % 86400) / 60)],
          kinds: routes ? kindsAt(live, message.time, routes) : null,
        },
      },
      [stops.buffer, phase.buffer, value.buffer],
    );
    return;
  }

  // Один випадковий потяг, що зараз у дорозі: для віджета «зараз їде».
  if (message.type === 'train') {
    if (!feed) return;
    // bounds — [[захід, південь], [схід, північ]]; якщо їх немає, шукаємо
    // по всій країні
    const box = message.bounds;
    const inside =
      box && coords
        ? (stop) =>
            coords.lon[stop] >= box[0][0] &&
            coords.lon[stop] <= box[1][0] &&
            coords.lat[stop] >= box[0][1] &&
            coords.lat[stop] <= box[1][1]
        : null;
    // Зерно приходить, коли обидва екрани мають показати один і той самий
    // потяг: без нього кожен обрав би свій.
    const rand = message.seed === null || message.seed === undefined ? undefined : seeded(message.seed);
    const train = randomTrain(feed, message.time, { inside, ...(rand ? { rand } : {}) });
    self.postMessage({ type: 'train', time: message.time, train });
    return;
  }

  if (message.type === 'coords') {
    coords = { lat: message.lat, lon: message.lon, german: message.german };
    return;
  }

  if (message.type === 'route') {
    if (!feed) {
      self.postMessage({ type: 'error', message: 'розклад ще не завантажено' });
      return;
    }
    const result = dayTripWindows(
      feed,
      reversed,
      message.origin,
      message.departAfter,
      message.returnBy,
    );
    lastResult = result;
    // копії, бо оригінали віддаємо разом із буферами
    self.postMessage({
      type: 'result',
      origin: message.origin,
      stops: result.stops.slice(),
      arrivals: result.arrivals.slice(),
      departures: result.departures.slice(),
    });
    return;
  }

  if (message.type === 'zones') {
    if (!lastResult || !coords) return;
    const zones = buildZones(zonePoints(message), message.breaks, message.quality);
    self.postMessage({ type: 'zones', requestId: message.requestId, zones });
  }
};
