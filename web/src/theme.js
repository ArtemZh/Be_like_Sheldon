/**
 * Світла й темна тема.
 *
 * Поки користувач не обрав нічого, слухаємо систему. Щойно обрав — вибір
 * важить більше за систему і переживає перезавантаження. У розмітку завжди
 * пишемо вже розвʼязане значення (`data-theme="light"|"dark"`), тому в CSS
 * лишається один набір темних змінних, а не два — під клас і під медіа.
 */

const THEME_KEY = 'daytrip.theme';
export const THEMES = ['light', 'dark'];

let choice = null; // null — «як у системі»

function prefersDark() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Що показувати: вибір користувача, інакше система. */
export function resolveTheme(saved, systemDark) {
  if (THEMES.includes(saved)) return saved;
  return systemDark ? 'dark' : 'light';
}

export function currentTheme() {
  return resolveTheme(choice, prefersDark());
}

function apply() {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = currentTheme();
  }
}

export function setTheme(theme) {
  choice = THEMES.includes(theme) ? theme : null;
  try {
    if (choice) localStorage.setItem(THEME_KEY, choice);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // приватне вікно — просто не запамʼятовуємо
  }
  apply();
  return currentTheme();
}

/**
 * Відновити вибір і почати стежити за системою.
 *
 * `onChange` смикається лише коли тема справді змінилась — карті треба
 * перезавантажити стиль, і робити це на кожен чих не варто.
 */
export function restoreTheme(onChange = () => {}) {
  try {
    choice = THEMES.includes(localStorage.getItem(THEME_KEY))
      ? localStorage.getItem(THEME_KEY)
      : null;
  } catch {
    choice = null;
  }
  apply();

  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (choice) return; // вибір користувача система не перебиває
      apply();
      onChange(currentTheme());
    });
  }
  return currentTheme();
}
