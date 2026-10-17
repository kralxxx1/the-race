import * as THREE from 'three';
import type { EnvDef } from '../data/environments';
import { pavedHalfWidth, type LaneConfig } from '../world/road';
import { assets as defaultAssets, type AssetLibrary, type PBRSet, type TextureKey } from './assets';
import type { QualityProfile, TextureTier } from './quality';
import { facadeTextures, groundTexture, roadTextures } from './textures';
import { parseEnv } from './sky';

/**
 * World surface materials: asphalt, shoulders, terrain, guardrail, concrete
 * barrier and building facades, built from the CC0 PBR sets in `assets.ts`.
 *
 * Geometry contract (set by worldView.ts):
 *  - road:    uv.x 0..1 across the paved width, uv.y = distance along the road / ROAD_TEX_LENGTH
 *  - terrain: uv = world XZ / 9, attribute `aOff` = metres from the paved edge (optional)
 *  - rails:   uv = (metres along the rail, metres along the profile)
 * When a texture set is missing (offline, procedural tier) every material falls
 * back to the generated textures of textures.ts and looks like before.
 */

export const ROAD_TILE_LENGTH = 24;

export interface WorldSurfaces {
  road: THREE.MeshStandardMaterial;
  terrain: THREE.MeshStandardMaterial;
  rail: THREE.MeshStandardMaterial;
  barrier: THREE.MeshStandardMaterial;
  /** Building material (null when the map has no buildings). */
  building: THREE.MeshStandardMaterial | null;
  /** True when photographic sets are in use (false = procedural fallback). */
  photographic: boolean;
  dispose(): void;
}

export interface SurfaceOptions {
  lanes: LaneConfig;
  env: EnvDef;
  quality: QualityProfile;
  library?: AssetLibrary;
}

/** Texture sets a given environment needs (used by the loading screen to preload them). */
export function surfaceKeys(env: EnvDef): TextureKey[] {
  const keys: TextureKey[] = ['asphalt_fresh', 'asphalt_worn', 'gravel', 'concrete', 'guardrail', 'rock'];
  keys.push(groundKey(env));
  if (env.scenery.buildings) keys.push(env.terrain === 'city' ? 'facade_city' : 'facade_industrial');
  return keys;
}

export function groundKey(env: EnvDef): TextureKey {
  const { map, weather } = parseEnv(env);
  if (map === 'snow' || weather === 'snow') return 'snow';
  switch (env.terrain) {
    case 'sand':
      // The Konya steppe paints its own gold/clay/rust ground colours over a neutral sand photograph.
      return map === 'desert' ? 'beach' : 'sand';
    case 'city':
      return 'pavement';
    case 'forest':
      return 'forest';
    default:
      return 'grass';
  }
}

// ───────────────────────────── shared GLSL ─────────────────────────────

const NOISE = /* glsl */ `
float sfH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sfN(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sfH(i), sfH(i + vec2(1.0, 0.0)), f.x), mix(sfH(i + vec2(0.0, 1.0)), sfH(i + vec2(1.0, 1.0)), f.x), f.y);
}
float sfF(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * sfN(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
mat2 sfRot(float a) { float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }
// Distance to the nearest Voronoi edge (for cracks).
float sfEdge(vec2 p) {
  vec2 g = floor(p); vec2 f = fract(p);
  float d1 = 9.0; float d2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec2 r = o + vec2(sfH(g + o), sfH(g + o + 17.3)) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}
// Sample a photo texture twice at unrelated scales/rotations and blend while preserving contrast,
// which hides the repeat grid on long, uniform surfaces.
vec3 sfBlend(vec3 a, vec3 b, vec3 mean) { return (a + b - 2.0 * mean) * 0.70710678 + mean; }
`;

const ROAD_VERT_PARS = /* glsl */ `
varying vec2 vRoadUv;
`;

