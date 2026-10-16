import { mul, rgb, type GeoBuilder, type RGB } from './kit';
import type { ChunkBuild } from './scenery';

/**
 * Structures that cross or carry the road: road overpasses with embankment ramps, footbridges with
 * stair towers, and the pieces of long river/sea bridges (piers, girders, cable-stayed pylons).
 * Everything is authored in the road frame at one s: x across the carriageway (+x = right), y above the road
 * surface, −z along the direction of travel. Static material keys a map must define when it uses these:
 *   conc (concrete)  asphalt  steel  lit (self-lit strips)  glass
 */

const CONC: RGB = rgb('#b9b6ae');
const CONC_DARK: RGB = rgb('#8f8d86');
const ASPHALT: RGB = [0.5, 0.5, 0.52];
const STEEL_BLUE: RGB = rgb('#5f6f80');
const STEEL_GREY: RGB = rgb('#8d949b');

/** Clearance of overpass decks above the road (m): trucks need 4.8, the deck soffit sits at this level. */
export const OVERPASS_CLEARANCE = 5.6;

type V3 = readonly [number, number, number];

/** Vertical wall quad between two x stations at z, facing +z (`front`) or −z, from y0 to y1 at each station. */
function wallZ(b: GeoBuilder, z: number, x0: number, x1: number, y0a: number, y0b: number, y1a: number, y1b: number, front: boolean, color: RGB, uvPerM: number): void {
  const len = Math.hypot(x1 - x0, y1a - y0a) * uvPerM;
  const ha = (y1a - y0a) * uvPerM;
  const hb = (y1b - y0b) * uvPerM;
  if (front) b.quad([x0, y0a, z], [x1, y0b, z], [x1, y1b, z], [x0, y1a, z], { color }, [0, 0, len, 0, len, hb, 0, ha]);
  else b.quad([x1, y0b, z], [x0, y0a, z], [x0, y1a, z], [x1, y1b, z], { color }, [0, 0, len, 0, len, ha, 0, hb]);
}

export interface OverpassOptions {
  /** Deck height above the road (soffit is `OVERPASS_CLEARANCE`). */
  clearance?: number;
  /** Deck width along the road (m). */
  width?: number;
  /** Ramp length each side (m). */
  ramp?: number;
  lit: boolean;
}

