import type { EngineMix, EngineQuality, EngineVoiceParams, ExhaustNetwork } from './params';
import { FIRST_PERSON_MIX } from './params';
import { WaveguideNetwork } from './waveguide';
import {
  BQ_STRIDE,
  Biquad,
  HalfBandDecimator,
  HighPass1,
  LowPass1,
  Noise,
  PinkNoise,
  bandpass,
  clamp01,
  clampN,
  dbToLin,
  flushBank,
  onePoleCoef,
  setBandpass,
  sinCycles,
  softClip,
} from './util';

/** Live controls, normally updated ~60×/s from the game. */
export interface EngineControls {
  rpm: number;
  /** Rider's throttle grip 0..1. */
  throttle: number;
  /** Fraction of available torque being delivered 0..1. */
  load: number;
  /** Road speed (m/s): final drive whine, ram air. */
  speed: number;
}

/** Discrete events sent by the game. */
export type EngineEvent = 'shiftCut' | 'limiterCut' | 'pop' | 'backfire' | 'blip';

/** Common interface of the combustion and electric synthesisers. */
export interface EngineSynthesizer {
  readonly params: EngineVoiceParams;
  setControls(c: Readonly<EngineControls>): void;
  setStarter(on: boolean): void;
  setIgnition(on: boolean): void;
  setMix(mix: Readonly<EngineMix>, intakeBalance: number): void;
  /** Multiplier on overrun crackle probability (exhaust mod / user setting). */
  setCrackleScale(k: number): void;
  trigger(e: EngineEvent, value?: number): void;
  /** Render `n` stereo samples into the given arrays starting at `offset`. */
  process(left: Float32Array, right: Float32Array, offset: number, n: number): void;
  /** Overrun / backfire pops fired so far (diagnostics, tests). */
  readonly popCount: number;
  /** Pops fired during ignition cuts (limiter, quickshifter). */
  readonly cutPopCount: number;
}

const EV_FIRE = 0;
const EV_EVO = 1;
const EV_IVO = 2;
const EV_EVC = 3;
const EV_IVC = 4;

/** Valve events relative to the firing (compression TDC) angle, in crank degrees. */
const EVO_AFTER_FIRE = 128;
const IVO_AFTER_FIRE = 345;
const IVC_AFTER_FIRE = 590;
const INTAKE_DURATION = 245;

const TABLE_N = 256;

/**
 * Slow "piston-driven" part of the exhaust flow over the valve-open period, x ∈ [0,1).
 * The explosive blowdown spike that rides on top of it is generated in the time domain
 * (see `exhaustSample`) because its duration is set by gas dynamics, not by crank angle.
 */
function buildHumpTable(): Float32Array {
  const t = new Float32Array(TABLE_N + 1);
  for (let i = 0; i <= TABLE_N; i++) {
    const x = Math.min(1, i / TABLE_N);
    // Valve curtain area opens and closes smoothly; displacement flow peaks early in the stroke.
    const curtain = Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.02)), 0.6);
    const rise = 1 - Math.exp(-x / 0.05);
    t[i] = rise * (0.5 * Math.exp(-x / 0.2) + 0.36 * Math.sin(Math.PI * x)) * curtain;
  }
  return t;
}

/** Envelope of the turbulent (noisy) part of the exhaust flow. */
function buildRaspTable(): Float32Array {
  const t = new Float32Array(TABLE_N + 1);
  for (let i = 0; i <= TABLE_N; i++) {
    const x = Math.min(1, i / TABLE_N);
    t[i] = (1 - Math.exp(-x / 0.01)) * Math.exp(-x / 0.16) * (1 - x);
  }
  return t;
}

/** Intake suction pulse over the intake valve open period. */
function buildIntakeTable(): Float32Array {
  const t = new Float32Array(TABLE_N + 1);
  for (let i = 0; i <= TABLE_N; i++) {
    const x = Math.min(1, i / TABLE_N);
    // Peak piston velocity a little before mid-stroke, then valve closing.
    t[i] = Math.pow(Math.sin(Math.PI * x), 1.6) * (0.75 + 0.25 * Math.cos(Math.PI * x));
  }
  return t;
}

const HUMP = buildHumpTable();
const RASP = buildRaspTable();
const INTAKE = buildIntakeTable();

function table(tab: Float32Array, x: number): number {
  const f = x * TABLE_N;
  const i = f | 0;
  const a = tab[i];
  return a + (tab[i + 1] - a) * (f - i);
}

/**
 * Zero-mean crank speed fluctuation over the 720° cycle (720 entries). Each
 * firing accelerates the crank, each compression stroke slows it; summing the
 * cylinders shows why an inline-four is silky and a big single lopes.
 */
export function crankSpeedTable(firing: readonly number[]): Float32Array {
  const n = 720;
  const torque = new Float64Array(n);
  for (const f of firing) {
    for (let d = 0; d < n; d++) {
      const phi = (((d - f) % 720) + 720) % 720;
      let tq = 0;
      if (phi < 180) tq = Math.sin((phi * Math.PI) / 180);
      else if (phi >= 540) tq = -0.55 * Math.sin(((phi - 540) * Math.PI) / 180);
      torque[d] += tq;
    }
  }
  let mean = 0;
  for (let d = 0; d < n; d++) mean += torque[d];
  mean /= n;
  const speed = new Float64Array(n);
  let acc = 0;
  for (let d = 0; d < n; d++) {
    acc += torque[d] - mean;
    speed[d] = acc;
  }
  let sm = 0;
  for (let d = 0; d < n; d++) sm += speed[d];
  sm /= n;
  // Normalise against a single cylinder so multi-cylinder smoothness shows up as a smaller value.
  const out = new Float32Array(n + 1);
  for (let d = 0; d < n; d++) out[d] = (speed[d] - sm) / 60;
  out[n] = out[0];
  return out;
}

