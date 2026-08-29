import { describe, expect, it } from 'vitest';
import { earliestArrivals, reverseFeed, UNREACHABLE, MIN_TRANSFER_SECONDS } from './raptor.js';

/** Фід із двох патернів: A->B->C і A->D. Дзеркало пітонівської фікстури. */
function fixtureFeed() {
  return {
    nStops: 5, // A B C D E
    nPatterns: 4,
    patternPtr: Uint32Array.from([0, 3, 6, 8, 10]),
    // A-B-C, C-B-A, A-D, D-A
    patternStops: Uint16Array.from([0, 1, 2, 2, 1, 0, 0, 3, 3, 0]),
    patternTripPtr: Uint32Array.from([0, 1, 2, 3, 4]),
    tripBlockStart: Uint32Array.from([0, 3, 6, 8, 10]),
    tripArr: Uint32Array.from([
      34200, 36000, 37800, // A 09:30, B 10:00, C 10:30
      64800, 66600, 68400, // C 18:00, B 18:30, A 19:00
      36000, 43200, // A 10:00, D 12:00
      81000, 88200, // D 22:30, A 24:30
    ]),
    tripDep: Uint32Array.from([
      34200, 36000, 37800,
      64800, 66600, 68400,
      36000, 43200,
      81000, 88200,
    ]),
  };
}

describe('earliestArrivals', () => {
  it('прямий рейс', () => {
    const t = earliestArrivals(fixtureFeed(), 0, 9 * 3600);
    expect(t[1]).toBe(10 * 3600);
    expect(t[2]).toBe(10 * 3600 + 1800);
  });

  it('станція без залізничного сполучення недосяжна', () => {
    const t = earliestArrivals(fixtureFeed(), 0, 9 * 3600);
    expect(t[4]).toBe(UNREACHABLE);
  });

  it('відсічка часу відкидає ранішні рейси', () => {
    const t = earliestArrivals(fixtureFeed(), 0, 11 * 3600);
    expect(t[3]).toBe(UNREACHABLE);
  });

  it('у самій станції відправлення час дорівнює відсічці', () => {
    const t = earliestArrivals(fixtureFeed(), 0, 9 * 3600);
    expect(t[0]).toBe(9 * 3600);
  });
});

describe('reverseFeed', () => {
  it('перевертає порядок зупинок і знак часу', () => {
    const rev = reverseFeed(fixtureFeed());
    expect(Array.from(rev.patternStops.slice(0, 3))).toEqual([2, 1, 0]);
    expect(Array.from(rev.tripArr.slice(0, 3))).toEqual([-37800, -36000, -34200]);
  });

  it('дає найпізніше відправлення назад', () => {
    const rev = reverseFeed(fixtureFeed());
    const t = earliestArrivals(rev, 0, -23 * 3600);
    expect(-t[2]).toBe(18 * 3600); // єдиний потяг C->A о 18:00
  });
});

describe('пересадки', () => {
  /** A->B одним патерном; з B два рейси на C: через 1 хв і через 10 хв. */
  const transferFeed = () => ({
    nStops: 3,
    nPatterns: 2,
    patternPtr: Uint32Array.from([0, 2, 4]),
    patternStops: Uint16Array.from([0, 1, 1, 2]),
    patternTripPtr: Uint32Array.from([0, 1, 3]),
    tripBlockStart: Uint32Array.from([0, 2, 4, 6]),
    tripArr: Uint32Array.from([35000, 36000, 36060, 37000, 36600, 38000]),
    tripDep: Uint32Array.from([35000, 36000, 36060, 37000, 36600, 38000]),
  });

  it('пересадка потребує мінімального запасу', () => {
    const t = earliestArrivals(transferFeed(), 0, 35000);
    expect(t[2]).toBe(38000);
  });

  it('на станції відправлення запасу не треба', () => {
    const t = earliestArrivals(transferFeed(), 0, 35000);
    expect(t[1]).toBe(36000);
  });

  it('запас — пʼять хвилин', () => {
    expect(MIN_TRANSFER_SECONDS).toBe(300);
  });
});
