import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { filterWindows, formatHours, nearestOrigin } from './metrics.js';
import { buildZones } from './grid.js';
import { DEPART_AFTER, RETURN_BY } from './daytrip.js';

const DATA = `${import.meta.env.BASE_URL}data`;
// Секвенційна шкала: один тон бренду, світло -> темно.
//
// Величину кодує лише колір, а марки напівпрозорі, тому рампа темніша за
// брендовий сигнал: при 50% на папері світлі кроки просто зникають.
const BREAKS = [4 * 3600, 6 * 3600, 8 * 3600];
const SEQ = ['#e8763a', '#d4500f', '#a83a0b', '#5e1f06'];
const DOT_RADIUS = 3.5;
const DOT_OPACITY = 0.5;
const EMPTY = { type: 'FeatureCollection', features: [] };
// Німеччина цілком: карта відкривається на весь контур, а не на точці.
const GERMANY = [[5.87, 47.27], [15.04, 55.06]];

const el = (id) => document.getElementById(id);
const state = {
  index: null,
  byIndex: null, // порядковий номер станції у фіді -> її запис
  result: null, // останній результат воркера: типізовані масиви
  origin: null,
  network: null,
  layersReady: false,
};

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  bounds: GERMANY,
  fitBoundsOptions: { padding: 28 },
});

// у dev карта доступна з консолі — інакше шари нема чим оглянути
if (import.meta.env.DEV) window.__map = map;

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

function fail(message) {
  el('status').innerHTML = `${message} <button id="retry">Спробувати ще</button>`;
  el('retry').onclick = () => window.location.reload();
}

function currentPoints() {
  const minStay = Number(el('min-stay').value);
  const overhead = Number(el('overhead').value);

  return filterWindows(state.result, { minStay, overhead }).flatMap((entry) => {
    const station = state.byIndex[entry.stop];
    if (!station) return [];
    return [{ ...station, useful: entry.useful, window: entry.window }];
  });
}

function render() {
  el('min-stay-value').textContent = formatHours(Number(el('min-stay').value));
  el('overhead-value').textContent = formatHours(Number(el('overhead').value));
  if (!state.layersReady) return;

  renderOrigins();

  if (!state.result) {
    map.getSource('stations').setData(EMPTY);
    map.getSource('zones').setData(EMPTY);
    return;
  }

  const points = currentPoints();
  // Стартом може бути будь-яка станція, а в списку лише головні вокзали,
  // тому назву обраної показуємо тут — інакше вона зникає.
  const originName = state.index.stations[state.origin]?.name ?? '';
  el('status').innerHTML = points.length
    ? `<strong>${points.length}</strong> станцій з <em>${originName}</em>`
    : `З <em>${originName}</em> за цей день нікуди не зʼїздиш`;

  map.getSource('stations').setData({
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { name: p.name, useful: p.useful, label: formatHours(p.useful) },
    })),
  });

  scheduleZones(points);
}

/**
 * Зони коштують ~350 мс на країну, а слайдер шле подію на кожен крок.
 * Кружечки оновлюються миттєво, контури — коли рух припинився.
 */
let zonesTimer = null;
function scheduleZones(points) {
  clearTimeout(zonesTimer);
  if (!el('show-zones').checked) {
    map.getSource('zones').setData(EMPTY);
    return;
  }
  zonesTimer = setTimeout(() => {
    map.getSource('zones').setData(buildZones(points, BREAKS));
  }, 180);
}

/**
 * Головні вокзали на карті — з них починається робота.
 *
 * Поки старт не обрано, це єдині позначки на полотні: карта відкривається
 * порожньою Німеччиною й чекає на клік, а не рахує щось наперед. Обраний
 * старт додається до позначених, навіть якщо він не головний вокзал —
 * інакше після кліку по глушині незрозуміло, звідки рахувало.
 */
function renderOrigins() {
  if (!state.index) return;
  // Кільцями світяться лише головні вокзали: решта origin-ів — міські
  // платформи, які на карті країни перетворюються на кашу навколо Берліна.
  const marked = new Set([...(state.index.major ?? []), state.origin].filter(Boolean));
  map.getSource('origins').setData({
    type: 'FeatureCollection',
    features: [...marked].flatMap((stopId) => {
      const station = state.index.stations[stopId];
      if (!station) return [];
      return [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
        properties: { id: stopId, name: station.name, chosen: stopId === state.origin },
      }];
    }),
  });
}

/**
 * Обрати старт за кліком по карті.
 *
 * Передрахунку немає, тому кандидатами є всі станції фіду, а не короткий
 * список: куди клікнув, звідти й поїдеш.
 */
function pickNearestOrigin(lngLat) {
  if (!state.candidates) return;
  const nearest = nearestOrigin({ lat: lngLat.lat, lon: lngLat.lng }, state.candidates);
  if (nearest) selectOrigin(nearest.id);
}

/** Порахувати день-трип із заданої станції. Відповідь прийде з воркера. */
function selectOrigin(stopId) {
  const station = state.index.stations[stopId];
  if (!station) return;

  state.origin = stopId;
  el('origin').value = stopId;
  el('status').textContent = 'Рахую…';
  worker.postMessage({
    type: 'route',
    origin: station.i,
    departAfter: DEPART_AFTER,
    returnBy: RETURN_BY,
  });
}

