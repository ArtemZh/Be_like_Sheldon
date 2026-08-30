import { describe, expect, it } from 'vitest';
import { DAY, activeAt, buildLiveIndex, clockAt, departuresByHour, randomTrain, statesAt, peakMinute, buildKilometres, spreadOf } from './live.js';

// Один патерн A->B, два рейси: о 09:00 і о 09:30 від A.
const feed = {
  nStops: 2,
  nPatterns: 1,
  patternPtr: new Uint32Array([0, 2]),
  patternStops: new Uint16Array([0, 1]),
  patternTripPtr: new Uint32Array([0, 2]),
  tripBlockStart: new Uint32Array([0, 2]),
  tripArr: new Uint32Array([9 * 3600, 10 * 3600, 9.5 * 3600, 10.5 * 3600]),
  tripDep: new Uint32Array([9 * 3600, 10 * 3600, 9.5 * 3600, 10.5 * 3600]),
};

const index = buildLiveIndex(feed);

describe('activeAt', () => {
  it('показує станцію, поки потяг на ній стоїть', () => {
    expect(activeAt(index, 9 * 3600).get(0)).toBe(1);
  });

  it('порожньо там, де в цю хвилину нікого немає', () => {
    expect(activeAt(index, 9 * 3600 + 15 * 60).size).toBe(0);
  });

  it('рахує два потяги на одній станції', () => {
    const both = { ...feed, tripArr: new Uint32Array([9 * 3600, 10 * 3600, 9 * 3600, 10 * 3600]) };
    both.tripDep = both.tripArr;
    expect(activeAt(buildLiveIndex(both), 9 * 3600).get(0)).toBe(2);
  });

  it('час поза добою згортає циклом', () => {
    expect(activeAt(index, 9 * 3600 + DAY).get(0)).toBe(1);
  });
});

describe('departuresByHour', () => {
  it('складає відправлення в години', () => {
    const hours = departuresByHour(index);
    expect(hours[9]).toBe(2); // два рейси стартують о 9-й
    expect(hours[10]).toBe(2); // і прибувають о 10-й — це теж подія відʼїзду
    expect(hours[3]).toBe(0);
  });
});

describe('clockAt', () => {
  it('у реальному режимі бере годинник', () => {
    const now = new Date(2026, 0, 5, 14, 37, 5);
    expect(clockAt({ accelerated: false, now })).toBe(14 * 3600 + 37 * 60 + 5);
  });

  it('прискорено розтягує добу на задану тривалість', () => {
    const at = (elapsed) => clockAt({ accelerated: true, durationSeconds: 600, elapsed });
    expect(at(0)).toBe(0);
    expect(at(300)).toBe(DAY / 2);
    expect(at(600)).toBe(0); // цикл починається спочатку
  });
});

describe('randomTrain', () => {
  // A -> B -> C: відправлення о 09:00, 09:30, прибуття о 10:00
  const line = {
    nStops: 3,
    nPatterns: 1,
    patternPtr: new Uint32Array([0, 3]),
    patternStops: new Uint16Array([0, 1, 2]),
    patternTripPtr: new Uint32Array([0, 1]),
    tripBlockStart: new Uint32Array([0]),
    tripArr: new Uint32Array([9 * 3600, 9.5 * 3600, 10 * 3600]),
    tripDep: new Uint32Array([9 * 3600, 9.5 * 3600, 10 * 3600]),
  };

  it('бере потяг, який зараз у дорозі й за хвилину рушає', () => {
    const train = randomTrain(line, 9.5 * 3600 - 30, { rand: () => 0 });
    expect(train.at).toBe(1);
    expect(train.stops).toEqual([0, 1, 2]);
  });

  it('з двох рейсів обирає довший', () => {
    // той самий час, але другий патерн має вчетверо більше зупинок
    const long = {
      nStops: 6,
      nPatterns: 2,
      patternPtr: new Uint32Array([0, 3, 9]),
      patternStops: new Uint16Array([0, 1, 2, 0, 1, 2, 3, 4, 5]),
      patternTripPtr: new Uint32Array([0, 1, 2]),
      tripBlockStart: new Uint32Array([0, 3]),
      tripArr: new Uint32Array([
        9 * 3600, 9.5 * 3600, 10 * 3600,
        9 * 3600, 9.5 * 3600, 10 * 3600, 10.5 * 3600, 11 * 3600, 11.5 * 3600,
      ]),
      tripDep: new Uint32Array([
        9 * 3600, 9.5 * 3600, 10 * 3600,
        9 * 3600, 9.5 * 3600, 10 * 3600, 10.5 * 3600, 11 * 3600, 11.5 * 3600,
      ]),
    };
    expect(randomTrain(long, 9.5 * 3600 - 30, { rand: () => 0 }).pattern).toBe(1);
  });

  it('нічого не повертає, коли жоден рейс не в дорозі', () => {
    expect(randomTrain(line, 3 * 3600, { rand: () => 0 })).toBeNull();
  });

  it('не бере рейс, який стоїть довше за вікно', () => {
    expect(randomTrain(line, 9.2 * 3600, { rand: () => 0 })).toBeNull();
  });
});

