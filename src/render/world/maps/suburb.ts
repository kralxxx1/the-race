import * as THREE from 'three';
import { Rng, noise2, smoothstep } from '../../../core/math';
import { apartment } from '../blocks';
import { house, surfaces, type Surfaces } from '../buildings';
import { mul, rgb, type RGB } from '../kit';
import { LampKit } from '../lighting';
import { benchGeometry, binGeometry, carGeometry, gardenFenceGeometry, mailboxGeometry } from '../props';
import { CHUNK_LENGTH, Scenery, type ChunkBuild, type SceneryHost } from '../scenery';
import { NEAR_BAND, h2, scatter } from '../scatter';
import { patch, ribbon, wall } from '../strips';

const CAR_PAINTS: RGB[] = [rgb('#c8ccd0'), rgb('#e9e9e4'), rgb('#27323d'), rgb('#8a1c1c'), rgb('#3a4f7a'), rgb('#a8a08a'), rgb('#1c1e20'), rgb('#6b7f6a')];
const PLOT = 30;

/**
 * Bursa ring road: a service road with sidewalk, street lamps and parked cars on the right,
 * detached villas with fenced gardens behind it, apartment blocks across the median, plane trees.
 */
export class SuburbScenery extends Scenery {
  private plane: string[];
  private cypress: string[];
  private olive: string[];
  private shrub: string[];
  private tuft: string[];
  private tall: string[];
  private lamps: LampKit;
  private cars: string[] = [];
  private fences: string[] = [];
  private benchKey = 'bench';
  private binKey = 'bin';
  private mailKey = 'mailbox';
  private night: boolean;

  constructor(host: SceneryHost) {
    super(host);
    const dens = host.quality.sceneryDensity;
    const m = host.worldMats;
    this.night = host.env.scenery.lightsOn;
    this.plane = this.defineTree('plane', 46 * dens + 6, { ranges: { hi: 100, mid: 280 } });
    this.cypress = this.defineTree('cypress', 10 * dens + 2);
    this.olive = this.defineTree('olive', 8 * dens + 2);
    this.shrub = this.defineTree('shrub', 70 * dens + 6, { maxDist: 420 });
    this.tuft = this.defineTree('tuft', 90 * dens + 8, { shadow: false, ranges: { hi: 60, mid: 150 }, maxDist: 220 });
    this.tall = this.defineTree('grass', 20 * dens + 3, { shadow: false, ranges: { hi: 60, mid: 150 }, maxDist: 220 });
    this.lamps = this.defineLamps({ style: 'led', max: 8, glow: [1.5, 1.65, 1.9, 2.4], pool: '#cfe0ff' });
    const plain = m.plain({ roughness: 0.4, metalness: 0.5 });
    CAR_PAINTS.forEach((c, i) => {
      const key = `car#${i}`;
      this.cars.push(key);
      this.defineProp(key, carGeometry(c, (['hatch', 'sedan', 'suv'] as const)[i % 3]), plain, { max: 10, shadow: true });
    });
    const wallPaints = [rgb('#e8e2d4'), rgb('#d9c9a8'), rgb('#cfd2cc')];
    wallPaints.forEach((c, i) => {
      const key = `fence#${i}`;
      this.fences.push(key);
      this.defineProp(key, gardenFenceGeometry(c), m.pbr('plaster', { roughness: 1 }), { max: 40 });
    });
    this.defineProp(this.benchKey, benchGeometry(), plain, { max: 4 });
    this.defineProp(this.binKey, binGeometry(), plain, { max: 6 });
    this.defineProp(this.mailKey, mailboxGeometry(), plain, { max: 12 });
    this.defineStatic('plaster', m.pbr('plaster', { roughness: 1 }), true);
    this.defineStatic('roof', m.pbr('roof_tiles', { roughness: 0.9, side: THREE.DoubleSide }), true);
    this.defineStatic('trim', m.plain({ roughness: 0.7 }), false);
    this.defineStatic('glass', m.glass(), false);
    this.defineStatic('lit', m.glowing(this.night ? 1.7 : 0.4), false);
    this.defineStatic('asphalt', m.pbr('asphalt_worn', { roughness: 1 }), false);
    this.defineStatic('pave', m.pbr('pavement', { roughness: 1 }), false);
    this.defineStatic('steel', m.plain({ roughness: 0.5, metalness: 0.6 }), true);
  }

  /** Flat residential strip beside the road, easing into the ordinary hills further out. */
  override terrain(s: number, off: number, _side: number, base: number): number {
    const roadH = this.host.road.height(s);
    const k = smoothstep(70, 170, off);
    const flat = roadH - 0.1 + noise2(s * 0.01, off * 0.02, 3) * 0.15;
    return flat + (base - flat) * k;
  }

  override groundColor(s: number, off: number, _h: number, out: THREE.Color, side: number): boolean {
    if (off < 1) {
      out.setRGB(0.78, 0.76, 0.72);
      return true;
    }
    const n = noise2(s / 70 + side * 4, off / 30, 17);
    // Lawns: fresh green with drier patches.
    out.setRGB(0.3 + n * 0.08, 0.6 + n * 0.06, 0.16);
    if (off > 90) out.lerp(new THREE.Color(0.52, 0.55, 0.3), smoothstep(90, 220, off) * 0.7);
    return true;
  }

