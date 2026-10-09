import type { BikeSpec } from '../data/bikes';
import { FIRING_ANGLES } from '../data/bikes';
import { clamp, lerp } from '../core/math';
import type { AudioEngine } from './audioEngine';
import { layerRpms, layerWeights, renderEngineLoop } from './engineSynth';

export interface EngineAudioState {
  rpm: number;
  /** Rider throttle 0..1 */
  throttle: number;
  /** Fraction of available torque being delivered (0..1). */
  load: number;
  /** Extra muffling 0..1 (e.g. chase camera distance). */
  distance: number;
}

const loopCache = new Map<string, AudioBuffer[]>();

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Real-time engine voice for one motorcycle. */
export class EngineSound {
  private ctx: AudioContext;
  private out: GainNode;
  private filter: BiquadFilterNode;
  private body: BiquadFilterNode;
  private shaper: WaveShaperNode;
  private sources: AudioBufferSourceNode[] = [];
  private gains: GainNode[] = [];
  private layers: number[] = [];
  private intake: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private charger: { osc: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private electric: { a: OscillatorNode; b: OscillatorNode; c: OscillatorNode; gain: GainNode; gb: GainNode; gc: GainNode; hiss: AudioBufferSourceNode; hissGain: GainNode } | null = null;
  private popBus: GainNode;
  private startupT = 1e9;
  private starterT = 1e9;
  private lastLoad = 0;
  private disposed = false;
  readonly isElectric: boolean;

  constructor(
    private engine: AudioEngine,
    readonly spec: BikeSpec,
    dest: AudioNode,
  ) {
    const ctx = engine.ctx!;
    this.ctx = ctx;
    this.isElectric = spec.engine.layout === 'ELECTRIC';
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.8;
    // Low-mid resonance gives the big-bore "chest punch".
    this.body = ctx.createBiquadFilter();
    this.body.type = 'peaking';
    this.body.frequency.value = 110;
    this.body.Q.value = 0.9;
    this.body.gain.value = 3 + (1 - spec.voice.brightness) * 4;
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = makeDriveCurve(1.6 + spec.voice.roughness * 1.6);
    this.shaper.oversample = '2x';
    this.filter.connect(this.body).connect(this.shaper).connect(this.out);
    this.out.connect(dest);
    this.popBus = ctx.createGain();
    this.popBus.gain.value = 0.9 * dbToGain(spec.voice.loudness);
    this.popBus.connect(dest);

    if (!this.isElectric) this.buildCombustion();
    else this.buildElectric();
  }

  private buildCombustion(): void {
    const ctx = this.ctx;
    const spec = this.spec;
    const e = spec.engine;
    this.layers = layerRpms(e.idle, e.redline);
    let buffers = loopCache.get(spec.id);
    if (!buffers) {
      const cyl = Math.max(1, FIRING_ANGLES[e.layout].length);
      buffers = this.layers.map((rpm, i) => {
        const loop = renderEngineLoop({
          sampleRate: ctx.sampleRate,
          baseRpm: rpm,
          layout: e.layout,
          voice: spec.voice,
          ccPerCylinder: e.cc / cyl,
          seconds: i === 0 ? 1.2 : 0.8,
          seed: 1000 + i * 77 + spec.id.length,
        });
        const b = ctx.createBuffer(1, loop.data.length, ctx.sampleRate);
        b.copyToChannel(loop.data as Float32Array<ArrayBuffer>, 0);
        return b;
      });
      loopCache.set(spec.id, buffers);
    }
    for (let i = 0; i < buffers.length; i++) {
      const src = ctx.createBufferSource();
      src.buffer = buffers[i];
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(this.filter);
      src.start(0, Math.random() * buffers[i].duration);
      this.sources.push(src);
      this.gains.push(g);
    }
    // Induction roar from the airbox.
    const n = this.engine.noiseSource(true);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = 0;
    n.connect(f).connect(g).connect(this.out);
    this.intake = { src: n, filter: f, gain: g };

    if (e.supercharged) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass';
      bf.Q.value = 6;
      const cg = ctx.createGain();
      cg.gain.value = 0;
      osc.connect(bf);
      osc2.connect(bf);
      bf.connect(cg).connect(this.out);
      osc.start();
      osc2.start();
      this.charger = { osc, osc2, filter: bf, gain: cg };
    }
  }