/** Collapse a full exhaust network into one header → muffler → tail (the "low" quality path). */
export function simplifyNetwork(net: ExhaustNetwork): ExhaustNetwork {
  const headers = net.pipes.filter((p) => net.nodes[p.a]?.k === 'port');
  const meanHeader = headers.length ? headers.reduce((a, p) => a + p.len, 0) / headers.length : 0.6;
  const others = net.pipes.filter((p) => net.nodes[p.a]?.k !== 'port');
  const big = others.reduce((m, p) => (p.area > m.area ? p : m), others[0] ?? { a: 0, b: 0, len: 0.3, area: 6, lossHz: 1800, lossGain: 0.85 });
  const tailLen = others.filter((p) => net.nodes[p.b]?.k === 'open').reduce((a, p) => a + p.len, 0) / Math.max(1, net.outlets.length) || 0.15;
  const pan = net.outlets.reduce((a, o) => a + o.pan, 0) / Math.max(1, net.outlets.length);
  const hp = net.outlets.reduce((a, o) => a + o.hpHz, 0) / Math.max(1, net.outlets.length);
  return {
    nodes: [{ k: 'port', cyl: 0, refl: 0.55 }, { k: 'junction' }, { k: 'junction' }, { k: 'open', out: 0, refl: 0.85, reflHz: 1600 }],
    pipes: [
      { a: 0, b: 1, len: meanHeader + 0.35, area: 1.4, lossHz: 9000, lossGain: 0.97 },
      { a: 1, b: 2, len: big.len, area: big.area, lossHz: big.lossHz, lossGain: big.lossGain },
      { a: 2, b: 3, len: tailLen, area: 1.2, lossHz: 9000, lossGain: 0.97 },
    ],
    outlets: [{ pan, gain: 1, hpHz: hp }],
  };
}

interface QualityProfile {
  oversample: number;
  fullNetwork: boolean;
  ticks: boolean;
  bodyModes: number;
  mufflerResonators: number;
  intakeFormants: number;
  whines: boolean;
}

const QUALITY: Record<EngineQuality, QualityProfile> = {
  low: { oversample: 1, fullNetwork: false, ticks: false, bodyModes: 1, mufflerResonators: 1, intakeFormants: 1, whines: false },
  medium: { oversample: 1, fullNetwork: true, ticks: false, bodyModes: 2, mufflerResonators: 1, intakeFormants: 1, whines: true },
  high: { oversample: 1, fullNetwork: true, ticks: true, bodyModes: 3, mufflerResonators: 2, intakeFormants: 2, whines: true },
  ultra: { oversample: 1, fullNetwork: true, ticks: true, bodyModes: 5, mufflerResonators: 3, intakeFormants: 2, whines: true },
  extreme: { oversample: 2, fullNetwork: true, ticks: true, bodyModes: 5, mufflerResonators: 3, intakeFormants: 2, whines: true },
};

// Indices into the shared resonator bank.
const R_HELM = 0;
const R_RUNNER = 1;
const R_ROAR_A = 2;
const R_ROAR_B = 3;
const R_RAM = 4;
const R_TICK_A = 5;
const R_TICK_B = 6;
const R_DESMO = 7;
const R_CLUTCH = 8; // 3 modes
const R_BOV = 11;
const R_CHG_HISS = 12;
const R_DRIVE = 13;
const R_BODY = 14; // up to 5
const R_MUF = 19; // up to 3
const R_COUNT = 22;

/**
 * Real-time combustion engine synthesiser, crank-angle driven.
 *
 * Per sample: the crank angle advances by rpm·6/sr degrees (with the
 * cylinder-pressure speed ripple); every valve event of every cylinder is
 * found by crossing its exact angle, so the firing order *is* the rhythm and
 * rpm changes are continuous (no loops, no crossfades). Exhaust pulses
 * feed per-cylinder headers of a waveguide exhaust network; intake pulses
 * excite the airbox; valve, gear, chain and clutch sources add the mechanics.
 */
export class EngineDSP implements EngineSynthesizer {
  readonly params: EngineVoiceParams;
  readonly quality: EngineQuality;
  readonly sampleRate: number;
  popCount = 0;
  cutPopCount = 0;
  /** Crank angle (deg) of every FIRE event while `logFires` is on (tests). */
  readonly fireLog: number[] = [];
  logFires = false;

  private readonly q: QualityProfile;
  private readonly isr: number;
  private readonly rng: Noise;
  private readonly pink: PinkNoise;
  private readonly net: WaveguideNetwork;
  private readonly netCyl: boolean;
  private readonly cyl: number;
  private readonly crank: Float32Array;
  private readonly sizeScale: number;
  /** Blowdown spike time constant (s) and rise-envelope decay per sample. */
  private readonly spikeTau: number;
  private readonly riseDecay: number;

  // Event table (sorted by angle).
  private readonly evAngle: Float64Array;
  private readonly evType: Uint8Array;
  private readonly evCyl: Uint8Array;
  private evIdx = 0;
  private theta = 0;

