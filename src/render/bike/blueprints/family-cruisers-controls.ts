import * as THREE from 'three';
import { T, mul, type KitContext } from '../context';
import { extrude, lathe, rod, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, type Finish } from '../sink';
import { tubeAlong } from './family-cruisers-parts';

/**
 * Foot controls of the cruiser family. The blueprints set `footrests: 'scooter'` (which makes the
 * generic kit skip its sport-style rearsets and kickstand) and build their own here.
 */

const rotZ = (s: number) => new THREE.Matrix4().makeRotationZ(s > 0 ? -Math.PI / 2 : Math.PI / 2);

export interface FootPegOpts {
  /** Peg centre (right side, bike space). */
  at: P3;
  /** Hanger plate / pedal finish. */
  f: Finish;
  /** Peg finish (rubber sleeve by default). */
  peg?: Finish;
  len?: number;
  r?: number;
  /** Swingarm pivot (hanger plates reach up to it). */
  pivot: P3;
}

/** Mid-mounted rubber footpegs with stamped hanger plates, gear lever (left) and brake pedal (right). */
export function footPegs(ctx: KitContext, o: FootPegOpts): void {
  const len = o.len ?? 0.085;
  const r = o.r ?? 0.0125;
  for (const s of [-1, 1]) {
    const P: P3 = [s * Math.abs(o.at[0]), o.at[1], o.at[2]];
    const hx = s * (Math.abs(o.at[0]) - 0.045);
    // Short stamped bracket from the peg towards the swingarm pivot (not all the way).
    const az = P[2] * 0.6 + o.pivot[2] * 0.4;
    const ay = P[1] * 0.5 + o.pivot[1] * 0.5;
    const outline = smooth2([[P[2] + 0.035, P[1] + 0.03], [az - 0.02, ay + 0.03], [az + 0.06, ay - 0.0], [P[2] + 0.06, P[1] - 0.05], [P[2] - 0.02, P[1] - 0.035]], ctx.micro ? 4 : 2, true);
    ctx.add('chassis', extrude(outline, 0.008, { plane: 'zy', bevel: 0.002, center: hx, curveSegs: 1 }), o.f);
    // Peg: steel pin + rubber sleeve
    ctx.add('chassis', lathe([[0, 0], [r * 0.5, 0], [r * 0.5, len], [0, len]], { segs: 8, axis: 'y', sharp: true }), F.steel, mul(T(hx, P[1], P[2]), rotZ(s)));
    ctx.add('chassis', lathe([[r * 0.5, 0.004], [r, 0.006], [r, len - 0.012], [r * 0.6, len - 0.004], [0, len]], { segs: ctx.seg(16, 8), axis: 'y' }), o.peg ?? F.rubber, mul(T(hx + s * 0.004, P[1], P[2]), rotZ(s)));
    // Pedal: gear lever (left) / brake pedal (right)
    const pivotP: P3 = [hx + s * 0.012, P[1] + 0.012, P[2] + 0.06];
    const toe: P3 = [hx + s * 0.05, P[1] - 0.005, P[2] - 0.15];
    tubeAlong(ctx, 'chassis', [pivotP, [pivotP[0] + s * 0.01, pivotP[1] - 0.012, pivotP[2] - 0.07], toe], 0.0065, o.f);
    ctx.add('chassis', roundBox(0.045, 0.012, 0.03, 0.005), F.rubber, T(toe[0] + s * 0.012, toe[1] - 0.004, toe[2]));
    if (s < 0) {
      // linkage up to the shift shaft
      ctx.add('chassis', rod([hx + s * 0.012, P[1] + 0.02, P[2] + 0.04], [s * 0.14, P[1] + 0.05, P[2] + 0.2], 0.004, 0.004, 8), F.steel);
    }
  }
}

/** Side stand on the left. */
export function sideStand(ctx: KitContext, f: Finish = F.black): void {
  const pv = ctx.hp.pivot;
  const peg = ctx.bp.rider.peg;
  const a: P3 = [-Math.abs(peg[0]) + 0.02, 0.25, pv[2] - 0.1];
  const b: P3 = [-Math.abs(peg[0]) - 0.03, 0.22, pv[2] + 0.2];
  tubeAlong(ctx, 'chassis', [a, [(a[0] + b[0]) / 2, 0.225, (a[2] + b[2]) / 2], b], 0.0095, f);
  ctx.add('chassis', roundBox(0.035, 0.008, 0.055, 0.003), f, T(b[0], b[1] - 0.004, b[2]));
}

/** Pillion pegs with folding stubs. */
export function pillionPegs(ctx: KitContext, at: P3, f: Finish = F.castAlu): void {
  for (const s of [-1, 1]) {
    const pp: P3 = [s * Math.abs(at[0]), at[1], at[2]];
    ctx.add('chassis', rod([s * 0.1, pp[1] + 0.06, pp[2] - 0.03], pp, 0.008, 0.008, 8), f);
    ctx.add('chassis', lathe([[0, 0], [0.01, 0], [0.01, 0.06], [0, 0.06]], { segs: 10, axis: 'y', sharp: true }), F.rubber, mul(T(...pp), rotZ(s)));
  }
}

/** Rider floorboards (Harley / Indian style): flat boards on a bracket, forward-set. */
export function floorBoards(ctx: KitContext, at: P3, o: { len?: number; wid?: number; f?: Finish; pad?: Finish } = {}): void {
  const len = o.len ?? 0.27;
  const wid = o.wid ?? 0.11;
  const f = o.f ?? F.chrome;
  for (const s of [-1, 1]) {
    const x = s * Math.abs(at[0]);
    // Board plan outline (x, z), extruded in y.
    const plan: P2[] = smooth2([[-wid * 0.5, -len * 0.5], [wid * 0.5, -len * 0.5], [wid * 0.56, len * 0.35], [wid * 0.4, len * 0.5], [-wid * 0.5, len * 0.5]], 3, true);
    ctx.add('chassis', extrude(plan, 0.016, { plane: 'xz', bevel: 0.005, curveSegs: 1, center: 0 }), f, T(x, at[1] - 0.01, at[2]));
    ctx.add('chassis', extrude(plan.map(([a, b]) => [a * 0.82, b * 0.9] as P2), 0.004, { plane: 'xz', center: 0 }), o.pad ?? F.rubber, T(x, at[1] + 0.001, at[2]));
    // Bracket back to the frame
    tubeAlong(ctx, 'chassis', [[s * 0.12, at[1] + 0.03, at[2] + 0.14], [s * 0.16, at[1] - 0.01, at[2] + 0.1], [x, at[1] - 0.012, at[2] + 0.04]], 0.011, f);
  }
}
