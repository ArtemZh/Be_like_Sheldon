import { describe, expect, it } from 'vitest';
import { STEPS, placeCard } from './tour.js';
import { STRINGS } from './strings.js';

const MODES = ['day', 'sheldon', 'screen'];

describe('кроки екскурсії', () => {
  it('кожен крок має ціль, режим і тексти всіма мовами', () => {
    for (const step of STEPS) {
      expect(MODES).toContain(step.mode);
      expect(step.target.startsWith('#') || step.target.startsWith('.')).toBe(true);
      expect(STRINGS[`tour.${step.id}.title`]).toBeDefined();
      expect(STRINGS[`tour.${step.id}.text`]).toBeDefined();
    }
  });

  it('проходить усі три режими', () => {
    expect(new Set(STEPS.map((s) => s.mode))).toEqual(new Set(MODES));
  });

  it('режими не чергуються туди-сюди', () => {
    const order = STEPS.map((s) => s.mode).filter((mode, i, all) => mode !== all[i - 1]);
    expect(order).toEqual(MODES);
  });
});

describe('placeCard', () => {
  const viewport = { width: 1400, height: 900 };
  const card = { width: 320, height: 190 };

  it('ставить картку під ціллю, коли знизу є місце', () => {
    const rect = { top: 100, bottom: 200, left: 300, right: 700, width: 400, height: 100 };
    expect(placeCard(rect, viewport, card).side).toBe('bottom');
  });

  it('переносить угору, коли знизу тісно', () => {
    const rect = { top: 600, bottom: 860, left: 300, right: 700, width: 400, height: 260 };
    expect(placeCard(rect, viewport, card).side).toBe('top');
  });

  it('не вилазить за край екрана', () => {
    const rect = { top: 100, bottom: 200, left: 1300, right: 1390, width: 90, height: 100 };
    const spot = placeCard(rect, viewport, card);
    expect(spot.left).toBeGreaterThanOrEqual(16);
    expect(spot.left + card.width).toBeLessThanOrEqual(viewport.width - 16);
  });

  it('кладе по центру, коли місця немає ніде', () => {
    const tight = { width: 360, height: 220 };
    const rect = { top: 10, bottom: 210, left: 10, right: 350, width: 340, height: 200 };
    expect(placeCard(rect, tight, card).side).toBe('center');
  });
});
