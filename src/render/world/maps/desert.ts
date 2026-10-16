import * as THREE from 'three';
import { Rng, noise2, smoothstep } from '../../../core/math';
import type { RangeSpec } from '../backdrop';
import { inFrame, surfaces, window as windowFn, type Surfaces } from '../buildings';
import { gantry, kmPost } from '../furniture';
import { GeoBuilder, mul, rgb } from '../kit';
import { MESA_BANDS, MESA_CAP, buildMesa } from '../mesa';
import { utilityPoleGeometry } from '../props';
import { buildRock } from '../rocks';
import { CHUNK_LENGTH, Scenery, type ChunkBuild, type SceneryHost } from '../scenery';
import { NEAR_BAND, h2, line, patchy, scatter } from '../scatter';
import { REGION_CITIES, type SignDest } from '../signs';
import { rotorMaterial, turbineRotorGeometry, turbineTowerGeometry } from '../turbines';

const POLE_EVERY = 48;
const POLE_OFF = 7.5;
const ARM_Y = [8.7, 7.8];
/** Insulator offsets (metres from the pole axis) of the wires on each cross-arm (see utilityPoleGeometry). */
const WIRES: [number, number][] = [[-1, 0], [-0.5, 0], [0.5, 0], [1, 0], [-0.9, 1], [0.9, 1]];

/**
 * Konya steppe: golden dry grass over long dunes, banded sandstone buttes on the horizon, sparse
 * thorn scrub, a wooden telegraph line with sagging wires, wind farms on the ridges, flat-roofed
 * farmsteads with haystacks and poplar windbreaks. The heat shimmer comes from the map's `heat`
 * value (GameView drives the post-effect), so there is nothing to render here for it.
 */
export class DesertScenery extends Scenery {
  private shrub: string[];
  private tuft: string[];
  private tall: string[];
  private poplar: string[];
  private rocks: string[] = [];
  private mesas: string[] = [];
  private poleKey = 'telegraph';
  private stackKey = 'haystack';
  private towerKey = 'turbine';
  private rotorKey = 'rotor';
  private night: boolean;

