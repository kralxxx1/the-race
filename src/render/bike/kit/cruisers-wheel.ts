import * as THREE from 'three';
import { T, type KitContext } from '../context';
import { bolt, lathe, type P2 } from '../mesh';
import { F, vary, type Finish } from '../sink';

/**
 * Solid "Lakester" style disc wheel face drawn over the kit's plain disc wheel (blueprints use
 * `WheelDesign.type = 'disc'`; this adds the dished face, hub cap, bead rings and bolts on both sides).
 * Wheel-local frame: axle along X, origin at the axle centre; the faces are added to the rotating
 * wheel group (not the spokes) so they stay visible at speed.
 */

export interface DiscFaceOpts {
  /** Face finish (chrome / painted alloy). */
  face: Finish;
  /** Hub cap finish. */
  cap: Finish;
  /** Number of bolts around the hub (0 = none). */
  bolts?: number;
  /** Concentric bead rings at these radius fractions of the rim radius. */
  rings?: readonly number[];
  /** How far the hub area is recessed below the rim edge (m). */
  dish?: number;
}

export function discWheelFace(ctx: KitContext, front: boolean, o: DiscFaceOpts): void {
  const hp = ctx.hp;
  const end = front ? ctx.bp.front : ctx.bp.rear;
  const t = front ? hp.front : hp.rear;
  const axle = front ? hp.frontAxle : hp.rearAxle;
  const group = front ? 'frontWheel' : 'rearWheel';
  const hw = (end.rimWidthIn * 0.0254) / 2;
  const R = t.rimR - 0.014;
  const dish = o.dish ?? 0.012;
  const segs = ctx.seg(96, 28);
  const edge = hw - 0.003;
  // [radius, axial] from the rim inwards (solid on the left → faces +X).
  const prof: P2[] = [
    [R, edge - 0.002],
    [R - 0.006, edge],
    [R * 0.9, edge - dish * 0.1],
    [R * 0.72, edge - dish * 0.35],
    [R * 0.5, edge - dish * 0.7],
    [R * 0.34, edge - dish],
    [0.062, edge - dish],
    [0.056, edge - dish + 0.003],
    [0.05, edge - dish + 0.011],
    [0.046, edge - dish + 0.014],
    [0.03, edge - dish + 0.016],
    [0, edge - dish + 0.016],
  ];
  const side = lathe(prof, { segs, axis: 'x', sharp: [1, 6, 8] });
  const capProf: P2[] = [
    [0.05, edge - dish + 0.012],
    [0.046, edge - dish + 0.019],
    [0.034, edge - dish + 0.024],
    [0.012, edge - dish + 0.026],
    [0, edge - dish + 0.026],
  ];
  const cap = lathe(capProf, { segs: ctx.seg(40, 14), axis: 'x' });
  const m = new THREE.Matrix4();
  for (const s of [1, -1]) {
    const flip = s < 0 ? new THREE.Matrix4().makeScale(-1, 1, 1) : m;
    const base = T(axle[0], axle[1], axle[2]).multiply(flip);
    ctx.add(group, side.clone(), o.face, base);
    ctx.add(group, cap.clone(), o.cap, base);
    for (const f of o.rings ?? []) {
      const rr = R * f;
      const ax = edge - dish * (1 - Math.min(1, (rr - 0.062) / (R - 0.062))) * 0.9;
      ctx.add(group, lathe([[rr - 0.004, ax - 0.001], [rr - 0.0015, ax + 0.0025], [rr + 0.0015, ax + 0.0025], [rr + 0.004, ax - 0.001]], { segs, axis: 'x' }), vary(o.face, { rough: 0.1 }), base);
    }
    if (ctx.micro && (o.bolts ?? 0) > 0) {
      const n = o.bolts!;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const bm = T(s * (edge - dish + 0.016), Math.cos(a) * 0.04, Math.sin(a) * 0.04).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
        ctx.add(group, bolt(0.0042, 0.005, true), F.steel, T(axle[0], axle[1], axle[2]).multiply(bm));
      }
    }
  }
}