const ROAD_FRAG_PARS = /* glsl */ `
varying vec2 vRoadUv;
uniform sampler2D tAsA;
uniform sampler2D tAsN;
uniform sampler2D tAsR;
uniform sampler2D tWoA;
uniform sampler2D tWoN;
uniform sampler2D tWoR;
uniform vec2 uTile;        // metres per texture repeat (fresh, worn)
uniform float uHalf;       // paved half width
uniform float uLaneEdge;   // half width of the traffic lanes
uniform float uLaneW;
uniform float uLanes;
uniform float uOneWay;
uniform float uSep[6];     // divider type per lane boundary: 0 none, 1 dashed, 2 double solid
uniform float uWet;        // 0 dry .. 1 rained on
uniform float uDetail;     // micro-detail normal layer
uniform float uTint;
uniform vec3 uBase;        // asphalt tint multiplier
uniform float uTime;
${NOISE}

float sfCov(float x, float c, float hw) {
  float w = max(fwidth(x), 1e-4);
  return clamp((hw + w * 0.5 - abs(x - c)) / w, 0.0, 1.0);
}
float sfDash(float s, float on, float period) {
  float w = max(fwidth(s), 1e-4);
  float t = mod(s, period);
  float a = clamp((t + w * 0.5) / w, 0.0, 1.0);
  float b = clamp((on - t + w * 0.5) / w, 0.0, 1.0);
  return min(a, b) * (w < period * 0.5 ? 1.0 : 0.5);
}
`;

