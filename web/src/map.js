import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { filterWindows, nearestOrigin } from './metrics.js';
import { LANGUAGES, currentLanguage, formatHours, restoreLanguage, setLanguage, t } from './i18n.js';
import { buildZones } from './grid.js';
import { EXPIRED, LIVE, liveProfile, phaseAt, profilePath } from './timeline.js';
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
  },
  night: {
    returnBy: RETURN_BY_NEXT_MORNING,
    maxStay: 24 * 3600,
    breaks: [8 * 3600, 12 * 3600, 16 * 3600],
  },
};
const EMPTY = { type: 'FeatureCollection', features: [] };
// Німеччина цілком: карта відкривається на весь контур, а не на точці.
const GERMANY = [[5.87, 47.27], [15.04, 55.06]];

const el = (id) => document.getElementById(id);

/**
 * Застосувати переклади до розмітки.
 *
 * Рядки в HTML позначені data-i18n; усе, що будується в коді, проходить
 * через t() у місці використання. Перемикання мови просто прогонить це
 * заново й перемалює те, що вже на екрані.
 */
function applyTranslations() {
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll('[data-i18n-title]')) {
    node.title = t(node.dataset.i18nTitle);
  }
  for (const node of document.querySelectorAll('[data-i18n-aria]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  }
  for (const node of document.querySelectorAll('[data-i18n-alt]')) {
    node.alt = t(node.dataset.i18nAlt);
  }
  document.title = t('app.title');
  renderLegendLabels();
}

/** Підписи легенди читаються з порогів поточного вікна. */
function renderLegendLabels() {
  const { breaks } = WINDOWS[state.window];
  const hours = (seconds) => String(seconds / 3600);
  const labels = [
    t('legend.under', { h: hours(breaks[0]) }),
    t('legend.between', { a: hours(breaks[0]), b: hours(breaks[1]) }),
    t('legend.between', { a: hours(breaks[1]), b: hours(breaks[2]) }),
    t('legend.orMore', { h: hours(breaks[2]) }),
  ];
  document.querySelectorAll('#legend li .label').forEach((node, i) => {
    node.textContent = labels[i];
  });
}

/** Перемкнути мову інтерфейсу. */
function selectLanguage(language) {
  setLanguage(language);
  for (const button of document.querySelectorAll('#lang-switch button')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === currentLanguage()));
  }
  applyTranslations();

  // те, що вже на екрані, теж мовою інтерфейсу
  const placeholder = el('origin').options[0];
  if (placeholder) placeholder.textContent = t('field.pick');
  render();
  if (!state.result && state.feedReady) el('status').textContent = t('status.pick');
}

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
  clock: null, // час анімації в секундах; null — показуємо весь день одразу
  playing: false,
  profile: null,
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
  el('status').innerHTML = `${message} <button id="retry">${t('status.retry')}</button>`;
  el('retry').onclick = () => window.location.reload();
}

function currentPoints() {
  const minStay = Number(el('min-stay').value);
  const overhead = Number(el('overhead').value);

  const passing = filterWindows(state.result, { minStay, overhead });
  const clock = state.clock;

  return passing.flatMap((entry) => {
    const station = state.byIndex[entry.stop];
    if (!station) return [];

    // Поки годинник не запущено, показуємо весь день одразу.
    if (clock === null) {
      return [{ ...station, useful: entry.useful, window: entry.window }];
    }

    const phase = phaseAt(entry.window, clock);
    if (phase !== LIVE && phase !== EXPIRED) return [];
    return [
      {
        ...station,
        useful: entry.useful,
        window: entry.window,
        expired: phase === EXPIRED,
      },
    ];
  });
}

/** Ті самі точки, але без фільтра за часом — профіль має бачити весь день. */
function currentPointsIgnoringClock() {
  const saved = state.clock;
  state.clock = null;
  const points = currentPoints();
  state.clock = saved;
  return points;
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
  el('timeline').hidden = state.result === null;
  if (state.result && state.clock === null) renderProfile(currentPointsIgnoringClock());
  el('timeline-count').textContent =
    state.clock === null
      ? ''
      : t('timeline.live', { n: points.filter((p) => !p.expired).length });
  // Стартом може бути будь-яка станція, а в списку лише головні вокзали,
  // тому назву обраної показуємо тут — інакше вона зникає.
  const name = state.index.stations[state.origin]?.name ?? '';
  el('status').innerHTML = points.length
    ? t('status.result', { n: points.length, name })
    : t('status.empty', { name });

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
        expired: p.expired === true,
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
  // Під час програвання зони не перебудовуємо: 45 мс на кадр з'їли б анімацію.
  if (!el('show-zones').checked || state.playing) {
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

  renderLegendLabels();

  if (state.layersReady) {
    map.setPaintProperty('stations', 'circle-color', [
      'case',
      ['get', 'expired'],
      '#c9c9d0',
      stepExpression(['get', 'useful']),
    ]);
    map.setPaintProperty('zones', 'fill-color', stepExpression(['get', 'min']));
  }

  if (state.origin) selectOrigin(state.origin);
  else render();
}

/**
 * Вступне вікно.
 *
 * Показується один раз на браузер: далі його відкриває іконка на панелі.
 * localStorage може кинути виняток (приватне вікно, заблоковані дані
 * сайту), тому доступ до нього загорнутий — у найгіршому разі вікно просто
 * зʼявлятиметься щоразу.
 */
const INTRO_SEEN_KEY = 'daytrip:intro-seen';

function introWasSeen() {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // приватне вікно — просто не запамʼятовуємо
  }
}

function openIntro() {
  el('intro').hidden = false;
  el('intro-backdrop').hidden = false;
  el('intro-close').focus();
}

