import * as THREE from 'three';
import { RZ, T, mul, type KitContext } from '../context';
import { alongY, bolt, extrude, lathe, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, Micro, vary, type Finish } from '../sink';
import type { EnginePort } from './cruisers-engine';

/**
 * Liquid-cooled parallel twin (Honda Rebel 500 class): cylinder block with water-jacket ribs, head with a
 * ribbed cam cover, round clutch and sprocket covers, oil filter and sump. Replaces the generic kit
 * engine (blueprint lists `skip:engine`).
 */

export interface ParallelTwinOpts {
  crank: P3;
  /** Cylinder tilt forward from vertical (deg). */
  tiltDeg: number;
  /** Cylinder spacing (m). */
  pitch: number;
  black: Finish;
  /** Covers (clutch / sprocket). */
  cover: Finish;
  /** Cam cover. */
  cam: Finish;
  /** Machined / polished trim. */
  trim: Finish;
  camText?: string;
}

export function buildParallelTwin(ctx: KitContext, o: ParallelTwinOpts): EnginePort[] {
  const ports: EnginePort[] = [];
  const cast = (f: Finish) => vary(f, { micro: Micro.cast });
  const black = cast(o.black);
  const c = new THREE.Vector3(...o.crank);
  const t = (o.tiltDeg * Math.PI) / 180;
  const axis = new THREE.Vector3(0, Math.cos(t), -Math.sin(t));
  const fwd = new THREE.Vector3(0, -Math.sin(t), -Math.cos(t));
  const W = o.pitch * 2 + 0.03;
  const rot = new THREE.Matrix4().makeRotationX(-t);
  const at = (d: number, f = 0): THREE.Vector3 => c.clone().addScaledVector(axis, d).addScaledVector(fwd, f);

  // Crankcase + sump
  const zf = c.z - 0.13, zr = c.z + 0.2;
  const outline: P2[] = smooth2([[zf, c.y + 0.06], [zf - 0.01, c.y - 0.05], [zf + 0.04, c.y - 0.115], [c.z + 0.1, c.y - 0.125], [zr - 0.02, c.y - 0.09], [zr + 0.005, c.y + 0.0], [zr - 0.03, c.y + 0.09], [c.z + 0.04, c.y + 0.11]], ctx.micro ? 5 : 3, true);
  ctx.add('chassis', extrude(outline, 0.2, { plane: 'zy', bevel: 0.03, bevelSegs: ctx.micro ? 3 : 2, curveSegs: 1 }), black);
  ctx.add('chassis', roundBox(0.16, 0.045, 0.24, 0.02, 2), black, T(0, c.y - 0.14, c.z + 0.04));
  // Oil filter (front, angled down)
  ctx.add('chassis', lathe([[0, 0], [0.036, 0], [0.038, 0.006], [0.038, 0.07], [0.034, 0.078], [0, 0.08]], { segs: ctx.seg(24, 10), axis: 'y', sharp: [1, 3] }), hard2('#1b1c1f'), alongY([0.05, c.y - 0.06, zf - 0.005], [0.05, c.y - 0.1, zf - 0.07]));

  // Cylinder block with water-jacket ribs on the front face, head, ribbed cam cover
  const blk = at(0.15);
  ctx.add('chassis', roundBox(W, 0.19, 0.14, 0.02, 2), black, mul(T(blk.x, blk.y, blk.z), rot));
  if (ctx.micro) {
    for (let i = 0; i < 8; i++) {
      const p = at(0.07 + i * 0.02, 0.07);
      ctx.add('chassis', roundBox(W - 0.012, 0.007, 0.006, 0.002, 1), black, mul(T(p.x, p.y, p.z), rot));
    }
  }
  const hd = at(0.285);
  ctx.add('chassis', roundBox(W + 0.012, 0.085, 0.165, 0.025, 2), black, mul(T(hd.x, hd.y, hd.z), rot));
  const cm = at(0.355);
  ctx.add('chassis', roundBox(W - 0.002, 0.05, 0.15, 0.024, 3), o.cam, mul(T(cm.x, cm.y, cm.z), rot));
  if (ctx.micro) {
    for (let i = 0; i < 6; i++) {
      const p = at(0.372, -0.056 + i * 0.022);
      ctx.add('chassis', roundBox(W - 0.03, 0.006, 0.008, 0.003, 1), vary(o.trim, { rough: 0.35 }), mul(T(p.x, p.y, p.z), rot));
    }
    if (o.camText) {
      const r = ctx.label(o.camText, { color: '#d9dadc', weight: '900', italic: true }, 56);
      const p = at(0.36, 0);
      for (const s of [-1, 1]) ctx.decal('chassis', r, 0.022, [p.x + s * (W / 2 + 0.001), p.y, p.z], [s, 0, 0], [axis.x, axis.y, axis.z]);
    }
  }
  // Ignition coils / plug caps on top
  for (let i = 0; i < 2; i++) {
    const x = (i - 0.5) * o.pitch;
    const p = at(0.395);
    ctx.add('chassis', lathe([[0, 0], [0.016, 0], [0.016, 0.02], [0.012, 0.025], [0, 0.025]], { segs: ctx.seg(14, 6), axis: 'y', sharp: [1, 2] }), F.texturedBlack, mul(T(x, p.y, p.z), rot));
    // Exhaust ports on the front of the head
    const pp = at(0.285, 0.1);
    const d = fwd.clone().multiplyScalar(0.86).addScaledVector(axis, -0.4).normalize();
    ports.push({ pos: [x, pp.y, pp.z], dir: [d.x, d.y, d.z], cyl: i });
  }

  // Side covers: round clutch cover (right), alternator / sprocket cover (left), both with bolt rings
  const cover = (x: number, y: number, z: number, r: number, depth: number, side: number, f: Finish) => {
    const prof: P2[] = [[0, depth], [r * 0.3, depth], [r * 0.34, depth * 0.94], [r * 0.78, depth * 0.9], [r * 0.9, depth * 0.72], [r * 0.97, depth * 0.3], [r, 0], [r * 1.03, -0.004]];
    const m = lathe(prof.slice().reverse() as P2[], { segs: ctx.seg(36, 12), axis: 'x', sharp: [4, 6] });
    ctx.add('chassis', m, f, mul(T(x, y, z), side > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)));
    if (ctx.micro) {
      const n = Math.max(6, Math.round(r * 90));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.add('chassis', bolt(0.0042, 0.005, true), F.steel, mul(T(x + side * depth * 0.2, y + Math.cos(a) * r * 0.93, z + Math.sin(a) * r * 0.93), RZ(side > 0 ? -Math.PI / 2 : Math.PI / 2)));
      }
    }
  };
  cover(0.1 + 0.012, c.y - 0.005, c.z + 0.1, 0.092, 0.035, 1, o.cover);
  cover(-0.1 - 0.012, c.y + 0.005, c.z - 0.015, 0.075, 0.03, -1, o.cover);
  ctx.add('chassis', lathe([[0, 0], [0.028, 0], [0.03, 0.006], [0.026, 0.01], [0, 0.01]], { segs: ctx.seg(24, 8), axis: 'x', sharp: [1, 3] }), vary(o.trim, { rough: 0.3 }), T(0.142, c.y - 0.005, c.z + 0.1));
  // Gear shift shaft + radiator hoses
  ctx.add('chassis', lathe([[0, 0], [0.007, 0], [0.007, 0.07], [0, 0.07]], { segs: 8, axis: 'x', sharp: true }), F.steel, T(-0.13, c.y - 0.03, c.z + 0.17));
  return ports;
}

function hard2(hex: string): Finish {
  return vary(F.engineBlack, { color: new THREE.Color(hex).toArray() as [number, number, number], metal: 0.35 });
}