/** Replaces <map_fragment>: builds albedo, roughness, AO, wetness and the tangent-space normal. */
const ROAD_FRAG_MAIN = /* glsl */ `
float xM = (vRoadUv.x * 2.0 - 1.0) * uHalf;
float sM = vRoadUv.y * ${ROAD_TILE_LENGTH.toFixed(1)};
vec2 P = vec2(xM, sM);
float camDist = length(vViewPosition);
// ── base asphalt: two unrelated scales of the fresh set, worn set blended in patches and on the shoulders
vec2 t1 = P / uTile.x;
float shoulder = smoothstep(uLaneEdge - 0.05, uLaneEdge + 0.25, abs(xM));
#ifdef ROAD_LITE
// Phones: one fetch per map, no worn set, no procedural damage.
vec3 albF = texture2D(tAsA, t1).rgb;
vec3 armF = texture2D(tAsR, t1).rgb;
vec2 nF = texture2D(tAsN, t1).xy * 2.0 - 1.0;
float wornMask = shoulder * 0.5;
vec3 albW = albF * 1.12;
vec3 armW = armF;
vec2 nW = nF;
float macro = sfN(P * vec2(0.35, 0.09) + 3.0);
#else
vec2 t2 = (sfRot(0.62) * P * 0.43 + vec2(3.7, 11.3)) / uTile.x;
vec3 meanA = textureLod(tAsA, vec2(0.5), 11.0).rgb;
vec3 albF = sfBlend(texture2D(tAsA, t1).rgb, texture2D(tAsA, t2).rgb, meanA);
vec3 armF1 = texture2D(tAsR, t1).rgb;
vec3 armF2 = texture2D(tAsR, t2).rgb;
vec3 armF = (armF1 + armF2) * 0.5;
vec2 nF1 = texture2D(tAsN, t1).xy * 2.0 - 1.0;
vec2 nF2 = texture2D(tAsN, t2).xy * 2.0 - 1.0;
// the second sample is rotated by 0.62 rad: rotate its tangent-space xy back into the road frame
vec2 nF = (nF1 + sfRot(-0.62) * nF2) * 0.70710678;
float wornMask = clamp(smoothstep(0.6, 0.8, sfF(P * vec2(0.17, 0.045) + 7.0)) * 0.8 + shoulder * 0.85, 0.0, 1.0);
vec3 albW = vec3(0.0);
vec3 armW = vec3(1.0, 0.9, 0.0);
vec2 nW = vec2(0.0);
if (wornMask > 0.01) {
  vec2 w1 = P / uTile.y;
  vec2 w2 = (sfRot(1.1) * P * 0.37 + vec2(9.1, 2.3)) / uTile.y;
  vec3 meanW = textureLod(tWoA, vec2(0.5), 11.0).rgb;
  albW = sfBlend(texture2D(tWoA, w1).rgb, texture2D(tWoA, w2).rgb, meanW);
  armW = (texture2D(tWoR, w1).rgb + texture2D(tWoR, w2).rgb) * 0.5;
  nW = (texture2D(tWoN, w1).xy * 2.0 - 1.0 + sfRot(-1.1) * (texture2D(tWoN, w2).xy * 2.0 - 1.0)) * 0.70710678;
}
float macro = sfF(P * vec2(0.35, 0.09) + 3.0);
#endif
vec3 alb = mix(albF, albW * 0.9, wornMask) * uBase;
vec3 arm = mix(armF, armW, wornMask);
vec2 nXY = mix(nF, nW, wornMask);
// Macro tone variation breaks up the uniform look at distance.
alb *= 0.86 + macro * 0.3;

// ── tyre tracks: polished, darker bands where wheels run, oil in the lane centre
float wear = 0.0;
float centreOil = 0.0;
for (int i = 0; i < 6; i++) {
  if (float(i) >= uLanes) break;
  float c = (float(i) - (uLanes - 1.0) * 0.5) * uLaneW;
  float a = (xM - c - 0.85) / 0.30;
  float b = (xM - c + 0.85) / 0.30;
  wear = max(wear, max(exp(-a * a), exp(-b * b)));
  float cc = (xM - c) / 0.38;
  centreOil = max(centreOil, exp(-cc * cc));
}
wear *= 0.55 + 0.45 * sfN(P * vec2(0.8, 0.12) + 5.0);
#ifdef ROAD_LITE
float oil = 0.0;
#else
float oil = smoothstep(0.6, 0.85, sfF(P * vec2(1.2, 0.4) + 31.0)) * centreOil * (1.0 - wear);
#endif
alb *= 1.0 - wear * 0.2;
alb *= 1.0 - oil * 0.45;

// ── repair patches: rectangular, darker, with a sealed border
float patchMask = 0.0;
float patchEdge = 0.0;
#ifndef ROAD_LITE
{
  vec2 cell = floor(vec2(xM / 3.6 + 0.5, sM / 14.0));
  float h = sfH(cell + 5.3);
  if (h > 0.84) {
    vec2 centre = (cell + vec2(0.5 + (sfH(cell + 1.7) - 0.5) * 0.3, 0.5 + (sfH(cell + 2.9) - 0.5) * 0.35)) * vec2(3.6, 14.0) - vec2(1.8, 0.0);
    vec2 hlf = vec2(0.55 + sfH(cell + 3.1) * 1.1, 1.2 + sfH(cell + 4.3) * 3.5);
    vec2 q = abs(P - centre) - hlf;
    float dd = max(q.x, q.y);
    float aa = max(fwidth(dd), 1e-3);
    patchMask = 1.0 - smoothstep(-aa, aa, dd);
    patchEdge = (1.0 - smoothstep(0.012, 0.012 + aa, abs(dd))) ;
  }
}
#endif
alb = mix(alb, alb * vec3(0.72, 0.72, 0.74), patchMask);
alb = mix(alb, vec3(0.03), patchEdge * 0.8);

// ── cracks (near field only: they are sub-pixel further away)
float crack = 0.0;
#ifndef ROAD_LITE
if (camDist < 45.0) {
  vec2 cp = P * vec2(0.55, 0.55) + vec2(sfN(P * 1.7), sfN(P * 1.7 + 9.0)) * 0.35;
  float e = sfEdge(cp);
  float region = smoothstep(0.52, 0.66, sfF(P * vec2(0.13, 0.06) + 19.0));
  float widthM = 0.006 + 0.01 * sfN(P * 3.0 + 4.0);
  float ww = max(fwidth(e), 1e-4);
  crack = (1.0 - smoothstep(widthM * 0.55 - ww, widthM * 0.55 + ww, e * 1.8)) * region * (1.0 - smoothstep(30.0, 45.0, camDist));
  alb *= 1.0 - crack * 0.78;
}
#endif

// ── lane markings (analytic, anti-aliased by screen-space derivatives)
float paint = 0.0;
vec3 paintCol = vec3(0.80, 0.80, 0.77);
float yellow = 0.0;
{
  float edgeL = sfCov(xM, -uLaneEdge, 0.10);
  float edgeR = sfCov(xM, uLaneEdge, 0.10);
  paint = max(edgeR, edgeL);
  yellow = edgeL * uOneWay;
  for (int i = 0; i < 5; i++) {
    float typ = uSep[i];
    if (typ < 0.5 || float(i) + 1.0 >= uLanes) continue;
    float c = -uLaneEdge + float(i + 1) * uLaneW;
    if (typ < 1.5) paint = max(paint, sfCov(xM, c, 0.075) * sfDash(sM, 4.0, 12.0));
    else paint = max(paint, max(sfCov(xM, c - 0.13, 0.06), sfCov(xM, c + 0.13, 0.06)));
  }
  // Worn paint: chipped, thinned under the tyre tracks, speckled.
#ifdef ROAD_LITE
  float chip = smoothstep(0.1, 0.4, sfN(P * vec2(11.0, 2.4)) + 0.3 - wear * 0.2);
  float fleck = 0.0;
#else
  float chip = smoothstep(0.12, 0.5, sfF(P * vec2(11.0, 2.4)) + 0.22 - wear * 0.2);
  float fleck = step(0.965, sfH(floor(P * vec2(70.0, 45.0))));
#endif
  paint *= chip * (1.0 - fleck * 0.8);
  paint *= 1.0 - crack * 0.6;
  paintCol = mix(paintCol, vec3(0.78, 0.58, 0.10), yellow);
  paintCol *= 0.72 + 0.28 * sfN(P * vec2(25.0, 6.0));
}
alb = mix(alb, paintCol, paint);

// ── rumble strips on the shoulders
float rumble = 0.0;
{
  float ax = abs(xM) - (uLaneEdge + 0.35);
  float band = step(0.0, ax) * step(ax, 0.35);
  float ph = fract(sM / 0.3);
  rumble = band * smoothstep(0.0, 0.1, ph) * (1.0 - smoothstep(0.35, 0.45, ph));
  alb *= 1.0 - rumble * 0.14;
}

// ── wetness: puddles pool in the wheel ruts and along the gutter, thin film everywhere else
float puddle = 0.0;
float film = 0.0;
if (uWet > 0.0) {
#ifdef ROAD_LITE
  float basinNoise = sfN(P * vec2(0.6, 0.3) + 41.0);
#else
  float basinNoise = sfF(P * vec2(0.6, 0.3) + 41.0);
#endif
  float basin = basinNoise + wear * 0.3 + smoothstep(uLaneEdge - 0.6, uLaneEdge + 0.4, abs(xM)) * 0.12 + sfN(P * vec2(3.0, 1.0)) * 0.08;
  puddle = smoothstep(0.58, 0.68, basin) * uWet;
  film = uWet * (0.3 + 0.18 * wear) + puddle * 0.7;
  alb *= 1.0 - uWet * 0.38 - puddle * 0.22;
}

// ── roughness / AO / normal
float rough = clamp(arm.g, 0.45, 1.0);
rough = mix(rough, mix(rough, 0.45, 0.5), wear);
rough = mix(rough, 0.6, paint);
rough = mix(rough, 0.35, oil * 0.5);
rough = mix(rough, 0.95, crack);
float roadAo = mix(arm.r, 1.0, 0.3) * (1.0 - crack * 0.6);

vec2 nxy = nXY;
// Micro detail at close range (the base repeat is already sub-millimetre per texel on 2K/4K).
if (uDetail > 0.0 && camDist < 14.0) {
  vec2 dp = P * 6.3 / uTile.x;
  vec2 dn = texture2D(tAsN, dp).xy * 2.0 - 1.0;
  nxy += dn * uDetail * (1.0 - smoothstep(4.0, 14.0, camDist));
}
nxy *= mix(1.0, 0.45, paint);
nxy *= 1.0 - patchMask * 0.2;
// Water is flat: the surface normal relaxes inside puddles and in the thin film.
nxy *= 1.0 - puddle * 0.92 - uWet * 0.22;
nxy += vec2(0.0, 1.0) * rumble * 0.55 * sin(sM / 0.3 * 6.2831853);
float wetFilm = clamp(film, 0.0, 1.0);
vec3 roadN = normalize(vec3(nxy * 1.1, 1.0));
rough = mix(rough, 0.55, uWet * 0.15);
float roadRough = rough;
diffuseColor.rgb *= alb;
`;

