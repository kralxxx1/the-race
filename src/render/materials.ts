import * as THREE from 'three';
import { carbonTexture } from './textures';

/** Shared PBR material library. Materials are cached and reused by key. */
export class Materials {
  private cache = new Map<string, THREE.Material>();
  envMap: THREE.Texture | null = null;

  private get<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.cache.get(key) as T | undefined;
    if (!m) {
      m = make();
      this.cache.set(key, m);
    }
    return m;
  }

  /** Automotive paint: metallic flake base under a glossy clear coat. */
  paint(color: string, metallic = 0.45): THREE.MeshPhysicalMaterial {
    return this.get(`paint:${color}:${metallic}`, () => {
      const m = new THREE.MeshPhysicalMaterial({
        color,
        metalness: metallic,
        roughness: 0.38,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.1,
      });
      return m;
    });
  }

  /**
   * Paint for open shells (fairings seen from below/inside): the back faces render
   * as dark unpainted plastic, like the inside of a real fairing.
   */
  paintShell(color: string, metallic = 0.45, mirror = false): THREE.MeshPhysicalMaterial {
    return this.get(`paintShell:${color}:${metallic}:${mirror}`, () => {
      const m = mirror
        ? new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 })
        : new THREE.MeshPhysicalMaterial({ color, metalness: metallic, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 });
      m.side = THREE.DoubleSide;
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.025);',
        );
      };
      m.customProgramCacheKey = () => 'paintShell';
      return m;
    });
  }

  /** Mirror-like dark chrome (Kawasaki H2 style). */
  mirrorPaint(color: string): THREE.MeshPhysicalMaterial {
    return this.get(`mirror:${color}`, () =>
      new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 }),
    );
  }

  matte(color: string, roughness = 0.75): THREE.MeshStandardMaterial {
    return this.get(`matte:${color}:${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 }));
  }

  plastic(color = '#121316'): THREE.MeshStandardMaterial {
    return this.get(`plastic:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.0 }));
  }

  metal(color = '#b9bec5', roughness = 0.32): THREE.MeshStandardMaterial {
    return this.get(`metal:${color}:${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 1 }));
  }

  chrome(): THREE.MeshStandardMaterial {
    return this.get('chrome', () => new THREE.MeshStandardMaterial({ color: '#f2f4f7', roughness: 0.06, metalness: 1, envMapIntensity: 1.4 }));
  }

  titanium(): THREE.MeshStandardMaterial {
    return this.get('titanium', () => new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.28, metalness: 1 }));
  }

  gold(): THREE.MeshStandardMaterial {
    return this.get('gold', () => new THREE.MeshStandardMaterial({ color: '#c9962b', roughness: 0.25, metalness: 1 }));
  }

  carbon(): THREE.MeshPhysicalMaterial {
    return this.get('carbon', () =>
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: carbonTexture(), roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
    );
  }

  rubber(): THREE.MeshStandardMaterial {
    return this.get('rubber', () => new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92, metalness: 0 }));
  }

  leather(color: string): THREE.MeshStandardMaterial {
    return this.get(`leather:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 }));
  }

  /** Rider leathers: slightly glossy. */
  suit(color: string): THREE.MeshPhysicalMaterial {
    return this.get(`suit:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0.05, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') }));
  }

  helmet(color: string): THREE.MeshPhysicalMaterial {
    return this.get(`helmet:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 }));
  }

  visor(): THREE.MeshPhysicalMaterial {
    return this.get('visor', () =>
      new THREE.MeshPhysicalMaterial({ color: '#0b0d12', roughness: 0.04, metalness: 0.5, clearcoat: 1, envMapIntensity: 1.8, iridescence: 0.6, iridescenceIOR: 1.6 }),
    );
  }

  glass(tint = '#1c2430', opacity = 0.55): THREE.MeshPhysicalMaterial {
    return this.get(`glass:${tint}:${opacity}`, () =>
      new THREE.MeshPhysicalMaterial({
        color: tint,
        roughness: 0.03,
        metalness: 0.1,
        transparent: true,
        opacity,
        envMapIntensity: 1.6,
        depthWrite: false,
      }),
    );
  }

  /** Light-emitting lens; intensity can be animated per instance by cloning. */
  light(color: string, intensity: number): THREE.MeshStandardMaterial {
    return this.get(`light:${color}:${intensity}`, () => this.makeLight(color, intensity));
  }

  makeLight(color: string, intensity: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: '#111111',
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.2,
      metalness: 0,
    });
  }

  tyreTread(): THREE.MeshStandardMaterial {
    return this.rubber();
  }
}

