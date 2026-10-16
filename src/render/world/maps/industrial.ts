import * as THREE from 'three';
import { Rng, hash01, noise2, smoothstep } from '../../../core/math';
import type { RangeSpec } from '../backdrop';
import { footbridge, overpass } from '../bridges';
import { gantry, signPanel } from '../furniture';
import {
  CONTAINER_TINTS,
  HALL_TINTS,
  chimneyGeometry,
  containerGeometry,
  coolingTowerGeometry,
  drumsGeometry,
  fenceGeometry,
  flareGeometry,
  hall,
  pipeRackGeometry,
  quayCraneGeometry,
  silosGeometry,
  tankGeometry,
  towerCraneGeometry,
} from '../industry';
import { rgb, mul } from '../kit';
import { LampKit } from '../lighting';
import { plumeGeometry, plumeMaterial } from '../plume';
import { pylonGeometry } from '../props';
import { CHUNK_LENGTH, Scenery, type ChunkBuild, type SceneryHost } from '../scenery';
import { h2, scatter } from '../scatter';
import { REGION_CITIES, infoSignTexture, type SignDest } from '../signs';
import { buildTunnel, mountainMask, mountainRise, poolGeometry, tunnelEnclosure, tunnelNear, tunnelSpan, TUNNEL_FIRST, TUNNEL_PERIOD } from '../tunnel';
import { softGlow } from '../glow';

const LOT = 170;
type LotKind = 'factory' | 'tanks' | 'containers' | 'warehouses' | 'power' | 'silos' | 'open';
const LOT_KINDS: LotKind[] = ['factory', 'tanks', 'containers', 'warehouses', 'power', 'silos', 'open'];
const LOT_WEIGHTS = [3, 2, 2.6, 2, 1.2, 1.1, 1.4];

/**
 * Kocaeli (D-100): a petrochemical and port belt. Factory halls with docks, tank farms, container
 * yards under quay cranes, cooling towers, chimneys with drifting smoke, flare stacks, pylons and pipe racks,
 * and every few kilometres a mountain the road passes under in a long, tiled and lit tunnel (portals, jet
 * fans, SOS niches, threshold lighting). `enclosure()` feeds the exposure/eye adaptation and the audio reverb.
 */
export class IndustrialScenery extends Scenery {
  private pine: string[];
  private poplar: string[];
  private spruce: string[];
  private maki: string[];
  private tuft: string[];
  private tall: string[];
  private lamps: LampKit;
  private mast: LampKit;
  private night: boolean;
  private chimneyKeys: string[] = [];
  private tankKeys: string[] = [];

