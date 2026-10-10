import { bikeTumble, bodyThud, glassShatter, horn, metalCrunch, plasticCrack, thunder, whoosh, type HornKind } from './dsp/sfxDsp';

type Maker = (sr: number) => Float32Array;

/**
 * Lazily rendered procedural one-shots (see `dsp/sfxDsp.ts`), cached per AudioContext. Each buffer
 * is rendered on first use; `warm()` renders everything in small idle slices after a run starts so
 * the first crash or horn never hitches the frame.
 */
export class SfxBank {
  private readonly cache = new Map<string, AudioBuffer>();
  private readonly makers = new Map<string, Maker>();
  private warming = false;

  constructor(private readonly ctx: BaseAudioContext) {
    const add = (name: string, m: Maker): void => void this.makers.set(name, m);
    for (let i = 0; i < 3; i++) add(`metal${i}`, (sr) => metalCrunch(sr, i + 1, i === 1 ? 0.6 : 1));
    for (let i = 0; i < 2; i++) add(`plastic${i}`, (sr) => plasticCrack(sr, i + 1, i ? 0.7 : 1));
    for (let i = 0; i < 2; i++) add(`glass${i}`, (sr) => glassShatter(sr, i + 1, i ? 0.7 : 1));
    for (let i = 0; i < 3; i++) add(`body${i}`, (sr) => bodyThud(sr, i + 1, i === 1 ? 0.8 : 1));
    for (let i = 0; i < 2; i++) add(`tumble${i}`, (sr) => bikeTumble(sr, i + 1));
    for (let i = 0; i < 2; i++) add(`whooshL${i}`, (sr) => whoosh(sr, i + 1, false));
    add('whooshH0', (sr) => whoosh(sr, 3, true));
    for (let i = 0; i < 2; i++) add(`thunder${i}`, (sr) => thunder(sr, i + 1));
    for (const k of ['car', 'taxi', 'truck', 'bus', 'moto', 'player'] as HornKind[]) add(`horn:${k}`, (sr) => horn(sr, k));
  }

  get(name: string): AudioBuffer | null {
    let b = this.cache.get(name);
    if (!b) {
      const make = this.makers.get(name);
      if (!make) return null;
      const data = make(this.ctx.sampleRate);
      b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.cache.set(name, b);
    }
    return b;
  }

  /** Random variant of a family ("metal", "body"…). */
  pick(family: string, count: number): AudioBuffer | null {
    return this.get(`${family}${(Math.random() * count) | 0}`);
  }

  /** Render every remaining buffer a few at a time between frames. */
  warm(): void {
    if (this.warming) return;
    this.warming = true;
    const names = [...this.makers.keys()].filter((n) => !this.cache.has(n));
    const step = (): void => {
      const n = names.shift();
      if (n === undefined) {
        this.warming = false;
        return;
      }
      this.get(n);
      window.setTimeout(step, 8);
    };
    window.setTimeout(step, 400);
  }
}

const banks = new WeakMap<BaseAudioContext, SfxBank>();

export function sfxBankFor(ctx: BaseAudioContext): SfxBank {
  let b = banks.get(ctx);
  if (!b) {
    b = new SfxBank(ctx);
    banks.set(ctx, b);
  }
  return b;
}
