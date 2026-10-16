import * as THREE from 'three';
import { fbm2, noise2, smoothstep } from '../../../core/math';
import { rgb } from '../kit';
import { gantry, kmPost } from '../furniture';
import { simpleProp } from '../instances';
import { buildRock } from '../rocks';
import { CHUNK_LENGTH, Scenery, type ChunkBuild, type SceneryHost } from '../scenery';
import { NEAR_BAND, h2, patchy, scatter } from '../scatter';
import { REGION_CITIES, type SignDest } from '../signs';

const FIELD_GREEN = rgb('#6f8a3a');
const FIELD_STRAW = rgb('#9c9560');
const FIELD_PLOWED = rgb('#7d6a50');
const FIELD_SCRUB = rgb('#7d8248');

/**
 * Ege Otoyolu (İzmir–Aydın): olive groves in parcels, stone pines, limestone outcrops, dry
 * hills in a patchwork of fields, oleander in the central reservation, green guide-sign
 * gantries and kilometre posts.
 */
export class HighwayScenery extends Scenery {
  private olive: string[];
  private pine: string[];
  private shrub: string[];
  private oleander: string[];
  private cypress: string[];
  private tuft: string[];
  private tall: string[];
  private rocks: string[] = [];

  constructor(host: SceneryHost) {
    super(host);
    const dens = host.quality.sceneryDensity;
    this.olive = this.defineTree('olive', 130 * dens + 8, { ranges: { hi: 90, mid: 260 } });
    this.pine = this.defineTree('stonepine', 16 * dens + 2);
    this.cypress = this.defineTree('cypress', 8 * dens + 1);
    this.shrub = this.defineTree('maki', 60 * dens + 4, { maxDist: 520 });
    this.oleander = this.defineTree('oleander', 36, { shadow: false });
    this.tuft = this.defineTree('tuft', 140 * dens + 10, { shadow: false, ranges: { hi: 60, mid: 150 }, maxDist: 240 });
    this.tall = this.defineTree('grass', 34 * dens + 4, { shadow: false, ranges: { hi: 60, mid: 150 }, maxDist: 240 });
    const rockMat = host.worldMats.pbr('rock', { roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const key = `rock#${i}`;
      this.rocks.push(key);
      this.propDefs.set(
        key,
        simpleProp(key, buildRock({ seed: 11 + i * 7, radius: 1.5, detail: 3, flat: 0.62, rough: 0.7, stretch: 1.25, base: '#e2dccd', strata: 0.25, uvPerM: 1 / 2.7 }), rockMat, { max: Math.ceil((14 * dens + 2) / 3) + 1, shadow: host.quality.worldShadows }),
      );
    }
    this.defineStatic('steel', host.worldMats.plain({ roughness: 0.55, metalness: 0.5 }), true);
  }

  /** Dry Aegean hills: higher, rounder ridges with terraces on the far side. */
  override terrain(s: number, off: number, side: number, base: number): number {
    const ridge = fbm2(s * 0.0017 + side * 13, off * 0.0035, 3, this.host.seed + 5);
    return base + 9 * Math.max(0, ridge - 0.35) * smoothstep(60, 220, off);
  }

  override groundColor(s: number, off: number, h: number, out: THREE.Color, side: number): boolean {
    if (off < 1) {
      out.setRGB(0.78, 0.76, 0.72);
      return true;
    }
    // Smooth patchwork of fields: plowed brown, straw yellow, green grove soil, olive scrub.
    const f = noise2(s / 120 + side * 7.3, off / 46, 91);
    const g = noise2(s / 40 + 3, off / 17 + side, 29);
    const plowed = smoothstep(-0.18, -0.34, f);
    const green = smoothstep(0.12, 0.34, f);
    const scrub = smoothstep(0.55, 0.8, off > 60 ? g * 0.5 + 0.5 : 0);
    out.setRGB(FIELD_STRAW[0], FIELD_STRAW[1], FIELD_STRAW[2]);
    out.lerp(_c.setRGB(FIELD_GREEN[0], FIELD_GREEN[1], FIELD_GREEN[2]), green);
    out.lerp(_c.setRGB(FIELD_PLOWED[0], FIELD_PLOWED[1], FIELD_PLOWED[2]), plowed);
    out.lerp(_c.setRGB(FIELD_SCRUB[0], FIELD_SCRUB[1], FIELD_SCRUB[2]), scrub * 0.6);
    // Verge: scorched next to the asphalt, darker in the ditch, rocky on the hilltops.
    if (off < 5) out.lerp(_c.setRGB(0.7, 0.62, 0.45), 0.5 * (1 - smoothstep(1, 5, off)));
    const k = 0.85 + g * 0.3;
    out.multiplyScalar(k);
    if (h > 55) out.lerp(_c.setRGB(0.68, 0.6, 0.47), smoothstep(55, 130, h) * 0.6);
    return true;
  }

  override build(ctx: ChunkBuild): void {
    const half = this.host.half;
    const rng = ctx.rng;
    const oneway = this.host.lanes.layout === 'oneway';
    const seed = this.host.seed;

    // Central reservation oleander hedge (one-way carriageway).
    if (oneway) {
      const n = 26;
      for (let i = 0; i < n; i++) {
        const s = ctx.s0 + (i + rng.float() * 0.7) * (CHUNK_LENGTH / n);
        // The median is a raised, level strip: the hedge sits on the road's own height, not in the ditch.
        ctx.put(this.oleander[0], s, -(half + 1.55 + rng.float() * 0.6), { yaw: rng.range(0, 6.28), scale: rng.range(1.15, 1.6), y: this.host.road.height(s) - 0.15 }, true);
      }
    }

    // Olive groves: parcels on a grid, planted in rows parallel to the road.
    const parcel = 130;
    const first = Math.floor(ctx.s0 / parcel) - 1;
    const last = Math.floor((ctx.s0 + CHUNK_LENGTH) / parcel) + 1;
    const c = new THREE.Color();
    for (let k = first; k <= last; k++) {
      for (const side of [1, -1] as const) {
        if (h2(k, side, seed) > 0.66) continue;
        const s0 = k * parcel + h2(k, side, 3) * 30;
        const len = 70 + h2(k, side, 5) * 50;
        const o0 = 16 + h2(k, side, 7) * 22;
        const rows = 3 + Math.floor(h2(k, side, 9) * 6);
        const sp = 7.2;
        for (let r = 0; r < rows; r++) {
          for (let sI = 0; sI * sp < len; sI++) {
            const s = s0 + sI * sp + (r % 2) * sp * 0.5;
            if (s < ctx.s0 || s >= ctx.s0 + CHUNK_LENGTH) continue;
            if (rng.float() > Math.min(1, ctx.density * 1.1 + 0.2)) continue;
            const off = o0 + r * sp;
            ctx.put(
              this.olive[rng.int(0, this.olive.length - 1)],
              s + rng.range(-0.7, 0.7),
              side * (half + off + rng.range(-0.7, 0.7)),
              { yaw: rng.range(0, 6.28), scale: rng.range(0.85, 1.2), tint: c.setRGB(rng.range(0.9, 1.1), rng.range(0.92, 1.08), rng.range(0.85, 1.05)) },
              off < NEAR_BAND,
            );
          }
        }
      }
    }
    // Scattered olives, pines and cypresses in the fields between.
    scatter(ctx, this.olive, { count: 26, offMin: 6, offMax: 150, pow: 1.4, scale: [0.8, 1.3], mask: (s, d) => patchy(s, d, 90, 2, 0.4, 0.62) });
    scatter(ctx, this.pine, { count: 2.2, offMin: 10, offMax: 240, pow: 1.2, scale: [0.8, 1.3] });
    scatter(ctx, this.cypress, { count: 1.2, offMin: 12, offMax: 120, scale: [0.85, 1.3] });
    // Ground cover: tufts of dry and green grass, low shrubs, limestone outcrops.
    scatter(ctx, this.tuft, { count: 110, offMin: 1.5, offMax: 30, pow: 1.5, scale: [0.7, 1.5], tint: [2.3, 1.75, 0.75], tintJitter: 0.3, spin: true });
    scatter(ctx, this.tall, { count: 26, offMin: 2.5, offMax: 22, pow: 1.4, scale: [0.7, 1.4], tint: [2.4, 1.9, 0.8], tintJitter: 0.25 });
    scatter(ctx, this.shrub, { count: 40, offMin: 2.2, offMax: 70, pow: 1.5, scale: [0.6, 1.6], tint: [1.15, 1.1, 0.85], tintJitter: 0.25 });
    scatter(ctx, this.rocks, { count: 7, offMin: 6, offMax: 180, pow: 1.6, scale: [0.5, 1.9], sink: 0.35, tilt: 0.12 });

    // Kilometre posts on the right every 1000 m and guide-sign gantries every ~1.4 km.
    const k0 = Math.ceil(ctx.s0 / 1000);
    if (k0 * 1000 < ctx.s0 + CHUNK_LENGTH) kmPost(ctx, k0 * 1000, 1);
    const gk = Math.floor((ctx.s0 + CHUNK_LENGTH * 0.5) / 1400);
    const gs = gk * 1400 + 280 + h2(gk, 1, seed) * 300;
    if (gs >= ctx.s0 && gs < ctx.s0 + CHUNK_LENGTH) {
      const cities = REGION_CITIES.highway;
      const pick = (j: number): SignDest => {
        const cc = cities[Math.floor(h2(gk, j, 11) * cities.length)];
        return { name: cc[0], km: Math.max(2, Math.round(cc[1] - gs / 1000 + 30 + h2(gk, j, 13) * 40)) };
      };
      gantry(ctx, gs, [[{ ...pick(1), arrow: '↑' }, pick(2)], [{ ...pick(3), arrow: '↗' }, pick(4)]], 'E-87', { lit: this.host.env.scenery.lightsOn });
    }
  }
}

const _c = new THREE.Color();
