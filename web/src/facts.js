/**
 * Факти про німецьку залізницю для скрінсейвера.
 *
 * Джерела — англомовна Вікіпедія: Rail transport in Germany, Deutsche Bahn,
 * Intercity-Express, статті про окремі вокзали й лінії. Цифри взяті звідти
 * як є; де у джерелі був рік, він лишився в тексті — інакше факт старіє
 * мовчки.
 *
 * Тут лишились самі привʼязки до карти, тексти — у strings.js під ключем
 * `id`. `place` — підрядок назви станції у фіді, до якої карта підлітає;
 * `route` — пара станцій, між якими малюємо лінію. Без них факт просто
 * читається на табло.
 */

export const FACTS = [
  { id: 'fact.00' },
  { id: 'fact.01' },
  { id: 'fact.02' },
  { id: 'fact.03' },
  { id: 'fact.04' },
  { id: 'fact.05' },
  { id: 'fact.06' },
  { id: 'fact.07' },
  { id: 'fact.08' },
  { id: 'fact.09' },
  { id: 'fact.10' },
  { id: 'fact.11', route: ['Nürnberg Hbf', 'Fürth (Bay) Hbf'] },
  { id: 'fact.12', place: 'Nürnberg Hbf' },
  { id: 'fact.13', route: ['Leipzig Hbf', 'Dresden Bahnhof Neustadt'] },
  { id: 'fact.14' },
  { id: 'fact.15' },
  { id: 'fact.16' },
  { id: 'fact.17' },
  { id: 'fact.18' },
  { id: 'fact.19' },
  { id: 'fact.20' },
  { id: 'fact.21' },
  { id: 'fact.22', place: 'Berlin Hbf' },
  { id: 'fact.23' },
  { id: 'fact.24' },
  { id: 'fact.25' },
  { id: 'fact.26' },
  { id: 'fact.27' },
  { id: 'fact.28', route: ['Hamburg Hbf (S-Bahn)', 'München Hbf'] },
  { id: 'fact.29' },
  { id: 'fact.30', place: 'Leipzig Hbf' },
  { id: 'fact.31', place: 'Leipzig Hbf' },
  { id: 'fact.32', place: 'Leipzig Hbf' },
  { id: 'fact.33', place: 'Leipzig Hbf' },
  { id: 'fact.34' },
  { id: 'fact.35', place: 'Hamburg Hbf (S-Bahn)' },
  { id: 'fact.36', place: 'Hamburg Hbf (S-Bahn)' },
  { id: 'fact.37', place: 'Frankfurt (Main) Hauptbahnhof' },
  { id: 'fact.38', place: 'Frankfurt (Main) Hauptbahnhof' },
  { id: 'fact.39', place: 'Köln Hbf' },
  { id: 'fact.40', place: 'Köln Hbf' },
  { id: 'fact.41', place: 'Köln Hbf' },
  { id: 'fact.42', place: 'Berlin Hbf' },
  { id: 'fact.43', place: 'Berlin Hbf' },
  { id: 'fact.44', place: 'Berlin Hbf' },
  { id: 'fact.45', route: ['Niebüll', 'Westerland(Sylt)'] },
  { id: 'fact.46', route: ['Niebüll', 'Westerland(Sylt)'] },
  { id: 'fact.47', place: 'Garmisch-Partenkirchen' },
  { id: 'fact.48', place: 'Garmisch-Partenkirchen' },
  { id: 'fact.49', place: 'Wernigerode Drei Annen Hohne Gleis 1' },
  { id: 'fact.50', place: 'Rendsburg' },
  { id: 'fact.51', place: 'Rendsburg' },
  { id: 'fact.52', place: 'Wuppertal Hbf' },
  { id: 'fact.53', place: 'Wuppertal Hbf' },
];

/** Випадковий факт. */
export function randomFact(rand = Math.random) {
  return FACTS[Math.floor(rand() * FACTS.length)];
}
