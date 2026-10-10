import type { BikeSpec } from '../data/bikes';
import type { EnvDef } from '../data/environments';
import type { VehicleKind } from '../data/vehicles';
import { clamp } from '../core/math';
import type { AudioEngine } from './audioEngine';
import type { ReverbKind } from './dsp/impulse';
import type { VehicleEngineType } from './dsp/params';
import type { HornKind } from './dsp/sfxDsp';
import type { TrafficMsg } from './dsp/trafficHost';
import { WORLD_DEFAULTS, type WorldControls } from './dsp/worldDsp';
import { createTrafficDsp, createWorldDsp, type DspNode, type WorldMsg } from './dspNodes';
import { EngineSound, type EngineAudioState } from './engineSound';
import { sfxBankFor, type SfxBank } from './sfxBank';

export interface AudioCar {
  id: number;
  heavy: boolean;
  /** Vehicle model (selects engine type and horn). Optional: falls back to `heavy`. */
  kind?: VehicleKind;
  /** Listener space (metres): x right, y up, z backwards (three.js camera convention). */
  x: number;
  y: number;
  z: number;
  /** Radial velocity, positive = approaching (m/s). */
  vRad: number;
  speed: number;
  /** 0..1 brake-light intensity (air-brake hiss on heavy vehicles). */
  braking?: number;
}

/** What the tyres are rolling on. */
export type SurfaceKind = 'asphalt' | 'rumble' | 'gravel' | 'snow';

export interface AudioFrame {
  engine: EngineAudioState;
  speed: number;
  helmet: boolean;
  scrape: number;
  wheelspin: number;
  braking: number;
  wet: boolean;
  cars: AudioCar[];
  /** Surface under the wheels (default asphalt). */
  surface?: SurfaceKind;
  /** Acoustic zone override, e.g. 'tunnel' (default: from the map). */
  zone?: ReverbKind;
  /** Lean angle, −1..1. */
  lean?: number;
  /** The bike is down and sliding. */
  crashed?: boolean;
}

interface Slot {
  carId: number;
  panner: PannerNode;
  out: GainNode;
  heavy: boolean;
}

const SPEED_OF_SOUND = 343;
const MAX_SLOTS = 8;

const VOICE_OF_KIND: Record<VehicleKind, VehicleEngineType> = {
  sedan: 'car',
  hatch: 'car',
  suv: 'car',
  taxi: 'car',
  police: 'sport',
  pickup: 'van',
  van: 'van',
  truck: 'diesel',
  semi: 'diesel',
  bus: 'bus',
};

const HORN_OF_KIND: Record<VehicleKind, HornKind> = {
  sedan: 'car',
  hatch: 'car',
  suv: 'car',
  taxi: 'taxi',
  police: 'car',
  pickup: 'car',
  van: 'car',
  truck: 'truck',
  semi: 'truck',
  bus: 'bus',
};

/** Map name embedded in a resolved environment id (`map:time:weather`), if any. */
function mapOf(env: EnvDef): string {
  const i = env.id.indexOf(':');
  return i > 0 ? env.id.slice(0, i) : '';
}

/** Default acoustic environment of a run. */
export function zoneForEnv(env: EnvDef): ReverbKind {
  switch (mapOf(env)) {
    case 'city':
      return 'canyon';
    case 'industrial':
      return 'industrial';
    case 'suburb':
      return 'street';
    case 'forest':
    case 'snow':
      return 'forest';
    case 'highway':
    case 'desert':
    case 'coast':
      return 'open';
    default:
      return env.scenery.buildings ? 'canyon' : env.scenery.trees === 'pine' ? 'forest' : 'open';
  }
}

/** Rough expansion-joint density: concrete highways thump, city streets and snow much less. */
function jointsFor(env: EnvDef): number {
  switch (mapOf(env)) {
    case 'highway':
    case 'coast':
      return 0.8;
    case 'desert':
    case 'industrial':
      return 0.55;
    case 'city':
    case 'suburb':
      return 0.3;
    default:
      return 0.4;
  }
}

/** Surface classification from the lateral position (`d`) relative to the paved half width. */
export function surfaceAt(d: number, halfWidth: number, snowy: boolean): SurfaceKind {
  const a = Math.abs(d);
  if (a > halfWidth) return snowy ? 'snow' : 'gravel';
  if (a > halfWidth - 0.55) return 'rumble';
  return 'asphalt';
}

