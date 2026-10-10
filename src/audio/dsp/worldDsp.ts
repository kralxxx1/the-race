import { BQ_STRIDE, Biquad, HighPass1, LowPass1, Noise, PinkNoise, bandpass, clamp01, clampN, flushBank, setBandpass, sinCycles, softClip } from './util';

/** Surface the tyres run on, as blend weights (they need not sum to one). */
export interface WorldControls {
  /** Road speed (m/s). */
  speed: number;
  /** 0 = bare ears (open helmet / settings off), 1 = full-face helmet. */
  helmet: number;
  /** Water film on the road 0..1. */
  wet: number;
  /** Rumble strip under the wheels 0..1. */
  rumble: number;
  /** Loose surface (gravel/dirt/grass shoulder) 0..1. */
  gravel: number;
  /** Snow / slush 0..1. */
  snow: number;
  /** Braking intensity 0..1 and driven-wheel slip 0..1 (squeal). */
  brake: number;
  wheelspin: number;
  /** |lean| 0..1: tyre shoulder hum. */
  lean: number;
  /** Metal on tarmac / barrier grind 0..1 and body/plastic sliding 0..1 (crash slides, scaled by speed outside). */
  scrape: number;
  slide: number;
  /** Rain intensity 0..1 (on helmet and around). */
  rain: number;
  /** Extra turbulence 0..1 from passing trucks, tunnel mouths, etc. */
  gust: number;
  /** Concrete-slab expansion joints (highway thumps) 0..1. */
  joints: number;
  /** Output trims (linear). */
  windGain: number;
  tyreGain: number;
  rainGain: number;
}

export const WORLD_DEFAULTS: Readonly<WorldControls> = {
  speed: 0,
  helmet: 1,
  wet: 0,
  rumble: 0,
  gravel: 0,
  snow: 0,
  brake: 0,
  wheelspin: 0,
  lean: 0,
  scrape: 0,
  slide: 0,
  rain: 0,
  gust: 0,
  joints: 0.5,
  windGain: 1,
  tyreGain: 1,
  rainGain: 1,
};

// Category trims: wind and tyres are only supporting players behind the engine in the mix.
const WIND_TRIM = 0.36;
const TYRE_TRIM = 0.4;
const GRIND_TRIM = 0.6;
const RAIN_TRIM = 0.8;

// Resonator slots in the per-channel banks.
const W_RUSH = 0;
const W_WHISTLE = 1;
const W_BUFFET = 2;
const T_HUM = 3;
const T_BUZZ = 4;
const T_WET = 5;
const T_SQUEAL = 6;
const T_GRAVEL = 7;
const T_GRAVEL2 = 8;
const T_RUMBLE = 9;
const T_RUMBLE2 = 10;
const T_JOINT = 11;
const S_SCRAPE = 12;
const S_SCRAPE2 = 13;
const S_SLIDE = 14;
const R_DROP = 15;
const R_DROP2 = 16;
const R_WASH = 17;
const BANK_N = 18;

class Channel {
  readonly rng: Noise;
  readonly pink: PinkNoise;
  readonly pink2: PinkNoise;
  readonly bank = new Float64Array(BANK_N * BQ_STRIDE);
  readonly helmetLp = new Biquad();
  readonly helmetBoom = new Biquad();
  readonly gustLp: LowPass1;
  readonly buffetEnv: LowPass1;
  readonly washHp: HighPass1;
  readonly washLp: LowPass1;
  readonly snowLp: LowPass1;
  readonly slideLp: LowPass1;
  readonly stick: LowPass1;
  gust = 0;
  scrapeHold = 2400;
  scrapeCount = 0;
  dropBurst = 0;
  constructor(seed: number, sr: number) {
    this.rng = new Noise(seed);
    this.pink = new PinkNoise(this.rng);
    this.pink2 = new PinkNoise(this.rng);
    this.gustLp = new LowPass1(4, sr);
    this.buffetEnv = new LowPass1(30, sr);
    this.washHp = new HighPass1(600, sr);
    this.washLp = new LowPass1(7500, sr);
    this.snowLp = new LowPass1(700, sr);
    this.slideLp = new LowPass1(1400, sr);
    this.stick = new LowPass1(55, sr);
  }
}

