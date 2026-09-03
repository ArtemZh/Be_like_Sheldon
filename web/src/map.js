import { readableName } from './names.js';
import { CAPITALS, nextStop, stateBounds, stateOfCapital } from './regions.js';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { filterWindows, nearestOrigin } from './metrics.js';
import {
  FONT,
  PROVIDERS,
  currentProvider,
  mapStyle,
  restoreProvider,
  setProvider,
} from './basemap.js';
import { flapText, wrapLines } from './flap.js';
import { FACTS, randomFact } from './facts.js';
import { DAY, clockAt } from './live.js';
import {
  ROUTES,
  SECTIONS,
  loopGeojson,
  placesGeojson,
  realGeojson,
  routeBounds,
  stopsGeojson,
  walkGeojson,
} from './sheldon.js';
import { THEMES, currentTheme, restoreTheme, setTheme } from './theme.js';
import { SOURCES, WIKIPEDIA, WIKIPEDIA_LICENSE } from './sources.js';
import { STEPS as TOUR_STEPS, placeCard } from './tour.js';
import { LANGUAGES, currentLanguage, formatHours, restoreLanguage, setLanguage, t } from './i18n.js';
import { EXPIRED, LIVE, liveProfile, phaseAt, profileOutline, profilePath } from './timeline.js';
import { DEPART_AFTER, RETURN_BY, RETURN_BY_NEXT_MORNING } from './daytrip.js';

const DATA = `${import.meta.env.BASE_URL}data`;
const GEO = `${import.meta.env.BASE_URL}geo`;
// Секвенційна шкала: один тон бренду, світло -> темно.
//
// Величину кодує лише колір, тому рампа темніша за брендовий сигнал:
// на папері вона тримає контраст від 2.96 до 12.5, і сусідні біни
// розрізняються без допомоги розміру.
// Секвенційна шкала корисного часу. На світлому фоні «більше» — темніше,
// на темному навпаки: сильніший сигнал завжди той, що контрастніший до
// підкладки, інакше найкорисніші станції зникають у ночі.
const SEQ = {
  light: ['#e8763a', '#d4500f', '#a83a0b', '#5e1f06'],
  dark: ['#8d4720', '#c2571c', '#ef7c37', '#ffc194'],
};

function seq() {
  return SEQ[currentTheme()];
}
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
const GERMANY_CENTER = [10.45, 51.1];

// Три стани станції у скрінсейвері — одна шкала, три відтінки. Сірого тут
// немає навмисно: він зливався з кольором самої станції на підкладці.
// Найтемніше — потяг щойно приїхав, далі світлішає до «зараз поїде».
const LIVE_COLORS = {
  arrived: '#6b2206', // приїхав останні 30 секунд
  standing: '#c04a12', // стоїть
  leaving: '#f6a072', // рушає за 30 секунд
};

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
  const scale = seq();
  document.querySelectorAll('#legend li').forEach((node, i) => {
    node.querySelector('.label').textContent = labels[i];
    node.querySelector('.dot').style.background = scale[i];
  });
}

/** Перемкнути мову інтерфейсу. */
function selectLanguage(language) {
  setLanguage(language);
  for (const button of document.querySelectorAll('#lang-switch button')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === currentLanguage()));
  }
  applyTranslations();
  renderStoryPage();
  if (!el('sources').hidden) renderSources();

  // те, що вже на екрані, теж мовою інтерфейсу
  const placeholder = el('origin').options[0];
  if (placeholder) placeholder.textContent = t('field.pick');
  render();
  if (el('hint').classList.contains('is-empty')) clearHint();
  if (!state.result && state.feedReady) el('status').textContent = t('status.pick');
}

/**
 * Сюжетний режим: та сама карта, але розказана.
 *
 * Сторінка статична — кроків і навігації немає. Клік по картці маршруту
 * вибирає, що показує карта: план, реальну поїздку чи дорогу пішки.
 */
function renderStoryPage() {
  el('story-heading').textContent = t('story.heading');
  el('story-lead').textContent = t('story.lead');

  el('story-routes').innerHTML = '';
  for (const route of ROUTES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'story-route';
    card.dataset.route = route.id;
    card.innerHTML =
      `<span class="story-route-meta"></span><span class="story-route-title"></span>` +
      `<span class="story-route-summary"></span>`;
    card.querySelector('.story-route-meta').textContent = t(`story.route.${route.id}.meta`);
    card.querySelector('.story-route-title').textContent = t(`story.route.${route.id}.title`);
    card.querySelector('.story-route-summary').textContent = t(`story.route.${route.id}.summary`);
    card.onclick = () => selectRoute(route.id);
    el('story-routes').append(card);
  }

  el('story-sections').innerHTML = '';
  for (const section of SECTIONS) {
    const block = document.createElement('section');
    block.className = 'story-section';
    block.dataset.route = section.route;
    const title = document.createElement('h2');
    title.textContent = t(`story.${section.id}.title`);
    const text = document.createElement('p');
    text.textContent = t(`story.${section.id}.text`);
    block.append(title, text);
    // абзац теж перемикає карту: читаєш про Франкфурт — бачиш Франкфурт
    block.onclick = () => selectRoute(section.route);
    el('story-sections').append(block);
  }
}

/** Показати на карті один із трьох маршрутів. */
function selectRoute(route) {
  state.route = route;
  for (const node of document.querySelectorAll('[data-route]')) {
    node.classList.toggle('is-active', node.dataset.route === route);
  }
  if (!state.layersReady) return;

  map.getSource('story-loop').setData(route === 'planned' ? loopGeojson() : EMPTY);
  map.getSource('story-real').setData(route === 'real' ? realGeojson() : EMPTY);
  map.getSource('story-walk').setData(route === 'walk' ? walkGeojson() : EMPTY);
  map.getSource('story-stops').setData(stopsGeojson(route));
  map.getSource('story-places').setData(placesGeojson(route));
  // Сторінка — сусід карти у флексі, а не накладка, тому відступ однаковий
  // з усіх боків; місце під верхні перемикачі лишаємо трохи більше.
  map.fitBounds(routeBounds(route), {
    padding: { top: 110, right: 60, bottom: 60, left: 60 },
    duration: 900,
    maxZoom: 11,
  });
}

/** Прибрати сюжетні шари з карти. */
function clearStoryLayers() {
  if (!state.layersReady) return;
  for (const source of ['story-loop', 'story-real', 'story-walk', 'story-stops', 'story-places']) {
    map.getSource(source).setData(EMPTY);
  }
}

/** Кожні 30 секунд реального часу показуємо новий потяг. */
const TRAIN_EVERY_DEFAULT = 30_000;
// Показ довший за політ: 0.7 с рамка + 4.2 с зум, решта — щоб роздивитись.
const TRAIN_SHOWN = 17_000;
/** Скільки тиші потрібно, щоб демо почало показувати потяги й факти. */
const IDLE_BEFORE_DEMO = 30_000;
/** Факт читається довше за розклад потяга. */
const FACT_SHOWN_DEFAULT = 22_000;
/** Пауза між показами: карта країни без нічого, щоб табло не мерехтіло. */
const PAUSE_DEFAULT = 60_000;
/** Як часто оновлюється один віджет панелі. */
const REFRESH_DEFAULT = 25_000;
/** Мандрівка другого екрана: як часто він переїжджає до іншої землі. */
const TOUR_EVERY_DEFAULT = 45_000;

/** Довші назви в табло не влазять: 99% станцій коротші за цю межу. */
const NAME_FITS = 37;

function boardName(name) {
  const clean = readableName(name);
  return clean.length <= NAME_FITS ? clean : `${clean.slice(0, NAME_FITS - 1)}…`;
}

/** Скільки хвилин лишилось до відправлення — рахуємо, а не пишемо «за 1». */
function minutesTo(departure, now) {
  return String(Math.max(0, Math.round((departure - now) / 60)));
}

/**
 * Платформи в даних немає: на збірці всі платформи зведені до станцій. Номер
 * вигадуємо, але сталий для рейсу — інакше цифра стрибала б щокадру просто
 * під час анімації. Ніде не кажемо, що він справжній.
 */
function platformOf(train) {
  return String(1 + ((train.trip ?? train.pattern ?? 0) % 4));
}

/**
 * Один випадковий потяг у дорозі: підпис на табло й маршрут на карті.
 *
 * Сіре — те, що вже проїхано, сигнальне — те, що лишилось. Карта плавно
 * підлітає до всього маршруту, а поточна станція стоїть окремою крапкою.
 */
function showTrain(train, time) {
  if (!train || !state.byIndex.length) {
    // вночі буває, що в цю хвилину ніхто нікуди не рушає — спитаємо знову
    // за три секунди, а не за пів хвилини
    state.train.at = performance.now() - state.screen.trainEvery + 3000;
    return;
  }
  state.train.data = train;
  state.train.until = performance.now() + Math.min(TRAIN_SHOWN, state.screen.trainEvery - 3000);

  const stations = train.stops.map((stop) => state.byIndex[stop]).filter(Boolean);
  if (stations.length < 2) return;
  const at = Math.min(train.at, stations.length - 1);

  const route = state.patterns?.routes?.[train.pattern] || t('screen.now');
  const departure = train.dep[at];
  paintBoard([
    [t('board.line'), route],
    [t('board.from'), boardName(stations[0].name)],
    [t('board.to'), boardName(stations[stations.length - 1].name)],
    [
      t('board.departs'),
      t('board.departsValue', { min: minutesTo(departure, time), track: platformOf(train) }),
    ],
    [
      t('board.stop'),
      t('board.stopValue', { n: at + 1, total: stations.length, time: clockTime(departure) }),
    ],
  ]);
  handoffToBoard();

  const coords = (from, to) =>
    stations.slice(from, to).map((station) => [station.lon, station.lat]);
  if (state.layersReady) {
    map.getSource('train-done').setData({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: coords(0, at + 1) }, properties: {} },
      ],
    });
    map.getSource('train-left').setData({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: coords(at, stations.length) }, properties: {} },
      ],
    });
    map.getSource('train-now').setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [stations[at].lon, stations[at].lat] },
          properties: {},
        },
      ],
    });
  }

  const lons = stations.map((s) => s.lon);
  const lats = stations.map((s) => s.lat);
  const bounds = [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];

  // Спершу рамка блимає на місці, куди зараз полетить карта, і лише потім
  // починається сам політ: різкий стрибок читається гірше за попередження.
  if (state.layersReady) {
    map.getSource('train-frame').setData(frameGeojson(bounds));
  }
  // У режимі «видима частина» камера лишається там, куди її поставила
  // людина: вона щойно сама вибрала, на що дивитись.
  const stay = state.screen.scope === 'view' || touring();
  const flight = blinkFrame(stay ? 2 : 3, 320);
  setTimeout(() => {
    if (!state.train.data) return;
    if (!stay) {
      map.fitBounds(bounds, { padding: 90, duration: 4200, maxZoom: 9, essential: true });
    }
    // рамка тримається весь політ і гасне вже на місці
    setTimeout(() => {
      if (state.layersReady) map.getSource('train-frame').setData(EMPTY);
    }, 4000);
  }, flight);
}

