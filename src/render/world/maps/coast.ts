import * as THREE from 'three';
import { Rng, noise2, smoothstep } from '../../../core/math';
import { house, surfaces } from '../buildings';
import { GeoBuilder, mul, rgb } from '../kit';
import { buildRock } from '../rocks';
import { CHUNK_LENGTH, Scenery, type ChunkBuild, type SceneryHost } from '../scenery';
import { h2, patchy, scatter } from '../scatter';
import { createWaterMaterial, waterStrip } from '../water';

/** World height of the sea surface: road height swings ±10 m around 0, so the cliffs vary from beach to 20 m drops. */
export const SEA_LEVEL = -13;

const WATER_COLUMNS = [0, 4, 8, 12, 16, 20, 25, 30, 36, 42, 50, 60, 72, 86, 100, 120, 150, 200, 300, 450, 700, 1100, 1800, 2600];

/**
 * Antalya–Kaş coast road: the Mediterranean on the right (animated water, cliffs, rocks, boats, a
 * lighthouse), a rocky pine-covered hillside with white villas on the left.
 */
export class CoastScenery extends Scenery {
  private pine: string[];
  private redpine: string[];
  private palm: string[];
  private maki: string[];
  private tuft: string[];
  private olive: string[];
  private rocks: string[] = [];
  private boat = 'boat';
  private water: THREE.MeshStandardMaterial;
  private night: boolean;