/** Road overpass: girder deck over the carriageway (piers outside the guardrails) on solid embankment ramps. */
export function overpass(ctx: ChunkBuild, s: number, o: OverpassOptions): void {
  const half = ctx.host.half;
  const clr = o.clearance ?? OVERPASS_CLEARANCE;
  const W = o.width ?? 12;
  const girder = 1.25;
  const yTop = clr + girder;
  const X1 = half + 5.5;
  const L = o.ramp ?? Math.max(40, yTop * 9);
  const X2 = X1 + L;
  const conc = ctx.stat('conc');
  const asph = ctx.stat('asphalt');
  const lit = ctx.stat('lit');
  const k = ctx.host.worldMats.uv('concrete');
  const ground = -0.6;
  for (const b of [conc, asph, lit]) ctx.frame(b, s, 0, 0);
  const z = W / 2;
  // Deck top, centre span and ramps (asphalt, centre line is implied).
  const topPts: [number, number][] = [[-X2, ground + 0.4], [-X1, yTop], [X1, yTop], [X2, ground + 0.4]];
  for (let i = 0; i < 3; i++) {
    const [xa, ya] = topPts[i];
    const [xb, yb] = topPts[i + 1];
    asph.quad([xa, ya, z], [xb, yb, z], [xb, yb, -z], [xa, ya, -z], { color: ASPHALT, uvPerM: 0.18 });
    // Embankment sides / girder fascia (concrete) and the parapet wall on top.
    const bot = (x: number, y: number) => (Math.abs(x) <= X1 + 0.001 && i === 1 ? y - girder : ground);
    for (const front of [true, false]) {
      const zz = front ? z : -z;
      wallZ(conc, zz, xa, xb, bot(xa, ya), bot(xb, yb), ya, yb, front, CONC, k);
      wallZ(conc, zz, xa, xb, ya, yb, ya + 0.95, yb + 0.95, front, mul(CONC, 1.05), k);
      // Parapet cap.
      conc.quad([xa, ya + 0.95, zz + (front ? 0.12 : -0.12)], [xb, yb + 0.95, zz + (front ? 0.12 : -0.12)], [xb, yb + 0.95, zz - (front ? 0.12 : -0.12)], [xa, ya + 0.95, zz - (front ? 0.12 : -0.12)], { color: CONC_DARK });
      // Inner face of the parapet (seen by traffic on the deck, and by shadows).
      wallZ(conc, front ? zz - 0.12 : zz + 0.12, xa, xb, ya, yb, ya + 0.95, yb + 0.95, !front, mul(CONC, 0.9), k);
    }
  }
  // Soffit under the centre span.
  const yb0 = yTop - girder;
  conc.quad([-X1, yb0, -z], [X1, yb0, -z], [X1, yb0, z], [-X1, yb0, z], { color: mul(CONC, 0.8), uvPerM: k });
  // Cross girders (ribs) every 4 m under the deck give it depth when lit from below.
  for (let x = -X1 + 2; x < X1 - 1; x += 4) conc.box(x, yb0 - 0.18, 0, 0.35, 0.36, W - 0.4, { color: mul(CONC, 0.72) });
  // Abutment walls at the ends of the centre span and a pair of piers just outside the guardrails.
  for (const sx of [-1, 1]) {
    for (const zz of [-z + 1.6, z - 1.6]) {
      conc.box(sx * (half + 2.1), (yb0 - 0.5 + ground) / 2, zz, 1.5, yb0 - 0.5 - ground, 1.7, { color: CONC, uvPerM: k });
      conc.box(sx * (half + 2.1), yb0 - 0.3, zz, 2.4, 0.6, 2.4, { color: mul(CONC, 0.9) });
    }
  }
  // Under-deck light strips (they glow at night; by day they read as dark fixtures).
  if (o.lit) {
    for (const zz of [-3.2, 3.2]) lit.box(0, yb0 - 0.05, zz, X1 * 2 - 6, 0.08, 0.22, { color: [1.0, 0.82, 0.55] });
    ctx.glow(s, -half * 0.5, yb0 - 0.2, 1.7, 1.35, 0.8, 7);
    ctx.glow(s, half * 0.5, yb0 - 0.2, 1.7, 1.35, 0.8, 7);
  }
  for (const b of [conc, asph, lit]) b.pop();
}

export interface FootbridgeOptions {
  lit: boolean;
}

