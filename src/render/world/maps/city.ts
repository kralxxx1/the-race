import * as THREE from 'three';
import { Rng, noise2, smoothstep } from '../../../core/math';
import type { RangeSpec } from '../backdrop';
import { OVERPASS_CLEARANCE, bridgeGirder, bridgePier, cablePylon, footbridge, overpass } from '../bridges';
import { BLOCK, ROWS, groundKind, inStreet, planBlock } from '../cityPlan';
import { FACADES, FACADE_KEY, facadeMaterial, tower, type FacadeStyle, CONCRETE_TINTS, GLASS_TINTS } from '../facade';
import { gantry } from '../furniture';
import { GeoBuilder, mul, rgb } from '../kit';
import { LampKit } from '../lighting';
import { CHUNK_LENGTH, Scenery, type ChunkBuild, type SceneryHost } from '../scenery';
import { BILLBOARDS, NEONS, buildSignAtlas, neonGeometry, plateGeometry, signMaterials } from '../signage';
import { REGION_CITIES, type SignDest } from '../signs';
import { h2, scatter } from '../scatter';
import { ribbon, wall } from '../strips';
import { createWaterMaterial, waterStrip } from '../water';

/** Long bridges: where the first one starts, how often they repeat, and their water-crossing length. */
export const BRIDGE_FIRST = 2300;
export const BRIDGE_PERIOD = 5200;
export const BRIDGE_CORE = 640;
const BRIDGE_EDGE = 120;
const WATER_COLUMNS = [0, 3, 7, 12, 18, 26, 36, 50, 70, 100, 150, 220, 330, 500, 800, 1300, 2000, 3000];

export interface BridgeSpan {
  a: number;
  b: number;
  level: number;
}

/**
 * İstanbul E-5: a canyon of mid-rise blocks with shop podiums and neon, glass towers behind, lamps
 * and plane trees on the sidewalks, overpasses at the cross streets, a billboard on a roof now and then,
 * and a long cable-stayed bridge over the strait every few kilometres.
 */
export class CityScenery extends Scenery {
  private plane: string[];
  private palm: string[];
  private shrub: string[];
  private lamps: LampKit;
  private night: boolean;
  private spans = new Map<number, BridgeSpan>();
  private water: THREE.MeshStandardMaterial;
  private atlas: THREE.Texture;
  private plateKeys: string[] = [];
  private neonKeys: string[] = [];
  private bladeKeys: string[] = [];
  private boatKey = 'ferry';