/** In-run soundscape: player engine, wind, tyres, traffic, horns, impacts and ambience. */
export class GameAudio {
  private engineSound: EngineSound | null = null;
  private world: DspNode<WorldMsg> | null = null;
  private traffic: DspNode<TrafficMsg> | null = null;
  private slots: Slot[] = [];
  private bed: { nodes: AudioScheduledSourceNode[]; gain: GainNode } | null = null;
  private env: EnvDef | null = null;
  private active = false;
  private gen = 0;
  private bank: SfxBank | null = null;
  private cityTimer = 3;
  private zone: ReverbKind = 'open';
  private readonly wc: Partial<WorldControls> = { ...WORLD_DEFAULTS };
  private readonly near: AudioCar[] = [];
  private offConfig: (() => void) | null = null;
  private crashTime = 0;

  constructor(private engine: AudioEngine) {}

  get ready(): boolean {
    return this.engine.ready;
  }

  get engineVoice(): EngineSound | null {
    return this.engineSound;
  }

  begin(spec: BikeSpec, env: EnvDef, withStarter: boolean): void {
    this.end();
    const ctx = this.engine.ctx;
    if (!ctx) return;
    this.env = env;
    this.active = true;
    this.crashTime = 0;
    this.engineSound = new EngineSound(this.engine, spec, this.engine.engineBus, 'rider');
    this.engineSound.start(withStarter);
    this.zone = zoneForEnv(env);
    this.engine.reverb.setZone(this.zone, true);
    this.bank = sfxBankFor(ctx);
    this.bank.warm();
    const gen = ++this.gen;
    void this.engine.whenSettled().then(() => {
      if (gen === this.gen && this.active) this.buildSpatial(env);
    });
    this.offConfig = this.engine.onConfig(() => this.applyConfig());
  }

