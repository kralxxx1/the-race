import * as THREE from 'three';
import { Rng, noise2, smoothstep } from '../../../core/math';
import { house, surfaces } from '../buildings';
import { GeoBuilder, mul, rgb } from '../kit';
import { buildRock } from '../rocks';
import { CHUNK_LENGTH, Scenery, type ChunkBuild, type SceneryHost } from '../scenery';
import { h2, patchy, scatter } from '../scatter';
import type { RangeSpec } from '../backdrop';
import { createWaterMaterial, waterStrip } from '../water';

/** River centre offset (metres beyond the paved edge, right side) and half width at road distance s. */
function riverCentre(s: number): number {
  return 27 + 9 * Math.sin(s / 150 + 1.3) + 5 * Math.sin(s / 71) + 4 * noise2(s / 90, 2.2, 5);
}
function riverHalfWidth(s: number): number {
  return 5.5 + 2.5 * (noise2(s / 130, 8.1, 3) * 0.5 + 0.5);
}

const RIVER_COLUMNS = [8, 10.5, 13, 15.5, 18, 20.5, 23, 25.5, 28, 30.5, 33, 35.5, 38, 40.5, 43, 46, 50];
const TERRACE = 2.3;

/**
 * Rize–Ayder: spruce and fir forest right down to the road, a boulder-strewn river on the right,
 * tea terraces and weathered timber houses on the left slope, moss, ferns and low cloud.
 */
export class ForestScenery extends Scenery {
  private spruce: string[];
  private broad: string[];
  private shrub: string[];
  private tuft: string[];
  private tall: string[];
  private rocks: string[] = [];
  private logKey = 'log';
  private water: THREE.MeshStandardMaterial;
  private night: boolean;