  constructor(host: SceneryHost) {
    super(host);
    const dens = host.quality.sceneryDensity;
    const m = host.worldMats;
    this.night = host.env.scenery.lightsOn;
    this.plane = this.defineTree('plane', 30 * dens + 6, { ranges: { hi: 90, mid: 260 }, variants: 1 });
    this.palm = this.defineTree('palm', 6 * dens + 2);
    this.shrub = this.defineTree('shrub', 30 * dens + 4, { maxDist: 300 });
    this.lamps = this.defineLamps({ style: 'sodium', max: 12, glow: [1.95, 1.15, 0.4, 2.8], pool: '#ffae55' });
    for (const style of Object.keys(FACADES) as FacadeStyle[]) this.defineStatic(FACADE_KEY[style], facadeMaterial(m, style), true);
    this.defineStatic('rooftop', m.plain({ roughness: 0.9 }), true);
    this.defineStatic('conc', m.pbr('concrete', { roughness: 1 }), true);
    this.defineStatic('asphalt', m.pbr('asphalt_worn', { roughness: 1 }), true);
    this.defineStatic('pave', m.pbr('pavement', { roughness: 1 }), false);
    this.defineStatic('steel', m.plain({ roughness: 0.5, metalness: 0.6 }), true);
    this.defineStatic('glass', m.glass(), false);
    this.defineStatic('lit', m.glowing(this.night ? 1.9 : 0.5), false);
    this.defineStatic('cable', m.plain({ roughness: 0.6, metalness: 0.2, emissive: this.night ? '#6a86a8' : '#000000', emissiveIntensity: this.night ? 0.9 : 0 }), false);
    this.atlas = m.adoptTexture(buildSignAtlas());
    const sm = signMaterials(this.atlas, this.night);
    m.adopt(sm.billboard);
    m.adopt(sm.neon);
    for (let i = 0; i < BILLBOARDS.length; i++) {
      const key = `plate#${i}`;
      this.plateKeys.push(key);
      this.defineProp(key, plateGeometry(i, 14, 7, 1.6), sm.billboard, { max: 4, shadow: false });
    }
    for (let i = 0; i < NEONS.length; i++) {
      const cell = BILLBOARDS.length + i;
      this.neonKeys.push(`neon#${i}`);
      this.bladeKeys.push(`blade#${i}`);
      this.defineProp(`neon#${i}`, neonGeometry(cell, false), sm.neon, { max: 8, renderOrder: 3 });
      this.defineProp(`blade#${i}`, neonGeometry(cell, true), sm.neon, { max: 8, renderOrder: 3 });
    }
    this.defineProp(this.boatKey, ferryGeometry(), m.plain({ roughness: 0.5, metalness: 0.1 }), { max: 6 });
    this.water = m.adopt(createWaterMaterial(m.uniforms, { shallow: '#2a6277', deep: '#04182b', waveAmp: 0.22 + 0.4 * host.env.world.wind, chop: 0.9, foam: 0.6, flow: 0.8, deepAt: 14 }));
    void rgb;
  }

  // ── Long bridges ────────────────────────────────────────────────────────────────

  /** The bridge whose terrain influence covers road distance s, or null. */
  bridgeNear(s: number, margin = BRIDGE_EDGE): BridgeSpan | null {
    const k = Math.round((s - BRIDGE_FIRST - BRIDGE_CORE / 2) / BRIDGE_PERIOD);
    for (const kk of [k, k + 1]) {
      if (kk < 0) continue;
      const a = BRIDGE_FIRST + kk * BRIDGE_PERIOD;
      const b = a + BRIDGE_CORE;
      if (s >= a - margin && s <= b + margin) {
        let sp = this.spans.get(kk);
        if (!sp) {
          let low = 1e9;
          for (let x = a; x <= b; x += 20) low = Math.min(low, this.host.road.height(x));
          sp = { a, b, level: low - 13 };
          this.spans.set(kk, sp);
        }
        return sp;
      }
    }
    return null;
  }

  /** 0 on land, 1 over open water. */
  private waterMask(s: number): number {
    const sp = this.bridgeNear(s);
    if (!sp) return 0;
    return smoothstep(sp.a - BRIDGE_EDGE, sp.a, s) * (1 - smoothstep(sp.b, sp.b + BRIDGE_EDGE, s));
  }

  override terrain(s: number, off: number, _side: number, base: number): number {
    const m = this.waterMask(s);
    if (m <= 0) return base;
    const sp = this.bridgeNear(s)!;
    const floor = sp.level - 7 + noise2(s * 0.03, off * 0.05, 3) * 1.2;
    return base + (floor - base) * smoothstep(0.55, 2.0, off) * m;
  }

  override groundColor(s: number, off: number, _h: number, out: THREE.Color, side: number): boolean {
    if (this.waterMask(s) > 0.02) {
      out.setRGB(0.1, 0.12, 0.13);
      return true;
    }
    const kind = groundKind(this.host.seed, side < 0 ? -1 : 1, s, off);
    const n = noise2(s / 40 + side * 3, off / 25, 9) * 0.5 + 0.5;
    switch (kind) {
      case 'verge':
        out.setRGB(0.74, 0.73, 0.71);
        break;
      case 'street':
        out.setRGB(0.2, 0.2, 0.22);
        break;
      case 'park':
        out.setRGB(0.24 + n * 0.05, 0.44 + n * 0.06, 0.18);
        break;
      default:
        out.setRGB(0.46 + n * 0.1, 0.46 + n * 0.1, 0.48 + n * 0.08);
    }
    return true;
  }

