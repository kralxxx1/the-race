import type { BikeSpec } from '../data/bikes';
import { clamp } from '../core/math';
import type { AudioEngine } from './audioEngine';
import type { EngineMsg } from './dsp/engineHost';
import type { EngineMix } from './dsp/params';
import { EXTERNAL_MIX, FIRST_PERSON_MIX } from './dsp/params';
import { createEngineDsp, type DspNode } from './dspNodes';
import { voiceParams } from './voices';

export interface EngineAudioState {
  rpm: number;
  /** Rider throttle 0..1 */
  throttle: number;
  /** Fraction of available torque being delivered (0..1). */
  load: number;
  /** Extra muffling 0..1 (e.g. chase camera distance). Reserved; the first-person/external mixes cover it. */
  distance: number;
  /** Road speed (m/s): final-drive whine and ram-air. */
  speed?: number;
}

/** `rider`: ears on the bike (first person). `external`: a bystander (garage preview, replays). */
export type Perspective = 'rider' | 'external';

const CRANK_RPM = 240;
/** Seconds of starter-motor cranking, then the catch + rev flare. */
const CRANK_TIME = 0.8;
const FLARE_TIME = 0.9;

/**
 * Real-time voice of one motorcycle: owns a DSP node (AudioWorklet, or a ScriptProcessor fallback)
 * running the crank-angle synthesiser with the bike's own voice parameters, and translates the game's
 * per-frame state and discrete events into control messages.
 */
export class EngineSound {
  readonly isElectric: boolean;
  private dsp: DspNode<EngineMsg> | null = null;
  private out: GainNode | null = null;
  private pending: EngineMsg[] = [];
  private disposed = false;
  private crank = 0;
  private flare = 0;
  private lastLoad = 0;
  private lastRpm = 0;
  private lastThr = 0;
  private lastSpeed = 0;
  private timers: number[] = [];
  private offConfig: (() => void) | null = null;
  /** Settings the current DSP voice was built with; a change rebuilds it (and cross-fades). */
  private builtKey = '';

  constructor(
    private readonly engine: AudioEngine,
    readonly spec: BikeSpec,
    private readonly dest: AudioNode,
    private readonly perspective: Perspective = 'rider',
  ) {
    this.isElectric = spec.engine.layout === 'ELECTRIC';
    const build = (): void => {
      if (!this.disposed) this.build();
    };
    if (engine.ctx) void engine.whenSettled().then(build);
    this.offConfig = engine.onConfig(() => this.pushConfig());
  }

  private mix(): EngineMix {
    const c = this.engine.cfg;
    const base = this.perspective === 'rider' ? FIRST_PERSON_MIX : EXTERNAL_MIX;
    const mix = { ...base, mech: base.mech * c.mechanical };
    // Bare ears: no helmet shell or ear plugs, so the highs come through and the rear shadow is smaller.
    if (this.perspective === 'rider' && !c.helmet) {
      mix.highDb = -2;
      mix.highHz = 3500;
      mix.rearShadow = 0.2;
    }
    return mix;
  }

