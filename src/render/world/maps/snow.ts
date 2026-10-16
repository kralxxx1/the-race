import * as THREE from 'three';
import { Rng, noise2, smoothstep } from '../../../core/math';
import type { RangeSpec } from '../backdrop';
import { house, surfaces } from '../buildings';
import { GeoBuilder, mul, rgb, type RGB } from '../kit';
import { buildRock } from '../rocks';
import { CHUNK_LENGTH, Scenery, type ChunkBuild, type SceneryHost } from '../scenery';
import { h2, line, patchy, scatter } from '../scatter';

/** Snow bank cross-section: (metres beyond the paved edge, height as a fraction of the bank height). */
const BANK_PROFILE: [number, number][] = [[0.15, 0], [0.45, 0.5], [1.1, 0.95], [1.9, 1], [2.9, 0.62], [4.0, 0.2], [5.2, 0]];

/**
 * Palandöken pass: snow banks along the carriageway, snow-laden spruce and pines, rock faces
 * streaked with snow, orange snow poles, timber chalets with heavy white roofs and a ski-lift line
 * climbing the slope. Falling snow comes from the game view's Snowfall in snow weather.
 */
export class SnowScenery extends Scenery {
  private spruce: string[];
  private pine: string[];
  private shrub: string[];
  private tuft: string[];
  private rocks: string[] = [];
  private poleKey = 'snowpole';
  private liftKey = 'liftpylon';
  private night: boolean;

