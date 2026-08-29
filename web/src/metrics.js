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
 * Відфільтрувати станції за слайдерами.
 * @returns {Record<string, {window: number[], useful: number}>}
 */
export function filterStations(windows, { minStay, overhead }) {
  const out = {};
  for (const [stopId, window] of Object.entries(windows)) {
    const useful = usefulTime(window, overhead);
    if (useful >= minStay) {
      out[stopId] = { window, useful };
    }
  }
  return out;
}

/** 23400 -> "6 год 30 хв" */
export function formatHours(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (minutes === 0) return `${hours} год`;
  return `${hours} год ${minutes} хв`;
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
