import * as THREE from 'three';
import { Rng, noise2 } from '../../core/math';
import { rgb, type RGB } from './kit';

/**
 * Procedural boulders and rock faces: noise-displaced, flattened icospheres with strata-like
 * vertex colour banding. UVs are metric box projections (texture repeats per metre), so a photographic
 * rock set wraps them without stretching.
 */

export interface RockOptions {
  seed: number;
  radius: number;
  /** Icosphere detail (1 = 80 faces, 2 = 320). */
  detail: number;
  /** Squash on y (0.5 = flat slab, 1 = round). */
  flat: number;
  /** Displacement strength relative to the radius. */
  rough: number;
  /** Horizontal elongation (x) relative to z. */
  stretch?: number;
  base: RGB | string;
  /** Strata band tint amount (sedimentary look). */
  strata?: number;
  uvPerM: number;
  /** Planar facets (angular rock) instead of smooth noise. */
  angular?: boolean;
}

export function buildRock(o: RockOptions): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, o.detail);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const rng = new Rng(o.seed * 977 + 13);
  const ox = rng.range(0, 100);
  const oz = rng.range(0, 100);
  const base = typeof o.base === 'string' ? rgb(o.base) : o.base;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    // Two octaves of noise on the unit sphere give lumps; the angular option quantises the radius for facets.
    let n = noise2(v.x * 1.6 + ox, v.y * 1.6 + v.z * 1.3 + oz, o.seed) * 0.6 + noise2(v.x * 3.7 + oz, v.z * 3.9 + ox, o.seed + 5) * 0.3;
    if (o.angular) n = Math.round(n * 5) / 5;
    const r = 1 + n * o.rough;
    v.multiplyScalar(r * o.radius);
    v.x *= o.stretch ?? 1;
    v.y *= o.flat;
    // Flatten the underside so rocks sit on the ground instead of floating.
    if (v.y < -o.radius * o.flat * 0.35) v.y = -o.radius * o.flat * 0.35;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // Non-indexed so each triangle can take a box-projected UV without seams smearing.
  const ng = g.toNonIndexed();
  g.dispose();
  const pos = ng.getAttribute('position') as THREE.BufferAttribute;
  const nor = ng.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    // Projection axis per triangle from its face normal.
    const nx = Math.abs(nor.getX(i) + nor.getX(i + 1) + nor.getX(i + 2));
    const ny = Math.abs(nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2));
    const nz = Math.abs(nor.getZ(i) + nor.getZ(i + 1) + nor.getZ(i + 2));
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k);
      const y = pos.getY(i + k);
      const z = pos.getZ(i + k);
      let u: number;
      let w: number;
      if (ny >= nx && ny >= nz) {
        u = x;
        w = z;
      } else if (nx >= nz) {
        u = z;
        w = y;
      } else {
        u = x;
        w = y;
      }
      uv[(i + k) * 2] = u * o.uvPerM;
      uv[(i + k) * 2 + 1] = w * o.uvPerM;
      // Strata: horizontal colour bands plus a darker underside (baked occlusion).
      const band = o.strata ? 1 + o.strata * (noise2(y * 2.2, 3.1, o.seed) * 0.5 + 0.1 * Math.sin(y * 9)) : 1;
      const low = 0.62 + 0.38 * Math.min(1, Math.max(0, (y / (o.radius * o.flat) + 0.4) / 1.2));
      col[(i + k) * 3] = base[0] * band * low;
      col[(i + k) * 3 + 1] = base[1] * band * low;
      col[(i + k) * 3 + 2] = base[2] * band * low;
    }
  }
  ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ng.computeBoundingSphere();
  ng.computeBoundingBox();
  return ng;
}
