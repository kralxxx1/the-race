import * as THREE from 'three';
import { RZ, T, mul, type KitContext } from '../context';
import { MeshData, alongY, bolt, extrude, lathe, rod, roundBox, smooth2, sweep, circle, catmull, type P2, type P3 } from '../mesh';
import { F, hard, Micro, vary, type Finish } from '../sink';

/**
 * Hand-built engines for the cruiser family. These replace the generic kit engine (blueprints list
 * `skip:engine` in `features` and call these from `body`).
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = (v: THREE.Vector3): P3 => [v.x, v.y, v.z];

export interface EnginePort {
  pos: P3;
  /** Unit direction the header leaves the port. */
  dir: P3;
  /** Which cylinder (0 = front). */
  cyl: number;
}

// ───────────────────────────── air-cooled 45° / 49° V-twin ─────────────────────────────

export interface VTwinOpts {
  /** Crankshaft centre (bike space). */
  crank: P3;
  /** Included angle between the banks (deg). */
  bankDeg: number;
  /** Front bank axis angle above horizontal, measured towards the front (deg). 90 − bank/2 for a symmetric V. */
  frontDeg: number;
  /** Barrel core radius (m). */
  bore: number;
  /** Half-width of the square-ish cooling fins (m). */
  finHalf: number;
  /** Barrel length (m, base → head). */
  barrelLen: number;
  finCount: number;
  /** Case / barrel / head finish (black cast). */
  black: Finish;
  /** Bright parts: rocker covers, pushrod tubes, covers. */
  bright: Finish;
  /** Secondary bright finish for covers (primary / trans). */
  coverF: Finish;
  /** Air-cleaner finish. */
  airF: Finish;
  airCleaner: 'round' | 'teardrop' | 'oval';
  /** Primary cover on the left: size scale. */
  primaryScale?: number;
  /** Text printed on the rocker covers. */
  rockerText?: string;
  /** Machined fin-edge finish (polished edge rims). */
  finEdge?: Finish;
  /** Indian-style: cylinder heads with a pronounced top ribbed cover. */
  ribbed?: boolean;
}