function roadShader(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${ROAD_VERT_PARS}`).replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadUv = uv;');
  const physical = THREE.ShaderChunk.lights_physical_fragment.replace('material.clearcoat = clearcoat;', 'material.clearcoat = wetFilm;').replace('material.clearcoatRoughness = clearcoatRoughness;', 'material.clearcoatRoughness = 0.04 + (1.0 - wetFilm) * 0.2;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${ROAD_FRAG_PARS}`)
    .replace('#include <map_fragment>', ROAD_FRAG_MAIN)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roadRough;')
    .replace('#include <normal_fragment_maps>', 'vec3 mapN = roadN; normal = normalize( tbn * mapN );')
    .replace('#include <lights_physical_fragment>', physical)
    .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= roadAo; reflectedLight.indirectSpecular *= mix(1.0, roadAo, 0.6);');
}

// ───────────────────────────── terrain ─────────────────────────────

const TERRAIN_VERT_PARS = /* glsl */ `
attribute float aOff;
varying float vOff;
varying vec2 vTUv;
`;

const TERRAIN_FRAG_PARS = /* glsl */ `
varying float vOff;
varying vec2 vTUv;
uniform sampler2D tGa;
uniform sampler2D tGr;     // arm of the base set
uniform sampler2D tRa;
uniform sampler2D tRn;
uniform sampler2D tPa;
uniform sampler2D tPn;
uniform float uTileG;
uniform float uTileR;
uniform float uTileP;
uniform float uVcMix;
uniform float uVcHue;
uniform float uBlend;
uniform vec3 uGroundTint;
${NOISE}
`;