  constructor(host: SceneryHost) {
    super(host);
    const dens = host.quality.sceneryDensity;
    const m = host.worldMats;
    this.night = host.env.scenery.lightsOn;
    this.spruce = this.defineTree('spruce', 100 * dens + 10, { ranges: { hi: 80, mid: 240 } });
    this.pine = this.defineTree('redpine', 14 * dens + 2);
    this.shrub = this.defineTree('maki', 40 * dens + 4, { maxDist: 320 });
    this.tuft = this.defineTree('tuft', 60 * dens + 6, { shadow: false, ranges: { hi: 50, mid: 120 }, maxDist: 180 });
    const rock = m.pbr('rock', { roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const key = `rock#${i}`;
      this.rocks.push(key);
      this.defineProp(key, buildRock({ seed: 71 + i * 3, radius: 1.8, detail: 3, flat: 0.9, rough: 0.7, stretch: 1.15, base: '#9aa0a6', strata: 0.15, uvPerM: 1 / 2.7, angular: i % 2 === 1 }), rock, { max: Math.ceil((22 * dens + 4) / 4) + 1, shadow: true });
    }
    this.defineProp(this.poleKey, snowPoleGeometry(), m.plain({ roughness: 0.6 }), { max: 20 });
    this.defineProp(this.liftKey, liftPylonGeometry(), m.plain({ roughness: 0.5, metalness: 0.5 }), { max: 4, shadow: true });
    this.defineStatic('snow', m.pbr('snow', { roughness: 0.95 }), true);
    this.defineStatic('planks', m.pbr('planks', { roughness: 1 }), true);
    this.defineStatic('roof', m.pbr('snow', { roughness: 0.95, side: THREE.DoubleSide }), true);
    this.defineStatic('trim', m.plain({ roughness: 0.8 }), false);
    this.defineStatic('glass', m.glass(), false);
    this.defineStatic('lit', m.glowing(this.night ? 1.7 : 0.4), false);
    this.defineStatic('steel', m.plain({ roughness: 0.5, metalness: 0.6 }), true);
  }

  /** Alpine relief: high ridges on the left, the slope falling away to a valley on the right. */
  override terrain(s: number, off: number, side: number, base: number): number {
    const roadH = this.host.road.height(s);
    const rel = base - roadH;
    const n = noise2(s * 0.01, off * 0.02, 7);
    if (side < 0) {
      const wall = Math.min(off, 60) * 0.4 + Math.max(0, off - 60) * 0.8;
      return roadH - 0.05 + wall * smoothstep(0.6, 6, off) + rel * 1.6 * smoothstep(20, 200, off) + n * 3 * smoothstep(5, 60, off);
    }
    const drop = smoothstep(14, 70, off) * -22;
    return roadH - 0.05 + rel * 0.5 * smoothstep(30, 200, off) + drop + n * 2.2 * smoothstep(5, 60, off) + 28 * smoothstep(260, 420, off);
  }

  override groundColor(s: number, off: number, _h: number, out: THREE.Color, side: number): boolean {
    if (off < 1) {
      out.setRGB(0.7, 0.72, 0.76);
      return true;
    }
    const n = noise2(s / 55 + side * 5, off / 28, 4);
    out.setRGB(0.86 + n * 0.06, 0.9 + n * 0.05, 0.97);
    return true;
  }

  override ranges(): RangeSpec[] {
    return [
      { radius: 3200, height: 980, low: '#8497ac', mid: '#9db0c4', peak: '#d3dde8', snowLine: 0.34, sharp: 0.92, amp: 0.95, seed: 43, haze: 0.5 },
      { radius: 2600, height: 760, low: '#526068', mid: '#8795a1', peak: '#cdd6df', snowLine: 0.28, sharp: 0.82, amp: 0.9, seed: 11, haze: 0.28, forest: '#33443f' },
    ];
  }

  override build(ctx: ChunkBuild): void {
    const half = this.host.half;
    const rng = ctx.rng;
    const seed = this.host.seed;
    const road = this.host.road;
    const sf = surfaces(ctx, 'planks');

    // ── Snow banks on both sides, higher where the plough heaped it.
    const snow = ctx.stat('snow');
    for (const side of [1, -1] as const) this.bank(snow, ctx, side);

    // ── Orange-and-black snow poles, 24 m apart.
    line(ctx, this.poleKey, { every: 24, off: 0.55, side: 0, facing: 'along' });

    // ── Snow-laden spruce and pine, thicker on the slope side, with rocks and scrub.
    const woods = (s: number, d: number) => 0.3 + 0.7 * patchy(s, d, 90, 5, 0.25, 0.55) * (d < 0 ? 1 : 0.7);
    scatter(ctx, this.spruce, { count: 46, offMin: 5, offMax: 60, pow: 1.2, scale: [0.65, 1.3], mask: woods });
    scatter(ctx, this.spruce, { count: 70, offMin: 60, offMax: 280, pow: 1.1, scale: [0.8, 1.6], mask: woods });
    scatter(ctx, this.pine, { count: 7, offMin: 8, offMax: 120, scale: [0.7, 1.2] });
    scatter(ctx, this.shrub, { count: 26, offMin: 3, offMax: 70, pow: 1.4, scale: [0.6, 1.4], tint: [0.8, 0.85, 0.7], tintJitter: 0.2 });
    scatter(ctx, this.tuft, { count: 40, offMin: 2, offMax: 30, pow: 1.3, scale: [0.7, 1.2], tint: [1.7, 1.55, 0.9], tintJitter: 0.3 });
    scatter(ctx, this.rocks, { count: 16, offMin: 3, offMax: 90, pow: 1.3, scale: [0.6, 2.8], sink: 0.5, tilt: 0.25 });

    // ── Chalets on the sunny slope; ski-lift pylons climbing it.
    const hp = 150;
    for (let k = Math.floor(ctx.s0 / hp); k <= Math.floor((ctx.s0 + CHUNK_LENGTH - 1e-3) / hp); k++) {
      const s = k * hp + hp * 0.45 + h2(k, 1, seed) * 40;
      if (s < ctx.s0 || s >= ctx.s0 + CHUNK_LENGTH || h2(k, 2, seed) > 0.6) continue;
      const r = new Rng(Math.floor(h2(k, 3, seed) * 1e9));
      house(ctx, sf, s, -(half + 26 + r.range(0, 28)), -1, { rng: r, night: this.night, floors: r.int(2, 3), wall: mul(rgb('#5e3f28'), 2.6), roof: mul(rgb('#f4f7fb'), 1.2), lit: 0.75 });
    }
    const lk = 260;
    for (let k = Math.ceil(ctx.s0 / lk); k * lk < ctx.s0 + CHUNK_LENGTH; k++) {
      // Lift line runs diagonally up the left slope: offset grows with k, so pylons climb away from the road.
      const off = 40 + ((k * 7) % 11) * 12;
      ctx.put(this.liftKey, k * lk, -(half + off), { yaw: ctx.yaw(k * lk) * 0, scale: 1.2 }, true);
    }
    void road;
    void rng;
  }

  /** One snow bank: a lumpy ridge swept along the chunk, sitting on the terrain. */
  private bank(b: GeoBuilder, ctx: ChunkBuild, side: 1 | -1): void {
    const half = this.host.half;
    const step = 3;
    const n = Math.round(CHUNK_LENGTH / step);
    const rows: THREE.Vector3[][] = [];
    const white: RGB = [1.0, 1.02, 1.08];
    for (let r = 0; r <= n; r++) {
      const s = ctx.s0 + (r / n) * CHUNK_LENGTH;
      // Height changes slowly (ploughing) with small bumps.
      const hgt = 0.55 + 0.7 * (noise2(s / 70, side * 3.3, 11) * 0.5 + 0.5) + 0.15 * noise2(s / 9, side, 5);
      const row: THREE.Vector3[] = [];
      for (const [o, f] of BANK_PROFILE) {
        const d = side * (half + o);
        const p = ctx.local(s, d, 0, new THREE.Vector3());
        p.y = ctx.localY(ctx.groundY(s, d)) + f * hgt * (1 + 0.12 * noise2(s / 4, o * 3, 2));
        row.push(p);
      }
      rows.push(row);
    }
    const k = 0.4;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < BANK_PROFILE.length - 1; c++) {
        const a = rows[r][c];
        const bb = rows[r][c + 1];
        const cc = rows[r + 1][c + 1];
        const d = rows[r + 1][c];
        const u0 = BANK_PROFILE[c][0] * k;
        const u1 = BANK_PROFILE[c + 1][0] * k;
        const v0 = (ctx.s0 + (r / n) * CHUNK_LENGTH) * k;
        const v1 = (ctx.s0 + ((r + 1) / n) * CHUNK_LENGTH) * k;
        const uvs = [u0, v0, u1, v0, u1, v1, u0, v1] as const;
        // Wound upwards for the right side (profile offsets grow towards +x); mirrored on the left.
        if (side > 0) b.quad([a.x, a.y, a.z], [bb.x, bb.y, bb.z], [cc.x, cc.y, cc.z], [d.x, d.y, d.z], { color: white }, uvs);
        else b.quad([a.x, a.y, a.z], [d.x, d.y, d.z], [cc.x, cc.y, cc.z], [bb.x, bb.y, bb.z], { color: white }, [u0, v0, u0, v1, u1, v1, u1, v0]);
      }
    }
  }
}

