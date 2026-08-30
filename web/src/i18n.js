/**
 * Мова інтерфейсу.
 *
 * Самі тексти живуть у strings.js — ключ і чотири мови поруч. Тут лише
 * вибір мови, підстановка плейсхолдерів і памʼять про вибір.
 */

import { LANGUAGES, STRINGS } from './strings.js';

export { LANGUAGES };

const DEFAULT_LANGUAGE = 'en';
const LANGUAGE_KEY = 'daytrip:language';

let current = DEFAULT_LANGUAGE;

/**
 * Текст за ключем поточною мовою.
 *
 * Якщо перекладу немає, беремо англійський, а тоді — сам ключ: краще
 * побачити «screen.title» на екрані, ніж порожнє місце.
 */
export function t(key, values) {
  const entry = STRINGS[key];
  const text = entry?.[current] ?? entry?.en ?? key;
  return values ? format(text, values) : text;
}

export function format(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
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