const TERRAIN_FRAG_MAIN = /* glsl */ `
vec2 gp = vTUv * 9.0;
float camD = length(vViewPosition);
vec2 g1 = gp / uTileG;
#ifdef TERRAIN_LITE
vec3 alb = texture2D(tGa, g1).rgb * uGroundTint;
vec3 arm = texture2D(tGr, g1).rgb;
vec2 nxy = texture2D(normalMap, g1).xy * 2.0 - 1.0;
#else
vec2 g2 = (sfRot(0.71) * gp * 0.41 + vec2(5.3, 1.9)) / uTileG;
vec3 meanG = textureLod(tGa, vec2(0.5), 11.0).rgb;
vec3 alb = sfBlend(texture2D(tGa, g1).rgb, texture2D(tGa, g2).rgb, meanG) * uGroundTint;
vec3 arm = (texture2D(tGr, g1).rgb + texture2D(tGr, g2).rgb) * 0.5;
vec2 nxy = (texture2D(normalMap, g1).xy * 2.0 - 1.0 + sfRot(-0.71) * (texture2D(normalMap, g2).xy * 2.0 - 1.0)) * 0.70710678;
#endif
float rough = clamp(arm.g, 0.4, 1.0);
float tAo = arm.r;
if (uBlend > 0.5) {
  vec3 wn = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
  float up = wn.y;
  float noiseB = sfF(gp * 0.08 + 2.0);
  // Steep faces become rock, the shoulder next to the asphalt becomes gravel.
  float rockW = smoothstep(0.80, 0.62, up + (noiseB - 0.5) * 0.12);
  float gravW = (1.0 - smoothstep(0.8, 3.2, vOff + (noiseB - 0.5) * 2.4)) * (1.0 - rockW);
  if (rockW > 0.01) {
    vec2 r1 = gp / uTileR;
    vec3 ra = texture2D(tRa, r1).rgb;
    vec2 rn = texture2D(tRn, r1).xy * 2.0 - 1.0;
    alb = mix(alb, ra, rockW);
    nxy = mix(nxy, rn, rockW);
    rough = mix(rough, 0.88, rockW);
  }
  if (gravW > 0.01) {
    vec2 p1 = gp / uTileP;
    vec3 pa = texture2D(tPa, p1).rgb;
    vec2 pn = texture2D(tPn, p1).xy * 2.0 - 1.0;
    alb = mix(alb, pa, gravW);
    nxy = mix(nxy, pn, gravW);
    rough = mix(rough, 0.92, gravW);
  }
}
// Distance fade of the normal detail (it aliases into sparkle in the far field).
nxy *= 1.0 - smoothstep(60.0, 220.0, camD) * 0.85;
float vcLum = dot(vColor.rgb, vec3(0.333));
alb *= mix(1.0, clamp(vcLum * 1.9, 0.35, 1.5), uVcMix);
alb *= mix(vec3(1.0), normalize(vColor.rgb + 0.05) * 1.7, uVcHue);
vec3 terrainN = normalize(vec3(nxy, 1.0));
float terrainRough = rough;
float terrainAo = mix(tAo, 1.0, 0.25);
diffuseColor.rgb *= alb;
`;

