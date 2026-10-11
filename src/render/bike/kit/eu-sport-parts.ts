import * as THREE from 'three';
import type { KitContext } from '../context';
import { extrude, lathe, smooth2, type MeshData, type P2, type P3 } from '../mesh';
import { F, type Finish, type GroupName } from '../sink';
import { ledStrip } from './lights';
import { frontHit } from './jp-sport-parts';
import { sideAt, type OutlineBody } from './shape';

/**
 * Bodywork helpers for the European sport-bike blueprints (family-eu-sport*.ts).
 * Pure additions: nothing in the shared kit depends on this module.
 */

/** Thin cambered aerofoil (chord along z, thickness along y) extruded across x from x0 to x1 (x0 < x1). */
export function aerofoil(z0: number, z1: number, y: number, x0: number, x1: number, thick: number, camber: number, sweepUp = 0.012): MeshData {
  const n = 10;
  const top: P2[] = [];
  const bot: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = z0 + (z1 - z0) * t;
    const th = thick * 2.6 * Math.sqrt(t) * (1 - t) + 0.0008;
    const c = camber * 4 * t * (1 - t) + t * sweepUp;
    top.push([z, y + c + th / 2]);
    bot.push([z, y + c - th / 2]);
  }
  return extrude([...top, ...bot.reverse()], x1 - x0, { plane: 'zy', center: (x0 + x1) / 2, bevel: 0.0015, curveSegs: 1 });
}

/**
 * LED strip laid on a nose surface along a front-view polyline (bike-space x/y, right
 * side; mirrored for the left), lifted `lift` off the skin along the local normal.
 */
export function noseStrip(ctx: KitContext, ob: OutlineBody, pts: readonly P2[], width: number, kind: 'drl' | 'head' | 'tail' | 'indicator', lift = 0.0015, sides: readonly number[] = [-1, 1], group: GroupName = 'chassis'): void {
  for (const s of sides) {
    const path: P3[] = [];
    let nrm: P3 = [0, 0, -1];
    for (const [x, y] of smooth2(pts, 2, false)) {
      const h = frontHit(ob, s * x, y);
      if (!h) continue;
      path.push([h.p[0] + h.n[0] * lift, h.p[1] + h.n[1] * lift, h.p[2] + h.n[2] * lift]);
      nrm = h.n;
    }
    if (path.length >= 2) ledStrip(ctx, group, path, width, width * 0.55, kind, nrm);
  }
}

/** Domed fastener on an arbitrary point/normal. */
export function stud(ctx: KitContext, p: P3, n: P3, f: Finish = F.texturedBlack, r = 0.0055): void {
  if (!ctx.micro) return;
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(...n).negate(), new THREE.Vector3(0, 1, 0));
  m.setPosition(p[0] + n[0] * 0.001, p[1] + n[1] * 0.001, p[2] + n[2] * 0.001);
  ctx.add('chassis', lathe([[0, 0], [r, 0], [r * 0.9, r * 0.45], [0, r * 0.55]], { segs: 10, axis: 'z' }), f, m);
}

/** |x| of an outline body's skin at side-view (z, y). */
export function skinX(ob: OutlineBody, z: number, y: number): number {
  return Math.abs(sideAt(ob, z, y, 1).p[0]);
}

/**
 * A derived outline body: shifted by (dz, dy) and with its plan-view width scaled by `sx`
 * (side-view heights scaled by `sy` about y0). Used to derive a smaller sister model's
 * bodywork (RS 660 from the RSV4) from the same design lines.
 */
export function moveOutline(ob: OutlineBody, o: { dz?: number; dy?: number; sx?: number; sy?: number; y0?: number }): OutlineBody {
  const dz = o.dz ?? 0, dy = o.dy ?? 0, sx = o.sx ?? 1, sy = o.sy ?? 1, y0 = o.y0 ?? 0;
  const Y = (y: number) => y0 + (y - y0) * sy + dy;
  return {
    ...ob,
    zs: ob.zs.map((z) => z + dz),
    top: (z) => Y(ob.top(z - dz)),
    bottom: (z) => Y(ob.bottom(z - dz)),
    half: (z) => ob.half(z - dz) * sx,
    sections: ob.sections.map((k) => ({ z: k.z + dz, pts: k.pts })),
    xOff: ob.xOff ? (z) => ob.xOff!(z - dz) * sx : undefined,
  };
}
