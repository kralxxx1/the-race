/**
 * Small, allocation-free DSP building blocks shared by every synthesiser.
 *
 * Everything in `src/audio/dsp` is pure TypeScript with no Web Audio
 * dependency: the same code runs inside the AudioWorklet, in the
 * ScriptProcessor fallback and offline in unit tests, so what the tests
 * measure is exactly what the player hears.
 */

export const TWO_PI = Math.PI * 2;

/** Values this close to zero are flushed so float32 state never goes denormal. */
export const DENORMAL_EPS = 1e-15;

/** xorshift32 white-noise / random generator (deterministic, no allocation). */
export class Noise {
  private s: number;
  constructor(seed = 0x2545f491) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** Uniform in [0, 1). */
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  /** Uniform in [-1, 1). */
  white(): number {
    return this.next() * 2 - 1;
  }
  /** Cheap approximately-gaussian value (sum of 3 uniforms, unit variance). */
  gauss(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }
}

const SINE_BITS = 11;
const SINE_N = 1 << SINE_BITS;
const SINE_MASK = SINE_N - 1;
/** One period of a sine with a guard point for linear interpolation. */
const SINE_TABLE = (() => {
  const t = new Float32Array(SINE_N + 1);
  for (let i = 0; i <= SINE_N; i++) t[i] = Math.sin((i / SINE_N) * TWO_PI);
  return t;
})();

/** sin(2π·phase) for phase in cycles (any real value), via an interpolated table. */
export function sinCycles(phase: number): number {
  const p = phase - Math.floor(phase);
  const x = p * SINE_N;
  const i = x | 0;
  const f = x - i;
  const a = SINE_TABLE[i & SINE_MASK];
  return a + (SINE_TABLE[(i & SINE_MASK) + 1] - a) * f;
}

/** Smooth saturator: ≈ tanh for |x| < 3, hard ±1 beyond (no allocation, no Math.tanh). */
export function softClip(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function clampN(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function dbToLin(db: number): number {
  return Math.pow(10, db / 20);
}

/** Coefficient for a one-pole low-pass with cutoff `hz`. */
export function onePoleCoef(hz: number, sr: number): number {
  return 1 - Math.exp((-TWO_PI * Math.min(hz, sr * 0.49)) / sr);
}

/**
 * Two-pole resonator (RBJ band-pass, constant 0 dB peak gain) stored in a flat
 * Float64Array so banks of them cost no objects. Layout per filter: b0, a1, a2, z1, z2.
 */
export const BQ_STRIDE = 5;

export function setBandpass(bank: Float64Array, i: number, hz: number, q: number, sr: number): void {
  const w = (TWO_PI * Math.min(hz, sr * 0.45)) / sr;
  const alpha = Math.sin(w) / (2 * Math.max(0.05, q));
  const a0 = 1 + alpha;
  const o = i * BQ_STRIDE;
  bank[o] = alpha / a0;
  bank[o + 1] = (-2 * Math.cos(w)) / a0;
  bank[o + 2] = (1 - alpha) / a0;
}

/** Process one sample through band-pass `i` of `bank` (transposed direct form II). */
export function bandpass(bank: Float64Array, i: number, x: number): number {
  const o = i * BQ_STRIDE;
  const b0 = bank[o];
  const y = b0 * x + bank[o + 3];
  bank[o + 3] = -bank[o + 1] * y + bank[o + 4];
  bank[o + 4] = -b0 * x - bank[o + 2] * y;
  return y;
}

/** Zero tiny filter states (call once per block). */
export function flushBank(bank: Float64Array): void {
  for (let o = 0; o < bank.length; o += BQ_STRIDE) {
    if (Math.abs(bank[o + 3]) < DENORMAL_EPS) bank[o + 3] = 0;
    if (Math.abs(bank[o + 4]) < DENORMAL_EPS) bank[o + 4] = 0;
  }
}

/** First-order high-pass (DC blocker style) state. */
export class HighPass1 {
  private a = 0;
  private x1 = 0;
  private y1 = 0;
  constructor(hz: number, sr: number) {
    this.set(hz, sr);
  }
  set(hz: number, sr: number): void {
    this.a = Math.exp((-TWO_PI * hz) / sr);
  }
  process(x: number): number {
    const y = this.a * (this.y1 + x - this.x1);
    this.x1 = x;
    this.y1 = Math.abs(y) < DENORMAL_EPS ? 0 : y;
    return y;
  }
}

/** One-pole low-pass state. */
export class LowPass1 {
  private k = 1;
  private y = 0;
  constructor(hz: number, sr: number) {
    this.set(hz, sr);
  }
  set(hz: number, sr: number): void {
    this.k = onePoleCoef(hz, sr);
  }
  process(x: number): number {
    this.y += this.k * (x - this.y);
    if (Math.abs(this.y) < DENORMAL_EPS) this.y = 0;
    return this.y;
  }
  get value(): number {
    return this.y;
  }
}

/**
 * Pink-ish noise (Paul Kellet's economy filter): three poles are enough for
 * wind/tyre/induction textures and cost ~6 multiplies a sample.
 */
export class PinkNoise {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  constructor(private rng: Noise) {}
  next(): number {
    const w = this.rng.white();
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.2;
  }
}

/**
 * Half-band FIR decimator (2:1) for the oversampled "extreme" quality.
 * Windowed-sinc, odd length; even taps (except the centre) are zero.
 */
export class HalfBandDecimator {
  private taps: Float64Array;
  private buf: Float64Array;
  private pos = 0;
  private readonly n: number;
  constructor(length = 31) {
    const n = length | 1;
    this.n = n;
    this.taps = new Float64Array(n);
    const m = (n - 1) / 2;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const k = i - m;
      const sinc = k === 0 ? 0.5 : Math.sin((Math.PI * k) / 2) / (Math.PI * k);
      const w = 0.42 - 0.5 * Math.cos((TWO_PI * i) / (n - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (n - 1));
      this.taps[i] = sinc * w;
      sum += this.taps[i];
    }
    for (let i = 0; i < n; i++) this.taps[i] /= sum;
    this.buf = new Float64Array(n * 2);
  }
  /** Push two input samples, return one output sample. */
  process(a: number, b: number): number {
    const n = this.n;
    this.buf[this.pos] = a;
    this.buf[this.pos + n] = a;
    this.pos = (this.pos + 1) % n;
    this.buf[this.pos] = b;
    this.buf[this.pos + n] = b;
    this.pos = (this.pos + 1) % n;
    let acc = 0;
    // Newest sample sits at pos-1; walk back through the history.
    const start = this.pos;
    for (let i = 0; i < n; i++) acc += this.taps[i] * this.buf[start + i];
    return acc;
  }
}