  override build(ctx: ChunkBuild): void {
    const half = this.host.half;
    const seed = this.host.seed;
    const sf = surfaces(ctx);

    // ── Service road, kerb and sidewalk on the right.
    const asphalt = ctx.stat('asphalt');
    ribbon(asphalt, ctx, half + 3.4, half + 8.8, { up: 0.02 }, { color: [0.85, 0.85, 0.85], uvPerM: this.host.worldMats.uv('asphalt_worn') });
    const pave = ctx.stat('pave');
    ribbon(pave, ctx, half + 8.8, half + 11.4, { up: 0.17 }, { color: [1, 1, 1], uvPerM: this.host.worldMats.uv('pavement') });
    wall(pave, ctx, half + 8.8, 0.02, 0.17, -1, 'road', { color: [0.85, 0.85, 0.85], uvPerM: 0.5 });
    wall(pave, ctx, half + 3.4, 0.0, 0.02, 1, 'road', { color: [0.5, 0.5, 0.5], uvPerM: 0.5 });
    // Painted edge line of the service road.
    ribbon(asphalt, ctx, half + 3.7, half + 3.82, { up: 0.025 }, { color: [2.2, 2.2, 2.1], uvPerM: 0.01 });

    // ── Street lamps every 32 m on the sidewalk and across the median.
    const lampPitch = 32;
    for (let k = Math.ceil(ctx.s0 / lampPitch); k * lampPitch < ctx.s0 + CHUNK_LENGTH; k++) {
      this.lamps.place(ctx, k * lampPitch, 1, 9.9);
      if (k % 2 === 0) this.lamps.place(ctx, k * lampPitch + 16, -1, 1.2);
    }

    // ── Plots: villas right, apartment blocks and villas on the far left side.
    const first = Math.floor(ctx.s0 / PLOT);
    const last = Math.floor((ctx.s0 + CHUNK_LENGTH - 1e-3) / PLOT);
    for (let k = first; k <= last; k++) {
      const s = k * PLOT + PLOT / 2;
      if (s < ctx.s0 || s >= ctx.s0 + CHUNK_LENGTH) continue;
      this.plot(ctx, sf, k, s, 1, half);
    }
    const lp = 42;
    for (let k = Math.floor(ctx.s0 / lp); k <= Math.floor((ctx.s0 + CHUNK_LENGTH - 1e-3) / lp); k++) {
      const s = k * lp + lp / 2;
      if (s < ctx.s0 || s >= ctx.s0 + CHUNK_LENGTH) continue;
      const r = new Rng(Math.floor(h2(k, -1, seed) * 1e9));
      const t = r.float();
      if (t < 0.55) apartment(ctx, sf, s, -(half + 34 + r.range(0, 8)), -1, { rng: r, night: this.night });
      else if (t < 0.85) house(ctx, sf, s, -(half + 26 + r.range(0, 6)), -1, { rng: r, night: this.night });
    }

    // ── Median and verge: plane trees in the central reservation, hedges and tufts.
    const tp = 14;
    for (let k = Math.ceil(ctx.s0 / tp); k * tp < ctx.s0 + CHUNK_LENGTH; k++) {
      const s = k * tp + (h2(k, 9, seed) - 0.5) * 3;
      ctx.put(this.plane[(k & 1) % this.plane.length], s, -(half + 2.2 + h2(k, 3, seed) * 0.6), { yaw: h2(k, 4, seed) * 6.28, scale: 0.8 + h2(k, 5, seed) * 0.35, y: this.host.road.height(s) - 0.1 }, true);
    }
    // Hedge along the sidewalk edge and grass strips.
    scatter(ctx, this.shrub, { count: 30, offMin: 12, offMax: 16, side: 1, scale: [0.7, 1.2], tint: [0.9, 1.1, 0.7], tintJitter: 0.2, reject: (_s, _d) => false });
    scatter(ctx, this.tuft, { count: 80, offMin: 1.4, offMax: 28, pow: 1.4, scale: [0.7, 1.4], tint: [1.6, 1.4, 0.7], tintJitter: 0.3 });
    scatter(ctx, this.tall, { count: 16, offMin: 2, offMax: 12, scale: [0.7, 1.3], tint: [1.8, 1.55, 0.8], tintJitter: 0.3 });
    // Background trees: street plane trees and gardens beyond the plots, wooded hills further out.
    scatter(ctx, this.plane, { count: 18, offMin: 40, offMax: 260, pow: 1.3, scale: [0.85, 1.4] });
    scatter(ctx, this.cypress, { count: 3, offMin: 30, offMax: 200, scale: [0.9, 1.4] });

    // ── Parked cars along the service road edge, sidewalk furniture.
    const cp = 11;
    for (let k = Math.ceil(ctx.s0 / cp); k * cp < ctx.s0 + CHUNK_LENGTH; k++) {
      if (h2(k, 21, seed) > 0.42) continue;
      const s = k * cp + h2(k, 22, seed) * 4;
      ctx.put(this.cars[Math.floor(h2(k, 23, seed) * this.cars.length)], s, half + 7.55, { yaw: (h2(k, 24, seed) - 0.5) * 0.06, y: this.host.road.height(s) + 0.02 }, true);
    }
    for (let k = Math.ceil(ctx.s0 / 64); k * 64 < ctx.s0 + CHUNK_LENGTH; k++) {
      const s = k * 64 + 20;
      ctx.put(this.benchKey, s, half + 10.6, { yaw: -Math.PI / 2, y: this.host.road.height(s) + 0.17 }, true);
      ctx.put(this.binKey, s + 2.4, half + 10.8, { y: this.host.road.height(s) + 0.17 }, true);
    }
    // Bus shelter every ~280 m.
    const bk = Math.floor((ctx.s0 + CHUNK_LENGTH * 0.5) / 280);
    const bs = bk * 280 + 90;
    if (bs >= ctx.s0 && bs < ctx.s0 + CHUNK_LENGTH) this.busStop(ctx, sf, bs, half + 10.4);
  }

