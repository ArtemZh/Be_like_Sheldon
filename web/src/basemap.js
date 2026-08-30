/**
 * Власна базова карта: Німеччина, кордони земель — і більше нічого.
 *
 * CARTO малює цілу Європу з дорогами, лісами й підписами кожного села. Нам
 * потрібне протилежне: тло, на якому видно колії та станції. Тому підкладка
 * тут своя — один GeoJSON із шістнадцятьма землями, а все інше на карті
 * малюють шари самого застосунку.
 *
 * Шрифти беремо з відкритого сховища MapLibre: власні SDF-гліфи довелось би
 * генерувати й зберігати, а виграшу для двох підписів це не дасть.
 */

const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

// Сайт може жити в підкаталозі (GitHub Pages), тому шляхи до власної
// геометрії рахуємо від бази збірки, а не від кореня.
const GEO = `${import.meta.env.BASE_URL}geo`;
export const FONT = ['Noto Sans Regular'];

const COLORS = {
  light: {
    water: '#eef1f4',
    land: '#ffffff',
    border: '#d8dade',
    outline: '#b9bcc4',
    label: '#a8a8b0',
  },
  dark: {
    water: '#0d0f13',
    land: '#191c22',
    border: '#2b2f38',
    outline: '#3a3e48',
    label: '#5d5f6a',
  },
};

/**
 * Готова карта з відкритих джерел — для порівняння й для тих випадків, коли
 * потрібен контекст: дороги, міста, сусідні країни. Наша власна показує
 * тільки Німеччину й колії, і це навмисно.
 */
const OSM = {
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

const PROVIDER_KEY = 'daytrip.basemap';
export const PROVIDERS = ['own', 'osm'];

let provider = 'own';

export function currentProvider() {
  return provider;
}

/** Відновити вибір карти зі сховища. */
export function restoreProvider() {
  try {
    const saved = localStorage.getItem(PROVIDER_KEY);
    if (PROVIDERS.includes(saved)) provider = saved;
  } catch {
    // приватне вікно — лишаємо власну
  }
  return provider;
}

export function setProvider(next) {
  provider = PROVIDERS.includes(next) ? next : 'own';
  try {
    localStorage.setItem(PROVIDER_KEY, provider);
  } catch {
    // те саме: не запамʼятали — і добре
  }
  return provider;
}

/** Стиль карти під поточного постачальника й тему. */
export function mapStyle(theme, which = provider) {
  return which === 'osm' ? OSM[theme] : basemapStyle(theme);
}

/** Стиль власної карти під тему. */
export function basemapStyle(theme) {
  const c = COLORS[theme] ?? COLORS.light;
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      states: { type: 'geojson', data: `${GEO}/germany-states.json` },
      // Підписи окремим шаром точок: у MultiPolygon MapLibre підписує
      // кожен острів, і Шлезвіг-Гольштейн зʼявлявся двічі.
      'state-labels': { type: 'geojson', data: `${GEO}/germany-state-labels.json` },
    },
    layers: [
      { id: 'water', type: 'background', paint: { 'background-color': c.water } },
      {
        id: 'land',
        type: 'fill',
        source: 'states',
        paint: { 'fill-color': c.land },
      },
      {
        id: 'state-borders',
        type: 'line',
        source: 'states',
        paint: {
          'line-color': c.border,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 10, 1.4],
        },
      },
      {
        // Зовнішній контур країни трохи темніший за межі земель: інакше
        // Німеччина розсипається на шістнадцять однакових плям.
        id: 'country-outline',
        type: 'line',
        source: 'states',
        paint: {
          'line-color': c.outline,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 10, 2.4],
          'line-opacity': 0.6,
          'line-blur': 0.4,
        },
      },
      {
        id: 'state-labels',
        type: 'symbol',
        source: 'state-labels',
        maxzoom: 9,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 9, 8, 13],
          'text-letter-spacing': 0.08,
          'text-transform': 'uppercase',
        },
        paint: {
          'text-color': c.label,
          'text-halo-color': c.land,
          'text-halo-width': 1.4,
        },
      },
    ],
  };
}
