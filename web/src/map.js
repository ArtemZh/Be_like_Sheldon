import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { filterStations, formatHours } from './metrics.js';
import { buildZones } from './grid.js';

const DATA = `${import.meta.env.BASE_URL}data`;
// Секвенційна шкала: один тон бренду, світло -> темно. Магнітуда дублюється
// радіусом, бо два світлі кроки не дотягують до 3:1 на папері.
const BREAKS = [4 * 3600, 6 * 3600, 8 * 3600];
const SEQ = ['#f6b48c', '#f08a57', '#ea5212', '#93300a'];
const EMPTY = { type: 'FeatureCollection', features: [] };
// Німеччина цілком: карта відкривається на весь контур, а не на точці.
const GERMANY = [[5.87, 47.27], [15.04, 55.06]];

const el = (id) => document.getElementById(id);
const state = { index: null, windows: null, origin: null, layersReady: false };

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
  const passing = filterStations(state.windows, { minStay, overhead });

  return Object.entries(passing).flatMap(([stopId, info]) => {
    const station = state.index.stations[stopId];
    if (!station) return [];
    return [{ ...station, id: stopId, useful: info.useful, window: info.window }];
  });
}

function render() {
  el('min-stay-value').textContent = formatHours(Number(el('min-stay').value));
  el('overhead-value').textContent = formatHours(Number(el('overhead').value));
  if (!state.layersReady) return;

  renderOrigins();

  if (!state.windows) {
    map.getSource('stations').setData(EMPTY);
    map.getSource('zones').setData(EMPTY);
    return;
  }

  const points = currentPoints();
  el('status').innerHTML = points.length
    ? `<strong>${points.length}</strong> станцій підходить`
    : 'Звідси за цей день нікуди не зʼїздиш';

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
 * Станції відправлення на карті — з них починається робота.
 *
 * Поки старт не обрано, це єдине, що є на полотні: карта відкривається
 * порожньою Німеччиною й чекає на клік, а не рахує щось наперед.
 */
function renderOrigins() {
  if (!state.index) return;
  map.getSource('origins').setData({
    type: 'FeatureCollection',
    features: state.index.origins.flatMap((stopId) => {
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

async function selectOrigin(stopId) {
  el('status').textContent = 'Рахую…';
  try {
    const payload = await loadJson(`${DATA}/origins/${stopId}.json`);
    state.origin = stopId;
    state.windows = payload.stations;
    el('origin').value = stopId;
    render();
  } catch (error) {
    fail(`Не вдалося завантажити дані (${error.message}).`);
  }
}

function addLayers() {
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
      'circle-radius': [
        'step', ['get', 'useful'],
        2.5, BREAKS[0], 3.5, BREAKS[1], 4.5, BREAKS[2], 5.5,
      ],
      'circle-color': [
        'step', ['get', 'useful'],
        SEQ[0], BREAKS[0], SEQ[1], BREAKS[1], SEQ[2], BREAKS[2], SEQ[3],
      ],
      // кільце кольору паперу розділяє накладені марки
      'circle-stroke-width': 1,
      'circle-stroke-color': '#ffffff',
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

  map.on('click', 'origins', (event) => {
    selectOrigin(event.features[0].properties.id);
  });
  map.on('mouseenter', 'origins', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'origins', () => {
    map.getCanvas().style.cursor = '';
  });

  map.on('click', 'stations', (event) => {
    const { name, label } = event.features[0].properties;
    new maplibregl.Popup()
      .setLngLat(event.lngLat)
      .setHTML(`<strong>${name}</strong><span class="time">${label} на місці</span>`)
      .addTo(map);
  });

  state.layersReady = true;
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
  try {
    state.index = await loadJson(`${DATA}/stations.json`);
  } catch (error) {
    fail(`Не вдалося завантажити список станцій (${error.message}).`);
    return;
  }

  // збірка ранжує origin-и за кількістю рейсів — для вибору зі списку
  // потрібен алфавіт, інакше вгорі опиняється міська S-Bahn, а не міста
  const select = el('origin');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— оберіть станцію —';
  select.append(placeholder);

  const labelled = state.index.origins.map((stopId) => ({
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

  // Нічого не рахуємо наперед: спершу людина обирає, звідки їде.
  el('status').textContent = 'Оберіть станцію на карті або у списку.';
  render();
}

map.on('load', addLayers);
initControls();
