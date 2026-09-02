import { describe, expect, it } from 'vitest';
import { readableName } from './names.js';

describe('назви станцій', () => {
  it('прибирає код оператора, номер обʼєкта й платформу', () => {
    expect(readableName('Benneckenstein Bek_Klb 001 P1')).toBe('Benneckenstein');
  });

  it('прибирає напрямок зупинки', () => {
    expect(readableName('Hegelsbergstraße Ri. Holländ. Straße')).toBe('Hegelsbergstraße');
    expect(readableName('Marktplatz, Richtung Hauptbahnhof')).toBe('Marktplatz');
  });

  it('прибирає номер колії', () => {
    expect(readableName('Wernigerode Hbf Gl. 3')).toBe('Wernigerode Hbf');
    expect(readableName('Ulm Hbf Bstg 2')).toBe('Ulm Hbf');
  });

  it('не чіпає звичайні назви', () => {
    for (const name of [
      'Frankfurt (Main) Hauptbahnhof',
      'Berlin Hbf',
      'Eisfelder Talmühle',
      'Karlsruhe Mühlburg West',
      'Halle (Saale) Hbf',
    ]) {
      expect(readableName(name)).toBe(name);
    }
  });

  it('не зʼїдає назву цілком', () => {
    expect(readableName('P1')).toBe('P1');
    expect(readableName('')).toBe('');
    expect(readableName(null)).toBe('');
  });
});
