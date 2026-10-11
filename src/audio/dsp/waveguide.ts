import type { ExhaustNetwork } from './params';
import { DENORMAL_EPS, onePoleCoef } from './util';

/** Samples per delay line (power of two). Long enough for ~5 m of pipe at 96 kHz. */
const LINE = 1024;
const MASK = LINE - 1;

const KIND_PORT = 0;
const KIND_JUNCTION = 1;
const KIND_OPEN = 2;

/**
 * Exhaust system as a network of digital waveguides (Smith-style
 * bidirectional delay lines) joined by pressure scattering junctions.
 *
 * Each pipe carries a forward wave (engine → tail) and a backward wave. At a
 * junction the incoming waves scatter according to the pipes' cross-section
 * areas, so a header meeting a collector reflects a negative (scavenging)
 * wave, a muffler's expansion chamber traps and filters energy, and an open
 * tail pipe reflects low frequencies back with inverted sign while radiating
 * the rest. Pipe lengths therefore set real resonances and comb structure —
 * which is why an underbelly 4-2-1 sounds different from a shotgun twin.
 */
export class WaveguideNetwork {
  readonly pipeCount: number;
  readonly outletCount: number;
  /** Per-cylinder input pressure for the next `step()` (written by the engine). */
  readonly inject: Float64Array;
  /** Radiated signal per outlet after the last `step()`. */
  readonly out: Float64Array;
  /** Delay-line storage, exposed for denormal checks in tests. */
  readonly buf: Float32Array;

  private readonly delay: Int32Array;
  private readonly area: Float64Array;
  private readonly lossK: Float64Array;
  private readonly lossG: Float64Array;
  private readonly lpF: Float64Array;
  private readonly lpB: Float64Array;
  private readonly arrA: Float64Array;
  private readonly arrB: Float64Array;
  private readonly inF: Float64Array;
  private readonly inB: Float64Array;

  private readonly nodeKind: Uint8Array;
  private readonly nodeStart: Int32Array;
  private readonly nodeCount: Int32Array;
  private readonly incPipe: Int32Array;
  private readonly incEnd: Uint8Array;
  private readonly nodeParam: Float64Array;
  private readonly nodeIndex: Int32Array;
  private readonly openK: Float64Array;
  private readonly openLp: Float64Array;
  private t = 0;

  constructor(net: ExhaustNetwork, cylinders: number, sampleRate: number, gasC: number) {
    const np = net.pipes.length;
    this.pipeCount = np;
    this.outletCount = net.outlets.length;
    this.inject = new Float64Array(Math.max(1, cylinders));
    this.out = new Float64Array(Math.max(1, net.outlets.length));
    this.buf = new Float32Array(np * 2 * LINE);
    this.delay = new Int32Array(np);
    this.area = new Float64Array(np);
    this.lossK = new Float64Array(np);
    this.lossG = new Float64Array(np);
    this.lpF = new Float64Array(np);
    this.lpB = new Float64Array(np);
    this.arrA = new Float64Array(np);
    this.arrB = new Float64Array(np);
    this.inF = new Float64Array(np);
    this.inB = new Float64Array(np);
    for (let p = 0; p < np; p++) {
      const s = net.pipes[p];
      this.delay[p] = Math.max(1, Math.min(LINE - 1, Math.round((s.len / gasC) * sampleRate)));
      this.area[p] = Math.max(1e-3, s.area);
      this.lossK[p] = onePoleCoef(s.lossHz, sampleRate);
      this.lossG[p] = Math.min(0.999, Math.max(0, s.lossGain));
    }
    const nn = net.nodes.length;
    this.nodeKind = new Uint8Array(nn);
    this.nodeStart = new Int32Array(nn);
    this.nodeCount = new Int32Array(nn);
    this.nodeParam = new Float64Array(nn);
    this.nodeIndex = new Int32Array(nn);
    this.openK = new Float64Array(nn);
    this.openLp = new Float64Array(nn);
    const incP: number[] = [];
    const incE: number[] = [];
    for (let n = 0; n < nn; n++) {
      const node = net.nodes[n];
      this.nodeStart[n] = incP.length;
      for (let p = 0; p < np; p++) {
        if (net.pipes[p].a === n) {
          incP.push(p);
          incE.push(0);
        }
        if (net.pipes[p].b === n) {
          incP.push(p);
          incE.push(1);
        }
      }
      this.nodeCount[n] = incP.length - this.nodeStart[n];
      if (node.k === 'port') {
        this.nodeKind[n] = KIND_PORT;
        this.nodeParam[n] = node.refl;
        this.nodeIndex[n] = Math.min(node.cyl, this.inject.length - 1);
      } else if (node.k === 'open') {
        this.nodeKind[n] = KIND_OPEN;
        this.nodeParam[n] = node.refl;
        this.nodeIndex[n] = Math.min(node.out, this.out.length - 1);
        this.openK[n] = onePoleCoef(node.reflHz, sampleRate);
      } else {
        this.nodeKind[n] = KIND_JUNCTION;
      }
    }
    this.incPipe = Int32Array.from(incP);
    this.incEnd = Uint8Array.from(incE);
  }

