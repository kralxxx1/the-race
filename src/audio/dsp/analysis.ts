/**
 * Offline signal analysis for tests and the audio lab tool (never imported by the game):
 * FFT, spectrograms, band energies, spectral shape, envelope periodicity.
 */

/** In-place radix-2 complex FFT. `re`/`im` lengths must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Mean power spectrum (linear power per bin, Hann window) of a mono signal. */
export function powerSpectrum(x: Float32Array, size = 4096, hop = size / 2): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const acc = new Float64Array(size / 2 + 1);
  const win = new Float64Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  let count = 0;
  for (let p = 0; p + size <= x.length; p += hop) {
    for (let i = 0; i < size; i++) {
      re[i] = x[p + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k <= size / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
    count++;
  }
  if (count > 0) for (let k = 0; k < acc.length; k++) acc[k] /= count * size * size * 0.375;
  return acc;
}

/** dB spectrogram, frames-major (`data[frame * bins + bin]`), with bins spaced log-ish between fLo and fHi. */
export function spectrogram(x: Float32Array, sr: number, size: number, hop: number, fLo: number, fHi: number, linear = false): { data: Float32Array; frames: number; bins: number } {
  const frames = Math.max(1, Math.floor((x.length - size) / hop) + 1);
  const bins = 400;
  const data = new Float32Array(frames * bins);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const win = new Float64Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  const binHz = sr / size;
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < size; i++) {
      re[i] = x[f * hop + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < bins; b++) {
      // Log frequency axis: finer at low frequencies where the harmonics of firing pulses live.
      const fa = linear ? fLo + ((fHi - fLo) * b) / bins : fLo * Math.pow(fHi / fLo, b / bins);
      const fb = linear ? fLo + ((fHi - fLo) * (b + 1)) / bins : fLo * Math.pow(fHi / fLo, (b + 1) / bins);
      const k0 = Math.max(1, Math.floor(fa / binHz));
      const k1 = Math.max(k0 + 1, Math.ceil(fb / binHz));
      let m = 0;
      for (let k = k0; k < k1 && k < size / 2; k++) m = Math.max(m, re[k] * re[k] + im[k] * im[k]);
      data[f * bins + b] = 10 * Math.log10(m / (size * size * 0.1) + 1e-12);
    }
  }
  return { data, frames, bins };
}

/** Octave-ish band edges (Hz) used for the distinctness feature vector. */
export const FEATURE_BANDS: readonly number[] = [40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000];

export interface SpectralFeatures {
  /** Level (dB re 1.0 RMS) per band between FEATURE_BANDS edges. */
  bandDb: number[];
  rmsDb: number;
  /** log2 of the spectral centroid in Hz. */
  centroidLog2: number;
  /** Spectral flatness 0..1 of 40 Hz … 10 kHz. */
  flatness: number;
}

export function spectralFeatures(x: Float32Array, sr: number): SpectralFeatures {
  const size = 4096;
  const p = powerSpectrum(x, size, size / 2);
  const binHz = sr / size;
  const bandDb: number[] = [];
  let total = 0;
  for (let b = 0; b < FEATURE_BANDS.length - 1; b++) {
    const k0 = Math.round(FEATURE_BANDS[b] / binHz);
    const k1 = Math.round(FEATURE_BANDS[b + 1] / binHz);
    let e = 0;
    for (let k = k0; k < k1; k++) e += p[k];
    total += e;
    bandDb.push(10 * Math.log10(e + 1e-12));
  }
  let num = 0;
  let den = 0;
  let logSum = 0;
  let cnt = 0;
  const kLo = Math.round(40 / binHz);
  const kHi = Math.round(10000 / binHz);
  for (let k = kLo; k < kHi; k++) {
    num += k * binHz * p[k];
    den += p[k];
    logSum += Math.log(p[k] + 1e-14);
    cnt++;
  }
  const centroid = den > 0 ? num / den : 0;
  const flat = den > 0 ? Math.exp(logSum / cnt) / (den / cnt) : 0;
  return { bandDb, rmsDb: 10 * Math.log10(total + 1e-12), centroidLog2: Math.log2(Math.max(20, centroid)), flatness: Math.min(1, flat) };
}

/** Amplitude envelope: |x| smoothed by a one-pole low-pass (corner `hz`), decimated by `dec`. */
export function envelope(x: Float32Array, sr: number, hz = 400, dec = 16): Float32Array {
  const k = 1 - Math.exp((-2 * Math.PI * hz) / sr);
  const out = new Float32Array(Math.floor(x.length / dec));
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += k * (Math.abs(x[i]) - y);
    if (i % dec === 0 && i / dec < out.length) out[i / dec] = y;
  }
  return out;
}

/**
 * Fold an envelope onto the 720° four-stroke cycle (period 120/rpm s), returning `bins`
 * values normalised to zero mean / unit peak. This is the engine's rhythm signature.
 */