// ───────────────────────────── bike kit slot materials ─────────────────────────────
//
// The procedural bikes merge hundreds of parts per material *slot* (see
// render/bike/sink.ts). Mechanical parts share the `hard` slot: colour comes from
// vertex colours and metalness / roughness / clear-coat / micro-surface from a
// per-vertex `pbr` attribute, so cast aluminium, anodised gold, chrome, rubber and
// gloss paint all render in one draw call. Painted bodywork projects the livery
// atlas in bike space (triplanar over five orthographic views) and adds metallic
// flake under a clear coat.

const NOISE_GLSL = /* glsl */ `
varying vec4 vPbr;
varying vec3 vLocal;
float kitHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float kitNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(kitHash(i), kitHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(kitHash(i + vec3(0.0, 1.0, 0.0)), kitHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(kitHash(i + vec3(0.0, 0.0, 1.0)), kitHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(kitHash(i + vec3(0.0, 1.0, 1.0)), kitHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float kitMicro(float kind, vec3 p) {
  if (kind < 0.5) return 0.0;
  if (kind < 1.5) return kitNoise(p * vec3(2600.0, 70.0, 70.0)) * 0.7 + kitNoise(p * vec3(70.0, 2600.0, 70.0)) * 0.3;
  if (kind < 2.5) return kitNoise(p * 900.0) * 0.55 + kitNoise(p * 2800.0) * 0.45;
  if (kind < 3.5) return kitNoise(p * 3200.0);
  if (kind < 4.5) {
    float a = sin((p.x + p.y + p.z) * 1900.0);
    float b = sin((p.x - p.y - p.z * 0.7) * 1900.0);
    return clamp(a * b * 0.5 + 0.5, 0.0, 1.0);
  }
  return kitNoise(p * 420.0) * 0.4;
}
vec3 kitBump(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = dFdx(surfPos);
  vec3 vSigmaY = dFdy(surfPos);
  vec3 R1 = cross(vSigmaY, surfNorm);
  vec3 R2 = cross(surfNorm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surfNorm - vGrad);
}
`;

function hookHard(sh: THREE.WebGLProgramParametersWithUniforms): void {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 pbr;\nvarying vec4 vPbr;\nvarying vec3 vLocal;')
    .replace('#include <color_vertex>', '#include <color_vertex>\n  vPbr = pbr;\n  vLocal = position;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
    .replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
  float kitH = kitMicro(vPbr.w, vLocal);
  float kitFade = 1.0 - smoothstep(0.00025, 0.0016, length(fwidth(vLocal)));
  metalnessFactor = vPbr.x;
  roughnessFactor = clamp(vPbr.y * (1.0 + (kitH - 0.5) * 0.35 * kitFade), 0.02, 1.0);`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
  if (vPbr.w > 0.5 && kitFade > 0.001) {
    float amp = vPbr.w < 1.5 ? 0.35 : vPbr.w < 2.5 ? 0.9 : vPbr.w < 3.5 ? 0.6 : vPbr.w < 4.5 ? 1.6 : 0.15;
    normal = kitBump(-vViewPosition, normal, vec2(dFdx(kitH), dFdy(kitH)) * amp * kitFade, faceDirection);
  }`,
    )
    .replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
  #ifdef USE_CLEARCOAT
  material.clearcoat = clamp(vPbr.z, 0.0, 1.0);
  #endif`,
    );
}