/** Roadside snow pole: slim post with an orange head and a black band. */
function snowPoleGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.frustum(0, 0, 0, 0.035, 0.035, 2.3, 6, { color: rgb('#25282b') });
  b.frustum(0, 1.75, 0, 0.04, 0.04, 0.55, 6, { color: rgb('#f2640d') });
  b.frustum(0, 1.55, 0, 0.04, 0.04, 0.12, 6, { color: rgb('#f2f2f0') });
  return b.build();
}

/** Ski-lift tower: tubular mast with a cross-arm carrying two sheaves. */
function liftPylonGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const steel = rgb('#7d868d');
  b.frustum(0, 0, 0, 0.22, 0.16, 11, 8, { color: steel }, true);
  b.box(0, 10.6, 0, 4.4, 0.18, 0.3, { color: steel });
  for (const x of [-2, 2]) {
    b.frustum(x, 10.0, 0, 0.22, 0.22, 0.28, 8, { color: rgb('#2b2f33') }, true);
    b.box(x, 10.4, 0, 0.1, 0.9, 0.1, { color: steel });
  }
  for (const [x, z] of [[-0.9, 0], [0.9, 0]] as const) b.limb([x, 0, z], [0, 4.5, 0], 0.07, 0.07, 4, { color: steel });
  return b.build();
}