  // Per-cylinder state.
  private readonly combAmp: Float64Array;
  private readonly combPop: Float64Array;
  private readonly exPsi: Float64Array;
  private readonly exAmp: Float64Array;
  private readonly exRasp: Float64Array;
  private readonly exSpike: Float64Array;
  private readonly exSpikeEnv: Float64Array;
  private readonly exRiseEnv: Float64Array;
  private readonly exSpikeDecay: Float64Array;
  private readonly exDur: Float64Array;
  private readonly exOn: Uint8Array;
  private readonly inPsi: Float64Array;
  private readonly inAmp: Float64Array;
  private readonly inOn: Uint8Array;

  // Controls: targets and smoothed values.
  private tRpm = 0;
  private tThr = 0;
  private tLoad = 0;
  private tSpeed = 0;
  private rpm = 0;
  private thr = 0;
  private load = 0;
  private speed = 0;
  private kRpm: number;
  private kThr: number;
  private kLoad: number;
  private kSpeed: number;
  private starter = false;
  private ignition = true;
  private starterGain = 0;

  // Combustion state.
  private cutSamples = 0;
  private limiterHold = false;
  private overrunT = 0;
  private fuelCut = false;
  private pendingPop = 0;
  private relight = false;
  private crackleScale = 1;

  // Filters.
  private readonly bank = new Float64Array(R_COUNT * BQ_STRIDE);
  private readonly outletHp: HighPass1[];
  private readonly outletPan: Float64Array;
  private readonly outletGain: Float64Array;
  private readonly toneL: LowPass1;
  private readonly toneR: LowPass1;
  private readonly shadowL: LowPass1;
  private readonly shadowR: LowPass1;
  private readonly hissHp: HighPass1;
  private readonly roarEnv: LowPass1;
  private readonly flowEnv: LowPass1;
  private readonly dcL = new Biquad();
  private readonly dcR = new Biquad();
  private readonly eqLowL = new Biquad();
  private readonly eqLowR = new Biquad();
  private readonly eqHighL = new Biquad();
  private readonly eqHighR = new Biquad();
  private readonly intakeHp: HighPass1;
  private readonly mechLp: LowPass1;
  private bodyCount: number;
  private mufCount: number;
  private tickImp = 0;
  private desmoImp = 0;
  private clutchImp = 0;
  private bodyImp = 0;

  // Oscillators (phases in cycles).
  private phCam = 0;
  private phGear = 0;
  private phDrive = 0;
  private phStarter = 0;
  private phCharger = 0;
  private phWob1 = 0.31;
  private phWob2 = 0.77;
  private phBov = 0;
  private bovEnv = 0;
  private thrPeak = 0;

  // Mix.
  private gEx = FIRST_PERSON_MIX.exhaust;
  private gIn = FIRST_PERSON_MIX.intake;
  private gMech = FIRST_PERSON_MIX.mech;
  private width = FIRST_PERSON_MIX.width;
  private shadowAmt = FIRST_PERSON_MIX.rearShadow;
  private outGain = 1;
  private readonly measure: boolean;

  // Oversampling.
  private readonly decL: HalfBandDecimator | null;
  private readonly decR: HalfBandDecimator | null;
  private sL = 0;
  private sR = 0;

