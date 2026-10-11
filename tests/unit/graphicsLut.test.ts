import { describe, expect, it } from 'vitest';
import { LUT_SIZE, LUT_STYLES, generateLutData, gradeColor } from '../../src/render/postfx/lut';

const texel = (data: Uint8Array, size: number, r: number, g: number, b: number): [number, number, number] => {
  const i = ((b * size + g) * size + r) * 4;
  return [data[i], data[i + 1], data[i + 2]];
};

describe('procedural LUTs', () => {
  it('neutral is the identity', () => {
    const d = generateLutData('neutral', 16);
    for (const [r, g, b] of [[0, 0, 0], [15, 15, 15], [3, 9, 12], [15, 0, 7]]) {
      const [R, G, B] = texel(d, 16, r, g, b);
      expect(Math.abs(R - (r / 15) * 255)).toBeLessThanOrEqual(1);
      expect(Math.abs(G - (g / 15) * 255)).toBeLessThanOrEqual(1);
      expect(Math.abs(B - (b / 15) * 255)).toBeLessThanOrEqual(1);
    }
  });

  it('bakes a size³ RGBA8 volume with opaque alpha for every style', () => {
    for (const style of LUT_STYLES) {
      const d = generateLutData(style, 8);
      expect(d.length).toBe(8 * 8 * 8 * 4);
      for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255);
    }
    expect(LUT_SIZE).toBe(32);
  });

  it('every non-neutral style actually changes colour', () => {
    const base = generateLutData('neutral', 8);
    for (const style of LUT_STYLES.filter((s) => s !== 'neutral')) {
      const d = generateLutData(style, 8);
      let diff = 0;
      for (let i = 0; i < d.length; i++) diff += Math.abs(d[i] - base[i]);
      expect(diff, style).toBeGreaterThan(d.length * 2);
    }
  });

  it('keeps black near black and white near white (no exposure drift) except the stylised looks', () => {
    for (const style of ['warm', 'cool', 'vivid', 'mono', 'bleach'] as const) {
      const black = gradeColor(style, 0, 0, 0);
      const white = gradeColor(style, 1, 1, 1);
      expect(Math.max(...black), style).toBeLessThan(0.08);
      expect(Math.min(...white), style).toBeGreaterThan(0.85);
    }
  });

  it('warm adds red over blue, cool the opposite, mono is achromatic, night vision is green', () => {
    const mid = (s: Parameters<typeof gradeColor>[0]) => gradeColor(s, 0.5, 0.5, 0.5);
    expect(mid('warm')[0]).toBeGreaterThan(mid('warm')[2]);
    expect(mid('cool')[2]).toBeGreaterThan(mid('cool')[0]);
    const m = gradeColor('mono', 0.8, 0.3, 0.2);
    expect(m[0]).toBeCloseTo(m[1], 6);
    expect(m[1]).toBeCloseTo(m[2], 6);
    const nv = gradeColor('nightvision', 0.4, 0.4, 0.4);
    expect(nv[1]).toBeGreaterThan(nv[0] * 3);
    expect(nv[1]).toBeGreaterThan(nv[2] * 3);
  });

  it('is monotonic in luminance for the grayscale ramp', () => {
    for (const style of LUT_STYLES) {
      let prev = -1;
      for (let i = 0; i <= 20; i++) {
        const v = i / 20;
        const c = gradeColor(style, v, v, v);
        const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        expect(l, `${style} @${v}`).toBeGreaterThanOrEqual(prev - 1e-6);
        prev = l;
      }
    }
  });
});
