import * as THREE from 'three';
import type { BikeSpec } from '../../data/bikes';
import {
  bikeCarbonMaterial,
  bikeDecalMaterial,
  bikeHardMaterial,
  bikeLensMaterial,
  bikePaintMaterial,
  bikePlateMaterial,
  bikeRadiatorMaterial,
  bikeScreenMaterial,
  bikeSeatMaterial,
  bikeTyreMaterial,
} from '../materials';
import { blueprintFor } from './blueprints';
import { autoBlueprint } from './blueprints/auto';
import { KitContext } from './context';
import { computeHardpoints, type Hardpoints } from './hardpoints';
import { buildFork, buildFrontBrakes } from './kit/front';
import { buildCockpit } from './kit/cockpit';
import { buildEngine, type Port } from './kit/engine';
import { buildExhaust } from './kit/exhaust';
import { buildFrame } from './kit/frame';
import { buildRear } from './kit/rear';
import { buildWheel } from './kit/wheel';
import { AH, AW, LV_BOX, LiveryCanvas, liveryRects, type LiveryZones } from './livery';
import type { P3 } from './mesh';
import { kitQuality, type BikeDetail, type BikeLod, type KitQuality } from './quality';
import { GROUPS, type GroupName, type Slot } from './sink';
import { carbonWeave, radiatorCore, turkishPlate, tyreTextures } from './textures';
import type { BikeBlueprint } from './types';

/** A fully built bike: merged geometry per group & material slot plus its textures and shared materials. */
export interface BikeBuild {
  key: string;
  spec: BikeSpec;
  bp: BikeBlueprint;
  hp: Hardpoints;
  q: KitQuality;
  liveryIndex: number;
  geoms: Map<GroupName, Map<Slot, THREE.BufferGeometry>>;
  /** Materials owned by this build (per slot; per-instance slots are created by BikeModel). */
  materials: Map<string, THREE.Material>;
  /** Textures owned by this build (livery atlas, decal atlas). */
  textures: THREE.Texture[];
  anchors: Map<string, P3>;
  stats: { triangles: number; vertices: number; buildMs: number };
  /** Non-fatal generator failures (logged once). */
  warnings: string[];
  refs: number;
}

/** Slots whose material is created per BikeModel instance (animated / per-instance textures). */
export const INSTANCE_SLOTS: ReadonlySet<Slot> = new Set<Slot>(['head', 'drl', 'tail', 'indicator', 'dash', 'blur', 'mirrorL', 'mirrorR']);

let hardShared: THREE.MeshPhysicalMaterial | null = null;
let hardLite: THREE.MeshPhysicalMaterial | null = null;

function zonesFor(hp: Hardpoints, bp: BikeBlueprint): LiveryZones {
  const z: LiveryZones = {
    splitY: hp.seatY - 0.32,
    tankTop: hp.head[1] + 0.08,
    tankFront: hp.head[2],
    tankBack: hp.seatFront,
    bodyFront: -hp.L - 0.1,
    bodyBack: hp.pivot[2],
    decal: [hp.head[2] + 0.3, hp.head[1] - 0.25],
    decalSize: 0.06,
  };
  return { ...z, ...(bp.zones ?? {}) };
}

function plateText(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const city = String(1 + (h % 81)).padStart(2, '0');
  const letters = 'ABCDEFGHJKLMNPRSTUVYZ';
  const l = letters[h % letters.length] + letters[(h >>> 5) % letters.length];
  return `${city} ${l} ${100 + (h % 899)}`;
}

/** Developer switches (dev/preview.html `skip=`): generator stages to leave out, for isolating parts. */
export const kitDebug = { skip: new Set<string>(), timings: null as Map<string, number> | null };

