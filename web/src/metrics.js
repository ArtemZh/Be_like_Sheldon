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
