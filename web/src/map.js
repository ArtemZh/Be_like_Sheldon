import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { filterWindows, formatHours, nearestOrigin } from './metrics.js';
import { buildZones } from './grid.js';
import { DEPART_AFTER, RETURN_BY, RETURN_BY_NEXT_MORNING } from './daytrip.js';

const DATA = `${import.meta.env.BASE_URL}data`;
// Секвенційна шкала: один тон бренду, світло -> темно.
//
// Величину кодує лише колір, тому рампа темніша за брендовий сигнал:
// на папері вона тримає контраст від 2.96 до 12.5, і сусідні біни
// розрізняються без допомоги розміру.
const SEQ = ['#e8763a', '#d4500f', '#a83a0b', '#5e1f06'];
const DOT_RADIUS = 3.5;

/**
 * Вікна поїздки. Денне закінчується ввечері того самого дня, добове —
 * вранці наступного, тому в ньому працюють нічні потяги й ранкові рейси
 * вівторка.
 *
 * Пороги шкали свої для кожного вікна: 4/6/8 годин на добовому вікні
 * насичуються майже скрізь, і карта стає рівномірно темною.
 */
const WINDOWS = {
  day: {
    returnBy: RETURN_BY,
    maxStay: 12 * 3600,
    breaks: [4 * 3600, 6 * 3600, 8 * 3600],
    labels: ['до 4', '4 — 6', '6 — 8', '8 і більше'],
  },
  night: {
    returnBy: RETURN_BY_NEXT_MORNING,
    maxStay: 24 * 3600,
    breaks: [8 * 3600, 12 * 3600, 16 * 3600],
    labels: ['до 8', '8 — 12', '12 — 16', '16 і більше'],
  },
};
const EMPTY = { type: 'FeatureCollection', features: [] };
// Німеччина цілком: карта відкривається на весь контур, а не на точці.
const GERMANY = [[5.87, 47.27], [15.04, 55.06]];

const el = (id) => document.getElementById(id);

/** Вираз MapLibre «поріг -> колір» для поточного вікна поїздки. */
function stepExpression(value) {
  const { breaks } = WINDOWS[state.window];
  return ['step', value, SEQ[0], breaks[0], SEQ[1], breaks[1], SEQ[2], breaks[2], SEQ[3]];
}
const state = {
  index: null,
  byIndex: null, // порядковий номер станції у фіді -> її запис
  result: null, // останній результат воркера: типізовані масиви
  origin: null,
  window: 'day',
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
      properties: {
        name: p.name,
        useful: p.useful,
        arrival: p.window[0],
        departure: p.window[1],
      },
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
    map.getSource('zones').setData(buildZones(points, WINDOWS[state.window].breaks));
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
 * Перемкнути вікно поїздки.
 *
 * Маршрути доводиться перераховувати: інший дедлайн повернення означає
 * інші зворотні потяги. Це 20-40 мс, тож перемикач відповідає одразу.
 */
function selectWindow(name) {
  if (!(name in WINDOWS) || name === state.window) return;
  state.window = name;

  for (const button of document.querySelectorAll('#window-switch button')) {
    button.setAttribute('aria-checked', String(button.dataset.window === name));
  }

  const slider = el('min-stay');
  slider.max = String(WINDOWS[name].maxStay);
  if (Number(slider.value) > WINDOWS[name].maxStay) slider.value = slider.max;

  const labels = document.querySelectorAll('#legend li .label');
  WINDOWS[name].labels.forEach((text, i) => {
    if (labels[i]) labels[i].textContent = text;
  });

  if (state.layersReady) {
    map.setPaintProperty('stations', 'circle-color', stepExpression(['get', 'useful']));
    map.setPaintProperty('zones', 'fill-color', stepExpression(['get', 'min']));
  }

  if (state.origin) selectOrigin(state.origin);
  else render();
}

/** Час у секундах від півночі -> '18:05'. */
function clockTime(seconds) {
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Підказка про станцію призначення.
 *
 * Живе окремим зафіксованим вікном, а не попапом на марці: попап
 * перехоплював би клік, а клік по станції задає новий старт.
 */
function showHint({ name, useful, arrival, departure }) {
  const hint = el('hint');
  hint.querySelector('.hint-name').textContent = name;
  hint.querySelector('.hint-useful').textContent = `${formatHours(useful)} на місці`;
  hint.querySelector('.hint-times').textContent =
    `приїзд ${clockTime(arrival)} · назад ${clockTime(departure)}`;
  hint.classList.remove('is-empty');
}

/** Вікно лишається на екрані — порожніє лише його вміст. */
function clearHint() {
  el('hint').classList.add('is-empty');
}

/**
 * Перетягування вікна підказки.
 *
 * Вікно висить над картою й перекриває частину полотна, тому людина має
 * могти прибрати його з дороги. Позиція запамʼятовується у px від краю
 * вікна перегляду — так само, як її задає CSS.
 */
function makeDraggable(node) {
  let pointerId = null;
  let offsetX = 0;
  let offsetY = 0;

  node.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId;
    const box = node.getBoundingClientRect();
    offsetX = event.clientX - box.left;
    offsetY = event.clientY - box.top;
    node.setPointerCapture(pointerId);
    node.classList.add('is-dragging');
  });

  node.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    const box = node.getBoundingClientRect();
    const maxLeft = window.innerWidth - box.width;
    const maxTop = window.innerHeight - box.height;
    node.style.left = `${Math.min(Math.max(0, event.clientX - offsetX), maxLeft)}px`;
    node.style.top = `${Math.min(Math.max(0, event.clientY - offsetY), maxTop)}px`;
  });

  const release = (event) => {
    if (event.pointerId !== pointerId) return;
    node.releasePointerCapture(pointerId);
    pointerId = null;
    node.classList.remove('is-dragging');
  };
  node.addEventListener('pointerup', release);
  node.addEventListener('pointercancel', release);
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
  clearHint();
  worker.postMessage({
    type: 'route',
    origin: station.i,
    departAfter: DEPART_AFTER,
    returnBy: WINDOWS[state.window].returnBy,
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
      'fill-color': stepExpression(['get', 'min']),
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
      'circle-color': stepExpression(['get', 'useful']),
      'circle-opacity': 1,
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
      'circle-radius': ['case', ['get', 'chosen'], 6, 4],
      'circle-color': ['case', ['get', 'chosen'], '#ea5212', '#ffffff'],
      'circle-stroke-width': ['case', ['get', 'chosen'], 2, 1.5],
      'circle-stroke-color': '#ea5212',
    },
  });

  // Клік завжди задає новий старт — і по порожньому місцю, і по станції
  // призначення. Що це за станція, розповідає окрема картка на наведення:
  // попап на марці перехоплював би клік.
  map.on('click', (event) => {
    pickNearestOrigin(event.lngLat);
  });

  map.on('mousemove', 'stations', (event) => {
    showHint(event.features[0].properties);
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'stations', () => {
    clearHint();
    map.getCanvas().style.cursor = 'crosshair';
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

  for (const button of document.querySelectorAll('#window-switch button')) {
    button.onclick = () => selectWindow(button.dataset.window);
  }
  for (const id of ['min-stay', 'overhead', 'show-zones']) {
    el(id).oninput = render;
  }

  makeDraggable(el('hint'));
  render();
}

map.on('load', addLayers);
initControls();
