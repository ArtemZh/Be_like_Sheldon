/**
 * Переклади інтерфейсу.
 *
 * Мова за замовчуванням — англійська; вибір запамʼятовується в браузері.
 * Ключі з фігурними дужками підставляються через format().
 */

export const LANGUAGES = ['en', 'de', 'pl', 'uk'];
export const DEFAULT_LANGUAGE = 'en';

const STRINGS = {
  en: {
    'app.title': 'Where can I get in a day',
    'window.legend': 'Trip window',
    'window.day': 'Day',
    'window.day.range': 'Mon 09:00 → 23:00',
    'window.night': 'Overnight',
    'window.night.range': 'Mon 09:00 → Tue 09:00',
    'field.from': 'From',
    'field.pick': '— pick a station —',
    'field.minStay': 'Minimum on site',
    'field.overhead': 'Coffee and a hotdog',
    'field.zones': 'Show zones',
    'legend.title': 'Useful hours on site',
    'legend.under': 'under {h}',
    'legend.between': '{a} — {b}',
    'legend.orMore': '{h} or more',
    'status.loading': 'Loading the timetable…',
    'status.pick': 'Click the map — I’ll take the nearest station.',
    'status.computing': 'Computing…',
    'status.result': '<strong>{n}</strong> stations from <em>{name}</em>',
    'status.empty': 'Nowhere to go from <em>{name}</em> on this day',
    'status.retry': 'Try again',
    'error.stations': 'Could not load the station list ({message}).',
    'error.routes': 'Could not compute the routes ({message}).',
    'hint.placeholder': 'Hover a station',
    'hint.useful': '{time} on site',
    'hint.times': 'arrive {a} · back {d}',
    'intro.open': 'Why this exists',
    'intro.title': 'You don’t have to work on Monday',
    'intro.p1':
      'In the age of AI, code appears faster than we can read it. Review never catches up with generation, and burnout stops being an abstraction — it simply shows up in the calendar.',
    'intro.p2':
      'If you’re tired, do what Sheldon Cooper would: on Monday, instead of going to work, get on a train and ride to another city. A walk, an unfamiliar station, coffee with a hotdog, a notebook by the window.',
    'intro.p3': 'Click the map where you are. The main thing is to be home by evening.',
    'intro.close': 'Pick a city',
    'photo.alt':
      'A train compartment: a passenger with a notebook by the window, a platform cart outside',
    'time.hours': '{h} h',
    'time.hoursMinutes': '{h} h {m} min',
  },

  de: {
    'app.title': 'Wohin komme ich an einem Tag',
    'window.legend': 'Zeitfenster',
    'window.day': 'Tag',
    'window.day.range': 'Mo 09:00 → 23:00',
    'window.night': 'Über Nacht',
    'window.night.range': 'Mo 09:00 → Di 09:00',
    'field.from': 'Von',
    'field.pick': '— Station wählen —',
    'field.minStay': 'Mindestens vor Ort',
    'field.overhead': 'Kaffee und Hotdog',
    'field.zones': 'Zonen anzeigen',
    'legend.title': 'Nutzbare Stunden vor Ort',
    'legend.under': 'unter {h}',
    'legend.between': '{a} — {b}',
    'legend.orMore': '{h} und mehr',
    'status.loading': 'Fahrplan wird geladen…',
    'status.pick': 'Auf die Karte klicken — ich nehme die nächste Station.',
    'status.computing': 'Wird berechnet…',
    'status.result': '<strong>{n}</strong> Stationen ab <em>{name}</em>',
    'status.empty': 'Von <em>{name}</em> kommt man an diesem Tag nirgendwohin',
    'status.retry': 'Erneut versuchen',
    'error.stations': 'Die Stationsliste konnte nicht geladen werden ({message}).',
    'error.routes': 'Die Verbindungen konnten nicht berechnet werden ({message}).',
    'hint.placeholder': 'Auf eine Station zeigen',
    'hint.useful': '{time} vor Ort',
    'hint.times': 'an {a} · zurück {d}',
    'intro.open': 'Wozu das alles',
    'intro.title': 'Montag muss kein Arbeitstag sein',
    'intro.p1':
      'Im Zeitalter der KI entsteht Code schneller, als wir ihn lesen können. Das Review holt die Generierung nie ein, und Burnout ist keine Abstraktion mehr — es steht einfach im Kalender.',
    'intro.p2':
      'Wenn Sie müde sind, machen Sie es wie Sheldon Cooper: Fahren Sie am Montag statt zur Arbeit mit dem Zug in eine andere Stadt. Ein Spaziergang, ein fremder Bahnhof, Kaffee mit Hotdog, ein Notizbuch am Fenster.',
    'intro.p3':
      'Klicken Sie auf der Karte dorthin, wo Sie sind. Hauptsache, Sie sind am Abend zurück.',
    'intro.close': 'Stadt wählen',
    'photo.alt':
      'Ein Zugabteil: ein Fahrgast mit Notizbuch am Fenster, draußen ein Bahnsteigwagen',
    'time.hours': '{h} Std',
    'time.hoursMinutes': '{h} Std {m} Min',
  },

  pl: {
    'app.title': 'Dokąd dojadę w jeden dzień',
    'window.legend': 'Okno wyjazdu',
    'window.day': 'Dzień',
    'window.day.range': 'pon 09:00 → 23:00',
    'window.night': 'Doba',
    'window.night.range': 'pon 09:00 → wt 09:00',
    'field.from': 'Skąd',
    'field.pick': '— wybierz stację —',
    'field.minStay': 'Minimum na miejscu',
    'field.overhead': 'Kawa i hot dog',
    'field.zones': 'Pokaż strefy',
    'legend.title': 'Użytecznych godzin na miejscu',
    'legend.under': 'poniżej {h}',
    'legend.between': '{a} — {b}',
    'legend.orMore': '{h} i więcej',
    'status.loading': 'Wczytuję rozkład…',
    'status.pick': 'Kliknij na mapie — wezmę najbliższą stację.',
    'status.computing': 'Liczę…',
    'status.result': '<strong>{n}</strong> stacji z <em>{name}</em>',
    'status.empty': 'Z <em>{name}</em> nie da się nigdzie pojechać tego dnia',
    'status.retry': 'Spróbuj ponownie',
    'error.stations': 'Nie udało się wczytać listy stacji ({message}).',
    'error.routes': 'Nie udało się policzyć połączeń ({message}).',
    'hint.placeholder': 'Najedź na stację',
    'hint.useful': '{time} na miejscu',
    'hint.times': 'przyjazd {a} · powrót {d}',
    'intro.open': 'Po co to',
    'intro.title': 'W poniedziałek nie musisz pracować',
    'intro.p1':
      'W epoce AI kod powstaje szybciej, niż zdążymy go przeczytać. Przegląd nie nadąża za generowaniem, a wypalenie przestaje być abstrakcją — po prostu stoi w kalendarzu.',
    'intro.p2':
      'Jeśli jesteś zmęczony, zrób jak Sheldon Cooper: w poniedziałek zamiast do pracy wsiądź w pociąg i jedź do innego miasta. Spacer, obcy dworzec, kawa z hot dogiem, notes przy oknie.',
    'intro.p3': 'Kliknij na mapie tam, gdzie jesteś. Najważniejsze, żeby wrócić wieczorem do domu.',
    'intro.close': 'Wybierz miasto',
    'photo.alt':
      'Przedział pociągu: pasażer z notesem przy oknie, za oknem wózek na peronie',
    'time.hours': '{h} godz',
    'time.hoursMinutes': '{h} godz {m} min',
  },

  uk: {
    'app.title': 'Куди доїду за день',
    'window.legend': 'Вікно поїздки',
    'window.day': 'День',
    'window.day.range': 'пн 09:00 → 23:00',
    'window.night': 'Доба',
    'window.night.range': 'пн 09:00 → вт 09:00',
    'field.from': 'Звідки',
    'field.pick': '— оберіть станцію —',
    'field.minStay': 'Мінімум на місці',
    'field.overhead': 'Кава й хотдог',
    'field.zones': 'Показувати зони',
    'legend.title': 'Корисних годин на місці',
    'legend.under': 'до {h}',
    'legend.between': '{a} — {b}',
    'legend.orMore': '{h} і більше',
    'status.loading': 'Завантажую розклад…',
    'status.pick': 'Клікніть по карті — візьму найближчу станцію.',
    'status.computing': 'Рахую…',
    'status.result': '<strong>{n}</strong> станцій з <em>{name}</em>',
    'status.empty': 'З <em>{name}</em> за цей день нікуди не зʼїздиш',
    'status.retry': 'Спробувати ще',
    'error.stations': 'Не вдалося завантажити список станцій ({message}).',
    'error.routes': 'Не вдалося порахувати маршрути ({message}).',
    'hint.placeholder': 'Наведіть на станцію',
    'hint.useful': '{time} на місці',
    'hint.times': 'приїзд {a} · назад {d}',
    'intro.open': 'Навіщо це',
    'intro.title': 'Понеділок можна не працювати',
    'intro.p1':
      'В епоху ШІ код зʼявляється швидше, ніж ми встигаємо його читати. Ревʼю не наздоганяє генерацію, і вигоряння перестає бути абстракцією — воно просто стоїть у розкладі.',
    'intro.p2':
      'Якщо ви втомились, зробіть як Шелдон Купер: у понеділок замість роботи сядьте в поїзд і їдьте в інше місто. Прогулянка, чужий вокзал, кава з хотдогом, блокнот біля вікна.',
    'intro.p3': 'Клікніть на карті там, де ви зараз. Головне — повернутись увечері додому.',
    'intro.close': 'Обрати місто',
    'photo.alt':
      'Купе поїзда: пасажир із блокнотом біля вікна, за вікном перонний візок',
    'time.hours': '{h} год',
    'time.hoursMinutes': '{h} год {m} хв',
  },
};

