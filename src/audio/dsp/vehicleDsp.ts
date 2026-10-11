import type { VehicleEngineType, VehicleVoiceParams } from './params';
import { BQ_STRIDE, HighPass1, LowPass1, Noise, PinkNoise, bandpass, clamp01, flushBank, onePoleCoef, setBandpass, sinCycles, softClip } from './util';

/** Typical voices for traffic, keyed by engine type. */
export const VEHICLE_VOICES: Record<VehicleEngineType, Omit<VehicleVoiceParams, 'seed'>> = {
  // Modern petrol hatch/sedan: 4 cylinders, catalytic converter + two silencers.
  car: { type: 'car', cylinders: 4, idle: 800, gearRpmPerMs: [150, 95, 68, 52, 43, 36], mufflerHz: 520, resonanceHz: 95, engineGain: 0.55, tyreGain: 1, clatter: 0, turbo: 0.1, aero: 0.15 },
  // Light diesel van / pickup: clattery 4-cylinder with a turbo, a little boomy body.
  van: { type: 'van', cylinders: 4, idle: 780, gearRpmPerMs: [165, 105, 74, 56, 46, 39], mufflerHz: 520, resonanceHz: 78, engineGain: 0.7, tyreGain: 1.15, clatter: 0.5, turbo: 0.35, aero: 0.35 },
  // Taxi/police sedans run harder.
  sport: { type: 'sport', cylinders: 6, idle: 750, gearRpmPerMs: [160, 105, 78, 60, 49, 41], mufflerHz: 900, resonanceHz: 120, engineGain: 0.8, tyreGain: 1.05, clatter: 0, turbo: 0, aero: 0.2 },
  // Diesel lorry: big straight-six, low revs, injector clatter and turbo whistle.
  diesel: { type: 'diesel', cylinders: 6, idle: 600, gearRpmPerMs: [210, 150, 110, 82, 64, 52, 44, 38], mufflerHz: 380, resonanceHz: 62, engineGain: 1, tyreGain: 1.5, clatter: 0.8, turbo: 0.6, aero: 0.9 },
  bus: { type: 'bus', cylinders: 6, idle: 620, gearRpmPerMs: [190, 120, 85, 64, 52, 44], mufflerHz: 340, resonanceHz: 70, engineGain: 0.85, tyreGain: 1.35, clatter: 0.55, turbo: 0.45, aero: 0.75 },
  moto: { type: 'moto', cylinders: 2, idle: 1200, gearRpmPerMs: [380, 270, 210, 175, 150, 135], mufflerHz: 1500, resonanceHz: 160, engineGain: 0.9, tyreGain: 0.5, clatter: 0, turbo: 0, aero: 0.05 },
};

const R_RES = 0;
const R_TYRE = 1;
const R_TYRE_HI = 2;
const R_CLATTER = 3;
const R_AERO = 4;
const R_COUNT = 5;

/**
 * Cheap traffic vehicle voice (mono, spatialised by a PannerNode outside).
 * On a highway what you hear from cars is mostly tyre roar; the engine is a
 * muffled pulse train whose pitch follows a simple gearbox model. Doppler is
 * applied as a frequency factor on every component.
 */
export class VehicleDSP {
  private p: VehicleVoiceParams;
  private readonly sr: number;
  private readonly rng: Noise;
  private readonly pink: PinkNoise;
  private readonly bank = new Float64Array(R_COUNT * BQ_STRIDE);
  private readonly lp: LowPass1;
  private readonly air: LowPass1;
  private readonly hp: HighPass1;
  private readonly roadLp: LowPass1;
  private gear = 0;
  private rpm = 800;
  private phase = 0;
  private turboPh = 0;
  private pulseAmp = 1;
  private lastPulse = 0;
  private clatterImp = 0;
  private speed = 0;
  private load = 0.3;
  private doppler = 1;
  private distance = 20;
  private brake = 0;
  private gain = 1;
  private readonly kCtl: number;
  private tSpeed = 0;
  private tLoad = 0.3;
  private tDoppler = 1;
  private blockCount = 0;
  private active = true;

  constructor(params: VehicleVoiceParams, sampleRate: number) {
    this.p = params;
    this.sr = sampleRate;
    this.rng = new Noise(params.seed * 2654435761);
    this.pink = new PinkNoise(this.rng);
    this.lp = new LowPass1(params.mufflerHz, sampleRate);
    this.air = new LowPass1(16000, sampleRate);
    this.hp = new HighPass1(30, sampleRate);
    this.roadLp = new LowPass1(2300, sampleRate);
    this.kCtl = onePoleCoef(6, sampleRate);
    this.configure(params);
  }

  configure(params: VehicleVoiceParams): void {
    this.p = params;
    this.lp.set(params.mufflerHz, this.sr);
    setBandpass(this.bank, R_CLATTER, 3100, 9, this.sr);
    this.rpm = params.idle;
    this.gear = 0;
    this.gain = 0;
    this.active = true;
  }

