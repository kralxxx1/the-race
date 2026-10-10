import type { EngineEvent } from './engineDsp';
import type { EngineMix, EngineQuality, EngineVoiceParams } from './params';
import { FIRST_PERSON_MIX } from './params';
import { createSynth } from './synthFactory';
import type { EngineSynthesizer } from './engineDsp';
import { onePoleCoef } from './util';

/** Control messages understood by an engine voice (AudioWorklet port or direct call in the fallback). */
export type EngineMsg =
  | { t: 'ctl'; rpm: number; thr: number; load: number; speed: number }
  | { t: 'ev'; e: EngineEvent; v?: number }
  | { t: 'starter'; on: boolean }
  | { t: 'ign'; on: boolean }
  | { t: 'mix'; mix: EngineMix; bal: number }
  | { t: 'crackle'; k: number }
  /** Output level (linear), smoothed so the fade-out of a disposed engine does not click. */
  | { t: 'gain'; g: number };

export interface EngineHostOptions {
  params: EngineVoiceParams;
  quality: EngineQuality;
  sampleRate: number;
  mix?: EngineMix;
  balance?: number;
  crackle?: number;
  seed?: number;
}

/**
 * Message handler + output stage around one engine synthesiser. Pure TypeScript
 * (no Web Audio types) so the worklet, the ScriptProcessor fallback and offline
 * tests all run exactly the same object.
 */
export class EngineHost {
  readonly synth: EngineSynthesizer & { snapControls(): void };
  /** Peak |sample| since the last `takePeak()` (diagnostics). */
  private peak = 0;
  private gain = 1;
  private gainTarget = 1;
  private readonly gainK: number;
  private first = true;

  constructor(readonly opts: EngineHostOptions) {
    this.synth = createSynth(opts.params, opts.sampleRate, opts.quality, { seed: opts.seed });
    this.synth.setMix(opts.mix ?? FIRST_PERSON_MIX, opts.balance ?? 0);
    this.synth.setCrackleScale(opts.crackle ?? 1);
    this.gainK = onePoleCoef(18, opts.sampleRate / 128);
  }

  handle(m: EngineMsg): void {
    switch (m.t) {
      case 'ctl':
        this.synth.setControls({ rpm: m.rpm, throttle: m.thr, load: m.load, speed: m.speed });
        if (this.first) {
          this.synth.snapControls();
          this.first = false;
        }
        break;
      case 'ev':
        this.synth.trigger(m.e, m.v);
        break;
      case 'starter':
        this.synth.setStarter(m.on);
        break;
      case 'ign':
        this.synth.setIgnition(m.on);
        break;
      case 'mix':
        this.synth.setMix(m.mix, m.bal);
        break;
      case 'crackle':
        this.synth.setCrackleScale(m.k);
        break;
      case 'gain':
        this.gainTarget = Math.max(0, Math.min(4, m.g));
        break;
    }
  }

  render(left: Float32Array, right: Float32Array, offset: number, n: number): void {
    this.synth.process(left, right, offset, n);
    // Per-block smoothed gain with a linear ramp inside the block.
    const g0 = this.gain;
    this.gain += this.gainK * (this.gainTarget - this.gain);
    const g1 = this.gain;
    let pk = this.peak;
    if (Math.abs(g1 - 1) < 1e-4 && Math.abs(g0 - 1) < 1e-4) {
      for (let i = 0; i < n; i++) {
        const a = Math.abs(left[offset + i]);
        const b = Math.abs(right[offset + i]);
        if (a > pk) pk = a;
        if (b > pk) pk = b;
      }
    } else {
      const step = n > 0 ? (g1 - g0) / n : 0;
      for (let i = 0; i < n; i++) {
        const g = g0 + step * i;
        left[offset + i] *= g;
        right[offset + i] *= g;
        const a = Math.abs(left[offset + i]);
        const b = Math.abs(right[offset + i]);
        if (a > pk) pk = a;
        if (b > pk) pk = b;
      }
    }
    this.peak = pk;
  }

  takePeak(): number {
    const p = this.peak;
    this.peak = 0;
    return p;
  }

  get popCount(): number {
    return this.synth.popCount;
  }
}