  constructor(params: EngineVoiceParams, sampleRate: number, quality: EngineQuality = 'high', opts: { seed?: number; measure?: boolean } = {}) {
    this.params = params;
    this.quality = quality;
    this.sampleRate = sampleRate;
    this.q = QUALITY[quality];
    this.isr = sampleRate * this.q.oversample;
    this.measure = opts.measure ?? false;
    const isr = this.isr;
    this.rng = new Noise((opts.seed ?? 0x1234567) ^ hashString(params.id));
    this.pink = new PinkNoise(this.rng);
    this.cyl = Math.max(1, params.firing.length);
    const net = this.q.fullNetwork ? params.network : simplifyNetwork(params.network);
    this.netCyl = this.q.fullNetwork;
    this.net = new WaveguideNetwork(net, this.netCyl ? this.cyl : 1, isr, params.gasC);
    this.crank = crankSpeedTable(params.firing.length ? params.firing : [0]);
    this.sizeScale = Math.sqrt(Math.max(50, params.ccPerCyl) / 250);
    // Bigger bores and valves open slower: ~0.35 ms for a 100 cc/cyl 600, ~0.9 ms for a 600 cc V-twin cylinder.
    this.spikeTau = clampN(0.00022 + 0.0000016 * params.ccPerCyl, 0.0003, 0.0013);
    this.riseDecay = Math.exp(-1 / (isr * 0.00006));

    // Events.
    const evs: { a: number; t: number; c: number }[] = [];
    const norm = (a: number) => ((a % 720) + 720) % 720;
    params.firing.forEach((f, c) => {
      evs.push({ a: norm(f), t: EV_FIRE, c });
      evs.push({ a: norm(f + EVO_AFTER_FIRE), t: EV_EVO, c });
      evs.push({ a: norm(f + IVO_AFTER_FIRE), t: EV_IVO, c });
      evs.push({ a: norm(f + EVO_AFTER_FIRE + params.exhDuration), t: EV_EVC, c });
      evs.push({ a: norm(f + IVC_AFTER_FIRE), t: EV_IVC, c });
    });
    evs.sort((x, y) => x.a - y.a || x.t - y.t);
    this.evAngle = Float64Array.from(evs.map((e) => e.a));
    this.evType = Uint8Array.from(evs.map((e) => e.t));
    this.evCyl = Uint8Array.from(evs.map((e) => e.c));

    const n = this.cyl;
    this.combAmp = new Float64Array(n);
    this.combPop = new Float64Array(n);
    this.exPsi = new Float64Array(n);
    this.exAmp = new Float64Array(n);
    this.exRasp = new Float64Array(n);
    this.exSpike = new Float64Array(n);
    this.exSpikeEnv = new Float64Array(n);
    this.exRiseEnv = new Float64Array(n);
    this.exSpikeDecay = new Float64Array(n);
    this.exDur = new Float64Array(n).fill(params.exhDuration);
    this.exOn = new Uint8Array(n);
    this.inPsi = new Float64Array(n);
    this.inAmp = new Float64Array(n);
    this.inOn = new Uint8Array(n);

    this.kRpm = onePoleCoef(30, isr);
    this.kThr = onePoleCoef(14, isr);
    this.kLoad = onePoleCoef(9, isr);
    this.kSpeed = onePoleCoef(3, isr);

    this.outletHp = net.outlets.map((o) => new HighPass1(o.hpHz, isr));
    this.outletPan = Float64Array.from(net.outlets.map((o) => o.pan));
    this.outletGain = Float64Array.from(net.outlets.map((o) => o.gain));
    this.toneL = new LowPass1(params.muffler.toneHz, isr);
    this.toneR = new LowPass1(params.muffler.toneHz, isr);
    this.shadowL = new LowPass1(16000, isr);
    this.shadowR = new LowPass1(16000, isr);
    this.hissHp = new HighPass1(2500, isr);
    this.roarEnv = new LowPass1(60, isr);
    this.flowEnv = new LowPass1(40, isr);
    // Sub-bass below ~55 Hz is mostly unipolar-pulse sub-harmonics: no small speaker plays it and it eats headroom.
    this.dcL.highpass(70, 0.62, isr);
    this.dcR.highpass(70, 0.62, isr);
    this.intakeHp = new HighPass1(35, isr);
    this.mechLp = new LowPass1(9000, isr);

    const b = this.bank;
    const it = params.intake;
    setBandpass(b, R_HELM, it.helmholtzHz, it.helmholtzQ, isr);
    setBandpass(b, R_RUNNER, it.runnerHz, it.runnerQ, isr);
    setBandpass(b, R_ROAR_A, it.roarHz, 0.9, isr);
    setBandpass(b, R_ROAR_B, it.roarHz * 2.4, 1.4, isr);
    setBandpass(b, R_RAM, 420, 0.6, isr);
    const m = params.mech;
    setBandpass(b, R_TICK_A, m.tickHz, 16, isr);
    setBandpass(b, R_TICK_B, m.tickHz * 1.73, 22, isr);
    setBandpass(b, R_DESMO, m.tickHz * 0.58, 7, isr);
    setBandpass(b, R_CLUTCH, 1870, 30, isr);
    setBandpass(b, R_CLUTCH + 1, 3140, 34, isr);
    setBandpass(b, R_CLUTCH + 2, 4630, 40, isr);
    setBandpass(b, R_BOV, 2100, 2.5, isr);
    setBandpass(b, R_CHG_HISS, 3400, 1.2, isr);
    setBandpass(b, R_DRIVE, 900, 0.8, isr);
    this.bodyCount = Math.min(this.q.bodyModes, params.body.length);
    for (let i = 0; i < this.bodyCount; i++) setBandpass(b, R_BODY + i, params.body[i].hz, params.body[i].q, isr);
    this.mufCount = Math.min(this.q.mufflerResonators, params.muffler.resonators.length);
    for (let i = 0; i < this.mufCount; i++) setBandpass(b, R_MUF + i, params.muffler.resonators[i].hz, params.muffler.resonators[i].q, isr);

    this.decL = this.q.oversample > 1 ? new HalfBandDecimator(31) : null;
    this.decR = this.q.oversample > 1 ? new HalfBandDecimator(31) : null;
    this.outGain = this.measure ? 1 : params.calib * dbToLin(params.loudness);
    this.setMix(FIRST_PERSON_MIX, 0);
  }

  setControls(c: Readonly<EngineControls>): void {
    this.tRpm = Math.max(0, Number.isFinite(c.rpm) ? c.rpm : 0);
    this.tThr = clamp01(Number.isFinite(c.throttle) ? c.throttle : 0);
    this.tLoad = clamp01(Number.isFinite(c.load) ? c.load : 0);
    this.tSpeed = Math.max(0, Number.isFinite(c.speed) ? c.speed : 0);
  }

  /** Jump the smoothed controls to their targets (offline renders, tests). */
  snapControls(): void {
    this.rpm = this.tRpm;
    this.thr = this.tThr;
    this.load = this.tLoad;
    this.speed = this.tSpeed;
  }

  setStarter(on: boolean): void {
    this.starter = on;
  }

  setIgnition(on: boolean): void {
    this.ignition = on;
  }

  setCrackleScale(k: number): void {
    this.crackleScale = clampN(k, 0, 4);
  }

