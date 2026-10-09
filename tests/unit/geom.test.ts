import { describe, expect, it } from 'vitest';
import { loftSurfaceX, splitTriangles, superLoft, type LoftStation } from '../../src/render/geom';

const tube: LoftStation[] = [
  { z: -0.5, w: 0.4, yb: 0.8, yt: 1.2, n: 2 },
  { z: 0, w: 0.4, yb: 0.8, yt: 1.2, n: 2 },
  { z: 0.5, w: 0.4, yb: 0.8, yt: 1.2, n: 2 },
];

describe('superLoft', () => {
  it('emits a section attribute from -1 (bottom) to 1 (top)', () => {
    const g = superLoft(tube, 32, 4);
    const sec = g.getAttribute('sec');
    expect(sec).toBeDefined();
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < sec.count; i++) {
      lo = Math.min(lo, sec.getX(i));
      hi = Math.max(hi, sec.getX(i));
    }
    expect(lo).toBeCloseTo(-1, 2);
    expect(hi).toBeCloseTo(1, 2);
  });

  it('leaves a gap at the bottom when openBottom is set', () => {
    const g = superLoft(tube, 32, 4, { openBottom: 1.2 });
    const p = g.getAttribute('position');
    let minY = Infinity;
    for (let i = 0; i < p.count; i++) minY = Math.min(minY, p.getY(i));
    // The lowest remaining vertex sits well above the closed loft's bottom (0.8).
    expect(minY).toBeGreaterThan(0.82);
  });

  it('produces finite geometry for degenerate stations', () => {
    const g = superLoft([
      { z: 0, w: 0, yb: 1, yt: 1 },
      { z: 0.2, w: 0.3, yb: 0.9, yt: 1.1, n: 1 },
    ]);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.array.length; i++) expect(Number.isFinite(p.array[i])).toBe(true);
  });
});

describe('splitTriangles', () => {
  it('partitions every triangle exactly once by section height', () => {
    const g = superLoft(tube, 32, 4);
    const total = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    const [top, rest] = splitTriangles(g, (_x, _y, _z, s) => s > 0.5);
    const count = (x: typeof top): number => (x.index ? x.index.count : x.getAttribute('position').count) / 3;
    expect(count(top)).toBeGreaterThan(0);
    expect(count(rest)).toBeGreaterThan(0);
    expect(count(top) + count(rest)).toBe(total);
    // The upper part really is above the centre line.
    const p = top.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeGreaterThan(1.0);
  });
});

describe('loftSurfaceX', () => {
  it('finds the outer surface of an elliptical section', () => {
    expect(loftSurfaceX(tube, 0, 1.0)).toBeCloseTo(0.2, 2);
    // Higher up an ellipse is narrower: x = a·sqrt(1 - (y/b)²).
    const x = loftSurfaceX(tube, 0, 1.15);
    expect(x).not.toBeNull();
    expect(x!).toBeCloseTo(0.2 * Math.sqrt(1 - 0.75 * 0.75), 1);
  });

  it('returns null when the ray misses the body', () => {
    expect(loftSurfaceX(tube, 0, 2)).toBeNull();
    expect(loftSurfaceX(tube, 3, 1)).toBeNull();
  });
});