  override ranges(): RangeSpec[] {
    return [
      { radius: 3300, height: 300, low: '#3d4a5a', mid: '#566677', peak: '#74869a', snowLine: 9, sharp: 0.2, amp: 0.45, seed: 61, haze: 0.62 },
      { radius: 2400, height: 520, low: '#1d2733', mid: '#2a3745', peak: '#3a4a5c', snowLine: 9, sharp: 0, amp: 0.8, seed: 5, haze: 0.5, skyline: { lit: this.night, seed: this.host.seed + 7 } },
    ];
  }

  // ── Chunk ───────────────────────────────────────────────────────────────────────

  override build(ctx: ChunkBuild): void {
    const half = this.host.half;
    const seed = this.host.seed;
    const road = this.host.road;
    const s0 = ctx.s0;
    const s1 = s0 + CHUNK_LENGTH;
    const onBridge = this.waterMask(s0) > 0.02 || this.waterMask(s1) > 0.02 || this.waterMask((s0 + s1) / 2) > 0.02;
    const span = this.bridgeNear((s0 + s1) / 2, BRIDGE_EDGE + CHUNK_LENGTH) ?? this.bridgeNear(s0, BRIDGE_EDGE + CHUNK_LENGTH) ?? this.bridgeNear(s1, BRIDGE_EDGE + CHUNK_LENGTH);

    // ── Sidewalks, kerbs, tree planters.
    const pave = ctx.stat('pave');
    if (!onBridge) {
      for (const side of [1, -1] as const) {
        ribbon(pave, ctx, side * (half + 1.4), side * (half + 8.5), { ground: 0.14 }, { color: [0.95, 0.95, 0.93], uvPerM: this.host.worldMats.uv('pavement') });
        wall(pave, ctx, side * (half + 8.5), 0, 0.14, side as 1 | -1, 'ground', { color: [0.7, 0.7, 0.7], uvPerM: 0.5 });
      }
    }

    // ── Lamps: sodium heads every 36 m, staggered between the sides.
    const pitch = 36;
    for (let k = Math.ceil(s0 / pitch); k * pitch < s1; k++) {
      const s = k * pitch;
      if (inStreet(s) && h2(k, 3, seed) > 0.5) continue;
      const side: 1 | -1 = k % 2 === 0 ? 1 : -1;
      if (this.waterMask(s) > 0.5) this.lamps.place(ctx, s, side, 0.9, road.height(s) - 0.05);
      else if (!onBridge || this.waterMask(s) < 0.02) this.lamps.place(ctx, s, side, 1.4);
    }

    // ── Street trees along the sidewalks.
    if (!onBridge) {
      const tp = 22;
      for (let k = Math.ceil(s0 / tp); k * tp < s1; k++) {
        const s = k * tp + (h2(k, 5, seed) - 0.5) * 4;
        if (inStreet(s)) continue;
        for (const side of [1, -1] as const) {
          if (h2(k, side + 7, seed) > 0.7) continue;
          const palm = h2(k, side + 9, seed) < 0.18;
          ctx.put(palm ? this.palm[0] : this.plane[0], s, side * (half + 5.2), { yaw: h2(k, 11 + side, seed) * 6.28, scale: palm ? 0.75 + h2(k, 13, seed) * 0.3 : 0.55 + h2(k, 12, seed) * 0.25, y: ctx.groundY(s, side * (half + 5.2)) - 0.0 }, true);
        }
      }
      scatter(ctx, this.shrub, { count: 22, offMin: 3.2, offMax: 8, scale: [0.5, 0.9], tint: [0.8, 1.0, 0.7], tintJitter: 0.2 });
    }

    // ── Buildings.
    const firstBlock = Math.floor(s0 / BLOCK) - 1;
    const lastBlock = Math.floor(s1 / BLOCK) + 1;
    for (let blk = firstBlock; blk <= lastBlock; blk++) {
      for (const side of [1, -1] as const) {
        for (let row = 0; row < ROWS.length; row++) {
          for (const p of planBlock(seed, side, row, blk)) {
            if (p.s < s0 || p.s >= s1) continue;
            if (this.waterMask(p.s - p.w / 2) > 0.01 || this.waterMask(p.s + p.w / 2) > 0.01) continue;
            this.building(ctx, p, side, row);
          }
        }
      }
    }

    // ── Overpasses over the cross streets.
    for (let b = Math.floor(s0 / BLOCK); b <= Math.ceil(s1 / BLOCK); b++) {
      const s = b * BLOCK;
      if (s < s0 || s >= s1 || b <= 1 || h2(b, 77, seed) > 0.55 || this.waterMask(s) > 0.001 || (this.bridgeNear(s, 260) !== null)) continue;
      if (h2(b, 78, seed) > 0.45) overpass(ctx, s, { lit: this.night, ramp: 56 });
      else footbridge(ctx, s, { lit: this.night });
    }

    // ── Guide-sign gantry every ~1.7 km (kept clear of the overpasses).
    const gk = Math.floor((s0 + CHUNK_LENGTH * 0.5) / 1700);
    const gs = gk * 1700 + 420 + h2(gk, 1, seed) * 300;
    if (gs >= s0 && gs < s1 && !inStreet(gs) && this.waterMask(gs) < 0.01 && !this.bridgeNear(gs, 100)) {
      const cities = REGION_CITIES.city;
      const pick = (j: number): SignDest => {
        const c = cities[Math.floor(h2(gk, j, 11) * cities.length)];
        return { name: c[0], km: Math.max(2, Math.round(c[1] * 0.2 + 3 + h2(gk, j, 13) * 12)) };
      };
      gantry(ctx, gs, [[{ ...pick(1), arrow: '↑' }, pick(2)], [{ ...pick(3), arrow: '↗' }, pick(4)]], 'E-5', { lit: this.night });
    }

    // ── The bridge itself.
    if (span) this.bridge(ctx, span);
  }