  /** Advance the whole network by one sample. */
  step(): void {
    const np = this.pipeCount;
    const buf = this.buf;
    const t = this.t;
    // 1) Waves arriving at both ends of every pipe, with wall losses.
    for (let p = 0; p < np; p++) {
      const r = (t - this.delay[p]) & MASK;
      const base = p * 2 * LINE;
      const k = this.lossK[p];
      const g = this.lossG[p];
      let f = this.lpF[p];
      f += k * (buf[base + r] - f);
      this.lpF[p] = f;
      this.arrB[p] = f * g;
      let b = this.lpB[p];
      b += k * (buf[base + LINE + r] - b);
      this.lpB[p] = b;
      this.arrA[p] = b * g;
    }
    // 2) Scattering at the nodes.
    const out = this.out;
    for (let o = 0; o < out.length; o++) out[o] = 0;
    const nn = this.nodeKind.length;
    for (let n = 0; n < nn; n++) {
      const start = this.nodeStart[n];
      const count = this.nodeCount[n];
      if (count === 0) continue;
      const kind = this.nodeKind[n];
      if (kind === KIND_PORT) {
        const p = this.incPipe[start];
        const src = this.inject[this.nodeIndex[n]];
        if (this.incEnd[start] === 0) this.inF[p] = src + this.nodeParam[n] * this.arrA[p];
        else this.inB[p] = src + this.nodeParam[n] * this.arrB[p];
      } else if (kind === KIND_OPEN) {
        const p = this.incPipe[start];
        const incoming = this.incEnd[start] === 1 ? this.arrB[p] : this.arrA[p];
        let lp = this.openLp[n];
        lp += this.openK[n] * (incoming - lp);
        this.openLp[n] = lp;
        const refl = -this.nodeParam[n] * lp;
        if (this.incEnd[start] === 1) this.inB[p] = refl;
        else this.inF[p] = refl;
        // Volume velocity leaving the pipe ∝ p+ − p−.
        out[this.nodeIndex[n]] += incoming - refl;
      } else {
        let num = 0;
        let den = 0;
        for (let i = start; i < start + count; i++) {
          const p = this.incPipe[i];
          const a = this.area[p];
          num += a * (this.incEnd[i] === 1 ? this.arrB[p] : this.arrA[p]);
          den += a;
        }
        const pj = (2 * num) / den;
        for (let i = start; i < start + count; i++) {
          const p = this.incPipe[i];
          if (this.incEnd[i] === 1) this.inB[p] = pj - this.arrB[p];
          else this.inF[p] = pj - this.arrA[p];
        }
      }
    }
    // 3) Write the outgoing waves.
    const w = t & MASK;
    for (let p = 0; p < np; p++) {
      const base = p * 2 * LINE;
      buf[base + w] = this.inF[p];
      buf[base + LINE + w] = this.inB[p];
    }
    this.t = (t + 1) | 0;
    if (this.t > 0x3fffffff) this.t &= MASK;
  }

  /** Zero tiny loss-filter states (once per block). */
  flush(): void {
    for (let p = 0; p < this.pipeCount; p++) {
      if (Math.abs(this.lpF[p]) < DENORMAL_EPS) this.lpF[p] = 0;
      if (Math.abs(this.lpB[p]) < DENORMAL_EPS) this.lpB[p] = 0;
    }
    for (let n = 0; n < this.openLp.length; n++) if (Math.abs(this.openLp[n]) < DENORMAL_EPS) this.openLp[n] = 0;
  }
}