  setControls(speed: number, load: number, doppler: number, distance: number, brake: number): void {
    this.tSpeed = Math.max(0, speed);
    this.tLoad = clamp01(load);
    this.tDoppler = Math.max(0.5, Math.min(2, doppler));
    this.distance = Math.max(1, distance);
    this.brake = clamp01(brake);
  }

  process(out: Float32Array, offset: number, n: number): void {
    const p = this.p;
    const sr = this.sr;
    // Per-block parameter work (filters retuned with Doppler and speed).
    this.speed += (this.tSpeed - this.speed) * Math.min(1, this.kCtl * n * 4);
    this.load += (this.tLoad - this.load) * Math.min(1, this.kCtl * n);
    this.doppler += (this.tDoppler - this.doppler) * Math.min(1, this.kCtl * n * 6);
    const v = this.speed;
    const dop = this.doppler;
    // Gearbox with hysteresis.
    const ratios = p.gearRpmPerMs;
    const shiftUp = p.type === 'diesel' || p.type === 'bus' ? 1700 : p.type === 'moto' ? 7000 : 2900;
    let target = p.idle + ratios[this.gear] * v;
    if (target > shiftUp && this.gear < ratios.length - 1) this.gear++;
    else if (this.gear > 0 && p.idle + ratios[this.gear - 1] * v < shiftUp * 0.62) this.gear--;
    target = Math.max(p.idle, ratios[this.gear] * v);
    this.rpm += (target - this.rpm) * 0.08;
    const tyreHz = (430 + v * 14) * dop;
    setBandpass(this.bank, R_TYRE, Math.min(4000, tyreHz), 0.55, sr);
    setBandpass(this.bank, R_TYRE_HI, Math.min(9000, tyreHz * 4), 0.8, sr);
    setBandpass(this.bank, R_RES, p.resonanceHz * dop, 2.2, sr);
    setBandpass(this.bank, R_AERO, 160 * dop, 0.7, sr);
    this.air.set(Math.max(1500, 19000 / (1 + this.distance / 45)), sr);
    const pulseHz = ((this.rpm / 60) * p.cylinders) / 2;
    const tyreLvl = p.tyreGain * Math.pow(v / 25, 1.6) * 0.34;
    const aeroLvl = p.aero * (v / 25) * (v / 25) * 0.1;
    const engLvl = p.engineGain * (0.35 + 0.65 * this.load) * 0.3;
    const target01 = this.active ? 1 : 0;
    this.blockCount++;

    for (let i = 0; i < n; i++) {
      this.gain += (target01 - this.gain) * 0.0005;
      // Engine pulse train.
      this.phase += (pulseHz * dop) / sr;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.pulseAmp = 1 + (this.rng.next() - 0.5) * 0.25;
        this.lastPulse = 0;
        if (p.clatter > 0) this.clatterImp = p.clatter * (0.6 + 0.4 * this.rng.next());
      }
      const x = this.phase;
      const pulse = x < 0.55 ? Math.sin((Math.PI * x) / 0.55) * this.pulseAmp : 0;
      this.lastPulse++;
      let eng = this.lp.process(pulse + this.rng.white() * 0.15 * pulse) + bandpass(this.bank, R_RES, pulse) * 0.8;
      eng *= engLvl;
      if (p.clatter > 0) {
        eng += bandpass(this.bank, R_CLATTER, this.clatterImp) * 0.6 * engLvl;
        this.clatterImp = 0;
      }
      if (p.turbo > 0) {
        this.turboPh += ((2200 + 2600 * this.load) * dop) / sr;
        if (this.turboPh > 1e6) this.turboPh -= 1e6;
        eng += sinCycles(this.turboPh) * p.turbo * this.load * 0.02;
      }
      // Tyres and aerodynamic rumble.
      const pk = this.pink.next();
      // Road noise rolls off above ~2 kHz (tread rubber and the car body absorb the highs).
      let s = eng + this.roadLp.process(bandpass(this.bank, R_TYRE, pk) * tyreLvl + bandpass(this.bank, R_TYRE_HI, this.rng.white()) * tyreLvl * 0.4);
      if (aeroLvl > 1e-5) s += bandpass(this.bank, R_AERO, pk) * aeroLvl;
      // Air-brake hiss on heavy vehicles.
      if (this.brake > 0.5 && (p.type === 'diesel' || p.type === 'bus')) s += this.rng.white() * 0.015 * this.brake;
      s = this.air.process(this.hp.process(s));
      out[offset + i] = softClip(s * this.gain * 1.6) * 0.8;
    }
    flushBank(this.bank);
  }

  /** Fade the voice in/out (the slot may be reused for another vehicle once silent). */
  setActive(on: boolean): void {
    this.active = on;
  }

  get audible(): boolean {
    return this.active || this.gain > 0.002;
  }

  get currentRpm(): number {
    return this.rpm;
  }
}
