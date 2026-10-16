import * as THREE from 'three';
import { GeoBuilder, mix, mul, rgb, type RGB } from './kit';
import { highwaySignTexture, type SignDest } from './signs';
import type { ChunkBuild } from './scenery';

/** Shared colours of road furniture. */
export const STEEL: RGB = rgb('#8d949b');
export const STEEL_DARK: RGB = rgb('#4b5258');
export const GALVANISED: RGB = rgb('#aab2b8');
export const CONCRETE: RGB = rgb('#b9b6ae');
export const WHITE: RGB = rgb('#e8e8e4');

/** Free-standing signpost with a sign panel: used as an extra mesh (own texture). */
export function signPanel(ctx: ChunkBuild, tex: THREE.Texture, s: number, d: number, w: number, h: number, up: number, yawExtra: number, opts: { emissive?: number } = {}): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.55,
    metalness: 0,
    // Retro-reflective sheeting glows in headlights: a small emissive lift at night.
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: tex,
    emissiveIntensity: opts.emissive ?? (ctx.host.env.scenery.lightsOn ? 0.5 : 0.04),
    side: THREE.FrontSide,
  });
  mat.userData.owned = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const p = ctx.local(s, d, up);
  mesh.position.copy(p);
  mesh.rotation.y = ctx.yaw(s) + yawExtra;
  // PlaneGeometry faces +z: with yaw 0 that is toward the rider (road forward is −z).
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  ctx.chunk.group.add(mesh);
  ctx.chunk.extras.push(mesh);
  return mesh;
}

/** Overhead sign gantry across the whole carriageway with guide signs facing the rider. */
export function gantry(ctx: ChunkBuild, s: number, panels: SignDest[][], route: string, opts: { lit?: boolean } = {}): void {
  const half = ctx.host.half;
  const span = half * 2 + 3.2;
  const b = ctx.stat('steel');
  ctx.frame(b, s, 0, 0, 0);
  // Beam height: 5.6 m clearance under the lower chord.
  const yb = 5.9;
  const col = (x: number) => {
    b.frustum(x, -0.6, 0, 0.3, 0.22, yb + 1.6, 8, { color: GALVANISED }, true);
    b.box(x, -0.55, 0, 0.9, 0.18, 0.9, { color: STEEL_DARK }, 8);
  };
  col(-span / 2);
  col(span / 2);
  // Truss: upper and lower chords with diagonals.
  b.box(0, yb + 0.55, 0, span + 0.8, 0.14, 0.14, { color: GALVANISED });
  b.box(0, yb - 0.45, 0, span + 0.8, 0.14, 0.14, { color: GALVANISED });
  const step = 2.0;
  const n = Math.floor((span + 0.8) / step);
  for (let i = 0; i < n; i++) {
    const x0 = -span / 2 - 0.4 + i * step;
    const x1 = x0 + step;
    const up = i % 2 === 0;
    b.limb([x0, up ? yb - 0.45 : yb + 0.55, 0], [x1, up ? yb + 0.55 : yb - 0.45, 0], 0.045, 0.045, 4, { color: GALVANISED });
    b.box(x0, yb + 0.05, 0, 0.09, 1.1, 0.09, { color: GALVANISED });
  }
  // Walkway grating and sign brackets.
  b.box(0, yb + 0.62, -0.5, span + 0.8, 0.05, 0.9, { color: STEEL_DARK });
  b.pop();
  // Sign faces: hung under the upper chord, spread over the span.
  const count = panels.length;
  const w = Math.min(7.4, (span - 1) / count - 0.3);
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * (w + 0.3);
    const tex = highwaySignTexture(panels[i], route);
    const aspect = 3.2;
    signPanel(ctx, tex, s, x, w, w / aspect, yb + 0.05, 0, { emissive: opts.lit ? 0.45 : 0.06 });
    // Hanging brackets.
    const b2 = ctx.stat('steel');
    ctx.frame(b2, s, 0, 0, 0);
    for (const dx of [-w * 0.35, w * 0.35]) b2.box(x + dx, yb + 0.35, 0.05, 0.08, 0.5, 0.08, { color: STEEL_DARK });
    b2.pop();
  }
}

/** Kilometre marker post (white plate with a coloured band) beside the guardrail. */
export function kmPost(ctx: ChunkBuild, s: number, side: 1 | -1): void {
  const b = ctx.stat('steel');
  ctx.frame(b, s, side * (ctx.host.half + 1.3), 0);
  b.frustum(0, 0, 0, 0.035, 0.035, 1.1, 6, { color: GALVANISED });
  b.box(0, 1.0, 0, 0.42, 0.34, 0.03, { color: WHITE });
  b.box(0, 0.88, 0.016, 0.42, 0.05, 0.005, { color: rgb('#c0392b') });
  b.pop();
}

export function colorOf(c: THREE.ColorRepresentation): RGB {
  return rgb(c);
}

export { mix, mul };
export type { GeoBuilder };
