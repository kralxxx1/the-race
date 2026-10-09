/**
 * Owns the WebAudio context and the mixing buses. The context can only start
 * after a user gesture (browser autoplay policy), so everything is lazy and
 * every public method is a no-op until `unlock()` succeeded.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  engineBus!: GainNode;
  sfxBus!: GainNode;
  ambienceBus!: GainNode;
  uiBus!: GainNode;
  private compressor!: DynamicsCompressorNode;
  private noise: AudioBuffer | null = null;
  private pink: AudioBuffer | null = null;
  private volumes = { master: 0.8, engine: 0.9, sfx: 0.8 };
  private muted = false;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Create/resume the context. Call from a user gesture handler. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor({ latencyHint: 'interactive' });
        this.ctx = ctx;
        this.compressor = ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -14;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = 0.004;
        this.compressor.release.value = 0.2;
        this.master = ctx.createGain();
        this.master.connect(this.compressor).connect(ctx.destination);
        const bus = () => {
          const g = ctx.createGain();
          g.connect(this.master);
          return g;
        };
        this.engineBus = bus();
        this.sfxBus = bus();
        this.ambienceBus = bus();
        this.uiBus = bus();
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (e) {
      console.warn('Audio unavailable', e);
      this.ctx = null;
    }
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(master: number, engine: number, sfx: number): void {
    this.volumes = { master, engine, sfx };
    this.applyVolumes();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
    this.engineBus.gain.setTargetAtTime(this.volumes.engine, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.ambienceBus.gain.setTargetAtTime(this.volumes.sfx * 0.9, t, 0.05);
    this.uiBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
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

  /** Shared pink-ish noise buffer (smoother, for wind and rain). */
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

  /** Looping noise source started immediately. */
  noiseSource(pink = false): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = pink ? this.pinkBuffer() : this.noiseBuffer();
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 1.5);
    return src;
  }

  /** One-shot filtered noise burst (used by pops, whooshes, impacts, shatter...). */
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
