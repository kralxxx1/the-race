import * as THREE from 'three';
import { T, mul, type KitContext } from '../context';
import { alongY, bolt, catmull, circle, extrude, lathe, rod, roundBox, roundRect, sweep, type MeshData, type P2, type P3 } from '../mesh';
import { F, Micro, vary, type Finish } from '../sink';
import type { EnginePort } from './cruisers-engine';

/**
 * BMW R 18 "Big Boxer": two huge horizontally-opposed cylinders sticking out of the sides, finned
 * barrels, massive heads with domed valve covers and chrome pushrod tubes. Replaces the generic
 * kit boxer (blueprint lists `skip:engine`).
 */

export interface BoxerOpts {
  /** Crankshaft height. */
  y: number;
  /** Crankcase z extent [front, back]. */
  caseZ: [number, number];
  /** Cylinder centre z (the right cylinder sits a little behind the left one). */
  cylZ: number;
  /** Outer x of the valve covers. */
  xEnd: number;
  black: Finish;
  /** Machined fin edge. */
  finEdge: Finish;
  /** Head casting. */
  headF: Finish;
  /** Big valve covers. */
  coverF: Finish;
  /** Pushrod tubes and trim. */
  bright: Finish;
  /** Front crank cover. */
  frontF: Finish;
}

/** Rounded-rectangle slab: w (along z) × h (along y), `thick` along local +Z, centred on the origin. */
function slab(w: number, h: number, thick: number, r: number, bevel: number): MeshData {
  return extrude(roundRect(w, h, r, 4), thick, { bevel, bevelSegs: 2, plane: 'xy', center: thick / 2 });
}

/** Matrix mapping a slab's local (x, y, z) to world (z, y, ±x): thickness runs outwards along ±X from `at`. */
function slabAt(s: number, at: P3): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(s, 0, 0));
  m.setPosition(at[0], at[1], at[2]);
  return m;
}