function terrainShader(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${TERRAIN_VERT_PARS}`).replace('#include <begin_vertex>', '#include <begin_vertex>\nvOff = aOff; vTUv = uv;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${TERRAIN_FRAG_PARS}`)
    .replace('#include <map_fragment>', '')
    .replace('#include <color_fragment>', TERRAIN_FRAG_MAIN)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = terrainRough;')
    .replace('#include <normal_fragment_maps>', 'vec3 mapN = terrainN; normal = normalize( tbn * mapN );')
    .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= terrainAo;');
}

// ───────────────────────────── builders ─────────────────────────────

function repeated(t: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const c = t.clone();
  // The clone shares the GPU image with the cached original; only the sampler state is its own.
  c.userData = { ownedClone: true };
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  return c;
}

const flatNormal = (() => {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
})();

function tierFor(q: QualityProfile): TextureTier {
  return q.textures;
}

/** Procedural fallback materials: identical to the pre-asset look (textures.ts). */
function proceduralRoad(o: SurfaceOptions): THREE.MeshStandardMaterial {
  const rt = roadTextures(o.lanes, o.env.wet, o.quality.hiResTextures);
  return new THREE.MeshStandardMaterial({
    map: rt.map,
    roughnessMap: rt.roughness,
    normalMap: rt.normal,
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 1,
    metalness: o.env.wet ? 0.08 : 0,
    envMapIntensity: o.env.wet ? 1.6 : 0.6,
  });
}

