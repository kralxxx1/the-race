import * as THREE from 'three';
import type { KitContext } from '../context';
import { extrude, rod, smooth2, sphere, tube, type P3 } from '../mesh';
import { frameFinish } from './frame';

/**
 * Tubular steel diamond frame (Yamaha R3 / small sport bikes): twin main tubes from the
 * headstock over the engine to the swingarm pivot, short down tubes to the cylinder-head
 * mounts, a cross tube and pressed pivot plates. Added by the blueprint's body builder on
 * top of a minimal kit frame (`frame.type = 'backbone'`, whose centre tube stays hidden
 * under the tank).
 */
export function steelDiamond(ctx: KitContext, o: { width: number; r: number }): void {
  const fin = frameFinish(ctx);
  const hp = ctx.hp;
  const head = hp.head;
  const pv = hp.pivot;
  const eng = ctx.bp.engine.crank;
  const W = o.width / 2;
  const segs = ctx.seg(12, 6);
  for (const s of [-1, 1]) {
    const main: P3[] = [
      [s * 0.035, head[1] - 0.03, head[2] + 0.03],
      [s * (W * 0.8), head[1] - 0.075, head[2] + 0.2],
      [s * W, pv[1] + 0.3, (head[2] + pv[2]) / 2 + 0.1],
      [s * (W * 0.98), pv[1] + 0.17, pv[2] - 0.05],
      [s * (W * 0.92), pv[1] + 0.02, pv[2] + 0.005],
    ];
    ctx.add('chassis', tube(main, o.r, segs, 10), fin);
    const down: P3[] = [
      [s * 0.03, head[1] - 0.12, head[2] + 0.02],
      [s * (W * 0.55), head[1] - 0.2, head[2] + 0.1],
      [s * (W * 0.62), eng[1] + 0.25, eng[2] - 0.08],
    ];
    ctx.add('chassis', tube(down, o.r * 0.85, segs, 8), fin);
    // Gusset from the down tube to the main tube.
    ctx.add('chassis', rod([s * (W * 0.55), head[1] - 0.19, head[2] + 0.1], [s * (W * 0.86), head[1] - 0.09, head[2] + 0.24], o.r * 0.7, o.r * 0.7, ctx.seg(10, 6), false), fin);
    if (ctx.micro) ctx.add('chassis', sphere(o.r * 1.2, 8, 6), fin, new THREE.Matrix4().setPosition(s * (W * 0.62), eng[1] + 0.25, eng[2] - 0.08));
    // Pressed pivot plate.
    const plate = smooth2([[pv[2] - 0.08, pv[1] + 0.16], [pv[2] + 0.03, pv[1] + 0.19], [pv[2] + 0.055, pv[1] + 0.02], [pv[2] + 0.0, pv[1] - 0.07], [pv[2] - 0.07, pv[1] - 0.03]], ctx.micro ? 3 : 2, true);
    ctx.add('chassis', extrude(plate, 0.012, { plane: 'zy', bevel: 0.004, center: s * (W * 0.95), curveSegs: 1 }), fin);
  }
  ctx.add('chassis', rod([-W * 0.98, pv[1] + 0.22, pv[2] - 0.06], [W * 0.98, pv[1] + 0.22, pv[2] - 0.06], o.r * 0.8, o.r * 0.8, ctx.seg(10, 6)), fin);
}
