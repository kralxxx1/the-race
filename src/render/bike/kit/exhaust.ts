import * as THREE from 'three';
import { T, type KitContext } from '../context';
import { MeshData, catmull, circle, lathe, rod, roundBox, roundRect, sweep, type P2, type P3 } from '../mesh';
import { cut } from '../surface';
import { F, hard, Micro, vary, type Finish } from '../sink';
import type { Port } from './engine';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = (v: THREE.Vector3): P3 => [v.x, v.y, v.z];

type Heat = 'titanium' | 'steel' | 'chrome' | 'black';

/** Heat-tint gradient along a pipe (t = 0 at the exhaust port). Colours are linear multipliers. */
function heatColour(kind: Heat, t: number): [number, number, number] {
  const stops: Record<Heat, [number, string][]> = {
    titanium: [[0, '#c9a65e'], [0.14, '#b48a4c'], [0.28, '#8c6e70'], [0.4, '#5f6d8c'], [0.54, '#878e98'], [0.75, '#a39e95'], [1, '#a29d93']],
    steel: [[0, '#c9a15a'], [0.15, '#9a6a3a'], [0.3, '#4a4a78'], [0.45, '#5b6068'], [1, '#6a6e74']],
    chrome: [[0, '#d8c8a0'], [0.12, '#c8c0d8'], [0.3, '#f2f4f7'], [1, '#f2f4f7']],
    black: [[0, '#2a2622'], [1, '#18191b']],
  };
  const s = stops[kind];
  let i = 0;
  while (i < s.length - 2 && s[i + 1][0] < t) i++;
  const [t0, c0] = s[i];
  const [t1, c1] = s[i + 1];
  const k = Math.max(0, Math.min(1, (t - t0) / Math.max(1e-6, t1 - t0)));
  const a = new THREE.Color(c0), b = new THREE.Color(c1);
  a.lerp(b, k);
  return [a.r, a.g, a.b];
}

function pipeFinish(kind: Heat): Finish {
  switch (kind) {
    case 'titanium':
      return hard('#ffffff', 1, 0.3, 0, Micro.brushed);
    case 'steel':
      return hard('#ffffff', 1, 0.34, 0, Micro.brushed);
    case 'chrome':
      return hard('#ffffff', 1, 0.06);
    default:
      return hard('#ffffff', 0.3, 0.6, 0, Micro.grain);
  }
}

/** Header pipe through control points with a heat-tint gradient (arc-length based). */
function pipe(ctx: KitContext, ctrl: P3[], r: number, heat: Heat, t0 = 0, t1 = 1): MeshData {
  const path = catmull(ctrl, ctx.seg(10, 4)).map((q) => [q[0], q[1], q[2]] as P3);
  const m = sweep(path, circle(r, ctx.seg(16, 8)), {});
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
  m.tintBy((_x, _y, _z, i) => heatColour(heat, t0 + (t1 - t0) * (m.uv[i * 2 + 1] / Math.max(1e-6, total))));
  return m;
}

