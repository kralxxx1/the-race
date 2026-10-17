import * as THREE from 'three';
import { RX, T, mul, type KitContext } from '../context';
import { alongY, extrude, lathe, rod, smooth2, type P2, type P3 } from '../mesh';
import { F, Micro, hard, tint, vary, type Finish } from '../sink';
import { can, clampRing, heatShield, link, pipe, portFlange } from './cruisers-exhaust';
import type { Port } from './engine';
import { forkLayout } from './front';
import { roundHeadlight } from './lights';
import { bezelRing, pipeAlong } from './retro-scooter-ev-body';

/**
 * Shared pieces of the classic roadsters (Bonneville T120, Interceptor 650, Classic 350, Scrambler, FTR):
 * tubular frames, chrome peashooter exhausts, round headlamp mounts, twin-clock bezels, knee pads.
 */

// ───────────────────────────── frames ─────────────────────────────

export interface CradleFrameOpts {
  f: Finish;
  /** Top tube / down tube / seat rail radius. */
  rTop?: number;
  rLow?: number;
  /** Crank z / y, lower cradle bottom y. */
  crankZ: number;
  cradleY: number;
  /** Half-width of the lower cradle at the engine. */
  cradleX?: number;
  /** Top tube height at the seat post (y) and its z. */
  seatPost: [number, number];
  /** Tail hoop end (z, y) and half-width. */
  tail: [number, number];
  tailX?: number;
  /** Twin top tubes instead of one big spine tube. */
  twinTop?: boolean;
}

/** Steel double-cradle frame: spine top tube, twin down tubes round the engine, pivot plates, tail hoop. */
export function cradleFrame(ctx: KitContext, o: CradleFrameOpts): void {
  const hp = ctx.hp;
  const pv = hp.pivot;
  const rT = o.rTop ?? 0.0165;
  const rL = o.rLow ?? 0.0125;
  const cx = o.cradleX ?? 0.1;
  const ht = ctx.fromSteer([0, -0.06, 0.005]);
  const hb = ctx.fromSteer([0, -0.2, 0.012]);
  // Head lug
  ctx.add('chassis', lathe([[0.034, -0.1], [0.04, -0.092], [0.04, 0.092], [0.034, 0.1]], { segs: ctx.seg(24, 10), axis: 'y', sharp: true }), o.f, alongY(ctx.fromSteer([0, -0.2, 0.005]), ctx.fromSteer([0, 0.0, 0.005])));
  // Top tube(s)
  if (o.twinTop) {
    for (const s of [-1, 1]) pipeAlong(ctx, 'chassis', [[s * 0.02, ht[1] - 0.01, ht[2] + 0.02], [s * 0.065, o.seatPost[1] + 0.09, (ht[2] + o.seatPost[0]) / 2], [s * 0.085, o.seatPost[1], o.seatPost[0]]], rT, o.f);
  } else {
    pipeAlong(ctx, 'chassis', [[0, ht[1] - 0.01, ht[2] + 0.03], [0, (ht[1] + o.seatPost[1]) / 2 + 0.01, (ht[2] + o.seatPost[0]) / 2], [0, o.seatPost[1] + 0.01, o.seatPost[0] + 0.02]], rT, o.f);
  }
  // Seat tube / rear down tube + twin cradle tubes
  for (const s of [-1, 1]) {
    pipeAlong(ctx, 'chassis', [[s * 0.025, hb[1], hb[2] + 0.015], [s * cx * 0.8, o.cradleY + 0.2, o.crankZ - 0.2], [s * cx, o.cradleY + 0.02, o.crankZ - 0.12], [s * cx, o.cradleY, o.crankZ + 0.1], [s * (cx + 0.01), pv[1] - 0.02, pv[2] + 0.01]], rL, o.f);
    // Seat tube from the pivot plate up to the rails, then the tail hoop
    pipeAlong(ctx, 'chassis', [[s * (cx + 0.01), pv[1] + 0.05, pv[2] + 0.0], [s * (cx - 0.005), (pv[1] + o.seatPost[1]) / 2, (pv[2] + o.seatPost[0]) / 2 - 0.02], [s * (o.tailX ?? 0.085), o.seatPost[1] - 0.05, o.seatPost[0] + 0.01]], rL * 1.05, o.f);
    pipeAlong(ctx, 'chassis', [[s * 0.085, o.seatPost[1], o.seatPost[0]], [s * (o.tailX ?? 0.085), o.seatPost[1] + 0.01, (o.seatPost[0] + o.tail[0]) / 2], [s * (o.tailX ?? 0.085) * 0.85, o.tail[1], o.tail[0]]], rL * 0.9, o.f);
    // Lower stay from the seat tube to the tail
    pipeAlong(ctx, 'chassis', [[s * (cx + 0.01), pv[1] + 0.1, pv[2] + 0.02], [s * 0.1, o.seatPost[1] - 0.12, (pv[2] + o.tail[0]) / 2], [s * (o.tailX ?? 0.085) * 0.85, o.tail[1] - 0.02, o.tail[0] - 0.05]], rL * 0.8, o.f);
    // Pivot plate
    const plate = smooth2([[pv[2] - 0.075, pv[1] + 0.14], [pv[2] + 0.02, pv[1] + 0.16], [pv[2] + 0.055, pv[1] + 0.03], [pv[2] + 0.03, pv[1] - 0.08], [pv[2] - 0.06, pv[1] - 0.08], [pv[2] - 0.095, pv[1] + 0.02]], ctx.micro ? 4 : 2, true);
    ctx.add('chassis', extrude(plate, 0.012, { plane: 'zy', bevel: 0.003, center: s * (cx + 0.025), curveSegs: 1 }), o.f);
    ctx.add('chassis', lathe([[0, 0], [0.021, 0], [0.023, 0.005], [0.021, 0.012], [0, 0.012]], { segs: 6, axis: 'x', sharp: true }), F.steel, mul(T(s * (cx + 0.036), pv[1], pv[2]), s > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)));
  }
  // Cross tubes: behind the head under the tank, and across the tail
  pipeAlong(ctx, 'chassis', [[-cx * 0.9, hb[1] - 0.04, hb[2] + 0.2], [0, hb[1] - 0.05, hb[2] + 0.21], [cx * 0.9, hb[1] - 0.04, hb[2] + 0.2]], rL * 0.8, o.f);
  pipeAlong(ctx, 'chassis', [[-(o.tailX ?? 0.085) * 0.85, o.tail[1], o.tail[0]], [0, o.tail[1] + 0.004, o.tail[0] + 0.012], [(o.tailX ?? 0.085) * 0.85, o.tail[1], o.tail[0]]], rL * 0.8, o.f);
  // Seat-rail bridge
  pipeAlong(ctx, 'chassis', [[-0.09, o.seatPost[1] - 0.01, o.seatPost[0]], [0, o.seatPost[1] - 0.01, o.seatPost[0] + 0.004], [0.09, o.seatPost[1] - 0.01, o.seatPost[0]]], rL * 0.8, o.f);
}

