import type { BikeSpec } from '../data/bikes';
import type { EnvDef } from '../data/environments';
import { clamp } from '../core/math';
import type { AudioEngine } from './audioEngine';
import { EngineSound, type EngineAudioState } from './engineSound';

export interface AudioCar {
  id: number;
  heavy: boolean;
  /** Listener space (metres): x right, y up, z backwards (three.js camera convention). */
  x: number;
  y: number;
  z: number;
  /** Radial velocity, positive = approaching (m/s). */
  vRad: number;
  speed: number;
}

export interface AudioFrame {
  engine: EngineAudioState;
  speed: number;
  helmet: boolean;
  scrape: number;
  wheelspin: number;
  braking: number;
  wet: boolean;
  cars: AudioCar[];
}

interface Voice {
  carId: number;
  osc: OscillatorNode;
  osc2: OscillatorNode;
  noise: AudioBufferSourceNode;
  noiseGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
  heavy: boolean;
}

const SPEED_OF_SOUND = 343;
const VOICES = 5;

/** In-run soundscape: player engine, wind, tyres, traffic, horns, impacts and ambience. */
export class GameAudio {
  private engineSound: EngineSound | null = null;
  private wind: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; lfo: OscillatorNode; lfoGain: GainNode } | null = null;
  private tyre: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; wet: BiquadFilterNode; wetGain: GainNode } | null = null;
  private scrape: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private screech: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private ambience: { nodes: AudioScheduledSourceNode[]; gain: GainNode } | null = null;
  private voices: Voice[] = [];
  private env: EnvDef | null = null;
  private active = false;
  private thunderTimer = 0;
  private cityTimer = 0;

  constructor(private engine: AudioEngine) {}

  get ready(): boolean {
    return this.engine.ready;
  }

  begin(spec: BikeSpec, env: EnvDef, withStarter: boolean): void {
    this.end();
    if (!this.engine.ctx) return;
    this.env = env;
    this.active = true;
    this.engineSound = new EngineSound(this.engine, spec, this.engine.engineBus);
    this.engineSound.start(withStarter);
    this.buildContinuous();
    this.buildAmbience(env);
    this.buildVoices();
  }

  get engineVoice(): EngineSound | null {
    return this.engineSound;
  }

  private buildContinuous(): void {
    const ctx = this.engine.ctx!;
    const bus = this.engine.sfxBus;
    // Wind: pink noise through a moving band-pass, with helmet buffeting LFO.
    {
      const src = this.engine.noiseSource(true);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 3.3;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start();
      src.connect(filter).connect(gain).connect(bus);
      this.wind = { src, filter, gain, lfo, lfoGain };
    }
    // Tyre roll + wet spray hiss.
    {
      const src = this.engine.noiseSource(true);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 280;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(bus);
      const wet = ctx.createBiquadFilter();
      wet.type = 'highpass';
      wet.frequency.value = 2500;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0;
      src.connect(wet).connect(wetGain).connect(bus);
      this.tyre = { src, filter, gain, wet, wetGain };
    }
    // Barrier scrape: metallic resonant noise.
    {
      const src = this.engine.noiseSource();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2600;
      filter.Q.value = 3.5;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(bus);
      this.scrape = { src, filter, gain };
    }
    // Tyre squeal under heavy braking / wheelspin.
    {
      const src = this.engine.noiseSource();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1100;
      filter.Q.value = 9;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(bus);
      this.screech = { src, filter, gain };
    }
  }

  private buildAmbience(env: EnvDef): void {
    const ctx = this.engine.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.engine.ambienceBus);
    const nodes: AudioScheduledSourceNode[] = [];
    const t = ctx.currentTime;
    if (env.ambience === 'rain') {
      const src = this.engine.noiseSource(true);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 700;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      src.connect(hp).connect(lp).connect(gain);
      nodes.push(src);
      gain.gain.setTargetAtTime(0.32, t, 0.8);
    } else if (env.ambience === 'city') {
      const src = this.engine.noiseSource(true);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      src.connect(lp).connect(gain);
      nodes.push(src);
      gain.gain.setTargetAtTime(0.35, t, 0.8);
    } else {
      const src = this.engine.noiseSource(true);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = env.ambience === 'desert' ? 500 : 900;
      bp.Q.value = 0.4;
      src.connect(bp).connect(gain);
      nodes.push(src);
      gain.gain.setTargetAtTime(0.12, t, 0.8);
    }
    this.ambience = { nodes, gain };
  }

  private buildVoices(): void {
    const ctx = this.engine.ctx!;
    for (let i = 0; i < VOICES; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      const noise = this.engine.noiseSource(true);
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const o2g = ctx.createGain();
      o2g.gain.value = 0.3;
      osc.connect(filter);
      osc2.connect(o2g).connect(filter);
      noise.connect(noiseGain).connect(filter);
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 5;
      panner.rolloffFactor = 1.3;
      panner.maxDistance = 400;
      filter.connect(gain).connect(panner).connect(this.engine.sfxBus);
      osc.start();
      osc2.start();
      this.voices.push({ carId: -1, osc, osc2, noise, noiseGain, filter, gain, panner, heavy: false });
    }
  }

  frame(dt: number, f: AudioFrame): void {
    if (!this.active || !this.engine.ctx) return;
    const t = this.engine.ctx.currentTime;
    this.engineSound?.update(dt, f.engine);
    const v = f.speed;
    if (this.wind) {
      const w = clamp((v / 70) ** 2, 0, 1.6);
      const helmet = f.helmet ? 1.35 : 0.75;
      this.wind.filter.frequency.setTargetAtTime(350 + v * 14, t, 0.1);
      this.wind.gain.gain.setTargetAtTime(w * 0.32 * helmet, t, 0.08);
      this.wind.lfoGain.gain.setTargetAtTime(f.helmet ? w * 0.08 : 0, t, 0.1);
    }
    if (this.tyre) {
      this.tyre.gain.gain.setTargetAtTime(clamp(v / 60, 0, 1.2) * 0.22, t, 0.08);
      this.tyre.filter.frequency.setTargetAtTime(160 + v * 4, t, 0.1);
      this.tyre.wetGain.gain.setTargetAtTime(f.wet ? clamp(v / 50, 0, 1.3) * 0.12 : 0, t, 0.1);
    }
    if (this.scrape) {
      this.scrape.gain.gain.setTargetAtTime(f.scrape * 0.45, t, f.scrape > 0 ? 0.02 : 0.12);
      this.scrape.filter.frequency.setTargetAtTime(1800 + Math.random() * 1600, t, 0.02);
    }
    if (this.screech) {
      const sq = clamp(Math.max(f.wheelspin, (f.braking - 0.85) * 4) * (v > 3 ? 1 : 0), 0, 1) * (f.wet ? 0.4 : 1);
      this.screech.gain.gain.setTargetAtTime(sq * 0.12, t, 0.05);
    }
    this.updateVoices(f.cars);
    this.updateAmbience(dt);
  }

  private updateVoices(cars: AudioCar[]): void {
    const t = this.engine.ctx!.currentTime;
    const sorted = [...cars].sort((a, b) => a.x * a.x + a.z * a.z - (b.x * b.x + b.z * b.z)).slice(0, VOICES);
    const wanted = new Set(sorted.map((c) => c.id));
    // Release voices whose cars left the nearest set.
    for (const vc of this.voices) {
      if (vc.carId !== -1 && !wanted.has(vc.carId)) {
        vc.carId = -1;
        vc.gain.gain.setTargetAtTime(0, t, 0.15);
      }
    }
    for (const car of sorted) {
      let vc = this.voices.find((x) => x.carId === car.id);
      if (!vc) {
        vc = this.voices.find((x) => x.carId === -1);
        if (!vc) continue;
        vc.carId = car.id;
        vc.heavy = car.heavy;
        vc.panner.positionX.value = car.x;
        vc.panner.positionY.value = car.y;
        vc.panner.positionZ.value = car.z;
      }
      const doppler = SPEED_OF_SOUND / Math.max(60, SPEED_OF_SOUND - clamp(car.vRad, -150, 150));
      const base = (vc.heavy ? 26 : 38) + car.speed * (vc.heavy ? 0.35 : 0.9);
      vc.osc.frequency.setTargetAtTime(base * doppler, t, 0.05);
      vc.osc2.frequency.setTargetAtTime(base * 0.5 * doppler, t, 0.05);
      vc.filter.frequency.setTargetAtTime((vc.heavy ? 380 : 650) * doppler + car.speed * 6, t, 0.05);
      vc.noiseGain.gain.setTargetAtTime(0.4 + car.speed / 40, t, 0.1);
      vc.gain.gain.setTargetAtTime(vc.heavy ? 0.55 : 0.32, t, 0.1);
      vc.panner.positionX.setTargetAtTime(car.x, t, 0.02);
      vc.panner.positionY.setTargetAtTime(car.y, t, 0.02);
      vc.panner.positionZ.setTargetAtTime(car.z, t, 0.02);
    }
  }

  private updateAmbience(dt: number): void {
    const env = this.env;
    if (!env) return;
    if (env.lightning) {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) this.thunderTimer = 12 + Math.random() * 20;
    }
    if (env.ambience === 'city') {
      this.cityTimer -= dt;
      if (this.cityTimer <= 0) {
        this.cityTimer = 6 + Math.random() * 12;
        // Distant honk somewhere in the city.
        const pan = Math.random() * 2 - 1;
        this.horn(0.05, pan, Math.random() < 0.3);
      }
    }
  }

  /** Thunder follows a lightning flash after a distance-dependent delay. */
  thunder(delay: number): void {
    const e = this.engine;
    if (!e.ctx) return;
    const t = e.ctx.currentTime + delay;
    e.burst(e.ambienceBus, { at: t, dur: 3.5, gain: 0.7, type: 'lowpass', freq: 220, freqEnd: 60, q: 0.7, attack: 0.08 });
    e.burst(e.ambienceBus, { at: t + 0.1, dur: 1.2, gain: 0.35, type: 'lowpass', freq: 900, freqEnd: 120, q: 0.5, attack: 0.02 });
  }

  horn(gain: number, pan: number, truck: boolean): void {
    const e = this.engine;
    if (!e.ctx) return;
    const freqs = truck ? [220, 277] : [415, 523];
    const dur = truck ? 0.9 : 0.45;
    for (const f of freqs) e.tone(e.sfxBus, { freq: f, dur, gain, type: truck ? 'sawtooth' : 'square', attack: 0.02, pan });
  }

  playerHorn(): void {
    const e = this.engine;
    if (!e.ctx) return;
    for (const f of [440, 554]) e.tone(e.sfxBus, { freq: f, dur: 0.35, gain: 0.08, type: 'square', attack: 0.01 });
  }

  whoosh(side: -1 | 1, heavy: boolean, intensity: number): void {
    const e = this.engine;
    if (!e.ctx) return;
    e.burst(e.sfxBus, {
      dur: heavy ? 0.6 : 0.38,
      gain: (heavy ? 0.6 : 0.4) * intensity,
      type: 'bandpass',
      freq: heavy ? 900 : 1800,
      freqEnd: heavy ? 180 : 350,
      q: 0.8,
      attack: 0.03,
      pan: side * 0.8,
    });
  }

  land(impact: number): void {
    const e = this.engine;
    if (!e.ctx) return;
    e.tone(e.sfxBus, { freq: 75, freqEnd: 40, dur: 0.18, gain: 0.35 * impact + 0.1, type: 'sine' });
    e.burst(e.sfxBus, { dur: 0.08, gain: 0.15 * impact, type: 'bandpass', freq: 600, q: 2 });
  }

  crash(intensity: number): void {
    const e = this.engine;
    if (!e.ctx) return;
    const t = e.ctx.currentTime;
    const k = clamp(intensity, 0.3, 1);
    e.tone(e.sfxBus, { at: t, freq: 140, freqEnd: 35, dur: 0.6, gain: 0.9 * k, type: 'sine' });
    e.burst(e.sfxBus, { at: t, dur: 0.35, gain: 0.9 * k, type: 'lowpass', freq: 2200, q: 0.7 });
    // Metal clangs (inharmonic partials).
    for (const f of [310, 517, 893, 1330, 2010]) e.tone(e.sfxBus, { at: t + Math.random() * 0.05, freq: f, dur: 0.5 + Math.random() * 0.5, gain: 0.08 * k, type: 'triangle' });
    // Glass and plastic shatter.
    for (let i = 0; i < 14; i++) {
      e.burst(e.sfxBus, { at: t + 0.02 + Math.random() * 0.5, dur: 0.03 + Math.random() * 0.06, gain: 0.25 * k, type: 'highpass', freq: 3500 + Math.random() * 4000, q: 1.2, pan: Math.random() * 2 - 1 });
    }
    // Sliding scrape decaying over two seconds.
    e.burst(e.sfxBus, { at: t + 0.15, dur: 2.2, gain: 0.35 * k, type: 'bandpass', freq: 2200, freqEnd: 700, q: 2.5, attack: 0.05 });
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
    this.engineSound = new EngineSound(this.engine, spec, this.engine.engineBus);
    this.engineSound.start(true);
  }

  end(): void {
    this.active = false;
    this.engineSound?.dispose();
    this.engineSound = null;
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const stopAt = ctx.currentTime + 0.3;
    const stop = (n: AudioScheduledSourceNode) => {
      try {
        n.stop(stopAt);
      } catch {
        /* already stopped */
      }
    };
    for (const x of [this.wind, this.tyre, this.scrape, this.screech]) {
      if (!x) continue;
      x.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      stop(x.src);
    }
    if (this.wind) stop(this.wind.lfo);
    if (this.ambience) {
      this.ambience.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      for (const n of this.ambience.nodes) stop(n);
    }
    for (const v of this.voices) {
      v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      stop(v.osc);
      stop(v.osc2);
      stop(v.noise);
    }
    this.voices = [];
    this.wind = this.tyre = this.scrape = this.screech = null;
    this.ambience = null;
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