  constructor(host: SceneryHost) {
    super(host);
    const dens = host.quality.sceneryDensity;
    const m = host.worldMats;
    this.night = host.env.scenery.lightsOn;
    this.pine = this.defineTree('stonepine', 26 * dens + 3, { ranges: { hi: 90, mid: 260 } });
    this.redpine = this.defineTree('redpine', 36 * dens + 4, { ranges: { hi: 90, mid: 260 } });
    this.palm = this.defineTree('palm', 6 * dens + 2);
    this.olive = this.defineTree('olive', 10 * dens + 2);
    this.maki = this.defineTree('maki', 70 * dens + 6, { maxDist: 520 });
    this.tuft = this.defineTree('tuft', 80 * dens + 8, { shadow: false, ranges: { hi: 60, mid: 150 }, maxDist: 220 });
    const cliff = m.pbr('cliff', { roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const key = `rock#${i}`;
      this.rocks.push(key);
      this.defineProp(key, buildRock({ seed: 31 + i * 5, radius: 1.8, detail: 3, flat: i < 2 ? 0.7 : 1.05, rough: 0.6, stretch: 1.2, base: '#cbc4b6', strata: 0.3, uvPerM: 1 / 1.8, angular: i % 2 === 0 }), cliff, { max: Math.ceil((26 * dens + 4) / 4) + 1, shadow: true });
    }
    this.defineProp(this.boat, boatGeometry(), m.plain({ roughness: 0.5, metalness: 0.1 }), { max: 8 });
    this.defineStatic('plaster', m.pbr('plaster', { roughness: 1 }), true);
    this.defineStatic('roof', m.pbr('roof_tiles', { roughness: 0.9, side: THREE.DoubleSide }), true);
    this.defineStatic('trim', m.plain({ roughness: 0.7 }), false);
    this.defineStatic('glass', m.glass(), false);
    this.defineStatic('lit', m.glowing(this.night ? 1.7 : 0.4), false);
    this.defineStatic('beach', m.pbr('beach', { roughness: 1 }), false);
    this.defineStatic('tower', m.plain({ roughness: 0.6 }), true);
    this.defineStatic('beam', m.glowing(this.night ? 2.4 : 0.9), false);
    this.water = m.adopt(
      createWaterMaterial(m.uniforms, {
        shallow: '#46d4cb',
        deep: '#0a5c86',
        waveAmp: 0.3 + 0.5 * host.env.world.wind,
        chop: 1.0,
        foam: 0.9,
        flow: 1.0,
        deepAt: 12,
      }),
    );
  }

  /** Cliffs and beaches on the sea (right) side, an excavated hillside on the land side. */
  override terrain(s: number, off: number, side: number, base: number): number {
    const roadH = this.host.road.height(s);
    if (side < 0) {
      // Land: cut slope next to the road, then rolling forested hills.
      const slope = (off - 1.2) * 0.8 + 6 * noise2(s * 0.02, off * 0.05, 4);
      const rise = Math.max(0, Math.min(off < 28 ? slope : 22 + (off - 28) * 0.5, 22 + (off - 28) * 0.5));
      const hills = (base - roadH) * smoothstep(40, 160, off);
      return roadH - 0.05 + rise * smoothstep(0.5, 3, off) * 0.9 + hills + noise2(s * 0.05, off * 0.08, 7) * 1.4 * smoothstep(3, 25, off);
    }
    return this.seaSide(s, off, roadH);
  }

  private seaSide(s: number, off: number, roadH: number): number {
    const hRel = Math.max(0.5, roadH - SEA_LEVEL);
    const edge = 5 + 9 * (noise2(s / 240, 3.1, 9) * 0.5 + 0.5);
    // 0 = sheer cliff, 1 = gently shelving beach.
    const beachness = smoothstep(0.35, 0.75, noise2(s / 420, 7.7, 13) * 0.5 + 0.5) * (hRel < 9 ? 1 : 0.6);
    const w = Math.max(6, hRel * (0.6 + 2.6 * beachness));
    const t = smoothstep(edge, edge + w, off);
    const shoulder = roadH - 0.25;
    const foot = SEA_LEVEL - 1.2 - Math.min(40, Math.max(0, off - edge - w) * 0.09);
    const rock = (noise2(s * 0.16, off * 0.2, 5) * 1.6 + noise2(s * 0.5, off * 0.6, 8) * 0.5) * (1 - beachness) * t * (1 - t) * 4;
    return shoulder + (foot - shoulder) * Math.pow(t, 0.8) + rock;
  }

  override groundColor(s: number, off: number, h: number, out: THREE.Color, side: number): boolean {
    if (off < 1) {
      out.setRGB(0.78, 0.76, 0.72);
      return true;
    }
    const abs = this.host.road.height(s) + h;
    const n = noise2(s / 60 + side * 4, off / 25, 21);
    if (side > 0) {
      // Sand and pale rock near the water, dry scrub on the clifftop.
      if (abs < SEA_LEVEL + 1.4) out.setRGB(0.86, 0.78, 0.55);
      else if (abs < SEA_LEVEL + 6) out.setRGB(0.7, 0.62, 0.45);
      else out.setRGB(0.5 + n * 0.1, 0.52, 0.28);
    } else {
      // Maquis: grey-green scrub with exposed pale limestone higher up.
      out.setRGB(0.44 + n * 0.1, 0.5, 0.26);
      if (h > 14) out.lerp(new THREE.Color(0.72, 0.68, 0.56), smoothstep(14, 40, h) * 0.7);
    }
    return true;
  }

  override build(ctx: ChunkBuild): void {
    const half = this.host.half;
    const rng = ctx.rng;
    const seed = this.host.seed;
    const road = this.host.road;
    const sf = surfaces(ctx);

    // ── The sea: animated water over every part of the sea side that lies below sea level.
    const geo = waterStrip(ctx, {
      side: 1,
      level: SEA_LEVEL,
      offNear: 0,
      offFar: 2600,
      columns: WATER_COLUMNS,
      ground: (s, d) => this.seaSide(s, Math.abs(d) - half, road.height(s)),
      step: 6,
    });
    if (geo) {
      const mesh = new THREE.Mesh(geo, this.water);
      mesh.renderOrder = 1;
      mesh.matrixAutoUpdate = false;
      ctx.chunk.group.add(mesh);
      ctx.chunk.extras.push(mesh);
    }

    // ── Land side vegetation: pines on the slope, scrub, tufts, white limestone boulders.
    const slopeMask = (s: number, d: number) => patchy(s, d, 110, 3, 0.3, 0.55);
    scatter(ctx, this.redpine, { count: 20, offMin: 4, offMax: 150, pow: 1.4, side: -1, scale: [0.75, 1.35], mask: slopeMask });
    scatter(ctx, this.pine, { count: 7, offMin: 5, offMax: 200, pow: 1.3, scale: [0.75, 1.3], mask: slopeMask });
    scatter(ctx, this.olive, { count: 4, offMin: 8, offMax: 120, side: -1, scale: [0.8, 1.3] });
    scatter(ctx, this.maki, { count: 56, offMin: 2, offMax: 120, pow: 1.4, scale: [0.6, 1.7], tint: [1.1, 1.08, 0.85], tintJitter: 0.25, reject: (s, d) => d > 0 && this.seaSide(s, d - half, road.height(s)) < SEA_LEVEL + 0.5 });
    scatter(ctx, this.tuft, { count: 90, offMin: 1.5, offMax: 30, pow: 1.4, scale: [0.7, 1.5], tint: [2.2, 1.75, 0.8], tintJitter: 0.3, reject: (s, d) => d > 0 && this.seaSide(s, d - half, road.height(s)) < SEA_LEVEL + 0.5 });
    // Palms and a few pines on the sea side where there is flat ground (low road = beach).
    scatter(ctx, this.palm, { count: 3, offMin: 6, offMax: 22, side: 1, scale: [0.8, 1.3], reject: (s, d) => this.seaSide(s, d - half, road.height(s)) < SEA_LEVEL + 1.5 });
    scatter(ctx, this.pine, { count: 4, offMin: 6, offMax: 26, side: 1, scale: [0.7, 1.1], reject: (s, d) => this.seaSide(s, d - half, road.height(s)) < SEA_LEVEL + 3 });
    // Boulders: pale rock along the shoreline and road cuts.
    scatter(ctx, this.rocks, { count: 18, offMin: 3, offMax: 30, side: 1, scale: [0.6, 2.4], sink: 0.5, tilt: 0.25, reject: (s, d) => this.seaSide(s, d - half, road.height(s)) < SEA_LEVEL - 0.5 });
    scatter(ctx, this.rocks, { count: 12, offMin: 3, offMax: 70, pow: 1.5, side: -1, scale: [0.6, 3.0], sink: 0.5, tilt: 0.25 });
    // Fishing boats and yachts on the sea.
    for (let i = 0; i < 3; i++) {
      if (rng.float() > 0.55 * (ctx.density + 0.4)) continue;
      const off = 60 + rng.float() * 420;
      ctx.put(this.boat, ctx.s0 + rng.float() * CHUNK_LENGTH, half + off, { y: SEA_LEVEL + 0.05, yaw: rng.range(0, 6.28), scale: rng.range(0.8, 2.4) }, false);
    }

    // ── White villas stepping up the hillside (land side), a lighthouse on a headland.
    const vp = 90;
    for (let k = Math.floor(ctx.s0 / vp); k <= Math.floor((ctx.s0 + CHUNK_LENGTH - 1e-3) / vp); k++) {
      const s = k * vp + vp / 2 + (h2(k, 1, seed) - 0.5) * 30;
      if (s < ctx.s0 || s >= ctx.s0 + CHUNK_LENGTH || h2(k, 2, seed) > 0.55) continue;
      const r = new Rng(Math.floor(h2(k, 3, seed) * 1e9));
      house(ctx, sf, s, -(half + 36 + r.range(0, 30)), -1, { rng: r, night: this.night, wall: mul(rgb('#f4f1ea'), 1.5), roof: rgb('#c0603c'), floors: r.int(1, 2) });
    }
    const lk = Math.floor((ctx.s0 + CHUNK_LENGTH * 0.5) / 2600);
    const ls = lk * 2600 + 900 + h2(lk, 5, seed) * 900;
    if (ls >= ctx.s0 && ls < ctx.s0 + CHUNK_LENGTH) this.lighthouse(ctx, ls, half + 70);
  }

  /** Lighthouse: tapering white tower with red bands, gallery, lantern room and a rock plinth. */
  private lighthouse(ctx: ChunkBuild, s: number, off: number): void {
    const half = this.host.half;
    const d = half + off;
    const tower = ctx.stat('tower');
    const beam = ctx.stat('beam');
    const p = ctx.local(s, d, 0);
    const gy = Math.max(ctx.localY(SEA_LEVEL + 3.2), ctx.localY(this.seaSide(s, off, this.host.road.height(s))) + 2.5);
    tower.push(p.x, gy, p.z, 0);
    beam.push(p.x, gy, p.z, 0);
    const white = mul(rgb('#f2f0ea'), 1.4);
    const red = rgb('#b3262a');
    const H = 24;
    tower.frustum(0, -9, 0, 6.4, 4.2, 10, 12, { color: rgb('#6b6a64') }, true);
    for (let i = 0; i < 6; i++) {
      const r0 = 3.2 - (i / 6) * 1.2;
      const r1 = 3.2 - ((i + 1) / 6) * 1.2;
      tower.frustum(0, 1 + i * (H / 6), 0, r0, r1, H / 6, 14, { color: i % 2 === 0 ? white : red }, false);
    }
    tower.frustum(0, 1 + H, 0, 3.3, 3.3, 0.35, 14, { color: rgb('#3a3d42') }, true);
    tower.frustum(0, 1.35 + H, 0, 1.75, 1.75, 2.4, 12, { color: rgb('#bfc7cc') }, true);
    tower.frustum(0, 3.75 + H, 0, 1.9, 0.2, 1.4, 12, { color: rgb('#8a2a26') }, true);
    beam.frustum(0, 1.6 + H, 0, 1.2, 1.2, 1.6, 10, { color: rgb('#ffe9b0') }, false);
    if (this.night) ctx.glow(s, d, gy + ctx.origin.y + 2.6 + H - this.host.road.height(s), 2.2, 2.0, 1.4, 6.0);
    tower.pop();
    beam.pop();
  }
}

/** Small fishing/leisure boat: white hull with a cabin, ~6 m. */
function boatGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const hull = mul(rgb('#f1efe8'), 1.4);
  b.box(0, 0.35, 0, 1.9, 0.7, 5.2, { color: hull });
  b.box(0, 0.25, -2.8, 1.2, 0.5, 1.0, { color: hull });
  b.box(0, 1.05, 0.6, 1.4, 0.8, 2.0, { color: rgb('#d8d5cc') });
  b.box(0, 1.15, 0.6, 1.5, 0.35, 2.05, { color: rgb('#27323d') });
  b.box(0, 0.62, 0, 1.94, 0.1, 5.24, { color: rgb('#2a5d8a') });
  return b.build();
}