  constructor(host: SceneryHost) {
    super(host);
    const dens = host.quality.sceneryDensity;
    const m = host.worldMats;
    this.night = host.env.scenery.lightsOn;
    this.spruce = this.defineTree('spruce', 240 * dens + 20, { ranges: { hi: 80, mid: 240 } });
    this.broad = this.defineTree('plane', 14 * dens + 2, { ranges: { hi: 80, mid: 220 } });
    this.shrub = this.defineTree('shrub', 70 * dens + 6, { maxDist: 380 });
    this.tuft = this.defineTree('tuft', 120 * dens + 10, { shadow: false, ranges: { hi: 55, mid: 130 }, maxDist: 210 });
    this.tall = this.defineTree('grass', 40 * dens + 4, { shadow: false, ranges: { hi: 55, mid: 130 }, maxDist: 210 });
    const rockMat = m.pbr('rock', { roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const key = `rock#${i}`;
      this.rocks.push(key);
      this.defineProp(key, buildRock({ seed: 51 + i * 9, radius: 1.5, detail: 3, flat: 0.8, rough: 0.55, stretch: 1.2, base: '#8f9c86', strata: 0.1, uvPerM: 1 / 2.7 }), rockMat, { max: Math.ceil((30 * dens + 4) / 4) + 1, shadow: true });
    }
    this.defineProp(this.logKey, logGeometry(), m.pbr('bark', { roughness: 1 }), { max: 10, shadow: true });
    this.defineStatic('planks', m.pbr('planks', { roughness: 1 }), true);
    this.defineStatic('roof', m.pbr('facade_industrial', { roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }), true);
    this.defineStatic('trim', m.plain({ roughness: 0.8 }), false);
    this.defineStatic('glass', m.glass(), false);
    this.defineStatic('lit', m.glowing(this.night ? 1.7 : 0.4), false);
    this.water = m.adopt(
      createWaterMaterial(m.uniforms, { shallow: '#6a9a8e', deep: '#1f4a4a', waveAmp: 0.04, chop: 0.8, foam: 0.9, flow: 1.9, deepAt: 3 }),
    );
  }

  override extraTerrainOffsets(): number[] {
    return RIVER_COLUMNS.slice(1, -1);
  }

  override terrain(s: number, off: number, side: number, base: number): number {
    const roadH = this.host.road.height(s);
    const rel = base - roadH; // generic hills + ditch
    if (side > 0) {
      // Valley floor beside the road, a river channel, then the forested hillside beyond.
      const c = riverCentre(s);
      const w = riverHalfWidth(s);
      const bank = Math.abs(off - c);
      const channel = 1 - smoothstep(w * 0.55, w + 4.5, bank);
      const floor = roadH - 1.1 + noise2(s * 0.03, off * 0.05, 4) * 0.35;
      const hills = rel * smoothstep(34, 160, off) + 7 * smoothstep(40, 140, off);
      const bed = roadH - 5.4 + noise2(s * 0.12, off * 0.2, 6) * 0.3;
      return floor + hills + (bed - floor - hills) * channel;
    }
    // Left: steep wooded slope with tea terraces.
    const slope = Math.min(off, 70) * 0.28 + 6 * smoothstep(60, 200, off);
    let h = roadH - 0.05 + slope + rel * smoothstep(30, 160, off);
    if (off > 32 && off < 150) {
      // Terraces: quantise the slope into treads with short risers.
      const t = (h - roadH) / TERRACE;
      const f = t - Math.floor(t);
      h = roadH + (Math.floor(t) + smoothstep(0.78, 1.0, f)) * TERRACE;
    }
    return h;
  }

  override groundColor(s: number, off: number, h: number, out: THREE.Color, side: number): boolean {
    if (off < 1) {
      out.setRGB(0.7, 0.7, 0.66);
      return true;
    }
    const n = noise2(s / 45 + side * 3, off / 22, 17);
    // Deep moss green forest floor.
    out.setRGB(0.18 + n * 0.05, 0.34 + n * 0.05, 0.12);
    if (side < 0 && off > 32 && off < 150) {
      // Tea: bright rows on the terrace treads, dark stone-faced risers.
      const t = h / TERRACE;
      const f = t - Math.floor(t);
      out.setRGB(0.2 + n * 0.04, 0.52 + n * 0.05, 0.1);
      if (f > 0.7) out.setRGB(0.12, 0.2, 0.08);
    }
    if (side > 0) {
      const c = riverCentre(s);
      const w = riverHalfWidth(s);
      if (Math.abs(off - c) < w + 2) out.setRGB(0.4, 0.38, 0.33); // pebbles and wet earth
    }
    return true;
  }

  override ranges(): RangeSpec[] {
    return [
      { radius: 3200, height: 640, low: '#4f6a62', mid: '#6d8581', peak: '#9bb0b0', snowLine: 9, sharp: 0.55, amp: 0.8, seed: 31, haze: 0.62 },
      { radius: 2600, height: 520, low: '#2c4a38', mid: '#3d5a4c', peak: '#6c8479', snowLine: 9, sharp: 0.5, amp: 0.8, seed: 17, haze: 0.4, forest: '#27422f' },
    ];
  }

  override build(ctx: ChunkBuild): void {
    const half = this.host.half;
    const rng = ctx.rng;
    const seed = this.host.seed;
    const road = this.host.road;
    const sf = surfaces(ctx, 'planks');

    // ── River: shallow, fast, stony.
    const geo = waterStrip(ctx, {
      side: 1,
      level: (s) => road.height(s) - 3.15,
      offNear: 0,
      offFar: 50,
      columns: RIVER_COLUMNS,
      ground: (s, d) => this.terrain(s, Math.abs(d) - half, 1, road.height(s) - 0.05),
      step: 4,
    });
    if (geo) {
      const mesh = new THREE.Mesh(geo, this.water);
      mesh.renderOrder = 1;
      mesh.matrixAutoUpdate = false;
      ctx.chunk.group.add(mesh);
      ctx.chunk.extras.push(mesh);
    }

    // ── Forest: dense spruce on both sides, thinning around the river and the tea terraces.
    const inRiver = (s: number, d: number) => d > 0 && Math.abs(d - half - riverCentre(s)) < riverHalfWidth(s) + 1.5;
    const teaZone = (d: number, off: number) => d < 0 && off > 30 && off < 150;
    scatter(ctx, this.spruce, { count: 95, offMin: 4.5, offMax: 46, pow: 1.1, scale: [0.65, 1.45], mask: (s, d) => 0.35 + 0.65 * patchy(s, d, 70, 7, 0.2, 0.5), reject: (s, d, off) => inRiver(s, d) || teaZone(d, off) });
    scatter(ctx, this.spruce, { count: 120, offMin: 46, offMax: 260, pow: 1.2, scale: [0.8, 1.7], reject: (s, d, off) => inRiver(s, d) || teaZone(d, off) });
    scatter(ctx, this.broad, { count: 8, offMin: 5, offMax: 60, scale: [0.6, 1.0], tint: [0.7, 0.95, 0.5], tintJitter: 0.25, reject: (s, d, off) => inRiver(s, d) || teaZone(d, off) });
    // Understory: ferns/rhododendron, grass, moss-covered boulders and fallen logs.
    scatter(ctx, this.shrub, { count: 54, offMin: 2.5, offMax: 60, pow: 1.3, scale: [0.6, 1.4], tint: [0.55, 0.85, 0.5], tintJitter: 0.3, reject: (s, d, off) => inRiver(s, d) || teaZone(d, off) });
    scatter(ctx, this.tuft, { count: 120, offMin: 1.5, offMax: 36, pow: 1.4, scale: [0.8, 1.6], tint: [0.9, 1.25, 0.6], tintJitter: 0.3, reject: (s, d) => inRiver(s, d) });
    scatter(ctx, this.tall, { count: 36, offMin: 2.5, offMax: 26, pow: 1.3, scale: [0.8, 1.4], tint: [0.9, 1.2, 0.6], tintJitter: 0.25, reject: (s, d) => inRiver(s, d) });
    scatter(ctx, this.rocks, { count: 16, offMin: 3, offMax: 70, pow: 1.3, scale: [0.5, 2.2], sink: 0.4, tilt: 0.2, reject: (s, d) => inRiver(s, d) });
    // Stones along the river edge and in the shallows.
    for (let i = 0; i < 12; i++) {
      const s = ctx.s0 + rng.float() * CHUNK_LENGTH;
      const c = riverCentre(s);
      const w = riverHalfWidth(s);
      const off = c + rng.range(-w - 1.5, w + 1.5);
      ctx.put(this.rocks[rng.int(0, this.rocks.length - 1)], s, half + off, { yaw: rng.range(0, 6.28), scale: rng.range(0.35, 1.1), sink: 0.5, pitch: 0.15, roll: 0.15 }, true);
    }
    for (let i = 0; i < 2; i++) {
      if (rng.float() > 0.6) continue;
      const side = rng.chance(0.6) ? 1 : -1;
      const s = ctx.s0 + rng.float() * CHUNK_LENGTH;
      const off = 3 + rng.float() * 20;
      if (inRiver(s, side * (half + off))) continue;
      ctx.put(this.logKey, s, side * (half + off), { yaw: rng.range(0, 6.28), scale: rng.range(0.8, 1.5), sink: 0.15, roll: 0.04 }, true);
    }

    // ── Timber houses on the terraced slope.
    const hp = 120;
    for (let k = Math.floor(ctx.s0 / hp); k <= Math.floor((ctx.s0 + CHUNK_LENGTH - 1e-3) / hp); k++) {
      const s = k * hp + hp * 0.4 + h2(k, 1, seed) * 40;
      if (s < ctx.s0 || s >= ctx.s0 + CHUNK_LENGTH || h2(k, 2, seed) > 0.7) continue;
      const r = new Rng(Math.floor(h2(k, 3, seed) * 1e9));
      house(ctx, sf, s, -(half + 36 + r.range(0, 40)), -1, { rng: r, night: this.night, floors: r.int(2, 3), wall: mul(rgb('#6b4a32'), 2.4), roof: mul(rgb('#8a9096'), 1.2), lit: 0.6 });
    }
  }
}

/** Fallen trunk: tapered cylinder lying along x, bark-textured. */
function logGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.push(0, 0.3, 0, 0, 0, Math.PI / 2);
  b.frustum(0, -3.2, 0, 0.34, 0.28, 6.4, 8, { color: [3.2, 2.6, 2.0], uvPerM: 1 }, true);
  b.pop();
  return b.build();
}
