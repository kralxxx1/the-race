import type { SettingsReader } from '../settings/schema';
import { DEFAULT_AUDIO_CONFIG, readAudioConfig, type AudioConfig } from './audioConfig';
import type { DspBackend } from './dspNodes';
import { ReverbSystem } from './reverb';
import workletUrl from './worklet/processors.ts?worker&url';

/** Per-bus trim so that unit-level DSP output sits sensibly against the engine in the final mix. */
const TRIM = { engine: 1, world: 1, traffic: 0.9, sfx: 0.9, ambience: 0.8, ui: 1 };
/** How much of each bus feeds the environment reverb. */
const SEND = { engine: 0.32, world: 0.12, traffic: 0.55, sfx: 0.5, ambience: 0.25 };

/**
 * Owns the WebAudio context, the mixing buses and the master processing chain
 * (EQ → night-mode compressor → limiter → master volume → mono fold → output).
 * The context can only start after a user gesture (browser autoplay policy), so
 * everything is lazy and every public method is a no-op until `unlock()` succeeded.
 *
 * Signal flow:
 *   engine / world / traffic / sfx / ambience bus ─┬─► mix ─► bass ─► treble ─► night ─► limiter ─► master ─► mono ─► out
 *                                                  └─► reverb send ─► convolver (cross-fading zones) ─► mix
 *   ui bus ─────────────────────────────────────────────────────────► mix
 */
export class AudioEngine implements DspBackend {
  ctx: AudioContext | null = null;
  engineBus!: GainNode;
  worldBus!: GainNode;
  trafficBus!: GainNode;
  sfxBus!: GainNode;
  ambienceBus!: GainNode;
  uiBus!: GainNode;
  reverb!: ReverbSystem;
  cfg: AudioConfig = { ...DEFAULT_AUDIO_CONFIG };
  /** True once the worklet module is loaded; DSP nodes fall back to ScriptProcessor otherwise. */
  workletReady = false;
  private settled: Promise<void> = Promise.resolve();
  private master!: GainNode;
  private bassNode!: BiquadFilterNode;
  private trebleNode!: BiquadFilterNode;
  private night!: DynamicsCompressorNode;
  private nightMakeup!: GainNode;
  private mono!: GainNode;
  private analyser: AnalyserNode | null = null;
  private analyserBuf: Float32Array<ArrayBuffer> | null = null;
  private noise: AudioBuffer | null = null;
  private pink: AudioBuffer | null = null;
  private muted = false;
  private listeners = new Set<() => void>();

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Resolves once the worklet module finished loading (or failed): safe to create DSP nodes afterwards. */
  whenSettled(): Promise<void> {
    return this.settled;
  }

  /** Called whenever settings change (after the audio graph has been updated). */
  onConfig(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Create/resume the context. Call from a user gesture handler. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor({ latencyHint: 'interactive' });
        this.ctx = ctx;
        this.build(ctx);
        this.settled = this.loadWorklet(ctx);
        this.applyConfig();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (e) {
      console.warn('Audio unavailable', e);
      this.ctx = null;
    }
  }

  private async loadWorklet(ctx: AudioContext): Promise<void> {
    try {
      if (!ctx.audioWorklet) throw new Error('AudioWorklet unsupported');
      await ctx.audioWorklet.addModule(workletUrl);
      this.workletReady = true;
    } catch (e) {
      this.workletReady = false;
      console.warn('AudioWorklet unavailable, using the ScriptProcessor fallback', e);
    }
  }

  private build(ctx: AudioContext): void {
    const g = (v = 1): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    const mix = g();
    this.bassNode = ctx.createBiquadFilter();
    this.bassNode.type = 'lowshelf';
    this.bassNode.frequency.value = 130;
    this.trebleNode = ctx.createBiquadFilter();
    this.trebleNode.type = 'highshelf';
    this.trebleNode.frequency.value = 4800;
    this.night = ctx.createDynamicsCompressor();
    this.night.ratio.value = 1;
    this.night.threshold.value = 0;
    this.night.knee.value = 24;
    this.night.attack.value = 0.006;
    this.night.release.value = 0.28;
    this.nightMakeup = g();
    // Always-on safety limiter (not a "sound" compressor): transparent below -2 dBFS.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 3;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    this.master = g(0.8);
    this.mono = g();
    this.mono.channelCountMode = 'explicit';
    this.mono.channelInterpretation = 'speakers';
    this.mono.channelCount = 2;
    mix.connect(this.bassNode).connect(this.trebleNode).connect(this.night).connect(this.nightMakeup).connect(limiter).connect(this.master).connect(this.mono).connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.mono.connect(this.analyser);

    this.reverb = new ReverbSystem(ctx, mix);
    const bus = (trim: number): GainNode => {
      const b = g(trim);
      b.connect(mix);
      return b;
    };
    this.engineBus = bus(TRIM.engine);
    this.worldBus = bus(TRIM.world);
    this.trafficBus = bus(TRIM.traffic);
    this.sfxBus = bus(TRIM.sfx);
    this.ambienceBus = bus(TRIM.ambience);
    this.uiBus = bus(TRIM.ui);
    const send = (from: GainNode, level: number): GainNode => {
      const s = g(level);
      from.connect(s).connect(this.reverb.input);
      return s;
    };
    send(this.engineBus, SEND.engine);
    send(this.worldBus, SEND.world);
    send(this.trafficBus, SEND.traffic);
    send(this.sfxBus, SEND.sfx);
    send(this.ambienceBus, SEND.ambience);
  }

