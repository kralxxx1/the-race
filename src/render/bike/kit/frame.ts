import * as THREE from 'three';
import { T, type KitContext } from '../context';
import { MeshData, bolt, catmull, extrude, lathe, rod, roundRect, smooth2, sphere, sweep, tube, type P2, type P3 } from '../mesh';
import { F, hard, Micro, type Finish } from '../sink';
import type { ForkLayout } from './front';

/** Frame finish from the blueprint (cast/painted alu, painted steel trellis…). */
export function frameFinish(ctx: KitContext): Finish {
  const f = ctx.bp.frame;
  const micro = f.type === 'twinSpar' || f.type === 'monocoque' ? Micro.cast : Micro.plain;
  return hard(f.color, f.metal, f.rough, f.metal < 0.5 ? 0.9 : 0.3, micro);
}

/** Swept beam with a tall rounded-rectangle section and per-point taper. */
export function beam(path: readonly P3[], h: number, w: number, taper: readonly number[] | null, segs: number, r = 0.012): MeshData {
  const prof = roundRect(h, w, Math.min(r, w * 0.45, h * 0.45), 3);
  const pts = catmull(path, segs).map((p) => [p[0], p[1], p[2]] as P3);
  const scale = taper
    ? pts.map((_, i) => {
        const t = i / (pts.length - 1);
        const k = t * (taper.length - 1);
        const a = Math.floor(k), b = Math.min(taper.length - 1, a + 1);
        const v = taper[a] + (taper[b] - taper[a]) * (k - a);
        return [v, 1] as P2;
      })
    : undefined;
  return sweep(pts, prof, { up: [0, 1, 0], scale, capStart: true, capEnd: true, sharp: undefined });
}

/** Steering head tube along the steering axis between the clamps. */
function headTube(ctx: KitContext, L: ForkLayout, fin: Finish): void {
  const a = ctx.fromSteer([0, L.bottomClampY + 0.008, 0]);
  const b = ctx.fromSteer([0, L.topClampY - L.topClampT - 0.006, 0]);
  ctx.add('chassis', rod(a, b, 0.034, 0.034, ctx.seg(24, 10)), fin);
  ctx.anchor('headTop', b);
  ctx.anchor('headBottom', a);
}

