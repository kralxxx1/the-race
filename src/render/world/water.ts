import * as THREE from 'three';
import { clamp } from '../../core/math';
import type { ChunkBuild } from './scenery';
import { CHUNK_LENGTH } from './scenery';
import type { WorldUniforms } from './worldMaterials';

/**
 * Animated water for sea, rivers and harbours: a physically lit standard material (so the sun
 * glitter and sky reflections follow the scene's lighting, fog and tone mapping) whose vertex
 * shader sums travelling waves and whose fragment shader perturbs the normal with the analytic wave
 * slope plus two scrolling noise layers. Shallow water fades to transparent turquoise, shorelines
 * and crests get foam. Geometry carries the water depth per vertex (level minus terrain height), so the
 * shader needs no depth texture.
 */

export interface WaterOptions {
  shallow: THREE.ColorRepresentation;
  deep: THREE.ColorRepresentation;
  /** Wave height multiplier (sea ~1, river ~0.15). */
  waveAmp: number;
  /** Surface choppiness / normal detail strength. */
  chop: number;
  /** Shoreline/crest foam amount 0..1. */
  foam: number;
  /** Flow speed of the detail layers (river faster). */
  flow: number;
  /** Depth in metres at which colour is fully deep. */
  deepAt: number;
}

const VERT_PARS = /* glsl */ `
attribute float aDepth;
varying float vDepth;
varying vec2 vWUv;
varying float vCrest;
uniform float uTime;
uniform float uWaveAmp;
uniform float uFlow;

// Four travelling waves in road space (metres): direction, wavelength, amplitude, speed.
const vec4 W0 = vec4(0.82, 0.57, 38.0, 0.32);
const vec4 W1 = vec4(-0.31, 0.95, 21.0, 0.22);
const vec4 W2 = vec4(0.94, -0.34, 12.0, 0.16);
const vec4 W3 = vec4(0.12, 0.99, 6.5, 0.1);
vec3 waveAt(vec2 p, float t, out float crest) {
  float h = 0.0; vec2 g = vec2(0.0);
  vec4 ws[4]; ws[0] = W0; ws[1] = W1; ws[2] = W2; ws[3] = W3;
  float amps[4]; amps[0] = 0.55; amps[1] = 0.32; amps[2] = 0.17; amps[3] = 0.08;
  for (int i = 0; i < 4; i++) {
    vec2 d = normalize(ws[i].xy);
    float k = 6.2831853 / ws[i].z;
    float ph = dot(d, p) * k + t * ws[i].w * 6.2831853 * 0.5 * uFlow;
    float s = sin(ph);
    h += amps[i] * s;
    g += amps[i] * k * cos(ph) * d;
  }
  crest = h;
  return vec3(h * uWaveAmp, g * uWaveAmp);
}
`;

const VERT_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
{
  float wc;
  vec3 wv = waveAt(uv, uTime, wc);
  // Shallow water barely moves: damp the waves towards the shore.
  float damp = smoothstep(0.0, 3.0, aDepth);
  // Road space: u = lateral (world +x), v = distance (world -z), so d(h)/dz = -d(h)/dv.
  objectNormal = normalize(vec3(-wv.y * damp, 1.0, wv.z * damp));
}
`;

const VERT_POS = /* glsl */ `
#include <begin_vertex>
{
  float wc;
  vec3 wv = waveAt(uv, uTime, wc);
  float damp = smoothstep(0.0, 3.0, aDepth);
  transformed.y += wv.x * damp;
  vDepth = aDepth;
  vWUv = uv;
  vCrest = wc * damp;
}
`;

const FRAG_PARS = /* glsl */ `
varying float vDepth;
varying vec2 vWUv;
varying float vCrest;
uniform float uTime;
uniform float uChop;
uniform float uFoam;
uniform float uFlow;
uniform float uDeepAt;
uniform vec3 uShallow;
uniform vec3 uDeep;
float wH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wN(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wH(i), wH(i + vec2(1.0, 0.0)), f.x), mix(wH(i + vec2(0.0, 1.0)), wH(i + vec2(1.0, 1.0)), f.x), f.y);
}
float wF(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * wN(p); p = p * 2.07 + 5.3; a *= 0.5; } return s; }
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
{
  float dd = clamp(vDepth / uDeepAt, 0.0, 1.0);
  vec3 wc = mix(uShallow, uDeep, pow(dd, 0.6));
  // Foam: a band at the shoreline that wobbles with the waves, plus whitecaps on the crests.
  float t = uTime * uFlow;
  float n = wF(vWUv * 0.35 + vec2(t * 0.05, -t * 0.03));
  float shore = (1.0 - smoothstep(0.0, 1.6, vDepth + (n - 0.5) * 1.2 + sin(vWUv.y * 0.3 + t * 0.8) * 0.25)) * uFoam;
  float cap = smoothstep(0.62, 0.95, vCrest + (n - 0.5) * 0.5) * 0.55 * uFoam;
  float foam = clamp(shore + cap, 0.0, 1.0) * smoothstep(0.35, 0.65, wF(vWUv * 1.7 + vec2(-t * 0.1, t * 0.07)));
  diffuseColor.rgb = mix(wc, vec3(0.92, 0.96, 0.98), foam);
  diffuseColor.a = clamp(0.28 + vDepth * 0.45, 0.0, 0.96) * (1.0 - foam * 0.15) + foam * 0.5;
}
`;

const FRAG_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
{
  float t = uTime * uFlow;
  vec2 q = vWUv;
  float a = wF(q * 0.9 + vec2(t * 0.22, t * 0.1));
  float b = wF(q * 1.9 + vec2(-t * 0.17, t * 0.26));
  vec2 gdet = vec2(wF(q * 0.9 + vec2(t * 0.22 + 0.07, t * 0.1)) - a, wF(q * 0.9 + vec2(t * 0.22, t * 0.1 + 0.07)) - a);
  vec2 gdet2 = vec2(wF(q * 1.9 + vec2(-t * 0.17 + 0.05, t * 0.26)) - b, wF(q * 1.9 + vec2(-t * 0.17, t * 0.26 + 0.05)) - b);
  // Detail slopes tilt the normal; they fade with distance so the far sea stays calm and cheap to shade.
  float fade = 1.0 - smoothstep(40.0, 170.0, length(vViewPosition));
  vec3 gwld = vec3(-(gdet.x + gdet2.x), 0.0, (gdet.y + gdet2.y)) * 3.2 * uChop * fade;
  normal = normalize(normal + (viewMatrix * vec4(gwld, 0.0)).xyz);
}
`;