  private buildSpatial(env: EnvDef): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    this.world = createWorldDsp(ctx, this.engine);
    this.world.connect(this.engine.worldBus);
    this.world.post({ t: 'ctl', c: this.wc });
    this.world.post({ t: 'snap' });
    this.traffic = createTrafficDsp(ctx, this.engine, MAX_SLOTS);
    for (let i = 0; i < MAX_SLOTS; i++) {
      const out = ctx.createGain();
      out.gain.value = 1;
      const panner = ctx.createPanner();
      panner.panningModel = this.engine.cfg.spatial === 'hrtf' ? 'HRTF' : 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 7;
      panner.rolloffFactor = 1.15;
      panner.maxDistance = 400;
      this.traffic.connect(out, i);
      out.connect(panner).connect(this.engine.trafficBus);
      this.slots.push({ carId: -1, panner, out, heavy: false });
    }
    this.buildBed(env);
  }

  private applyConfig(): void {
    const model = this.engine.cfg.spatial === 'hrtf' ? 'HRTF' : 'equalpower';
    for (const s of this.slots) if (s.panner.panningModel !== model) s.panner.panningModel = model;
  }

  /** Quiet noise bed per region (leaves, desert wind, city hum). Rain is part of the world DSP. */
  private buildBed(env: EnvDef): void {
    const ctx = this.engine.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.engine.ambienceBus);
    const nodes: AudioScheduledSourceNode[] = [];
    const src = ctx.createBufferSource();
    src.buffer = this.engine.pinkBuffer();
    src.loop = true;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    if (env.ambience === 'city') {
      f.type = 'lowpass';
      f.frequency.value = 220;
      gain.gain.setTargetAtTime(0.35, ctx.currentTime, 0.8);
    } else {
      f.type = 'bandpass';
      f.frequency.value = env.ambience === 'desert' ? 500 : 900;
      f.Q.value = 0.4;
      gain.gain.setTargetAtTime(env.ambience === 'rain' ? 0.04 : 0.12, ctx.currentTime, 0.8);
    }
    src.connect(f).connect(gain);
    src.start(0, Math.random() * 2);
    nodes.push(src);
    this.bed = { nodes, gain };
  }

  // ───────────────────────────── per frame ─────────────────────────────
  frame(dt: number, f: AudioFrame): void {
    if (!this.active || !this.engine.ctx) return;
    const env = this.env;
    if (f.engine.speed === undefined) f.engine.speed = f.speed;
    this.engineSound?.update(dt, f.engine);
    if (!env) return;

    this.crashTime = f.crashed ? this.crashTime + dt : 0;
    const gust = this.updateTraffic(f.cars, f.speed);
    this.updateWorld(f, env, gust);
    this.updateZone(f.zone);
    this.updateAmbience(dt, env);
  }

  private updateWorld(f: AudioFrame, env: EnvDef, gust: number): void {
    if (!this.world) return;
    const c = this.wc;
    const cfg = this.engine.cfg;
    const surface = f.surface ?? 'asphalt';
    const snowy = env.id.endsWith(':snow') || surface === 'snow';
    c.speed = f.speed;
    c.helmet = cfg.helmet ? 1 : 0.1;
    c.wet = env.wet && !snowy ? (env.rain ? 1 : 0.7) : 0;
    c.rumble = surface === 'rumble' ? 1 : 0;
    c.gravel = surface === 'gravel' ? 1 : 0;
    c.snow = snowy ? (surface === 'snow' ? 1 : 0.55) : 0;
    c.brake = f.braking;
    c.wheelspin = f.wheelspin;
    c.lean = Math.abs(f.lean ?? 0);
    c.scrape = f.scrape;
    // Sliding along the road after a crash: loudness follows the remaining speed, fades as the bike stops.
    c.slide = f.crashed ? clamp((f.speed - 1) / 18, 0, 1) : 0;
    c.rain = env.rain ? 1 : 0;
    c.gust = gust;
    c.joints = jointsFor(env);
    c.windGain = cfg.wind;
    c.tyreGain = cfg.tyres;
    c.rainGain = cfg.ambience;
    this.world.post({ t: 'ctl', c });
  }

  private updateZone(override?: ReverbKind): void {
    const want = override ?? zoneForEnv(this.env!);
    if (want !== this.zone) {
      this.zone = want;
      this.engine.reverb.setZone(want);
    }
  }

  /** Assign the nearest vehicles to voice slots; returns the turbulence (0..1) of passing heavy vehicles. */
  private updateTraffic(cars: AudioCar[], speed: number): number {
    const traffic = this.traffic;
    const ctx = this.engine.ctx!;
    if (!traffic || this.slots.length === 0) return 0;
    const cfg = this.engine.cfg;
    const t = ctx.currentTime;
    const n = Math.min(cfg.trafficVoices, MAX_SLOTS);
    // Insertion-select the n nearest cars (no per-frame sort/allocation).
    const near = this.near;
    near.length = 0;
    const d2 = (c: AudioCar): number => c.x * c.x + c.z * c.z;
    for (const c of cars) {
      const dd = d2(c);
      if (near.length < n) near.push(c);
      else if (dd < d2(near[near.length - 1])) near[near.length - 1] = c;
      else continue;
      for (let i = near.length - 1; i > 0 && d2(near[i]) < d2(near[i - 1]); i--) {
        const tmp = near[i];
        near[i] = near[i - 1];
        near[i - 1] = tmp;
      }
    }
    // Free slots whose vehicle left the set.
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.carId === -1) continue;
      let keep = false;
      for (const c of near) {
        if (c.id === s.carId) {
          keep = true;
          break;
        }
      }
      if (!keep) {
        s.carId = -1;
        traffic.post({ t: 'cfg', i, type: 'car', seed: 1, on: false });
      }
    }
    let gust = 0;
    for (const c of near) {
      let idx = this.slots.findIndex((s) => s.carId === c.id);
      if (idx < 0) {
        idx = this.slots.findIndex((s) => s.carId === -1);
        if (idx < 0) continue;
        const s = this.slots[idx];
        s.carId = c.id;
        s.heavy = c.heavy;
        const type: VehicleEngineType = c.kind ? VOICE_OF_KIND[c.kind] : c.heavy ? 'diesel' : 'car';
        traffic.post({ t: 'cfg', i: idx, type, seed: (c.id * 2654435761) >>> 0 || 1, on: true });
        s.panner.positionX.value = c.x;
        s.panner.positionY.value = c.y;
        s.panner.positionZ.value = c.z;
      }
      const s = this.slots[idx];
      const dist = Math.hypot(c.x, c.z);
      const raw = SPEED_OF_SOUND / Math.max(60, SPEED_OF_SOUND - clamp(c.vRad, -150, 150));
      const doppler = 1 + cfg.doppler * (raw - 1);
      const load = clamp(0.28 + c.speed / 60, 0, 0.9);
      traffic.post({ t: 'ctl', i: idx, speed: c.speed, load, doppler, dist, brake: c.braking ?? 0 });
      s.panner.positionX.setTargetAtTime(c.x, t, 0.03);
      s.panner.positionY.setTargetAtTime(c.y, t, 0.03);
      s.panner.positionZ.setTargetAtTime(c.z, t, 0.03);
      // Air pushed aside by a big vehicle going past: buffets the rider's helmet.
      const lateral = Math.abs(c.x);
      if (lateral < 7 && Math.abs(c.z) < 14) {
        const near01 = (1 - lateral / 7) * (1 - Math.abs(c.z) / 14);
        const mass = c.heavy ? 1 : 0.28;
        gust = Math.max(gust, near01 * mass * clamp((Math.abs(c.vRad) + speed * 0.3) / 35, 0.3, 1));
      }
    }
    return gust;
  }

  private updateAmbience(dt: number, env: EnvDef): void {
    if (env.ambience === 'city' && this.engine.cfg.hornSounds) {
      this.cityTimer -= dt;
      if (this.cityTimer <= 0) {
        this.cityTimer = 6 + Math.random() * 12;
        // Distant honk somewhere in the city.
        this.horn(0.05, Math.random() * 2 - 1, Math.random() < 0.3, Math.random() < 0.5 ? 'car' : 'taxi', true);
      }
    }
  }

  // ───────────────────────────── one-shots ─────────────────────────────
  /** Play a rendered buffer with optional position/pan, pitch, envelope and filtering. */
  private play(
    name: string,
    o: { dest?: AudioNode; at?: number; gain: number; rate?: number; pan?: number; dur?: number; release?: number; lowpass?: number; distant?: boolean },
  ): void {
    const ctx = this.engine.ctx;
    const buf = this.bank?.get(name);
    if (!ctx || !buf) return;
    const t0 = o.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, t0);
    let tail: AudioNode = src;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      src.connect(f);
      tail = f;
    }
    tail.connect(g);
    let last: AudioNode = g;
    if (o.pan !== undefined) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      g.connect(p);
      last = p;
    }
    last.connect(o.dest ?? this.engine.sfxBus);
    const rate = o.rate ?? 1;
    const play = o.dur !== undefined ? Math.min(o.dur, buf.duration / rate) : buf.duration / rate;
    if (o.dur !== undefined) {
      const rel = o.release ?? 0.06;
      g.gain.setValueAtTime(o.gain, t0 + Math.max(0, play - rel));
      g.gain.linearRampToValueAtTime(0.0001, t0 + play);
    }
    src.start(t0);
    src.stop(t0 + play + 0.05);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      last.disconnect();
    };
  }

  /** Thunder follows a lightning flash after a distance-dependent delay. */
  thunder(delay: number): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.active) return;
    const dist = clamp(delay / 6, 0, 1);
    this.play(`thunder${(Math.random() * 2) | 0}`, {
      dest: this.engine.ambienceBus,
      at: ctx.currentTime + Math.max(0, delay),
      gain: 0.95 - 0.35 * dist,
      pan: Math.random() * 1.2 - 0.6,
      lowpass: 3800 - 2600 * dist,
    });
  }

  /** A horn. `pan` −1..1, `heavy` = truck/bus voice unless `kind` says otherwise. */
  horn(gain: number, pan: number, heavy: boolean, kind?: VehicleKind | HornKind, distant = false): void {
    if (!this.engine.ctx || !this.engine.cfg.hornSounds) return;
    const k: HornKind = kind ? (kind in HORN_OF_KIND ? HORN_OF_KIND[kind as VehicleKind] : (kind as HornKind)) : heavy ? 'truck' : 'car';
    const dur = k === 'truck' ? 1.1 : k === 'bus' ? 0.85 : 0.5;
    this.play(`horn:${k}`, { gain: gain * 3.2, pan, dur: dur + Math.random() * 0.25, release: 0.07, rate: 0.985 + Math.random() * 0.03, lowpass: distant ? 1800 : undefined });
  }

  playerHorn(): void {
    if (!this.engine.ctx) return;
    this.play('horn:player', { gain: 0.3, dur: 0.38, release: 0.05, rate: 1 });
  }

  whoosh(side: -1 | 1, heavy: boolean, intensity: number): void {
    if (!this.engine.ctx || !this.engine.cfg.nearMiss) return;
    const name = heavy ? 'whooshH0' : `whooshL${(Math.random() * 2) | 0}`;
    this.play(name, { gain: (heavy ? 0.95 : 0.7) * clamp(intensity, 0.15, 1), pan: side * 0.85, rate: 0.9 + Math.random() * 0.2 });
  }

  land(impact: number): void {
    if (!this.engine.ctx) return;
    const k = clamp(impact, 0.1, 1);
    this.play('body1', { gain: 0.5 * k + 0.1, rate: 1.1, lowpass: 900 });
    this.play('plastic1', { at: this.engine.now + 0.01, gain: 0.12 * k, rate: 1.2 });
  }

  /**
   * Layered crash: metal crunch, plastic crack, glass (hard car impacts), the rider's body, then the
   * bike tumbling. The sliding scrape that follows is continuous (see `updateWorld`).
   */
  crash(intensity: number, kind: 'traffic' | 'barrier' | 'fall' = 'traffic'): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.bank) return;
    const k = clamp(intensity, 0.3, 1);
    const t = ctx.currentTime;
    const rate = 1.04 - 0.14 * k + Math.random() * 0.05;
    if (kind !== 'fall') this.play(`metal${(Math.random() * 3) | 0}`, { at: t, gain: 1.05 * k, rate });
    this.play(`plastic${(Math.random() * 2) | 0}`, { at: t + 0.015, gain: 0.8 * k, rate: 0.95 + Math.random() * 0.1 });
    if (kind === 'traffic' && k > 0.5) this.play(`glass${(Math.random() * 2) | 0}`, { at: t + 0.02, gain: 0.75 * k });
    this.play(`body${(Math.random() * 3) | 0}`, { at: t + 0.06 + 0.04 * Math.random(), gain: 0.95 * k });
    if (k > 0.35) this.play(`tumble${(Math.random() * 2) | 0}`, { at: t + 0.22, gain: 0.8 * k, rate: 0.95 + Math.random() * 0.1 });
    this.engineSound?.dispose();
    this.engineSound = null;
  }

  shift(quick: boolean, up: boolean): void {
    this.engineSound?.shift(quick, up);
  }

  limiter(): void {
    this.engineSound?.limiter();
  }

  overrun(): void {
    this.engineSound?.overrun();
  }

  /** Restart the engine sound after a free-ride respawn. */
  restartEngine(spec: BikeSpec): void {
    if (!this.engine.ctx) return;
    this.engineSound?.dispose();
    this.engineSound = new EngineSound(this.engine, spec, this.engine.engineBus, 'rider');
    this.engineSound.start(true);
  }

  end(): void {
    this.active = false;
    this.gen++;
    this.offConfig?.();
    this.offConfig = null;
    this.engineSound?.dispose();
    this.engineSound = null;
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const stopAt = ctx.currentTime + 0.3;
    this.world?.dispose();
    this.traffic?.dispose();
    this.world = this.traffic = null;
    for (const s of this.slots) {
      s.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      window.setTimeout(() => {
        s.out.disconnect();
        s.panner.disconnect();
      }, 400);
    }
    this.slots = [];
    if (this.bed) {
      this.bed.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      for (const n of this.bed.nodes) {
        try {
          n.stop(stopAt);
        } catch {
          /* already stopped */
        }
      }
      this.bed = null;
    }
  }
}

