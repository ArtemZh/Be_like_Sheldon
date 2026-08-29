import { describe, expect, it, beforeEach } from 'vitest';
import { LANGUAGES, format, formatHours, setLanguage, t } from './i18n.js';

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
  it('усі мови мають однаковий набір ключів', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync('src/i18n.js', 'utf8'));
    const keysOf = (lang) => {
      const block = source.slice(source.indexOf(`  ${lang}: {`));
      const body = block.slice(0, block.indexOf('\n  },'));
      return new Set([...body.matchAll(/^    '([\w.]+)':/gm)].map((m) => m[1]));
    };
    const english = keysOf('en');
    expect(english.size).toBeGreaterThan(20);
    for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
      expect([...english].filter((k) => !keysOf(lang).has(k))).toEqual([]);
    }
  });
});