function photoRoad(o: SurfaceOptions, fresh: PBRSet, worn: PBRSet): THREE.MeshPhysicalMaterial {
  const { lanes, env, quality } = o;
  const wet = env.wet;
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0,
    // clearcoat doubles as the water film (see roadShader); only enabled on wet roads.
    clearcoat: wet ? 1 : 0,
    clearcoatRoughness: 0.05,
    normalMap: flatNormal,
    envMapIntensity: wet ? 1.15 : 0.7,
  });
  // The simple forward preset (phones) gets a lighter road shader: fewer fetches, no procedural damage.
  if (!quality.postFx) mat.defines = { ROAD_LITE: 1 };
  const dirs = lanes.dirs;
  const sep: number[] = [0, 0, 0, 0, 0, 0];
  for (let l = 1; l < lanes.lanes && l <= 6; l++) sep[l - 1] = lanes.layout === 'twoway' && dirs[l - 1] !== dirs[l] ? 2 : 1;
  const uniforms: Record<string, THREE.IUniform> = {
    tAsA: { value: fresh.map },
    tAsN: { value: fresh.normalMap },
    tAsR: { value: fresh.arm },
    tWoA: { value: worn.map },
    tWoN: { value: worn.normalMap },
    tWoR: { value: worn.arm },
    uTile: { value: new THREE.Vector2(fresh.sizeM, worn.sizeM) },
    uHalf: { value: pavedHalfWidth(lanes) },
    uLaneEdge: { value: (lanes.lanes * lanes.laneWidth) / 2 },
    uLaneW: { value: lanes.laneWidth },
    uLanes: { value: lanes.lanes },
    uOneWay: { value: lanes.layout === 'oneway' ? 1 : 0 },
    uSep: { value: sep },
    uWet: { value: wet ? 1 : 0 },
    uDetail: { value: quality.detailNormals ? 0.55 : 0 },
    uTint: { value: 1 },
    uBase: { value: new THREE.Color(1.0, 1.0, 1.0) },
    uTime: { value: 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    roadShader(shader);
  };
  mat.customProgramCacheKey = () => `road:${wet ? 'w' : 'd'}:${quality.detailNormals ? 1 : 0}:${quality.postFx ? 'f' : 'l'}`;
  mat.userData.surface = 'road';
  return mat;
}

function proceduralGround(env: EnvDef): THREE.MeshStandardMaterial {
  const gt = groundTexture(env.terrain);
  gt.repeat.set(1, 1);
  return new THREE.MeshStandardMaterial({ map: gt, vertexColors: true, roughness: 0.96, metalness: 0 });
}

function photoGround(o: SurfaceOptions, base: PBRSet, rock: PBRSet | null, gravel: PBRSet | null): THREE.MeshStandardMaterial {
  const { quality, env } = o;
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, metalness: 0, normalMap: base.normalMap });
  const snow = base.key === 'snow';
  const tint = snow ? new THREE.Color(1, 1, 1) : env.terrain === 'sand' ? new THREE.Color(1.0, 0.95, 0.9) : new THREE.Color(1, 1, 1);
  if (!quality.postFx) mat.defines = { TERRAIN_LITE: 1 };
  const uniforms: Record<string, THREE.IUniform> = {
    tGa: { value: base.map },
    tGr: { value: base.arm },
    tRa: { value: rock?.map ?? base.map },
    tRn: { value: rock?.normalMap ?? base.normalMap },
    tPa: { value: gravel?.map ?? base.map },
    tPn: { value: gravel?.normalMap ?? base.normalMap },
    uTileG: { value: base.sizeM },
    uTileR: { value: rock?.sizeM ?? 2.7 },
    uTileP: { value: gravel?.sizeM ?? 2 },
    uVcMix: { value: snow ? 0.15 : (env.world.groundMix ?? 0.55) },
    // Hue pull of the per-map ground colours (fields, steppe, moss…); snow stays white.
    uVcHue: { value: snow ? 0.1 : 0.72 },
    uBlend: { value: quality.terrainBlend && rock && gravel ? 1 : 0 },
    uGroundTint: { value: tint },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    terrainShader(shader);
  };
  mat.customProgramCacheKey = () => `terrain:${quality.terrainBlend && rock && gravel ? 1 : 0}:${quality.postFx ? 'f' : 'l'}`;
  mat.userData.surface = 'terrain';
  return mat;
}

function standardSet(set: PBRSet, repeat: number, opts: { color: string; metal: number; rough: number }): THREE.MeshStandardMaterial {
  const map = repeated(set.map, repeat, repeat);
  const nrm = repeated(set.normalMap, repeat, repeat);
  const arm = repeated(set.arm, repeat, repeat);
  const m = new THREE.MeshStandardMaterial({
    color: opts.color,
    map,
    normalMap: nrm,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: arm,
    aoMap: arm,
    roughness: opts.rough,
    metalness: opts.metal,
    side: THREE.DoubleSide,
  });
  if (opts.metal > 0) m.metalnessMap = arm;
  return m;
}

