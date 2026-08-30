/**
 * Звідки взяті дані.
 *
 * Кожен рядок — те, без чого сторінка не працює: розклад, геометрія країни,
 * підкладка, шрифти, пішохідний маршрут і статті, з яких зібрані факти.
 * Підписи до них лежать у strings.js під ключем `note`.
 *
 * Двох фото зі «Дитинства Шелдона» тут немає навмисно: їх зробив автор
 * сторінки самотужки.
 */

export const SOURCES = [
  {
    id: 'gtfs',
    title: 'gtfs.de',
    url: 'https://gtfs.de/',
    license: 'CC BY 4.0',
    note: 'sources.gtfs',
  },
  {
    id: 'states',
    title: 'deutschlandGeoJSON',
    url: 'https://github.com/isellsoap/deutschlandGeoJSON',
    license: 'dl-de/by-2-0',
    note: 'sources.states',
  },
  {
    id: 'osrm',
    title: 'OSRM',
    url: 'https://project-osrm.org/',
    license: 'ODbL',
    note: 'sources.osrm',
  },
  {
    id: 'carto',
    title: 'CARTO basemaps',
    url: 'https://carto.com/basemaps/',
    license: '© CARTO, © OpenStreetMap',
    note: 'sources.carto',
  },
  {
    id: 'maplibre',
    title: 'MapLibre GL JS',
    url: 'https://maplibre.org/',
    license: 'BSD-3',
    note: 'sources.maplibre',
  },
  {
    id: 'fonts',
    title: 'Inter, Roboto Mono, Noto Sans',
    url: 'https://fonts.google.com/',
    license: 'OFL',
    note: 'sources.fonts',
  },
];

/** Статті Вікіпедії, з яких зібрані факти. Ліцензія в усіх одна. */
export const WIKIPEDIA = [
  { title: 'Rail transport in Germany', url: 'https://en.wikipedia.org/wiki/Rail_transport_in_Germany' },
  { title: 'Deutsche Bahn', url: 'https://en.wikipedia.org/wiki/Deutsche_Bahn' },
  { title: 'Intercity-Express', url: 'https://en.wikipedia.org/wiki/Intercity-Express' },
  { title: 'Bavarian Ludwig Railway', url: 'https://en.wikipedia.org/wiki/Bavarian_Ludwig_Railway' },
  { title: 'Leipzig Hauptbahnhof', url: 'https://en.wikipedia.org/wiki/Leipzig_Hauptbahnhof' },
  { title: 'Hamburg Hauptbahnhof', url: 'https://en.wikipedia.org/wiki/Hamburg_Hauptbahnhof' },
  { title: 'Frankfurt (Main) Hauptbahnhof', url: 'https://en.wikipedia.org/wiki/Frankfurt_(Main)_Hauptbahnhof' },
  { title: 'Cologne Hauptbahnhof', url: 'https://en.wikipedia.org/wiki/Cologne_Hauptbahnhof' },
  { title: 'Berlin Hauptbahnhof', url: 'https://en.wikipedia.org/wiki/Berlin_Hauptbahnhof' },
  { title: 'Hindenburgdamm', url: 'https://en.wikipedia.org/wiki/Hindenburgdamm' },
  { title: 'Bavarian Zugspitze Railway', url: 'https://en.wikipedia.org/wiki/Bavarian_Zugspitze_Railway' },
  { title: 'Harz Narrow Gauge Railways', url: 'https://en.wikipedia.org/wiki/Harz_Narrow_Gauge_Railways' },
  { title: 'Rendsburg High Bridge', url: 'https://en.wikipedia.org/wiki/Rendsburg_High_Bridge' },
  { title: 'Wuppertal Suspension Railway', url: 'https://en.wikipedia.org/wiki/Wuppertal_Suspension_Railway' },
];

export const WIKIPEDIA_LICENSE = 'CC BY-SA 4.0';
