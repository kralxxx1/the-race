import * as THREE from 'three';

/**
 * Materials of the instanced traffic fleet. Every body-part material reads its per-car look from
 * instance attributes, so one draw call renders all cars of a model:
 *   aStyle  (x metallic paint 0..1, y dirt 0..1, z/w spare)
 *   aLampA  (head, tail/brake, indicator L, indicator R)   aLampB (reverse, beacon A, beacon B, aux)
 * and the vertex attributes `pbr` (metalness, roughness) / `lampCh` (which lamp channel).
 */

type Shader = Parameters<NonNullable<THREE.Material['onBeforeCompile']>>[0];

const STYLE_VERT = /* glsl */ `
attribute vec4 aStyle;
varying vec4 vStyle;
varying float vObjY;
`;

const STYLE_BEGIN = /* glsl */ `
  vStyle = aStyle;
  vObjY = position.y;
`;

/** Dirt: road grime climbs the lower body (and darkens/roughens it). */
const DIRT_FRAG = /* glsl */ `
varying vec4 vStyle;
varying float vObjY;
float vehicleDirt() { return vStyle.y * (1.0 - smoothstep(0.12, 0.95, vObjY)); }
`;

function patch(sh: Shader, vertexExtra: string, begin: string, fragExtra: string, ...frag: [string, string][]): void {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + vertexExtra)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + begin);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + fragExtra);
  for (const [from, to] of frag) sh.fragmentShader = sh.fragmentShader.replace(from, to);
}

export function paintMaterial(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.045, envMapIntensity: 1.15 });
  m.onBeforeCompile = (sh) =>
    patch(sh, STYLE_VERT, STYLE_BEGIN, DIRT_FRAG,
      ['#include <color_fragment>', '#include <color_fragment>\n  float dirt = vehicleDirt();\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.17, 0.13), dirt * 0.5);'],
      ['#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix(0.03, 0.7, vStyle.x);\n  roughnessFactor = mix(0.36, 0.3, vStyle.x) + dirt * 0.45;'],
    );
  m.customProgramCacheKey = () => 'vehicle-paint';
  return m;
}

/** Vertex-coloured material with per-vertex metalness / roughness (trim, chrome, rubber, interior). */
export function detailMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, envMapIntensity: 1 });
  m.onBeforeCompile = (sh) =>
    patch(
      sh,
      STYLE_VERT + 'attribute vec2 pbr;\nvarying vec2 vPbr;',
      STYLE_BEGIN + '  vPbr = pbr;',
      DIRT_FRAG + 'varying vec2 vPbr;',
      ['#include <color_fragment>', '#include <color_fragment>\n  float dirt = vehicleDirt();\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.16, 0.12), dirt * 0.35);'],
      ['#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = vPbr.x * (1.0 - dirt * 0.5);\n  roughnessFactor = clamp(vPbr.y + dirt * 0.3, 0.03, 1.0);'],
    );
  m.customProgramCacheKey = () => 'vehicle-detail';
  return m;
}

/** Tinted glass: see-through so the cabin interior shows, with strong sky reflections. */
export function glassMaterial(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x0a1016,
    metalness: 0.0,
    roughness: 0.035,
    transparent: true,
    opacity: 0.55,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.4,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  m.onBeforeCompile = (sh) =>
    patch(sh, STYLE_VERT, STYLE_BEGIN, DIRT_FRAG,
      ['#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.19, 0.17), vehicleDirt() * 0.5);'],
    );
  m.customProgramCacheKey = () => 'vehicle-glass';
  return m;
}

/** Emissive lenses: the lamp channel of each vertex picks its intensity from the car's lamp state. */
export function lampMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.1, envMapIntensity: 1.3 });
  m.onBeforeCompile = (sh) =>
    patch(
      sh,
      'attribute float lampCh;\nattribute vec4 aLampA;\nattribute vec4 aLampB;\nvarying float vLamp;',
      '  int lci = int(lampCh + 0.5);\n  vLamp = lci < 4 ? aLampA[lci] : aLampB[lci - 4];',
      'varying float vLamp;',
      ['#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * vLamp;'],
    );
  m.customProgramCacheKey = () => 'vehicle-lamp';
  return m;
}

/** Wheels: tyre rubber, alloy / steel rims and discs in one vertex-coloured mesh. */
export function wheelMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, envMapIntensity: 1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 pbr;\nvarying vec2 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPbr = pbr;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPbr;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = vPbr.x;\n  roughnessFactor = vPbr.y;');
  };
  m.customProgramCacheKey = () => 'vehicle-wheel';
  return m;
}

export interface FleetMaterials {
  paint: THREE.MeshPhysicalMaterial;
  detail: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  lamp: THREE.MeshStandardMaterial;
  wheel: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function createFleetMaterials(): FleetMaterials {
  const paint = paintMaterial();
  const detail = detailMaterial();
  const glass = glassMaterial();
  const lamp = lampMaterial();
  const wheel = wheelMaterial();
  return {
    paint,
    detail,
    glass,
    lamp,
    wheel,
    dispose() {
      for (const m of [paint, detail, glass, lamp, wheel]) m.dispose();
    },
  };
}
