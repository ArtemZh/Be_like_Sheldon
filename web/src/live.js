/**
 * Що відбувається на мережі просто зараз.
 *
 * Скрінсейверу потрібен інший зріз розкладу, ніж роутингу: не «куди доїду»,
 * а «де о 14:37 стоїть потяг». Обходити всі рейси на кожен кадр надто
 * дорого, тому один раз будуємо індекс подій по хвилинах — CSR-масиви, як і
 * решта фіду, — а запит стає зрізом масиву.
 */

/** Скільки секунд станція вважається зайнятою, якщо приїзд = відʼїзд. */
export const DWELL = 60;

export const DAY = 24 * 3600;
const MINUTES = 24 * 60;

/**
 * Розкид події в межах хвилини.
 *
 * У GTFS час записаний з точністю до хвилини, тому в фіді всі приїзди
 * падають рівно на :00 — і на карті вся країна міняє колір одночасно, як
 * театральне світло. Справжні потяги так не їздять. Тому кожній події
 * додаємо сталий зсув від нуля до 59 секунд, порахований з номерів рейсу й
 * зупинки: розклад від цього не змінюється, а перемикання станів
 * розмазується по хвилині.
 *
 * Зсув детермінований: та сама подія завжди отримує ту саму секунду, інакше
 * крапки б стрибали між кадрами.
 */
export function spreadOf(stop, trip, position) {
  let hash = (stop * 73856093) ^ (trip * 19349663) ^ (position * 83492791);
  hash = (hash ^ (hash >>> 13)) >>> 0;
  return hash % 60;
}

/**
 * Індекс «хвилина -> станції, де в цю хвилину стоїть потяг».
 *
 * Подія розкладається по всіх хвилинах своєї стоянки: їх одиниці, зате
 * запит не шукає нічого — бере готовий діапазон.
 *
 * @param feed бінарний фід (див. feed.js)
 * @returns {{ptr: Uint32Array, stops: Uint16Array, departures: Uint32Array}}
 */
export function buildLiveIndex(feed, { spread = true } = {}) {
  const counts = new Uint32Array(MINUTES + 1);
  const departures = new Uint32Array(MINUTES);
  // окремо — події приїзду й відʼїзду: з них видно, хто щойно приїхав і хто
  // рушає за півхвилини
  const depCounts = new Uint32Array(MINUTES + 1);
  const arrCounts = new Uint32Array(MINUTES + 1);

  // перший прохід рахує, скільки подій припадає на кожну хвилину
  forEachStop(feed, (_stop, arrival, departure) => {
    for (let m = minuteOf(arrival); m <= minuteOf(departure + DWELL); m += 1) {
      if (m >= 0 && m < MINUTES) counts[m] += 1;
    }
    const arr = minuteOf(arrival);
    if (arr >= 0 && arr < MINUTES) arrCounts[arr] += 1;
    const dep = minuteOf(departure);
    if (dep >= 0 && dep < MINUTES) {
      departures[dep] += 1;
      depCounts[dep] += 1;
    }
  }, spread);

  const ptr = new Uint32Array(MINUTES + 1);
  for (let m = 0; m < MINUTES; m += 1) ptr[m + 1] = ptr[m] + counts[m];

  const stops = new Uint16Array(ptr[MINUTES]);
  const cursor = ptr.slice(0, MINUTES);
  forEachStop(feed, (stop, arrival, departure) => {
    for (let m = minuteOf(arrival); m <= minuteOf(departure + DWELL); m += 1) {
      if (m >= 0 && m < MINUTES) {
        stops[cursor[m]] = stop;
        cursor[m] += 1;
      }
    }
  }, spread);

  const depPtr = new Uint32Array(MINUTES + 1);
  for (let m = 0; m < MINUTES; m += 1) depPtr[m + 1] = depPtr[m] + depCounts[m];
  const depStops = new Uint16Array(depPtr[MINUTES]);
  const depSec = new Uint32Array(depPtr[MINUTES]);
  const depCursor = depPtr.slice(0, MINUTES);
  forEachStop(feed, (stop, _arrival, departure) => {
    const m = minuteOf(departure);
    if (m < 0 || m >= MINUTES) return;
    depStops[depCursor[m]] = stop;
    depSec[depCursor[m]] = departure;
    depCursor[m] += 1;
  }, spread);

  const arrPtr = new Uint32Array(MINUTES + 1);
  for (let m = 0; m < MINUTES; m += 1) arrPtr[m + 1] = arrPtr[m] + arrCounts[m];
  const arrStops = new Uint16Array(arrPtr[MINUTES]);
  const arrSec = new Uint32Array(arrPtr[MINUTES]);
  const arrCursor = arrPtr.slice(0, MINUTES);
  forEachStop(feed, (stop, arrival) => {
    const m = minuteOf(arrival);
    if (m < 0 || m >= MINUTES) return;
    arrStops[arrCursor[m]] = stop;
    arrSec[arrCursor[m]] = arrival;
    arrCursor[m] += 1;
  }, spread);

  return { ptr, stops, departures, depPtr, depStops, depSec, arrPtr, arrStops, arrSec };
}

