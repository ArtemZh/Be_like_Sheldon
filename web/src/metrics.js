/**
 * Арифметика день-трипу. Чисті функції, без DOM і без карти.
 *
 * Вікно станції — пара [найраніший приїзд, найпізніше відправлення назад]
 * у секундах від півночі, як його порахувала збірка.
 */

/** Корисний час на місці: вікно мінус накладні витрати (вокзал, кава, хотдог). */
export function usefulTime(window, overhead) {
  const [arrival, departure] = window;
  return departure - arrival - overhead;
}

/**
 * Відфільтрувати результат роутингу за слайдерами.
 *
 * Вхід — типізовані масиви від воркера: паралельні stops / arrivals /
 * departures. Фільтр дешевий, бо це арифметика над двома числами, тому
 * слайдери можуть рухатись без перерахунку маршрутів.
 *
 * @returns {{stop: number, useful: number, window: number[]}[]}
 */
export function filterWindows({ stops, arrivals, departures }, { minStay, overhead }) {
  const out = [];
  for (let i = 0; i < stops.length; i += 1) {
    const useful = departures[i] - arrivals[i] - overhead;
    if (useful >= minStay) {
      out.push({ stop: stops[i], useful, window: [arrivals[i], departures[i]] });
    }
  }
  return out;
}

/**
 * Найближча до точки станція відправлення.
 *
 * Прораховані наперед лише вибрані станції, тому клік по будь-якому місцю
 * карти означає «звідси» приблизно: беремо найближчий доступний старт.
 * Відстань — рівнопроміжкове наближення, для сотень кілометрів цього досить.
 *
 * @param {{lat: number, lon: number}} point
 * @param {{id: string, lat: number, lon: number}[]} origins
 * @returns {{id: string, lat: number, lon: number} | null}
 */
export function nearestOrigin(point, origins) {
  let best = null;
  let bestScore = Infinity;
  const cos = Math.cos((point.lat * Math.PI) / 180);

  for (const origin of origins) {
    const dLat = origin.lat - point.lat;
    const dLon = (origin.lon - point.lon) * cos;
    const score = dLat * dLat + dLon * dLon;
    if (score < bestScore) {
      bestScore = score;
      best = origin;
    }
  }
  return best;
}