  /** Apply the game's settings store to the graph (levels, EQ, compression, reverb, mono, quality). */
  applySettings(s: SettingsReader): void {
    this.cfg = readAudioConfig(s);
    this.applyConfig();
  }

  /** Legacy three-slider API. */
  setVolumes(master: number, engine: number, sfx: number): void {
    this.cfg = { ...this.cfg, master, engine, sfx };
    this.applyConfig();
  }

  private applyConfig(): void {
    const ctx = this.ctx;
    const c = this.cfg;
    if (ctx) {
      const t = ctx.currentTime;
      const k = 0.05;
      this.master.gain.setTargetAtTime(this.muted ? 0 : c.master, t, k);
      this.engineBus.gain.setTargetAtTime(c.engine * TRIM.engine, t, k);
      // Wind/tyres/rain trims live inside the world DSP (it needs them per component); the bus is unity.
      this.worldBus.gain.setTargetAtTime(TRIM.world, t, k);
      this.trafficBus.gain.setTargetAtTime(c.traffic * TRIM.traffic, t, k);
      this.sfxBus.gain.setTargetAtTime(c.sfx * TRIM.sfx, t, k);
      this.ambienceBus.gain.setTargetAtTime(c.ambience * TRIM.ambience, t, k);
      this.uiBus.gain.setTargetAtTime(c.ui * TRIM.ui, t, k);
      this.bassNode.gain.setTargetAtTime(c.bass, t, k);
      this.trebleNode.gain.setTargetAtTime(c.treble, t, k);
      // "Night mode": heavy, fast-ish compression with make-up gain so quiet details stay audible
      // while the loud peaks (engine at redline, crashes) are pulled down.
      this.night.threshold.setTargetAtTime(c.nightMode ? -34 : 0, t, k);
      this.night.ratio.setTargetAtTime(c.nightMode ? 7 : 1, t, k);
      this.nightMakeup.gain.setTargetAtTime(c.nightMode ? 2.4 : 1, t, k);
      this.mono.channelCount = c.mono ? 1 : 2;
      this.reverb.setEnabled(c.reverb);
      this.reverb.setAmount(c.reverbAmount);
      this.reverb.setQuality(c.quality);
    }
    for (const fn of this.listeners) fn();
  }

  /** RMS level of the final mix (0..1), for diagnostics and tests. */
  level(): number {
    if (!this.analyser) return 0;
    if (!this.analyserBuf) this.analyserBuf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this.analyserBuf);
    let sum = 0;
    for (const v of this.analyserBuf) sum += v * v;
    return Math.sqrt(sum / this.analyserBuf.length);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyConfig();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Shared 2 s white-noise buffer. */
  noiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    if (!this.noise) {
      const len = ctx.sampleRate * 2;
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
    }
    return this.noise;
  }

  /** Shared pink-ish noise buffer. */
  pinkBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    if (!this.pink) {
      const len = ctx.sampleRate * 3;
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
      this.pink = b;
    }
    return this.pink;
  }

  /** One-shot filtered noise burst (UI blips, small effects). */
  burst(
    dest: AudioNode,
    opts: { at?: number; dur: number; gain: number; type?: BiquadFilterType; freq: number; freqEnd?: number; q?: number; attack?: number; pan?: number },
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = opts.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t0 + opts.dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const atk = opts.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    let node: AudioNode = g;
    if (opts.pan !== undefined) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p);
      node = p;
    }
    src.connect(f).connect(g);
    node.connect(dest);
    src.start(t0, Math.random() * 1.5, opts.dur + 0.05);
    src.onended = () => {
      src.disconnect();
      node.disconnect();
    };
  }

  /** One-shot tone with exponential decay. */
  tone(
    dest: AudioNode,
    opts: { at?: number; freq: number; freqEnd?: number; dur: number; gain: number; type?: OscillatorType; attack?: number; pan?: number },
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = opts.at ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(10, opts.freqEnd), t0 + opts.dur);
    const g = ctx.createGain();
    const atk = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    let node: AudioNode = g;
    if (opts.pan !== undefined) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p);
      node = p;
    }
    o.connect(g);
    node.connect(dest);
    o.start(t0);
    o.stop(t0 + opts.dur + 0.05);
    o.onended = () => {
      o.disconnect();
      node.disconnect();
    };
  }
}

export const audio = new AudioEngine();
