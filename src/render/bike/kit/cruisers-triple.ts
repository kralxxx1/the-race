import * as THREE from 'three';
import { T, mul, type KitContext } from '../context';
import { alongY, bolt, catmull, circle, lathe, roundBox, sweep, type P3 } from '../mesh';
import { F, Micro, vary, type Finish } from '../sink';
import type { EnginePort } from './cruisers-engine';

/**
 * Triumph Rocket 3: a 2458 cc inline three mounted *longitudinally* (crankshaft along the bike), cylinders
 * leaning to the right, headers leaving the right side of the head, intake on the left/top, big
 * front cover, shaft drive out of the rear of the gearbox. Replaces the generic kit engine.
 */

export interface TripleOpts {
  /** Crank axis height and the centre of the crankcase in z. */
  y: number;
  zc: number;
  /** Cylinder pitch (bore spacing, m). */
  pitch: number;
  /** Cylinder lean from vertical towards the right (deg). */
  leanDeg: number;
  black: Finish;
  /** Head / cam cover finish. */
  camF: Finish;
  /** Bright trim finish (cover rings). */
  trim: Finish;
  frontF: Finish;
  camText?: string;
}

export function buildRocketTriple(ctx: KitContext, o: TripleOpts): EnginePort[] {
  const ports: EnginePort[] = [];
  const cast = (f: Finish) => vary(f, { micro: Micro.cast });
  const black = cast(o.black);
  const t = (o.leanDeg * Math.PI) / 180;
  const axis = new THREE.Vector3(Math.sin(t), Math.cos(t), 0);
  const perp = new THREE.Vector3(Math.cos(t), -Math.sin(t), 0); // towards the right/down
  const c = new THREE.Vector3(0, o.y, o.zc);
  const L = o.pitch * 3 + 0.03;
  // Frame of the block: local X = perp (right/down), Y = axis, Z = +z
  const blockM = (d: number, side = 0): THREE.Matrix4 => {
    const m = new THREE.Matrix4().makeBasis(perp, axis, new THREE.Vector3(0, 0, 1));
    const p = c.clone().addScaledVector(axis, d).addScaledVector(perp, side);
    m.setPosition(p.x, p.y, p.z);
    return m;
  };
  // Crankcase + sump + gearbox
  ctx.add('chassis', roundBox(0.34, 0.3, 0.56, 0.08, ctx.micro ? 3 : 2), black, T(0, o.y, o.zc));
  ctx.add('chassis', roundBox(0.28, 0.08, 0.48, 0.035, 2), black, T(0, o.y - 0.18, o.zc + 0.02));
  if (ctx.micro) for (let i = 0; i < 8; i++) ctx.add('chassis', roundBox(0.285, 0.013, 0.0045, 0.002, 1), vary(F.polishedAlu, { rough: 0.3 }), T(0, o.y - 0.195, o.zc - 0.17 + i * 0.045));
  // Cylinder block (water jacket ribs on the left face), head and cam cover along the lean axis
  ctx.add('chassis', roundBox(0.19, 0.25, L, 0.045, 3), black, blockM(0.2));
  if (ctx.micro) {
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 5; k++) {
        const z = o.zc + (i - 1) * o.pitch;
        ctx.add('chassis', roundBox(0.004, 0.17, 0.012, 0.002, 1), black, mul(blockM(0.2, -0.0975), T(0, 0, z - o.zc - 0.03 + k * 0.015)));
      }
    }
  }
  ctx.add('chassis', roundBox(0.215, 0.13, L + 0.02, 0.05, 3), cast(vary(o.black, { color: o.black.color })), blockM(0.385));
  if (ctx.micro) for (let i = 0; i < 4; i++) ctx.add('chassis', roundBox(0.228, 0.004, L + 0.034, 0.05, 1), vary(F.polishedAlu, { rough: 0.3 }), blockM(0.335 + i * 0.026));
  ctx.add('chassis', roundBox(0.19, 0.055, L - 0.01, 0.04, 3), o.camF, blockM(0.485));
  if (ctx.micro && o.camText) {
    const r = ctx.label(o.camText, { color: '#d6d8dc', weight: '900', italic: true }, 64);
    const p = c.clone().addScaledVector(axis, 0.515);
    ctx.decal('chassis', r, 0.04, [p.x, p.y, p.z], [axis.x, axis.y, axis.z], [-perp.x, -perp.y, 0]);
  }
  // Raised rim on the cam cover
  ctx.add('chassis', roundBox(0.205, 0.008, L + 0.004, 0.05, 2), o.trim, blockM(0.455));
  // Intake: three throttle-body trumpets on the left of the head going up to the airbox
  for (let i = 0; i < 3; i++) {
    const z = o.zc + (i - 1) * o.pitch;
    const a = c.clone().addScaledVector(axis, 0.38).addScaledVector(perp, -0.095);
    a.z = z;
    const path = catmull([[a.x, a.y, a.z], [a.x - 0.04, a.y + 0.07, a.z], [a.x - 0.03, a.y + 0.15, a.z + (i - 1) * -0.01]], ctx.seg(6, 3)).map((q) => [q[0], q[1], q[2]] as P3);
    ctx.add('chassis', sweep(path, circle(0.026, ctx.seg(16, 6)), { capStart: true, capEnd: true }), F.black);
  }
  // Exhaust ports on the right/lower side of the head
  for (let i = 0; i < 3; i++) {
    const z = o.zc + (i - 1) * o.pitch;
    const p = c.clone().addScaledVector(axis, 0.385).addScaledVector(perp, 0.11);
    const pos: P3 = [p.x, p.y, z];
    const dir: P3 = [perp.x, perp.y - 0.3, 0];
    const n = Math.hypot(dir[0], dir[1]);
    ports.push({ pos, dir: [dir[0] / n, dir[1] / n, 0], cyl: i });
    ctx.add('chassis', lathe([[0.02, 0], [0.043, 0], [0.043, 0.01], [0.02, 0.01]], { segs: ctx.seg(20, 8), axis: 'y', sharp: true }), F.chrome, alongY(pos, [pos[0] + dir[0] / n * 0.01, pos[1] + dir[1] / n * 0.01, pos[2]]));
  }
  // Front alternator / crank cover and the gearbox + clutch housing behind
  const flipZ = new THREE.Matrix4().makeScale(1, 1, -1);
  ctx.add('chassis', lathe([[0, 0], [0.135, 0], [0.142, 0.014], [0.13, 0.034], [0.06, 0.044], [0, 0.045]], { segs: ctx.seg(48, 16), axis: 'z', sharp: [1] }).transform(flipZ), o.frontF, T(0, o.y + 0.005, o.zc - 0.28));
  ctx.add('chassis', lathe([[0.138, 0], [0.147, 0.004], [0.147, 0.014], [0.138, 0.018]], { segs: ctx.seg(48, 14), axis: 'z', sharp: true }).transform(flipZ), vary(F.polishedAlu, { rough: 0.15 }), T(0, o.y + 0.005, o.zc - 0.276));
  ctx.add('chassis', lathe([[0, 0], [0.145, 0], [0.15, 0.03], [0.14, 0.2], [0.115, 0.24], [0, 0.24]], { segs: ctx.seg(40, 14), axis: 'z', sharp: [1, 3] }), black, T(0, o.y - 0.03, o.zc + 0.26));
  // Bolts round the front cover
  if (ctx.micro) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      m.setPosition(Math.sin(a) * 0.115, o.y + 0.005 + Math.cos(a) * 0.115, o.zc - 0.286);
      ctx.add('chassis', bolt(0.0045, 0.006, true), F.steel, m);
    }
  }
  return ports;
}
