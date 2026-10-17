import * as THREE from 'three';
import { TEXTURE_SETS, assets, type PBRSet, type TextureKey } from '../assets';
import type { QualityProfile } from '../quality';
import { foliageRes, worldAssets, type FoliageKey } from './worldAssets';

/**
 * Materials of the roadside scenery. One WorldMaterials instance per run owns everything it creates
 * (materials and painted fallback textures); photographic textures belong to the shared asset caches.
 *
 * All materials read vertex colours, so geometry builders tint and bake ambient occlusion per vertex.
 */

/** Uniforms shared by every wind/snow-aware material of the world (updated once per frame). */
export interface WorldUniforms {
  uTime: THREE.IUniform<number>;
  /** Wind strength multiplier (0 calm .. 1 storm). */
  uWind: THREE.IUniform<number>;
  /** 0..1 snow lying on upward-facing leaves, roofs and banks. */
  uSnow: THREE.IUniform<number>;
  /** Alpha boost with distance so thin mipmapped leaves do not vanish. */
  uAlphaFade: THREE.IUniform<number>;
  /** 0..1 night: window/neon emissive drive. */
  uNight: THREE.IUniform<number>;
}

export function makeWorldUniforms(): WorldUniforms {
  return { uTime: { value: 0 }, uWind: { value: 0.35 }, uSnow: { value: 0 }, uAlphaFade: { value: 1.2 }, uNight: { value: 0 } };
}

const WIND_VERT_PARS = /* glsl */ `
attribute float aSway;
uniform float uTime;
uniform float uWind;
uniform float uSwayAmp;
`;

const WIND_VERT = /* glsl */ `
#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec3 wIp = instanceMatrix[3].xyz;
  #else
    vec3 wIp = vec3(0.0);
  #endif
  float wPh = dot(wIp.xz, vec2(0.23, 0.17));
  float wBend = sin(uTime * 1.05 + wPh) * 0.62 + sin(uTime * 2.1 + wPh * 1.9 + 1.3) * 0.38;
  float wFlut = sin(uTime * 5.2 + position.x * 3.7 + position.z * 2.9 + wPh * 3.0) * 0.5 + sin(uTime * 8.3 + position.y * 4.1 + wPh) * 0.5;
  float wAmt = uWind * uSwayAmp * aSway;
  transformed.x += (wBend * 0.9 + wFlut * 0.18) * wAmt;
  transformed.z += (wBend * 0.4 - wFlut * 0.12) * wAmt;
}
`;

const FOLIAGE_FRAG_PARS = /* glsl */ `
uniform float uSnow;
uniform float uAlphaFade;
uniform float uNight;
`;

// Leaves transmit and bounce a lot of light: a small self-lift of the (occlusion-baked) albedo keeps the
// shaded side of crowns green instead of black. It fades out at night so trees do not glow.
const FOLIAGE_FRAG_LIFT = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * mix(0.2, 0.012, uNight);
`;

const FOLIAGE_FRAG_ALPHA = /* glsl */ `
#include <map_fragment>
// Mipmapped leaf alpha thins out with distance: counter it so far trees keep their mass.
diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + uAlphaFade * smoothstep(40.0, 260.0, length(vViewPosition))));
`;

const FOLIAGE_FRAG_SNOW = /* glsl */ `
#include <color_fragment>
{
  vec3 wsn = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
  float wsTop = smoothstep(0.05, 0.62, wsn.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.97), uSnow * wsTop * 0.92);
}
`;

const SURFACE_FRAG_LIFT = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * mix(uLift, 0.0, uNight);
`;