export function createSurfaces(o: SurfaceOptions): WorldSurfaces {
  const lib = o.library ?? defaultAssets;
  const tier = tierFor(o.quality);
  const fresh = lib.textureSet('asphalt_fresh', tier);
  const worn = lib.textureSet('asphalt_worn', tier);
  const gKey = groundKey(o.env);
  const ground = lib.textureSet(gKey, tier);
  const rock = lib.textureSet('rock', tier);
  const gravel = lib.textureSet('gravel', tier);
  const rail = lib.textureSet('guardrail', tier);
  const conc = lib.textureSet('concrete', tier);
  const photographic = !!(fresh && worn && ground);
  const owned: THREE.Material[] = [];
  const keep = <T extends THREE.Material>(m: T): T => {
    owned.push(m);
    return m;
  };

  const road = keep(photographic ? photoRoad(o, fresh!, worn!) : proceduralRoad(o));
  const terrain = keep(photographic ? photoGround(o, ground!, rock, gravel) : proceduralGround(o.env));
  const railMat = keep(
    rail
      ? standardSet(rail, 1 / rail.sizeM, { color: '#cfd4da', metal: 1, rough: 1 })
      : new THREE.MeshStandardMaterial({ color: '#b7bdc4', metalness: 0.85, roughness: 0.38, side: THREE.DoubleSide }),
  );
  const barrier = keep(
    conc
      ? standardSet(conc, 1 / conc.sizeM, { color: '#ffffff', metal: 0, rough: 1 })
      : new THREE.MeshStandardMaterial({ color: '#b9b6ae', roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
  );
  // The photo albedo is already a dark 0.27 and the barrier's road-side face sits in shade, so any tint on top of it
  // turned the whole median into a black band; lift it to the ~0.38 of weathered concrete instead.
  if (conc) barrier.color.setRGB(1.4, 1.4, 1.4);
  let building: THREE.MeshStandardMaterial | null = null;
  if (o.env.scenery.buildings) {
    const f = facadeTextures();
    const photoFacade = !o.env.scenery.lightsOn ? lib.textureSet(o.env.terrain === 'city' ? 'facade_city' : 'facade_industrial', tier) : null;
    if (photoFacade) {
      // Façade UVs: one unit = 8 windows wide (24.8 m) × 16 floors (54.4 m).
      building = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map: repeated(photoFacade.map, 24.8 / photoFacade.sizeM, 54.4 / photoFacade.sizeM),
        normalMap: repeated(photoFacade.normalMap, 24.8 / photoFacade.sizeM, 54.4 / photoFacade.sizeM),
        roughnessMap: repeated(photoFacade.arm, 24.8 / photoFacade.sizeM, 54.4 / photoFacade.sizeM),
        aoMap: repeated(photoFacade.arm, 24.8 / photoFacade.sizeM, 54.4 / photoFacade.sizeM),
        roughness: 1,
        metalness: 0.1,
      });
    } else {
      building = new THREE.MeshStandardMaterial({
        map: f.map,
        emissiveMap: f.emissive,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: o.env.scenery.lightsOn ? 1.4 : 0,
        roughness: 0.55,
        metalness: 0.25,
      });
    }
    keep(building);
  }
  return {
    road,
    terrain,
    rail: railMat,
    barrier,
    building,
    photographic,
    dispose() {
      // Cloned (repeat-adjusted) textures are per-material; the shared sources live in the asset cache.
      for (const m of owned) {
        const std = m as THREE.MeshStandardMaterial;
        for (const t of [std.map, std.normalMap, std.roughnessMap, std.aoMap, std.metalnessMap]) if (t?.userData.ownedClone) t.dispose();
        m.dispose();
      }
    },
  };
}