  /** One housing plot on the right side: villa with garden wall, driveway, mailbox and garden trees. */
  private plot(ctx: ChunkBuild, sf: Surfaces, k: number, s: number, side: 1 | -1, half: number): void {
    const seed = this.host.seed;
    const r = new Rng(Math.floor(h2(k, side, seed) * 1e9));
    const t = r.float();
    const off = 18 + r.range(0, 4);
    const d = side * (half + off);
    if (t < 0.12) {
      // Vacant plot: a few trees and a path.
      for (let i = 0; i < 3; i++) ctx.put(this.plane[r.int(0, this.plane.length - 1)], s + r.range(-9, 9), side * (half + 14 + r.range(0, 8)), { yaw: r.range(0, 6.28), scale: r.range(0.8, 1.3) }, true);
      return;
    }
    if (t > 0.9) {
      apartment(ctx, sf, s, side * (half + off + 6), side, { rng: r, night: this.night });
    } else {
      house(ctx, sf, s, d, side, { rng: r, night: this.night, width: r.range(9, 13) });
      // Garden: front trees, cypress at the corner, hedges.
      const nt = r.int(1, 3);
      for (let i = 0; i < nt; i++) {
        const key = r.chance(0.55) ? this.plane[r.int(0, this.plane.length - 1)] : r.chance(0.5) ? this.olive[r.int(0, this.olive.length - 1)] : this.cypress[0];
        ctx.put(key, s + r.range(-11, 11), side * (half + 13.4 + r.range(0, 12)), { yaw: r.range(0, 6.28), scale: r.range(0.75, 1.2), tint: new THREE.Color().setRGB(r.range(0.9, 1.1), r.range(0.92, 1.1), r.range(0.85, 1.05)) }, true);
      }
    }
    // Frontage wall with railing in 4 m segments, a gap for the driveway.
    const gap = Math.floor(r.range(2, 6));
    for (let i = 0; i < 7; i++) {
      if (i === gap) continue;
      const ss = s - PLOT / 2 + 1.5 + i * 4;
      ctx.put(this.fences[k % this.fences.length], ss, side * (half + 12.6), { yaw: Math.PI / 2, scale: 1, y: this.host.road.height(ss) + 0.02 }, true);
    }
    // Driveway slab and mailbox.
    const sd = s - PLOT / 2 + 1.5 + gap * 4;
    patch(ctx.stat('pave'), ctx, sd - 2, sd + 2, side * (half + 11.4), side * (half + off - 4), 0.045, { color: [0.9, 0.9, 0.9], uvPerM: this.host.worldMats.uv('pavement') });
    ctx.put(this.mailKey, sd + 2.6, side * (half + 11.9), { y: this.host.road.height(sd) + 0.02, yaw: (side * Math.PI) / 2 }, true);
  }

  /** Bus shelter: glass-and-steel canopy with a bench and a blue stop sign. */
  private busStop(ctx: ChunkBuild, sf: Surfaces, s: number, d: number): void {
    const steel = ctx.stat('steel');
    const y = ctx.localY(this.host.road.height(s)) + 0.17;
    const p = ctx.local(s, d, 0);
    steel.push(p.x, y, p.z, ctx.yaw(s) + ctx.faceRoad(1));
    steel.box(0, 2.5, 0, 3.6, 0.1, 1.6, { color: rgb('#3a4650') });
    for (const x of [-1.7, 1.7]) steel.box(x, 1.25, 0.7, 0.07, 2.5, 0.07, { color: rgb('#59636b') });
    steel.box(0, 1.2, 0.74, 3.4, 2.1, 0.03, { color: rgb('#a7c3cf') });
    steel.box(0, 0.5, 0.45, 2.6, 0.06, 0.4, { color: rgb('#8a5a36') });
    steel.pop();
    void sf;
  }
}

export { mul };
export { NEAR_BAND };