function runKit(ctx: KitContext, warnings: string[]): void {
  // A blueprint can replace a generic stage with its own (built in `body`) by listing `skip:<stage>` in
  // `features` (e.g. 'skip:engine', 'skip:frame'). Bikes without such a feature are unaffected.
  const featureSkips = new Set((ctx.bp.features ?? []).filter((f) => f.startsWith('skip:')).map((f) => f.slice(5)));
  const safe = <T>(name: string, fn: () => T, fallback: T): T => {
    if (kitDebug.skip.has(name) || featureSkips.has(name)) return fallback;
    const t0 = kitDebug.timings ? performance.now() : 0;
    try {
      return fn();
    } catch (e) {
      warnings.push(`${ctx.bp.id}: ${name}: ${(e as Error).message}`);
      return fallback;
    } finally {
      if (kitDebug.timings) kitDebug.timings.set(name, (kitDebug.timings.get(name) ?? 0) + performance.now() - t0);
    }
  };
  safe('front wheel', () => buildWheel(ctx, true), null);
  safe('rear wheel', () => buildWheel(ctx, false), null);
  const L = safe('fork', () => buildFork(ctx), null);
  if (L) {
    const ck = safe('cockpit', () => buildCockpit(ctx, L), { frontMcPort: null });
    safe('front brakes', () => buildFrontBrakes(ctx, L, ck.frontMcPort), undefined);
    safe('frame', () => buildFrame(ctx, L), undefined);
  }
  const ports = safe<Port[]>('engine', () => buildEngine(ctx), []);
  safe('exhaust', () => buildExhaust(ctx, ports), undefined);
  safe('rear', () => buildRear(ctx), undefined);
  safe('body', () => ctx.bp.body(ctx), undefined);
}

/** Build a bike from its blueprint (no caching). */
export function assembleBike(spec: BikeSpec, liveryIndex: number, q: KitQuality): BikeBuild {
  const t0 = performance.now();
  const idx = Math.max(0, Math.min(spec.liveries.length - 1, Math.floor(liveryIndex) || 0));
  const livery = spec.liveries[idx];
  const warnings: string[] = [];
  let bp: BikeBlueprint;
  let hp: Hardpoints;
  try {
    bp = blueprintFor(spec);
    hp = computeHardpoints(bp);
  } catch (e) {
    warnings.push(`${spec.id}: blueprint: ${(e as Error).message} — using automatic blueprint`);
    bp = autoBlueprint(spec);
    hp = computeHardpoints(bp);
  }
  const ctx = new KitContext(bp, spec, hp, q, livery, idx);
  runKit(ctx, warnings);

  // Livery atlas
  const tL = performance.now();
  const lc = new LiveryCanvas(q.livery[0], q.livery[1]);
  try {
    bp.livery(lc, livery, { spec, hp, zones: zonesFor(hp, bp), index: idx });
  } catch (e) {
    warnings.push(`${spec.id}: livery: ${(e as Error).message}`);
  }
  const lvTex = lc.textures();
  const decalTex = ctx.decals.texture();
  if (kitDebug.timings) kitDebug.timings.set('livery', performance.now() - tL);

  // Geometry
  const tG = performance.now();
  const geoms = new Map<GroupName, Map<Slot, THREE.BufferGeometry>>();
  let triangles = 0;
  let vertices = 0;
  for (const g of GROUPS) {
    const m = ctx.sinks[g].toGeometries();
    for (const geo of m.values()) {
      triangles += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
      vertices += geo.getAttribute('position').count;
    }
    geoms.set(g, m);
  }
  if (kitDebug.timings) kitDebug.timings.set('merge', performance.now() - tG);

  // Materials owned by the build
  if (!hardShared) hardShared = bikeHardMaterial(true);
  if (!hardLite) hardLite = bikeHardMaterial(false);
  const materials = new Map<string, THREE.Material>();
  materials.set('hard', q.physical ? hardShared : hardLite);
  materials.set('seat', bikeSeatMaterial());
  materials.set('paint', bikePaintMaterial({ map: lvTex.map, finish: lvTex.finish, rects: liveryRects(), box: LV_BOX, aw: AW, ah: AH }, q.flakes));
  materials.set('carbon', bikeCarbonMaterial(carbonWeave()));
  materials.set('screen', bikeScreenMaterial());
  materials.set('lens', bikeLensMaterial());
  materials.set('radiator', bikeRadiatorMaterial(radiatorCore()));
  materials.set('decal', bikeDecalMaterial(decalTex));
  materials.set('plate', bikePlateMaterial(turkishPlate(plateText(spec.id))));
  const ft = tyreTextures(bp.front.tyre, bp.front.tyreLabel ?? 'Sport Radial', bp.front.tread ?? 'sport', q.tex);
  const rt = tyreTextures(bp.rear.tyre, bp.rear.tyreLabel ?? 'Sport Radial', bp.rear.tread ?? 'sport', q.tex);
  materials.set('tyre:frontWheel', bikeTyreMaterial(ft.map, ft.bump));
  materials.set('tyre:rearWheel', bikeTyreMaterial(rt.map, rt.bump));
  const anchors = new Map(ctx.anchors);
  const buildMs = performance.now() - t0;
  if (warnings.length && typeof console !== 'undefined') console.warn(`[bike kit] ${warnings.join('; ')}`);
  return {
    key: '',
    spec,
    bp,
    hp,
    q,
    liveryIndex: idx,
    geoms,
    materials,
    textures: [lvTex.map, lvTex.finish, decalTex],
    anchors,
    stats: { triangles, vertices, buildMs },
    warnings,
    refs: 0,
  };
}