function closeIntro() {
  el('intro').hidden = true;
  el('intro-backdrop').hidden = true;
  rememberIntroSeen();
}

/** Якщо фото не завантажилось, прибираємо його, щоб не було битої іконки. */
function setUpIntroImage() {
  const photo = document.querySelector('.intro-photo');
  photo.hidden = false;
  photo.onerror = () => photo.remove();
}

function setUpIntro() {
  setUpIntroImage();
  el('intro-close').onclick = closeIntro;
  el('intro-backdrop').onclick = closeIntro;
  el('intro-open').onclick = openIntro;
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !el('intro').hidden) closeIntro();
  });

  if (!introWasSeen()) openIntro();
}

/**
 * Шкала часу.
 *
 * Один прохід від виїзду до дедлайну повернення. Зони на час програвання
 * ховаються: їх перебудова коштує ~45 мс, а кадрів двадцять на секунду —
 * крапки й так розповідають історію.
 */
// Темп рахуємо від реального часу, а не від кадрів: інакше швидкість
// анімації залежала б від частоти оновлення екрана.
const PLAYBACK_MINUTES_PER_SECOND = 45;

function timelineRange() {
  return { from: DEPART_AFTER, to: WINDOWS[state.window].returnBy };
}

function setClock(time, { fromSlider = false } = {}) {
  const { from, to } = timelineRange();
  state.clock = Math.min(Math.max(time, from), to);

  const share = (state.clock - from) / (to - from);
  if (!fromSlider) el('timeline-range').value = String(Math.round(share * 1000));
  el('timeline-head').style.left = `${(share * 100).toFixed(3)}%`;
  el('timeline-clock').textContent = clockTime(state.clock);
  render();
}

function stopClock() {
  state.playing = false;
  state.clock = null;
  updatePlayIcon();
  render();
}

function updatePlayIcon() {
  const button = el('timeline-play');
  button.querySelector('.icon-play').hidden = state.playing;
  button.querySelector('.icon-pause').hidden = !state.playing;
  button.setAttribute('aria-label', t(state.playing ? 'timeline.pause' : 'timeline.play'));
}

let lastFrameAt = 0;

function tick(now) {
  if (!state.playing) return;
  const { from, to } = timelineRange();

  const elapsed = lastFrameAt ? (now - lastFrameAt) / 1000 : 0;
  lastFrameAt = now;
  const next = (state.clock ?? from) + elapsed * PLAYBACK_MINUTES_PER_SECOND * 60;

  if (next >= to) {
    setClock(to);
    state.playing = false;
    updatePlayIcon();
    return;
  }
  setClock(next);
  requestAnimationFrame(tick);
}

function togglePlay() {
  const { from, to } = timelineRange();
  if (state.playing) {
    state.playing = false;
    updatePlayIcon();
    return;
  }
  // з кінця — починаємо спочатку
  if (state.clock === null || state.clock >= to) setClock(from);
  state.playing = true;
  lastFrameAt = 0;
  updatePlayIcon();
  requestAnimationFrame(tick);
}

/** Підмітка під повзунком: скільки станцій досяжні в кожен момент. */
function renderProfile(points) {
  const { from, to } = timelineRange();
  state.profile = liveProfile(points, { from, to });
  el('timeline-area').setAttribute('d', profilePath(state.profile, 600, 34));

  // Крок підбираємо під ширину: більше пʼяти підписів злипаються.
  const spanHours = (to - from) / 3600;
  const step = Math.max(1, Math.ceil(spanHours / 5));
  const hours = [];
  for (let h = Math.ceil(from / 3600); h <= Math.floor(to / 3600); h += step) {
    hours.push(h);
  }
  el('timeline-ticks').innerHTML = hours
    .map((h) => `<span>${clockTime(h * 3600)}</span>`)
    .join('');
}

function setUpTimeline() {
  el('timeline-play').onclick = togglePlay;
  el('timeline-range').oninput = (event) => {
    state.playing = false;
    updatePlayIcon();
    const { from, to } = timelineRange();
    setClock(from + ((to - from) * Number(event.target.value)) / 1000, { fromSlider: true });
  };
  updatePlayIcon();
}

/** Час у секундах від півночі -> '18:05'. */
function clockTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const label = `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return h >= 24 ? `${label} ${t('time.nextDay')}` : label;
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
  hint.querySelector('.hint-useful').textContent = t('hint.useful', {
    time: formatHours(useful),
  });
  hint.querySelector('.hint-times').textContent = t('hint.times', {
    a: clockTime(arrival),
    d: clockTime(departure),
  });
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
  state.clock = null;
  state.playing = false;
  el('origin').value = stopId;
  el('status').textContent = t('status.computing');
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
    el('status').textContent = t('status.pick');
    return;
  }

  if (message.type === 'error') {
    fail(t('error.routes', { message: message.message }));
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
      // Згасла станція сіріє: доїхати ще можна, повернутись — уже ні.
      'circle-color': [
        'case',
        ['get', 'expired'],
        '#c9c9d0',
        stepExpression(['get', 'useful']),
      ],
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
  selectLanguage(restoreLanguage());
  el('status').textContent = t('status.loading');

  try {
    state.index = await loadJson(`${DATA}/stations.json`);
  } catch (error) {
    fail(t('error.stations', { message: error.message }));
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
  placeholder.textContent = t('field.pick');
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

  for (const button of document.querySelectorAll('#lang-switch button')) {
    button.onclick = () => selectLanguage(button.dataset.lang);
  }
  for (const id of ['min-stay', 'overhead', 'show-zones']) {
    el(id).oninput = render;
  }

  makeDraggable(el('hint'));
  setUpTimeline();
  setUpIntro();
  render();
}

map.on('load', addLayers);
initControls();
