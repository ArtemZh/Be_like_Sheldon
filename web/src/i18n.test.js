import { describe, expect, it, beforeEach } from 'vitest';
import { LANGUAGES, format, formatHours, setLanguage, t } from './i18n.js';
import { STRINGS } from './strings.js';

beforeEach(() => setLanguage('en'));

describe('format', () => {
  it('підставляє значення', () => {
    expect(format('{n} stations from {name}', { n: 3, name: 'Ulm' })).toBe('3 stations from Ulm');
  });

  it('невідомий ключ стає порожнім рядком', () => {
    expect(format('a {missing} b', {})).toBe('a  b');
  });
});

describe('t', () => {
  it('перекладає за поточною мовою', () => {
    expect(t('field.from')).toBe('From');
    setLanguage('de');
    expect(t('field.from')).toBe('Von');
    setLanguage('pl');
    expect(t('field.from')).toBe('Skąd');
    setLanguage('uk');
    expect(t('field.from')).toBe('Звідки');
  });

  it('невідома мова відкочується до англійської', () => {
    setLanguage('fr');
    expect(t('field.from')).toBe('From');
  });

  it('невідомий ключ повертає сам ключ', () => {
    expect(t('nope.nope')).toBe('nope.nope');
  });
});

describe('formatHours', () => {
  it('година без хвилин', () => {
    expect(formatHours(3600)).toBe('1 h');
    setLanguage('uk');
    expect(formatHours(3600)).toBe('1 год');
  });

  it('години з хвилинами', () => {
    expect(formatHours(23400)).toBe('6 h 30 min');
    setLanguage('de');
    expect(formatHours(23400)).toBe('6 Std 30 Min');
  });
});

describe('повнота словників', () => {
  it('у кожного ключа є всі чотири мови', () => {
    const keys = Object.keys(STRINGS);
    expect(keys.length).toBeGreaterThan(80);
    for (const key of keys) {
      for (const lang of LANGUAGES) {
        expect(typeof STRINGS[key][lang]).toBe('string');
        expect(STRINGS[key][lang].length).toBeGreaterThan(0);
      }
    }
  });

  it('плейсхолдери однакові в усіх мовах', () => {
    const slots = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, entry] of Object.entries(STRINGS)) {
      const expected = slots(entry.en);
      for (const lang of LANGUAGES) {
        expect({ key, slots: slots(entry[lang]) }).toEqual({ key, slots: expected });
      }
    }
  });

  // Найчастіша дірка — не відсутній переклад, а ключ, якого немає взагалі:
  // t() тоді мовчки показує саму назву ключа, і це помітно лише очима.
  it('усі ключі з розмітки й коду є у словнику', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const code = readdirSync(new URL('.', import.meta.url))
      .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js'))
      .map((name) => readFileSync(new URL(name, import.meta.url), 'utf8'))
      .join('\n');

    const used = new Set([
      ...[...html.matchAll(/data-i18n(?:-aria)?="([\w.]+)"/g)].map((m) => m[1]),
      ...[...code.matchAll(/\bt\(\s*'([\w.]+)'/g)].map((m) => m[1]),
    ]);
    expect([...used].filter((key) => !STRINGS[key])).toEqual([]);
  });

  it('невідомий ключ повертає сам себе, а не порожнечу', () => {
    expect(t('немає.такого')).toBe('немає.такого');
  });
});