// ───────────────────────────── exhausts ─────────────────────────────

export interface PeashooterOpts {
  header: Finish;
  can: Finish;
  capF?: Finish;
  headerR?: number;
  canR: number;
  canREnd?: number;
  /** Silencer centre line, front end → rear end (right side; mirrored for the left). */
  from: P3;
  to: P3;
  slash?: number;
  shield?: boolean;
  /** Under-engine balance pipe z. */
  crossoverZ?: number;
  /** Bottom of the header sweep (y) and its x spread. */
  lowY: number;
  bands?: number;
}

/** Twin chrome headers down the front of the engine into long straight "peashooter" silencers on both sides. */
export function peashooters(ctx: KitContext, ports: readonly Port[], o: PeashooterOpts): void {
  const r = o.headerR ?? 0.0185;
  for (const port of ports) {
    const s = port.pos[0] < 0 ? -1 : 1;
    const p0 = port.pos;
    const ctrl: P3[] = [
      p0,
      [p0[0] + s * 0.004, p0[1] - 0.05, p0[2] - 0.075],
      [s * (Math.abs(p0[0]) + 0.03), (p0[1] + o.lowY) / 2 - 0.02, p0[2] - 0.15],
      [s * 0.11, o.lowY + 0.03, (p0[2] + o.from[2]) / 2 - 0.1],
      [s * Math.max(o.from[0] - 0.03, 0.14), o.lowY, o.from[2] - 0.06],
      [s * o.from[0], o.from[1], o.from[2]],
    ];
    const path = pipe(ctx, ctrl, r, o.header);
    portFlange(ctx, p0, port.dir, r, vary(F.steel, { rough: 0.3 }));
    clampRing(ctx, path, Math.floor(path.length * 0.55), r, F.steel);
    if (o.shield) heatShield(ctx, path, Math.floor(path.length * 0.55), path.length - 4, r, vary(F.chrome, { rough: 0.12 }), { span: Math.PI * 1.0, centre: s > 0 ? Math.PI * 0.45 : Math.PI * 0.55, slots: 5 });
    const a: P3 = [s * o.from[0], o.from[1], o.from[2]];
    const b: P3 = [s * o.to[0], o.to[1], o.to[2]];
    can(ctx, a, b, { r: o.canR, rEnd: o.canREnd, kind: o.canREnd ? 'tapered' : 'straight', f: o.can, capF: o.capF ?? o.can, slash: o.slash, slashDir: 'out', bands: o.bands ?? 2, bandF: vary(F.chrome, { rough: 0.15 }) });
    if (s > 0) ctx.anchor('exhaustOutlet', [b[0], b[1], b[2]]);
  }
  if (o.crossoverZ !== undefined) link(ctx, [-0.1, o.lowY + 0.03, o.crossoverZ], [0.1, o.lowY + 0.03, o.crossoverZ], r * 0.8, o.header);
}