/** Ambient-light lift for ordinary scenery surfaces: sunless façades keep some sky bounce (fades out at night). */
function patchSurface(shader: { uniforms: Record<string, THREE.IUniform>; fragmentShader: string }, u: WorldUniforms, o: { snow: boolean; lift: number }): void {
  shader.uniforms.uNight = u.uNight;
  shader.uniforms.uSnow = u.uSnow;
  shader.uniforms.uLift = { value: o.lift };
  let frag = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uNight;\nuniform float uSnow;\nuniform float uLift;`);
  if (o.snow) frag = frag.replace('#include <color_fragment>', FOLIAGE_FRAG_SNOW);
  frag = frag.replace('#include <emissivemap_fragment>', SURFACE_FRAG_LIFT);
  shader.fragmentShader = frag;
}

interface PatchOpts {
  sway: number;
  snow: boolean;
  alphaBoost: boolean;
}

function patchShader(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }, u: WorldUniforms, o: PatchOpts): void {
  shader.uniforms.uTime = u.uTime;
  shader.uniforms.uWind = u.uWind;
  shader.uniforms.uSnow = u.uSnow;
  shader.uniforms.uAlphaFade = u.uAlphaFade;
  shader.uniforms.uSwayAmp = { value: o.sway };
  shader.uniforms.uNight = u.uNight;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${WIND_VERT_PARS}`).replace('#include <begin_vertex>', WIND_VERT);
  let frag = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FOLIAGE_FRAG_PARS}`);
  if (o.alphaBoost) frag = frag.replace('#include <map_fragment>', FOLIAGE_FRAG_ALPHA);
  if (o.snow) frag = frag.replace('#include <color_fragment>', FOLIAGE_FRAG_SNOW);
  frag = frag.replace('#include <emissivemap_fragment>', FOLIAGE_FRAG_LIFT);
  // Cards are lit with painted soft normals: do not flip them on the back face.
  frag = frag.replace('normal *= faceDirection;', '');
  shader.fragmentShader = frag;
}

/** Paint a stand-in atlas (4×2 cells) when the photographic one is unavailable. */
function fallbackAtlas(key: FoliageKey): THREE.Texture {
  if (typeof document === 'undefined') {
    const t = new THREE.DataTexture(new Uint8Array([70, 100, 50, 255]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    t.userData.owned = true;
    return t;
  }
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const needles = key === 'fir' || key === 'pine';
  const base = key === 'olive' ? [112, 128, 92] : key === 'palm' ? [78, 120, 60] : needles ? [44, 78, 52] : [70, 118, 52];
  let seed = 17;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 8; i++) {
    const ox = (i % 4) * 128;
    const oy = Math.floor(i / 4) * 128;
    g.save();
    g.beginPath();
    g.rect(ox, oy, 128, 128);
    g.clip();
    g.translate(ox + 64, oy + 124);
    const n = needles ? 90 : 48;
    for (let k = 0; k < n; k++) {
      const a = (rnd() - 0.5) * (needles ? 2.2 : 3.0);
      const len = (needles ? 30 : 16) + rnd() * (needles ? 70 : 40);
      const sh = 0.7 + rnd() * 0.5;
      g.strokeStyle = `rgb(${base[0] * sh},${base[1] * sh},${base[2] * sh})`;
      g.fillStyle = g.strokeStyle;
      g.save();
      g.rotate(a);
      if (needles) {
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -len);
        g.stroke();
      } else {
        g.beginPath();
        g.ellipse(0, -len, 5, 11, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.owned = true;
  return t;
}

export interface PbrOptions {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  side?: THREE.Side;
}

/** Texture repeats per metre of a PBR set (so builders can use metric UVs). */
export function perMetre(set: PBRSet | null, fallback = 1): number {
  return set ? 1 / set.sizeM : fallback;
}

export class WorldMaterials {
  readonly uniforms = makeWorldUniforms();
  private owned: THREE.Material[] = [];
  private ownedTex: THREE.Texture[] = [];
  private foliageCache = new Map<string, THREE.MeshStandardMaterial>();
  private pbrCache = new Map<string, THREE.MeshStandardMaterial>();
  private plainCache = new Map<string, THREE.MeshStandardMaterial>();
  private glowCache = new Map<string, THREE.MeshBasicMaterial>();

  constructor(
    readonly quality: QualityProfile,
    /** True when snow can lie on the scenery (snow weather or the snow map). */
    readonly snowy = false,
  ) {}

  private keep<T extends THREE.Material>(m: T): T {
    this.owned.push(m);
    return m;
  }

  /** Cut-out foliage card material for an atlas (alpha test + wind sway + snow). */
  foliage(key: FoliageKey, opts: { sway?: number; shadow?: boolean } = {}): THREE.MeshStandardMaterial {
    const id = `${key}:${opts.sway ?? 0.4}`;
    const hit = this.foliageCache.get(id);
    if (hit) return hit;
    let map = worldAssets.foliage(key, foliageRes(this.quality));
    if (!map) {
      map = fallbackAtlas(key);
      this.ownedTex.push(map);
    }
    const sway = opts.sway ?? 0.4;
    const m = this.keep(
      new THREE.MeshStandardMaterial({
        map,
        vertexColors: true,
        alphaTest: 0.42,
        side: THREE.DoubleSide,
        roughness: 0.86,
        metalness: 0,
        envMapIntensity: 0.8,
        alphaToCoverage: this.quality.msaa > 0,
      }),
    );
    m.onBeforeCompile = (shader) => patchShader(shader, this.uniforms, { sway, snow: this.snowy, alphaBoost: true });
    m.customProgramCacheKey = () => `wfoliage:${this.snowy ? 's' : 'n'}:${sway}`;
    this.foliageCache.set(id, m);
    return m;
  }

  /** Photographic PBR material for a texture set (vertex-coloured, metric UVs expected). */
  pbr(key: TextureKey, o: PbrOptions = {}): THREE.MeshStandardMaterial {
    const id = `${key}:${o.color ?? ''}:${o.roughness ?? ''}:${o.metalness ?? ''}:${o.emissive ?? ''}:${o.emissiveIntensity ?? ''}:${o.side ?? 0}`;
    const hit = this.pbrCache.get(id);
    if (hit) return hit;
    const set = assets.textureSet(key, this.quality.textures);
    const m = this.keep(
      new THREE.MeshStandardMaterial({
        color: o.color ?? '#ffffff',
        vertexColors: true,
        map: set?.map ?? null,
        normalMap: set?.normalMap ?? null,
        normalScale: new THREE.Vector2(o.normalScale ?? 0.9, o.normalScale ?? 0.9),
        roughnessMap: set?.arm ?? null,
        aoMap: set?.arm ?? null,
        metalnessMap: set && (o.metalness ?? 0) > 0 ? set.arm : null,
        roughness: o.roughness ?? 1,
        metalness: o.metalness ?? 0,
        emissive: o.emissive ?? '#000000',
        emissiveIntensity: o.emissiveIntensity ?? 1,
        side: o.side ?? THREE.FrontSide,
      }),
    );
    m.onBeforeCompile = (shader) => patchSurface(shader, this.uniforms, { snow: this.snowy, lift: 0.14 });
    m.customProgramCacheKey = () => `wsurf:${this.snowy ? 's' : 'n'}:0.14`;
    this.pbrCache.set(id, m);
    return m;
  }

  /**
   * Tunnel lining: a photographic PBR set that is lit by the tunnel's own lamps rather than the sun. The surface
   * glows in proportion to its albedo, brightest under each luminaire row (`spacing` metres apart along the
   * road, taken from the v texture coordinate), so the walls stay readable while EnclosureFx dims the sun.
   */
  tunnel(key: TextureKey, o: PbrOptions & { spacing?: number; lit?: number } = {}): THREE.MeshStandardMaterial {
    const id = `tun:${key}:${o.spacing ?? 12}:${o.lit ?? 0.55}`;
    const hit = this.pbrCache.get(id);
    if (hit) return hit;
    const set = assets.textureSet(key, this.quality.textures);
    const size = TEXTURE_SETS[key].sizeM;
    const m = this.keep(
      new THREE.MeshStandardMaterial({
        color: o.color ?? '#ffffff',
        vertexColors: true,
        map: set?.map ?? null,
        normalMap: set?.normalMap ?? null,
        normalScale: new THREE.Vector2(0.7, 0.7),
        roughnessMap: set?.arm ?? null,
        aoMap: set?.arm ?? null,
        roughness: o.roughness ?? 0.6,
        metalness: 0,
        side: o.side ?? THREE.FrontSide,
      }),
    );
    const spacing = o.spacing ?? 12;
    const lit = o.lit ?? 0.55;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uSize = { value: size };
      shader.uniforms.uSpacing = { value: spacing };
      shader.uniforms.uTunLit = { value: lit };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vTunUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTunUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vTunUv;\nuniform float uSize;\nuniform float uSpacing;\nuniform float uTunLit;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
float tPh = vTunUv.y * uSize / uSpacing;
float tPool = 0.5 + 0.5 * pow(0.5 + 0.5 * cos(tPh * 6.2831853), 2.0);
totalEmissiveRadiance += diffuseColor.rgb * uTunLit * tPool;`,
        );
    };
    m.customProgramCacheKey = () => `wtunnel:${spacing}:${lit}`;
    this.pbrCache.set(id, m);
    return m;
  }

  /** Flat-coloured material (vertex colours only) for the parts that need no texture. */
  plain(o: { roughness?: number; metalness?: number; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; side?: THREE.Side; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
    const id = JSON.stringify(o);
    const hit = this.plainCache.get(id);
    if (hit) return hit;
    const m = this.keep(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: o.roughness ?? 0.8,
        metalness: o.metalness ?? 0,
        emissive: o.emissive ?? '#000000',
        emissiveIntensity: o.emissiveIntensity ?? 1,
        side: o.side ?? THREE.FrontSide,
        transparent: o.transparent ?? false,
        opacity: o.opacity ?? 1,
      }),
    );
    m.onBeforeCompile = (shader) => patchSurface(shader, this.uniforms, { snow: this.snowy, lift: 0.1 });
    m.customProgramCacheKey = () => `wsurf:${this.snowy ? 's' : 'n'}:0.1`;
    this.plainCache.set(id, m);
    return m;
  }

  /** Texture repeats per metre of a PBR set (metric UVs for the geometry builders). */
  uv(key: TextureKey): number {
    return 1 / TEXTURE_SETS[key].sizeM;
  }

  /** Dark glossy window glazing (vertex colours tint it). */
  glass(): THREE.MeshStandardMaterial {
    return this.plain({ roughness: 0.06, metalness: 0.35 });
  }

  /** Self-lit surface (lit windows, neon, signs): unaffected by lights, bright enough to bloom at night. */
  glowing(gain = 1.6): THREE.MeshBasicMaterial {
    const id = `glow:${gain}`;
    let m = this.glowCache.get(id);
    if (!m) {
      m = this.keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
      m.color.setScalar(gain);
      this.glowCache.set(id, m);
    }
    return m;
  }

  /** Track a material created elsewhere (map builders) so dispose() releases it. */
  adopt<T extends THREE.Material>(m: T): T {
    return this.keep(m);
  }

  /** Every material created or adopted for this run. */
  materials(out: Set<THREE.Material>): void {
    for (const m of this.owned) out.add(m);
  }

  adoptTexture<T extends THREE.Texture>(t: T): T {
    this.ownedTex.push(t);
    return t;
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }

  dispose(): void {
    for (const m of this.owned) m.dispose();
    for (const t of this.ownedTex) t.dispose();
    this.owned.length = 0;
    this.ownedTex.length = 0;
    this.foliageCache.clear();
    this.pbrCache.clear();
    this.plainCache.clear();
    this.glowCache.clear();
  }
}