export function cycleProfile(env: Float32Array, envRate: number, rpm: number, bins = 24): Float64Array {
  const period = 120 / rpm;
  const acc = new Float64Array(bins);
  const cnt = new Float64Array(bins);
  for (let i = 0; i < env.length; i++) {
    const ph = ((i / envRate) / period) % 1;
    const b = Math.min(bins - 1, Math.floor(ph * bins));
    acc[b] += env[i];
    cnt[b]++;
  }
  let mean = 0;
  for (let b = 0; b < bins; b++) {
    acc[b] = cnt[b] > 0 ? acc[b] / cnt[b] : 0;
    mean += acc[b];
  }
  mean /= bins;
  let peak = 1e-12;
  for (let b = 0; b < bins; b++) {
    acc[b] -= mean;
    peak = Math.max(peak, Math.abs(acc[b]));
  }
  for (let b = 0; b < bins; b++) acc[b] /= peak;
  return acc;
}

/** Normalised autocorrelation of an envelope at an integer lag (in envelope samples). */
export function autocorr(env: Float32Array, lag: number): number {
  const n = env.length - lag;
  if (n <= 8) return 0;
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= env.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const a = env[i] - mean;
    num += a * (env[i + lag] - mean);
    den += a * a;
  }
  return den > 0 ? num / den : 0;
}

/** Onset times (s) of an envelope: local maxima that rise `rel` above the running minimum. */
export function onsets(env: Float32Array, envRate: number, rel = 0.35): number[] {
  let peak = 0;
  for (const v of env) peak = Math.max(peak, v);
  const out: number[] = [];
  if (peak <= 0) return out;
  const thr = peak * rel;
  let armed = true;
  let lastMax = 0;
  let lastIdx = 0;
  for (let i = 1; i < env.length - 1; i++) {
    const v = env[i];
    if (armed && v > thr && v >= env[i - 1] && v > env[i + 1]) {
      lastMax = v;
      lastIdx = i;
      out.push(i / envRate);
      armed = false;
    } else if (!armed) {
      if (v > lastMax) {
        // still rising after the detection: move the onset
        lastMax = v;
        lastIdx = i;
        out[out.length - 1] = i / envRate;
      }
      if (v < lastMax * 0.55 && i > lastIdx) armed = true;
    }
  }
  return out;
}

/** A-weighting (IEC 61672) in dB for frequency f. */
export function aWeightDb(f: number): number {
  const f2 = f * f;
  const ra = (12194 * 12194 * f2 * f2) / ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
  return 20 * Math.log10(ra + 1e-12) + 2.0;
}

/** B-weighting (IEC 651) in dB: closer to how loud engines are perceived at high levels than A (which discards the bass). */
export function bWeightDb(f: number): number {
  const f2 = f * f;
  const rb = (12194 * 12194 * f2 * f) / ((f2 + 20.6 * 20.6) * Math.sqrt(f2 + 158.5 * 158.5) * (f2 + 12194 * 12194));
  return 20 * Math.log10(rb + 1e-12) + 0.17;
}

/** B-weighted level (dB re 1.0 full scale RMS) of a mono signal. */
export function bWeightedDb(x: Float32Array, sr: number): number {
  const size = 4096;
  const p = powerSpectrum(x, size, size / 2);
  const binHz = sr / size;
  let sum = 0;
  for (let k = 1; k < p.length; k++) sum += p[k] * Math.pow(10, bWeightDb(k * binHz) / 10);
  return 10 * Math.log10(sum + 1e-14);
}

/** A-weighted level (dB re 1.0 full scale RMS) of a mono signal. */
export function aWeightedDb(x: Float32Array, sr: number): number {
  const size = 4096;
  const p = powerSpectrum(x, size, size / 2);
  const binHz = sr / size;
  let sum = 0;
  for (let k = 1; k < p.length; k++) sum += p[k] * Math.pow(10, aWeightDb(k * binHz) / 10);
  return 10 * Math.log10(sum + 1e-14);
}

/**
 * Fraction of the 150 Hz … `hiHz` energy that sits on the harmonic comb of `f0`
 * (±`tol` relative width). 1 = pure harmonic tone, ~2·tol·… = white noise.
 */
export function harmonicFraction(x: Float32Array, sr: number, f0: number, hiHz = 3000, tol = 0.03): number {
  const size = 16384;
  const p = powerSpectrum(x, size, size / 2);
  const binHz = sr / size;
  const k0 = Math.round(150 / binHz);
  const k1 = Math.min(p.length - 1, Math.round(hiHz / binHz));
  let tot = 0;
  let on = 0;
  for (let k = k0; k <= k1; k++) {
    const f = k * binHz;
    const order = f / f0;
    const frac = Math.abs(order - Math.round(order));
    tot += p[k];
    if (frac < tol * Math.max(1, order * 0.1) * 1) on += p[k];
  }
  return tot > 0 ? on / tot : 0;
}