function minuteOf(seconds) {
  return Math.floor(seconds / 60);
}

/** Обійти всі зупинки всіх рейсів фіду, розмазавши події по хвилині. */
function forEachStop(feed, visit, spread = true) {
  for (let pattern = 0; pattern < feed.nPatterns; pattern += 1) {
    const lo = feed.patternPtr[pattern];
    const hi = feed.patternPtr[pattern + 1];
    const tripLo = feed.patternTripPtr[pattern];
    const tripHi = feed.patternTripPtr[pattern + 1];
    for (let trip = tripLo; trip < tripHi; trip += 1) {
      const base = feed.tripBlockStart[trip];
      for (let pos = 0; pos < hi - lo; pos += 1) {
        const stop = feed.patternStops[lo + pos];
        const shift = spread ? spreadOf(stop, trip, pos) : 0;
        visit(stop, feed.tripArr[base + pos] + shift, feed.tripDep[base + pos] + shift);
      }
    }
  }
}

/**
 * Станції, зайняті о `seconds`, з кількістю потягів на кожній.
 *
 * @returns {Map<number, number>} станція -> скільки потягів стоїть
 */
export function activeAt(index, seconds) {
  const minute = Math.floor((((seconds % DAY) + DAY) % DAY) / 60);
  const counts = new Map();
  for (let i = index.ptr[minute]; i < index.ptr[minute + 1]; i += 1) {
    const stop = index.stops[i];
    counts.set(stop, (counts.get(stop) ?? 0) + 1);
  }
  return counts;
}

/**
 * Пікова хвилина доби: коли на зупинках стоїть найбільше потягів.
 *
 * Рахуємо з готового індексу — це один прохід по 1440 кошиках.
 */
export function peakMinute(index) {
  let minute = 0;
  let value = 0;
  for (let m = 0; m < MINUTES; m += 1) {
    const n = index.ptr[m + 1] - index.ptr[m];
    if (n > value) {
      value = n;
      minute = m;
    }
  }
  return { minute, value };
}

/**
 * Поїздо-кілометри по хвилинах доби.
 *
 * Для кожного перегону додаємо його довжину у хвилину відправлення. Далі
 * накопичувальна сума дає «скільки країна вже проїхала» на будь-який момент.
 * Координати приходять окремо, тому лічильник будується не завжди.
 */
export function buildKilometres(feed, coords) {
  const perMinute = new Float64Array(MINUTES);
  for (let pattern = 0; pattern < feed.nPatterns; pattern += 1) {
    const lo = feed.patternPtr[pattern];
    const length = feed.patternPtr[pattern + 1] - lo;
    for (let trip = feed.patternTripPtr[pattern]; trip < feed.patternTripPtr[pattern + 1]; trip += 1) {
      const base = feed.tripBlockStart[trip];
      for (let pos = 0; pos < length - 1; pos += 1) {
        const from = feed.patternStops[lo + pos];
        const to = feed.patternStops[lo + pos + 1];
        const m = Math.floor(feed.tripDep[base + pos] / 60);
        if (m < 0 || m >= MINUTES) continue;
        perMinute[m] += haversineKm(
          coords.lat[from],
          coords.lon[from],
          coords.lat[to],
          coords.lon[to],
        );
      }
    }
  }
  const cumulative = new Float64Array(MINUTES + 1);
  for (let m = 0; m < MINUTES; m += 1) cumulative[m + 1] = cumulative[m] + perMinute[m];
  return cumulative;
}

const EARTH_KM = 6371;

