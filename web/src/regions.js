/**
 * Землі: вибір «своєї» області й мандрівка по країні у скрінсейвері.
 *
 * У налаштуваннях земля обирається за назвою головного міста — «Мюнхен»
 * зрозуміліше за «Bayern», особливо не німцю. Межі рахуємо з тієї самої
 * геометрії, що малює підкладку, тож окремих даних не треба.
 */

/** Головне місто -> земля. Порядок списку — той, що бачить людина. */
export const CAPITALS = [
  ['Berlin', 'Berlin'],
  ['Bremen', 'Bremen'],
  ['Dresden', 'Sachsen'],
  ['Düsseldorf', 'Nordrhein-Westfalen'],
  ['Erfurt', 'Thüringen'],
  ['Hamburg', 'Hamburg'],
  ['Hannover', 'Niedersachsen'],
  ['Kiel', 'Schleswig-Holstein'],
  ['Magdeburg', 'Sachsen-Anhalt'],
  ['Mainz', 'Rheinland-Pfalz'],
  ['München', 'Bayern'],
  ['Potsdam', 'Brandenburg'],
  ['Saarbrücken', 'Saarland'],
  ['Schwerin', 'Mecklenburg-Vorpommern'],
  ['Stuttgart', 'Baden-Württemberg'],
  ['Wiesbaden', 'Hessen'],
];

/** Земля за назвою головного міста. */
export function stateOfCapital(capital) {
  return CAPITALS.find(([city]) => city === capital)?.[1] ?? null;
}

/** Межі кожної землі з геометрії підкладки: `{ назва: [[з,п],[с,х]] }`. */
export function stateBounds(geojson) {
  const bounds = {};
  for (const feature of geojson?.features ?? []) {
    const name = feature.properties?.name;
    if (!name) continue;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    eachPoint(feature.geometry, ([lon, lat]) => {
      if (lon < box[0]) box[0] = lon;
      if (lat < box[1]) box[1] = lat;
      if (lon > box[2]) box[2] = lon;
      if (lat > box[3]) box[3] = lat;
    });
    if (box[0] < box[2]) {
      bounds[name] = [
        [box[0], box[1]],
        [box[2], box[3]],
      ];
    }
  }
  return bounds;
}

function eachPoint(geometry, visit) {
  if (!geometry) return;
  const { type, coordinates } = geometry;
  if (type === 'Polygon') coordinates.forEach((ring) => ring.forEach(visit));
  else if (type === 'MultiPolygon') {
    coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach(visit)));
  }
}

/**
 * Наступний крок мандрівки другого екрана.
 *
 * Дві третини — переїзд до іншої землі, третина — від'їзд на всю країну.
 * Двічі поспіль ту саму землю не показуємо: мандрівка має бути помітною.
 */
export function nextStop(names, current, rand = Math.random) {
  if (names.length === 0) return null;
  if (current !== null && rand() < 1 / 3) return null; // від'їзд на всю карту
  const others = names.filter((name) => name !== current);
  const pool = others.length > 0 ? others : names;
  return pool[Math.floor(rand() * pool.length) % pool.length];
}
