import { describe, expect, it } from 'vitest';
import { CAPITALS, nextStop, stateBounds, stateOfCapital } from './regions.js';

describe('землі', () => {
  it('знає землю кожного головного міста', () => {
    expect(CAPITALS).toHaveLength(16);
    expect(stateOfCapital('München')).toBe('Bayern');
    expect(stateOfCapital('Kiel')).toBe('Schleswig-Holstein');
    expect(stateOfCapital('Атлантида')).toBeNull();
  });

  it('рахує межі з геометрії', () => {
    const geojson = {
      features: [
        {
          properties: { name: 'Berlin' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [13.1, 52.3],
                [13.7, 52.3],
                [13.7, 52.7],
                [13.1, 52.7],
              ],
            ],
          },
        },
      ],
    };
    expect(stateBounds(geojson)).toEqual({
      Berlin: [
        [13.1, 52.3],
        [13.7, 52.7],
      ],
    });
  });

  it('мандрівка не повторює ту саму землю двічі поспіль', () => {
    const names = ['Bayern', 'Hessen'];
    expect(nextStop(names, 'Bayern', () => 0.9)).toBe('Hessen');
  });

  it('іноді відʼїжджає на всю карту', () => {
    expect(nextStop(['Bayern'], 'Bayern', () => 0.1)).toBeNull();
    // з нічого мандрувати нема куди
    expect(nextStop([], null)).toBeNull();
  });
});