/**
 * Повільно блимнути рамкою `times` разів.
 *
 * @returns скільки мілісекунд це триватиме — на стільки відкладаємо політ
 */
function blinkFrame(times, step) {
  if (!state.layersReady) return 0;
  map.setPaintProperty('train-frame', 'line-opacity-transition', { duration: step });
  for (let i = 0; i < times * 2; i += 1) {
    setTimeout(() => {
      if (!state.layersReady) return;
      map.setPaintProperty('train-frame', 'line-opacity', i % 2 === 0 ? 0.1 : 0.95);
    }, i * step);
  }
  return times * 2 * step;
}

/** Прямокутник навколо маршруту — пунктирна рамка «дивись сюди». */
function frameGeojson([[minLon, minLat], [maxLon, maxLat]]) {
  const padLon = Math.max((maxLon - minLon) * 0.12, 0.05);
  const padLat = Math.max((maxLat - minLat) * 0.12, 0.05);
  const ring = [
    [minLon - padLon, minLat - padLat],
    [maxLon + padLon, minLat - padLat],
    [maxLon + padLon, maxLat + padLat],
    [minLon - padLon, maxLat + padLat],
    [minLon - padLon, minLat - padLat],
  ];
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: ring }, properties: {} }],
  };
}

/** Прибрати потяг із карти й повернути звичайний вигляд табло. */
function hideTrain() {
  state.train.data = null;
  // Далі — тиша на загальній карті: без неї табло мерехтить одразу новим
  // потягом чи фактом, і подивитись на саму країну ніколи.
  state.screen.quietUntil = performance.now() + state.screen.pause;
  el('hint').classList.remove('is-fact', 'is-live');
  handoffToClock();
  if (state.layersReady) {
    for (const source of ['train-done', 'train-left', 'train-now', 'train-frame']) {
      map.getSource(source).setData(EMPTY);
    }
  }
  // Назад летимо не «щоб усе влізло»: країна може підрізатись по краях,
  // зате масштаб лишається читабельним. У режимі «видима частина» не
  // повертаємось нікуди: людина лишила карту там, де хотіла.
  if (state.mode === 'screen' && state.screen.scope === 'all' && !touring()) {
    map.easeTo({ center: GERMANY_CENTER, zoom: 5.9, duration: 3200, essential: true });
  }
  else clearHint();
}

/**
 * Три рядки на центральному табло — те саме вікно, що й підказка станції.
 *
 * У скрінсейвері вікно росте під текст: назви станцій бувають довгі, і
 * фіксовані два рядки їх обрізали. Рядок прокручується табло цілком, а
 * перенос робить браузер.
 */
function paintBoard(lines) {
  const hint = el('hint');
  hint.classList.remove('is-empty', 'is-fact', 'is-clock');
  hint.classList.add('is-live');

  const rows = hint.querySelectorAll('.hint-board p');
  lines.forEach(([label, value], i) => {
    const row = rows[i];
    if (!row) return;
    // Підпис нерухомий, крутиться лише значення.
    row.querySelector('.board-label').textContent = label;
    const slot = row.querySelector('.board-value');
    keepOneSlot(slot);
    flapText(slot.querySelector('.flap'), value);
  });
}

/** Лишити у вузлі рівно один слот під прокрутку. */
function keepOneSlot(node) {
  const slots = node.querySelectorAll('.flap');
  if (slots.length === 1 && node.childNodes.length === 1) return;
  node.textContent = '';
  const slot = document.createElement('span');
  slot.className = 'flap';
  node.append(slot);
}

/**
 * Факт замість потяга.
 *
 * Половина показів — цифри з Вікіпедії про німецьку залізницю. Якщо факт
 * привʼязаний до станції чи лінії, карта туди підлітає й показує місце;
 * якщо ні — просто читається на табло.
 */
function showFact(fact) {
  // попередній потяг зі своїм маршрутом іде з карти: факт має власні
  // позначки або жодних
  if (state.layersReady) {
    for (const source of ['train-done', 'train-left', 'train-now', 'train-frame']) {
      map.getSource(source).setData(EMPTY);
    }
  }
  state.train.data = { fact: true };
  state.train.until = performance.now() + state.screen.factShown;

  paintFact(t(fact.id));
  handoffToBoard();

  const anchors = fact.route ?? (fact.place ? [fact.place] : []);
  const stations = anchors.map(findStation).filter(Boolean);
  if (!state.layersReady || stations.length === 0) return;

  map.getSource('train-now').setData({
    type: 'FeatureCollection',
    features: stations.map((station) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
      properties: {},
    })),
  });
  if (stations.length === 2) {
    map.getSource('train-left').setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: stations.map((station) => [station.lon, station.lat]),
          },
          properties: {},
        },
      ],
    });
  }

  if (state.screen.scope === 'view') return;
  const lons = stations.map((s) => s.lon);
  const lats = stations.map((s) => s.lat);
  const bounds = [
    [Math.min(...lons) - 0.15, Math.min(...lats) - 0.15],
    [Math.max(...lons) + 0.15, Math.max(...lats) + 0.15],
  ];
  map.getSource('train-frame').setData(frameGeojson(bounds));
  const flight = blinkFrame(2, 320);
  setTimeout(() => {
    if (!state.train.data) return;
    if (touring()) return;
    map.fitBounds(bounds, { padding: 90, duration: 4200, maxZoom: 9, essential: true });
    setTimeout(() => {
      if (state.layersReady) map.getSource('train-frame').setData(EMPTY);
    }, 4000);
  }, flight);
}

/** Станція фіду за назвою з факту. */
function findStation(name) {
  const id = Object.keys(state.index?.stations ?? {}).find(
    (key) => state.index.stations[key].name === name,
  );
  return id ? state.index.stations[id] : null;
}

/**
 * Факт на табло: цілий абзац, тому вікно на час показу росте під текст.
 * Прокрутки тут немає — сім рядків мигтіння читати неможливо.
 */
function paintFact(text) {
  const hint = el('hint');
  hint.classList.remove('is-empty', 'is-live', 'is-clock');
  hint.classList.add('is-fact');

  // Побуквеної прокрутки тут немає навмисно: абзац, що набивається по літері,
  // читати неможливо. Замість неї — коротка поява, яку робить CSS.
  const node = hint.querySelector('.hint-fact');
  node.textContent = text;
  node.style.animation = 'none';
  void node.offsetWidth;
  node.style.animation = '';
}

/** Раз на 30 секунд просимо у воркера новий потяг чи показуємо факт. */
/**
 * Короткий звіт про себе для macOS-скрінсейвера: у веб-в'ю немає ні консолі,
 * ні налагоджувача, а розібратись, чому екран порожній, якось треба.
 */
function reportToSaver() {
  const say = globalThis.webkit?.messageHandlers?.saver;
  if (!say) return;
  addEventListener('error', (event) => say.postMessage(`помилка: ${event.message}`));
  addEventListener('unhandledrejection', (event) =>
    say.postMessage(`обіцянка: ${event.reason?.message ?? event.reason}`),
  );
  setInterval(() => {
    say.postMessage(
      `годинник=${el('hint').querySelector('.hint-clock .flap').textContent} стоять=${el('screen-standing').textContent} ` +
        `показ=${state.train.data ? 'потяг' : 'факт'} станцій=${state.screen.lastFeatures ?? '?'}`,
    );
  }, 30_000);
}

/**
 * Зерно поточного циклу: обидва екрани рахують з нього те саме, тому
 * показують один потяг і той самий факт, ніяк не спілкуючись між собою.
 */
function cycleSeed() {
  const cycle = Math.max(5000, state.screen.trainEvery + state.screen.pause);
  return Math.floor(Date.now() / cycle);
}

/** Детермінований генератор: те саме зерно — та сама послідовність. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Кільце біля назви режиму: збігає за час простою й показує, коли почнеться
 * показ. Інакше пауза виглядає так, ніби скрінсейвер просто нічого не робить.
 */
function paintIdleRing() {
  const ring = el('idle-ring');
  const show = state.mode === 'screen' && document.documentElement.dataset.chrome !== 'off';
  ring.hidden = !show;
  if (!show) return;

  const running = demoIsRunning();
  const idle = performance.now() - state.screen.lastInput;
  // Поки йде показ, кільце стоїть повним: воно відлічує очікування, а не показ.
  const left = running ? 1 : Math.max(0, 1 - idle / IDLE_BEFORE_DEMO);

  const run = ring.querySelector('.idle-run');
  const circumference = 2 * Math.PI * 10;
  run.style.strokeDasharray = String(circumference);
  run.style.strokeDashoffset = String(circumference * (1 - left));
  ring.classList.toggle('is-running', running);
  ring.classList.toggle('is-done', !running && left === 0);
  ring.setAttribute('aria-label', t(running ? 'screen.demoStop' : 'screen.demoStart'));
}

/** Показ іде: або його ввімкнули руками, або збіг час очікування. */
function demoIsRunning() {
  const screen = state.screen;
  if (screen.demo === 'on') return true;
  if (screen.demo === 'off') return false;
  return performance.now() - screen.lastInput >= IDLE_BEFORE_DEMO;
}