const LANGUAGE_KEY = 'daytrip:language';

let current = DEFAULT_LANGUAGE;

export function format(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

/** Переклад за ключем. Невідома мова відкочується до англійської. */
export function t(key, values) {
  const table = STRINGS[current] ?? STRINGS[DEFAULT_LANGUAGE];
  const template = table[key] ?? STRINGS[DEFAULT_LANGUAGE][key] ?? key;
  return values ? format(template, values) : template;
}

export function currentLanguage() {
  return current;
}

export function setLanguage(language) {
  current = LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  // у тестах DOM немає, а словник має працювати й без нього
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  try {
    localStorage.setItem(LANGUAGE_KEY, current);
  } catch {
    // приватне вікно — просто не запамʼятовуємо
  }
}

/** Збережений вибір, інакше англійська. Мову системи навмисно не вгадуємо. */
export function restoreLanguage() {
  let saved = null;
  try {
    saved = localStorage.getItem(LANGUAGE_KEY);
  } catch {
    saved = null;
  }
  setLanguage(saved ?? DEFAULT_LANGUAGE);
  return current;
}

/** Години й хвилини мовою інтерфейсу: 23400 -> '6 h 30 min'. */
export function formatHours(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m === 0 ? t('time.hours', { h }) : t('time.hoursMinutes', { h, m });
}
