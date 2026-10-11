import { generateImpulse, type ReverbKind } from './dsp/impulse';
import type { EngineQuality } from './dsp/params';

/** Convolution lengths per synthesis quality (cheaper reverbs on phones). */
const LENGTH_SCALE: Record<EngineQuality, number> = { low: 0.45, medium: 0.7, high: 1, ultra: 1, extreme: 1.15 };

/**
 * Environment reverb: every bus sends into `input`; two ConvolverNodes cross-fade when the acoustic
 * zone changes (open road → tunnel …) so there is never a click from swapping an impulse response.
 * Impulse responses are generated procedurally (see `dsp/impulse.ts`) and cached.
 */
export class ReverbSystem {
  readonly input: GainNode;
  private readonly convs: ConvolverNode[];
  private readonly gains: GainNode[];
  private readonly out: GainNode;
  private current: ReverbKind | null = null;
  private active = 0;
  private cache = new Map<string, AudioBuffer>();
  private quality: EngineQuality = 'high';
  private enabled = true;
  private amount = 0.6;
  private zoneLevel = 1;

  constructor(
    private readonly ctx: AudioContext,
    dest: AudioNode,
  ) {
    this.input = ctx.createGain();
    this.out = ctx.createGain();
    this.out.connect(dest);
    this.convs = [ctx.createConvolver(), ctx.createConvolver()];
    this.gains = [ctx.createGain(), ctx.createGain()];
    for (let i = 0; i < 2; i++) {
      this.convs[i].normalize = true;
      this.gains[i].gain.value = 0;
      this.input.connect(this.convs[i]);
      this.convs[i].connect(this.gains[i]);
      this.gains[i].connect(this.out);
    }
    this.applyLevel();
  }

  get zone(): ReverbKind | null {
    return this.current;
  }

  setQuality(q: EngineQuality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.cache.clear();
    if (this.current) {
      const k = this.current;
      this.current = null;
      this.setZone(k, true);
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyLevel();
  }

  setAmount(a: number): void {
    this.amount = Math.max(0, Math.min(1, a));
    this.applyLevel();
  }

  private applyLevel(): void {
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(this.enabled ? this.amount * this.zoneLevel : 0, t, 0.08);
  }

  private buffer(kind: ReverbKind): AudioBuffer {
    const key = `${kind}:${this.quality}`;
    let b = this.cache.get(key);
    if (!b) {
      const ir = generateImpulse(kind, this.ctx.sampleRate, LENGTH_SCALE[this.quality]);
      b = this.ctx.createBuffer(2, ir.left.length, this.ctx.sampleRate);
      b.copyToChannel(ir.left as Float32Array<ArrayBuffer>, 0);
      b.copyToChannel(ir.right as Float32Array<ArrayBuffer>, 1);
      this.cache.set(key, b);
    }
    return b;
  }

  /** Warm the cache for zones likely to be needed (call from idle time). */
  prepare(kind: ReverbKind): void {
    this.buffer(kind);
  }

  /** Cross-fade to the acoustics of `kind`. `level` scales the wet return (tunnels are wetter). */
  setZone(kind: ReverbKind, immediate = false, level = 1): void {
    this.zoneLevel = level;
    if (kind === this.current) {
      this.applyLevel();
      return;
    }
    const next = 1 - this.active;
    this.convs[next].buffer = this.buffer(kind);
    const t = this.ctx.currentTime;
    const tc = immediate ? 0.01 : 0.35;
    this.gains[next].gain.cancelScheduledValues(t);
    this.gains[this.active].gain.cancelScheduledValues(t);
    this.gains[next].gain.setTargetAtTime(1, t, tc);
    this.gains[this.active].gain.setTargetAtTime(0, t, tc);
    this.active = next;
    this.current = kind;
    this.applyLevel();
  }

  dispose(): void {
    for (const n of [this.input, this.out, ...this.convs, ...this.gains]) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }
}