/** Shared material for the `hard` slot (vertex colour + per-vertex PBR + micro-surface). */
export function bikeHardMaterial(physical: boolean): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 1,
    clearcoat: physical ? 1 : 0,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (sh) => hookHard(sh);
  m.customProgramCacheKey = () => `bikeHard:${physical}`;
  return m;
}

/** Seat leather / alcantara: same per-vertex PBR path, plus a soft sheen. */
export function bikeSeatMaterial(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#5a5a5a'), side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => hookHard(sh);
  m.customProgramCacheKey = () => 'bikeSeat';
  return m;
}

export interface LiveryUniforms {
  map: THREE.Texture;
  finish: THREE.Texture;
  rects: THREE.Vector4[];
  box: { xmin: number; xmax: number; ymin: number; ymax: number; zmin: number; zmax: number };
  /** Atlas size in metres (rect units). */
  aw: number;
  ah: number;
}

/**
 * Livery-projected automotive paint: metallic flake base under a clear coat.
 * Back faces render as unpainted dark plastic (the inside of a fairing).
 */
export function bikePaintMaterial(lv: LiveryUniforms, flakes: boolean): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide, envMapIntensity: 1.1 });
  const uniforms = {
    lvMap: { value: lv.map },
    lvFin: { value: lv.finish },
    lvRects: { value: lv.rects },
    lvBoxMin: { value: new THREE.Vector3(lv.box.xmin, lv.box.ymin, lv.box.zmin) },
    lvBoxMax: { value: new THREE.Vector3(lv.box.xmax, lv.box.ymax, lv.box.zmax) },
    lvAtlas: { value: new THREE.Vector2(lv.aw, lv.ah) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bp;\nattribute vec3 bn;\nvarying vec3 vBp;\nvarying vec3 vBn;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vBp = bp;\n  vBn = bn;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBp;
varying vec3 vBn;
uniform sampler2D lvMap;
uniform sampler2D lvFin;
uniform vec4 lvRects[5];
uniform vec3 lvBoxMin;
uniform vec3 lvBoxMax;
uniform vec2 lvAtlas;
float lvHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec2 lvUv(int view, vec3 p) {
  vec4 r = lvRects[view];
  vec2 o = vec2(r.x, r.y);
  vec2 q;
  if (view == 0) q = vec2(lvBoxMax.z - p.z, lvBoxMax.y - p.y);
  else if (view == 1) q = vec2(p.z - lvBoxMin.z, lvBoxMax.y - p.y);
  else if (view == 2) q = vec2(lvBoxMax.z - p.z, p.x - lvBoxMin.x);
  else if (view == 3) q = vec2(lvBoxMax.x - p.x, lvBoxMax.y - p.y);
  else q = vec2(p.x - lvBoxMin.x, lvBoxMax.y - p.y);
  vec2 uv = o + q / lvAtlas;
  uv = clamp(uv, vec2(r.x, r.y) + 0.0005, vec2(r.z, r.w) - 0.0005);
  return vec2(uv.x, 1.0 - uv.y);
}
void lvSample(vec3 p, vec3 n, out vec3 col, out vec3 finish) {
  float k = 6.0;
  float under = pow(max(-n.y, 0.0), k);
  float wR = pow(max(n.x, 0.0), k) + under * step(0.0, p.x);
  float wL = pow(max(-n.x, 0.0), k) + under * (1.0 - step(0.0, p.x));
  float wT = pow(max(n.y, 0.0), k);
  float wF = pow(max(-n.z, 0.0), k);
  float wB = pow(max(n.z, 0.0), k);
  float s = wR + wL + wT + wF + wB + 1e-5;
  col = vec3(0.0);
  finish = vec3(0.0);
  if (wR > 0.001) { vec2 uv = lvUv(0, p); col += texture2D(lvMap, uv).rgb * wR; finish += texture2D(lvFin, uv).rgb * wR; }
  if (wL > 0.001) { vec2 uv = lvUv(1, p); col += texture2D(lvMap, uv).rgb * wL; finish += texture2D(lvFin, uv).rgb * wL; }
  if (wT > 0.001) { vec2 uv = lvUv(2, p); col += texture2D(lvMap, uv).rgb * wT; finish += texture2D(lvFin, uv).rgb * wT; }
  if (wF > 0.001) { vec2 uv = lvUv(3, p); col += texture2D(lvMap, uv).rgb * wF; finish += texture2D(lvFin, uv).rgb * wF; }
  if (wB > 0.001) { vec2 uv = lvUv(4, p); col += texture2D(lvMap, uv).rgb * wB; finish += texture2D(lvFin, uv).rgb * wB; }
  col /= s;
  finish /= s;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  vec3 lvCol;
  vec3 lvF;
  lvSample(vBp, normalize(vBn), lvCol, lvF);
  diffuseColor.rgb *= lvCol;
  if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.028);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
  metalnessFactor = gl_FrontFacing ? lvF.b : 0.0;
  roughnessFactor = gl_FrontFacing ? max(0.04, lvF.g) : 0.75;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  ${
    flakes
      ? `if (gl_FrontFacing && lvF.b > 0.25) {
    vec3 cell = floor(vBp * 2600.0);
    vec3 rnd = vec3(lvHash(cell), lvHash(cell + 17.3), lvHash(cell + 41.7)) - 0.5;
    float fade = 1.0 - smoothstep(0.0003, 0.0011, length(fwidth(vBp)));
    normal = normalize(normal + rnd * 0.55 * lvF.b * fade);
  }`
      : ''
  }`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
  material.clearcoat = gl_FrontFacing ? lvF.r : 0.0;`,
      );
  };
  m.customProgramCacheKey = () => `bikePaint:${flakes}`;
  return m;
}

