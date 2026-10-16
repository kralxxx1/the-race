import * as THREE from 'three';
import { Rng, noise2, smoothstep } from '../../core/math';
import { rgb, type RGB } from './kit';

/**
 * Steppe buttes and mesas: a stack of eroded rings (talus apron, banded cliff, flat cap) with
 * vertical gullies and sedimentary colour bands. Origin at the base centre, unit-ish size (radius 1 at the
 * foot, height 1): scale per instance. UVs wrap the surface in metres of the unit shape (callers scale uvPerM).
 */

export interface MesaOptions {
  seed: number;
  /** Radial segments around the butte. */
  segments?: number;
  /** Height relative to the foot radius. */
  tall: number;
  /** Colour bands from the foot to the cap. */
  bands: readonly RGB[];
  /** Cap tint (dark caprock or pale sandstone). */
  cap: RGB;
  uvPerM: number;
}

export function buildMesa(o: MesaOptions): THREE.BufferGeometry {
  const seg = o.segments ?? 28;
  const rng = new Rng(o.seed * 733 + 5);
  const ox = rng.range(0, 50);
  // Ring profile: (radius factor, height factor): talus apron, steep cliff with a ledge, rounded shoulder, flat cap.
  const prof: [number, number][] = [
    [1.55, 0.0],
    [1.2, 0.04],
    [0.98, 0.11],
    [0.78, 0.22],
    [0.64, 0.32],
    [0.62, 0.46],
    [0.66, 0.51],
    [0.56, 0.68],
    [0.54, 0.84],
    [0.5, 0.95],
    [0.42, 1.0],
    [0.0, 1.0],
  ];
  const rings = prof.length;
  const pos = new Float32Array(rings * (seg + 1) * 3);
  const col = new Float32Array(rings * (seg + 1) * 3);
  const uv = new Float32Array(rings * (seg + 1) * 2);
  for (let r = 0; r < rings; r++) {
    const [rf, hf] = prof[r];
    for (let j = 0; j <= seg; j++) {
      const a = ((j % seg) / seg) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Irregular outline plus gullies that are deepest on the cliff rings.
      const outline = 1 + 0.28 * (noise2(ca * 1.6 + ox, sa * 1.6, o.seed) * 2 - 1) + 0.1 * (noise2(ca * 4.2 + ox, sa * 4.2, o.seed + 3) * 2 - 1);
      const cliff = smoothstep(0.1, 0.3, hf) * (1 - smoothstep(0.92, 1.0, hf));
      const gully = 1 - cliff * 0.16 * (0.5 + 0.5 * Math.sin(a * 11 + noise2(ca * 3, sa * 3, o.seed + 9) * 6));
      const R = rf * outline * gully;
      const y = hf * o.tall + (r > 0 && r < rings - 2 ? noise2(ca * 2.4 + ox, hf * 5, o.seed + 2) * 0.05 * o.tall : 0);
      const i = r * (seg + 1) + j;
      pos[i * 3] = ca * R;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = sa * R;
      uv[i * 2] = a * (rf + 0.4) * o.uvPerM * 1.2;
      uv[i * 2 + 1] = y * o.uvPerM;
      // Colour: foot dust, banded strata, dark cap.
      const bandF = Math.min(0.999, hf * o.bands.length + (noise2(a * 2.2, hf * 7, o.seed + 4) - 0.5) * 0.6);
      const bi = Math.max(0, Math.floor(bandF));
      const c = o.bands[Math.min(o.bands.length - 1, bi)];
      const dusty = 1 - smoothstep(0.0, 0.22, hf);
      const shade = 0.78 + 0.22 * noise2(a * 3 + ox, hf * 11, o.seed + 6) + 0.1 * Math.sin(hf * 40);
      const capK = smoothstep(0.96, 1.0, hf);
      col[i * 3] = (c[0] * (1 - capK) + o.cap[0] * capK) * shade * (1 - 0.1 * dusty) + 0.05 * dusty;
      col[i * 3 + 1] = (c[1] * (1 - capK) + o.cap[1] * capK) * shade * (1 - 0.1 * dusty) + 0.04 * dusty;
      col[i * 3 + 2] = (c[2] * (1 - capK) + o.cap[2] * capK) * shade * (1 - 0.1 * dusty);
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rings - 1; r++) {
    for (let j = 0; j < seg; j++) {
      const a = r * (seg + 1) + j;
      const b = a + 1;
      const c = a + seg + 1;
      const d = c + 1;
      // Outward-facing, upward-going rings: (a, c, b) / (b, c, d).
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Strata palettes for the steppe: ochre, terracotta, cream. */
export const MESA_BANDS: RGB[] = [rgb('#7a4a36'), rgb('#a8643f'), rgb('#c98a56'), rgb('#b5714a'), rgb('#d8a874'), rgb('#9b5a3b')];
export const MESA_CAP: RGB = rgb('#6d4634');
