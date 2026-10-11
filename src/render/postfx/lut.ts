import * as THREE from 'three';
import type { LutStyle } from '../quality';

/**
 * Procedurally generated 3D colour-grading LUTs. No image files: each style is a
 * small pure function over display-referred (sRGB, 0..1) colour, baked into a
 * 32³ volume. The composite shader looks the graded colour up with hardware
 * trilinear filtering, so any style costs one texture fetch.
 */

export const LUT_SIZE = 32;
export const LUT_STYLES: readonly LutStyle[] = ['neutral', 'warm', 'cool', 'cinematic', 'vivid', 'bleach', 'vintage', 'mono', 'nightvision'];

type RGB = [number, number, number];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Smooth S-curve around mid grey; amount 0 = identity. */
function sCurve(x: number, amount: number): number {
  const c = x * x * (3 - 2 * x);
  return mix(x, c, amount);
}

function saturate(c: RGB, s: number): RGB {
  const l = luma(c[0], c[1], c[2]);
  return [mix(l, c[0], s), mix(l, c[1], s), mix(l, c[2], s)];
}

/** Lift shadows / tint midtones / push highlights toward colours (split-toning). */
function splitTone(c: RGB, shadow: RGB, highlight: RGB, amount: number): RGB {
  const l = luma(c[0], c[1], c[2]);
  const sw = (1 - smooth(0.0, 0.55, l)) * amount;
  const hw = smooth(0.45, 1.0, l) * amount;
  return [c[0] + (shadow[0] - 0.5) * sw + (highlight[0] - 0.5) * hw, c[1] + (shadow[1] - 0.5) * sw + (highlight[1] - 0.5) * hw, c[2] + (shadow[2] - 0.5) * sw + (highlight[2] - 0.5) * hw];
}

/** Grade one display-referred colour; the LUT bakes this function. */
export function gradeColor(style: LutStyle, r: number, g: number, b: number): RGB {
  let c: RGB = [r, g, b];
  switch (style) {
    case 'off':
    case 'neutral':
      return c;
    case 'warm': {
      c = [c[0] * 1.06 + 0.012, c[1] * 1.0 + 0.004, c[2] * 0.9];
      c = splitTone(c, [0.5, 0.48, 0.45], [0.58, 0.52, 0.42], 0.1);
      c = saturate(c, 1.05);
      break;
    }
    case 'cool': {
      c = [c[0] * 0.92, c[1] * 0.99, c[2] * 1.08 + 0.01];
      c = splitTone(c, [0.45, 0.5, 0.6], [0.47, 0.52, 0.58], 0.1);
      c = saturate(c, 0.97);
      break;
    }
    case 'cinematic': {
      // Teal shadows, orange highlights, gentle S-curve and slightly lifted blacks.
      c = [sCurve(c[0], 0.55), sCurve(c[1], 0.55), sCurve(c[2], 0.55)];
      c = splitTone(c, [0.34, 0.5, 0.58], [0.64, 0.5, 0.36], 0.34);
      c = saturate(c, 0.92);
      c = [mix(0.02, 1, c[0]), mix(0.025, 1, c[1]), mix(0.03, 1, c[2])];
      break;
    }
    case 'vivid': {
      c = saturate(c, 1.38);
      c = [sCurve(c[0], 0.3), sCurve(c[1], 0.3), sCurve(c[2], 0.3)];
      break;
    }
    case 'bleach': {
      // Bleach bypass: desaturated, high contrast, retains luminance in the highlights.
      const l = luma(c[0], c[1], c[2]);
      const gray: RGB = [l, l, l];
      c = [mix(c[0], gray[0], 0.55), mix(c[1], gray[1], 0.55), mix(c[2], gray[2], 0.55)];
      c = [sCurve(c[0], 0.75), sCurve(c[1], 0.75), sCurve(c[2], 0.75)];
      break;
    }
    case 'vintage': {
      c = saturate(c, 0.78);
      c = [mix(0.06, 0.96, c[0]) * 1.03, mix(0.055, 0.95, c[1]), mix(0.07, 0.88, c[2]) * 0.94];
      c = splitTone(c, [0.52, 0.5, 0.42], [0.55, 0.5, 0.4], 0.14);
      break;
    }
    case 'mono': {
      const l = sCurve(clamp01(luma(c[0], c[1], c[2])), 0.45);
      c = [l, l, l];
      break;
    }
    case 'nightvision': {
      // Phosphor green image intensifier: luminance boosted, shadows lifted.
      const l = clamp01(Math.pow(luma(c[0], c[1], c[2]), 0.62) * 1.25);
      c = [l * 0.12, l * 1.0, l * 0.22];
      break;
    }
  }
  return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];
}

/**
 * Bake a style into an RGBA8 volume of `size`³ texels, red varying fastest
 * (the layout Data3DTexture expects).
 */
export function generateLutData(style: LutStyle, size = LUT_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  const inv = 1 / (size - 1);
  let i = 0;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const c = gradeColor(style, r * inv, g * inv, b * inv);
        data[i++] = Math.round(c[0] * 255);
        data[i++] = Math.round(c[1] * 255);
        data[i++] = Math.round(c[2] * 255);
        data[i++] = 255;
      }
  return data;
}

const cache = new Map<string, THREE.Data3DTexture>();

/** Shared GPU volume for a style (cached; `dispose` via `disposeLuts`). */
export function lutTexture(style: LutStyle, size = LUT_SIZE): THREE.Data3DTexture {
  const key = `${style === 'off' ? 'neutral' : style}:${size}`;
  let t = cache.get(key);
  if (!t) {
    t = new THREE.Data3DTexture(generateLutData(style === 'off' ? 'neutral' : style, size), size, size, size);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapR = t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.unpackAlignment = 1;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    cache.set(key, t);
  }
  return t;
}

export function disposeLuts(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
