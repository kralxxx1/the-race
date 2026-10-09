export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const G = 9.81;
export const KMH = 3.6;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : clamp((v - a) / (b - a), 0, 1);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = invLerp(e0, e1, x);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach. `rate` is in 1/s. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Deterministic PRNG (mulberry32). Returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  constructor(seed = 1) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  int(lo: number, hiInclusive: number): number {
    return lo + Math.floor(this.next() * (hiInclusive - lo + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Weighted pick: weights need not sum to 1. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

/** Integer hash → [0,1). Stable across runs, used for procedural placement. */
export function hash01(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(i * 374761393 + seed * 668265263) * 2 - 1;
  const b = hash01((i + 1) * 374761393 + seed * 668265263) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

/** Smooth 2D value noise in [-1, 1]. */
export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const h = (X: number, Y: number) => hash01(X * 374761393 + Y * 668265263 + seed * 1442695041) * 2 - 1;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = h(ix, iy);
  const b = h(ix + 1, iy);
  const c = h(ix, iy + 1);
  const d = h(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

export function fbm2(x: number, y: number, octaves = 4, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * freq, y * freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/**
 * Monotone cubic (Fritsch–Carlson) interpolation through sorted control points.
 * Guarantees no overshoot, which keeps torque curves physically plausible.
 */
export class MonotoneCurve {
  private xs: number[];
  private ys: number[];
  private ms: number[];

  constructor(points: ReadonlyArray<readonly [number, number]>) {
    const sorted = [...points].sort((a, b) => a[0] - b[0]);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [x, y] of sorted) {
      if (xs.length && Math.abs(x - xs[xs.length - 1]) < 1e-9) {
        ys[ys.length - 1] = Math.max(ys[ys.length - 1], y);
        continue;
      }
      xs.push(x);
      ys.push(y);
    }
    if (xs.length < 2) throw new Error('MonotoneCurve needs at least two distinct points');
    const n = xs.length;
    const d: number[] = [];
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    const ms: number[] = new Array(n);
    ms[0] = d[0];
    ms[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) ms[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        ms[i] = 0;
        ms[i + 1] = 0;
        continue;
      }
      const a = ms[i] / d[i];
      const b = ms[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        ms[i] = t * a * d[i];
        ms[i + 1] = t * b * d[i];
      }
    }
    this.xs = xs;
    this.ys = ys;
    this.ms = ms;
  }

  get minX(): number {
    return this.xs[0];
  }
  get maxX(): number {
    return this.xs[this.xs.length - 1];
  }

  sample(x: number): number {
    const xs = this.xs;
    const n = xs.length;
    if (x <= xs[0]) return this.ys[0];
    if (x >= xs[n - 1]) return this.ys[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] > x) hi = mid;
      else lo = mid;
    }
    const h = xs[hi] - xs[lo];
    const t = (x - xs[lo]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * this.ys[lo] +
      (t3 - 2 * t2 + t) * h * this.ms[lo] +
      (-2 * t3 + 3 * t2) * this.ys[hi] +
      (t3 - t2) * h * this.ms[hi]
    );
  }
}