  setMix(mix: Readonly<EngineMix>, intakeBalance: number): void {
    // Balance −1 = all intake, +1 = all exhaust (equal-power-ish around 0).
    const bal = clampN(intakeBalance, -1, 1);
    this.gEx = mix.exhaust * Math.min(1, 1 + bal);
    this.gIn = mix.intake * Math.min(1, 1 - bal);
    this.gMech = mix.mech;
    this.width = mix.width;
    this.shadowAmt = mix.rearShadow;
    const hz = 16000 - 11000 * clamp01(mix.rearShadow);
    this.shadowL.set(hz, this.isr);
    this.shadowR.set(hz, this.isr);
    this.eqLowL.lowShelf(140, mix.lowDb, this.isr);
    this.eqLowR.lowShelf(140, mix.lowDb, this.isr);
    this.eqHighL.highShelf(mix.highHz, mix.highDb, this.isr);
    this.eqHighR.highShelf(mix.highHz, mix.highDb, this.isr);
  }

  trigger(e: EngineEvent, value = 1): void {
    switch (e) {
      case 'shiftCut':
        // Quickshifter ignition cut, typically 40–80 ms.
        this.cutSamples = Math.max(this.cutSamples, Math.round(clampN(value, 0.01, 0.3) * this.isr));
        this.relight = true;
        break;
      case 'limiterCut':
        this.cutSamples = Math.max(this.cutSamples, Math.round(0.035 * this.isr));
        this.relight = true;
        break;
      case 'pop':
        this.pendingPop = Math.max(this.pendingPop, 1.4 + 0.8 * clamp01(value));
        break;
      case 'backfire':
        this.pendingPop = 4;
        break;
      case 'blip':
        break;
    }
  }

  process(left: Float32Array, right: Float32Array, offset: number, n: number): void {
    const os = this.q.oversample;
    for (let i = 0; i < n; i++) {
      if (os === 1) {
        this.tick();
        left[offset + i] = this.sL;
        right[offset + i] = this.sR;
      } else {
        this.tick();
        const l0 = this.sL;
        const r0 = this.sR;
        this.tick();
        left[offset + i] = this.decL!.process(l0, this.sL);
        right[offset + i] = this.decR!.process(r0, this.sR);
      }
    }
    this.net.flush();
    flushBank(this.bank);
  }

  /** Internal state arrays (tests scan them for denormals). */
  stateArrays(): ArrayLike<number>[] {
    return [this.net.buf, this.bank, this.exPsi, this.exAmp, this.inAmp];
  }