  private build(): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const c = this.engine.cfg;
    const params = voiceParams(this.spec, { exhaustMod: c.exhaust, dryClutch: c.dryClutch });
    this.builtKey = this.configKey();
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(this.dest);
    this.dsp = createEngineDsp(ctx, this.engine, {
      params,
      quality: c.quality,
      mix: this.mix(),
      balance: this.perspective === 'rider' ? c.intakeBalance : 0,
      crackle: c.crackle,
      seed: (Math.random() * 0xffffff) | 0,
    });
    this.dsp.connect(this.out);
    for (const m of this.pending) this.dsp.post(m);
    this.pending.length = 0;
  }

  private post(m: EngineMsg): void {
    if (this.dsp) this.dsp.post(m);
    else if (m.t === 'ctl' && this.pending.length > 0 && this.pending[this.pending.length - 1].t === 'ctl') this.pending[this.pending.length - 1] = m;
    else if (this.pending.length < 64) this.pending.push(m);
  }

  private configKey(): string {
    const c = this.engine.cfg;
    return `${c.exhaust}|${c.dryClutch}|${c.quality}`;
  }

  private pushConfig(): void {
    if (!this.dsp || this.disposed) return;
    const c = this.engine.cfg;
    if (this.configKey() !== this.builtKey) {
      // Exhaust type, dry clutch or synthesis quality changed: build the new voice and cross-fade.
      const old = { dsp: this.dsp, out: this.out };
      this.dsp = null;
      this.out = null;
      old.dsp.post({ t: 'gain', g: 0 });
      this.build();
      this.post({ t: 'ctl', rpm: this.lastRpm, thr: this.lastThr, load: this.lastLoad, speed: this.lastSpeed });
      window.setTimeout(() => {
        old.dsp.dispose();
        old.out?.disconnect();
      }, 300);
      return;
    }
    this.post({ t: 'mix', mix: this.mix(), bal: this.perspective === 'rider' ? c.intakeBalance : 0 });
    this.post({ t: 'crackle', k: c.crackle });
  }

  /** Begin the start-up sequence: starter motor, catch, rev flare. */
  start(withStarter = true): void {
    if (this.isElectric) {
      this.post({ t: 'starter', on: true });
      this.crank = 0;
      this.flare = 0;
      return;
    }
    if (withStarter && this.engine.cfg.starter) {
      this.crank = CRANK_TIME;
      this.flare = FLARE_TIME;
      this.post({ t: 'starter', on: true });
    } else {
      this.crank = 0;
      this.flare = 0;
    }
  }

  update(dt: number, s: EngineAudioState): void {
    if (this.disposed) return;
    const e = this.spec.engine;
    let rpm = s.rpm;
    if (this.crank > 0) {
      this.crank -= dt;
      // Starter turning the engine over: slow, lumpy compression cycles.
      rpm = CRANK_RPM * (1 + 0.12 * Math.sin(this.crank * 23));
      if (this.crank <= 0) this.post({ t: 'starter', on: false });
    } else if (this.flare > 0) {
      this.flare = Math.max(0, this.flare - dt);
      // The engine catches and flares: a quick rev spike that settles to idle.
      const x = this.flare / FLARE_TIME;
      rpm = Math.max(rpm, e.idle * (1 + 1.15 * Math.sin(x * Math.PI) * x));
    }
    this.lastLoad += (s.load - this.lastLoad) * Math.min(1, dt * 14);
    const thr = this.crank > 0 ? 0.1 : s.throttle;
    this.lastRpm = this.isElectric ? s.rpm : rpm;
    this.lastThr = thr;
    this.lastSpeed = s.speed ?? 0;
    this.post({ t: 'ctl', rpm: this.lastRpm, thr, load: this.crank > 0 ? 0 : this.lastLoad, speed: this.lastSpeed });
  }

  /** Quickshifter / clutch ignition cut on a gear change. */
  shift(quick: boolean, up: boolean): void {
    if (this.disposed || this.isElectric) return;
    this.post({ t: 'ev', e: 'shiftCut', v: quick ? 0.055 : 0.13 });
    if (quick && up && this.spec.voice.crackle > 0.3) this.post({ t: 'ev', e: 'pop', v: 0.5 });
  }

  limiter(): void {
    if (this.disposed || this.isElectric) return;
    this.post({ t: 'ev', e: 'limiterCut' });
  }

  /** Throttle chop at high rpm: a burst of crackles over ~0.7 s. */
  overrun(): void {
    if (this.disposed || this.isElectric) return;
    const n = Math.round((2 + this.spec.voice.crackle * 7) * this.engine.cfg.crackle);
    for (let i = 0; i < n; i++) {
      const id = window.setTimeout(() => this.pop(0.4 + Math.random() * 0.6), Math.random() * 700);
      this.timers.push(id);
    }
  }

  /** Exhaust crackle / backfire. */
  pop(intensity = 1): void {
    if (this.disposed || this.isElectric || this.engine.cfg.crackle <= 0) return;
    this.post({ t: 'ev', e: intensity > 0.9 && Math.random() < 0.2 ? 'backfire' : 'pop', v: clamp(intensity, 0, 1) });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offConfig?.();
    for (const t of this.timers) window.clearTimeout(t);
    this.post({ t: 'gain', g: 0 });
    const dsp = this.dsp;
    const out = this.out;
    window.setTimeout(() => {
      dsp?.dispose();
      out?.disconnect();
    }, 260);
  }
}