/** Carbon fibre: triplanar 2×2 twill in bike space with weave bump under a clear coat. */
export function bikeCarbonMaterial(weave: THREE.Texture): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide });
  const uniforms = { cfMap: { value: weave } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bp;\nattribute vec3 bn;\nvarying vec3 vBp;\nvarying vec3 vBn;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vBp = bp;\n  vBn = bn;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBp;
varying vec3 vBn;
uniform sampler2D cfMap;
vec4 cfTri(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z + 1e-5);
  float s = 1.0 / 0.028;
  return texture2D(cfMap, p.zy * s) * w.x + texture2D(cfMap, p.xz * s) * w.y + texture2D(cfMap, p.xy * s) * w.z;
}`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\n  vec4 cf = cfTri(vBp, normalize(vBn));\n  diffuseColor.rgb *= cf.rgb * 1.6;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  float cfFade = 1.0 - smoothstep(0.0004, 0.002, length(fwidth(vBp)));
  {
    vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
    vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
    float det = dot(sx, r1) * faceDirection;
    vec3 grad = sign(det) * (dFdx(cf.a) * r1 + dFdy(cf.a) * r2) * 0.9 * cfFade;
    normal = normalize(abs(det) * normal - grad);
  }`,
      );
  };
  m.customProgramCacheKey = () => 'bikeCarbon';
  return m;
}

/** Tinted polycarbonate screen (double sided, no depth write). */
export function bikeScreenMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.6,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  });
}

/** Clear light lens / instrument glass. */
export function bikeLensMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.02,
    metalness: 0,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    envMapIntensity: 2.2,
    clearcoat: 1,
    clearcoatRoughness: 0.0,
  });
}

/** Light emitter (per bike instance so intensities can be animated). */
export function bikeEmitterMaterial(color: string, intensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#0d0d0d', emissive: color, emissiveIntensity: intensity, roughness: 0.25, metalness: 0 });
}

export function bikeMirrorMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#cdd3da', metalness: 1, roughness: 0.03, envMapIntensity: 1.6 });
}

export function bikeTyreMaterial(map: THREE.Texture, bump: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.4, roughness: 0.86, metalness: 0, envMapIntensity: 0.6 });
}

export function bikeDecalMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    alphaTest: 0.3,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    roughness: 0.4,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
}

export function bikeRadiatorMaterial(core: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: core, roughness: 0.55, metalness: 0.6, color: '#c8ccd2' });
}

export function bikePlateMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.45, metalness: 0.1 });
}