  // ───────────────────────────── per-sample core ─────────────────────────────
  private tick(): void {
    const p = this.params;
    const isr = this.isr;
    const rng = this.rng;

    // Smooth controls (one-pole, per sample → no zipper noise).
    this.rpm += this.kRpm * (this.tRpm - this.rpm);
    this.thr += this.kThr * (this.tThr - this.thr);
    this.load += this.kLoad * (this.tLoad - this.load);
    this.speed += this.kSpeed * (this.tSpeed - this.speed);
    const rpm = this.rpm;
    const thr = this.thr;
    const load = this.load;
    const rpmFrac = clampN(rpm / p.redline, 0, 1.15);

    // Engine state.
    if (this.cutSamples > 0) this.cutSamples--;
    if (rpm >= p.limiter * 0.997) this.limiterHold = true;
    else if (rpm < p.limiter * 0.985) this.limiterHold = false;
    const wasCut = this.fuelCut;
    this.fuelCut = !this.starter && thr < 0.04 && rpm > p.idle * 1.45;
    if (this.fuelCut) this.overrunT += 1 / isr;
    else this.overrunT = 0;
    if (!wasCut && this.fuelCut) this.overrunT = 0;

    // Crank advance with in-cycle speed ripple (stronger at low rpm, big cylinders, light flywheels).
    const ripple = rpm > 1 ? p.flywheel * 0.11 * Math.min(1.5, Math.pow((p.idle * 1.15) / Math.max(rpm, 200), 2)) : 0;
    const ci = this.theta | 0;
    const cf = this.theta - ci;
    const speedMod = this.crank[ci] + (this.crank[ci + 1] - this.crank[ci]) * cf;
    // Slow speed hunting (combustion scatter, idle governor): real engines never hold a perfectly steady rpm.
    this.phWob1 += 0.83 / isr;
    this.phWob2 += 3.4 / isr;
    if (this.phWob1 > 1e6) this.phWob1 -= 1e6;
    if (this.phWob2 > 1e6) this.phWob2 -= 1e6;
    const idleLike = clamp01(1 - (rpm - p.idle) / (p.idle * 1.2));
    const wob = (0.6 * sinCycles(this.phWob1) + 0.4 * sinCycles(this.phWob2)) * (0.0012 + 0.011 * idleLike) * (0.4 + p.roughness + p.idleLope * 0.5);
    const dTheta = (rpm * 6 * (1 + ripple * speedMod + wob)) / isr;
    if (dTheta > 0) this.advance(dTheta, rpm, thr, load, rpmFrac);

    // ── exhaust pulses into the headers ──
    const net = this.net;
    let flow = 0;
    if (this.netCyl) {
      for (let c = 0; c < this.cyl; c++) {
        net.inject[c] = this.exhaustSample(c, dTheta) + (rng.next() - 0.5) * 1e-9;
        flow += net.inject[c];
      }
    } else {
      let sum = 0;
      for (let c = 0; c < this.cyl; c++) sum += this.exhaustSample(c, dTheta);
      net.inject[0] = sum + (rng.next() - 0.5) * 1e-9;
      flow = sum;
    }
    net.step();

    // ── radiation from the outlets ──
    let exL = 0;
    let exR = 0;
    const outs = net.out;
    for (let o = 0; o < outs.length; o++) {
      const v = this.outletHp[o].process(outs[o]) * this.outletGain[o];
      const pan = this.outletPan[o] * this.width;
      exL += v * (1 - pan) * 0.5;
      exR += v * (1 + pan) * 0.5;
    }
    exL *= 2.1;
    exR *= 2.1;
    // Silencer packing absorbs the highs; shell / side-branch resonances add body.
    exL = this.toneL.process(exL);
    exR = this.toneR.process(exR);
    const mono = (exL + exR) * 0.5;
    let res = 0;
    for (let i = 0; i < this.mufCount; i++) res += bandpass(this.bank, R_MUF + i, mono) * p.muffler.resonators[i].gain;
    const env = this.flowEnv.process(Math.abs(flow));
    const hiss = this.hissHp.process(rng.white()) * env * p.muffler.hiss * 0.22;
    exL += res + hiss;
    exR += res + hiss;
    if (this.shadowAmt > 0) {
      exL = this.shadowL.process(exL);
      exR = this.shadowR.process(exR);
    }

    // ── intake ──
    let suction = 0;
    for (let c = 0; c < this.cyl; c++) {
      if (!this.inOn[c]) continue;
      const x = this.inPsi[c] / INTAKE_DURATION;
      if (x >= 1) {
        this.inOn[c] = 0;
        continue;
      }
      if (x >= 0) suction += this.inAmp[c] * table(INTAKE, x);
      this.inPsi[c] += dTheta;
    }
    const it = p.intake;
    const b = this.bank;
    const open = 0.18 + 0.82 * thr;
    let intake = bandpass(b, R_HELM, suction) * 2.2 + (this.q.intakeFormants > 1 ? bandpass(b, R_RUNNER, suction) * 0.9 : 0);
    intake *= it.gain * open;
    const roarEnv = this.roarEnv.process(suction);
    // Without ignition (quickshifter / limiter cut) the engine still pumps air, but the load-driven roar sags.
    const roarLevel = it.roar * Math.pow(thr, 1.4) * Math.pow(Math.min(1.1, rpmFrac), 1.1) * (0.35 + roarEnv) * (this.cutSamples > 0 ? 0.5 : 1);
    if (roarLevel > 1e-4) {
      const w = this.pink.next();
      intake += (bandpass(b, R_ROAR_A, w) * 0.2 + bandpass(b, R_ROAR_B, w) * 0.04) * roarLevel;
    }
    const sp = this.speed;
    if (it.ramAir > 0 && sp > 5) intake += bandpass(b, R_RAM, this.pink.next()) * it.ramAir * Math.min(2.2, (sp / 70) * (sp / 70)) * 0.35;
    intake = this.intakeHp.process(intake);

    // ── mechanical ──
    let mech = 0;
    const m = p.mech;
    const ti = this.tickImp;
    const di = this.desmoImp;
    this.tickImp = 0;
    this.desmoImp = 0;
    if (this.q.ticks) {
      mech += bandpass(b, R_TICK_A, ti) * 1.1 + bandpass(b, R_TICK_B, ti) * 0.7;
      if (m.desmo > 0) mech += bandpass(b, R_DESMO, di) * 1.4;
    }
    const cl = this.clutchImp;
    this.clutchImp = 0;
    if (m.clutchRattle > 0) mech += (bandpass(b, R_CLUTCH, cl) + bandpass(b, R_CLUTCH + 1, cl) * 0.8 + bandpass(b, R_CLUTCH + 2, cl) * 0.6) * 1.6;
    if (this.q.whines && rpm > 50) {
      if (m.camWhine > 0) {
        this.phCam += ((rpm / 120) * m.camTeeth) / isr;
        if (this.phCam > 1e6) this.phCam -= 1e6;
        mech += sinCycles(this.phCam) * m.camWhine * Math.pow(rpmFrac, 1.5) * 0.012;
      }
      if (m.gearWhine > 0) {
        this.phGear += ((rpm / 60) * m.gearTeeth) / isr;
        if (this.phGear > 1e6) this.phGear -= 1e6;
        mech += (sinCycles(this.phGear) + 0.3 * sinCycles(this.phGear * 2)) * m.gearWhine * rpmFrac * (0.3 + 0.7 * load) * 0.012;
      }
    }
    // Final drive (depends on road speed, not rpm).
    if (sp > 0.5 && m.driveWhine > 0) {
      let f = 0;
      if (m.drive === 'chain') f = sp / 0.015875;
      else if (m.drive === 'shaft') f = (sp / (2 * Math.PI * 0.32)) * 33;
      else if (m.drive === 'cvt') f = (rpm / 60) * 6.5;
      const lvl = m.driveWhine * Math.min(1.6, sp / 35) * (0.4 + 0.6 * load);
      if (f > 0 && f < isr * 0.45) {
        this.phDrive += f / isr;
        if (this.phDrive > 1e6) this.phDrive -= 1e6;
        mech += (sinCycles(this.phDrive) + 0.35 * sinCycles(this.phDrive * 2)) * lvl * 0.01;
      }
      // Chain slap / belt whir.
      mech += bandpass(b, R_DRIVE, rng.white()) * lvl * (m.drive === 'chain' ? 0.03 : 0.018);
    }
    // Starter motor: commutator whine + reduction gears, dragged down by compression.
    const sTarget = this.starter ? 1 : 0;
    this.starterGain += (sTarget - this.starterGain) * (this.starter ? 0.002 : 0.0008);
    if (this.starterGain > 1e-4) {
      const drag = 1 + 0.18 * speedMod * 60 * 0.05;
      this.phStarter += (m.starterHz * clampN(drag, 0.7, 1.2)) / isr;
      if (this.phStarter > 1e6) this.phStarter -= 1e6;
      const s = this.phStarter;
      const motor = sinCycles(s) + 0.5 * sinCycles(s * 2) + 0.3 * sinCycles(s * 3) + 0.15 * sinCycles(s * 0.31) + 0.25 * rng.white();
      mech += motor * this.starterGain * 0.06;
    }
    // Engine block / frame modes excited by each combustion.
    const bi = this.bodyImp;
    this.bodyImp = 0;
    let body = 0;
    for (let i = 0; i < this.bodyCount; i++) body += bandpass(b, R_BODY + i, bi) * p.body[i].gain;
    mech = this.mechLp.process(mech) + body;

    // ── supercharger ──
    if (p.charger) {
      const ch = p.charger;
      const boost = clampN(Math.pow(rpmFrac, 1.7) * (0.25 + 0.75 * load), 0, 1.2);
      this.phCharger += ((rpm / 60) * ch.ratio) / isr;
      if (this.phCharger > 1e6) this.phCharger -= 1e6;
      const ph = this.phCharger;
      let whine = sinCycles(ph) * 0.5 + sinCycles(ph * 2) * 0.32;
      const bladeHz = (rpm / 60) * ch.ratio * ch.blades;
      if (bladeHz < isr * 0.45) whine += sinCycles(ph * ch.blades) * 0.12;
      intake += whine * ch.whine * boost * 0.14 + bandpass(b, R_CHG_HISS, rng.white()) * boost * ch.whine * 0.1;
      // Surge chirp when the throttle snaps shut at boost.
      if (thr > this.thrPeak) this.thrPeak = thr;
      else this.thrPeak -= (this.thrPeak - thr) * 0.0004;
      if (this.thrPeak > 0.55 && thr < 0.12 && boost > 0.3 && this.bovEnv < 0.05) {
        this.bovEnv = Math.min(1, boost);
        this.thrPeak = thr;
      }
      if (this.bovEnv > 1e-4) {
        this.phBov += 21 / isr;
        const flutter = 0.55 + 0.45 * sinCycles(this.phBov);
        intake += bandpass(b, R_BOV, rng.white()) * this.bovEnv * flutter * ch.blowoff * 0.55;
        this.bovEnv *= 1 - 7 / isr;
      }
    }

    // ── mix ──
    const inMix = intake * this.gIn;
    const mechMix = mech * this.gMech;
    let l = exL * this.gEx + inMix * 0.92 + mechMix;
    let r = exR * this.gEx + inMix * 1.0 + mechMix * 0.95;
    // Perceptual dynamics: a real idle is ~20 dB under full throttle, which is too quiet to carry a game.
    // Lift the bottom of the range (idle and light coasting) so the engine is always present.
    const lift = (1 + 1.7 * clamp01(1 - (rpm - p.idle) / (p.idle * 2.5))) * (1 + 0.35 * (1 - clamp01(thr / 0.1)));
    l = this.eqHighL.process(this.eqLowL.process(this.dcL.process(l * lift))) * this.outGain;
    r = this.eqHighR.process(this.eqLowR.process(this.dcR.process(r * lift))) * this.outGain;
    if (this.measure) {
      this.sL = l;
      this.sR = r;
    } else {
      this.sL = softClip(l);
      this.sR = softClip(r);
    }
  }