/** Silencer body between inlet a and outlet b. */
export function silencer(ctx: KitContext, a: P3, b: P3, kind: string, dia: number, finish: string, group: 'chassis' | 'swingarm' = 'chassis'): void {
  const A = V(...a), B = V(...b);
  const n = ctx.seg(14, 6);
  const path: P3[] = [];
  for (let i = 0; i <= n; i++) path.push(P(A.clone().lerp(B, i / n)));
  const r = dia / 2;
  let prof: P2[];
  const radial = ctx.seg(28, 12);
  switch (kind) {
    case 'hex': {
      prof = [];
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2 + Math.PI / 6;
        for (let j = 0; j < 3; j++) {
          const aa = a0 + (j - 1) * 0.12;
          const rr = r * (j === 1 ? 1 : 0.985);
          prof.push([Math.cos(aa) * rr, Math.sin(aa) * rr]);
        }
      }
      break;
    }
    case 'tri':
      prof = [];
      for (let i = 0; i < radial; i++) {
        const t = (i / radial) * Math.PI * 2;
        const rr = r * (0.82 + 0.18 * Math.cos(3 * t));
        prof.push([Math.cos(t) * rr, Math.sin(t) * rr]);
      }
      break;
    case 'oval':
    case 'stubby':
      prof = circle(r, radial, r * 0.72);
      break;
    case 'box':
      prof = roundRect(dia * 1.6, dia, dia * 0.25, 4);
      break;
    default:
      prof = circle(r, radial);
  }
  const scale: (number | P2)[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let s = 1;
    if (kind === 'megaphone') s = 0.55 + 0.45 * t;
    else if (kind === 'stubby') s = 0.86 + Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * 0.14 - Math.max(0, t - 0.85) * 0.5;
    else if (kind === 'fishtail') s = t < 0.75 ? 1 : 1;
    else s = t < 0.08 ? 0.75 + (t / 0.08) * 0.25 : t > 0.94 ? 1 - (t - 0.94) * 1.2 : 1;
    if (kind === 'fishtail' && t > 0.75) scale.push([1 + (t - 0.75) * 1.4, 1 - (t - 0.75) * 2.2]);
    else scale.push(s);
  }
  let body = sweep(path, prof, { scale, capStart: true, capEnd: kind !== 'slash', up: [0, 1, 0] });
  if (kind === 'slash') {
    // Oblique cut across the end.
    const d = B.clone().sub(A).normalize();
    const nrm = d.clone().add(V(0, 0.9, 0)).normalize();
    const c = B.clone().addScaledVector(d, -r * 0.6);
    body = cut(body, (x, y, z) => -((x - c.x) * nrm.x + (y - c.y) * nrm.y + (z - c.z) * nrm.z));
  }
  const fin: Finish =
    finish === 'carbon' ? F.carbon : finish === 'chrome' ? F.chrome : finish === 'black' ? F.satinBlack : finish === 'steel' ? vary(F.steel, { rough: 0.25 }) : vary(F.titanium, { color: new THREE.Color('#a8a397').toArray() as [number, number, number] });
  ctx.add(group, body, fin);
  // End cap (contrasting) + outlet tube(s)
  const d = B.clone().sub(A).normalize();
  const capC = B.clone().addScaledVector(d, -0.004);
  if (kind !== 'slash' && kind !== 'fishtail') {
    const capR = kind === 'stubby' || kind === 'oval' ? r * 0.8 : r * 0.9;
    const cap = lathe([[0, 0], [capR, 0], [capR * 0.95, 0.012], [capR * 0.55, 0.02], [0, 0.022]], { segs: radial, axis: 'y' });
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
    const m = new THREE.Matrix4().compose(capC, q, kind === 'stubby' || kind === 'oval' ? V(1, 1, 0.72) : V(1, 1, 1));
    ctx.add(group, cap, finish === 'chrome' ? F.chrome : F.carbon, m);
  }
  const outlets = kind === 'tri' ? 3 : 1;
  for (let i = 0; i < outlets; i++) {
    const off = outlets === 1 ? V(0, 0, 0) : V(0, Math.cos((i / 3) * Math.PI * 2) * r * 0.45, Math.sin((i / 3) * Math.PI * 2) * r * 0.45);
    const o0 = B.clone().add(off).addScaledVector(d, -0.03);
    const o1 = B.clone().add(off).addScaledVector(d, 0.025);
    const or = outlets === 1 ? r * 0.42 : r * 0.24;
    const outlet = lathe([[or - 0.002, 0], [or, 0], [or, 1], [or - 0.002, 1]], { segs: ctx.seg(20, 8), axis: 'y' });
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
    const m = new THREE.Matrix4().compose(o0, q, V(1, o1.distanceTo(o0), 1));
    ctx.add(group, outlet, vary(F.steel, { rough: 0.35 }), m);
    // Sooty inside
    const inner = lathe([[or - 0.0025, 1], [or - 0.0025, 0], [0, 0.4]], { segs: ctx.seg(20, 8), axis: 'y' });
    ctx.add(group, inner, hard('#0b0b0b', 0, 0.9), m);
  }
  // Clamp band near the inlet
  const band = V(...a).lerp(B, 0.18);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
  ctx.add(group, lathe([[r * 1.0, 0], [r * 1.04, 0.004], [r * 1.04, 0.02], [r * 1.0, 0.024]], { segs: radial, axis: 'y' }), kind === 'stubby' || kind === 'oval' ? vary(F.texturedBlack, {}) : F.polishedAlu, new THREE.Matrix4().compose(band, q, kind === 'stubby' || kind === 'oval' ? V(1, 1, 0.72) : V(1, 1, 1)));
}