export const polishedCan = (): Finish => vary(F.chrome, { rough: 0.1 });
export const brushedSteelCan = (): Finish => hard('#aeb2b7', 1, 0.28, 0.2, Micro.brushed);

// ───────────────────────────── front end ─────────────────────────────

/** Round headlamp between the fork legs on chrome ears, with a small pilot/indicator pair on stalks. */
export function classicHeadlamp(ctx: KitContext, o: { r: number; y?: number; chrome?: boolean; led?: boolean; trim?: Finish; indicators?: boolean; bucket?: Finish }): THREE.Vector3 {
  const L = forkLayout(ctx);
  const y = o.y ?? -0.125;
  const zc = L.z - 0.062;
  const lc = ctx.fromSteer([0, y, zc]);
  roundHeadlight(ctx, 'steer', lc, o.r, [0, -0.03, -1], { led: o.led ?? false, chrome: o.chrome ?? true });
  // Mounting ears: chrome bars from each fork tube to the lamp rim
  const trim = o.trim ?? F.chrome;
  for (const s of [-1, 1]) {
    const a = ctx.fromSteer([s * (L.half - L.outerR * 0.6), y + 0.002, L.z - 0.012]);
    const b = ctx.fromSteer([s * (o.r * 0.98), y + 0.002, zc + 0.004]);
    ctx.add('steer', rod(a, b, 0.0085, 0.0085, ctx.seg(12, 6)), trim);
    ctx.add('steer', lathe([[0, 0], [0.013, 0], [0.013, 0.01], [0, 0.01]], { segs: ctx.seg(14, 6), axis: 'y', sharp: true }), trim, mul(T(...ctx.fromSteer([s * (L.half + L.outerR * 0.3), y - 0.005, L.z - 0.012])), new THREE.Matrix4().makeRotationZ(Math.PI / 2)));
    if (o.indicators !== false) {
      const base = ctx.fromSteer([s * (L.half + 0.012), y - 0.045, L.z - 0.02]);
      const tip = ctx.fromSteer([s * (L.half + 0.05), y - 0.055, L.z - 0.04]);
      ctx.add('steer', rod(base, tip, 0.0065, 0.0065, 8), trim);
      ctx.add('steer', lathe([[0, -0.012], [0.012, -0.01], [0.015, 0.004], [0.012, 0.014], [0, 0.018]], { segs: ctx.seg(16, 8), axis: 'y' }), F.indicator, mul(T(tip[0], tip[1] + 0.01, tip[2]), new THREE.Matrix4().makeRotationZ(0)));
    }
  }
  return new THREE.Vector3(lc[0], lc[1], lc[2]);
}

/** Twin chrome gauge bezels over a dash quad (the kit draws the two dials); `w`/`h` = dash size. */
export function twinClockBezels(ctx: KitContext, pos: P3, w: number, h: number, tiltDeg: number, finish: Finish = F.chrome): void {
  const tilt = (tiltDeg * Math.PI) / 180;
  const n: P3 = [0, Math.sin(tilt), Math.cos(tilt)];
  const m = mul(T(...pos), RX(-tilt));
  for (const sx of [-1, 1]) {
    const off = new THREE.Vector3(sx * w * 0.24, 0, 0.0).applyMatrix4(m);
    bezelRing(ctx, 'steer', [off.x, off.y, off.z], n, h * 0.455, 0.0045, finish);
  }
}

/** Tank knee pads: slightly raised rubber pads on both tank flanks. */
export function kneePads(ctx: KitContext, o: { z: number; y: number; x: number; len: number; hgt: number; f?: Finish; tilt?: number }): void {
  const f = o.f ?? tint(F.rubber, '#26262a');
  for (const s of [-1, 1]) {
    const outline: P2[] = smooth2([[-o.len / 2, -o.hgt * 0.45], [o.len * 0.35, -o.hgt * 0.5], [o.len / 2, -o.hgt * 0.1], [o.len * 0.4, o.hgt * 0.5], [-o.len * 0.45, o.hgt * 0.45]], 3, true);
    // Plate lying on the tank flank (zy outline) pushed out along the flank normal.
    const m = extrude(outline.map(([a, b]) => [o.z + a, o.y + b] as P2), 0.0065, { plane: 'zy', bevel: 0.0022, curveSegs: 1, center: s * o.x });
    ctx.add('chassis', m, f);
  }
}
