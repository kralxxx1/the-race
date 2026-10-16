import * as THREE from 'three';
import type { Rng } from '../../core/math';
import { GeoBuilder, mul, rgb, type RGB } from './kit';
import type { ChunkBuild } from './scenery';
import type { WorldMaterials } from './worldMaterials';

/**
 * Skyscrapers and mid-rise blocks for the city maps. Walls are plain boxes with metric UVs; the windows
 * come from a fragment shader that tiles a window grid over the metres of the UVs, so a 200 m tower is a few
 * quads instead of thousands of window boxes, every window can be lit independently at night (floors and bays
 * cluster), and the glass reflects the HDRI because the shader switches roughness/metalness per window.
 */

export type FacadeStyle = 'glass' | 'punched' | 'apartment' | 'shop';

interface FacadeDef {
  /** Window cell in metres (width along the wall, floor height). */
  cell: [number, number];
  /** Window size inside the cell (fraction). */
  win: [number, number];
  /** Glass roughness, metalness, share of lit windows at night, emissive gain. */
  glass: [number, number, number, number];
}

export const FACADES: Readonly<Record<FacadeStyle, FacadeDef>> = {
  glass: { cell: [1.6, 3.6], win: [0.88, 0.76], glass: [0.1, 0.65, 0.5, 0.55] },
  punched: { cell: [1.9, 3.3], win: [0.68, 0.54], glass: [0.14, 0.5, 0.4, 0.6] },
  apartment: { cell: [1.7, 3.0], win: [0.6, 0.5], glass: [0.16, 0.45, 0.34, 0.58] },
  shop: { cell: [2.6, 4.4], win: [0.88, 0.7], glass: [0.12, 0.4, 0.8, 0.8] },
};

const VERT_PARS = /* glsl */ `
varying vec2 vFUv;
`;

const FRAG_PARS = /* glsl */ `
varying vec2 vFUv;
uniform float uNight;
uniform vec2 uCell;
uniform vec2 uWin;
uniform vec4 uGlass;
float fh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
float fWin = 0.0;
vec3 fEm = vec3(0.0);
{
  vec2 cell = vFUv / uCell;
  vec2 cw = fwidth(cell);
  vec2 ci = floor(cell + 0.0005);
  vec2 f = fract(cell + 0.0005);
  vec2 m = (1.0 - uWin) * 0.5;
  vec2 aa = cw * 0.75 + 0.0001;
  float inX = smoothstep(m.x - aa.x, m.x + aa.x, f.x) * (1.0 - smoothstep(1.0 - m.x - aa.x, 1.0 - m.x + aa.x, f.x));
  float inY = smoothstep(m.y - aa.y, m.y + aa.y, f.y) * (1.0 - smoothstep(1.0 - m.y - aa.y, 1.0 - m.y + aa.y, f.y));
  float w = inX * inY;
  // Far away the grid is finer than a pixel: fade to the mean window coverage instead of shimmering.
  float far = smoothstep(0.22, 0.55, max(cw.x, cw.y));
  float winF = mix(w, uWin.x * uWin.y, far);
  float h1 = fh(ci);
  float h2 = fh(ci + 17.3);
  float rowH = fh(vec2(ci.y, floor(ci.x * 0.2) + 5.0));
  float bayH = fh(vec2(floor(ci.x * 0.5), floor(ci.y * 0.25) + 11.0));
  float litP = uGlass.z * (0.2 + 0.8 * rowH) * (0.35 + 0.65 * bayH);
  float lit = step(h1, litP) * step(0.5, uNight);
  vec3 lc = mix(vec3(1.0, 0.72, 0.42), vec3(0.72, 0.86, 1.0), step(0.62, h2));
  lc = mix(lc, vec3(0.45, 0.62, 1.0), step(0.92, h2));
  lc *= 0.65 + 0.7 * fh(ci + 3.7);
  vec3 wall = diffuseColor.rgb * (0.86 + 0.28 * fh(vec2(ci.y + 2.0, 9.0)));
  // Night walls lose saturation and level: only the lamps and the sky light them.
  wall = mix(wall, vec3(dot(wall, vec3(0.333))) * 0.7, 0.4 * step(0.5, uNight));
  // Spandrel and mullion shading: slightly darker just outside the glass, a soft reveal inside it.
  float reveal = 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.18, min(min(f.x - m.x, 1.0 - m.x - f.x), min(f.y - m.y, 1.0 - m.y - f.y)) * 2.0)) * w;
  vec3 glass = mix(vec3(0.05, 0.085, 0.12), vec3(0.012, 0.026, 0.045), step(0.5, uNight)) * mix(diffuseColor.rgb * 3.0, vec3(1.0), 0.5) * (0.55 + 0.95 * h2) * reveal;
  diffuseColor.rgb = mix(wall, glass, winF);
  fEm = lc * lit * uGlass.w * winF;
  fWin = winF;
}
`;