  constructor(host: SceneryHost) {
    super(host);
    const dens = host.quality.sceneryDensity;
    const m = host.worldMats;
    this.night = host.env.scenery.lightsOn;
    this.shrub = this.defineTree('maki', 60 * dens + 5, { maxDist: 520 });
    this.tuft = this.defineTree('tuft', 150 * dens + 10, { shadow: false, ranges: { hi: 60, mid: 150 }, maxDist: 240 });
    this.tall = this.defineTree('grass', 40 * dens + 4, { shadow: false, ranges: { hi: 60, mid: 150 }, maxDist: 240 });
    this.poplar = this.defineTree('poplar', 10 * dens + 2, { variants: 1 });
    const cliff = m.pbr('cliff', { roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const key = `rock#${i}`;
      this.rocks.push(key);
      this.defineProp(key, buildRock({ seed: 91 + i * 4, radius: 1.7, detail: 3, flat: i < 2 ? 0.62 : 0.95, rough: 0.65, stretch: 1.25, base: '#c1a283', strata: 0.35, uvPerM: 1 / 1.8, angular: i % 2 === 1 }), cliff, { max: Math.ceil((20 * dens + 4) / 4) + 1, shadow: true });
    }
    // Buttes: three silhouettes, scaled per instance (unit foot radius, so uv repeats are set for ~40 m).
    for (let i = 0; i < 3; i++) {
      const key = `mesa#${i}`;
      this.mesas.push(key);
      this.defineProp(key, buildMesa({ seed: 7 + i * 13, tall: 0.5 + i * 0.1, bands: MESA_BANDS.map((c) => mul(c, 1.7)), cap: mul(MESA_CAP, 1.6), uvPerM: 6 }), cliff, { max: 4, shadow: false });
    }
    const wood = m.plain({ roughness: 0.85 });
    this.defineProp(this.poleKey, utilityPoleGeometry(true, 2), wood, { max: Math.ceil(CHUNK_LENGTH / POLE_EVERY) + 2, shadow: true });
    this.defineProp(this.stackKey, haystackGeometry(), m.plain({ roughness: 1 }), { max: 8, shadow: true });
    this.defineProp(this.towerKey, turbineTowerGeometry(), m.plain({ roughness: 0.5 }), { max: 8 });
    this.defineProp(this.rotorKey, turbineRotorGeometry(), m.adopt(rotorMaterial(m.uniforms)), { max: 8 });
    this.defineStatic('wire', m.plain({ roughness: 0.6, metalness: 0.4 }), false);
    this.defineStatic('steel', m.plain({ roughness: 0.55, metalness: 0.5 }), true);
    this.defineStatic('plaster', m.pbr('plaster', { roughness: 1 }), true);
    this.defineStatic('roof', m.pbr('dry_ground', { roughness: 1, side: THREE.DoubleSide }), true);
    this.defineStatic('trim', m.plain({ roughness: 0.8 }), false);
    this.defineStatic('glass', m.glass(), false);
    this.defineStatic('lit', m.glowing(this.night ? 1.7 : 0.4), false);
  }

  /** Long dunes: ridged noise stretched along the road, growing with distance, over the generic far hills. */
  override terrain(s: number, off: number, side: number, base: number): number {
    const seed = this.host.seed;
    const ridge = (n: number) => 1 - Math.abs(n);
    const crest = ridge(noise2(s * 0.011 + side * 19, off * 0.03, seed + 5));
    const swell = noise2(s * 0.004 + side * 3, off * 0.011, seed + 9) * 0.5 + 0.5;
    const dune = (3.2 + 6.5 * swell) * crest * crest * smoothstep(9, 70, off);
    const ripple = noise2(s * 0.07, off * 0.1, seed + 2) * 0.5 * smoothstep(6, 30, off);
    return base + dune + ripple;
  }

  override groundColor(s: number, off: number, h: number, out: THREE.Color, side: number): boolean {
    if (off < 1) {
      out.setRGB(0.78, 0.74, 0.68);
      return true;
    }
    const n = noise2(s / 70 + side * 6, off / 30, 31) * 0.5 + 0.5;
    const m = noise2(s / 22 + 3, off / 13 + side, 17) * 0.5 + 0.5;
    // Straw-gold steppe, paler clay where it is dry, rust on the dune crests, a darker verge by the road.
    out.setRGB(0.95, 0.72, 0.4);
    out.lerp(_c.setRGB(0.98, 0.88, 0.66), smoothstep(0.55, 0.85, n) * 0.85);
    out.lerp(_c.setRGB(0.86, 0.47, 0.24), smoothstep(2, 9, h) * 0.6);
    out.lerp(_c.setRGB(0.66, 0.55, 0.34), smoothstep(0.42, 0.12, n) * 0.5);
    if (off < 5) out.lerp(_c.setRGB(0.78, 0.68, 0.52), 0.55 * (1 - smoothstep(1, 5, off)));
    out.multiplyScalar(0.88 + m * 0.24);
    return true;
  }

  override ranges(): RangeSpec[] {
    return [
      { radius: 3200, height: 520, low: '#a98763', mid: '#c4a27a', peak: '#d9c2a2', snowLine: 9, sharp: 0.32, amp: 0.55, seed: 21, haze: 0.55 },
      { radius: 2600, height: 330, low: '#9d6e4c', mid: '#b98760', peak: '#d1a47c', snowLine: 9, sharp: 0.55, amp: 0.5, seed: 33, haze: 0.34 },
    ];
  }

  override build(ctx: ChunkBuild): void {
    const half = this.host.half;
    const seed = this.host.seed;
    const sf = surfaces(ctx, 'plaster');

    // ── Telegraph line on the right with sagging wires to the next pole.
    line(ctx, this.poleKey, { every: POLE_EVERY, off: POLE_OFF, side: 1, facing: 'along' });
    this.wires(ctx);

    // ── Steppe cover: straw tufts and tall clumps, thorn scrub, boulders.
    const scrubMask = (s: number, d: number) => 0.25 + 0.75 * patchy(s, d, 80, 3, 0.3, 0.6);
    scatter(ctx, this.tuft, { count: 190, offMin: 1.2, offMax: 60, pow: 1.3, scale: [0.7, 1.5], tint: [2.8, 1.8, 0.55], tintJitter: 0.3, spin: true, mask: scrubMask });
    scatter(ctx, this.tall, { count: 60, offMin: 2.5, offMax: 50, pow: 1.3, scale: [0.9, 2.0], tint: [2.7, 1.75, 0.55], tintJitter: 0.25, mask: scrubMask });
    scatter(ctx, this.shrub, { count: 34, offMin: 2.5, offMax: 140, pow: 1.5, scale: [0.6, 1.5], tint: [1.35, 1.08, 0.78], tintJitter: 0.25, mask: scrubMask });
    scatter(ctx, this.rocks, { count: 12, offMin: 4, offMax: 150, pow: 1.5, scale: [0.5, 2.6], sink: 0.4, tilt: 0.18 });

    // ── Buttes on the horizon: at most one per 380 m cell per side, far from the road.
    const cell = 380;
    for (let k = Math.floor(ctx.s0 / cell) - 1; k <= Math.floor((ctx.s0 + CHUNK_LENGTH) / cell); k++) {
      for (const side of [1, -1] as const) {
        if (h2(k, side * 3, seed) > 0.42) continue;
        const s = k * cell + h2(k, side, seed + 4) * cell;
        if (s < ctx.s0 || s >= ctx.s0 + CHUNK_LENGTH) continue;
        const off = 110 + h2(k, side, seed + 5) * 330;
        const r = 22 + h2(k, side, seed + 6) * 55;
        ctx.put(this.mesas[Math.floor(h2(k, side, seed + 8) * this.mesas.length)], s, side * (half + off), { yaw: h2(k, side, seed + 7) * 6.28, scale: r, sink: 1.5 }, false);
      }
    }

    // ── Wind farms: a string of turbines along the ridge every ~2.2 km.
    const farm = 2200;
    for (let k = Math.floor((ctx.s0 - 1300) / farm); k <= Math.floor((ctx.s0 + CHUNK_LENGTH) / farm); k++) {
      if (h2(k, 21, seed) > 0.6) continue;
      const side = h2(k, 22, seed) > 0.5 ? 1 : -1;
      const off = 170 + h2(k, 23, seed) * 140;
      const n = 4 + Math.floor(h2(k, 24, seed) * 4);
      const yaw = 0.35 + h2(k, 25, seed) * 0.9;
      for (let i = 0; i < n; i++) {
        const s = k * farm + 300 + i * 190 + (h2(k, 30 + i, seed) - 0.5) * 40;
        if (s < ctx.s0 || s >= ctx.s0 + CHUNK_LENGTH) continue;
        const d = side * (half + off + (h2(k, 40 + i, seed) - 0.5) * 50);
        ctx.put(this.towerKey, s, d, { yaw, sink: 0.3 }, false);
        ctx.put(this.rotorKey, s, d, { yaw, sink: 0.3 }, false);
      }
    }

    // ── Farmsteads: flat-roofed huts with a haystack and a poplar windbreak.
    const fp = 520;
    for (let k = Math.floor(ctx.s0 / fp); k <= Math.floor((ctx.s0 + CHUNK_LENGTH - 1e-3) / fp); k++) {
      const s = k * fp + 60 + h2(k, 1, seed) * (fp - 160);
      if (s < ctx.s0 || s >= ctx.s0 + CHUNK_LENGTH || h2(k, 2, seed) > 0.55) continue;
      const side = h2(k, 3, seed) > 0.5 ? 1 : -1;
      const off = 28 + h2(k, 4, seed) * 50;
      const r = new Rng(Math.floor(h2(k, 5, seed) * 1e9));
      this.farmstead(ctx, sf, s, side, off, r);
    }

    // ── Kilometre posts and a guide-sign gantry every ~2 km.
    const k0 = Math.ceil(ctx.s0 / 1000);
    if (k0 * 1000 < ctx.s0 + CHUNK_LENGTH) kmPost(ctx, k0 * 1000, 1);
    const gk = Math.floor((ctx.s0 + CHUNK_LENGTH * 0.5) / 2100);
    const gs = gk * 2100 + 500 + h2(gk, 1, seed) * 400;
    if (gs >= ctx.s0 && gs < ctx.s0 + CHUNK_LENGTH) {
      const cities = REGION_CITIES.desert;
      const pick = (j: number): SignDest => {
        const c = cities[Math.floor(h2(gk, j, 11) * cities.length)];
        return { name: c[0], km: Math.max(3, Math.round(c[1] - gs / 1000 + 20 + h2(gk, j, 13) * 50)) };
      };
      gantry(ctx, gs, [[{ ...pick(1), arrow: '↑' }, pick(2)], [{ ...pick(3), arrow: '↗' }, pick(4)]], 'D-300', { lit: this.night });
    }
  }

  /** Four-to-six sagging wires from every telegraph pole in this chunk to the next one. */
  private wires(ctx: ChunkBuild): void {
    const half = this.host.half;
    const b = ctx.stat('wire');
    const d0 = half + POLE_OFF;
    const first = Math.ceil(ctx.s0 / POLE_EVERY);
    const copper = rgb('#262626');
    const a = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let k = first; k * POLE_EVERY < ctx.s0 + CHUNK_LENGTH; k++) {
      const sA = k * POLE_EVERY;
      const sB = sA + POLE_EVERY;
      const gA = ctx.localY(ctx.groundY(sA, d0));
      const gB = ctx.localY(ctx.groundY(sB, d0));
      for (const [x, arm] of WIRES) {
        const yA = gA + ARM_Y[arm] + 0.08;
        const yB = gB + ARM_Y[arm] + 0.08;
        const segs = 5;
        let prev: [number, number, number] | null = null;
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          ctx.local(sA + (sB - sA) * t, d0 + x, 0, a);
          c.copy(a);
          const y = yA + (yB - yA) * t - 1.1 * 4 * t * (1 - t);
          const p: [number, number, number] = [c.x, y, c.z];
          if (prev) b.limb(prev, p, 0.014, 0.014, 3, { color: copper });
          prev = p;
        }
      }
    }
  }

  /** Mud-brick farm hut with a flat roof, a haystack and a row of poplars behind it. */
  private farmstead(ctx: ChunkBuild, sf: Surfaces, s: number, side: 1 | -1, off: number, rng: Rng): void {
    const half = this.host.half;
    const d = side * (half + off);
    const W = rng.range(7, 10);
    const D = rng.range(5.5, 7);
    const H = 2.9;
    const wall = mul(rgb(rng.pick(['#d9b98f', '#cba67a', '#e0c9a4'])), 1.25);
    inFrame(ctx, sf, s, d, ctx.faceRoad(side), () => {
      sf.wall.box(0, (H - 1.4) / 2, 0, W, H + 1.4, D, { color: wall, uvPerM: 1 / 3 }, 4 | 8);
      // Flat earth roof with a parapet lip, a stove pipe and a wooden lintel over the door.
      sf.roof.box(0, H + 0.1, 0, W + 0.5, 0.22, D + 0.5, { color: rgb('#a58a68'), uvPerM: 1 / 3 });
      sf.trim.box(0, H + 0.33, 0, W + 0.5, 0.2, 0.18, { color: mul(wall, 0.9) });
      sf.trim.frustum(W * 0.25, H + 0.2, 0, 0.12, 0.12, 1.1, 8, { color: rgb('#3b3a38') }, true);
      sf.trim.box(0, 1.1, -D / 2 - 0.03, 1.0, 2.2, 0.1, { color: rgb('#5a3f2c') });
      sf.trim.box(0, 2.28, -D / 2 - 0.08, 1.5, 0.14, 0.2, { color: rgb('#4a3322') });
      windowFn(sf, -W * 0.27, 1.65, -D / 2, 0.9, 0.9, rng.chance(this.night ? 0.6 : 0));
      windowFn(sf, W * 0.28, 1.65, -D / 2, 0.9, 0.9, rng.chance(this.night ? 0.6 : 0));
    });
    // Haystacks beside it, a stack of poplars behind.
    const k = rng.int(1, 3);
    for (let i = 0; i < k; i++) ctx.put(this.stackKey, s + rng.range(-12, 12), d + side * rng.range(-6, 14), { yaw: rng.range(0, 6.28), scale: rng.range(0.8, 1.3) }, true);
    const n = rng.int(4, 8);
    for (let i = 0; i < n; i++) ctx.put(this.poplar[0], s - 16 + i * 4.5, d + side * (D / 2 + 6 + rng.range(0, 2.5)), { yaw: rng.range(0, 6.28), scale: rng.range(0.75, 1.15) }, off < NEAR_BAND);
  }
}

/** Round hay stack: a straw dome on a pallet of loose bales. */
function haystackGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const straw = rgb('#c9a64f');
  b.frustum(0, 0, 0, 2.3, 2.1, 1.6, 10, { color: mul(straw, 0.9) }, true);
  b.frustum(0, 1.6, 0, 2.1, 1.1, 1.3, 10, { color: straw }, false);
  b.frustum(0, 2.9, 0, 1.1, 0.0, 0.9, 10, { color: mul(straw, 1.1) }, false);
  return b.build();
}

const _c = new THREE.Color();