/**
 * Continuous soundscape of riding: helmet wind with buffeting and visor whistle, tyre noise by surface
 * (hum, wet hiss, rumble strips, gravel, snow, squeal), expansion-joint thumps, slide/scrape grinds and
 * rain on the helmet. Pure DSP, controlled per frame by `WorldControls`.
 */
export class WorldDSP {
  private readonly ch: Channel[];
  private readonly c: WorldControls = { ...WORLD_DEFAULTS };
  private readonly t: WorldControls = { ...WORLD_DEFAULTS };
  private phRumble = 0;
  private phJoint = 0;
  private jointEnv = 0;
  private blocks = 0;
  private lastHelmet = -1;
  private readonly sr: number;
  private readonly blockK: number;

  constructor(sampleRate: number, seed = 0x51f15e) {
    this.sr = sampleRate;
    this.ch = [new Channel(seed, sampleRate), new Channel(seed ^ 0x9e3779b9, sampleRate)];
    this.blockK = 1 - Math.exp(-128 / (sampleRate * 0.06));
  }

  setControls(c: Partial<WorldControls>): void {
    const t = this.t;
    for (const k of Object.keys(c) as (keyof WorldControls)[]) {
      const v = c[k];
      if (typeof v === 'number' && Number.isFinite(v)) t[k] = v;
    }
  }

  snap(): void {
    Object.assign(this.c, this.t);
  }

  get controls(): Readonly<WorldControls> {
    return this.c;
  }

