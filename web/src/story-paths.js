/**
 * Маршрут Шелдона по справжніх станціях.
 *
 * Згенеровано `python -m build.story_paths` з того самого фіду, що й карта:
 * найкоротший шлях мережею між опорними вокзалами, з усіма проміжними
 * зупинками. Не редагувати руками.
 */

export const STORY_STOPS = {
  loop: [{"name": "Ceestadt Hbf", "lon": 12.6, "lat": 51.5}],
  ride: [{"name": "Ceestadt Hbf", "lon": 12.6, "lat": 51.5}],
  luggage: [{"name": "Ceestadt Hbf", "lon": 12.6, "lat": 51.5}],
};

/** Ті самі шляхи, але лише координатами — для ліній на карті. */
export const STORY_PATHS = Object.fromEntries(
  Object.entries(STORY_STOPS).map(([name, stops]) => [name, stops.map((s) => [s.lon, s.lat])]),
);