/** Pedestrian overpass: closed steel walkway with glazed sides, stair towers either side of the road. */
export function footbridge(ctx: ChunkBuild, s: number, o: FootbridgeOptions): void {
  const half = ctx.host.half;
  const steel = ctx.stat('steel');
  const glass = ctx.stat('glass');
  const lit = ctx.stat('lit');
  const conc = ctx.stat('conc');
  for (const b of [steel, glass, lit, conc]) ctx.frame(b, s, 0, 0);
  const clr = OVERPASS_CLEARANCE + 0.1;
  const X = half + 2.6;
  const wd = 2.8;
  const hgt = 2.5;
  const dk = 0.5;
  // Walkway: floor slab, roof, glazed side bands with steel frames.
  steel.box(0, clr + dk / 2, 0, X * 2, dk, wd, { color: STEEL_BLUE });
  steel.box(0, clr + dk + hgt + 0.1, 0, X * 2 + 0.6, 0.2, wd + 0.5, { color: mul(STEEL_BLUE, 0.8) });
  for (const zz of [-wd / 2, wd / 2]) {
    glass.box(0, clr + dk + hgt * 0.5 + 0.05, zz, X * 2, hgt - 0.35, 0.04, { color: [0.18, 0.26, 0.32] });
    steel.box(0, clr + dk + 0.04, zz, X * 2, 0.08, 0.1, { color: STEEL_GREY });
    for (let x = -X; x <= X + 0.01; x += 2.2) steel.box(x, clr + dk + hgt / 2, zz, 0.1, hgt, 0.1, { color: STEEL_GREY });
  }
  if (o.lit) lit.box(0, clr + dk + hgt - 0.05, 0, X * 2 - 1, 0.06, 0.3, { color: [1.0, 0.95, 0.85] });
  // Supports: a steel portal either side of the carriageway.
  for (const sx of [-1, 1]) {
    for (const zz of [-wd / 2 + 0.2, wd / 2 - 0.2]) steel.box(sx * X, (clr - 0.6) / 2, zz, 0.45, clr + 0.6, 0.45, { color: STEEL_GREY });
    // Stair tower with a switchback flight: straight inclined slab with steps outwards from the tower.
    const run = 12;
    const x0 = sx * (X + 0.4);
    const x1 = sx * (X + 0.4 + run);
    steel.quad([x0, clr + dk, wd / 2 - 0.15], [x1, 0, wd / 2 - 0.15], [x1, 0, -wd / 2 + 0.15], [x0, clr + dk, -wd / 2 + 0.15], { color: STEEL_GREY }, [0, 0, 1, 0, 1, 1, 0, 1]);
    if (sx > 0) steel.quad([x0, clr + dk - 0.35, -wd / 2 + 0.15], [x1, -0.35, -wd / 2 + 0.15], [x1, -0.35, wd / 2 - 0.15], [x0, clr + dk - 0.35, wd / 2 - 0.15], { color: mul(STEEL_GREY, 0.7) });
    else steel.quad([x0, clr + dk - 0.35, wd / 2 - 0.15], [x1, -0.35, wd / 2 - 0.15], [x1, -0.35, -wd / 2 + 0.15], [x0, clr + dk - 0.35, -wd / 2 + 0.15], { color: mul(STEEL_GREY, 0.7) });
    for (const zz of [-wd / 2, wd / 2]) {
      steel.limb([x0, clr + dk + 1.0, zz], [x1, 1.0, zz], 0.04, 0.04, 4, { color: STEEL_GREY });
      for (let i = 0; i <= 6; i++) steel.box(x0 + (x1 - x0) * (i / 6), (clr + dk) * (1 - i / 6) + 0.5, zz, 0.06, 1.0, 0.06, { color: STEEL_GREY });
    }
    conc.box(x1 + sx * 0.8, 0.15, 0, 1.6, 0.3, wd + 0.6, { color: CONC_DARK });
  }
  for (const b of [steel, glass, lit, conc]) b.pop();
}

export interface PierOptions {
  /** Pier head width across the road. */
  width?: number;
}

/** Bridge pier under the deck at road distance s: twin columns on a pile cap down to the lowest ground nearby. */
export function bridgePier(ctx: ChunkBuild, s: number, o: PierOptions = {}): void {
  const half = ctx.host.half;
  const conc = ctx.stat('conc');
  const k = ctx.host.worldMats.uv('concrete');
  const w = o.width ?? half * 2 + 1.6;
  ctx.frame(conc, s, 0, 0);
  const road = ctx.host.road.height(s);
  const dx = half - 1.2;
  const floorL = Math.min(ctx.groundY(s, -dx), ctx.groundY(s, dx)) - road - 2.5;
  // Head beam directly under the girder, columns below, footing at the bottom.
  conc.box(0, -1.9, 0, w, 1.1, 2.2, { color: mul(CONC, 0.9), uvPerM: k });
  for (const sx of [-1, 1]) {
    conc.frustum(sx * dx, floorL, 0, 1.15, 0.95, -1.4 - floorL, 12, { color: CONC, uvPerM: k });
    conc.box(sx * dx, floorL + 0.4, 0, 3.6, 0.8, 3.6, { color: CONC_DARK });
  }
  conc.pop();
}

