import { describe, expect, it } from 'vitest';
import { usefulTime, filterStations, formatHours } from './metrics.js';

describe('usefulTime', () => {
  it('віднімає overhead від вікна перебування', () => {
    expect(usefulTime([37800, 64800], 3600)).toBe(23400);
  });

  it('може бути відʼємним, якщо вікно коротше за overhead', () => {
    expect(usefulTime([36000, 37800], 3600)).toBe(-1800);
  });
});

describe('filterStations', () => {
  const windows = {
    B: [36000, 66600],
    C: [37800, 64800],
    F: [36000, 37800],
  };

  it('лишає лише станції з достатнім корисним часом', () => {
    const result = filterStations(windows, { minStay: 4 * 3600, overhead: 3600 });
    expect(Object.keys(result).sort()).toEqual(['B', 'C']);
  });

  it('віддає корисний час, а не сире вікно', () => {
    const result = filterStations(windows, { minStay: 0, overhead: 3600 });
    expect(result.B.useful).toBe(27000);
    expect(result.B.window).toEqual([36000, 66600]);
  });

  it('порожній результат, коли нічого не проходить', () => {
    expect(filterStations(windows, { minStay: 12 * 3600, overhead: 3600 })).toEqual({});
  });
});

describe('formatHours', () => {
  it('форматує секунди як години й хвилини', () => {
    expect(formatHours(23400)).toBe('6 год 30 хв');
    expect(formatHours(3600)).toBe('1 год');
  });
});
