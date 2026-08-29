/**
 * Роутинг у фоновому потоці.
 *
 * Один прогін — 10–40 мс, але фід треба спершу завантажити (4.7 МБ) і
 * розвернути. Тримати це в головному потоці означало б підвисання інтерфейсу
 * на старті, тому вся робота з розкладом живе тут.
 */

import { loadFeed } from './feed.js';
import { reverseFeed } from './raptor.js';
import { dayTripWindows } from './daytrip.js';

let feed = null;
let reversed = null;

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

  if (message.type === 'route') {
    if (!feed) {
      self.postMessage({ type: 'error', message: 'розклад ще не завантажено' });
      return;
    }
    const result = dayTripWindows(feed, reversed, message.origin, message.departAfter, message.returnBy);
    self.postMessage(
      { type: 'result', origin: message.origin, ...result },
      [result.stops.buffer, result.arrivals.buffer, result.departures.buffer],
    );
  }
};
