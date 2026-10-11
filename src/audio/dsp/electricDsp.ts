import type { EngineControls, EngineEvent, EngineSynthesizer } from './engineDsp';
import { hashString } from './engineDsp';
import type { EngineMix, EngineQuality, EngineVoiceParams } from './params';
import { FIRST_PERSON_MIX } from './params';
import { BQ_STRIDE, HighPass1, LowPass1, Noise, PinkNoise, bandpass, clamp01, clampN, dbToLin, flushBank, onePoleCoef, setBandpass, sinCycles, softClip } from './util';

const R_AIR = 0;
const R_BELT = 1;
const R_GEARBOX = 2;
const R_COUNT = 3;

/**
 * Electric drivetrain (LiveWire One style): no combustion periodicity at all.
 * What you hear is the permanent-magnet motor's torque-ripple orders, the
 * primary bevel gear whine, the inverter's PWM carrier with its sidebands,
 * cooling-air hiss and the belt final drive.
 */
export class ElectricDSP implements EngineSynthesizer {
  readonly params: EngineVoiceParams;
  readonly popCount = 0;
  readonly cutPopCount = 0;
  private readonly sr: number;
  private readonly rng: Noise;
  private readonly pink: PinkNoise;
  private readonly bank = new Float64Array(R_COUNT * BQ_STRIDE);
  private tRpm = 0;
  private tThr = 0;
  private tLoad = 0;
  private tSpeed = 0;
  private rpm = 0;
  private thr = 0;
  private load = 0;
  private speed = 0;
  private readonly k: number;
  private readonly kSlow: number;
  private ph = new Float64Array(8);
  private on = true;
  private wake = 0;
  private gEx = 1;
  private gMech = 1;
  private width = 0.5;
  private outGain: number;
  private readonly measure: boolean;
  private readonly shadow: LowPass1;
  private readonly dcL: HighPass1;
  private readonly dcR: HighPass1;
  private readonly lfo: LowPass1;
  private sL = 0;
  private sR = 0;
  private readonly rich: boolean;

  constructor(params: EngineVoiceParams, sampleRate: number, quality: EngineQuality = 'high', opts: { seed?: number; measure?: boolean } = {}) {
    this.params = params;
    this.sr = sampleRate;
    this.rng = new Noise((opts.seed ?? 99) ^ hashString(params.id));
    this.pink = new PinkNoise(this.rng);
    this.k = onePoleCoef(25, sampleRate);
    this.kSlow = onePoleCoef(4, sampleRate);
    this.measure = opts.measure ?? false;
    this.outGain = this.measure ? 1 : params.calib * dbToLin(params.loudness);
    this.shadow = new LowPass1(14000, sampleRate);
    this.dcL = new HighPass1(20, sampleRate);
    this.dcR = new HighPass1(20, sampleRate);
    this.lfo = new LowPass1(3, sampleRate);
    this.rich = quality !== 'low';
    setBandpass(this.bank, R_AIR, 5200, 0.7, sampleRate);
    setBandpass(this.bank, R_BELT, 700, 0.9, sampleRate);
    setBandpass(this.bank, R_GEARBOX, 1800, 3, sampleRate);
    this.setMix(FIRST_PERSON_MIX, 0);
  }

  setControls(c: Readonly<EngineControls>): void {
    this.tRpm = Math.max(0, Number.isFinite(c.rpm) ? c.rpm : 0);
    this.tThr = clamp01(Number.isFinite(c.throttle) ? c.throttle : 0);
    this.tLoad = clamp01(Number.isFinite(c.load) ? c.load : 0);
    this.tSpeed = Math.max(0, Number.isFinite(c.speed) ? c.speed : 0);
  }

  snapControls(): void {
    this.rpm = this.tRpm;
    this.thr = this.tThr;
    this.load = this.tLoad;
    this.speed = this.tSpeed;
  }

  setStarter(on: boolean): void {
    // "Starting" an electric bike just arms the inverter.
    if (on) this.wake = 1;
  }

  setIgnition(on: boolean): void {
    this.on = on;
  }

  setCrackleScale(): void {
    /* no exhaust */
  }