export function buildFrame(ctx: KitContext, L: ForkLayout): void {
  const f = ctx.bp.frame;
  const hp = ctx.hp;
  const fin = frameFinish(ctx);
  const head = hp.head;
  const pv = hp.pivot;
  const eng = ctx.bp.engine.crank;
  headTube(ctx, L, fin);
  const hb = ctx.anchors.get('headBottom')!;
  const ht = ctx.anchors.get('headTop')!;
  const W = (f.width ?? 0.36) / 2;
  const seg = ctx.seg(10, 4);
  switch (f.type) {
    case 'twinSpar': {
      for (const s of [-1, 1]) {
        // Deltabox-style beam: nearly level from the headstock over the engine, then down to the pivot.
        // The beam top stays under the tank's lower edge; it drops to the pivot behind the engine.
        const path: P3[] = [
          [s * 0.03, (hb[1] + ht[1]) / 2, (hb[2] + ht[2]) / 2 + 0.02],
          [s * (W * 0.74), head[1] - 0.115, head[2] + 0.15],
          [s * W, head[1] - 0.2, Math.max(head[2] + 0.3, pv[2] - 0.18)],
          [s * (W - 0.012), pv[1] + 0.22, pv[2] - 0.07],
          [s * (W - 0.03), pv[1] + 0.1, pv[2] - 0.01],
        ];
        ctx.add('chassis', beam(path, 0.12, 0.05, [1.1, 1, 0.95, 0.9, 0.8], seg, 0.014), fin);
        // Lower engine-hanger arm from the head to the front of the cylinder head
        const low: P3[] = [
          [s * 0.035, hb[1] - 0.01, hb[2] + 0.01],
          [s * (W * 0.62), hb[1] - 0.07, hb[2] + 0.12],
          [s * (W * 0.68), eng[1] + 0.28, eng[2] - 0.12],
        ];
        ctx.add('chassis', beam(low, 0.06, 0.03, [1, 0.85, 0.7], seg, 0.01), fin);
        // Pivot plate (cast) around the swingarm pivot
        const plate = smooth2(
          [
            [pv[2] - 0.11, pv[1] + 0.2],
            [pv[2] + 0.02, pv[1] + 0.24],
            [pv[2] + 0.07, pv[1] + 0.12],
            [pv[2] + 0.06, pv[1] - 0.04],
            [pv[2] - 0.0, pv[1] - 0.12],
            [pv[2] - 0.08, pv[1] - 0.1],
            [pv[2] - 0.1, pv[1] + 0.05],
          ],
          ctx.micro ? 4 : 2,
          true,
        );
        ctx.add('chassis', extrude(plate, 0.045, { plane: 'zy', bevel: 0.01, bevelSegs: 2, center: s * (W - 0.035), curveSegs: 1 }), fin);
        // Lightening pockets: darker recessed faces on the outside of the plate.
        if (ctx.micro) {
          const pk = smooth2([[pv[2] - 0.07, pv[1] + 0.16], [pv[2] + 0.02, pv[1] + 0.18], [pv[2] + 0.03, pv[1] + 0.07], [pv[2] - 0.06, pv[1] + 0.05]], 3, true);
          ctx.add('chassis', extrude(pk, 0.004, { plane: 'zy', center: s * (W - 0.035 + 0.021), bevel: 0.0015 }), { ...fin, color: [fin.color[0] * 0.55, fin.color[1] * 0.55, fin.color[2] * 0.55], rough: Math.min(1, fin.rough + 0.15) });
        }
      }
      // Cross brace behind the head (under the airbox)
      ctx.add('chassis', beam([[-W * 0.75, head[1] - 0.1, head[2] + 0.2], [W * 0.75, head[1] - 0.1, head[2] + 0.2]], 0.05, 0.04, null, 2), fin);
      break;
    }
    case 'monocoque': {
      // Short alloy front frame bolted to the cylinder heads (Ducati V4 style).
      for (const s of [-1, 1]) {
        const path: P3[] = [
          [s * 0.035, (hb[1] + ht[1]) / 2, (hb[2] + ht[2]) / 2 + 0.01],
          [s * (W * 0.75), head[1] - 0.06, head[2] + 0.14],
          [s * (W * 0.85), head[1] - 0.14, head[2] + 0.3],
          [s * (W * 0.8), eng[1] + 0.3, eng[2] + 0.06],
        ];
        ctx.add('chassis', beam(path, 0.11, 0.035, [1.1, 1, 0.9, 0.75], seg, 0.012), fin);
      }
      ctx.add('chassis', beam([[-W * 0.7, head[1] - 0.08, head[2] + 0.18], [W * 0.7, head[1] - 0.08, head[2] + 0.18]], 0.06, 0.05, null, 2), fin);
      break;
    }
    case 'trellis':
    case 'boxer': {
      const r = 0.0125;
      for (const s of [-1, 1]) {
        const x0 = s * 0.06;
        const top: P3[] = [
          [x0, ht[1] - 0.03, ht[2] + 0.02],
          [s * (W * 0.75), head[1] - 0.04, head[2] + 0.22],
          [s * W, (head[1] + pv[1]) / 2 + 0.12, (head[2] + pv[2]) / 2 + 0.06],
          [s * (W * 0.95), pv[1] + 0.26, pv[2] - 0.04],
        ];
        const bot: P3[] = [
          [x0, hb[1] + 0.01, hb[2] + 0.03],
          [s * (W * 0.7), hb[1] - 0.08, hb[2] + 0.16],
          [s * (W * 0.85), eng[1] + 0.26, (hb[2] + pv[2]) / 2 + 0.02],
          [s * (W * 0.9), pv[1] + 0.06, pv[2] - 0.02],
        ];
        const topP = catmull(top, 8).map((p) => [p[0], p[1], p[2]] as P3);
        const botP = catmull(bot, 8).map((p) => [p[0], p[1], p[2]] as P3);
        ctx.add('chassis', tube(top, r, ctx.seg(12, 6), 10), fin);
        ctx.add('chassis', tube(bot, r, ctx.seg(12, 6), 10), fin);
        // Triangulation: zig-zag between the rails
        const n = 6;
        const at = (pts: P3[], t: number): P3 => pts[Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))];
        const nodes: P3[] = [];
        for (let i = 0; i <= n; i++) {
          const a = at(topP, i / n);
          const b = at(botP, Math.min(1, (i + 0.5) / n));
          ctx.add('chassis', rod(a, b, r * 0.85, r * 0.85, ctx.seg(10, 5), false), fin);
          if (i < n) ctx.add('chassis', rod(b, at(topP, (i + 1) / n), r * 0.85, r * 0.85, ctx.seg(10, 5), false), fin);
          nodes.push(a, b);
        }
        if (ctx.micro) for (const p of nodes) ctx.add('chassis', sphere(r * 1.25, 8, 6), fin, T(p[0], p[1], p[2]));
        // Cast pivot plate
        // Cast pivot section joining the rails (kept compact: on most trellis bikes it hides behind the footrest hanger).
        const plate = smooth2([[pv[2] - 0.06, pv[1] + 0.2], [pv[2] + 0.035, pv[1] + 0.2], [pv[2] + 0.055, pv[1] - 0.01], [pv[2] - 0.02, pv[1] - 0.07], [pv[2] - 0.07, pv[1] + 0.04]], 3, true);
        ctx.add('chassis', extrude(plate, 0.026, { plane: 'zy', bevel: 0.008, center: s * (W * 0.92), curveSegs: 1 }), F.darkAlu);
      }
      break;
    }
    case 'cradle': {
      const r = 0.016;
      for (const s of [-1, 1]) {
        const x = s * 0.075;
        ctx.add('chassis', tube([[s * 0.02, ht[1] - 0.02, ht[2] + 0.02], [x, ht[1] - 0.04, head[2] + 0.25], [x, hp.seatY - 0.08, hp.seatFront + 0.05], [s * 0.09, hp.seatY - 0.06, hp.seatBack - 0.1]], r, ctx.seg(12, 6), 10), fin);
        ctx.add('chassis', tube([[s * 0.025, hb[1] - 0.02, hb[2]], [x, eng[1] + 0.05, hb[2] + 0.12], [x * 1.3, 0.16, eng[2] - 0.1], [x * 1.3, 0.14, pv[2] - 0.1], [s * 0.1, pv[1] - 0.02, pv[2]], [s * 0.1, hp.seatY - 0.08, pv[2] + 0.02]], r, ctx.seg(12, 6), 10), fin);
      }
      break;
    }
    case 'backbone': {
      ctx.add('chassis', tube([[0, (hb[1] + ht[1]) / 2, ht[2] + 0.02], [0, head[1] - 0.08, head[2] + 0.3], [0, pv[1] + 0.22, pv[2] - 0.1], [0, pv[1] + 0.08, pv[2] - 0.02]], 0.035, ctx.seg(16, 8), 10), fin);
      for (const s of [-1, 1]) ctx.add('chassis', tube([[0, pv[1] + 0.2, pv[2] - 0.08], [s * 0.1, pv[1] + 0.1, pv[2] - 0.03], [s * 0.11, pv[1], pv[2]]], 0.02, 10, 6), fin);
      break;
    }
    case 'scooter': {
      ctx.add('chassis', tube([[0, hb[1] + 0.02, hb[2] + 0.02], [0, 0.3, head[2] + 0.3], [0, 0.22, -0.6], [0, 0.42, pv[2] - 0.05]], 0.03, 12, 8), fin);
      break;
    }
  }
  // Swingarm pivot shaft ends + nuts
  for (const s of [-1, 1]) {
    ctx.add('chassis', lathe([[0, 0], [0.02, 0], [0.022, 0.006], [0.022, 0.014], [0, 0.014]], { segs: 6, axis: 'x', sharp: true }).transform(s > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)), F.steel, T(s * 0.165, pv[1], pv[2]));
  }
  buildSubframe(ctx);
}

