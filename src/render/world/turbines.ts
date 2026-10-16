import * as THREE from 'three';
import { GeoBuilder, rgb } from './kit';
import type { WorldUniforms } from './worldMaterials';

/**
 * Wind turbines for ridgelines (Aegean and Konya wind farms): a static tower+nacelle prop and a
 * separate rotor prop whose vertex shader spins the blades about the hub, each turbine at its own
 * phase and speed. The rotor mesh is instanced like everything else, so a whole farm costs two draws.
 */

export const TURBINE_HUB: [number, number, number] = [0, 62, -3.2];

export function turbineTowerGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const white = rgb('#e9ecef');
  b.frustum(0, 0, 0, 2.1, 1.25, 60, 12, { color: white }, false);
  b.frustum(0, -2, 0, 2.6, 2.3, 2.2, 12, { color: rgb('#8a8f94') }, true);
  b.box(0, 61.3, -0.6, 2.8, 2.9, 7.4, { color: white });
  b.box(0, 62.8, 1.5, 1.8, 0.5, 2.2, { color: rgb('#c4c9cd') });
  b.frustum(0, 61.0, -4.0, 1.25, 1.25, 0.1, 10, { color: white });
  return b.build();
}

/** Three tapered blades in the hub's xy-plane (hub at TURBINE_HUB); the shader rotates them about +z. */
export function turbineRotorGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const white = rgb('#f1f3f4');
  const [hx, hy, hz] = TURBINE_HUB;
  b.push(hx, hy, hz - 0.4);
  b.frustum(0, 0, 0, 1.15, 0.8, 2.6, 10, { color: white }, true);
  b.pop();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.push(hx, hy, hz, 0, 0, a);
    // Blade: wide chord near the root tapering to a pointed tip (two boxes + a tapered limb stand in for the aerofoil).
    b.limb([0, 1.0, 0], [0, 38, 0], 0.55, 0.12, 6, { color: white });
    b.box(0.28, 12, 0.05, 1.5, 22, 0.14, { color: white });
    b.pop();
  }
  return b.build();
}

export function rotorMaterial(u: WorldUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide });
  const hub = new THREE.Vector3(TURBINE_HUB[0], TURBINE_HUB[1], TURBINE_HUB[2]);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uHub = { value: hub };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uHub;')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
{
  #ifdef USE_INSTANCING
    vec3 ip = instanceMatrix[3].xyz;
  #else
    vec3 ip = vec3(0.0);
  #endif
  float ang = uTime * (0.55 + fract(ip.x * 0.013 + ip.z * 0.007) * 0.25) + ip.x * 0.37 + ip.z * 0.21;
  float ca = cos(ang); float sa = sin(ang);
  objectNormal = vec3(ca * objectNormal.x - sa * objectNormal.y, sa * objectNormal.x + ca * objectNormal.y, objectNormal.z);
}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec3 ip2 = instanceMatrix[3].xyz;
  #else
    vec3 ip2 = vec3(0.0);
  #endif
  float ang2 = uTime * (0.55 + fract(ip2.x * 0.013 + ip2.z * 0.007) * 0.25) + ip2.x * 0.37 + ip2.z * 0.21;
  float c2 = cos(ang2); float s2 = sin(ang2);
  vec2 q = transformed.xy - uHub.xy;
  transformed.x = uHub.x + c2 * q.x - s2 * q.y;
  transformed.y = uHub.y + s2 * q.x + c2 * q.y;
}`,
      );
  };
  m.customProgramCacheKey = () => 'world-rotor:v1';
  return m;
}