/** Material for a (group, slot) pair from a build (non-instance slots only). */
export function buildMaterial(b: BikeBuild, group: GroupName, slot: Slot): THREE.Material | undefined {
  if (slot === 'tyre') return b.materials.get(`tyre:${group}`);
  return b.materials.get(slot);
}

function disposeBuild(b: BikeBuild): void {
  for (const m of b.geoms.values()) for (const g of m.values()) g.dispose();
  for (const [k, m] of b.materials) if (k !== 'hard') m.dispose();
  for (const t of b.textures) t.dispose();
  b.geoms.clear();
  b.materials.clear();
}

// ───────────────────────────── cache ─────────────────────────────

const live = new Map<string, BikeBuild>();
/** Recently released builds kept for quick re-use (garage browsing), oldest first. */
const idle: BikeBuild[] = [];
let idleMax = 2;

export function bikeCacheKey(id: string, livery: number, detail: BikeDetail, lod: BikeLod): string {
  return `${id}|${livery}|${detail}|${lod}`;
}

/** Get (or build) a bike and take a reference to it. */
export function acquireBike(spec: BikeSpec, livery: number, detail: BikeDetail, lod: BikeLod): BikeBuild {
  const q = kitQuality(detail, lod);
  const idx = Math.max(0, Math.min(spec.liveries.length - 1, Math.floor(livery) || 0));
  const key = bikeCacheKey(spec.id, idx, q.detail, lod);
  let b = live.get(key);
  if (!b) {
    const i = idle.findIndex((x) => x.key === key);
    if (i >= 0) {
      b = idle.splice(i, 1)[0];
      live.set(key, b);
    }
  }
  if (!b) {
    b = assembleBike(spec, idx, q);
    b.key = key;
    live.set(key, b);
  }
  b.refs++;
  return b;
}

/** Drop a reference; unused builds go to a small idle pool and are disposed when evicted. */
export function releaseBike(b: BikeBuild): void {
  if (b.refs <= 0) return;
  b.refs--;
  if (b.refs > 0) return;
  live.delete(b.key);
  idle.push(b);
  while (idle.length > idleMax) disposeBuild(idle.shift()!);
}

/** Dispose every idle build (and optionally change how many are kept). */
export function purgeBikeCache(keep = idleMax): void {
  idleMax = Math.max(0, keep);
  while (idle.length > idleMax) disposeBuild(idle.shift()!);
}

export function bikeCacheStats(): { live: number; idle: number } {
  return { live: live.size, idle: idle.length };
}