/** Menu / interface sounds. */
export class UiSounds {
  constructor(private engine: AudioEngine) {}
  click(): void {
    const e = this.engine;
    if (!e.ctx) return;
    e.tone(e.uiBus, { freq: 1250, freqEnd: 900, dur: 0.05, gain: 0.08, type: 'sine' });
  }
  hover(): void {
    const e = this.engine;
    if (!e.ctx) return;
    e.tone(e.uiBus, { freq: 1800, dur: 0.025, gain: 0.025, type: 'sine' });
  }
  coin(): void {
    const e = this.engine;
    if (!e.ctx) return;
    const t = e.ctx.currentTime;
    e.tone(e.uiBus, { at: t, freq: 988, dur: 0.12, gain: 0.12, type: 'square' });
    e.tone(e.uiBus, { at: t + 0.09, freq: 1319, dur: 0.35, gain: 0.12, type: 'square' });
  }
  error(): void {
    const e = this.engine;
    if (!e.ctx) return;
    e.tone(e.uiBus, { freq: 180, dur: 0.18, gain: 0.12, type: 'square' });
  }
  countdown(final: boolean): void {
    const e = this.engine;
    if (!e.ctx) return;
    e.tone(e.uiBus, { freq: final ? 1046 : 523, dur: final ? 0.6 : 0.22, gain: 0.16, type: 'triangle' });
  }
  checkpoint(): void {
    const e = this.engine;
    if (!e.ctx) return;
    const t = e.ctx.currentTime;
    [784, 988, 1175].forEach((f, i) => e.tone(e.uiBus, { at: t + i * 0.08, freq: f, dur: 0.3, gain: 0.12, type: 'triangle' }));
  }
  record(): void {
    const e = this.engine;
    if (!e.ctx) return;
    const t = e.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => e.tone(e.uiBus, { at: t + i * 0.11, freq: f, dur: 0.4, gain: 0.12, type: 'triangle' }));
  }
  buzzer(): void {
    const e = this.engine;
    if (!e.ctx) return;
    e.tone(e.uiBus, { freq: 140, dur: 0.8, gain: 0.15, type: 'sawtooth' });
  }
}