  /** Exhaust port pressure of cylinder c for this sample. */
  private exhaustSample(c: number, dTheta: number): number {
    if (!this.exOn[c]) return 0;
    const psi = this.exPsi[c];
    const x = psi / this.exDur[c];
    this.exPsi[c] = psi + dTheta;
    if (x >= 1) {
      this.exOn[c] = 0;
      return 0;
    }
    if (x < 0) return 0;
    // Blowdown spike: time-domain (fixed milliseconds), so low-rpm engines stay crisp and
    // high-rpm engines get their tight "crack". Two multiplicative envelopes, no exp() per sample.
    const sEnv = this.exSpikeEnv[c];
    const rEnv = this.exRiseEnv[c];
    this.exSpikeEnv[c] = sEnv * this.exSpikeDecay[c];
    this.exRiseEnv[c] = rEnv * this.riseDecay;
    const spike = this.exSpike[c] * sEnv * (1 - rEnv);
    return this.exAmp[c] * (table(HUMP, x) + spike) + this.exRasp[c] * table(RASP, x) * this.pink.next();
  }

  /** Advance the crank and dispatch every valve/firing event crossed. */
  private advance(d: number, rpm: number, thr: number, load: number, rpmFrac: number): void {
    let theta = this.theta + d;
    const nEv = this.evAngle.length;
    for (let guard = 0; guard < 64; guard++) {
      if (this.evIdx < nEv && this.evAngle[this.evIdx] <= theta) {
        const idx = this.evIdx++;
        this.event(this.evType[idx], this.evCyl[idx], theta - this.evAngle[idx], rpm, thr, load, rpmFrac);
        continue;
      }
      if (theta >= 720) {
        theta -= 720;
        this.evIdx = 0;
        continue;
      }
      break;
    }
    this.theta = theta;
  }