/** Builds the engine and returns the exhaust ports (front cylinder first). */
export function buildVTwin(ctx: KitContext, o: VTwinOpts): EnginePort[] {
  const c = V(...o.crank);
  const ports: EnginePort[] = [];
  const phiF = (o.frontDeg * Math.PI) / 180;
  const phiR = phiF + (o.bankDeg * Math.PI) / 180;
  const dirOf = (phi: number) => V(0, Math.sin(phi), -Math.cos(phi));
  const cast = (f: Finish) => vary(f, { micro: Micro.cast });
  const black = cast(o.black);

  // ── crankcase (left/right halves) ──
  const zf = c.z - 0.2, zr = c.z + 0.3;
  const yb = c.y - 0.15;
  const outline = smooth2(
    [
      [zf, c.y + 0.04],
      [zf - 0.01, c.y - 0.06],
      [zf + 0.05, yb],
      [c.z + 0.1, yb - 0.02],
      [zr - 0.05, yb + 0.0],
      [zr + 0.01, c.y - 0.03],
      [zr - 0.02, c.y + 0.1],
      [c.z + 0.1, c.y + 0.13],
      [c.z - 0.1, c.y + 0.1],
    ],
    ctx.micro ? 5 : 3,
    true,
  );
  ctx.add('chassis', extrude(outline, 0.2, { plane: 'zy', bevel: 0.03, bevelSegs: ctx.micro ? 3 : 2, curveSegs: 1 }), black);
  // Oil pan
  ctx.add('chassis', roundBox(0.17, 0.05, 0.4, 0.02, 2), black, T(0, yb - 0.02, c.z + 0.1));
  // Oil filter (front, right of centre, angled forward like the Softail)
  ctx.add('chassis', lathe([[0, 0], [0.04, 0], [0.042, 0.006], [0.042, 0.1], [0.036, 0.11], [0, 0.112]], { segs: ctx.seg(24, 10), axis: 'y', sharp: [1, 3] }), hard('#18191c', 0.4, 0.4, 0.8), alongY([0.05, c.y - 0.05, zf - 0.005], [0.05, c.y - 0.1, zf - 0.11]));

  const heads: { top: THREE.Vector3; d: THREE.Vector3; front: boolean }[] = [];
  const banks: [number, boolean][] = [[phiF, true], [phiR, false]];
  for (const [phi, front] of banks) {
    const d = dirOf(phi);
    const base = c.clone().addScaledVector(d, 0.07);
    const top = base.clone().addScaledVector(d, o.barrelLen);
    const along = alongY(P(base), P(top));
    // Barrel core + cooling fins (+ machined polished edges)
    ctx.add('chassis', lathe([[0, 0], [o.bore + 0.006, 0], [o.bore + 0.006, o.barrelLen], [0, o.barrelLen]], { segs: ctx.seg(28, 12), axis: 'y', sharp: [1, 2] }), black, along);
    const nf = o.finCount;
    for (let i = 0; i < nf; i++) {
      const a = 0.012 + (i * (o.barrelLen - 0.026)) / Math.max(1, nf - 1);
      // Fins grow slightly towards the head (like a real barrel) and are square-ish with rounded corners.
      const h = o.finHalf * (0.9 + 0.1 * (i / nf));
      ctx.add('chassis', roundBox(h * 2, 0.0034, h * 2, h * 0.5, 1), black, mul(along, T(0, a, 0)));
      if (o.finEdge && ctx.micro) ctx.add('chassis', roundBox(h * 2 + 0.0008, 0.0014, h * 2 + 0.0008, h * 0.5, 1), o.finEdge, mul(along, T(0, a, 0)));
    }
    // Head: big finned casting
    const hb = top.clone();
    const ht = top.clone().addScaledVector(d, 0.1);
    const hAlong = alongY(P(hb), P(ht));
    ctx.add('chassis', roundBox(o.finHalf * 2 + 0.012, 0.1, o.finHalf * 2 + 0.014, 0.034, 3), black, mul(hAlong, T(0, 0.05, 0)));
    for (let i = 0; i < 4; i++) {
      const a = 0.012 + i * 0.022;
      const h = o.finHalf * 1.04;
      ctx.add('chassis', roundBox(h * 2, 0.0034, h * 2 + 0.01, h * 0.5, 1), black, mul(hAlong, T(0, a, 0)));
      if (o.finEdge && ctx.micro) ctx.add('chassis', roundBox(h * 2 + 0.0008, 0.0014, h * 2 + 0.0108, h * 0.5, 1), o.finEdge, mul(hAlong, T(0, a, 0)));
    }
    // Rocker box (black) + rocker cover (bright)
    const rb = ht.clone();
    const rt = rb.clone().addScaledVector(d, 0.035);
    ctx.add('chassis', roundBox(o.finHalf * 2 - 0.004, 0.035, o.finHalf * 2, 0.026, 3), black, mul(alongY(P(rb), P(rt)), T(0, 0.0175, 0)));
    const cb = rt.clone();
    const ct = cb.clone().addScaledVector(d, o.ribbed ? 0.05 : 0.042);
    const cAlong = alongY(P(cb), P(ct));
    ctx.add('chassis', roundBox(o.finHalf * 2 - 0.016, o.ribbed ? 0.05 : 0.042, o.finHalf * 2 - 0.012, 0.03, 3), o.bright, mul(cAlong, T(0, 0.02, 0)));
    if (ctx.micro) {
      // Raised bead around the rocker cover base and a cap plate on top.
      ctx.add('chassis', roundBox(o.finHalf * 2 - 0.006, 0.006, o.finHalf * 2 - 0.002, 0.028, 2), o.bright, mul(cAlong, T(0, 0.003, 0)));
      ctx.add('chassis', roundBox(o.finHalf * 1.1, 0.004, o.finHalf * 1.1, 0.02, 2), F.texturedBlack, mul(cAlong, T(0, (o.ribbed ? 0.05 : 0.042) + 0.0, 0)));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.add('chassis', bolt(0.0042, 0.006, true), F.steel, mul(cAlong, T(Math.cos(a) * o.finHalf * 0.78, 0.0, Math.sin(a) * o.finHalf * 0.78)));
      }
      if (o.rockerText) {
        const r = ctx.label(o.rockerText, { color: '#111214', weight: '900' }, 56);
        const p = ct.clone().addScaledVector(d, 0.001).add(V(o.finHalf * 0.0, 0, 0));
        const perp = V(0, Math.cos(phi), Math.sin(phi));
        ctx.decal('chassis', r, 0.02, P(p), P(d), P(perp));
      }
    }
    // Pushrod tubes on the right of each cylinder
    for (const off of [0.02, 0.05]) {
      const a0 = c.clone().addScaledVector(d, 0.065).add(V(o.finHalf * 0.55 + off * 0.2, 0, 0));
      const a1 = base.clone().addScaledVector(d, o.barrelLen + 0.06).add(V(o.finHalf * 0.55 + off * 0.2, 0, 0));
      ctx.add('chassis', rod(P(a0), P(a1), 0.0075, 0.0075, ctx.seg(12, 6)), o.bright);
      void off;
    }
    // Exhaust port: flange on the head front (front cylinder) or rear (rear cylinder).
    const perp = V(0, Math.cos(phi), Math.sin(phi));
    const out = front ? perp.clone().negate() : perp.clone();
    // Perp for the front bank points rearwards/up; the front exhaust leaves forward/down → -perp; for the rear bank perp points rearwards/up → exhaust goes rear/down → (0,-cos,.. ) handled below.
    const exDir = front ? V(0, -Math.cos(phi) * -1, -Math.sin(phi)).normalize() : V(0, Math.cos(phi) * -1, Math.sin(phi)).normalize();
    void out;
    const exPos = top.clone().addScaledVector(d, 0.045).addScaledVector(exDir, o.finHalf * 0.82);
    ports.push({ pos: P(exPos), dir: P(exDir), cyl: front ? 0 : 1 });
    ctx.add('chassis', lathe([[0.018, 0], [0.035, 0], [0.035, 0.012], [0.018, 0.012]], { segs: ctx.seg(20, 8), axis: 'y', sharp: true }), F.chrome, alongY(P(exPos.clone().addScaledVector(exDir, -0.004)), P(exPos.clone().addScaledVector(exDir, 0.012))));
    heads.push({ top, d, front });
  }

  // ── air cleaner (right) with intake tubes ──
  const hf = heads[0], hr = heads[1];
  const mid = hf.top.clone().add(hr.top).multiplyScalar(0.5).addScaledVector(V(0, 1, 0), 0.0);
  const acC = V(o.finHalf + 0.07, mid.y + 0.015, mid.z + 0.0);
  const acR = o.airCleaner === 'round' ? 0.105 : 0.098;
  const profile: P2[] =
    o.airCleaner === 'teardrop'
      ? [[0, 0], [acR * 0.9, 0], [acR, 0.012], [acR, 0.05], [acR * 0.8, 0.075], [acR * 0.4, 0.088], [0, 0.09]]
      : [[0, 0], [acR * 0.92, 0], [acR, 0.01], [acR, 0.045], [acR * 0.88, 0.06], [acR * 0.5, 0.066], [0, 0.066]];
  const ac = lathe(profile, { segs: ctx.seg(48, 16), axis: 'x', sharp: [1, 3] });
  if (o.airCleaner === 'oval') ac.transform(new THREE.Matrix4().makeScale(1, 0.9, 1.1));
  ctx.add('chassis', ac, o.airF, T(acC.x, acC.y, acC.z));
  // Back plate + intake runners to the two heads
  ctx.add('chassis', lathe([[0, -0.012], [acR * 0.86, -0.012], [acR * 0.86, 0], [0, 0]], { segs: ctx.seg(32, 12), axis: 'x', sharp: true }), black, T(acC.x, acC.y, acC.z));
  for (const h of heads) {
    const a = h.top.clone().addScaledVector(h.d, 0.02).add(V(o.finHalf * 0.5, 0, 0));
    const runner = catmull([P(a), P(V(o.finHalf * 0.85, a.y, a.z + (h.front ? 0.02 : -0.02))), P(V(acC.x - 0.01, acC.y + (h.front ? -0.03 : 0.03), acC.z + (h.front ? -0.04 : 0.04)))], ctx.seg(6, 3)).map((q) => [q[0], q[1], q[2]] as P3);
    ctx.add('chassis', sweep(runner, circle(0.021, ctx.seg(14, 6)), { capStart: true, capEnd: true }), black);
  }
  if (ctx.micro) {
    // Air cleaner face: raised ring, central badge plate.
    ctx.add('chassis', lathe([[acR * 0.72, 0.06], [acR * 0.75, 0.068], [acR * 0.7, 0.07]], { segs: ctx.seg(40, 12), axis: 'x' }), F.polishedAlu, T(acC.x, acC.y, acC.z));
    ctx.add('chassis', lathe([[0, 0.066], [acR * 0.34, 0.066], [acR * 0.34, 0.07], [0, 0.07]], { segs: ctx.seg(28, 10), axis: 'x', sharp: true }), F.texturedBlack, T(acC.x, acC.y, acC.z));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.add('chassis', bolt(0.005, 0.006, true), F.steel, mul(T(acC.x + 0.066, acC.y + Math.cos(a) * acR * 0.6, acC.z + Math.sin(a) * acR * 0.6), RZ(-Math.PI / 2)));
    }
  }

  // ── primary cover (left) and transmission side cover (right) ──
  const ps = o.primaryScale ?? 1;
  const prim = smooth2(
    [
      [c.z - 0.09 * ps, c.y + 0.065 * ps],
      [c.z + 0.02, c.y + 0.1 * ps],
      [c.z + 0.2 * ps, c.y + 0.085 * ps],
      [c.z + 0.34 * ps, c.y + 0.03],
      [c.z + 0.33 * ps, c.y - 0.07 * ps],
      [c.z + 0.18 * ps, c.y - 0.115 * ps],
      [c.z - 0.02, c.y - 0.1 * ps],
      [c.z - 0.095 * ps, c.y - 0.04],
    ],
    ctx.micro ? 5 : 3,
    true,
  );
  ctx.add('chassis', extrude(prim, 0.05, { plane: 'zy', bevel: 0.02, bevelSegs: 3, center: -0.135 - 0.025, curveSegs: 1 }), o.coverF);
  // Raised outer step + inspection cap + derby bolts
  const prim2 = prim.map(([z, y]) => [c.z + 0.12 + (z - (c.z + 0.12)) * 0.78, c.y - 0.01 + (y - (c.y - 0.01)) * 0.7] as P2);
  ctx.add('chassis', extrude(prim2, 0.018, { plane: 'zy', bevel: 0.007, center: -0.135 - 0.05 - 0.007, curveSegs: 1 }), vary(o.coverF, { rough: 0.12 }));
  ctx.add('chassis', lathe([[0, 0], [0.04, 0], [0.042, 0.008], [0.04, 0.014], [0, 0.014]], { segs: ctx.seg(28, 10), axis: 'x', sharp: [1, 3] }), vary(o.black, { rough: 0.3 }), mul(T(-0.135 - 0.062, c.y - 0.005, c.z + 0.18 * ps), RZ(Math.PI)));
  if (ctx.micro) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const q = prim[Math.floor(t * (prim.length - 1))];
      void q;
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.add('chassis', bolt(0.0042, 0.005, true), F.steel, mul(T(-0.135 - 0.068, c.y - 0.005 + Math.cos(a) * 0.075 * ps, c.z + 0.17 * ps + Math.sin(a) * 0.12 * ps), RZ(Math.PI / 2)));
    }
  }
  const trans = smooth2(
    [
      [c.z + 0.08, c.y + 0.08],
      [c.z + 0.22, c.y + 0.085],
      [c.z + 0.31, c.y + 0.02],
      [c.z + 0.28, c.y - 0.09],
      [c.z + 0.15, c.y - 0.115],
      [c.z + 0.06, c.y - 0.05],
    ],
    ctx.micro ? 5 : 3,
    true,
  );
  ctx.add('chassis', extrude(trans, 0.04, { plane: 'zy', bevel: 0.016, bevelSegs: 3, center: 0.1 + 0.02, curveSegs: 1 }), o.coverF);
  ctx.add('chassis', lathe([[0, 0], [0.026, 0], [0.028, 0.006], [0.024, 0.01], [0, 0.01]], { segs: ctx.seg(24, 8), axis: 'x', sharp: [1, 3] }), vary(o.black, { rough: 0.35 }), T(0.145, c.y - 0.01, c.z + 0.2));
  // Shift shaft stub on the left rear of the case
  ctx.add('chassis', rod([-0.12, c.y - 0.03, c.z + 0.28], [-0.2, c.y - 0.03, c.z + 0.28], 0.007, 0.007, 10), F.steel);
  return ports;
}

/** Round gauge / lamp style bezel helper used by blueprint code for console details. */
export function bezelRing(r: number, w: number, segs: number): MeshData {
  return lathe([[r - w, 0], [r, 0.002], [r + 0.001, 0.008], [r - w * 0.5, 0.012]], { segs, axis: 'z' });
}