function buildSubframe(ctx: KitContext): void {
  const f = ctx.bp.frame;
  const hp = ctx.hp;
  const pv = hp.pivot;
  if (f.type === 'scooter' || f.subframe === 'integrated') return;
  const fin = hard(f.subframeColor, f.subframe === 'cast' ? 0.7 : 0.3, 0.45, 0.6, f.subframe === 'cast' ? Micro.cast : Micro.plain);
  const back = hp.seatBack + 0.05;
  for (const s of [-1, 1]) {
    const upper: P3[] = [[s * 0.12, pv[1] + 0.27, pv[2] - 0.05], [s * 0.1, hp.seatY - 0.06, (pv[2] + back) / 2 - 0.05], [s * 0.065, hp.seatY - 0.02, back]];
    const lower: P3[] = [[s * 0.12, pv[1] + 0.12, pv[2] + 0.02], [s * 0.1, hp.seatY - 0.15, (pv[2] + back) / 2 + 0.02], [s * 0.07, hp.seatY - 0.05, back - 0.1]];
    if (f.subframe === 'cast') {
      ctx.add('chassis', beam(upper, 0.04, 0.025, [1, 0.8, 0.6], ctx.seg(8, 3), 0.008), fin);
      ctx.add('chassis', beam(lower, 0.03, 0.02, [1, 0.8, 0.7], ctx.seg(8, 3), 0.007), fin);
    } else {
      ctx.add('chassis', tube(upper, 0.011, ctx.seg(10, 5), 8), fin);
      ctx.add('chassis', tube(lower, 0.01, ctx.seg(10, 5), 8), fin);
      if (f.subframe === 'trellis') {
        for (let i = 1; i < 4; i++) {
          const t = i / 4;
          const a = catmull(upper, 6)[Math.round(t * 12)];
          const b = catmull(lower, 6)[Math.round(Math.min(1, t + 0.12) * 12)];
          ctx.add('chassis', rod([a[0], a[1], a[2]], [b[0], b[1], b[2]], 0.008, 0.008, 8, false), fin);
        }
      }
    }
  }
  ctx.add('chassis', rod([-0.07, hp.seatY - 0.03, back - 0.04], [0.07, hp.seatY - 0.03, back - 0.04], 0.01, 0.01, 10), fin);
  if (ctx.micro) {
    for (const s of [-1, 1]) ctx.add('chassis', bolt(0.006, 0.008), F.steel, new THREE.Matrix4().makeRotationZ(s > 0 ? -Math.PI / 2 : Math.PI / 2).setPosition(s * 0.135, pv[1] + 0.27, pv[2] - 0.05));
  }
}