function haversineKm(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = p2 - p1;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/**
 * Три стани станції навколо моменту `seconds`.
 *
 * Потяг щойно приїхав, потяг стоїть, потяг рушає за півхвилини — на карті це
 * три різні речі, і кожна має свій відтінок. `age` — від 0 (щойно) до 1
 * (на межі вікна).
 */
export function statesAt(index, seconds, { window = 30 } = {}) {
  const t = ((seconds % DAY) + DAY) % DAY;
  const standing = activeAt(index, t);
  const leaving = [];
  const arrived = [];

  const minute = Math.floor(t / 60);
  const near = [minute - 1, minute, minute + 1].filter((m) => m >= 0 && m < MINUTES);

  for (const m of near) {
    for (let i = index.depPtr[m]; i < index.depPtr[m + 1]; i += 1) {
      const delta = index.depSec[i] - t;
      if (delta > 0 && delta <= window) {
        leaving.push({ stop: index.depStops[i], age: delta / window });
      }
    }
    for (let i = index.arrPtr[m]; i < index.arrPtr[m + 1]; i += 1) {
      const delta = t - index.arrSec[i];
      if (delta >= 0 && delta <= window) {
        arrived.push({ stop: index.arrStops[i], age: delta / window });
      }
    }
  }
  return { standing, leaving, arrived };
}

/** Відправлення по годинах — гістограма «пульсу дня». */
export function departuresByHour(index) {
  const hours = new Uint32Array(24);
  for (let m = 0; m < MINUTES; m += 1) hours[Math.floor(m / 60)] += index.departures[m];
  return hours;
}

/**
 * Час, який показує табло.
 *
 * У реальному режимі це годинник компʼютера; у прискореному — доба,
 * розтягнута на `durationSeconds` реального часу, циклом.
 */
export function clockAt({ accelerated, durationSeconds, elapsed, now }) {
  if (!accelerated) {
    return (now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds();
  }
  const progress = (elapsed % durationSeconds) / durationSeconds;
  return progress * DAY;
}


/**
 * Випадковий потяг, що просто зараз їде і за хвилину рушає далі.
 *
 * «За хвилину» — не прикраса: шукаємо рейс, у якого найближчий відʼїзд
 * припадає на [t, t + вікно]. Тому напис на табло правдивий, а на карті є
 * і пройдена частина маршруту, і та, що лишилась.
 *
 * @returns {{pattern, trip, stops, arr, dep, at}|null} at — індекс поточної
 * зупинки в межах патерна
 */
export function randomTrain(
  feed,
  seconds,
  { window = 60, rand = Math.random, sample = 60, inside = null } = {},
) {
  // Патерни обходимо по колу з випадкового місця, а не тикаємо навмання:
  // вночі в дорозі одиниці рейсів, і випадкові спроби їх не знаходять.
  const from = Math.floor(rand() * feed.nPatterns);
  let best = null;

  for (let k = 0; k < feed.nPatterns; k += 1) {
    const pattern = (from + k) % feed.nPatterns;
    const lo = feed.patternPtr[pattern];
    const length = feed.patternPtr[pattern + 1] - lo;
    if (length < 2) continue;

    const tripLo = feed.patternTripPtr[pattern];
    const tripHi = feed.patternTripPtr[pattern + 1];
    for (let trip = tripLo; trip < tripHi; trip += 1) {
      const base = feed.tripBlockStart[trip];
      // рейси відсортовані за відправленням з першої зупинки
      if (feed.tripDep[base] > seconds) break;
      if (feed.tripArr[base + length - 1] < seconds) continue;

      for (let pos = 0; pos < length - 1; pos += 1) {
        const departure = feed.tripDep[base + pos];
        if (departure < seconds || departure > seconds + window) continue;
        // у режимі «видима частина» цікавить лише те, що зараз на екрані:
        // рахуємо за поточною зупинкою, бо саме вона підсвічується
        if (inside && !inside(feed.patternStops[lo + pos])) continue;
        // Цікавіший той рейс, що довший і вже частину дороги проїхав:
        // інакше на карті нема чого показати сірим.
        const score = length + Math.min(pos, 10) * 2;
        if (!best || score > best.score) {
          best = { pattern, trip, at: pos, base, lo, length, score };
        }
        break;
      }
      if (best && best.score >= sample) break;
    }
    if (best && best.score >= sample) break;
  }

  if (!best) return null;
  const stops = [];
  const arr = [];
  const dep = [];
  for (let i = 0; i < best.length; i += 1) {
    stops.push(feed.patternStops[best.lo + i]);
    arr.push(feed.tripArr[best.base + i]);
    dep.push(feed.tripDep[best.base + i]);
  }
  return { pattern: best.pattern, trip: best.trip, stops, arr, dep, at: best.at };
}