  /** One building of the plan (tower, shop podium, neon, rooftop billboard, beacon). */
  private building(ctx: ChunkBuild, p: ReturnType<typeof planBlock>[number], side: 1 | -1, row: number): void {
    const half = this.host.half;
    const rng = new Rng(Math.floor(h2(Math.floor(p.s * 10), side * 31 + row, this.host.seed) * 4294967296));
    const d = side * (half + p.off);
    const tint = p.style === 'glass' ? GLASS_TINTS[p.tint % GLASS_TINTS.length] : CONCRETE_TINTS[p.tint % CONCRETE_TINTS.length];
    const r = tower(ctx, p.s, d, side, { rng, floors: p.floors, w: p.w, d: p.d, style: p.style, tint, round: p.round, setback: p.setback, spire: p.spire, podium: p.podium });
    const gy = ctx.groundY(p.s, d);
    const frontOff = p.off - p.d / 2 - (p.podium ? 2.5 : 0);
    // Neon on the shop fronts: a horizontal plate and a blade sign.
    if (p.podium && row <= 1) {
      const n = Math.floor(rng.float() * NEONS.length);
      const dFront = side * (half + frontOff - 0.2);
      ctx.put(this.neonKeys[n], p.s + rng.range(-p.w * 0.25, p.w * 0.25), dFront, { y: gy + 4.6, yaw: ctx.faceRoad(side) }, true);
      if (rng.chance(0.7)) ctx.put(this.bladeKeys[(n + 3) % NEONS.length], p.s + rng.range(-p.w * 0.4, p.w * 0.4), dFront, { y: gy + 3.6, yaw: ctx.faceRoad(side) + Math.PI / 2 }, true);
    }
    // Rooftop billboard on the low front row.
    if (p.billboard > 0) {
      const dRoof = side * (half + frontOff + 3);
      ctx.put(this.plateKeys[(p.billboard - 1) % this.plateKeys.length], p.s, dRoof, { y: gy + r.height + 0.3, yaw: ctx.faceRoad(side) }, true);
    }
    // Red aviation beacon on tall roofs.
    if (r.beacon && this.night) ctx.glow(p.s, d, r.topHeight + (gy - this.host.road.height(p.s)), 2.4, 0.2, 0.15, 5);
  }

