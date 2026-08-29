import { describe, expect, it } from 'vitest';
import { walkPenalty, buildGrid, buildZones } from './grid.js';

describe('walkPenalty', () => {
  it('нуль у самій станції', () => {
    expect(walkPenalty(0)).toBe(0);
  });

  it('пішки 5 км/год, туди й назад', () => {
    expect(walkPenalty(2.5)).toBeCloseTo(3600, 0);
  });
});

describe('buildGrid', () => {
  const points = [{ lat: 52.5, lon: 13.4, useful: 7200 }];

  it('комірка в станції отримує повний корисний час', () => {
    const cells = buildGrid(points, { cellKm: 2, radiusKm: 4 });
    expect(Math.max(...cells.map((c) => c.value))).toBeCloseTo(7200, -2);
  });

  it('віддалені комірки отримують менше', () => {
    const cells = buildGrid(points, { cellKm: 2, radiusKm: 4 });
    expect(cells.filter((c) => c.value < 7200).length).toBeGreaterThan(0);
  });

  it('порожній вхід дає порожню сітку', () => {
    expect(buildGrid([], { cellKm: 2, radiusKm: 4 })).toEqual([]);
  });
});

describe('buildZones', () => {
  it('повертає FeatureCollection', () => {
    const points = [{ lat: 52.5, lon: 13.4, useful: 7200 }];
    expect(buildZones(points, [3600, 7200]).type).toBe('FeatureCollection');
  });

  it('порожній вхід дає порожню колекцію', () => {
    expect(buildZones([], [3600]).features).toEqual([]);
  });
});
