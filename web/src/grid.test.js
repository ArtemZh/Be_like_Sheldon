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

  it('найближча до станції комірка втрачає не більше за півкомірки ходу', () => {
    const cells = buildGrid(points, { cellKm: 2, radiusKm: 4 });
    // растр вирівняний за глобальною сіткою, тож центр комірки не збігається
    // зі станцією — але й не далі, ніж на діагональ півкомірки
    const best = Math.max(...cells.map((c) => c.value));
    expect(best).toBeLessThanOrEqual(7200);
    expect(best).toBeGreaterThan(7200 - walkPenalty(Math.SQRT2));
  });

  it('комірки різних станцій лежать на одній сітці', () => {
    const two = buildGrid(
      [
        { lat: 52.5, lon: 13.4, useful: 7200 },
        { lat: 52.56, lon: 13.47, useful: 7200 },
      ],
      { cellKm: 2, radiusKm: 4 },
    );
    const keys = two.map((c) => `${c.i},${c.j}`);
    expect(new Set(keys).size).toBe(keys.length);
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

describe('buildZones bands', () => {
  const points = [
    { lat: 52.5, lon: 13.4, useful: 10 * 3600 },
    { lat: 52.6, lon: 13.5, useful: 6 * 3600 },
  ];

  it('кожна смуга має числову нижню межу для стилю', () => {
    const zones = buildZones(points, [4 * 3600, 6 * 3600, 8 * 3600]);
    expect(zones.features.length).toBeGreaterThan(0);
    for (const f of zones.features) {
      expect(Number.isFinite(f.properties.min)).toBe(true);
      expect(f.properties.min).toBeGreaterThanOrEqual(4 * 3600);
    }
  });
});