/**
 * Плей і пауза в кільці: чекати тридцять секунд не обов'язково, а спинити
 * показ інакше можна було тільки рухом миші — і то на тридцять секунд.
 */
function toggleDemo() {
  const screen = state.screen;
  if (demoIsRunning()) {
    screen.demo = 'off';
    if (state.train.data) hideTrain();
  } else {
    screen.demo = 'on';
    screen.lastInput = performance.now() - IDLE_BEFORE_DEMO;
    state.train.at = -screen.trainEvery;
    screen.quietUntil = 0;
  }
  paintIdleRing();
}

function trainSpotlight(now, time) {
  // У прискореному режимі камерою керує мандрівка по землях, а не потяг.
  tourStep(now);

  // Там же немає ні потягів, ні фактів: доба летить за двадцять хвилин, і
  // читати про рейс, який уже давно приїхав, нема сенсу. Лишається годинник.
  if (state.screen.accelerated) {
    if (state.train.data) hideTrain();
    return;
  }

  // Прожектор живе тільки у скрінсейвері: у денному режимі табло належить
  // станції під курсором, а карта — порахованому маршруту.
  if (state.mode !== 'screen') return;
  if (state.train.data && now > state.train.until) hideTrain();

  // Демо вмикається лише тоді, коли за столом нікого: хвилина без миші,
  // клавіш і рухів карти. Під час екскурсії воно мовчить взагалі.
  if (!el('tour').hidden) return;
  // У кіоску чекати нема на кого: миші там немає взагалі.
  if (document.documentElement.dataset.chrome !== 'off' && !demoIsRunning()) return;

  // Другий екран починає пізніше: інакше обидва спалахують табло водночас.
  if (now - state.screen.startedAt < state.screen.startDelay) return;
  if (performance.now() < state.screen.quietUntil) return;
  if (now - state.train.at < state.screen.trainEvery) return;
  state.train.at = now;

  // Половина показів — факт, половина — живий потяг. Коли екрани мають
  // показувати одне й те саме, кидаємо не монетку, а спільне зерно.
  const rand = state.screen.sync ? seeded(cycleSeed()) : Math.random;
  if (rand() < 0.5) {
    showFact(randomFact(rand));
    return;
  }

  worker.postMessage({
    seed: state.screen.sync ? cycleSeed() : null,
    type: 'train',
    time: Math.floor(time),
    bounds: state.screen.scope === 'view' ? viewportBounds() : null,
  });
}

/**
 * Демо-екскурсія: сім кроків по трьох режимах.
 *
 * Кожен крок сам перемикає режим, підсвічує потрібний елемент і пояснює,
 * що це. Підсвітка — прозорий блок поверх цілі з великою тінню: одна
 * коробка замість чотирьох, і рамка сама їде між кроками.
 */
let tourAt = -1;

async function startTour() {
  closeIntro();
  tourAt = -1;
  el('tour').hidden = false;
  await goToStep(0);
}

function endTour({ back = false } = {}) {
  tourAt = -1;
  el('tour').hidden = true;
  if (!back) return;
  // Екскурсія закінчилась там, де почалась: перший режим і вікно вибору.
  selectMode('day');
  openIntro();
}

async function goToStep(index) {
  if (index >= TOUR_STEPS.length) return endTour({ back: true });
  if (index < 0) return endTour();
  const step = TOUR_STEPS[index];
  tourAt = index;

  if (state.mode !== step.mode) {
    selectMode(step.mode);
    await pause(700);
  }
  // Крок може вказувати на елемент згорнутої панелі — тоді розгортаємо її,
  // інакше підсвічувати нема чого.
  if (step.target.startsWith('#screen') && document.documentElement.dataset.panel === 'off') {
    togglePanel(true);
    await pause(300);
  }
  if (step.action === 'demoRoute' && !state.result) {
    demoRoute();
    await pause(900);
  }
  // Крок про налаштування має показувати саме їх, а не дашборди.
  if (step.action === 'showSettings') {
    selectScreenTab('settings');
    await pause(200);
  }

  const target = document.querySelector(step.target);
  if (!target) return goToStep(index + 1);
  paintStep(step, target, index);
}

function paintStep(step, target, index) {
  const rect = target.getBoundingClientRect();
  const spot = el('tour-spot');
  spot.style.top = `${rect.top - 6}px`;
  spot.style.left = `${rect.left - 6}px`;
  spot.style.width = `${rect.width + 12}px`;
  spot.style.height = `${rect.height + 12}px`;

  el('tour-title').textContent = t(`tour.${step.id}.title`);
  el('tour-text').textContent = t(`tour.${step.id}.text`);
  el('tour-step').textContent = t('tour.step', { n: index + 1, total: TOUR_STEPS.length });
  el('tour-next').textContent = t(index === TOUR_STEPS.length - 1 ? 'tour.done' : 'tour.next');
  el('tour-prev').disabled = index === 0;

  const card = el('tour-card');
  const box = card.getBoundingClientRect();
  const place = placeCard(rect, { width: innerWidth, height: innerHeight }, {
    width: box.width || 320,
    height: box.height || 190,
  });
  card.style.top = `${place.top}px`;
  card.style.left = `${place.left}px`;
  card.dataset.side = place.side;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Демонстраційний розрахунок, щоб на карті було що показати. */
function demoRoute() {
  const frankfurt = Object.keys(state.index?.stations ?? {}).find(
    (id) => state.index.stations[id].name === 'Frankfurt (Main) Hauptbahnhof',
  );
  if (frankfurt) selectOrigin(frankfurt);
}

/**
 * Параметри адреси — щоб сторінку можна було відкрити відразу в потрібному
 * стані: `?mode=screen&chrome=off&panel=off`.
 *
 * Це для кіоску й macOS-скрінсейвера, який тримає сторінку у веб-в’ю: там
 * ніхто не натисне «скрінсейвер» руками й не закриє вікно привітання.
 */
function applyUrlOptions() {
  const options = new URLSearchParams(location.search);

  const mode = options.get('mode');
  if (['day', 'sheldon', 'screen'].includes(mode)) {
    rememberIntroSeen();
    closeIntro();
    selectMode(mode);
  }
  if (options.get('panel') === 'off') togglePanel(false);
  // Кіоск лишає дашборди — глядачеві вони й цікаві, — але прибирає все, що
  // треба натискати: налаштування тут задає сам скрінсейвер.
  if (options.get('chrome') === 'off') document.documentElement.dataset.chrome = 'off';

  applyScreenOptions(options);
  reportToSaver();
  // Застосунок прокинувся: правила проти блимання більше не потрібні.
  document.documentElement.classList.add('ready');
}

/**
 * Налаштування скрінсейвера з адреси: у macOS їх задають у вікні заставки, а
 * сторінка отримує вже готові значення.
 */
function applyScreenOptions(options) {
  // Мова: у вебі її обирають перемикачем і памʼятає localStorage, у заставці
  // — у вікні «Параметри», звідки вона приходить адресою.
  const lang = options.get('lang');
  if (lang && LANGUAGES.includes(lang)) selectLanguage(lang);

  const speed = options.get('speed');
  if (speed === 'fast' || speed === 'real') {
    state.screen.accelerated = speed === 'fast';
    for (const button of document.querySelectorAll('#screen-speed button')) {
      button.setAttribute('aria-checked', String(button.dataset.speed === speed));
    }
  }

  const minutes = Number(options.get('minutes'));
  if (Number.isFinite(minutes) && minutes >= 10 && minutes <= 60) {
    state.screen.durationMinutes = minutes;
    el('screen-duration').value = String(minutes);
  }

  const scope = options.get('scope');
  if (scope === 'all' || scope === 'view') {
    state.screen.scope = scope;
    for (const button of document.querySelectorAll('#screen-scope button')) {
      button.setAttribute('aria-checked', String(button.dataset.scope === scope));
    }
  }

  // Ритми: у секундах, бо так їх задають у налаштуваннях заставки.
  for (const [key, name, min, max] of [
    ['trainEvery', 'board', 10, 120],
    ['factShown', 'fact', 5, 90],
    ['pause', 'pause', 5, 300],
    ['tourEvery', 'tour', 10, 300],
    ['refresh', 'refresh', 2, 300],
    ['startDelay', 'delay', 0, 120],
  ]) {
    const seconds = Number(options.get(name));
    if (Number.isFinite(seconds) && seconds >= min && seconds <= max) {
      state.screen[key] = seconds * 1000;
    }
  }

  // Своя земля й роль екрана — працюють лише у прискореному режимі.
  const region = options.get('region');
  if (region) state.screen.region = stateOfCapital(region) ?? region;
  const display = options.get('display');
  if (display === 'main' || display === 'second') state.screen.display = display;
  state.screen.sync = options.get('sync') === 'on';
  // Запізнення має сенс лише для другого екрана: головний починає одразу.
  if (state.screen.display !== 'second') state.screen.startDelay = 0;
  if (state.screen.region || state.screen.display === 'second') loadStateBounds();

  el('screen-duration').disabled = !state.screen.accelerated;
  el('screen-duration-value').textContent = t('screen.minutes', {
    n: state.screen.durationMinutes,
  });
}

/**
 * Чи веде камеру мандрівка по землях. Тоді прожектор потяга лишає карту
 * у спокої: два керма на одну камеру дають смикання.
 */
function touring() {
  const screen = state.screen;
  if (!screen.bounds) return false;
  // Обрана область тримає карту в будь-якому режимі — інакше перемикач у
  // вебі виглядав би зламаним. Мандрівка країною лишається прискореному
  // режимові на другому екрані.
  if (screen.region) return true;
  return screen.accelerated && screen.display === 'second';
}

/** Межі земель — із тієї самої геометрії, що малює підкладку. */
async function loadStateBounds() {
  if (state.screen.bounds) return;
  try {
    state.screen.bounds = stateBounds(await loadJson(`${GEO}/germany-states.json`));
  } catch {
    state.screen.bounds = null; // без меж просто лишається вся карта
  }
}

/**
 * Куди дивиться карта у прискореному режимі.
 *
 * Головний екран тримає обрану землю, другий мандрує: показує випадкову
 * землю, потім переїжджає до іншої або відʼїжджає на всю країну. У
 * реальному часі нічого цього немає — там камерою керує прожектор потяга.
 */
function tourStep(now) {
  const screen = state.screen;
  if (!screen.bounds) return false;
  if (!screen.accelerated && !screen.region) return false;

  if (screen.display !== 'second' || !screen.accelerated) {
    if (!screen.region || screen.tourState === screen.region) return Boolean(screen.region);
    const box = screen.bounds[screen.region];
    if (!box) return false;
    screen.tourState = screen.region;
    map.fitBounds(box, { padding: 40, duration: 2400, essential: true });
    return true;
  }

  if (now - screen.tourAt < screen.tourEvery) return true;
  screen.tourAt = now;
  const next = nextStop(Object.keys(screen.bounds), screen.tourState);
  screen.tourState = next;
  if (next === null) map.fitBounds(GERMANY, { padding: 28, duration: 3000, essential: true });
  else map.fitBounds(screen.bounds[next], { padding: 40, duration: 3000, essential: true });
  return true;
}

/** Яку вкладку панелі видно: дашборди чи налаштування. */
function selectScreenTab(name) {
  el('screen').dataset.tab = name;
  // Клік по кільцю не має перемикати режим: воно живе всередині кнопки.
  for (const event of ['click', 'pointerdown']) {
    el('idle-ring').addEventListener(event, (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (event === 'click') toggleDemo();
    });
  }
  el('idle-ring').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggleDemo();
  });

  for (const tab of document.querySelectorAll('#screen-tabs button')) {
    tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  }
}