  constructor(host: SceneryHost) {
    super(host);
    const dens = host.quality.sceneryDensity;
    const m = host.worldMats;
    this.night = host.env.scenery.lightsOn;
    this.pine = this.defineTree('redpine', 12 * dens + 2);
    this.poplar = this.defineTree('poplar', 14 * dens + 2, { variants: 1 });
    this.spruce = this.defineTree('spruce', 60 * dens + 6, { ranges: { hi: 80, mid: 240 } });
    this.maki = this.defineTree('maki', 40 * dens + 4, { maxDist: 320 });
    this.tuft = this.defineTree('tuft', 80 * dens + 8, { shadow: false, ranges: { hi: 55, mid: 130 }, maxDist: 200 });
    this.tall = this.defineTree('grass', 16 * dens + 3, { shadow: false, ranges: { hi: 55, mid: 130 }, maxDist: 200 });
    this.lamps = this.defineLamps({ style: 'sodium', max: 10, glow: [1.95, 1.15, 0.4, 2.8], pool: '#ffae55' });
    this.mast = this.defineLamps({ style: 'highmast', max: 4, glow: [1.8, 1.55, 1.1, 5.0], pool: '#ffe3b0' });
    const plain = m.plain({ roughness: 0.55, metalness: 0.45 });
    for (const [i, h] of [70, 92, 115].entries()) {
      const key = `chimney#${i}`;
      this.chimneyKeys.push(key);
      this.defineProp(key, chimneyGeometry(h), m.plain({ roughness: 0.85 }), { max: 4, shadow: true });
    }
    this.defineProp('cooling', coolingTowerGeometry(), m.plain({ roughness: 0.9 }), { max: 4, shadow: true });
    for (const [i, [r, h]] of [[9, 13], [12, 15], [7, 18]].entries()) {
      const key = `tank#${i}`;
      this.tankKeys.push(key);
      this.defineProp(key, tankGeometry(r, h), plain, { max: 12, shadow: true });
    }
    this.defineProp('silos', silosGeometry(), m.plain({ roughness: 0.9 }), { max: 3, shadow: true });
    this.defineProp('container', containerGeometry(), m.pbr('container', { roughness: 0.7, metalness: 0.3 }), { max: 420, shadow: true });
    this.defineProp('qcrane', quayCraneGeometry(), plain, { max: 3, shadow: false });
    this.defineProp('tcrane', towerCraneGeometry(), plain, { max: 3, shadow: false });
    this.defineProp('flare', flareGeometry(), plain, { max: 2, shadow: false });
    this.defineProp('rack', pipeRackGeometry(), plain, { max: 40, shadow: true });
    this.defineProp('fence', fenceGeometry(), plain, { max: 90 });
    this.defineProp('drums', drumsGeometry(), plain, { max: 8, shadow: true });
    this.defineProp('pylon', pylonGeometry(), plain, { max: 3, shadow: false });
    // Plumes: dark factory smoke, white steam, and the flare's orange flame.
    const smoke = m.adopt(plumeMaterial(m.uniforms, { color: this.night ? '#3b3f46' : '#6a655f', height: 60, size: [5, 26], speed: 0.045, opacity: 0.55, night: this.night }));
    const steam = m.adopt(plumeMaterial(m.uniforms, { color: this.night ? '#5a626d' : '#e9ecef', height: 70, size: [10, 44], speed: 0.04, opacity: 0.6, night: this.night }));
    this.defineProp('smoke', plumeGeometry(), smoke, { max: 6, renderOrder: 4 });
    this.defineProp('steam', plumeGeometry(), steam, { max: 6, renderOrder: 4 });
    const pool = m.adopt(
      new THREE.MeshBasicMaterial({ map: softGlow(), color: new THREE.Color('#fff1d6').multiplyScalar(0.34), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.defineProp('tpool', poolGeometry(host.half + 0.9), pool, { max: 30, renderOrder: 2 });
    this.defineStatic('metal', m.pbr('facade_industrial', { roughness: 0.6, metalness: 0.05 }), true);
    this.defineStatic('roofm', m.pbr('facade_industrial', { roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }), true);
    this.defineStatic('trim', m.plain({ roughness: 0.7 }), true);
    this.defineStatic('glass', m.glass(), false);
    this.defineStatic('lit', m.glowing(this.night ? 1.9 : 0.5), false);
    this.defineStatic('conc', m.pbr('concrete', { roughness: 1 }), true);
    this.defineStatic('asphalt', m.pbr('asphalt_worn', { roughness: 1 }), false);
    this.defineStatic('steel', m.plain({ roughness: 0.5, metalness: 0.6 }), true);
    this.defineStatic('rock', m.pbr('cliff', { roughness: 1 }), true);
    this.defineStatic('tunnelTile', m.tunnel('tile_white', { roughness: 0.4, lit: 0.75 }), false);
    this.defineStatic('tunnelConc', m.tunnel('concrete', { roughness: 0.8, lit: 0.6 }), false);
  }

  // ── Terrain and colour ───────────────────────────────────────────────────────────

  /** Flat plain with the tunnel mountains rising over the road. */
  override terrain(s: number, off: number, _side: number, base: number): number {
    const rise = mountainRise(this.host.seed, s, off);
    if (rise <= 0) return base;
    return base + rise + noise2(s * 0.03, off * 0.06, 19) * 2.2 * (rise / 14) * smoothstep(3, 20, off);
  }

  override groundColor(s: number, off: number, _h: number, out: THREE.Color, side: number): boolean {
    if (off < 1) {
      out.setRGB(0.72, 0.7, 0.67);
      return true;
    }
    const n = noise2(s / 30 + side * 4, off / 22, 6) * 0.5 + 0.5;
    const patch = noise2(s / 11 + 4, off / 9 + side, 14) * 0.5 + 0.5;
    // Gravel and cracked asphalt, oil stains, weeds at the edges.
    out.setRGB(0.5 + n * 0.1, 0.48 + n * 0.09, 0.44 + n * 0.08);
    if (patch > 0.62) out.lerp(_c.setRGB(0.27, 0.27, 0.29), 0.7);
    if (off > 60) out.lerp(_c.setRGB(0.36, 0.42, 0.26), smoothstep(60, 180, off) * 0.7);
    const m = mountainMask(this.host.seed, s);
    if (m > 0) out.lerp(_c.setRGB(0.34 + n * 0.1, 0.4 + n * 0.08, 0.26), m * (1 - smoothstep(0, 100, off)) * 0.85 + 0.0);
    return true;
  }

  override ranges(): RangeSpec[] {
    return [
      { radius: 3200, height: 460, low: '#566551', mid: '#76846f', peak: '#98a393', snowLine: 9, sharp: 0.35, amp: 0.55, seed: 17, haze: 0.55 },
      { radius: 2600, height: 330, low: '#3f4c40', mid: '#566355', peak: '#738071', snowLine: 9, sharp: 0.5, amp: 0.5, seed: 29, haze: 0.32, forest: '#2d3e2d' },
    ];
  }

  override enclosure(s: number): number {
    return tunnelEnclosure(this.host.seed, s);
  }

  // ── Chunk ───────────────────────────────────────────────────────────────────────

  override build(ctx: ChunkBuild): void {
    const half = this.host.half;
    const seed = this.host.seed;
    const s0 = ctx.s0;
    const s1 = s0 + CHUNK_LENGTH;
    const road = this.host.road;
    const m0 = mountainMask(seed, s0);
    const m1 = mountainMask(seed, s1);
    const mid = mountainMask(seed, (s0 + s1) / 2);
    const mountain = Math.max(m0, m1, mid);

    // ── Tunnel: bore, portals, fixtures, rock cuts.
    const tn = tunnelNear(seed, (s0 + s1) / 2, 160 + CHUNK_LENGTH) ?? tunnelNear(seed, s0, 160) ?? tunnelNear(seed, s1, 160);
    if (tn) {
      buildTunnel(ctx, tn, this.night, (s) => ctx.put('tpool', s, 0, { y: road.height(s) + 0.06, yaw: 0 }, true));
      // Warning sign 220 m before the entry.
      const ss = tn.a - 220;
      if (ss >= s0 && ss < s1) this.tunnelSign(ctx, ss, tn.b - tn.a);
    }

    // ── Street lamps (sodium, staggered) outside the mountain; none inside the tunnel.
    const pitch = 40;
    for (let k = Math.ceil(s0 / pitch); k * pitch < s1; k++) {
      const s = k * pitch;
      if (mountainMask(seed, s) > 0.02) continue;
      this.lamps.place(ctx, s, k % 2 === 0 ? 1 : -1, 1.4);
    }

    // ── Guide-sign gantries and overpasses, kept clear of the mountains.
    const gk = Math.floor((s0 + CHUNK_LENGTH * 0.5) / 1500);
    const gs = gk * 1500 + 600 + h2(gk, 1, seed) * 300;
    if (gs >= s0 && gs < s1 && mountainMask(seed, gs) < 0.01 && !tunnelNear(seed, gs, 260)) {
      const cities = REGION_CITIES.industrial;
      const pick = (j: number): SignDest => {
        const c = cities[Math.floor(h2(gk, j, 11) * cities.length)];
        return { name: c[0], km: Math.max(2, Math.round(c[1] * 0.3 + 2 + h2(gk, j, 13) * 12)) };
      };
      gantry(ctx, gs, [[{ ...pick(1), arrow: '↑' }, pick(2)], [{ ...pick(3), arrow: '↗' }, pick(4)]], 'D-100', { lit: this.night });
    }
    const ok = 900;
    for (let b = Math.floor(s0 / ok); b <= Math.ceil(s1 / ok); b++) {
      const s = b * ok + 300 + h2(b, 91, seed) * 200;
      if (s < s0 || s >= s1 || h2(b, 92, seed) > 0.6 || mountainMask(seed, s) > 0 || tunnelNear(seed, s, 320)) continue;
      if (h2(b, 93, seed) > 0.5) overpass(ctx, s, { lit: this.night, ramp: 52 });
      else footbridge(ctx, s, { lit: this.night });
    }

    // ── Lots: factory, tank farm, container yard, warehouses, power station, silos, open ground.
    const first = Math.floor((s0 - 90) / LOT);
    const last = Math.floor((s1 + 90) / LOT);
    for (let k = first; k <= last; k++) {
      for (const side of [1, -1] as const) {
        const sc = k * LOT + LOT / 2;
        if (mountainMask(seed, sc - 60) > 0.01 || mountainMask(seed, sc + 60) > 0.01 || mountainMask(seed, sc) > 0.01) continue;
        const r = new Rng(Math.floor(hash01(k * 7919 + side * 104729 + seed * 15485863) * 4294967296));
        const kind = r.weighted(LOT_KINDS, LOT_WEIGHTS);
        this.lot(ctx, kind, k, side, sc, r);
      }
    }

    // ── Verge: weeds, scrub, a few poplars and pines, spruce on the mountains.
    scatter(ctx, this.tuft, { count: 70, offMin: 1.4, offMax: 22, pow: 1.4, scale: [0.7, 1.4], tint: [2.0, 1.7, 0.8], tintJitter: 0.3 });
    scatter(ctx, this.tall, { count: 10, offMin: 2, offMax: 14, scale: [0.7, 1.3], tint: [2.2, 1.9, 0.9], tintJitter: 0.25 });
    scatter(ctx, this.maki, { count: 18, offMin: 3, offMax: 60, pow: 1.5, scale: [0.6, 1.4], tint: [1.0, 1.0, 0.85] });
    scatter(ctx, this.poplar, { count: 4, offMin: 8, offMax: 120, scale: [0.8, 1.2], mask: () => 0.7 });
    scatter(ctx, this.pine, { count: 3, offMin: 12, offMax: 160, scale: [0.8, 1.2] });
    if (mountain > 0.02) {
      scatter(ctx, this.spruce, { count: 46 * mountain, offMin: 3.5, offMax: 90, pow: 1.1, scale: [0.6, 1.2], mask: (s) => mountainMask(seed, s) });
      // Trees along the mountain's crest over the road.
      for (let s = Math.ceil(s0 / 14) * 14; s < s1; s += 14) {
        const mm = mountainMask(seed, s);
        if (mm < 0.6 || !tunnelNear(seed, s, 0)) continue;
        const sp = tunnelNear(seed, s, 0)!;
        if (s < sp.a + 6 || s > sp.b - 6) continue;
        const rr = h2(Math.floor(s), 3, seed);
        ctx.put(this.spruce[Math.floor(rr * this.spruce.length)], s, (h2(Math.floor(s), 4, seed) - 0.5) * 12, { y: road.height(s) - 0.05 + mountainRise(seed, s, 0), yaw: rr * 6.28, scale: 0.7 + rr * 0.5 }, true);
      }
    }
    void half;
    void TUNNEL_FIRST;
    void TUNNEL_PERIOD;
    void tunnelSpan;
  }

  /** Blue information sign "TÜNEL 640 m" on a post at the right edge. */
  private tunnelSign(ctx: ChunkBuild, s: number, len: number): void {
    const half = this.host.half;
    const tex = infoSignTexture('TÜNEL', `${Math.round(len)} m`);
    signPanel(ctx, tex, s, half + 3.2, 3.2, 1.6, 3.4, 0);
    const steel = ctx.stat('steel');
    ctx.frame(steel, s, half + 3.2, 0);
    steel.box(0, 1.8, 0.1, 0.12, 3.6, 0.12, { color: [0.45, 0.47, 0.5] });
    steel.pop();
  }

  private inChunk(ctx: ChunkBuild, s: number): boolean {
    return s >= ctx.s0 && s < ctx.s0 + CHUNK_LENGTH;
  }

  /** One lot (LOT metres of road, one side): the lot kind decides what stands there. Items are placed by the chunk that owns their centre. */
  private lot(ctx: ChunkBuild, kind: LotKind, k: number, side: 1 | -1, sc: number, r: Rng): void {
    const half = this.host.half;
    const road = this.host.road;
    const sf = side;
    const fenceLine = (off: number, from: number, to: number) => {
      for (let s = Math.ceil(from / 4) * 4; s < to; s += 4) if (this.inChunk(ctx, s)) ctx.put('fence', s, sf * (half + off), { yaw: Math.PI / 2 }, true);
    };
    switch (kind) {
      case 'factory': {
        const off = 28 + r.range(0, 8);
        const n = r.int(1, 2);
        let s = sc - 55;
        for (let i = 0; i < n; i++) {
          const W = r.range(46, 82);
          const D = r.range(30, 48);
          const H = r.range(11, 19);
          const tint = r.pick(HALL_TINTS);
          const roof = mul(r.pick(HALL_TINTS), 0.7);
          const sHall = s + W / 2;
          const dHall = sf * (half + off + D / 2);
          const night = this.night;
          const rng = new Rng(Math.floor(r.float() * 4294967296));
          if (this.inChunk(ctx, sHall)) hall(ctx, sHall, dHall, sf, { rng, night, W, D, H, tint, roof });
          s += W + 12;
        }
        if (r.chance(0.65)) {
          const ck = r.int(0, 2);
          const sCh = sc + r.range(-40, 55);
          const dCh = sf * (half + off + 62 + r.range(0, 14));
          if (this.inChunk(ctx, sCh)) {
            ctx.put(this.chimneyKeys[ck], sCh, dCh, { yaw: 0 }, false);
            const hh = [70, 92, 115][ck];
            ctx.put('smoke', sCh, dCh, { y: ctx.groundY(sCh, dCh) + hh + 1.5, yaw: -ctx.yaw(sCh) }, false);
            if (this.night) ctx.glow(sCh, dCh, hh + (ctx.groundY(sCh, dCh) - road.height(sCh)) + 1.5, 2.6, 0.2, 0.12, 5);
          }
        }
        if (r.chance(0.4)) {
          const sf2 = sc + r.range(-60, 60);
          if (this.inChunk(ctx, sf2)) ctx.put('drums', sf2, sf * (half + off - 6), { yaw: r.range(0, 6.28) }, true);
        }
        fenceLine(off - 8, sc - LOT / 2 + 4, sc + LOT / 2 - 4);
        const sMast = sc + r.range(-50, 50);
        if (r.chance(0.6) && this.inChunk(ctx, sMast)) this.mast.place(ctx, sMast, sf, off - 5);
        break;
      }
      case 'tanks': {
        const cols = r.int(2, 4);
        const rows = r.int(1, 2);
        const off0 = 44 + r.range(0, 10);
        for (let c = 0; c < cols; c++) {
          for (let rr = 0; rr < rows; rr++) {
            const key = this.tankKeys[r.int(0, 2)];
            const s = sc - 55 + c * 34 + r.range(-2, 2);
            const d = sf * (half + off0 + rr * 32);
            if (this.inChunk(ctx, s)) ctx.put(key, s, d, { yaw: r.range(0, 6.28), tint: new THREE.Color().setRGB(r.range(0.92, 1.1), r.range(0.92, 1.1), r.range(0.92, 1.1)) }, false);
          }
        }
        // Pipe rack along the road side of the farm.
        for (let s = Math.ceil((sc - 78) / 8) * 8; s < sc + 78; s += 8) if (this.inChunk(ctx, s)) ctx.put('rack', s, sf * (half + 32), { yaw: 0 }, true);
        if (r.chance(0.5)) {
          const sF = sc + r.range(-30, 30);
          if (this.inChunk(ctx, sF)) {
            const dF = sf * (half + 140);
            ctx.put('flare', sF, dF, {}, false);
            if (this.night) ctx.glow(sF, dF, 70 + (ctx.groundY(sF, dF) - road.height(sF)), 2.6, 1.2, 0.3, 9);
          }
        }
        fenceLine(24, sc - LOT / 2 + 4, sc + LOT / 2 - 4);
        break;
      }
      case 'containers': {
        const off0 = 34 + r.range(0, 8);
        const blocks = r.int(2, 3);
        for (let bi = 0; bi < blocks; bi++) {
          const nx = r.int(3, 5);
          const ny = r.int(3, 7);
          const sB = sc - 70 + bi * 56;
          const dB = off0 + r.range(0, 18) + bi * 3;
          const lvl = r.int(2, 4);
          const tintOf = r.int(0, CONTAINER_TINTS.length - 1);
          for (let i = 0; i < nx; i++) {
            for (let j = 0; j < ny; j++) {
              const h = Math.max(1, lvl - Math.floor(r.float() * 2) - (j % 3 === 2 ? 1 : 0));
              const s = sB + i * 12.9;
              const d = sf * (half + dB + j * 2.9);
              const inside = this.inChunk(ctx, s);
              for (let y = 0; y < h; y++) {
                const t = CONTAINER_TINTS[(tintOf + i + j * 3 + y * 2 + (r.float() < 0.5 ? 1 : 0)) % CONTAINER_TINTS.length];
                if (inside) ctx.put('container', s, d, { y: ctx.groundY(s, d) + 0.02 + y * 2.6, tint: new THREE.Color().setRGB(t[0], t[1], t[2]) }, true);
              }
            }
          }
        }
        // A quay crane at the back of the yard (boom swung away from the road) and a yard crane near it.
        if (r.chance(0.7)) {
          const sC = sc + r.range(-40, 40);
          if (this.inChunk(ctx, sC)) ctx.put('qcrane', sC, sf * (half + 150), { yaw: sf > 0 ? Math.PI / 2 + Math.PI : Math.PI / 2, scale: 1.1 }, false);
        }
        fenceLine(26, sc - LOT / 2 + 4, sc + LOT / 2 - 4);
        const sMast = sc + r.range(-30, 30);
        if (r.chance(0.8) && this.inChunk(ctx, sMast)) this.mast.place(ctx, sMast, sf, 28);
        break;
      }
      case 'warehouses': {
        const n = r.int(2, 3);
        let s = sc - 75;
        for (let i = 0; i < n; i++) {
          const W = r.range(42, 62);
          const D = r.range(20, 28);
          const H = r.range(8, 12);
          const sH = s + W / 2;
          const rng = new Rng(Math.floor(r.float() * 4294967296));
          const tint = r.pick(HALL_TINTS);
          if (this.inChunk(ctx, sH)) hall(ctx, sH, sf * (half + 24 + r.range(0, 6) + D / 2), sf, { rng, night: this.night, W, D, H, tint, roof: mul(tint, 0.65) });
          s += W + 6;
        }
        fenceLine(18, sc - LOT / 2 + 4, sc + LOT / 2 - 4);
        break;
      }
      case 'power': {
        const off = 70 + r.range(0, 16);
        for (let i = 0; i < 2; i++) {
          const s = sc - 30 + i * 52;
          const d = sf * (half + off + r.range(-4, 4));
          if (this.inChunk(ctx, s)) {
            ctx.put('cooling', s, d, { scale: 1.0 + r.range(-0.05, 0.1) }, false);
            ctx.put('steam', s, d, { y: ctx.groundY(s, d) + 60 * 1.0, yaw: -ctx.yaw(s) }, false);
          }
        }
        const sCh = sc + 54;
        const dCh = sf * (half + off + 6);
        if (this.inChunk(ctx, sCh)) {
          ctx.put(this.chimneyKeys[2], sCh, dCh, {}, false);
          ctx.put('smoke', sCh, dCh, { y: ctx.groundY(sCh, dCh) + 116.5, yaw: -ctx.yaw(sCh) }, false);
          if (this.night) ctx.glow(sCh, dCh, 116.5 + (ctx.groundY(sCh, dCh) - road.height(sCh)), 2.6, 0.2, 0.12, 5);
        }
        for (let i = 0; i < 2; i++) {
          const sP = sc - 60 + i * 120;
          if (this.inChunk(ctx, sP)) ctx.put('pylon', sP, sf * (half + 30), { yaw: Math.PI / 2 }, false);
        }
        break;
      }
      case 'silos': {
        const off = 40 + r.range(0, 10);
        for (let i = 0; i < r.int(1, 2); i++) {
          const s = sc - 40 + i * 50;
          if (this.inChunk(ctx, s)) ctx.put('silos', s, sf * (half + off + 6), { yaw: r.range(0, 6.28) }, false);
        }
        const W = r.range(30, 46);
        const sH = sc + 28;
        const rng = new Rng(Math.floor(r.float() * 4294967296));
        if (this.inChunk(ctx, sH)) hall(ctx, sH, sf * (half + 22 + 11), sf, { rng, night: this.night, W, D: 22, H: 10, tint: r.pick(HALL_TINTS), roof: rgb('#6a6f73') });
        fenceLine(18, sc - LOT / 2 + 4, sc + LOT / 2 - 4);
        break;
      }
      case 'open': {
        // Gravel yard, a tower crane over a construction pad, drums and a few trees.
        if (r.chance(0.6)) {
          const s = sc + r.range(-30, 30);
          if (this.inChunk(ctx, s)) ctx.put('tcrane', s, sf * (half + 60 + r.range(0, 20)), { yaw: r.range(0, 6.28) }, false);
        }
        for (let i = 0; i < 3; i++) {
          const s = sc + r.range(-60, 60);
          if (this.inChunk(ctx, s)) ctx.put('drums', s, sf * (half + 22 + r.range(0, 14)), { yaw: r.range(0, 6.28) }, true);
        }
        break;
      }
    }
    void k;
  }
}

const _c = new THREE.Color();