  private buildElectric(): void {
    const ctx = this.ctx;
    const mk = (type: OscillatorType) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.start();
      return o;
    };
    const a = mk('sawtooth');
    const b = mk('triangle');
    const c = mk('sine');
    const gain = ctx.createGain();
    const gb = ctx.createGain();
    const gc = ctx.createGain();
    gain.gain.value = 0;
    gb.gain.value = 0;
    gc.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    a.connect(gain).connect(lp);
    b.connect(gb).connect(lp);
    c.connect(gc).connect(lp);
    lp.connect(this.out);
    const hiss = this.engine.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0;
    hiss.connect(hp).connect(hissGain).connect(this.out);
    this.electric = { a, b, c, gain, gb, gc, hiss, hissGain };
  }

  /** Begin the start-up sequence: starter motor, catch, rev flare. */
  start(withStarter = true): void {
    const t = this.ctx.currentTime;
    if (this.isElectric) {
      this.engine.tone(this.popBus, { freq: 880, freqEnd: 1320, dur: 0.25, gain: 0.05, type: 'sine' });
      this.startupT = 0.6;
      this.starterT = 0;
      return;
    }
    if (withStarter) {
      this.starterT = 0.75;
      // Starter motor: buzzing whine pulsed by the compression strokes.
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(120, t);
      o.frequency.linearRampToValueAtTime(175, t + 0.7);
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 9;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 0.05;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.05);
      g.gain.setValueAtTime(0.08, t + 0.68);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      lfo.connect(lfoG).connect(g.gain);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      o.connect(lp).connect(g).connect(this.popBus);
      o.start(t);
      lfo.start(t);
      o.stop(t + 0.85);
      lfo.stop(t + 0.85);
      this.startupT = 1.6;
    } else {
      this.starterT = 0;
      this.startupT = 0;
    }
  }

  update(dt: number, s: EngineAudioState): void {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    const e = this.spec.engine;
    const v = this.spec.voice;
    this.starterT = Math.max(0, this.starterT - dt);
    this.startupT = Math.max(0, this.startupT - dt);
    const running = this.starterT <= 0;
    // After the engine catches, the revs flare up and settle.
    const flare = this.startupT > 0 && this.startupT < 0.85 ? 1 + 1.1 * Math.sin((this.startupT / 0.85) * Math.PI) : 1;
    const rpm = Math.max(0, s.rpm * flare);
    const load = clamp(s.load, 0, 1);
    this.lastLoad += (load - this.lastLoad) * Math.min(1, dt * 14);
    const L = this.lastLoad;
    const frac = this.isElectric ? clamp(rpm / e.limiter, 0, 1.05) : clamp(rpm / e.redline, 0, 1.08);
    const vol = running ? dbToGain(v.loudness) * lerp(0.42, 1, L) * (0.6 + 0.45 * frac) * (1 - 0.35 * s.distance) : 0;
    this.out.gain.setTargetAtTime(vol * 0.55, t, 0.03);

    if (this.isElectric && this.electric) {
      const el = this.electric;
      const f = Math.max(20, (rpm / 60) * 7.5);
      el.a.frequency.setTargetAtTime(f, t, 0.02);
      el.b.frequency.setTargetAtTime(f * 1.5, t, 0.02);
      el.c.frequency.setTargetAtTime(f * 0.25 + 40, t, 0.02);
      const on = rpm > 30 ? 1 : 0;
      el.gain.gain.setTargetAtTime(on * (0.025 + 0.11 * L) * (0.4 + frac), t, 0.03);
      el.gb.gain.setTargetAtTime(on * (0.02 + 0.06 * (1 - L)) * frac, t, 0.03);
      el.gc.gain.setTargetAtTime(on * 0.08 * frac, t, 0.03);
      el.hissGain.gain.setTargetAtTime(0.01 + 0.05 * L * frac, t, 0.05);
      this.out.gain.setTargetAtTime(running ? 1.2 * (1 - 0.3 * s.distance) : 0, t, 0.05);
      return;
    }

    const w = layerWeights(Math.max(rpm, 1), this.layers);
    for (let i = 0; i < this.sources.length; i++) {
      this.sources[i].playbackRate.setTargetAtTime(Math.max(0.05, rpm / this.layers[i]), t, 0.012);
      this.gains[i].gain.setTargetAtTime(w[i], t, 0.02);
    }
    // Closed throttle muffles the note (overrun), open throttle opens it right up.
    const cutoff = lerp(520, 7800, Math.pow(L, 0.75)) * (0.55 + 0.65 * frac) * (0.65 + 0.6 * v.brightness) * (1 - 0.45 * s.distance);
    this.filter.frequency.setTargetAtTime(clamp(cutoff, 200, 16000), t, 0.03);

    if (this.intake) {
      const sporty = this.spec.style === 'sport' || this.spec.style === 'hyper' || this.spec.style === 'naked' ? 1 : 0.5;
      this.intake.filter.frequency.setTargetAtTime(260 + 2400 * frac, t, 0.03);
      this.intake.gain.gain.setTargetAtTime(running ? L * Math.pow(frac, 1.4) * 0.5 * sporty : 0, t, 0.04);
    }
    if (this.charger) {
      const c = this.charger;
      const f = Math.max(40, rpm * 0.125);
      c.osc.frequency.setTargetAtTime(f, t, 0.02);
      c.osc2.frequency.setTargetAtTime(f * 2.02, t, 0.02);
      c.filter.frequency.setTargetAtTime(f * 1.6, t, 0.02);
      c.gain.gain.setTargetAtTime(running ? Math.pow(frac, 2) * (0.15 + 0.85 * L) * 0.22 : 0, t, 0.05);
      // Blow-off valve when the throttle snaps shut at boost.
      if (this.lastLoad > 0.6 && load < 0.1 && frac > 0.45) this.blowOff(frac);
    }
    // Overrun burble: random pops while decelerating at mid/high revs.
    if (running && s.throttle < 0.08 && frac > 0.38 && Math.random() < v.crackle * dt * 9 * frac) this.pop(0.4 + Math.random() * 0.6);
  }

  private blowOff(frac: number): void {
    const t = this.ctx.currentTime;
    this.engine.burst(this.popBus, { at: t, dur: 0.45, gain: 0.25 * frac, type: 'bandpass', freq: 3800, freqEnd: 1600, q: 1.5, attack: 0.01 });
    // Compressor surge "chirp": a few fast flutters.
    for (let i = 0; i < 4; i++) {
      this.engine.burst(this.popBus, { at: t + 0.05 + i * 0.045, dur: 0.035, gain: 0.12 * frac, type: 'bandpass', freq: 2400 - i * 250, q: 4 });
    }
  }

  /** Exhaust crackle / backfire. */
  pop(intensity = 1): void {
    if (this.isElectric || this.disposed) return;
    const t = this.ctx.currentTime + Math.random() * 0.03;
    const big = Math.random() < 0.25;
    this.engine.burst(this.popBus, {
      at: t,
      dur: big ? 0.07 : 0.035,
      gain: (big ? 0.55 : 0.3) * intensity,
      type: 'bandpass',
      freq: 900 + Math.random() * 1800,
      q: 0.9,
    });
    this.engine.tone(this.popBus, { at: t, freq: 95 + Math.random() * 40, freqEnd: 50, dur: big ? 0.12 : 0.06, gain: 0.35 * intensity, type: 'sine' });
  }

  /** Several crackles over ~0.7 s after an aggressive throttle chop. */
  overrun(): void {
    const n = Math.round(2 + this.spec.voice.crackle * 7);
    for (let i = 0; i < n; i++) {
      const delay = Math.random() * 0.7 * 1000;
      window.setTimeout(() => this.pop(0.5 + Math.random() * 0.5), delay);
    }
  }

  /** Ignition cut / clutch sound on a gear change. */
  shift(quick: boolean, up: boolean): void {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    if (!this.isElectric) {
      // Momentary cut of the exhaust note.
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(this.out.gain.value, t);
      this.out.gain.linearRampToValueAtTime(this.out.gain.value * (quick ? 0.35 : 0.15), t + 0.012);
      if (quick && up && this.spec.voice.crackle > 0.3) this.pop(0.7);
    }
    if (!quick) this.engine.tone(this.popBus, { at: t + 0.04, freq: 70, freqEnd: 45, dur: 0.09, gain: 0.12, type: 'sine' });
  }

  limiter(): void {
    if (this.isElectric || this.disposed) return;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(this.out.gain.value * 0.45, t + 0.01);
    if (Math.random() < 0.3) this.pop(0.4);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.05);
    const stopAt = t + 0.4;
    for (const s of this.sources) s.stop(stopAt);
    this.intake?.src.stop(stopAt);
    if (this.charger) {
      this.charger.osc.stop(stopAt);
      this.charger.osc2.stop(stopAt);
    }
    if (this.electric) {
      this.electric.a.stop(stopAt);
      this.electric.b.stop(stopAt);
      this.electric.c.stop(stopAt);
      this.electric.hiss.stop(stopAt);
    }
    window.setTimeout(() => {
      this.out.disconnect();
      this.popBus.disconnect();
    }, 600);
  }
}

function makeDriveCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return c;
}
