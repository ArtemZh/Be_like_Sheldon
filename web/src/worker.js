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

let feed = null;
let reversed = null;
let lastResult = null;
let coords = null; // { lat: Float32Array, lon: Float32Array } за індексом станції

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

  if (message.type === 'coords') {
    coords = { lat: message.lat, lon: message.lon };
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
