import * as THREE from 'three';
import { latheX } from '../geom';
import { Mesher, mat } from './kit';

/**
 * Unit wheels (radius 1, width 1, axle along X) for instancing: scaled per wheel to (width, r, r).
 * Tyre, rim, brake disc and caliper share one vertex-coloured mesh with per-vertex metalness /
 * roughness, so a whole fleet's wheels are a single draw call per wheel type.
 */
export type WheelType = 'car' | 'truck' | 'far';

const cache = new Map<WheelType, THREE.BufferGeometry>();

const RUBBER = '#101112';

export function wheelGeometry(type: WheelType): THREE.BufferGeometry {
  let g = cache.get(type);
  if (!g) {
    g = buildWheel(type);
    cache.set(type, g);
  }
  return g;
}

type Profile = [number, number][];

/**
 * Lathe a profile written for the +x side (traversed so the surface normal (dy, −dx) points out of
 * the solid) onto side `s`: the −x copy is mirrored and reversed so its normals stay outward too.
 */
function side(pts: Profile, s: 1 | -1, segments: number): THREE.BufferGeometry {
  const p: Profile = s === 1 ? pts : pts.map(([r, x]) => [r, -x] as [number, number]).reverse();
  return latheX(p, segments);
}

function spokes(m: Mesher, n: number, rIn: number, rOut: number, x: number, thick: number, wIn: number, wOut: number, color: string, metal: number, rough: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // Tapered spoke in the XY plane (x radial, y tangential), extruded along the axle.
    const shape = new THREE.Shape();
    shape.moveTo(rIn, -wIn / 2);
    shape.lineTo(rOut, -wOut / 2);
    shape.lineTo(rOut, wOut / 2);
    shape.lineTo(rIn, wIn / 2);
    shape.closePath();
    const sg = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    // Shape x → radial (z axis after the turn), extrusion → axle (−x), then spin about the axle.
    sg.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
    sg.applyMatrix4(new THREE.Matrix4().makeRotationX(a));
    m.add(sg, mat(x + thick / 2, 0, 0), { color, metal, rough });
  }
}

function buildWheel(type: WheelType): THREE.BufferGeometry {
  const m = new Mesher({ color: true, pbr: true, ch: false });
  const radial = type === 'far' ? 14 : type === 'car' ? 36 : 32;
  const rim = type === 'truck' ? 0.62 : 0.66;
  // Tyre: flat tread with rounded shoulders, bulging sidewall into the rim bead.
  const tyreProfile: Profile = [
    [rim - 0.02, -0.46],
    [rim + 0.07, -0.5],
    [0.9, -0.49],
    [0.975, -0.4],
    [1, -0.3],
    [1, 0.3],
    [0.975, 0.4],
    [0.9, 0.49],
    [rim + 0.07, 0.5],
    [rim - 0.02, 0.46],
  ];
  m.add(latheX(tyreProfile, radial), undefined, { color: RUBBER, metal: 0, rough: 0.92 });
  if (type !== 'far') {
    // Tread grooves: dark rings sunk into the crown.
    for (const gx of [-0.17, 0, 0.17]) {
      const ring = latheX([[0.996, gx - 0.014], [1.0015, gx - 0.014], [1.0015, gx + 0.014], [0.996, gx + 0.014]], radial);
      m.add(ring, undefined, { color: '#050505', metal: 0, rough: 1 });
    }
  }
  if (type === 'car') {
    // Alloy rim: barrel + polished lip + dished face, 5 spokes, hub cap; brake disc and caliper behind.
    m.add(latheX([[rim - 0.05, -0.44], [rim, -0.47], [rim, 0.47], [rim - 0.05, 0.44]], radial), undefined, { color: '#8e949b', metal: 1, rough: 0.28 });
    for (const s of [1, -1] as const) {
      // Dark dished face (visible between the spokes), polished lip, hub cap.
      m.add(side([[rim - 0.05, 0.37], [0.1, 0.34]], s, radial), undefined, { color: '#17181a', metal: 0.4, rough: 0.55 });
      m.add(side([[rim + 0.005, 0.485], [rim - 0.06, 0.5]], s, radial), undefined, { color: '#c3c8ce', metal: 1, rough: 0.2 });
      m.add(side([[0.13, 0.34], [0.13, 0.43], [0.1, 0.46], [0, 0.46]], s, 16), undefined, { color: '#aeb3b9', metal: 1, rough: 0.3 });
      spokes(m, 5, 0.09, rim - 0.03, s * 0.43, 0.09, 0.19, 0.22, '#9aa0a7', 1, 0.26);
      // Brake disc (dark steel), both faces and the edge.
      m.add(side([[0.34, 0.3], [0.55, 0.3], [0.55, 0.34], [0.34, 0.34]], s, radial), undefined, { color: '#4a4c50', metal: 0.9, rough: 0.5 });
    }
    // Brake caliper peeking between the spokes.
    m.add(new THREE.BoxGeometry(0.2, 0.22, 0.2), mat(0.34, 0.38, 0.28), { color: '#8a1f1f', metal: 0.3, rough: 0.5 });
    m.add(new THREE.BoxGeometry(0.2, 0.22, 0.2), mat(-0.34, 0.38, 0.28), { color: '#8a1f1f', metal: 0.3, rough: 0.5 });
  } else if (type === 'truck') {
    // Steel disc wheel: wide face with hand holes, hub and nut ring.
    m.add(latheX([[rim - 0.04, -0.46], [rim, -0.48], [rim, 0.48], [rim - 0.04, 0.46]], radial), undefined, { color: '#5b5f64', metal: 0.8, rough: 0.5 });
    for (const s of [1, -1] as const) {
      m.add(side([[rim - 0.02, 0.47], [0.4, 0.4], [0.3, 0.4], [0.12, 0.4]], s, radial), undefined, { color: '#3d4045', metal: 0.7, rough: 0.55 });
      m.add(side([[0.24, 0.3], [0.24, 0.4], [0.2, 0.47], [0, 0.47]], s, 20), undefined, { color: '#9aa0a6', metal: 1, rough: 0.35 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        m.add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 6), mat(s * 0.465, Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0, 0, Math.PI / 2), { color: '#c0c4c9', metal: 1, rough: 0.3 });
        const ha = a + Math.PI / 10;
        m.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), mat(s * 0.402, Math.cos(ha) * 0.5, Math.sin(ha) * 0.5, 0, 0, Math.PI / 2), { color: '#0c0d0e', metal: 0, rough: 0.9 });
      }
    }
  } else {
    // Distant wheel: a rim disc is enough.
    for (const s of [1, -1] as const) m.add(side([[rim, 0.48], [0, 0.46]], s, 14), undefined, { color: '#6d7278', metal: 0.8, rough: 0.4 });
  }
  const g = m.build()!;
  g.userData.shared = true;
  return g;
}
