/**
 * Точки станцій -> сітка -> контури зон.
 *
 * Зони приблизні: потяг зупиняється тільки на станціях, але навколо станції
 * є пішохідна доступність. Що далі від станції, то більше часу зʼїдає дорога
 * пішки — це й є walkPenalty.
 */

import * as turf from '@turf/turf';

const WALK_KMH = 5;
const KM_PER_DEG_LAT = 111.32;

/** Скільки секунд зʼїдає дорога пішки на distanceKm в один бік — туди й назад. */
export function walkPenalty(distanceKm) {
  return (distanceKm / WALK_KMH) * 3600 * 2;
}

function kmPerDegLon(lat) {
  return KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/**
 * Побудувати сітку комірок зі значенням корисного часу.
 * @param {{lat: number, lon: number, useful: number}[]} points
 * @returns {{lat: number, lon: number, value: number}[]}
 */
export function buildGrid(points, { cellKm = 2, radiusKm = 8 } = {}) {
  if (points.length === 0) return [];

  const cells = new Map();
  for (const point of points) {
    const dLat = cellKm / KM_PER_DEG_LAT;
    const dLon = cellKm / kmPerDegLon(point.lat);
    const steps = Math.ceil(radiusKm / cellKm);

    for (let i = -steps; i <= steps; i += 1) {
      for (let j = -steps; j <= steps; j += 1) {
        const distKm = Math.hypot(i * cellKm, j * cellKm);
        if (distKm > radiusKm) continue;

        const value = point.useful - walkPenalty(distKm);
        if (value <= 0) continue;

        const lat = point.lat + i * dLat;
        const lon = point.lon + j * dLon;
        const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
        const existing = cells.get(key);
        if (!existing || existing.value < value) {
          cells.set(key, { lat, lon, value });
        }
      }
    }
  }
  return [...cells.values()];
}

/**
 * Контури зон за порогами корисного часу (у секундах, за зростанням).
 * @returns GeoJSON FeatureCollection з полігонами
 */
export function buildZones(points, breaks, options = {}) {
  const cells = buildGrid(points, options);
  if (cells.length === 0) return turf.featureCollection([]);

  const pointFeatures = turf.featureCollection(
    cells.map((cell) =>
      turf.point([cell.lon, cell.lat], { value: cell.value }),
    ),
  );

  const surface = turf.interpolate(pointFeatures, 5, {
    gridType: 'points',
    property: 'value',
    units: 'kilometers',
  });
  return turf.isobands(surface, [...breaks, Number.MAX_SAFE_INTEGER], { zProperty: 'value' });
}
