import { describe, expect, it, vi } from 'vitest';
import { cancelFrame, hidden, nextFrame } from './frames.js';

describe('двигун кадрів', () => {
  it('видима сторінка бере кадр у rAF', () => {
    globalThis.requestAnimationFrame = () => 7;
    const handle = nextFrame(() => {}, { hidden: false });
    expect(handle).toEqual({ raf: 7 });
    delete globalThis.requestAnimationFrame;
  });

  it('прихована — у таймера, бо rAF у скрінсейвері мовчить', () => {
    vi.useFakeTimers();
    const seen = vi.fn();
    const handle = nextFrame(seen, { hidden: true });
    expect(handle.timer).toBeDefined();
    vi.advanceTimersByTime(100);
    expect(seen).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('скасування розуміє обидва види кадру', () => {
    vi.useFakeTimers();
    const seen = vi.fn();
    cancelFrame(nextFrame(seen, { hidden: true }));  // таймерний кадр
    vi.advanceTimersByTime(100);
    expect(seen).not.toHaveBeenCalled();
    expect(() => cancelFrame(null)).not.toThrow();
    vi.useRealTimers();
  });

  it('без document сторінка вважається видимою', () => {
    expect(hidden(undefined)).toBe(false);
  });
});