export function createWaterMaterial(u: WorldUniforms, o: WaterOptions): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.1,
    metalness: 0.0,
    transparent: true,
    depthWrite: false,
    envMapIntensity: 1.2,
  });
  const shallow = new THREE.Color(o.shallow);
  const deep = new THREE.Color(o.deep);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uWaveAmp = { value: o.waveAmp };
    shader.uniforms.uChop = { value: o.chop };
    shader.uniforms.uFoam = { value: o.foam };
    shader.uniforms.uFlow = { value: o.flow };
    shader.uniforms.uDeepAt = { value: o.deepAt };
    shader.uniforms.uShallow = { value: shallow };
    shader.uniforms.uDeep = { value: deep };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', VERT_NORMAL)
      .replace('#include <begin_vertex>', VERT_POS);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL);
  };
  m.customProgramCacheKey = () => 'world-water:v1';
  m.userData.surface = 'water';
  return m;
}

export interface WaterStripOptions {
  /** Which side of the road the water lies on (±1). */
  side: 1 | -1;
  /** Water surface height in world y (constant, or a function of road distance for rivers). */
  level: number | ((s: number) => number);
  /** Lateral offsets (metres beyond the paved edge) of the strip: nearest and farthest columns. */
  offNear: number;
  offFar: number;
  /** Column offsets between near and far (denser near the shore). */
  columns?: readonly number[];
  /** Terrain height lookup (world y) at road distance s and signed lateral d. */
  ground: (s: number, d: number) => number;
  /** Row spacing along the road. */
  step?: number;
}

const DEFAULT_COLUMNS = [0, 6, 14, 26, 45, 80, 140, 260, 500, 1000, 2000];

/**
 * Water mesh for one chunk, in road space so waves line up across chunk borders and origin re-bases:
 * uv holds (s, d) in metres, `aDepth` the water depth at the vertex (clamped at 0 on land).
 * Vertices on dry land are pushed below the terrain so only wet parts show.
 */
export function waterStrip(ctx: ChunkBuild, o: WaterStripOptions): THREE.BufferGeometry | null {
  const step = o.step ?? 8;
  const rows = Math.max(1, Math.round(CHUNK_LENGTH / step));
  const cols = (o.columns ?? DEFAULT_COLUMNS.map((c) => c + o.offNear)).filter((c) => c <= o.offFar);
  const nC = cols.length;
  const pos = new Float32Array((rows + 1) * nC * 3);
  const uv = new Float32Array((rows + 1) * nC * 2);
  const depth = new Float32Array((rows + 1) * nC);
  const half = ctx.host.half;
  let wet = false;
  const tmp = new THREE.Vector3();
  for (let r = 0; r <= rows; r++) {
    const s = ctx.s0 + (r / rows) * CHUNK_LENGTH;
    for (let c = 0; c < nC; c++) {
      const d = o.side * (half + cols[c]);
      ctx.local(s, d, 0, tmp);
      const g = o.ground(s, d);
      const lv = typeof o.level === 'number' ? o.level : o.level(s);
      const dep = lv - g;
      if (dep > 0) wet = true;
      const i = r * nC + c;
      pos[i * 3] = tmp.x;
      pos[i * 3 + 1] = ctx.localY(lv);
      pos[i * 3 + 2] = tmp.z;
      uv[i * 2] = d;
      uv[i * 2 + 1] = s % 20000;
      depth[i] = clamp(dep, 0, 60);
    }
  }
  if (!wet) return null;
  const idx: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < nC - 1; c++) {
      const a = r * nC + c;
      const b = a + 1;
      const d = a + nC;
      const e = d + 1;
      // Skip quads that are entirely on land.
      if (depth[a] <= 0 && depth[b] <= 0 && depth[d] <= 0 && depth[e] <= 0) continue;
      // Up-facing winding: lateral axis +d to the right on the right side (side=+1).
      if (o.side > 0) idx.push(a, b, d, b, e, d);
      else idx.push(a, d, b, b, d, e);
    }
  }
  if (idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
