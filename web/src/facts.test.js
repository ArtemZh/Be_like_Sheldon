import { describe, expect, it } from 'vitest';
import { FACTS, randomFact } from './facts.js';
import { STRINGS } from './strings.js';

describe('факти', () => {
  it('їх достатньо для довгого показу', () => {
    expect(FACTS.length).toBeGreaterThanOrEqual(50);
  });

  it('у кожного є текст усіма мовами', () => {
    for (const fact of FACTS) {
      const entry = STRINGS[fact.id];
      expect(entry, fact.id).toBeDefined();
      for (const lang of ['uk', 'en', 'de', 'pl']) {
        expect(entry[lang].length).toBeGreaterThan(20);
      }
    }
  });

  it('привʼязка — або місце, або маршрут із двох станцій', () => {
    for (const fact of FACTS) {
      if (fact.route) expect(fact.route).toHaveLength(2);
      if (fact.place) expect(typeof fact.place).toBe('string');
      expect(fact.place && fact.route).toBeFalsy();
    }
  });

  it('випадковий факт завжди зі списку', () => {
    expect(FACTS).toContain(randomFact(() => 0.99));
    expect(randomFact(() => 0)).toBe(FACTS[0]);
  });
});
