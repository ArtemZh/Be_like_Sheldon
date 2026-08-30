import { describe, expect, it } from 'vitest';
import { alphabet, flapDuration, flapFrame, isFiller, wrapLines } from './flap.js';

const opts = { stagger: 2, spin: 7, rand: () => 0 };

describe('flapFrame', () => {
  it('зберігає довжину рядка на будь-якому кадрі', () => {
    const target = 'Berlin Hbf';
    for (let f = 0; f <= flapDuration(target, opts); f += 1) {
      expect(flapFrame(target, f, opts).length).toBe(target.length);
    }
  });

  it('на нульовому кадрі букви ще не стали на місце', () => {
    expect(flapFrame('AB', 0, opts)).not.toBe('AB');
  });

  it('після повної тривалості дорівнює цілі', () => {
    const target = 'приїзд 09:41 · назад 21:07';
    expect(flapFrame(target, flapDuration(target, opts), opts)).toBe(target);
  });

  it('пунктуацію цілі не крутить', () => {
    const from = '00:00';
    const out = flapFrame('09:41', 0, { ...opts, from });
    expect(out[2]).toBe(':');
  });

  it('символи стартують хвилею зліва направо', () => {
    // На кадрі 1 другий символ ще не почав крутитись (його старт — кадр 2).
    expect(flapFrame('XY', 1, opts)[1]).toBe(' ');
  });

  it('прочерк ніколи не випадає як випадковий символ', () => {
    const out = flapFrame('Ulm', 0, { ...opts, rand: () => 0.99 });
    expect(out).not.toMatch(/-/);
  });

  it('поки черга не дійшла — показує старе значення, а не порожнечу', () => {
    expect(flapFrame('12:18', 0, { ...opts, from: '09:41' }).slice(1)).toBe('9:41');
  });

  it('за межами цілі — порожньо, а не випадкові літери', () => {
    const settings = { ...opts, from: '6 h 11 min', rand: () => 0.99 };
    expect(flapFrame('1 h', 0, settings).slice(3)).toBe('       ');
  });

  it('ширина кадру не менша за довший з двох рядків', () => {
    const settings = { ...opts, from: '6 h 11 min' };
    const target = '1 h';
    for (let f = 0; f < flapDuration(target, settings); f += 1) {
      expect(flapFrame(target, f, settings).length).toBe(10);
    }
  });
});

// Тестова «ширина»: рядок влазить, поки в ньому не більше 10 символів.
const fits = (line) => line.length <= 10;

describe('alphabet', () => {
  it('числовий рядок крутить лише цифри — інакше широка літера зсуває підпис', () => {
    expect(alphabet('12:18')).toBe('0123456789');
    expect(alphabet('--')).toBe('0123456789');
    expect(alphabet('Eberbach')).toContain('A');
  });

  it('у числовому рядку кадр складається лише з цифр і розділювачів', () => {
    const out = flapFrame('12:18', 2, { ...opts, from: '00:00', rand: () => 0.99 });
    expect(out).toMatch(/^[\d:]+$/);
  });
});

describe('isFiller', () => {
  it('впізнає рядки з самих прочерків', () => {
    expect(isFiller('--')).toBe(true);
    expect(isFiller('--:--')).toBe(true);
    expect(isFiller('-------')).toBe(true);
  });

  it('текст і числа заповнювачем не вважає', () => {
    expect(isFiller('12:18')).toBe(false);
    expect(isFiller('Bad Vilbel')).toBe(false);
    expect(isFiller('')).toBe(false);
  });
});

describe('wrapLines', () => {
  it('завжди повертає задану кількість рядків', () => {
    expect(wrapLines('Ulm', fits)).toEqual(['Ulm', '']);
  });

  it('переносить по словах', () => {
    expect(wrapLines('Frankfurt Hbf', fits)).toEqual(['Frankfurt', 'Hbf']);
  });

  it('обрізає те, що не влізло у два рядки', () => {
    const [first, second] = wrapLines('Offenbach Main Ostbahnhof Sued', fits);
    expect(first).toBe('Offenbach');
    expect(second.endsWith('…')).toBe(true);
    expect(fits(second)).toBe(true);
  });

  it('одне задовге слово не губиться', () => {
    const [first] = wrapLines('Hauptbahnhofstrasse', fits);
    expect(first).toBe('Hauptbahnhofstrasse');
  });
});
