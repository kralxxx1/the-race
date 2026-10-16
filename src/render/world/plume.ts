import * as THREE from 'three';
import { softGlow } from './glow';
import type { WorldUniforms } from './worldMaterials';

/**
 * Smoke and steam plumes for chimneys and cooling towers. One instanced "plume" is a stack of soft
 * billboards whose vertex shader lifts each puff along a wind-bent curve, grows it and fades it out, so a
 * whole factory district animates without any CPU work or per-frame allocation. Each instance's position seeds
 * its own phase so the plumes do not breathe in unison.
 */

export const PUFFS = 14;

/** Geometry: PUFFS quads, each carrying its index (0..1) in the `aPuff` attribute; `position.xy` is the corner. */
export function plumeGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const puff: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < PUFFS; i++) {
    const base = pos.length / 3;
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as const) {
      pos.push(x, y, 0);
      puff.push(i / PUFFS);
      uv.push(x + 0.5, y + 0.5);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPuff', new THREE.Float32BufferAttribute(puff, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // The plume rises up to `height` above its origin: give frustum culling a matching bound.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, 0), 90);
  return g;
}

export interface PlumeOptions {
  /** Colour of the smoke (steam is white, factory smoke grey-brown). */
  color: THREE.ColorRepresentation;
  /** Rise height in metres before the puff has faded out. */
  height: number;
  /** Puff size at the stack and at the end. */
  size: [number, number];
  /** How fast it rises, cycles per second. */
  speed: number;
  /** Peak opacity. */
  opacity: number;
  /** True at night: a faint orange under-glow from the plant's lights. */
  night: boolean;
}

export function plumeMaterial(u: WorldUniforms, o: PlumeOptions): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map: softGlow(), color: new THREE.Color(o.color), transparent: true, depthWrite: false, fog: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uWind = u.uWind;
    shader.uniforms.uPlume = { value: new THREE.Vector4(o.height, o.size[0], o.size[1], o.speed) };
    shader.uniforms.uPeak = { value: o.opacity };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPuff;\nuniform float uTime;\nuniform float uWind;\nuniform vec4 uPlume;\nvarying float vPA;')
      .replace(
        '#include <project_vertex>',
        `
vec3 ip = vec3(0.0);
#ifdef USE_INSTANCING
  ip = instanceMatrix[3].xyz;
#endif
float t = fract(aPuff + uTime * uPlume.w + fract(ip.x * 0.0173 + ip.z * 0.0291));
float sz = mix(uPlume.y, uPlume.z, t);
vec3 c = vec3((0.35 + uWind * 0.9) * t * t * uPlume.x * 0.8, t * uPlume.x, 0.0);
c.z += sin(uTime * 0.3 + aPuff * 20.0 + ip.x) * 0.6 * t * uPlume.y;
vec4 mvPosition = vec4(c, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
mvPosition.xy += position.xy * sz;
gl_Position = projectionMatrix * mvPosition;
vPA = smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.55, 1.0, t));
`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPA;\nuniform float uPeak;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vPA * uPeak;');
  };
  m.customProgramCacheKey = () => 'world-plume:v1';
  void o.night;
  return m;
}
