import { describe, expect, it } from 'vitest';
import { EXPIRED, LIVE, PENDING, liveProfile, phaseAt, profileOutline, profilePath } from './timeline.js';

describe('phaseAt', () => {
  const window = [10 * 3600, 18 * 3600];

  it('до приїзду станції ще немає', () => {
    expect(phaseAt(window, 9 * 3600)).toBe(PENDING);
  });

  it('між приїздом і відправленням станція жива', () => {
    expect(phaseAt(window, 12 * 3600)).toBe(LIVE);
  });

  it('після останнього потяга назад станція гасне', () => {
    expect(phaseAt(window, 19 * 3600)).toBe(EXPIRED);
  });

  it('межі включно', () => {
    expect(phaseAt(window, 10 * 3600)).toBe(LIVE);
    expect(phaseAt(window, 18 * 3600)).toBe(LIVE);
  });
});

describe('liveProfile', () => {
  const points = [
    { window: [10 * 3600, 18 * 3600] },
    { window: [11 * 3600, 14 * 3600] },
  ];
  const range = { from: 9 * 3600, to: 23 * 3600, buckets: 14 };

  it('пік дорівнює найбільшій одночасній кількості', () => {
    expect(liveProfile(points, range).peak).toBe(2);
  });

  it('пік припадає на перетин вікон', () => {
    const { peakIndex } = liveProfile(points, range);
    // 14 кошиків на 14 годин: перетин 11:00-14:00 -> кошики 2..5
    expect(peakIndex).toBeGreaterThanOrEqual(2);
    expect(peakIndex).toBeLessThanOrEqual(5);
  });

  it('порожній вхід дає нульовий профіль', () => {
    const { counts, peak } = liveProfile([], range);
    expect(peak).toBe(0);
    expect(counts.every((c) => c === 0)).toBe(true);
  });
});

describe('profilePath', () => {
  it('порожній профіль не дає шляху', () => {
    expect(profilePath({ counts: new Uint16Array(4), peak: 0 }, 100, 20)).toBe('');
  });

  it('замкнений полігон від низу до низу', () => {
    const path = profilePath({ counts: Uint16Array.from([0, 2, 1]), peak: 2 }, 100, 20);
    expect(path.startsWith('M0,20')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
  });
});

describe('profileOutline', () => {
  it('лише верхня лінія, без замикання', () => {
    const path = profileOutline({ counts: Uint16Array.from([0, 2, 1]), peak: 2 }, 100, 20);
    expect(path.startsWith('M0,20')).toBe(true);
    expect(path.endsWith('Z')).toBe(false);
  });

  it('порожній профіль не дає лінії', () => {
    expect(profileOutline({ counts: new Uint16Array(3), peak: 0 }, 100, 20)).toBe('');
  });
});
