/**
 * Маршрут Шелдона — сюжетний режим карти.
 *
 * «Дитинство Шелдона», 7 сезон, 3 серія: поїздка з Гейдельберга, вихід у
 * Вайнгаймі по штрудель, речі поїхали далі у Франкфурт, дорога додому
 * пішки. Це не розрахунок, а розказана карта, тому весь текст лежить тут
 * даними, а не в логіці.
 *
 * Тексти — у strings.js: ключ і чотири мови поруч.
 */

import { STORY_PATHS, STORY_STOPS } from './story-paths.js';
import { WALK_PATH } from './walk-route.js';

/** Станції маршруту з координатами з того самого фіду, що й уся карта. */
export const PLACES = {
  heidelberg: { name: 'Heidelberg Hbf', lon: 8.67583, lat: 49.40393 },
  weinheim: { name: 'Weinheim (Bergstr) Hbf', lon: 8.66552, lat: 49.55332 },
  frankfurt: { name: 'Frankfurt (Main) Hauptbahnhof', lon: 8.66274, lat: 50.10675 },
  // Головних вокзалів Штутгарта й Карлсруе в регіональному фіді немає, тому
  // тут їхні справжні координати, а не взяті зі stations.json.
  stuttgart: { name: 'Stuttgart Hbf', lon: 9.1817, lat: 48.7838 },
  karlsruhe: { name: 'Karlsruhe Hbf', lon: 8.4017, lat: 48.9937 },
  mannheim: { name: 'Mannheim Hbf', lon: 8.46943, lat: 49.47955 },
};

/**
 * Кільце, яке Шелдон планував: південний захід Німеччини по колу і назад у
 * Гейдельберг. Заради нього були і двоповерховий вагон до Штутгарта, і
 * стрілки Франкфурта. Проїхав він із цього кільця одну ділянку.
 */
export const LOOP = ['heidelberg', 'frankfurt', 'stuttgart', 'karlsruhe', 'mannheim', 'heidelberg'];

/** Те, що сталося насправді: одна поїздка й речі, що поїхали далі без нього. */
export const REAL = [
  { id: 'ride', from: 'heidelberg', to: 'weinheim', kind: 'train' },
  { id: 'luggage', from: 'weinheim', to: 'frankfurt', kind: 'luggage' },
];

/**
 * Три маршрути, між якими перемикається карта. Клік по картці на сторінці
 * вибирає, що показувати, — самі тексти лишаються на місці.
 *
 * Тексти живуть у strings.js під ключами `story.route.<id>.*`.
 */
export const ROUTES = [{ id: 'planned' }, { id: 'real' }, { id: 'walk' }];

/** Розділи розповіді. `route` каже, до якого маршруту належить абзац. */
export const SECTIONS = [
  { id: 'punctuality', route: 'planned' },
  { id: 'junctions', route: 'planned' },
  { id: 'doppelstock', route: 'planned' },
  { id: 'conductor', route: 'real' },
  { id: 'strudel', route: 'real' },
  { id: 'walk', route: 'walk' },
];

/**
 * Заплановане кільце. Лінія йде по справжніх станціях мережі, а не хордою
 * між вокзалами: поїзд Гейдельберг — Штутгарт по прямій не їде.
 */
export function loopGeojson() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: STORY_PATHS.loop },
        properties: { kind: 'planned' },
      },
    ],
  };
}

/** Реальна поїздка й мандрівка речей — окремими лініями. */
export function realGeojson() {
  return {
    type: 'FeatureCollection',
    features: REAL.map(({ id, kind }) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: STORY_PATHS[id] },
      properties: { id, kind },
    })),
  };
}

/** Дорога пішки — справжня геометрія доріг, а не пряма між вокзалами. */
export function walkGeojson() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: WALK_PATH },
        properties: { kind: 'walk' },
      },
    ],
  };
}

/**
 * Усі зупинки обраного маршруту, а не лише опорні вокзали: лінія проходить
 * через сотню станцій, і на карті видно, повз що саме він їхав.
 */
export function stopsGeojson(route) {
  const lines = route === 'real' ? ['ride', 'luggage'] : route === 'planned' ? ['loop'] : [];
  const seen = new Set();
  const features = [];
  for (const line of lines) {
    for (const stop of STORY_STOPS[line]) {
      if (seen.has(stop.name)) continue;
      seen.add(stop.name);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
        properties: { name: stop.name },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Станції, яких стосується обраний маршрут: решта на карті приглушені. */
export function placesGeojson(route) {
  const active = {
    planned: LOOP,
    real: ['heidelberg', 'weinheim', 'frankfurt'],
    walk: ['weinheim', 'heidelberg'],
  }[route];
  return {
    type: 'FeatureCollection',
    features: Object.entries(PLACES).map(([id, place]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
      properties: { id, name: place.name, active: active.includes(id) },
    })),
  };
}

/** Рамка, у яку карта вписує обраний маршрут. */
export function routeBounds(route) {
  const points = {
    planned: STORY_PATHS.loop,
    real: [...STORY_PATHS.ride, ...STORY_PATHS.luggage],
    walk: WALK_PATH,
  }[route];
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}