/**
 * Сховати панель цілком — лишається сама карта.
 *
 * Ширина панелі — та сама змінна, від якої рахуються накладки, тому годинник
 * і табло самі стають по центру вільного місця.
 */
function togglePanel(visible) {
  document.documentElement.dataset.panel = visible ? 'on' : 'off';
  el('screen-show-panel').hidden = visible;
  map.resize();
}

/** Прямокутник видимої частини карти — межі пошуку в режимі «тут». */
function viewportBounds() {
  const b = map.getBounds();
  return [
    [b.getWest(), b.getSouth()],
    [b.getEast(), b.getNorth()],
  ];
}

/**
 * Скрінсейвер: неінтерактивне табло.
 *
 * Кадр коштує один запит до воркера (зріз готового індексу) і один setData,
 * тому цикл спокійно тримає 60 к/с навіть на прискореному дні.
 */
function screenTick(timestamp) {
  const screen = state.screen;
  if (!screen.startedAt) screen.startedAt = timestamp;
  const time = clockAt({
    accelerated: screen.accelerated,
    durationSeconds: screen.durationMinutes * 60,
    elapsed: (timestamp - screen.startedAt) / 1000,
    now: new Date(),
  });
  // Шар живих станцій оновлюємо не щокадру, а коли справді змінився стан:
  // раз на секунду розкладу, а в прискореному режимі — раз на хвилину, бо
  // там і так один стан. Перемальовування 1 700 крапок 60 разів на секунду
  // зʼїдало третину кадрів: MapLibre щоразу заново тайлить увесь шар.
  const step = screen.accelerated ? 60 : 1;
  const tick = Math.floor(time / step);
  if (tick !== screen.lastTick) {
    screen.lastTick = tick;
    worker.postMessage({ type: 'live', time: Math.floor(time) });
  }

  state.screen.lastTime = time;
  paintClock(time);
  paintIdleRing();
  refreshStep(timestamp);
  trainSpotlight(timestamp, time);
  screen.frame = requestAnimationFrame(screenTick);
}

/**
 * Хвилини просто змінюються. Механічне табло тут було б шумом: цифри
 * крутяться лише на переході з інформації про потяг і назад.
 */
function paintClock(time) {
  const text = bigClock(time);
  if (performance.now() < state.screen.flapUntil) return;
  const node = el('hint').querySelector('.hint-clock .flap');
  // Звіряємось із самим вузлом, а не лише з памʼяттю: коли вкладку ховають,
  // rAF засинає й прокрутка може завмерти на півдорозі — тоді на табло
  // лишаються випадкові цифри, поки не зміниться хвилина.
  if (text === state.screen.clockText && node.textContent === text) return;
  state.screen.clockText = text;
  node.textContent = text;
}

/**
 * Годинник просто поступається місцем табло потяга — без анімації: тут
 * увага має піти на інформацію, а не на цифри, які зникають.
 */
function handoffToBoard() {
  // Вікно одне на всі стани, тож «перехід» — це зміна класу, а не показ
  // іншого вікна: нічого не стрибає з місця на місце.
  if (state.mode !== 'screen') return;
}

/** Зворотний перехід: табло гасне, годинник накручується назад. */
function handoffToClock() {
  if (state.mode !== 'screen') return;
  const hint = el('hint');
  hint.classList.remove('is-live', 'is-fact', 'is-empty');
  hint.classList.add('is-clock');
  // назад годинник накручується з прочерків — це другий і останній момент,
  // коли табло крутиться
  const node = hint.querySelector('.hint-clock .flap');
  const text = bigClock(state.screen.lastTime ?? 0);
  state.screen.clockText = text;
  state.screen.flapUntil = performance.now() + 700;
  node.textContent = '--:--';
  flapText(node, text);
}

/** 52380 -> '14:33'. Секунди на табло не потрібні: вони лише миготять. */
function bigClock(seconds) {
  const t = ((seconds % DAY) + DAY) % DAY;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Відповідь воркера: три стани станцій навколо поточної хвилини.
 *
 * Стоїть — залита крапка, рушає за півхвилини — кільце, що стискається,
 * щойно поїхав — сірий слід, який згасає. Разом це дає рух там, де насправді
 * рухається лише час.
 */
function renderLive({ time, stops, phase, value, counts }) {
  const screen = state.screen;

  // Кадрів за хвилину розкладу — десятки, тому підсумки рахуємо раз на
  // хвилину симуляції: інакше числа просто біжать зі швидкістю rAF.
  const minute = Math.floor(time / 60);
  const newMinute = minute !== screen.lastMinute;
  if (minute < screen.lastMinute) {
    // доба почалась спочатку — рахунок теж
    screen.seen.clear();
    screen.ticker = [];
  }

  // У прискореному режимі вікно в півхвилини проскакує швидше за кадр, і
  // три стани на карті перетворюються на мерехтіння. Там лишається один
  // стан — «тут зараз потяг», а розклад на три числа живе на дашборді.
  const detailed = !screen.accelerated;

  const features = [];
  for (let i = 0; i < stops.length; i += 1) {
    const station = state.byIndex[stops[i]];
    if (!station || station.out) continue;
    if (!detailed && phase[i] !== 1) continue;
    if (phase[i] === 1) {
      if (newMinute) {
        screen.seen.add(stops[i]);
        }
    }
    if (phase[i] === 2 && newMinute) rememberDeparture(readableName(station.name));
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
      properties: { phase: phase[i], value: value[i] },
    });
  }
  if (state.layersReady) {
    map.getSource('live-stops').setData({ type: 'FeatureCollection', features });
    state.screen.lastFeatures = features.length;
  }

  // Малює не тут: віджети оновлюються по одному, своїм ритмом. Тут лише
  // відкладаємо свіжі дані — інакше панель перемальовується щокадру цілком,
  // і зміни в ній ніхто не встигає помітити.
  screen.latest = { stops, phase, counts };
  if (newMinute) screen.lastMinute = minute;
}

/**
 * Дашборди оновлюються по черзі: за цикл перемальовується рівно один віджет.
 *
 * Так у панелі завжди щось ледь помітно змінюється, замість того щоб раз на
 * хвилину смикнутись усією. Порядок сталий — око звикає, де чого чекати.
 */
const WIDGETS = [
  [(data) => paintFigures(data.counts)],
  [(data) => renderToday(data.counts)],
  [() => renderTicker()],
  [(data) => renderStates(data.stops, data.phase)],
  [(data) => renderKinds(data.counts.kinds)],
  [(data) => renderEdges(data.stops, data.phase)],
];

function refreshStep(now) {
  const screen = state.screen;
  if (!screen.latest) return;

  // Перші дані малюємо всі одразу: інакше половина панелі стоїть порожня,
  // поки кожен віджет дочекається своєї черги.
  if (!screen.primed) {
    screen.primed = true;
    screen.refreshAt = now;
    for (const [paint] of WIDGETS) paint(screen.latest);
    return;
  }

  if (now - screen.refreshAt < screen.refresh) return;
  screen.refreshAt = now;

  const [paint] = WIDGETS[screen.refreshTurn % WIDGETS.length];
  screen.refreshTurn += 1;
  paint(screen.latest);
}

function paintFigures(counts) {
  flapText(el('screen-standing'), String(counts.standing));
  flapText(el('screen-leaving'), String(counts.leaving));
  flapText(el('screen-left'), String(counts.arrived));
}

/**
 * Підсумки доби: скільки країна проїхала, як часто рушають потяги і скільки
 * станцій сьогодні ще нікого не бачили.
 */
function renderToday(counts) {
  if (counts.km !== null && counts.km !== undefined) {
    flapText(el('screen-km'), Math.round(counts.km).toLocaleString('uk-UA'));
  }
  // Скільки потягів рушає цієї хвилини. Раніше тут був інтервал у секундах,
  // але «раз на 0.1 с» читається як помилка, хоч і правда.
  flapText(el('screen-rate'), String(counts.departuresThisMinute ?? 0));

}

/**
 * Де зараз рух — три найактивніші землі.
 *
 * Земля станції лежить у самих даних (`s` у stations.json), тож це просто
 * підрахунок по тих станціях, де зараз стоїть потяг.
 */
