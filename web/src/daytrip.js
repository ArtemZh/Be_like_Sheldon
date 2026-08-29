/**
 * Вікно день-трипу: злиття прямого й зворотного профілів.
 *
 * Порт build/daytrip.py. Повертає для кожної досяжної станції пару
 * [найраніший приїзд, найпізніше відправлення назад] — рівно те, що раніше
 * лежало у передрахованих JSON.
 */

import { earliestArrivals, UNREACHABLE } from './raptor.js';

export const DEPART_AFTER = 9 * 3600;
export const RETURN_BY = 23 * 3600;
/** 09:00 наступного дня — 33 години від півночі дня виїзду. */
export const RETURN_BY_NEXT_MORNING = 33 * 3600;

export function dayTripWindows(feed, reversed, origin, departAfter = DEPART_AFTER, returnBy = RETURN_BY) {
  const forward = earliestArrivals(feed, origin, departAfter);
  const backward = earliestArrivals(reversed, origin, -returnBy);

  const stops = [];
  const arrivals = [];
  const departures = [];

  for (let i = 0; i < feed.nStops; i += 1) {
    if (i === origin) continue;
    const arrival = forward[i];
    if (arrival >= UNREACHABLE || backward[i] >= UNREACHABLE) continue;
    const latestDeparture = -backward[i];
    if (latestDeparture < arrival) continue;

    stops.push(i);
    arrivals.push(arrival);
    departures.push(latestDeparture);
  }

  return {
    stops: Uint16Array.from(stops),
    arrivals: Int32Array.from(arrivals),
    departures: Int32Array.from(departures),
  };
}