worker.onmessage = (event) => {
  const message = event.data;

  if (message.type === 'ready') {
    state.feedReady = true;
    el('status').textContent = 'Клікніть по карті — візьму найближчу станцію.';
    return;
  }

  if (message.type === 'error') {
    fail(`Не вдалося порахувати маршрути (${message.message}).`);
    return;
  }

  if (message.type === 'result') {
    state.result = { stops: message.stops, arrivals: message.arrivals, departures: message.departures };
    render();
  }
};

function addLayers() {
  // Схема мережі лежить найнижче: вона контекст, а не дані відповіді.
  map.addSource('network', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'network',
    type: 'line',
    source: 'network',
    paint: {
      'line-color': '#a8a8b0',
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 9, 1.2],
      'line-opacity': 0.55,
    },
  });

  map.addSource('zones', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'zones',
    type: 'fill',
    source: 'zones',
    paint: {
      'fill-color': [
        'step', ['get', 'min'],
        SEQ[0], BREAKS[0], SEQ[1], BREAKS[1], SEQ[2], BREAKS[2], SEQ[3],
      ],
      'fill-opacity': 0.45,
    },
  });

  map.addSource('stations', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'stations',
    type: 'circle',
    source: 'stations',
    paint: {
      'circle-radius': DOT_RADIUS,
      'circle-color': [
        'step', ['get', 'useful'],
        SEQ[0], BREAKS[0], SEQ[1], BREAKS[1], SEQ[2], BREAKS[2], SEQ[3],
      ],
      // Накладені марки розділяє сама прозорість, а не біле кільце:
      // при 50% воно лише висвітлювало б колір.
      'circle-opacity': DOT_OPACITY,
    },
  });

  map.addSource('origins', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'origins',
    type: 'circle',
    source: 'origins',
    // Вибір старту — головна дія на екрані, тож станції відправлення
    // носять сигнальний колір: порожнє кільце, поки не обрано, залите
    // після вибору.
    paint: {
      'circle-radius': ['case', ['get', 'chosen'], 9, 5],
      'circle-color': ['case', ['get', 'chosen'], '#ea5212', '#ffffff'],
      'circle-stroke-width': ['case', ['get', 'chosen'], 3, 2],
      'circle-stroke-color': '#ea5212',
    },
  });

  // Клік по станції призначення показує її картку, клік по будь-якому
  // іншому місцю карти обирає найближчий доступний старт.
  map.on('click', (event) => {
    const hit = map.queryRenderedFeatures(event.point, { layers: ['stations'] });
    if (hit.length) {
      const { name, label } = hit[0].properties;
      new maplibregl.Popup()
        .setLngLat(event.lngLat)
        .setHTML(`<strong>${name}</strong><span class="time">${label} на місці</span>`)
        .addTo(map);
      return;
    }
    pickNearestOrigin(event.lngLat);
  });

  map.getCanvas().style.cursor = 'crosshair';

  state.layersReady = true;
  if (state.network) map.getSource('network').setData(state.network);
  render();
}

/**
 * Контроли й дані не чекають на карту.
 *
 * MapLibre вимагає WebGL і мережевого стилю; якщо чіпляти весь UI до
 * map.on('load'), то при повільному або заблокованому стилі сторінка
 * виглядає порожньою, хоча дані вже є. Тому список станцій будується
 * одразу, а шари додаються окремо, коли карта буде готова.
 */
async function initControls() {
  el('status').textContent = 'Завантажую розклад…';

  try {
    state.index = await loadJson(`${DATA}/stations.json`);
  } catch (error) {
    fail(`Не вдалося завантажити список станцій (${error.message}).`);
    return;
  }

  state.byIndex = [];
  state.candidates = [];
  for (const [id, station] of Object.entries(state.index.stations)) {
    state.byIndex[station.i] = { id, ...station };
    state.candidates.push({ id, lat: station.lat, lon: station.lon });
  }

  worker.postMessage({ type: 'init', dataUrl: DATA });

  // Мережа — контекст, без неї застосунок працює; тому окремо й без fail().
  loadJson(`${DATA}/network.json`)
    .then((network) => {
      state.network = network;
      if (state.layersReady) map.getSource('network').setData(network);
    })
    .catch(() => {});

  // У списку — лише головні вокзали: решта обирається кліком по карті.
  const select = el('origin');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— оберіть станцію —';
  select.append(placeholder);

  const labelled = (state.index.major ?? []).map((stopId) => ({
    stopId,
    name: state.index.stations[stopId]?.name ?? stopId,
  }));
  labelled.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  for (const { stopId, name } of labelled) {
    const option = document.createElement('option');
    option.value = stopId;
    option.textContent = name;
    select.append(option);
  }

  select.onchange = () => {
    if (select.value) selectOrigin(select.value);
  };
  for (const id of ['min-stay', 'overhead', 'show-zones']) {
    el(id).oninput = render;
  }

  render();
}

map.on('load', addLayers);
initControls();
