import { describe, expect, it } from 'vitest';
import { AdaptiveResolution, FrameLimiter, FrameStats } from '../../src/render/postfx/frameControl';
import { cascadeSplits } from '../../src/render/postfx/shadows';

/** Simulated requestAnimationFrame timestamps (with ~0.4 ms jitter) for a display refresh rate. */
function ticks(hz: number, seconds: number, jitter = 0.4): number[] {
  const out: number[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * jitter;
  for (let t = 100; t < 100 + seconds * 1000; t += 1000 / hz) out.push(t + rnd());
  return out;
}

describe('frame limiter', () => {
  it('lets every frame through when uncapped', () => {
    const lim = new FrameLimiter(0);
    expect(ticks(144, 2).every((t) => lim.shouldRender(t))).toBe(true);
  });

  it('holds 60 fps on a 144 Hz display (rate and evenness)', () => {
    const lim = new FrameLimiter(60);
    const shown = ticks(144, 10).filter((t) => lim.shouldRender(t));
    expect(shown.length).toBeGreaterThan(590);
    expect(shown.length).toBeLessThan(610);
    const gaps = shown.slice(1).map((t, i) => t - shown[i]);
    expect(Math.max(...gaps)).toBeLessThan(25);
    expect(Math.min(...gaps)).toBeGreaterThan(10);
  });

  it('holds 30 fps on a 60 Hz display', () => {
    const lim = new FrameLimiter(30);
    const shown = ticks(60, 10).filter((t) => lim.shouldRender(t));
    expect(shown.length).toBeGreaterThan(290);
    expect(shown.length).toBeLessThan(310);
  });

  it('does not burst to catch up after a stall and can be re-capped', () => {
    const lim = new FrameLimiter(60);
    lim.shouldRender(0);
    expect(lim.shouldRender(2000)).toBe(true); // long stall: one frame…
    expect(lim.shouldRender(2002)).toBe(false); // …then back to pacing, not a burst
    lim.setCap(0);
    expect(lim.shouldRender(2003)).toBe(true);
    expect(lim.cap).toBe(0);
    lim.setCap(120);
    expect(lim.cap).toBeCloseTo(120, 5);
  });
});

describe('adaptive resolution controller', () => {
  /** GPU model: frame time = fixed cost + pixel cost × scale². */
  const run = (ctl: AdaptiveResolution, seconds: number, fixed: number, pixel: number, start = 1) => {
    let scale = start;
    const trace: number[] = [];
    for (let t = 0; t < seconds * 60; t++) {
      const ms = Math.max(fixed + pixel * scale * scale, 1000 / 60);
      scale = ctl.update(ms);
      trace.push(scale);
    }
    return { scale, trace, ms: fixed + pixel * scale * scale };
  };

  it('drops resolution until the frame time fits the target, then holds still', () => {
    const ctl = new AdaptiveResolution({ targetFps: 60, minScale: 0.5, maxScale: 1 });
    const { scale, trace, ms } = run(ctl, 30, 4, 26); // 30 ms at full scale
    expect(scale).toBeLessThan(0.85);
    expect(scale).toBeGreaterThanOrEqual(0.5);
    expect(ms).toBeLessThan(1000 / 60 * 1.12);
    const tail = trace.slice(-600);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThanOrEqual(0.05 + 1e-9); // at most one step of dither
  });

  it('never goes below the minimum scale', () => {
    const ctl = new AdaptiveResolution({ targetFps: 60, minScale: 0.6, maxScale: 1 });
    expect(run(ctl, 30, 30, 200).scale).toBeCloseTo(0.6, 5);
  });

  it('recovers resolution when load drops and never exceeds maxScale', () => {
    const ctl = new AdaptiveResolution({ targetFps: 60, minScale: 0.5, maxScale: 1 });
    run(ctl, 20, 4, 40);
    expect(ctl.scale).toBeLessThan(0.8);
    const { scale } = run(ctl, 160, 2, 6, ctl.scale);
    expect(scale).toBe(1);
  });

  it('a higher target frame rate lowers the sustainable scale', () => {
    const lo = new AdaptiveResolution({ targetFps: 30, minScale: 0.4, maxScale: 1 });
    const hi = new AdaptiveResolution({ targetFps: 120, minScale: 0.4, maxScale: 1 });
    const a = run(lo, 40, 3, 22).scale;
    const b = run(hi, 40, 3, 22).scale;
    expect(b).toBeLessThan(a);
  });

  it('changes scale in coarse steps with a cool-down (few reallocations)', () => {
    const ctl = new AdaptiveResolution({ targetFps: 60, minScale: 0.5, maxScale: 1 });
    const { trace } = run(ctl, 30, 4, 26);
    let changes = 0;
    for (let i = 1; i < trace.length; i++) if (trace[i] !== trace[i - 1]) changes++;
    expect(changes).toBeLessThan(12);
  });
});

describe('frame statistics', () => {
  it('computes fps and keeps an ordered history', () => {
    const s = new FrameStats(8);
    for (let i = 0; i < 40; i++) s.push(20);
    expect(s.fps).toBeCloseTo(50, 0);
    for (let i = 0; i < 10; i++) s.push(i + 1);
    const out: number[] = [];
    s.ordered(out);
    expect(out).toHaveLength(8);
    expect(out[out.length - 1]).toBe(10);
    expect(out[0]).toBe(3);
  });
});

describe('cascade splits', () => {
  it('are monotonic, start at near and end exactly at far', () => {
    for (const n of [2, 3, 4]) {
      const s = cascadeSplits(n, 0.3, 400);
      expect(s).toHaveLength(n + 1);
      expect(s[0]).toBe(0.3);
      expect(s[n]).toBe(400);
      for (let i = 1; i <= n; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
    }
  });

  it('give the near cascade much finer coverage than the far one', () => {
    const s = cascadeSplits(4, 0.3, 400);
    expect(s[1] - s[0]).toBeLessThan((s[4] - s[3]) / 4);
  });
});