describe('statesAt', () => {
  it('розрізняє «щойно приїхав» і «рушає за 30 с»', () => {
    const time = 9 * 3600; // і приїзд, і відʼїзд на першій зупинці

    const before = statesAt(index, time - 20);
    expect(before.leaving.map((x) => x.stop)).toContain(0);
    expect(before.arrived).toHaveLength(0);

    const after = statesAt(index, time + 20);
    expect(after.arrived.map((x) => x.stop)).toContain(0);
    expect(after.leaving).toHaveLength(0);
  });

  it('вік події росте від нуля до одиниці', () => {
    const time = 9 * 3600;
    expect(statesAt(index, time + 3).arrived[0].age).toBeCloseTo(0.1, 5);
    expect(statesAt(index, time + 30).arrived[0].age).toBeCloseTo(1, 5);
  });

  it('поза вікном подій немає', () => {
    const time = 9 * 3600;
    expect(statesAt(index, time + 45).arrived).toHaveLength(0);
  });
});

const line2 = {
  nStops: 3,
  nPatterns: 1,
  patternPtr: new Uint32Array([0, 3]),
  patternStops: new Uint16Array([0, 1, 2]),
  patternTripPtr: new Uint32Array([0, 1]),
  tripBlockStart: new Uint32Array([0]),
  tripArr: new Uint32Array([9 * 3600, 9.5 * 3600, 10 * 3600]),
  tripDep: new Uint32Array([9 * 3600, 9.5 * 3600, 10 * 3600]),
};

describe('randomTrain у межах екрана', () => {
  it('не бере рейс, чия поточна зупинка поза межами', () => {
    const only = (stop) => stop === 99;
    expect(randomTrain(line2, 9.5 * 3600 - 30, { rand: () => 0, inside: only })).toBeNull();
  });

  it('бере рейс, чия поточна зупинка в межах', () => {
    const only = (stop) => stop === 1;
    expect(randomTrain(line2, 9.5 * 3600 - 30, { rand: () => 0, inside: only }).at).toBe(1);
  });
});

describe('пікова хвилина й кілометри', () => {
  it('знаходить хвилину з найбільшою кількістю подій', () => {
    const peak = peakMinute(index);
    expect(peak.value).toBeGreaterThan(0);
    expect(peak.minute).toBeGreaterThanOrEqual(0);
  });

  it('накопичує кілометри від початку доби', () => {
    const coords = { lat: new Float32Array([50, 51, 52]), lon: new Float32Array([8, 8, 8]) };
    const km = buildKilometres(feed, coords);
    expect(km[0]).toBe(0);
    // два рейси по одному перегону приблизно 111 км кожен
    expect(km[km.length - 1]).toBeGreaterThan(200);
    expect(km[km.length - 1]).toBeLessThan(240);
  });

  it('кілометри не спадають', () => {
    const coords = { lat: new Float32Array([50, 51, 52]), lon: new Float32Array([8, 8, 8]) };
    const km = buildKilometres(feed, coords);
    for (let i = 1; i < km.length; i += 1) expect(km[i]).toBeGreaterThanOrEqual(km[i - 1]);
  });
});

describe('розкид подій у межах хвилини', () => {
  it('той самий рейс і зупинка завжди дають той самий зсув', () => {
    expect(spreadOf(12, 34, 5)).toBe(spreadOf(12, 34, 5));
  });

  it('зсув не виходить за хвилину', () => {
    for (let i = 0; i < 200; i += 1) {
      const shift = spreadOf(i * 7, i * 13, i % 20);
      expect(shift).toBeGreaterThanOrEqual(0);
      expect(shift).toBeLessThan(60);
    }
  });

  it('сусідні зупинки одного рейсу розходяться в часі', () => {
    const shifts = new Set([0, 1, 2, 3, 4].map((pos) => spreadOf(100, 5, pos)));
    expect(shifts.size).toBeGreaterThan(1);
  });

  it('без розкиду індекс лишається таким, як у фіді', () => {
    const plain = buildLiveIndex(feed, { spread: false });
    // рейс о 9:00 рівно: подія має лежати в тій самій хвилині
    expect(plain.arrSec[0] % 60).toBe(0);
  });

  it('з розкидом події однієї хвилини розповзаються по секундах', () => {
    const spread = buildLiveIndex(feed);
    const seconds = new Set([...spread.arrSec].map((s) => s % 60));
    expect(seconds.size).toBeGreaterThan(1);
  });
});
