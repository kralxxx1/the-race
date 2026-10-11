import * as THREE from 'three';
import { type KitContext } from '../context';
import { sideAt, type OutlineBody } from '../kit/shape';
import { MeshData, extrude, lathe, smooth2, type P2 } from '../mesh';
import { F, hard, type Finish } from '../sink';
import { cut, fAnd, offsetSurface, sideRegion, type Field } from '../surface';

/**
 * Shared bodywork parts for the Kawasaki supersport family and the RC 390:
 * lights and ducts that follow the fairing surface exactly (cut from the same
 * master surface the panels come from), louvred vents and fasteners.
 */

export interface InsetLampOpts {
  /** How far the reflector floor sits behind the skin (keep below the panel flange depth). */
  recess?: number;
  /** Emitter regions (LED blocks / projector faces) inside the lamp opening. */
  emit?: Field[];
  /** Position-light (DRL) guide regions inside the opening. */
  drl?: Field[];
  /** Lamp kind of the main emitters. */
  kind?: 'head' | 'tail';
  /** Reflector floor finish (default bright chrome bowl). */
  floor?: Finish;
}

/**
 * Headlight / tail light set into the fairing: a clear lens patch on the skin, a
 * reflector floor behind it and the emitters in between, all cut from `master`
 * with the opening `region` (the panel itself is cut with the same region, so its
 * folded edge forms the lamp housing wall).
 */
export function insetLamp(ctx: KitContext, master: MeshData, region: Field, o: InsetLampOpts = {}): void {
  const recess = o.recess ?? 0.011;
  const glass = cut(master, region);
  if (!glass.tcount) return;
  ctx.add('chassis', offsetSurface(glass, -0.0025), o.kind === 'tail' ? hard('#2a0505', 0, 0.06, 1) : F.lens);
  ctx.add('chassis', offsetSurface(glass, -recess), o.floor ?? hard('#c9ccd1', 1, 0.14));
  const emit = o.kind === 'tail' ? F.tail : F.head;
  for (const e of o.emit ?? []) {
    const m = cut(master, fAnd(region, e));
    if (m.tcount) ctx.add('chassis', offsetSurface(m, -recess + 0.003), emit);
  }
  for (const d of o.drl ?? []) {
    const m = cut(master, fAnd(region, d));
    if (m.tcount) ctx.add('chassis', offsetSurface(m, -recess + 0.004), F.drl);
  }
}

/** Dark duct floor behind an opening cut from `master` (intakes, vents, wing ducts). */
export function ductFloor(ctx: KitContext, master: MeshData, region: Field, depth: number, f: Finish = F.texturedBlack): MeshData {
  const m = cut(master, region);
  if (m.tcount) ctx.add('chassis', offsetSurface(m, -depth), f);
  return m;
}

/**
 * Louvred side vent: a dark duct floor following the skin behind the panel opening
 * (side-view outline, cut from `master`) plus `n` slanted fins just inside the skin.
 */
export function louvredVent(ctx: KitContext, ob: OutlineBody, master: MeshData, outline: readonly P2[], n: number, finFinish: Finish = hard('#0b0c0e', 0.15, 0.25, 1), slope = 0.012): void {
  let z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [z, y] of outline) {
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  ductFloor(ctx, master, sideRegion(smooth2(outline, 3, true)), 0.028);
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const y = y1 - ((i + 0.7) * (y1 - y0)) / (n + 0.4);
      // Each fin sits just inside the skin at its own height (the flank curves in towards the bottom).
      let xf = Infinity;
      for (let k = 0; k <= 4; k++) xf = Math.min(xf, Math.abs(sideAt(ob, z0 + 0.012 + ((z1 - z0 - 0.024) * k) / 4, y, s).p[0]));
      const fin: P2[] = [[z0 + 0.012, y + slope], [z1 - 0.012, y], [z1 - 0.012, y - 0.007], [z0 + 0.012, y + slope - 0.007]];
      ctx.add('chassis', extrude(fin, 0.022, { plane: 'zy', center: s * (xf - 0.016) }), finFinish);
    }
  }
}

/** Flush fairing fasteners at side-view points (both sides). */
export function fasteners(ctx: KitContext, ob: OutlineBody, pts: readonly P2[], f: Finish = F.texturedBlack, r = 0.0055): void {
  if (!ctx.micro) return;
  for (const s of [-1, 1]) {
    for (const [z, y] of pts) {
      const sp = sideAt(ob, z, y, s);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(...sp.n).negate(), new THREE.Vector3(0, 1, 0));
      m.setPosition(sp.p[0] + sp.n[0] * 0.001, sp.p[1], sp.p[2]);
      ctx.add('chassis', lathe([[0, 0], [r, 0], [r * 0.9, 0.0025], [0, 0.003]], { segs: 10, axis: 'z' }), f, m);
    }
  }
}
