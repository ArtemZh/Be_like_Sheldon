/**
 * Точки станцій -> регулярний растр -> контури зон.
 *
 * Зони приблизні: потяг зупиняється тільки на станціях, але навколо станції
 * є пішохідна доступність. Що далі від станції, то більше часу зʼїдає дорога
 * пішки — це й є walkPenalty.
 *
 * Растр вирівняний за цілочисельними індексами від нульового меридіана й
 * екватора, тому комірки різних станцій збігаються й сітку можна віддати
 * marching squares напряму. Інтерполяції немає навмисно: turf.interpolate
 * для кожної своєї точки перебирає всі вхідні, і на масштабі країни це
 * мільярди операцій у головному потоці.
 */

import * as turf from '@turf/turf';

const WALK_KMH = 5;
const KM_PER_DEG_LAT = 111.32;
const REFERENCE_LAT = 51; // середина Німеччини: растр лишається прямокутним

/** Скільки секунд зʼїдає дорога пішки на distanceKm в один бік — туди й назад. */
export function walkPenalty(distanceKm) {
  return (distanceKm / WALK_KMH) * 3600 * 2;
}

function cellSizeDegrees(cellKm) {
  return {
    dLat: cellKm / KM_PER_DEG_LAT,
    dLon: cellKm / (KM_PER_DEG_LAT * Math.cos((REFERENCE_LAT * Math.PI) / 180)),
  };
}

/**
 * Растр корисного часу: комірка бере максимум по всіх станціях поблизу.
 * @param {{lat: number, lon: number, useful: number}[]} points
 * @returns {{lat: number, lon: number, value: number}[]}
 */
export function buildGrid(points, { cellKm = 5, radiusKm = 10 } = {}) {
  if (points.length === 0) return [];

  const { dLat, dLon } = cellSizeDegrees(cellKm);
  const steps = Math.ceil(radiusKm / cellKm);
  const cells = new Map();

  for (const point of points) {
    const baseI = Math.round(point.lat / dLat);
    const baseJ = Math.round(point.lon / dLon);

    for (let i = baseI - steps; i <= baseI + steps; i += 1) {
      for (let j = baseJ - steps; j <= baseJ + steps; j += 1) {
        const lat = i * dLat;
        const lon = j * dLon;
        const northKm = (lat - point.lat) * KM_PER_DEG_LAT;
        const eastKm =
          (lon - point.lon) * KM_PER_DEG_LAT * Math.cos((point.lat * Math.PI) / 180);
        const distKm = Math.hypot(northKm, eastKm);
        if (distKm > radiusKm) continue;

        const value = point.useful - walkPenalty(distKm);
        if (value <= 0) continue;

        const key = `${i},${j}`;
        const existing = cells.get(key);
        if (!existing || existing.value < value) {
          cells.set(key, { i, j, lat, lon, value });
        }
      }
    }
  }
  return [...cells.values()];
}

/**
 * Контури зон за порогами корисного часу (у секундах, за зростанням).
 *
 * Marching squares вимагає повного прямокутника, тому порожні комірки
 * всередині bbox добиваються нулями.
 *
 * @returns GeoJSON FeatureCollection з полігонами
 */
export function buildZones(points, breaks, options = {}) {
  const cells = buildGrid(points, options);
  if (cells.length === 0) return turf.featureCollection([]);

  const { dLat, dLon } = cellSizeDegrees(options.cellKm ?? 5);
  const is = cells.map((c) => c.i);
  const js = cells.map((c) => c.j);
  const minI = Math.min(...is);
  const maxI = Math.max(...is);
  const minJ = Math.min(...js);
  const maxJ = Math.max(...js);

  const byKey = new Map(cells.map((c) => [`${c.i},${c.j}`, c.value]));
  const features = [];
  for (let i = minI; i <= maxI; i += 1) {
    for (let j = minJ; j <= maxJ; j += 1) {
      features.push(
        turf.point([j * dLon, i * dLat], { value: byKey.get(`${i},${j}`) ?? 0 }),
      );
    }
  }

  const bands = turf.isobands(turf.featureCollection(features), [...breaks, Number.MAX_SAFE_INTEGER], {
    zProperty: 'value',
  });
  // isobands кладе в zProperty рядок "14400-21600"; для стилю потрібне число,
  // тому нижню межу смуги виносимо окремим полем
  bands.features = bands.features
    .map((f) => ({
      ...f,
      properties: { ...f.properties, min: Number(String(f.properties.value).split('-')[0]) },
    }))
    .filter((f) => Number.isFinite(f.properties.min) && f.properties.min >= breaks[0]);
  return bands;
}