/** One shared material per style and WorldMaterials (so a run's dispose releases it with the rest). */
const cache = new WeakMap<WorldMaterials, Map<FacadeStyle, THREE.MeshStandardMaterial>>();

export function facadeMaterial(mats: WorldMaterials, style: FacadeStyle): THREE.MeshStandardMaterial {
  let per = cache.get(mats);
  if (!per) {
    per = new Map();
    cache.set(mats, per);
  }
  const hit = per.get(style);
  if (hit) return hit;
  const def = FACADES[style];
  const m = mats.adopt(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, envMapIntensity: 1 }));
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = mats.uniforms.uNight;
    shader.uniforms.uCell = { value: new THREE.Vector2(def.cell[0], def.cell[1]) };
    shader.uniforms.uWin = { value: new THREE.Vector2(def.win[0], def.win[1]) };
    shader.uniforms.uGlass = { value: new THREE.Vector4(def.glass[0], def.glass[1], def.glass[2], def.glass[3]) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_PARS}`).replace('#include <begin_vertex>', '#include <begin_vertex>\nvFUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, uGlass.x, fWin);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mix(metalness, uGlass.y, fWin);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEm + diffuseColor.rgb * (1.0 - fWin) * mix(0.16, 0.0, uNight);');
  };
  m.customProgramCacheKey = () => `facade:${style}`;
  per.set(style, m);
  return m;
}

export const FACADE_KEY: Record<FacadeStyle, string> = { glass: 'f_glass', punched: 'f_punched', apartment: 'f_apt', shop: 'f_shop' };

export const GLASS_TINTS: readonly RGB[] = [rgb('#7f98ad'), rgb('#6a9096'), rgb('#9a8a6a'), rgb('#59626d'), rgb('#7d93a8'), rgb('#8aa0a0')];
export const CONCRETE_TINTS: readonly RGB[] = [rgb('#d6d1c6'), rgb('#cdbf9f'), rgb('#e3e1da'), rgb('#aeb4b8'), rgb('#b88a74'), rgb('#c9c2b0')];

export interface TowerOptions {
  rng: Rng;
  floors: number;
  /** Footprint along the façade (across the road view) and depth (towards the road). */
  w: number;
  d: number;
  style: FacadeStyle;
  tint?: RGB;
  /** Rounded plan (cylindrical tower) instead of a box. */
  round?: boolean;
  /** Stack a second, narrower block above this floor fraction (0 = no setback). */
  setback?: number;
  /** Mast on the roof. */
  spire?: boolean;
  /** Shop podium below the tower (floors). */
  podium?: number;
}

export interface TowerResult {
  /** Height of the roof above the ground (metres). */
  height: number;
  /** Whether a red aviation beacon should be added at `height + spire`. */
  beacon: boolean;
  topHeight: number;
}

const ROOF_GREY = rgb('#5b5f63');
const GEAR = rgb('#8d9298');

/** Author one tower into the chunk at road point (s, d); the front faces the road from `side`. */
export function tower(ctx: ChunkBuild, s: number, d: number, side: number, o: TowerOptions): TowerResult {
  const rng = o.rng;
  const def = FACADES[o.style];
  const fh = def.cell[1];
  const body = ctx.stat(FACADE_KEY[o.style]);
  const shop = ctx.stat(FACADE_KEY.shop);
  const roof = ctx.stat('rooftop');
  const tint = o.tint ?? (o.style === 'glass' ? rng.pick(GLASS_TINTS) : rng.pick(CONCRETE_TINTS));
  const podium = o.podium ?? 0;
  const set: GeoBuilder[] = [body, shop, roof];
  const p = ctx.local(s, d, 0);
  const y = ctx.localY(ctx.groundY(s, d));
  const yaw = ctx.yaw(s) + ctx.faceRoad(side);
  for (const b of set) b.push(p.x, y, p.z, yaw);
  const sink = 3 * fh;
  const offU = () => [Math.floor(rng.float() * 400) * def.cell[0], 0] as [number, number];
  let top = 0;
  // Shop podium: wider than the tower, glazed and brightly lit.
  if (podium > 0) {
    const H = podium * FACADES.shop.cell[1];
    shop.box(0, (H - sink) / 2, 0, o.w + 5, H + sink, o.d + 5, { color: mul(tint, 0.8), uvPerM: 1, uvOff: [Math.floor(rng.float() * 400) * FACADES.shop.cell[0], 0] }, 4 | 8);
    roof.box(0, H + 0.12, 0, o.w + 5.6, 0.24, o.d + 5.6, { color: mul(ROOF_GREY, 0.9) });
    top = H + 0.24;
  }
  // Main shaft(s).
  const tiers = o.setback && o.setback > 0 ? 2 : 1;
  let w = o.w;
  let dd = o.d;
  let lower = top;
  const totalH = o.floors * fh;
  for (let t = 0; t < tiers; t++) {
    const tierTop = t === 0 && tiers > 1 ? Math.max(lower + 4 * fh, Math.round((totalH * (o.setback ?? 0.6)) / fh) * fh) : totalH;
    const H = Math.max(fh * 2, tierTop - lower);
    const col = mul(tint, t === 0 ? 1 : 0.94);
    if (o.round) {
      body.frustum(0, lower - (t === 0 ? sink : 0), 0, Math.min(w, dd) * 0.5, Math.min(w, dd) * 0.5 * (t === tiers - 1 ? 0.97 : 1), H + (t === 0 ? sink : 0), 28, { color: col, uvPerM: 1, uvOff: offU() }, false);
      roof.frustum(0, lower + H, 0, Math.min(w, dd) * 0.52, Math.min(w, dd) * 0.5, 0.35, 24, { color: ROOF_GREY }, true);
    } else {
      body.box(0, lower + (H - (t === 0 ? sink : 0)) / 2, 0, w, H + (t === 0 ? sink : 0), dd, { color: col, uvPerM: 1, uvOff: offU() }, 4 | 8);
      roof.box(0, lower + H + 0.15, 0, w + 0.5, 0.3, dd + 0.5, { color: ROOF_GREY });
      // Rooftop plant: lift-motor room and cooling units.
      if (t === tiers - 1) {
        roof.box(rng.range(-w * 0.2, w * 0.2), lower + H + 1.8, rng.range(-dd * 0.2, dd * 0.2), w * 0.28, 3.2, dd * 0.28, { color: GEAR });
        for (let i = 0; i < 3; i++) roof.box(rng.range(-w * 0.35, w * 0.35), lower + H + 0.9, rng.range(-dd * 0.35, dd * 0.35), 1.8, 1.2, 1.4, { color: mul(GEAR, 0.85) });
      }
    }
    lower += H;
    w *= 0.68;
    dd *= 0.68;
  }
  let topH = lower;
  if (o.spire) {
    const L = rng.range(14, 38);
    roof.frustum(0, lower + 0.3, 0, 0.5, 0.06, L, 6, { color: rgb('#b4b8bc') }, true);
    roof.box(0, lower + 0.3 + L * 0.55, 0, 2.4, 0.18, 0.18, { color: rgb('#b4b8bc') });
    topH = lower + 0.3 + L;
  }
  for (const b of set) b.pop();
  return { height: lower, beacon: !!o.spire || lower > 90, topHeight: topH };
}

/** Floors for a tower of about `m` metres. */
export function floorsFor(style: FacadeStyle, m: number): number {
  return Math.max(3, Math.round(m / FACADES[style].cell[1]));
}