export function buildBigBoxer(ctx: KitContext, o: BoxerOpts): EnginePort[] {
  const ports: EnginePort[] = [];
  const cast = (f: Finish) => vary(f, { micro: Micro.cast });
  const black = cast(o.black);
  const [zf, zb] = o.caseZ;
  const zc = (zf + zb) / 2;
  const y = o.y;
  const flipZ = new THREE.Matrix4().makeScale(1, 1, -1);
  // Crankcase, oil pan, front cover, transmission housing
  ctx.add('chassis', roundBox(0.3, 0.3, zb - zf, 0.07, ctx.micro ? 3 : 2), black, T(0, y, zc));
  ctx.add('chassis', roundBox(0.25, 0.075, zb - zf - 0.04, 0.03, 2), black, T(0, y - 0.175, zc + 0.01));
  if (ctx.micro) for (let i = 0; i < 7; i++) ctx.add('chassis', roundBox(0.255, 0.012, 0.004, 0.002, 1), o.finEdge, T(0, y - 0.19, zf + 0.06 + i * 0.045));
  const front = lathe([[0, 0], [0.115, 0], [0.122, 0.012], [0.112, 0.024], [0.05, 0.03], [0, 0.031]], { segs: ctx.seg(48, 16), axis: 'z', sharp: [1] });
  ctx.add('chassis', front.transform(flipZ), o.frontF, T(0, y + 0.01, zf));
  ctx.add('chassis', lathe([[0.118, 0], [0.126, 0.004], [0.126, 0.012], [0.118, 0.016]], { segs: ctx.seg(48, 14), axis: 'z', sharp: true }).transform(flipZ), vary(F.polishedAlu, { rough: 0.15 }), T(0, y + 0.01, zf + 0.006));
  ctx.add('chassis', lathe([[0, 0], [0.125, 0], [0.13, 0.02], [0.12, 0.24], [0.1, 0.27], [0, 0.27]], { segs: ctx.seg(40, 14), axis: 'z', sharp: [1, 3] }), black, T(0, y - 0.02, zb - 0.01));
  const cylSides: [number, number][] = [[-1, o.cylZ - 0.025], [1, o.cylZ + 0.025]];
  for (const [s, z] of cylSides) {
    // Barrel with cooling fins
    const x0 = 0.14, len = 0.15, r = 0.056;
    const prof: P2[] = [[r, 0]];
    const nf = ctx.micro ? 11 : 6;
    for (let i = 0; i < nf; i++) {
      const a0 = ((i + 0.15) / nf) * len, a1 = ((i + 0.6) / nf) * len;
      prof.push([r, a0], [r + 0.03, a0 + 0.0015], [r + 0.03, a1 - 0.0015], [r, a1]);
    }
    prof.push([r, len]);
    const a: P3 = [s * x0, y + 0.01, z];
    const b: P3 = [s * (x0 + len), y + 0.01, z];
    ctx.add('chassis', lathe(prof, { segs: ctx.seg(36, 14), axis: 'y', sharp: true }), black, alongY(a, b));
    if (ctx.micro) {
      for (let i = 0; i < nf; i++) {
        const t = x0 + ((i + 0.38) / nf) * len;
        ctx.add('chassis', lathe([[r + 0.0295, -0.0016], [r + 0.0305, 0], [r + 0.0295, 0.0016]], { segs: ctx.seg(36, 14), axis: 'y' }), o.finEdge, alongY([s * t, y + 0.01, z], [s * (t + 0.01), y + 0.01, z]));
      }
    }
    // Head casting (rounded block with fins), then the big pillow-shaped valve cover
    const h0 = x0 + len;
    const hlen = o.xEnd - h0;
    const yc = y + 0.01;
    ctx.add('chassis', slab(0.225, 0.215, hlen * 0.6, 0.075, 0.03), cast(o.headF), slabAt(s, [s * h0, yc, z]));
    if (ctx.micro) for (let i = 0; i < 4; i++) ctx.add('chassis', slab(0.236, 0.226, 0.004, 0.08, 0.001), o.finEdge, slabAt(s, [s * (h0 + 0.008 + i * 0.012), yc, z]));
    const vc = h0 + hlen * 0.55;
    ctx.add('chassis', slab(0.2, 0.19, hlen * 0.45, 0.07, 0.022), o.coverF, slabAt(s, [s * vc, yc, z]));
    // Horizontal ribs across the cover face, like the real cast covers
    for (let i = -2; i <= 2; i++) {
      ctx.add('chassis', roundBox(0.0035, 0.0045, 0.15 - Math.abs(i) * 0.02, 0.0015, 1), vary(o.coverF, { rough: 0.2 }), T(s * (o.xEnd + 0.0005), yc + i * 0.031, z));
    }
    // Raised centre boss on the cover
    const bm = alongY([s * (o.xEnd + 0.001), y + 0.01, z], [s * (o.xEnd + 0.012), y + 0.01, z]);
    ctx.add('chassis', lathe([[0.034, 0], [0.05, 0.002], [0.053, 0.006], [0.048, 0.01], [0.034, 0.01]], { segs: ctx.seg(36, 12), axis: 'y', sharp: [1, 3] }), vary(F.polishedAlu, { rough: 0.14 }), bm);
    ctx.add('chassis', lathe([[0, 0], [0.034, 0], [0.034, 0.007], [0, 0.007]], { segs: ctx.seg(28, 10), axis: 'y', sharp: true }), vary(F.texturedBlack, { rough: 0.4 }), bm);
    if (ctx.micro) {
      for (let k = 0; k < 8; k++) {
        const aa = (k / 8) * Math.PI * 2;
        ctx.add('chassis', bolt(0.0045, 0.006, true), F.steel, mul(bm, T(Math.cos(aa) * 0.082, 0.004, Math.sin(aa) * 0.086)));
      }
    }
    // Chrome pushrod tubes along the top of the barrel
    for (const dz of [-0.042, 0.042]) {
      ctx.add('chassis', rod([s * 0.14, y + 0.105, z + dz], [s * (h0 + 0.05), y + 0.118, z + dz * 0.9], 0.0085, 0.0085, ctx.seg(12, 6)), o.bright);
    }
    // Intake runner from the head top into the frame
    const intake = catmull([[s * (h0 + 0.05), y + 0.115, z + 0.02], [s * (h0 - 0.02), y + 0.18, z + 0.02], [s * 0.1, y + 0.235, z + 0.0]], ctx.seg(6, 3)).map((q) => [q[0], q[1], q[2]] as P3);
    ctx.add('chassis', sweep(intake, circle(0.02, ctx.seg(14, 6)), { capStart: true, capEnd: true }), F.black);
    // Exhaust port on the underside of the head, pointing forward/down
    const pp: P3 = [s * (h0 + 0.045), y - 0.085, z - 0.075];
    const dir: P3 = [s * 0.12, -0.42, -0.9];
    ports.push({ pos: pp, dir, cyl: s < 0 ? 0 : 1 });
    ctx.add('chassis', lathe([[0.022, 0], [0.04, 0], [0.04, 0.012], [0.022, 0.012]], { segs: ctx.seg(20, 8), axis: 'y', sharp: true }), F.chrome, alongY(pp, [pp[0] + dir[0] * 0.012, pp[1] + dir[1] * 0.012, pp[2] + dir[2] * 0.012]));
  }
  return ports;
}