function renderStates(stops, phase) {
  const names = state.index?.states;
  if (!names) return;

  const counts = new Map();
  let total = 0;
  for (let i = 0; i < stops.length; i += 1) {
    if (phase[i] !== 1) continue;
    const station = state.byIndex[stops[i]];
    if (!station || station.out || station.s == null) continue;
    counts.set(station.s, (counts.get(station.s) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return;

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const list = el('screen-states');

  // Рядки не перебудовуємо, а оновлюємо: інакше нові вузли зʼявляються вже з
  // готовою шириною, і смуга стрибає замість того, щоб дорости.
  while (list.children.length < top.length) {
    const item = document.createElement('li');
    item.append(
      document.createElement('span'),
      document.createElement('i'),
      document.createElement('b'),
    );
    list.append(item);
  }
  while (list.children.length > top.length) list.lastElementChild.remove();

  top.forEach(([id, count], i) => {
    const share = Math.round((count / total) * 100);
    const item = list.children[i];
    item.querySelector('span').textContent = names[id] ?? '—';
    item.querySelector('i').style.width = `${share}%`;
    flapText(item.querySelector('b'), `${share}%`);
  });
}

/**
 * Хто зараз їде — частки S-Bahn, RE, RB і решти за останню годину. Рахує
 * воркер: назви ліній лежать поруч із розкладом, а не в станціях.
 */
function renderKinds(kinds) {
  if (!kinds) return;
  const total = kinds.S + kinds.RE + kinds.RB + kinds.other;
  if (total === 0) return;

  const bar = el('screen-kinds');
  for (const kind of ['S', 'RE', 'RB', 'other']) {
    let part = bar.querySelector(`[data-kind='${kind}']`);
    if (!part) {
      part = document.createElement('span');
      part.dataset.kind = kind;
      part.style.width = '0%';
      bar.append(part);
    }
    const share = (kinds[kind] / total) * 100;
    part.style.width = `${share}%`;
    part.title = `${t(`screen.kind.${kind}`)} · ${Math.round(share)}%`;
    part.textContent = share > 12 ? t(`screen.kind.${kind}`) : '';
  }
}

/** Крайні точки: найпівнічніший і найпівденніший потяг під посадку. */
function renderEdges(stops, phase) {
  let north = null;
  let south = null;
  for (let i = 0; i < stops.length; i += 1) {
    if (phase[i] !== 1) continue;
    const station = state.byIndex[stops[i]];
    if (!station || station.out) continue;
    if (!north || station.lat > north.lat) north = station;
    if (!south || station.lat < south.lat) south = station;
  }
  if (!north || !south) return;
  flapText(el('screen-north'), readableName(north.name));
  flapText(el('screen-south'), readableName(south.name));
}

/** Стрічка останніх відправлень — те, що щойно поїхало. */
function rememberDeparture(name) {
  const ticker = state.screen.ticker;
  if (ticker[0] === name) return;
  ticker.unshift(name);
  ticker.length = Math.min(ticker.length, 4);
}

function renderTicker() {
  const list = el('screen-ticker');
  const names = state.screen.ticker;
  while (list.children.length < names.length) list.append(document.createElement('li'));
  while (list.children.length > names.length) list.lastElementChild.remove();
  // Прокручуємо кожен рядок із затримкою: стрічка читається згори вниз.
  names.forEach((name, i) => flapText(list.children[i], name, { stagger: 1.4 }));
}


/** Гістограма відправлень по годинах — приходить разом з індексом. */
function renderHours(hours) {
  state.screen.hours = hours;
  const peak = Math.max(...hours, 1);
  el('screen-hours').innerHTML = '';
  hours.forEach((value, hour) => {
    const bar = document.createElement('span');
    bar.className = 'screen-bar';
    bar.style.height = `${Math.round((value / peak) * 100)}%`;
    bar.title = `${hour}:00 — ${value}`;
    el('screen-hours').append(bar);
  });
}

function startScreen() {
  const screen = state.screen;
  screen.startedAt = 0;
  screen.primed = false;
  screen.lastTick = null;
  screen.seen.clear();
  screen.lastMinute = -1;
  screen.ticker = [];
  el('screen-duration-value').textContent = t('screen.minutes', { n: screen.durationMinutes });
  if (!screen.frame) screen.frame = requestAnimationFrame(screenTick);
}

function stopScreen() {
  if (state.screen.frame) cancelAnimationFrame(state.screen.frame);
  state.screen.frame = 0;
  if (state.layersReady) map.getSource('live-stops').setData(EMPTY);
}

/**
 * Режим — це різні застосунки на одній карті, тому перемикання ховає цілі
 * панелі, а не окремі контроли.
 */
function selectMode(mode) {
  state.mode = mode;
  document.documentElement.dataset.mode = mode;
  for (const button of document.querySelectorAll('#mode-switch button')) {
    button.setAttribute('aria-checked', String(button.dataset.mode === mode));
  }
  const story = mode === 'sheldon';
  const screen = mode === 'screen';
  hideTrain(); // прожектор не переїжджає між режимами разом із нами
  state.train.at = -state.screen.trainEvery; // у новому режимі перший потяг — одразу
  el('panel').hidden = story || screen;
  el('story').hidden = !story;
  el('screen').hidden = !screen;
  el('screen-show-panel').hidden = !screen || document.documentElement.dataset.panel !== 'off';
  // У скрінсейвері те саме вікно показує годинник, табло потяга або факт.
  el('hint').hidden = story;
  el('hint').classList.toggle('is-clock', screen);
  if (screen) el('hint').classList.remove('is-empty');
  el('timeline').hidden = story || screen || !state.result;

  if (!story) clearStoryLayers();
  if (!screen) stopScreen();

  if (story) {
    // порахований денний маршрут під розповіддю тільки заважає
    for (const source of ['stations', 'zones', 'hover']) {
      map.getSource(source)?.setData(EMPTY);
    }
    selectRoute(state.route);
  }
  else if (screen) {
    // скрінсейвер — окрема картинка: ні зон, ні порахованого маршруту, ні
    // позначок старту, ні шкали часу
    for (const source of ['stations', 'zones', 'hover', 'origins']) {
      map.getSource(source)?.setData(EMPTY);
    }
    startScreen();
    map.fitBounds(GERMANY, { padding: 60, duration: 900 });
  } else render();
}

/**
 * Перемкнути тему: розмітка, кнопки й базова карта.
 *
 * Стиль карти доводиться перезавантажувати цілком, тому власні шари
 * додаються заново — addLayers переживає повторний виклик.
 */
function applyTheme(theme) {
  for (const button of document.querySelectorAll('#theme-switch button')) {
    button.setAttribute('aria-pressed', String(button.dataset.theme === theme));
  }
  renderLegendLabels();
  const wanted = `${theme}:${currentProvider()}`;
  if (basemap !== wanted) {
    basemap = wanted;
    state.layersReady = false;
    map.setStyle(mapStyle(theme));
  }
}

/** На OSM міста підписує сама підкладка, тож свої ховаємо. */
function applyProviderVisibility() {
  if (!state.layersReady) return;
  const visible = currentProvider() === 'own' ? 'visible' : 'none';
  for (const layer of ['capitals', 'capital-labels']) {
    map.setLayoutProperty(layer, 'visibility', visible);
  }
}

/** Перемкнути підкладку: власна Німеччина чи відкрита карта світу. */
function selectProvider(next) {
  setProvider(next);
  for (const button of document.querySelectorAll('#map-switch button')) {
    button.setAttribute('aria-pressed', String(button.dataset.map === currentProvider()));
  }
  applyTheme(currentTheme());
  applyProviderVisibility();
}

function selectTheme(theme) {
  applyTheme(setTheme(THEMES.includes(theme) ? theme : null));
}

/** Вираз MapLibre «поріг -> колір» для поточного вікна поїздки. */
function stepExpression(value) {
  const { breaks } = WINDOWS[state.window];
  const scale = seq();
  return ['step', value, scale[0], breaks[0], scale[1], breaks[1], scale[2], breaks[2], scale[3]];
}
const state = {
  index: null,
  patterns: null, // назви ліній по патернах — лише для підпису потяга
  byIndex: null, // порядковий номер станції у фіді -> її запис
  result: null, // останній результат воркера: типізовані масиви
  origin: null,
  window: 'day',
  clock: null, // час анімації в секундах; null — показуємо весь день одразу
  playing: false,
  profile: null,
  network: null,
  layersReady: false,
  mode: 'day', // day | sheldon | screen
  screen: {
    // за замовчуванням скрінсейвер показує те, що відбувається просто зараз,
    // і бере потяги з усієї країни
    accelerated: false,
    durationMinutes: 20,
    // Ритми: скільки триває один показ на табло, факт і крок мандрівки.
    trainEvery: TRAIN_EVERY_DEFAULT,
    factShown: FACT_SHOWN_DEFAULT,
    pause: PAUSE_DEFAULT,
    quietUntil: 0,
    // Дашборди: свіжі дані, ритм оновлення й чий зараз хід.
    latest: null,
    refresh: REFRESH_DEFAULT,
    refreshAt: 0,
    refreshTurn: 0,
    primed: false,
    // Показ: 'auto' — за простоєм, 'on' — увімкнули руками, 'off' — спинили.
    demo: 'auto',
    // Другий екран стартує пізніше, щоб два табло не спалахували одночасно.
    startDelay: 0,
    // Однаковий вміст на екранах чи різний. Спілкуватись їм нема як (це різні
    // сторінки в різних процесах), тому «однаковий» — це спільне зерно
    // випадковості з годинника: обидва рахують те саме, не змовляючись.
    sync: false,
    tourEvery: TOUR_EVERY_DEFAULT,
    // Своя земля й роль екрана — тільки для прискореного режиму.
    region: null,
    display: 'main',
    bounds: null,
    tourAt: 0,
    tourState: null,
    startedAt: 0,
    frame: 0, // id rAF; 0 — цикл не крутиться
    seen: new Set(), // станції, які вже обслужили від початку доби
    lastMinute: -1, // остання оброблена хвилина симуляції
    hours: null,
    regions: new Map(), // земля -> скільки станцій зайнято зараз
    ticker: [], // останні відправлення для стрічки
    scope: 'all', // all | view — звідки брати випадковий потяг
    lastInput: 0, // коли востаннє рухали мишу чи торкались клавіш
    lastTick: null, // остання секунда (чи хвилина) розкладу, яку вже намалювали
    clockText: '', // що зараз на годиннику: щоб не перемальовувати те саме
    flapUntil: 0, // поки крутиться перехід, годинник не чіпаємо
  },
  train: {
    // Раз на 30 секунд табло показує випадковий потяг, що зараз у дорозі.
    // Перший — одразу: чекати пів хвилини на порожньому екрані нецікаво.
    at: -30_000,
    data: null,
    until: 0,
  },
  route: 'real', // який маршрут показує карта в режимі Шелдона
};

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

// Що зараз намальовано: тема плюс постачальник карти. Стиль
// перезавантажуємо, лише коли змінилось одне з двох.
let basemap = `${currentTheme()}:${restoreProvider()}`;

const map = new maplibregl.Map({
  container: 'map',
  style: mapStyle(currentTheme()),
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

/** Частка пройденого для заливки доріжки слайдера. */
function paintSliderFill(id) {
  const slider = el(id);
  const share = (Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
  slider.style.setProperty('--fill', `${(share * 100).toFixed(1)}%`);
}

function render() {
  el('min-stay-value').textContent = formatHours(Number(el('min-stay').value));
  el('overhead-value').textContent = formatHours(Number(el('overhead').value));
  paintSliderFill('min-stay');
  paintSliderFill('overhead');
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
  if (state.clock === null) {
    el('timeline-count').textContent = '';
    el('timeline-clock').textContent = clockTime(timelineRange().from);
  } else {
    el('timeline-count').textContent = t('timeline.live', {
      n: points.filter((p) => !p.expired).length,
    });
  }
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

  scheduleZones();
}

/**
 * Зони будує воркер.
 *
 * Перебудова коштує до 280 мс — у кадр вона не влазить ні за яких налаштувань
 * сітки, тому єдиний спосіб зберегти анімацію плавною це прибрати її з
 * головного потоку. Тут лишається саме прохання й малювання відповіді.
 *
 * У польоті тримаємо не більше одного прохання: доки воркер рахує, нові
 * стани накопичуватись не мають — важливий лише останній.
 */
const ZONES_IDLE_DELAY = 180;
const ZONES_PLAYBACK_INTERVAL = 180;
const ZONES_QUALITY = { cellKm: 5, smoothing: 2 };

let zonesTimer = null;
let zonesPending = false;
let lastZonesRequestAt = 0;

function requestZones() {
  if (zonesPending) return;
  zonesPending = true;
  lastZonesRequestAt = performance.now();
  worker.postMessage({
    type: 'zones',
    minStay: Number(el('min-stay').value),
    overhead: Number(el('overhead').value),
    clock: state.clock,
    breaks: WINDOWS[state.window].breaks,
    quality: ZONES_QUALITY,
  });
}

function scheduleZones() {
  clearTimeout(zonesTimer);

  if (!el('show-zones').checked) {
    map.getSource('zones').setData(EMPTY);
    return;
  }

  if (state.playing) {
    if (performance.now() - lastZonesRequestAt >= ZONES_PLAYBACK_INTERVAL) requestZones();
    return;
  }

  zonesTimer = setTimeout(requestZones, ZONES_IDLE_DELAY);
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
  // QR показуємо, лише коли файл справді є: з кешу картинка готова раніше,
  // ніж ми встигаємо повісити обробник.
  const qr = el('about-qr');
  if (qr.complete && qr.naturalWidth > 0) qr.hidden = false;
  else qr.onload = () => { qr.hidden = false; };

  el('intro').hidden = false;
  el('intro-backdrop').hidden = false;
  // фокус — на першому режимі: вікно тепер питає «з чого почнемо»
  document.querySelector('#intro-modes button')?.focus();
}

function closeIntro() {
  el('intro').hidden = true;
  el('intro-backdrop').hidden = true;
  rememberIntroSeen();
}

/**
 * Список джерел даних.
 *
 * Будується з sources.js, щоб посилання й ліцензії лежали поруч із самими
 * даними, а не губились у розмітці.
 */
function renderSources() {
  const list = el('sources-list');
  list.innerHTML = '';
  for (const source of SOURCES) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = source.title;
    const license = document.createElement('span');
    license.className = 'sources-license';
    license.textContent = source.license;
    const note = document.createElement('p');
    note.textContent = t(source.note);
    item.append(link, license, note);
    list.append(item);
  }

  const wiki = el('sources-wiki');
  wiki.innerHTML = '';
  WIKIPEDIA.forEach((article, i) => {
    const link = document.createElement('a');
    link.href = article.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = article.title;
    wiki.append(link);
    wiki.append(document.createTextNode(i === WIKIPEDIA.length - 1 ? ` · ${WIKIPEDIA_LICENSE}` : ', '));
  });
}

function openSources() {
  renderSources();
  el('sources').hidden = false;
  el('intro-backdrop').hidden = false;
  el('sources-close').focus();
}

function closeSources() {
  el('sources').hidden = true;
  if (el('intro').hidden) el('intro-backdrop').hidden = true;
}

/** Якщо фото не завантажилось, прибираємо його, щоб не було битої іконки. */
function setUpIntroImage() {
  // Кадрів із серіалу немає в публічній збірці — права в студії. Тому
  // джерело підставляємо з коду й прибираємо картинку, якщо файл не
  // знайшовся: інакше на місці фото висів би значок битого зображення.
  const photos = [
    [document.querySelector('.intro-photo'), 'intro.webp'],
    [el('story-photo'), 'sheldon.webp'],
  ];
  for (const [photo, file] of photos) {
    if (!photo) continue;
    photo.onerror = () => photo.remove();
    photo.onload = () => {
      photo.hidden = false;
    };
    photo.src = `${import.meta.env.BASE_URL}${file}`;
  }
}

function setUpIntro() {
  setUpIntroImage();
  el('intro-backdrop').onclick = () => {
    closeIntro();
    closeSources();
  };
  el('sources-open').onclick = openSources;
  el('sources-close').onclick = closeSources;
  el('intro-open').onclick = openIntro;
  el('intro-close').onclick = closeIntro;
  el('about-sources').onclick = () => {
    closeIntro();
    openSources();
  };
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!el('intro').hidden) closeIntro();
    if (!el('sources').hidden) closeSources();
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
  // профіль подвоюється як індикатор прогресу: пройдене залито сигналом
  el('timeline-clip-rect').setAttribute('width', String((share * 600).toFixed(2)));
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
  el('timeline').classList.toggle('is-playing', state.playing);
  el('timeline-play').setAttribute(
    'aria-label',
    t(state.playing ? 'timeline.pause' : 'timeline.play'),
  );
}

let lastFrameAt = 0;

function tick(now) {
  if (!state.playing) return;
  const { from, to } = timelineRange();

  const elapsed = lastFrameAt ? (now - lastFrameAt) / 1000 : 0;
  lastFrameAt = now;
  const next = (state.clock ?? from) + elapsed * PLAYBACK_MINUTES_PER_SECOND * 60;

  if (next >= to) {
    state.playing = false;
    updatePlayIcon();
    setClock(to); // після зупинки зони домальовуються звичайним шляхом
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
  const area = profilePath(state.profile, 600, 40);
  el('timeline-area-future').setAttribute('d', area);
  el('timeline-area-past').setAttribute('d', area);
  el('timeline-outline').setAttribute('d', profileOutline(state.profile, 600, 40));

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

/** 7 -> '07'. */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Час у секундах від півночі -> '18:05'. */
function clockTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const label = `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return h >= 24 ? `${label} ${t('time.nextDay')}` : label;
}

/**
 * Слот під значення, що крутиться. Підставляємо його в переклад замість
 * самого значення, щоб дізнатись, де в рядку починається і закінчується
 * змінна частина: анімувати треба цифри, а не слова навколо них.
 */
const SLOT = '\u0000';

/** Порожній стан: прочерки замість даних, у всіх мовах однаково. */
const IDLE = { name: '--', hours: '--', minutes: '--', clock: '--:--' };

/** Прочерк, яким заповнюємо зарезервоване, але порожнє місце. */
const DASH = '--';

/**
 * Добити рядок прочерками до кінця ширини.
 *
 * Прочерки — не заглушка на час анімації, а частина рядка: місце під
 * назву зайняте завжди, і після зупинки табло теж.
 */
function padDashes(line, fits) {
  let out = line ? `${line} ${DASH}` : DASH;
  if (line && !fits(out)) return line;
  while (fits(`${out}-`)) out += '-';
  return out;
}

/**
 * Розкласти переклад на нерухомий текст і слоти зі значеннями.
 *
 * Каркас перебудовуємо лише коли він справді змінився (перемикання мови):
 * інакше на кожному наведенні ми б викидали вузли, які саме анімуються.
 */
function fillSlots(node, template, values) {
  if (node.dataset.template !== template) {
    node.dataset.template = template;
    node.textContent = '';
    template.split(SLOT).forEach((chunk, i) => {
      node.append(document.createTextNode(chunk));
      if (i < values.length) {
        const slot = document.createElement('span');
        slot.className = 'flap';
        node.append(slot);
      }
    });
  }
  const slots = node.querySelectorAll('.flap');
  values.forEach((value, i) => flapText(slots[i], value));
}

/**
 * Чи влізе рядок у поточну ширину назви.
 *
 * Міряємо на canvas тим самим шрифтом, що й у підказці: реальний перенос
 * браузером нам не підходить, бо рядки треба знати заздалегідь — кожен
 * анімується окремо.
 */
const measure = document.createElement('canvas').getContext('2d');
function nameFits(node) {
  const style = getComputedStyle(node);
  measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const width = node.clientWidth || 206;
  return (line) => measure.measureText(line).width <= width;
}

/**
 * Значення трьох рядків підказки. Порожній стан — той самий макет із XX
 * замість цифр, тому переходи ніколи не міняють кількість рядків.
 */
function hintValues(station) {
  if (!station) {
    return { ...IDLE, arrival: IDLE.clock, departure: IDLE.clock };
  }
  const minutes = Math.round(station.useful / 60);
  return {
    name: station.name,
    // Години й хвилини завжди двома цифрами: «00 год 37 хв» замість
    // «37 хв» — інакше підписи навколо цифр їздили б туди-сюди.
    hours: pad2(Math.floor(minutes / 60)),
    minutes: pad2(minutes % 60),
    arrival: clockTime(station.arrival),
    departure: clockTime(station.departure),
  };
}

/**
 * Підказка про станцію призначення.
 *
 * Живе окремим зафіксованим вікном, а не попапом на марці: попап
 * перехоплював би клік, а клік по станції задає новий старт. Крутяться
 * лише змінні шматки — назва й числа; слова «на місці», «приїзд», «назад»
 * стоять нерухомо, бо це підписи, а не дані.
 */
function renderHint(station) {
  const hint = el('hint');
  const { name, hours, minutes, arrival, departure } = hintValues(station);
  hint.classList.toggle('is-empty', !station);
  // Назва крутиться двома рядками одночасно — це два окремі вузли, тому
  // хвиля в кожному починається з нуля. Порожній рядок не лишаємо
  // порожнім: зарезервоване місце заповнює прочерк.
  const nameNode = hint.querySelector('.hint-name');
  const fits = nameFits(nameNode);
  const lines = station ? wrapLines(name, fits) : [];
  nameNode.querySelectorAll('.flap').forEach((slot, i) => {
    // Прочерки не анімуються: у порожньому стані вони просто стають на
    // місце, а на початку анімації зникають, звільняючи його назві.
    flapText(slot, station ? (lines[i] ?? '') : padDashes('', fits));
  });
  fillSlots(hint.querySelector('.hint-useful'), t('hint.useful', { h: SLOT, m: SLOT }), [
    hours,
    minutes,
  ]);
  fillSlots(hint.querySelector('.hint-times'), t('hint.times', { a: SLOT, d: SLOT }), [
    arrival,
    departure,
  ]);
}

function showHint({ name, useful, arrival, departure }) {
  renderHint({ name, useful, arrival, departure });
}

/** Вікно лишається на екрані — цифри просто відкручуються назад у XX. */
function clearHint() {
  renderHint(null);
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
  clearHint(); // новий старт — старі числа вже неправдиві
  worker.postMessage({
    type: 'route',
    origin: station.i,
    departAfter: DEPART_AFTER,
    returnBy: WINDOWS[state.window].returnBy,
  });
}

worker.onmessage = (event) => {
  if (event.data.type === 'live') {
    if (state.mode === 'screen') renderLive(event.data);
    return;
  }
  if (event.data.type === 'train') {
    showTrain(event.data.train, event.data.time);
    return;
  }
  if (event.data.type === 'live-ready') {
    renderHours(Array.from(event.data.hours));
    const { minute, value } = event.data.peak;
    el('screen-peak').textContent = t('screen.peak', {
      time: clockTime(minute * 60),
      n: value.toLocaleString('uk-UA'),
    });
    return;
  }
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

  if (message.type === 'zones') {
    zonesPending = false;
    // у скрінсейвері зон немає взагалі: пізня відповідь воркера не має
    // повертати їх на екран
    if (state.mode === 'screen') return;
    if (state.layersReady && el('show-zones').checked) {
      map.getSource('zones').setData(message.zones);
    }
    return;
  }

  if (message.type === 'result') {
    state.result = { stops: message.stops, arrivals: message.arrivals, departures: message.departures };
    if (state.mode !== 'screen') render();
  }
};

/** Значення CSS-змінної теми — щоб шари карти й панель були одного кольору. */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let handlersBound = false;

function addLayers() {
  // Схема мережі лежить найнижче: вона контекст, а не дані відповіді.
  map.addSource('network', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'network',
    type: 'line',
    source: 'network',
    paint: {
      // На власній карті колії — головний вміст, а не тло, тому лінія
      // важча, ніж була поверх CARTO.
      'line-color': cssVar('--network-line'),
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 9, 1.8, 12, 3],
      'line-opacity': 0.8,
    },
  });

  // Усі станції фіду — частина підкладки: на власній карті колії без
  // зупинок читаються як абстрактний граф.
  map.addSource('all-stops', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'all-stops',
    type: 'circle',
    source: 'all-stops',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1.2, 9, 2.4, 12, 4],
      'circle-color': cssVar('--grey-500'),
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 9, 0.9],
    },
  });
  map.addLayer({
    id: 'all-stop-labels',
    type: 'symbol',
    source: 'all-stops',
    minzoom: 10,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT,
      'text-size': 10,
      'text-offset': [0, 0.9],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': cssVar('--grey-500'),
      'text-halo-color': cssVar('--paper'),
      'text-halo-width': 1.2,
    },
  });

  // Обласні центри: на власній карті міст немає взагалі, і без них
  // Німеччина читається як абстрактний граф. На OSM їх ховаємо — там свої
  // підписи міст.
  map.addSource('capitals', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'capitals',
    type: 'circle',
    source: 'capitals',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.6, 9, 4.5],
      'circle-color': cssVar('--ink'),
      'circle-opacity': 0.75,
    },
  });
  map.addLayer({
    id: 'capital-labels',
    type: 'symbol',
    source: 'capitals',
    layout: {
      'text-field': ['get', 'city'],
      'text-font': FONT,
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 9, 14],
      'text-offset': [0, 0.8],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': cssVar('--ink'),
      'text-halo-color': cssVar('--paper'),
      'text-halo-width': 1.6,
    },
  });

  // Скрінсейвер: три стани станції — стоїть, рушає, щойно поїхав. Різниця
  // кольором, без анімації: сотні крапок, що пульсують, читаються як шум.
  map.addSource('live-stops', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'live-stops',
    type: 'circle',
    source: 'live-stops',
    paint: {
      // phase: 0 — щойно поїхав, 1 — стоїть, 2 — рушає за півхвилини
      'circle-radius': ['case', ['==', ['get', 'phase'], 1], 4, 3],
      'circle-color': [
        'case',
        ['==', ['get', 'phase'], 1],
        LIVE_COLORS.standing,
        ['==', ['get', 'phase'], 2],
        LIVE_COLORS.leaving,
        LIVE_COLORS.arrived,
      ],
      'circle-opacity': 0.95,
    },
  });

  // Куди зараз полетить карта: рамка зʼявляється раніше за зум, щоб око
  // встигло зрозуміти, куди дивитись.
  map.addSource('train-frame', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'train-frame',
    type: 'line',
    source: 'train-frame',
    paint: {
      'line-color': cssVar('--grey-500'),
      'line-width': 1.5,
      'line-dasharray': [3, 3],
      'line-opacity': 0.9,
    },
  });

  // Потяг у центрі уваги: пройдене сірим, решта маршруту сигнальним.
  map.addSource('train-done', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'train-done',
    type: 'line',
    source: 'train-done',
    paint: {
      // пройдене — сірим, але не блідішим за колії під ним, інакше воно
      // просто зникає у схемі мережі
      'line-color': cssVar('--grey-700'),
      'line-width': 4,
      'line-opacity': 0.85,
      'line-dasharray': [2, 1.4],
    },
  });
  map.addSource('train-left', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'train-left',
    type: 'line',
    source: 'train-left',
    paint: { 'line-color': '#ea5212', 'line-width': 5 },
  });
  map.addSource('train-now', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'train-now',
    type: 'circle',
    source: 'train-now',
    paint: {
      'circle-radius': 7,
      'circle-color': '#ea5212',
      'circle-stroke-width': 3,
      'circle-stroke-color': cssVar('--paper'),
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
        cssVar('--dot-expired'),
        stepExpression(['get', 'useful']),
      ],
      'circle-opacity': 1,
    },
  });

  // Кільце під курсором: марки дрібні, без нього не видно, на якій ти.
  map.addSource('hover', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'hover',
    type: 'circle',
    source: 'hover',
    paint: {
      'circle-radius': 8,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#121826',
      'circle-stroke-opacity': 0.55,
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
      'circle-color': ['case', ['get', 'chosen'], '#ea5212', cssVar('--dot-idle')],
      'circle-stroke-width': ['case', ['get', 'chosen'], 2, 1.5],
      'circle-stroke-color': '#ea5212',
    },
  });

  addStoryLayers();

  // Зміна теми перезавантажує стиль, і шари доводиться створювати заново, а
  // слухачі при цьому лишаються живими — тому чіпляємо їх лише вперше.
  if (handlersBound) {
    finishLayers();
    return;
  }
  handlersBound = true;

  // Клік завжди задає новий старт — і по порожньому місцю, і по станції
  // призначення. Що це за станція, розповідає окрема картка на наведення:
  // попап на марці перехоплював би клік.

  map.on('click', (event) => {
    pickNearestOrigin(event.lngLat);
  });

  map.on('mousemove', 'stations', (event) => {
    const feature = event.features[0];
    showHint(feature.properties);
    map.getSource('hover').setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: feature.geometry, properties: {} }],
    });
    map.getCanvas().style.cursor = 'pointer';
  });

  // Числа лишаються від останньої станції, поки не наведеш на наступну:
  // прочитати їх часто хочеться вже після того, як миша поїхала далі.
  map.on('mouseleave', 'stations', () => {
    map.getSource('hover').setData(EMPTY);
    map.getCanvas().style.cursor = 'crosshair';
  });

  // Рух карти руками — сигнал «дай подивитись». Ставимо демо на паузу на
  // хвилину, а в режимі «видима частина» ще й запамʼятовуємо, куди дивляться.
  for (const kind of ['dragstart', 'zoomstart', 'rotatestart', 'wheel']) {
    map.on(kind, (event) => {
      if (state.mode !== 'screen') return;
      if (kind !== 'wheel' && !event.originalEvent) return; // наш власний політ
      state.screen.lastInput = performance.now();
      state.screen.demo = 'auto';
    });
  }

  map.getCanvas().style.cursor = 'crosshair';
  finishLayers();
}

/**
 * Шари маршруту Шелдона.
 *
 * Три ділянки — три різні історії: поїздка суцільна, речі й дорога пішки
 * пунктиром, заплановане кільце — блідою лінією під усім іншим.
 */
function addStoryLayers() {
  map.addSource('story-loop', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'story-loop',
    type: 'line',
    source: 'story-loop',
    paint: {
      'line-color': '#ea5212',
      'line-width': 2,
      'line-opacity': 0.9,
      'line-dasharray': [2, 2],
    },
  });

  map.addSource('story-real', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'story-real',
    type: 'line',
    source: 'story-real',
    paint: {
      // поїздка — суцільна, речі поїхали далі без нього — пунктиром
      'line-color': ['case', ['==', ['get', 'kind'], 'train'], '#ea5212', cssVar('--grey-500')],
      'line-width': ['case', ['==', ['get', 'kind'], 'train'], 3.5, 1.8],
      'line-dasharray': ['case', ['==', ['get', 'kind'], 'train'], ['literal', [1, 0]], ['literal', [2, 2]]],
    },
  });

  map.addSource('story-walk', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'story-walk',
    type: 'line',
    source: 'story-walk',
    paint: {
      'line-color': cssVar('--grey-700'),
      'line-width': 3,
      'line-opacity': 0.9,
    },
  });

  // Проміжні зупинки маршруту: дрібні крапки, назви — лише зблизька,
  // інакше на кільці з півтори сотні станцій буде каша.
  map.addSource('story-stops', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'story-stops',
    type: 'circle',
    source: 'story-stops',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1.8, 10, 3.5],
      'circle-color': cssVar('--paper'),
      'circle-stroke-width': 1.2,
      'circle-stroke-color': '#ea5212',
      'circle-opacity': 0.9,
    },
  });
  map.addLayer({
    id: 'story-stop-labels',
    type: 'symbol',
    minzoom: 9,
    source: 'story-stops',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT,
      'text-size': 10,
      'text-offset': [0, 1],
      'text-anchor': 'top',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': cssVar('--grey-700'),
      'text-halo-color': cssVar('--paper'),
      'text-halo-width': 1.2,
    },
  });

  map.addSource('story-places', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'story-places',
    type: 'circle',
    source: 'story-places',
    paint: {
      'circle-radius': ['case', ['get', 'active'], 6, 3.5],
      'circle-color': ['case', ['get', 'active'], '#ea5212', cssVar('--dot-idle')],
      'circle-stroke-width': 2,
      'circle-stroke-color': ['case', ['get', 'active'], '#ea5212', cssVar('--grey-300')],
    },
  });
  map.addLayer({
    id: 'story-labels',
    type: 'symbol',
    source: 'story-places',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT,
      'text-size': 11,
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': cssVar('--ink'),
      'text-halo-color': cssVar('--paper'),
      'text-halo-width': 1.4,
      'text-opacity': ['case', ['get', 'active'], 1, 0.45],
    },
  });
}

/**
 * Обласні центри як точки з назвами міст.
 *
 * Беремо ті самі головні вокзали, що позначені на карті стартами, але
 * підписуємо містом: «Berlin», а не «Berlin Hbf».
 */
function capitalsGeojson() {
  const major = state.index?.major ?? [];
  return {
    type: 'FeatureCollection',
    features: major.flatMap((id) => {
      const station = state.index.stations[id];
      if (!station) return [];
      const city = station.name.replace(',', ' ').split(/\s+/)[0];
      return [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
          properties: { city },
        },
      ];
    }),
  };
}

/** Усі станції фіду як точки підкладки. */
function allStopsGeojson() {
  return {
    type: 'FeatureCollection',
    // out — станція поза Німеччиною: у розрахунку лишається, на карті ні
    features: Object.values(state.index?.stations ?? {})
      .filter((station) => !station.out)
      .map((station) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
      properties: { name: station.name },
      })),
  };
}

function finishLayers() {
  map.getCanvas().style.cursor = 'crosshair';
  state.layersReady = true;
  if (state.index) {
    map.getSource('all-stops').setData(allStopsGeojson());
    map.getSource('capitals').setData(capitalsGeojson());
  }
  applyProviderVisibility();
  if (state.network) map.getSource('network').setData(state.network);
  if (state.mode === 'sheldon') selectRoute(state.route);
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
    state.patterns = await loadJson(`${DATA}/patterns.json`).catch(() => null);
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

  if (state.layersReady) {
    map.getSource('all-stops').setData(allStopsGeojson());
    map.getSource('capitals').setData(capitalsGeojson());
  }

  worker.postMessage({ type: 'init', dataUrl: DATA });
  if (state.patterns?.routes) {
    worker.postMessage({ type: 'routes', routes: state.patterns.routes });
  }

  // Зони будуються у воркері, тому координати мають бути й там.
  const lat = new Float32Array(state.byIndex.length);
  const lon = new Float32Array(state.byIndex.length);
  // маска «станція в Німеччині» їде разом: скрінсейвер рахує покриття лише
  // по тих станціях, які взагалі є на карті
  const german = new Uint8Array(state.byIndex.length);
  state.byIndex.forEach((station, i) => {
    if (!station) return;
    lat[i] = station.lat;
    lon[i] = station.lon;
    german[i] = station.out ? 0 : 1;
  });
  worker.postMessage({ type: 'coords', lat, lon, german }, [
    lat.buffer,
    lon.buffer,
    german.buffer,
  ]);

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
  for (const button of document.querySelectorAll('#map-switch button')) {
    button.onclick = () => selectProvider(button.dataset.map);
  }
  for (const button of document.querySelectorAll('#map-switch button')) {
    button.setAttribute('aria-pressed', String(button.dataset.map === currentProvider()));
  }

  for (const button of document.querySelectorAll('#theme-switch button')) {
    // повторний клік по обраній темі повертає «як у системі»
    button.onclick = () =>
      selectTheme(button.getAttribute('aria-pressed') === 'true' ? null : button.dataset.theme);
  }
  applyTheme(restoreTheme(applyTheme));

  for (const button of document.querySelectorAll('#mode-switch button')) {
    button.onclick = () => selectMode(button.dataset.mode);
  }
  renderStoryPage();
  applyUrlOptions();

  for (const button of document.querySelectorAll('#screen-speed button')) {
    button.onclick = () => {
      state.screen.accelerated = button.dataset.speed === 'fast';
      state.screen.startedAt = 0;
      for (const other of document.querySelectorAll('#screen-speed button')) {
        other.setAttribute('aria-checked', String(other === button));
      }
      el('screen-duration').disabled = !state.screen.accelerated;
    };
  }
  for (const button of document.querySelectorAll('#screen-scope button')) {
    button.onclick = () => {
      state.screen.scope = button.dataset.scope;
      for (const other of document.querySelectorAll('#screen-scope button')) {
        other.setAttribute('aria-checked', String(other === button));
      }
      // новий вибір показуємо одразу, не чекаючи наступних 30 секунд
      state.train.at = -state.screen.trainEvery;
    };
  }

  // Будь-яка активність відкладає демо: воно для порожньої кімнати.
  for (const kind of ['pointermove', 'pointerdown', 'keydown', 'wheel']) {
    document.addEventListener(kind, () => {
      state.screen.lastInput = performance.now();
    }, { passive: true });
  }

  el('intro-tour').onclick = startTour;
  for (const button of document.querySelectorAll('#intro-modes button')) {
    button.onclick = () => {
      selectMode(button.dataset.mode);
      closeIntro();
    };
  }
  el('tour-next').onclick = () => goToStep(tourAt + 1);
  el('tour-prev').onclick = () => goToStep(tourAt - 1);
  el('tour-skip').onclick = endTour;
  document.addEventListener('keydown', (event) => {
    if (el('tour').hidden) return;
    if (event.key === 'Escape') endTour();
    if (event.key === 'ArrowRight') goToStep(tourAt + 1);
    if (event.key === 'ArrowLeft') goToStep(tourAt - 1);
  });

  // Дашборди й налаштування — дві вкладки, а не блок, який ховається
  // кнопкою: у панелі без прокрутки все одразу не вміщається.
  for (const tab of document.querySelectorAll('#screen-tabs button')) {
    tab.onclick = () => selectScreenTab(tab.dataset.tab);
  }
  selectScreenTab('boards');
  el('screen-hide-panel').onclick = () => togglePanel(false);
  el('screen-show-panel').onclick = () => togglePanel(true);

  // Ті самі ритми, що й у заставці: пауза між показами й оновлення віджета.
  for (const [id, key] of [
    ['screen-pause', 'pause'],
    ['screen-refresh', 'refresh'],
    ['screen-board', 'trainEvery'],
    ['screen-fact', 'factShown'],
  ]) {
    const input = el(id);
    const output = el(`${id}-value`);
    const show = () => {
      output.textContent = t('screen.seconds', { n: Number(input.value) });
    };
    input.oninput = () => {
      state.screen[key] = Number(input.value) * 1000;
      show();
    };
    input.value = String(state.screen[key] / 1000);
    show();
  }

  // Своя область: карта тримає її, поки показ не забере камеру собі.
  const region = el('screen-region');
  region.append(new Option(t('screen.regionAll'), ''));
  for (const [capital] of CAPITALS) region.append(new Option(capital, capital));
  region.onchange = () => {
    state.screen.region = stateOfCapital(region.value);
    state.screen.tourState = null;
    if (state.screen.region) loadStateBounds();
    else map.fitBounds(GERMANY, { padding: 28, duration: 1200 });
  };

  el('screen-duration').oninput = () => {
    state.screen.durationMinutes = Number(el('screen-duration').value);
    state.screen.startedAt = 0;
    el('screen-duration-value').textContent = t('screen.minutes', {
      n: state.screen.durationMinutes,
    });
  };
  el('screen-duration-value').textContent = t('screen.minutes', {
    n: state.screen.durationMinutes,
  });

  selectMode(state.mode);

  for (const id of ['min-stay', 'overhead', 'show-zones']) {
    el(id).oninput = render;
  }

  makeDraggable(el('hint'));
  clearHint();
  setUpTimeline();
  setUpIntro();
  render();
}

map.on('style.load', addLayers);
initControls();