/** Headers, collector and silencer(s) per the blueprint route. */
export function buildExhaust(ctx: KitContext, ports: Port[]): void {
  const ex = ctx.bp.exhaust;
  if (ex.route === 'none' || ports.length === 0) return;
  const hp = ctx.hp;
  const e = ctx.bp.engine;
  const crank = V(...e.crank);
  const pv = V(...hp.pivot);
  const heat: Heat = ex.headerFinish;
  const r = ports.length >= 4 ? 0.018 : ports.length === 3 ? 0.02 : 0.024;
  const lowY = Math.max(0.15, (ctx.bp.groundClearance ?? 0.13) + 0.04);
  const pf = pipeFinish(heat);
  const side = ex.side === 'left' ? -1 : 1;
  const collector = V(side * 0.03, lowY + 0.03, crank.z + 0.04);

  const header = (p: Port, to: THREE.Vector3, viaFront = true) => {
    const a = V(...p.pos);
    const d = V(...p.dir);
    const pts: P3[] = [P(a), P(a.clone().addScaledVector(d, 0.05))];
    if (viaFront) {
      const front = Math.min(a.z - 0.06, crank.z - 0.17);
      pts.push(P(V(a.x * 1.05, Math.max(lowY + 0.12, crank.y - 0.02), front)));
      pts.push(P(V(a.x * 0.8 + to.x * 0.2, lowY + 0.04, front + 0.12)));
    } else {
      pts.push(P(V(a.x * 1.1, a.y - 0.12, a.z + d.z * 0.06)));
    }
    pts.push(P(to));
    ctx.add('chassis', pipe(ctx, pts, r, heat, 0, 0.75), pf);
    // Port flange
    if (ctx.micro) {
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
      ctx.add('chassis', roundBox(r * 3.4, 0.008, r * 2.4, 0.003, 1), F.steel, new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.006), q, V(1, 1, 1)));
    }
  };

  const route = ex.route;
  if (route === 'peashooter' || route === 'dualSide' || route === 'shotgun' || route === 'megaphone') {
    // One header (or pair) per side, each with its own long can.
    const groups: Record<number, Port[]> = { [-1]: [], [1]: [] };
    for (const p of ports) groups[route === 'shotgun' ? 1 : p.pos[0] < -0.001 ? -1 : p.pos[0] > 0.001 ? 1 : p.cyl % 2 === 0 ? -1 : 1].push(p);
    const harley = e.layout === 'V2_45';
    for (const s of [-1, 1]) {
      const list = groups[s];
      if (!list.length) continue;
      list.forEach((p, i) => {
        const y = (harley ? 0.3 : lowY + 0.1) + (route === 'shotgun' ? i * 0.09 : 0);
        const start = V(s * (harley ? 0.2 : 0.17), y, pv.z + 0.02 - (route === 'shotgun' ? i * 0.04 : 0));
        header(p, start, !harley);
        if (harley) ctx.add('chassis', pipe(ctx, [P(V(...p.pos)), P(V(...p.pos).add(V(0.08, -0.1, p.pos[2] < crank.z ? -0.06 : 0.04))), P(V(0.18, 0.28, crank.z + 0.1)), P(start)], r * 1.1, 'chrome'), F.chrome);
        const len = ex.canLength;
        const end = start.clone().add(V(s * 0.02, (route === 'megaphone' ? 0.05 : 0.07) + i * 0.0, len));
        silencer(ctx, P(start.clone().add(V(0, 0, 0.0))), P(end), ex.can, ex.canDia, ex.canFinish);
      });
    }
    return;
  }
  // Merge all headers into the collector.
  // Forward-facing ports loop round the front of the engine; rearward ones (V rear bank) drop straight down.
  for (const p of ports) header(p, collector.clone().add(V(p.pos[0] * 0.15, 0.0, -0.06)), p.dir[2] <= 0.05);
  ctx.add('chassis', lathe([[0, -0.05], [r * 2.6, -0.04], [r * 2.6, 0.06], [r * 1.6, 0.1], [0, 0.11]], { segs: ctx.seg(20, 8), axis: 'z' }), vary(pf, { color: heatColour(heat, 0.55) }), T(collector.x, collector.y, collector.z));
  const can = ex.can;
  if (route === 'underslung' || route === 'underbelly') {
    // Pre-chamber / silencer box under the engine.
    const boxC = V(side * 0.02, lowY + 0.025, crank.z + 0.17);
    const box = roundBox(0.26, 0.1, 0.32, 0.045, ctx.micro ? 3 : 2);
    ctx.add('chassis', box, vary(F.titanium, { color: new THREE.Color('#8f8a80').toArray() as [number, number, number], rough: 0.4 }), T(boxC.x, boxC.y, boxC.z));
    ctx.add('chassis', roundBox(0.27, 0.02, 0.3, 0.008, 2), F.texturedBlack, T(boxC.x, boxC.y + 0.055, boxC.z));
    if (route === 'underbelly') {
      // Twin short outlets on the right, angled up towards the rear tyre.
      for (let i = 0; i < 2; i++) {
        const a = V(side * 0.12, lowY + 0.04 + i * 0.045, boxC.z + 0.12 + i * 0.02);
        const b = a.clone().add(V(side * 0.03, 0.035, 0.12));
        ctx.add('chassis', rod(P(a), P(b), ex.canDia / 2, ex.canDia / 2, ctx.seg(20, 8)), vary(F.titanium, {}));
        ctx.add('chassis', lathe([[0, 0], [ex.canDia / 2 - 0.002, 0], [ex.canDia / 2 - 0.002, 0.004], [0, 0.004]], { segs: ctx.seg(20, 8), axis: 'y' }), hard('#090909', 0, 0.9), new THREE.Matrix4().compose(b, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()), V(1, 1, 1)));
      }
      ctx.anchor('exhaustOutlet', [side * 0.16, lowY + 0.15, boxC.z + 0.25]);
      return;
    }
    // Short right-side can behind the box.
    const s0 = V(side * 0.1, lowY + 0.06, boxC.z + 0.17);
    ctx.add('chassis', pipe(ctx, [P(boxC.clone().add(V(side * 0.08, 0.0, 0.12))), P(s0)], r * 1.4, heat, 0.8, 1), pf);
    const end = s0.clone().add(V(side * 0.035, 0.06, ex.canLength));
    silencer(ctx, P(s0), P(end), can, ex.canDia, ex.canFinish);
    ctx.anchor('exhaustOutlet', P(end));
    return;
  }
  if (route === 'highTwin' || route === 'underseatTwin' || route === 'highSingle') {
    const link: P3[] = [P(collector.clone().add(V(0, 0, 0.1))), P(V(side * 0.1, lowY + 0.06, pv.z - 0.05)), P(V(side * 0.12, pv.y + 0.08, pv.z + 0.12)), P(V(side * 0.1, hp.seatY - 0.12, hp.seatBack - 0.2))];
    ctx.add('chassis', pipe(ctx, link, r * 1.5, heat, 0.75, 1), pf);
    const sides = route === 'highTwin' || route === 'underseatTwin' ? [-1, 1] : [side];
    for (const s of sides) {
      const a = V(s * 0.1, hp.seatY - 0.1, hp.seatBack - 0.22);
      const b = a.clone().add(V(s * 0.01, 0.07, ex.canLength));
      silencer(ctx, P(a), P(b), can, ex.canDia, ex.canFinish);
    }
    return;
  }
  if (route === 'scooter') {
    const a = V(side * 0.14, 0.24, -0.2);
    const b = a.clone().add(V(0, 0.08, ex.canLength));
    ctx.add('chassis', pipe(ctx, [P(collector), P(V(side * 0.12, 0.18, -0.35)), P(a)], r, heat, 0.5, 1), pf);
    silencer(ctx, P(a), P(b), can, ex.canDia, ex.canFinish);
    return;
  }
  // Side can (default): link pipe from the collector to a can rising along the right side.
  const s0 = V(side * 0.15, lowY + 0.14, pv.z + 0.02);
  const outlet = ex.outlet ? V(side * Math.abs(ex.outlet[0]), ex.outlet[1], ex.outlet[2]) : null;
  const dir = outlet ? outlet.clone().sub(s0).normalize() : V(side * 0.05, 0.3, 1).normalize();
  const end = outlet ?? s0.clone().addScaledVector(dir, ex.canLength);
  const start = outlet ? end.clone().addScaledVector(dir, -ex.canLength) : s0;
  ctx.add('chassis', pipe(ctx, [P(collector.clone().add(V(0, 0, 0.1))), P(V(side * 0.1, lowY + 0.05, crank.z + 0.25)), P(start.clone().addScaledVector(dir, -0.08)), P(start)], r * 1.45, heat, 0.75, 1), pf);
  silencer(ctx, P(start), P(end), can, ex.canDia, ex.canFinish);
  // Hanger strap to the subframe / footrest hanger
  const mid = start.clone().lerp(end, 0.55);
  ctx.add('chassis', rod(P(mid.clone().add(V(-side * 0.02, ex.canDia / 2, 0))), [side * 0.1, hp.seatY - 0.16, mid.z - 0.05], 0.007, 0.007, 8), F.castAlu);
  ctx.anchor('exhaustOutlet', P(end));
}
