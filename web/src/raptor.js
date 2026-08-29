/**
 * RAPTOR на типізованих масивах — порт build/raptor.py.
 *
 * Пітонівська реалізація лишається еталоном: обидві ганяються на тій самій
 * фікстурі, а на справжньому фіді результати звіряються числом у числo.
 *
 * Фід — простий обʼєкт із типізованими масивами:
 *   patternPtr[p]..patternPtr[p+1]   — зупинки патерна p у patternStops
 *   patternTripPtr[p]..[p+1]         — рейси патерна p
 *   tripBlockStart[t]                — початок блоку часів рейсу t
 */

export const UNREACHABLE = 2147483647;
export const MIN_TRANSFER_SECONDS = 5 * 60;
export const MAX_ROUNDS = 5; // до 4 пересадок

/**
 * Індекс «які патерни проходять через зупинку і на якій позиції».
 * Будується один раз на фід і кешується на ньому ж.
 */
function stopPatterns(feed) {
  if (feed._stopPatterns) return feed._stopPatterns;

  const counts = new Uint32Array(feed.nStops + 1);
  for (let i = 0; i < feed.patternStops.length; i += 1) counts[feed.patternStops[i] + 1] += 1;
  for (let s = 0; s < feed.nStops; s += 1) counts[s + 1] += counts[s];

  const ptr = counts;
  const cursor = ptr.slice(0, feed.nStops);
  const patterns = new Uint32Array(feed.patternStops.length);
  const positions = new Uint16Array(feed.patternStops.length);

  for (let p = 0; p < feed.nPatterns; p += 1) {
    const lo = feed.patternPtr[p];
    const hi = feed.patternPtr[p + 1];
    for (let pos = 0; pos < hi - lo; pos += 1) {
      const stop = feed.patternStops[lo + pos];
      const at = cursor[stop];
      cursor[stop] = at + 1;
      patterns[at] = p;
      positions[at] = pos;
    }
  }

  feed._stopPatterns = { ptr, patterns, positions };
  return feed._stopPatterns;
}

/**
 * Найраніший час приїзду в кожну зупинку.
 *
 * Раунд k читає лише результати раунду k−1 і пише у власний масив, тому
 * результат не залежить від порядку сканування патернів. Якщо оновлювати
 * один спільний масив по ходу, відповідь починає залежати від порядку
 * обходу — саме на цьому спершу розійшлися Python і JS.
 *
 * Працює і на розвернутому фіді: там «приїзд» означає «−відправлення»,
 * а departureAfter — це −(дедлайн повернення).
 *
 * @returns {Int32Array} час у секундах або UNREACHABLE
 */
export function earliestArrivals(feed, origin, departureAfter, maxRounds = MAX_ROUNDS) {
  const best = new Int32Array(feed.nStops).fill(UNREACHABLE);
  best[origin] = departureAfter;
  let prev = best.slice();

  const { ptr, patterns, positions } = stopPatterns(feed);
  let marked = [origin];

  for (let round = 0; round < maxRounds; round += 1) {
    // найраніша позиція, з якої треба сканувати кожен зачеплений патерн
    const queue = new Map();
    for (const stop of marked) {
      for (let i = ptr[stop]; i < ptr[stop + 1]; i += 1) {
        const pattern = patterns[i];
        const pos = positions[i];
        const known = queue.get(pattern);
        if (known === undefined || pos < known) queue.set(pattern, pos);
      }
    }

    const curr = best.slice();
    const improved = new Set();
    for (const [pattern, startPos] of queue) {
      scanPattern(feed, pattern, startPos, prev, curr, best, origin, improved);
    }

    for (let i = 0; i < best.length; i += 1) if (curr[i] < best[i]) best[i] = curr[i];

    if (improved.size === 0) break;
    marked = [...improved];
    prev = curr;
  }

  return best;
}

/**
 * Проїхати патерн, підхопивши найраніший придатний рейс.
 *
 * Посадка вирішується за prev (результат попереднього раунду), приїзди
 * пишуться в curr. Посадка на іншому вузлі, ніж origin, вимагає
 * MIN_TRANSFER_SECONDS запасу: станції зведені до одного вузла, тому
 * перехід між платформами більше не коштує часу сам собою.
 */
