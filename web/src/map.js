import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { filterStations, formatHours } from './metrics.js';
import { buildZones } from './grid.js';

const DATA = `${import.meta.env.BASE_URL}data`;
const BREAKS = [2 * 3600, 4 * 3600, 6 * 3600, 8 * 3600];
const COLORS = ['#2b4a5a', '#2f7d78', '#4cc9a0', '#a8e05f', '#f9d423'];
const EMPTY = { type: 'FeatureCollection', features: [] };

const el = (id) => document.getElementById(id);
const state = { index: null, windows: null };

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [10.4, 51.1],
  zoom: 5.2,
});

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
  if (!state.windows) return;

  const points = currentPoints();
  el('status').textContent = points.length
    ? `${points.length} станцій підходить`
    : 'Звідси за цей день нікуди не зʼїздиш';

  map.getSource('stations').setData({
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { name: p.name, useful: p.useful, label: formatHours(p.useful) },
    })),
  });

  map.getSource('zones').setData(el('show-zones').checked ? buildZones(points, BREAKS) : EMPTY);
}

async function selectOrigin(stopId) {
  el('status').textContent = 'Рахую…';
  try {
    const payload = await loadJson(`${DATA}/origins/${stopId}.json`);
    state.windows = payload.stations;
    render();
  } catch (error) {
    fail(`Не вдалося завантажити дані (${error.message}).`);
  }
}

map.on('load', async () => {
  map.addSource('zones', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'zones',
    type: 'fill',
    source: 'zones',
    paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'value'], 0, COLORS[0], 8 * 3600, COLORS[4]],
      'fill-opacity': 0.25,
    },
  });

  map.addSource('stations', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'stations',
    type: 'circle',
    source: 'stations',
    paint: {
      'circle-radius': 5,
      'circle-color': [
        'interpolate',
        ['linear'],
        ['get', 'useful'],
        0, COLORS[0],
        4 * 3600, COLORS[2],
        8 * 3600, COLORS[4],
      ],
      'circle-stroke-width': 1,
      'circle-stroke-color': '#10161d',
    },
  });

  map.on('click', 'stations', (event) => {
    const { name, label } = event.features[0].properties;
    new maplibregl.Popup()
      .setLngLat(event.lngLat)
      .setHTML(`<strong>${name}</strong><br>${label} на місці`)
      .addTo(map);
  });

  try {
    state.index = await loadJson(`${DATA}/stations.json`);
  } catch (error) {
    fail(`Не вдалося завантажити список станцій (${error.message}).`);
    return;
  }

  const select = el('origin');
  for (const stopId of state.index.origins) {
    const option = document.createElement('option');
    option.value = stopId;
    option.textContent = state.index.stations[stopId]?.name ?? stopId;
    select.append(option);
  }

  select.onchange = () => selectOrigin(select.value);
  for (const id of ['min-stay', 'overhead', 'show-zones']) {
    el(id).oninput = render;
  }

  await selectOrigin(state.index.origins[0]);
});
