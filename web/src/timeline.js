/**
 * Час доби як стан карти.
 *
 * Зворотний шлях не окрема фаза анімації: у кожної станції є вікно
 * [приїзд, останнє відправлення назад], тому один прохід часу показує
 * обидва напрямки. Спершу станції зʼявляються (доїхали), потім гаснуть
 * одна за одною (останній потяг додому вже пішов).
 */

export const PENDING = 0;
export const LIVE = 1;
export const EXPIRED = 2;

/**
 * Стан станції на момент часу.
 * @param {number[]} window [приїзд, останнє відправлення назад]
 */
export function phaseAt([arrival, departure], time) {
  if (time < arrival) return PENDING;
  if (time > departure) return EXPIRED;
  return LIVE;
}

/**
 * Скільки станцій «живі» в кожен момент — профіль для шкали.
 *
 * Рахується один раз на результат: це підмітка під повзунком, яка показує,
 * коли досяжність набирає максимум і коли починає обвалюватись.
 *
 * @returns {{counts: Uint16Array, peak: number, peakIndex: number}}
 */
export function liveProfile(points, { from, to, buckets = 120 }) {
  const counts = new Uint16Array(buckets);
  if (points.length === 0) return { counts, peak: 0, peakIndex: 0 };

  const span = Math.max(1, to - from);
  const bucketOf = (time) =>
    Math.min(buckets - 1, Math.max(0, Math.floor(((time - from) / span) * buckets)));

  for (const point of points) {
    const start = bucketOf(point.window[0]);
    const end = bucketOf(point.window[1]);
    for (let i = start; i <= end; i += 1) counts[i] += 1;
  }

  let peak = 0;
  let peakIndex = 0;
  for (let i = 0; i < buckets; i += 1) {
    if (counts[i] > peak) {
      peak = counts[i];
      peakIndex = i;
    }
  }
  return { counts, peak, peakIndex };
}

/** Полілінія профілю у координатах 0..width / 0..height, готова для SVG. */
export function profilePath({ counts, peak }, width, height) {
  if (peak === 0) return '';
  const step = width / (counts.length - 1 || 1);
  const points = Array.from(counts, (value, i) => {
    const x = (i * step).toFixed(2);
    const y = (height - (value / peak) * height).toFixed(2);
    return `${x},${y}`;
  });
  return `M0,${height} L${points.join(' L')} L${width},${height} Z`;
}