  private event(type: number, c: number, late: number, rpm: number, thr: number, load: number, rpmFrac: number): void {
    const p = this.params;
    const rng = this.rng;
    switch (type) {
      case EV_FIRE: {
        if (this.logFires) this.fireLog.push(p.firing[c]);
        const idleish = clamp01(1 - (rpm - p.idle) / (p.idle * 1.5));
        const cutting = this.cutSamples > 0 || this.limiterHold;
        let amp: number;
        let pop = 0;
        if (rpm < 60) {
          amp = 0;
        } else if (!this.ignition || this.starter) {
          // Cranking or switched off: compression is simply released through the exhaust.
          amp = 0.07;
        } else if (cutting) {
          amp = 0.09;
          if (rpmFrac > 0.5 && rng.next() < p.crackle * 0.1 * this.crackleScale) {
            pop = 1.2 + rng.next();
            this.cutPopCount++;
          }
        } else if (this.fuelCut) {
          amp = 0.1 + 0.04 * thr;
          // Unburnt mixture lighting off in the hot header: overrun burble.
          const hot = clamp01((rpmFrac - 0.22) / 0.45);
          const fresh = 0.3 + 0.7 * Math.exp(-this.overrunT / 1.4);
          if (rng.next() < p.crackle * this.crackleScale * 0.075 * hot * fresh) {
            pop = 1.3 + 1.6 * rng.next();
            if (rng.next() < p.backfire * 0.12) pop = 4 + rng.next() * 2;
            this.popCount++;
          }
        } else {
          // Real combustion: strength follows load; idle is weak and irregular.
          const strength = Math.max(0.3 + 0.7 * Math.pow(load, 0.75), 0.38 * (0.6 + 0.4 * idleish));
          const cov = p.roughness * (0.05 + 0.12 * idleish + 0.05 * (1 - load));
          amp = strength * (1 + cov * rng.gauss());
          if (p.idleLope > 0 && rng.next() < p.idleLope * idleish * 0.18) amp *= 0.35 + 0.4 * rng.next();
          if (this.relight && p.crackle > 0.35 && rng.next() < p.crackle * 0.35 * this.crackleScale) {
            pop = 1.1 + rng.next();
            this.cutPopCount++;
          }
          this.relight = false;
        }
        if (this.pendingPop > 0 && rpm > 200) {
          pop = Math.max(pop, this.pendingPop);
          this.pendingPop = 0;
          this.popCount++;
        }
        this.combAmp[c] = Math.max(0, amp);
        this.combPop[c] = pop;
        // Combustion knocks the block and (for big singles/twins) the frame.
        this.bodyImp += amp * this.sizeScale * (0.6 + 0.4 * load);
        // Clutch basket rattles on each firing impulse at idle with no load.
        const m = p.mech;
        if (m.clutchRattle > 0 && rpm < p.idle * 2.4 && thr < 0.25) this.clutchImp += m.clutchRattle * (0.3 + 0.7 * rng.next()) * 0.6;
        break;
      }
      case EV_EVO: {
        const amp = this.combAmp[c];
        const pop = this.combPop[c];
        // Cycle-to-cycle timing scatter (always a small delay); afterburn pops light late.
        const delay = Math.abs(rng.gauss()) * p.roughness * 3 + (pop > 0 ? 30 * rng.next() : 0);
        this.exPsi[c] = late - delay;
        const tauS = this.spikeTau;
        if (pop > 0) {
          // A pop is a sharp explosion in the header: high amplitude, very noisy, short.
          this.exAmp[c] = pop * 1.1 * this.sizeScale;
          this.exRasp[c] = pop * 0.9 * this.sizeScale;
          this.exSpike[c] = 3.2;
          this.exDur[c] = p.exhDuration * 0.55;
          this.exSpikeDecay[c] = Math.exp(-1 / (this.isr * tauS * 0.7));
        } else {
          const loadSharp = clamp01(p.blowdown * (0.35 + 0.65 * Math.min(1, amp / 0.9)));
          this.exAmp[c] = amp * this.sizeScale;
          this.exRasp[c] = amp * this.sizeScale * p.rasp * (0.25 + 0.75 * load) * 0.28;
          this.exSpike[c] = 0.25 + 3.4 * loadSharp;
          this.exDur[c] = p.exhDuration;
          this.exSpikeDecay[c] = Math.exp(-1 / (this.isr * tauS * (0.85 + 0.3 * rng.next())));
        }
        this.exSpikeEnv[c] = 1;
        this.exRiseEnv[c] = 1;
        this.exOn[c] = 1;
        break;
      }
      case EV_IVO: {
        // Airflow through the throttle bodies: suction pulse level follows throttle opening.
        const flow = rpm > 60 ? (0.12 + 0.88 * thr) * (0.5 + 0.5 * Math.min(1, rpmFrac * 1.4)) : 0;
        this.inAmp[c] = flow * this.sizeScale * (1 + p.roughness * 0.1 * rng.gauss());
        this.inPsi[c] = late;
        this.inOn[c] = 1;
        break;
      }
      case EV_EVC:
      case EV_IVC: {
        const m = p.mech;
        if (rpm > 60 && (m.tick > 0 || m.desmo > 0)) {
          const lvl = (0.35 + 0.65 * rpmFrac) * (0.7 + 0.6 * rng.next());
          this.tickImp += m.tick * lvl;
          if (m.desmo > 0) this.desmoImp += m.desmo * lvl * (0.6 + 0.8 * rng.next());
        }
        break;
      }
    }
  }
}

/** Small deterministic string hash for seeding per-bike randomness. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
