import { describe, expect, it, vi } from 'vitest';
import { ensureMirror, mirrorFrame } from './mirror.js';

/** Найпростіша підробка полотна: нам важлива лише поведінка, не піксели. */
function fakeCanvas(width = 100, height = 50) {
  const calls = [];
  return {
    width,
    height,
    dataset: {},
    style: {},
    calls,
    getContext: () => ({
      clearRect: (...args) => calls.push(['clear', ...args]),
      drawImage: (...args) => calls.push(['draw', args[0]]),
    }),
  };
}

describe('дзеркало карти', () => {
  const doc = (mirror) => ({
    createElement: () => mirror,
    querySelector: () => null,
  });

  it('створює дзеркало поруч із полотном карти і повторює його розмір', () => {
    const mirror = fakeCanvas(1, 1);
    const parent = { querySelector: () => null, appendChild: vi.fn() };
    const source = { width: 300, height: 200, parentNode: parent };
    const made = ensureMirror(source, doc(mirror));
    expect(parent.appendChild).toHaveBeenCalledWith(mirror);
    expect([made.width, made.height]).toEqual([300, 200]);
  });

  it('переносить кадр карти', () => {
    const mirror = fakeCanvas();
    const source = { width: 300, height: 200, parentNode: { querySelector: () => mirror } };
    expect(mirrorFrame(source, doc(mirror))).toBe(true);
    expect(mirror.calls.map(([name]) => name)).toEqual(['clear', 'draw']);
  });

  it('порожню карту не дзеркалить', () => {
    const mirror = fakeCanvas();
    const source = { width: 0, height: 0, parentNode: { querySelector: () => mirror } };
    expect(mirrorFrame(source, doc(mirror))).toBe(false);
    expect(mirrorFrame(null, doc(mirror))).toBe(false);
  });
});