function scanPattern(feed, pattern, startPos, prev, curr, best, origin, improved) {
  const lo = feed.patternPtr[pattern];
  const length = feed.patternPtr[pattern + 1] - lo;
  const tripLo = feed.patternTripPtr[pattern];
  const tripHi = feed.patternTripPtr[pattern + 1];

  let currentTrip = -1;
  let currentBase = 0;

  for (let pos = startPos; pos < length; pos += 1) {
    const stop = feed.patternStops[lo + pos];

    if (currentTrip >= 0) {
      const arrival = feed.tripArr[currentBase + pos];
      if (arrival < best[stop] && arrival < curr[stop]) {
        curr[stop] = arrival;
        improved.add(stop);
      }
    }

    if (prev[stop] < UNREACHABLE) {
      const slack = stop === origin ? 0 : MIN_TRANSFER_SECONDS;
      const boardable = firstTripAfter(feed, pos, prev[stop] + slack, tripLo, tripHi);
      if (boardable >= 0 && (currentTrip < 0 || boardable < currentTrip)) {
        currentTrip = boardable;
        currentBase = feed.tripBlockStart[boardable];
      }
    }
  }
}

/** Перший рейс патерна, що відходить із позиції pos не раніше за time. */
function firstTripAfter(feed, pos, time, tripLo, tripHi) {
  for (let trip = tripLo; trip < tripHi; trip += 1) {
    if (feed.tripDep[feed.tripBlockStart[trip] + pos] >= time) return trip;
  }
  return -1;
}

/**
 * Фід із розвернутим часом.
 *
 * Порядок зупинок у кожному патерні перевернуто, часи помножено на −1,
 * arrival і departure поміняно місцями. Найраніший приїзд у цьому фіді
 * відповідає найпізнішому відправленню в оригінальному.
 */
export function reverseFeed(feed) {
  const patternStops = new Uint16Array(feed.patternStops.length);
  for (let p = 0; p < feed.nPatterns; p += 1) {
    const lo = feed.patternPtr[p];
    const hi = feed.patternPtr[p + 1];
    for (let i = 0; i < hi - lo; i += 1) patternStops[lo + i] = feed.patternStops[hi - 1 - i];
  }

  const tripArr = new Int32Array(feed.tripArr.length);
  const tripDep = new Int32Array(feed.tripDep.length);
  for (let p = 0; p < feed.nPatterns; p += 1) {
    const length = feed.patternPtr[p + 1] - feed.patternPtr[p];
    for (let trip = feed.patternTripPtr[p]; trip < feed.patternTripPtr[p + 1]; trip += 1) {
      const base = feed.tripBlockStart[trip];
      for (let i = 0; i < length; i += 1) {
        tripArr[base + i] = -feed.tripDep[base + length - 1 - i];
        tripDep[base + i] = -feed.tripArr[base + length - 1 - i];
      }
    }
  }

  return sortTripsByDeparture({ ...feed, patternStops, tripArr, tripDep, _stopPatterns: null });
}

/** Пересортувати рейси кожного патерна за часом відправлення. */
function sortTripsByDeparture(feed) {
  const tripArr = new Int32Array(feed.tripArr.length);
  const tripDep = new Int32Array(feed.tripDep.length);

  for (let p = 0; p < feed.nPatterns; p += 1) {
    const length = feed.patternPtr[p + 1] - feed.patternPtr[p];
    const lo = feed.patternTripPtr[p];
    const hi = feed.patternTripPtr[p + 1];

    const order = [];
    for (let trip = lo; trip < hi; trip += 1) order.push(trip);
    order.sort((a, b) => feed.tripDep[feed.tripBlockStart[a]] - feed.tripDep[feed.tripBlockStart[b]]);

    for (let slot = 0; slot < order.length; slot += 1) {
      const from = feed.tripBlockStart[order[slot]];
      const to = feed.tripBlockStart[lo + slot];
      for (let i = 0; i < length; i += 1) {
        tripArr[to + i] = feed.tripArr[from + i];
        tripDep[to + i] = feed.tripDep[from + i];
      }
    }
  }

  return { ...feed, tripArr, tripDep };
}