/** Girder fascia and soffit on a bridge segment between s0 and s1 (both inside the chunk or beyond it). */
export function bridgeGirder(ctx: ChunkBuild, sA: number, sB: number, lo: number): void {
  const half = ctx.host.half;
  const conc = ctx.stat('conc');
  const steel = ctx.stat('steel');
  const k = ctx.host.worldMats.uv('concrete');
  const dEdge = half + 1.3;
  const step = 20;
  for (let s = sA; s < sB - 1e-3; s += step) {
    const sN = Math.min(sB, s + step);
    for (const sx of [-1, 1]) {
      const a = ctx.local(s, sx * dEdge, 0);
      const b = ctx.local(sN, sx * dEdge, 0);
      const bot = -1.6;
      if (sx > 0) conc.quad([a.x, a.y + bot, a.z], [b.x, b.y + bot, b.z], [b.x, b.y, b.z], [a.x, a.y, a.z], { color: CONC }, [0, 0, (sN - s) * k, 0, (sN - s) * k, 1.6 * k, 0, 1.6 * k]);
      else conc.quad([b.x, b.y + bot, b.z], [a.x, a.y + bot, a.z], [a.x, a.y, a.z], [b.x, b.y, b.z], { color: CONC }, [0, 0, (sN - s) * k, 0, (sN - s) * k, 1.6 * k, 0, 1.6 * k]);
    }
    // Soffit between the fascias.
    const a0 = ctx.local(s, -dEdge, -1.6);
    const a1 = ctx.local(s, dEdge, -1.6);
    const b0 = ctx.local(sN, -dEdge, -1.6);
    const b1 = ctx.local(sN, dEdge, -1.6);
    conc.quad([a0.x, a0.y, a0.z], [b0.x, b0.y, b0.z], [b1.x, b1.y, b1.z], [a1.x, a1.y, a1.z], { color: mul(CONC, 0.7) });
  }
  void steel;
  void lo;
}

export interface PylonOptions {
  /** Height of the pylon head above the deck. */
  height?: number;
  /** Stays on each side of the pylon, per road side. */
  stays?: number;
  /** Colour of the cables (lit bridges glow). */
  cable?: RGB;
}

/** Cable-stayed pylon at s: A-shaped legs outside the carriageway, a cross beam, and a fan of stays to the deck both ways. */
export function cablePylon(ctx: ChunkBuild, s: number, o: PylonOptions = {}): void {
  const half = ctx.host.half;
  const steel = ctx.stat('steel');
  const conc = ctx.stat('conc');
  const cable = ctx.stat('cable');
  const H = o.height ?? 72;
  const stays = o.stays ?? 9;
  const cc = o.cable ?? [0.82, 0.84, 0.86];
  const k = ctx.host.worldMats.uv('concrete');
  for (const b of [steel, conc, cable]) ctx.frame(b, s, 0, 0);
  const dx = half + 1.6;
  // Two inclined legs (tapering) joined by cross beams; they run through the deck down to the pier.
  for (const sx of [-1, 1]) {
    conc.limb([sx * dx, -12, 0], [sx * dx * 0.82, H * 0.62, 0], 1.7, 1.15, 10, { color: mul(CONC, 1.7), uvPerM: k }, true);
    conc.limb([sx * dx * 0.82, H * 0.62, 0], [sx * 1.0, H, 0], 1.15, 0.8, 10, { color: mul(CONC, 1.7), uvPerM: k }, true);
  }
  conc.box(0, H * 0.4, 0, dx * 1.7, 2.2, 2.2, { color: mul(CONC, 0.95), uvPerM: k });
  conc.box(0, H * 0.82, 0, dx * 0.9, 1.8, 2.0, { color: mul(CONC, 0.95), uvPerM: k });
  // Stays: from anchor points on the upper leg to deck stations spaced 13 m apart, on both sides of the pylon.
  const legX = (y: number) => (y >= H * 0.62 ? dx * 0.82 + (1.0 - dx * 0.82) * ((y - H * 0.62) / (H * 0.38)) : dx + (dx * 0.82 - dx) * ((y + 12) / (H * 0.62 + 12)));
  for (const sx of [-1, 1]) {
    for (const dir of [-1, 1]) {
      for (let i = 1; i <= stays; i++) {
        const along = 16 + i * 13;
        const hy = H * 0.96 - (i - 1) * ((H * 0.4) / stays);
        cable.limb([sx * legX(hy), hy, 0], [sx * (half + 0.4), 0.2, dir * along], 0.09, 0.09, 4, { color: cc });
      }
    }
  }
  for (const b of [steel, conc, cable]) b.pop();
}

export { STEEL_BLUE, STEEL_GREY, CONC, CONC_DARK };
export type { V3 };