  process(left: Float32Array, right: Float32Array, offset: number, n: number): void {
    const sr = this.sr;
    const c = this.c;
    const t = this.t;
    // Smooth the controls once per block (≈ 60 ms time constant) — coefficient changes stay click-free.
    const k = this.blockK;
    for (const key of Object.keys(c) as (keyof WorldControls)[]) c[key] += (t[key] - c[key]) * k;
    this.blocks++;
    const v = Math.max(0, c.speed);
    const vn = v / 40;
    const helmet = clamp01(c.helmet);
    const wetK = clamp01(c.wet);
    if (Math.abs(helmet - this.lastHelmet) > 0.01) {
      this.lastHelmet = helmet;
      for (const ch of this.ch) {
        ch.helmetLp.lowpass(9500 - 6200 * helmet, 0.7, sr);
        ch.helmetBoom.peaking(150, 0.9, 6 * helmet, sr);
      }
    }

    // ── retune filters for this block ──
    const rushHz = 320 + 20 * v;
    const buffetHz = 90 + 3 * v;
    const humHz = 130 + 4.6 * v;
    const buzzHz = 800 + 24 * v;
    const whistleHz = 2300 + 8 * v;
    const dryness = 1 - 0.55 * wetK;
    const speedLvl = Math.pow(clampN(v / 30, 0, 2.2), 1.35);
    for (let i = 0; i < 2; i++) {
      const b = this.ch[i].bank;
      setBandpass(b, W_RUSH, rushHz * (i ? 1.04 : 0.97), 0.55, sr);
      setBandpass(b, W_BUFFET, buffetHz, 0.8, sr);
      setBandpass(b, W_WHISTLE, whistleHz * (i ? 1.02 : 0.98), 14, sr);
      setBandpass(b, T_HUM, humHz, 1.3, sr);
      setBandpass(b, T_BUZZ, buzzHz, 0.9, sr);
      setBandpass(b, T_WET, 4200, 0.45, sr);
      setBandpass(b, T_GRAVEL, 1500, 0.8, sr);
      setBandpass(b, T_GRAVEL2, 4200, 0.9, sr);
      setBandpass(b, T_RUMBLE, 92, 2.2, sr);
      setBandpass(b, T_RUMBLE2, 640, 1.8, sr);
      setBandpass(b, T_JOINT, 70, 1.4, sr);
      setBandpass(b, S_SCRAPE2, 5400, 1.4, sr);
      setBandpass(b, S_SLIDE, 420, 0.7, sr);
      setBandpass(b, R_DROP, 3200, 3.5, sr);
      setBandpass(b, R_DROP2, 5600, 4, sr);
      setBandpass(b, R_WASH, 2400, 0.4, sr);
      this.ch[i].gustLp.set(1.5 + v * 0.16, sr);
    }

    // ── levels ──
    const rushLvl = 0.5 * Math.pow(vn, 2) * (1 + c.gust * 0.8);
    const buffetLvl = 0.55 * Math.pow(vn, 2.2) * (0.6 + 0.8 * helmet);
    const whistleLvl = 0.03 * Math.pow(clamp01((v - 20) / 50), 1.6) * (0.4 + 0.6 * helmet) + 0.012 * c.gust;
    const hissLvl = 0.025 * Math.pow(clamp01(v / 60), 2.4) * (1 - 0.75 * helmet);
    const humLvl = 0.16 * speedLvl * dryness * (1 + 0.3 * clamp01(c.lean));
    const buzzLvl = 0.05 * speedLvl * dryness;
    const wetLvl = wetK * 0.11 * Math.pow(clampN(v / 22, 0, 2), 1.4);
    const gravelLvl = clamp01(c.gravel) * (0.015 + 0.2 * Math.min(1.5, v / 14));
    const snowLvl = clamp01(c.snow) * (0.03 + 0.12 * Math.min(1.5, v / 18));
    const rumbleLvl = clamp01(c.rumble) * (0.1 + 0.5 * Math.min(1, v / 25));
    const jointLvl = 0.5 * clamp01(c.joints) * Math.min(1, v / 25) * (1 - clamp01(c.gravel)) * (1 - 0.6 * wetK);
    const jointHz = v / 11.5;
    const squealSlip = Math.max(clamp01((c.brake - 0.8) * 5) * (v > 4 ? 1 : 0), clamp01(c.wheelspin * 1.4));
    const squealLvl = squealSlip * 0.07 * (1 - 0.6 * wetK) * (1 - c.gravel);
    const scrapeLvl = clamp01(c.scrape) * 0.55;
    const slideLvl = clamp01(c.slide) * 0.55;
    const rainLvl = clamp01(c.rain);
    const washLvl = rainLvl * 0.12 * (1 + 0.6 * clamp01(v / 40));
    const dropRate = (rainLvl * (35 + 4 * v)) / sr;
    const dropLvl = rainLvl * 0.35 * (0.5 + 0.5 * helmet);
    const wG = c.windGain;
    const tG = c.tyreGain;
    const rG = c.rainGain;
    const squealHz = 1250 + 400 * sinCycles(this.blocks * 0.011);
    for (let i = 0; i < 2; i++) setBandpass(this.ch[i].bank, T_SQUEAL, squealHz * (i ? 1.01 : 0.99), 18, sr);

    const outs = [left, right];
    for (let s = 0; s < n; s++) {
      // Shared periodic sources (stereo-coherent: both ears feel the same strip).
      let rumblePulse = 0;
      if (rumbleLvl > 1e-4) {
        // Milled rumble strips: ~16 cm pitch → buzz at v/0.16 Hz.
        this.phRumble += Math.min(sr * 0.2, Math.max(6, v / 0.16)) / sr;
        if (this.phRumble >= 1) {
          this.phRumble -= 1;
          rumblePulse = 1;
        }
      }
      let jointPulse = 0;
      if (jointLvl > 1e-3 && jointHz > 0.05) {
        this.phJoint += jointHz / sr;
        if (this.phJoint >= 1) {
          this.phJoint -= 1;
          this.jointEnv = 1;
          jointPulse = 1;
        }
      }
      const jointNow = this.jointEnv;
      this.jointEnv *= 0.9985;

      for (let i = 0; i < 2; i++) {
        const ch = this.ch[i];
        const b = ch.bank;
        const rng = ch.rng;
        const wp = ch.pink.next();
        const ww = rng.white();
        // gust process (turbulence): slow noise, positive part gives bursts
        ch.gust = ch.gustLp.process(rng.white() * 3.2);
        const gAmp = clamp01(0.55 + 0.9 * ch.gust + 0.5 * c.gust);
        let wind = bandpass(b, W_RUSH, wp) * rushLvl * 4.2;
        wind += bandpass(b, W_BUFFET, ch.pink2.next()) * buffetLvl * 7 * gAmp * gAmp;
        wind += bandpass(b, W_WHISTLE, ww) * whistleLvl * 4;
        wind += ww * hissLvl;
        wind = ch.helmetBoom.process(ch.helmetLp.process(wind)) * wG * WIND_TRIM;

        // tyres
        let tyre = bandpass(b, T_HUM, wp) * humLvl * 3.2 + bandpass(b, T_BUZZ, ww) * buzzLvl * 2.5;
        if (wetLvl > 1e-4) tyre += bandpass(b, T_WET, ww) * wetLvl * 3.5;
        if (gravelLvl > 1e-4) {
          const crack = rng.next() < 0.004 + 0.02 * Math.min(1, v / 25) ? rng.white() * 5 : 0;
          tyre += (bandpass(b, T_GRAVEL, ww * 0.35 + crack) + bandpass(b, T_GRAVEL2, crack)) * gravelLvl * 2;
        }
        if (snowLvl > 1e-4) tyre += ch.snowLp.process(wp) * snowLvl * 2.4 + (rng.next() < 0.01 ? rng.white() * snowLvl * 0.8 : 0);
        if (rumbleLvl > 1e-4) {
          const imp = rumblePulse * (0.7 + 0.6 * rng.next());
          tyre += (bandpass(b, T_RUMBLE, imp) * 4 + bandpass(b, T_RUMBLE2, imp) * 2.2) * rumbleLvl;
        }
        if (jointLvl > 1e-3) {
          const imp = jointPulse * (0.6 + 0.4 * rng.next());
          tyre += bandpass(b, T_JOINT, imp) * jointLvl * 3 + ww * jointNow * jointLvl * 0.012;
        }
        if (squealLvl > 1e-4) tyre += bandpass(b, T_SQUEAL, ww) * squealLvl * 5 * (0.75 + 0.25 * sinCycles(this.blocks * 0.31 + i));
        tyre *= tG * TYRE_TRIM;

        // scrapes / slides
        let grind = 0;
        if (scrapeLvl > 1e-3) {
          if (--ch.scrapeCount <= 0) {
            ch.scrapeCount = 60 + ((rng.next() * 160) | 0);
            ch.scrapeHold = 1700 + rng.next() * 2300;
            setBandpass(b, S_SCRAPE, ch.scrapeHold, 3.2, sr);
          }
          const stick = clamp01(0.4 + 2.2 * ch.stick.process(rng.white() * 6));
          grind += (bandpass(b, S_SCRAPE, ww) + 0.6 * bandpass(b, S_SCRAPE2, rng.white())) * scrapeLvl * 2.4 * stick;
        }
        if (slideLvl > 1e-3) grind += (bandpass(b, S_SLIDE, ww) * 1.8 + ch.slideLp.process(wp) * 1.4) * slideLvl * (0.6 + 0.4 * clamp01(0.5 + ch.gust));

        // rain
        let rain = 0;
        if (rainLvl > 1e-3) {
          if (rng.next() < dropRate) ch.dropBurst = 0.5 + rng.next();
          const d = ch.dropBurst;
          ch.dropBurst *= 0.97;
          rain += (bandpass(b, R_DROP, d * rng.white()) * 1.5 + bandpass(b, R_DROP2, d * rng.white()) * 0.8) * dropLvl;
          rain += bandpass(b, R_WASH, ch.washLp.process(ch.washHp.process(wp))) * washLvl * 2.4;
          rain *= rG * RAIN_TRIM;
        }
        const o = softClip(wind + tyre + grind * GRIND_TRIM + rain);
        outs[i][offset + s] = o;
      }
    }
    for (const ch of this.ch) flushBank(ch.bank);
  }
}