  setMix(mix: Readonly<EngineMix>, intakeBalance: number): void {
    // The motor sits where the engine would; treat it as the "mechanical" source.
    this.gEx = Math.max(mix.exhaust, mix.intake) * Math.min(1, 1 + Math.abs(intakeBalance) * 0);
    this.gMech = mix.mech;
    this.width = mix.width;
    this.shadow.set(16000 - 8000 * clamp01(mix.rearShadow), this.sr);
  }

  trigger(_e: EngineEvent): void {
    /* no ignition events on an electric drivetrain */
  }

  process(left: Float32Array, right: Float32Array, offset: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.tick();
      left[offset + i] = this.sL;
      right[offset + i] = this.sR;
    }
    flushBank(this.bank);
  }

  stateArrays(): ArrayLike<number>[] {
    return [this.bank, this.ph];
  }

  private osc(i: number, hz: number): number {
    const sr = this.sr;
    if (hz <= 0 || hz >= sr * 0.45) {
      return 0;
    }
    let ph = this.ph[i] + hz / sr;
    if (ph > 1e6) ph -= 1e6;
    this.ph[i] = ph;
    return sinCycles(ph);
  }

  private tick(): void {
    const p = this.params;
    const e = p.electric!;
    this.rpm += this.k * (this.tRpm - this.rpm);
    this.thr += this.k * (this.tThr - this.thr);
    this.load += this.k * (this.tLoad - this.load);
    this.speed += this.kSlow * (this.tSpeed - this.speed);
    const rpm = this.on ? this.rpm : this.rpm * 0.6;
    const frac = clampN(rpm / p.redline, 0, 1.1);
    const fMech = rpm / 60;
    const fe = fMech * e.polePairs;
    // Motor current ~ torque demand; regen (closed throttle while rolling) still draws current.
    const regen = this.thr < 0.05 && frac > 0.06 ? 0.35 : 0;
    const current = this.on ? Math.max(this.load, regen) : 0;
    const wob = 1 + 0.004 * this.lfo.process(this.rng.white());

    let motor = 0;
    if (rpm > 5) {
      // Torque-ripple orders of the PMSM.
      motor += this.osc(0, fe * 6 * wob) * (0.25 + 0.75 * current) * 0.35;
      motor += this.osc(1, fe * 12 * wob) * (0.15 + 0.6 * current) * 0.14;
      motor += this.osc(2, fe * 2) * 0.06;
      // Primary bevel gear: the signature rising "jet" whine.
      const gear = fMech * e.gearTeeth;
      motor += (this.osc(3, gear) + 0.45 * this.osc(4, gear * 2) + (this.rich ? 0.2 * this.osc(5, gear * 3) : 0)) * e.whine * (0.3 + 0.7 * current) * (0.35 + 0.65 * frac) * 0.55;
      motor += bandpass(this.bank, R_GEARBOX, this.rng.white()) * frac * 0.05;
    }
    // Inverter PWM carrier and its sidebands at fc ± 2·fe.
    const armed = this.on ? Math.max(0.15, this.wake) : 0;
    this.wake *= 0.99997;
    let inv = 0;
    if (armed > 0) {
      const fc = e.inverterHz;
      const lvl = (0.04 + 0.5 * current) * armed;
      inv = this.osc(6, fc) * lvl * 0.12;
      if (this.rich && rpm > 5) inv += this.osc(7, fc + fe * 2) * lvl * 0.1;
    }
    // Cooling air + belt drive with road speed.
    const sp = this.speed;
    const air = bandpass(this.bank, R_AIR, this.pink.next()) * Math.min(1.5, sp / 40) * 0.06;
    const belt = bandpass(this.bank, R_BELT, this.rng.white()) * Math.min(1.5, sp / 35) * p.mech.driveWhine * 0.05;
    let mono = (motor + inv) * this.gEx + (air + belt) * this.gMech;
    mono = this.shadow.process(mono);
    const l = this.dcL.process(mono * (1 - this.width * 0.08)) * this.outGain;
    const r = this.dcR.process(mono * (1 + this.width * 0.08)) * this.outGain;
    this.sL = this.measure ? l : softClip(l);
    this.sR = this.measure ? r : softClip(r);
  }
}