  /** Water, girders, piers, pylons and lamp ledges of the bridge in this chunk. */
  private bridge(ctx: ChunkBuild, sp: BridgeSpan): void {
    const half = this.host.half;
    const s0 = ctx.s0;
    const s1 = s0 + CHUNK_LENGTH;
    for (const side of [1, -1] as const) {
      const geo = waterStrip(ctx, {
        side,
        level: sp.level,
        offNear: 0,
        offFar: 3000,
        columns: WATER_COLUMNS,
        ground: (s, d) => this.host.terrainHeight(s, Math.abs(d) - half, d < 0 ? -1 : 1),
        step: 8,
      });
      if (geo) {
        const mesh = new THREE.Mesh(geo, this.water);
        mesh.renderOrder = 1;
        mesh.matrixAutoUpdate = false;
        ctx.chunk.group.add(mesh);
        ctx.chunk.extras.push(mesh);
      }
    }
    // Structure between the abutments only (water mask > 0.5).
    const aa = Math.max(s0, sp.a + 40);
    const bb = Math.min(s1, sp.b - 40);
    if (bb > aa) {
      bridgeGirder(ctx, aa, bb, sp.level);
      const conc = ctx.stat('conc');
      for (const side of [1, -1] as const) ribbon(conc, ctx, side * (half + 0.5), side * (half + 1.3), { up: -0.04 }, { color: [0.8, 0.8, 0.78], uvPerM: this.host.worldMats.uv('concrete') });
      void conc;
    }
    const pierEvery = 48;
    for (let k = Math.ceil(Math.max(s0, sp.a + 60) / pierEvery); k * pierEvery < Math.min(s1, sp.b - 60); k++) bridgePier(ctx, k * pierEvery);
    for (const sp2 of [sp.a + 220, sp.a + 420]) if (sp2 >= s0 && sp2 < s1) cablePylon(ctx, sp2, { height: 76 });
    // A passing ferry or two, lit at night.
    for (let i = 0; i < 2; i++) {
      const rng = new Rng(Math.floor(h2(Math.floor(s0 / CHUNK_LENGTH), 40 + i, this.host.seed) * 4294967296));
      if (rng.float() > 0.5) continue;
      ctx.put(this.boatKey, s0 + rng.float() * CHUNK_LENGTH, (rng.chance(0.5) ? 1 : -1) * (half + rng.range(60, 300)), { y: sp.level + 0.4, yaw: rng.range(0, 6.28), scale: rng.range(0.9, 1.6) }, false);
    }
  }
}

/** Bosphorus-style passenger ferry: white two-deck hull with a lit saloon, a funnel and a mast. */
function ferryGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const white = mul(rgb('#eceae2'), 1.3);
  b.box(0, 1.2, 0, 7, 2.4, 26, { color: mul(rgb('#26425d'), 1.0) });
  b.box(0, 3.2, 0, 7.2, 1.6, 24, { color: white });
  b.box(0, 4.6, 1, 6.2, 1.4, 17, { color: white });
  b.box(0, 3.2, 0, 7.3, 0.7, 23, { color: [1.9, 1.5, 0.9] });
  b.box(0, 6.2, -3, 4.6, 1.6, 5, { color: white });
  b.frustum(0, 6.4, 3, 1.1, 0.9, 2.6, 10, { color: rgb('#a62a22') }, true);
  b.frustum(0, 7, -3, 0.12, 0.06, 5, 6, { color: rgb('#aaaaaa') }, true);
  return b.build();
}

export { CONCRETE_TINTS, GLASS_TINTS, OVERPASS_CLEARANCE };
