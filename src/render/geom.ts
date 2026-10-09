import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Normalise a geometry to non-indexed position/normal/uv so it can be merged with anything. */
export function normalizeGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) {
    const n = out.attributes.position.count;
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  out.clearGroups();
  if (out !== g) g.dispose();
  out = out as THREE.BufferGeometry;
  return out;
}

/**
 * Collects many small part geometries and merges them per material, so a
 * detailed procedural model costs one draw call per material instead of one
 * per part.
 */
export class PartBuilder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private tmp = new THREE.Matrix4();

  add(geom: THREE.BufferGeometry, mat: THREE.Material, matrix?: THREE.Matrix4): void {
    const g = normalizeGeometry(geom);
    if (matrix) g.applyMatrix4(matrix);
    let list = this.parts.get(mat);
    if (!list) {
      list = [];
      this.parts.set(mat, list);
    }
    list.push(g);
  }

  /** Add with position / euler rotation / scale convenience. */
  place(
    geom: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ): void {
    this.tmp.compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scale),
    );
    this.add(geom, mat, this.tmp);
  }

  /** Mirror a geometry across X (left/right) and add both copies. */
  placeMirrored(
    geom: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ): void {
    const g2 = geom.clone();
    this.place(geom, mat, pos, rot, scale);
    this.place(g2, mat, [-pos[0], pos[1], pos[2]], [rot[0], -rot[1], -rot[2]], scale);
  }

  get empty(): boolean {
    return this.parts.size === 0;
  }

  build(castShadow = true, receiveShadow = false): THREE.Group {
    const group = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow && !(mat as THREE.Material & { transparent?: boolean }).transparent;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
      if (list.length > 1) for (const g of list) g.dispose();
    }
    this.parts.clear();
    return group;
  }
}

/**
 * Extrude a side profile (points in bike space as [z, y], z negative = forward)
 * across X with rounded edges. `taper(z, y)` scales the half-width at a point,
 * giving aerodynamic noses and narrow tails.
 */
export function profileExtrude(
  profile: ReadonlyArray<readonly [number, number]>,
  width: number,
  opts: { bevel?: number; taper?: (z: number, y: number) => number; curveSegments?: number; centerX?: number } = {},
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // Shape space: x = −z (forward positive), y = y.
  profile.forEach(([z, y], i) => (i === 0 ? shape.moveTo(-z, y) : shape.lineTo(-z, y)));
  shape.closePath();
  const bevel = opts.bevel ?? Math.min(0.03, width * 0.3);
  const depth = Math.max(0.001, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 3,
    curveSegments: opts.curveSegments ?? 8,
  });
  // Map shape x → −Z and extrusion z → X, centred on X.
  g.rotateY(Math.PI / 2);
  g.translate(-depth / 2 + (opts.centerX ?? 0), 0, 0);
  if (opts.taper) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const cx = opts.centerX ?? 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) - cx;
      const k = opts.taper(p.getZ(i), p.getY(i));
      p.setX(i, cx + x * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Smooth closed profile from control points using Catmull-Rom sampling. */
export function smoothProfile(points: ReadonlyArray<readonly [number, number]>, samples = 6): [number, number][] {
  const pts = points.map(([z, y]) => new THREE.Vector2(z, y));
  const curve = new THREE.SplineCurve([...pts, pts[0]]);
  return curve.getPoints(points.length * samples).map((v) => [v.x, v.y] as [number, number]);
}

export function tube(points: THREE.Vector3[], radius: number, radial = 8, segs?: number, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, segs ?? Math.max(8, points.length * 6), radius, radial, closed);
}

/** Cylinder oriented from a to b. */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r1: number, r2 = r1, radial = 10): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r2, r1, len, radial, 1, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Lathe a radial profile [radius, x] around the X axis (wheels, hubs, mufflers). */
export function latheX(profile: ReadonlyArray<readonly [number, number]>, segments = 32): THREE.BufferGeometry {
  const pts = profile.map(([r, x]) => new THREE.Vector2(Math.max(0.0001, r), x));
  const g = new THREE.LatheGeometry(pts, segments);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/**
 * Valanced mudguard arc around a wheel (axle along X, centred at origin).
 * Angles are measured from the rear (0) over the top (π/2) to the front (π).
 */
export function fenderArc(R: number, width: number, from: number, to: number, depth = 0.1, segments = 28): THREE.BufferGeometry {
  const hw = width / 2;
  const prof: [number, number][] = [
    [R + 0.005, -hw - 0.012],
    [R + depth * 0.6, -hw - 0.006],
    [R + depth * 0.95, -hw * 0.6],
    [R + depth, 0],
    [R + depth * 0.95, hw * 0.6],
    [R + depth * 0.6, hw + 0.006],
    [R + 0.005, hw + 0.012],
  ];
  const pts = prof.map(([r, x]) => new THREE.Vector2(r, x));
  // Lathe around Y: x = r·sinφ, z = r·cosφ. After rotateZ(−π/2) the arc lies in the YZ plane
  // with y = −r·sinφ, so the "over the top" angle a maps to φ = −a.
  const g = new THREE.LatheGeometry(pts, segments, -to, to - from);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Rounded box via extruded rounded rectangle (panniers, cases, batteries). */
export function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const bevel = Math.min(r * 0.6, d * 0.25);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - bevel * 2) / 2);
  return g;
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface LoftStation {
  z: number;
  /** Full width (m). */
  w: number;
  /** Bottom and top y. */
  yb: number;
  yt: number;
  /** Superellipse exponent: 2 = ellipse, higher = boxier. */
  n?: number;
  /** Lateral centre offset. */
  x?: number;
  /** Squash the bottom half (0..1) for flat undersides. */
  flatBottom?: number;
}

/**
 * Smooth body shell lofted through superellipse cross-sections along Z.
 * Used for tanks, fairings, tails and seats so they read as curved,
 * pressed panels instead of extruded slabs.
 */
export function superLoft(stations: LoftStation[], radial = 28, sub = 4): THREE.BufferGeometry {
  const st = [...stations].sort((a, b) => a.z - b.z);
  const keys: (keyof LoftStation)[] = ['z', 'w', 'yb', 'yt', 'n', 'x', 'flatBottom'];
  const get = (s: LoftStation, k: keyof LoftStation): number => {
    const v = s[k];
    if (typeof v === 'number') return v;
    return k === 'n' ? 2.5 : 0;
  };
  // Catmull-Rom interpolate every parameter between stations.
  const rings: LoftStation[] = [];
  for (let i = 0; i < st.length - 1; i++) {
    const p0 = st[Math.max(0, i - 1)];
    const p1 = st[i];
    const p2 = st[i + 1];
    const p3 = st[Math.min(st.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const r: Record<string, number> = {};
      for (const key of keys) {
        const a = get(p0, key), b = get(p1, key), c = get(p2, key), d = get(p3, key);
        const t2 = t * t, t3 = t2 * t;
        r[key] = 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      }
      rings.push(r as unknown as LoftStation);
    }
  }
  rings.push(st[st.length - 1]);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  rings.forEach((r, i) => {
    const n = Math.max(1.2, get(r, 'n'));
    const cx = get(r, 'x');
    const w = Math.max(0.0005, r.w);
    const yc = (r.yb + r.yt) / 2;
    const h = Math.max(0.0005, (r.yt - r.yb) / 2);
    const fb = clamp01(get(r, 'flatBottom'));
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const ex = 2 / n;
      let y = Math.sign(s) * Math.pow(Math.abs(s), ex);
      if (y < 0) y *= 1 - fb * 0.5;
      pos.push(cx + (w / 2) * Math.sign(c) * Math.pow(Math.abs(c), ex), yc + h * y, r.z);
      uv.push(j / radial, i / (rings.length - 1));
    }
  });
  const R = rings.length;
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, b, c, b, d, c);
    }
  }
  // End caps
  const cap = (ring: number, flip: boolean) => {
    const r = rings[ring];
    const ci = pos.length / 3;
    pos.push(get(r, 'x'), (r.yb + r.yt) / 2, r.z);
    uv.push(0.5, ring === 0 ? 0 : 1);
    for (let j = 0; j < radial; j++) {
      const a = ring * radial + j;
      const b = ring * radial + ((j + 1) % radial);
      if (flip) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  };
  cap(0, true);
  cap(R - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Split a geometry by a predicate on triangle centroids, returning
 * [matching, rest]. Used to paint two-tone liveries and stripes.
 */
export function splitTriangles(
  geom: THREE.BufferGeometry,
  pred: (x: number, y: number, z: number) => boolean,
): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const p = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const uvA = g.attributes.uv as THREE.BufferAttribute | undefined;
  const A: number[][] = [[], [], []];
  const B: number[][] = [[], [], []];
  for (let t = 0; t < p.count; t += 3) {
    const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    const dst = pred(cx, cy, cz) ? A : B;
    for (let k = 0; k < 3; k++) {
      const i = t + k;
      dst[0].push(p.getX(i), p.getY(i), p.getZ(i));
      dst[1].push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      if (uvA) dst[2].push(uvA.getX(i), uvA.getY(i));
      else dst[2].push(0, 0);
    }
  }
  const make = (d: number[][]) => {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(d[0], 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(d[1], 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(d[2], 2));
    return out;
  };
  if (g !== geom) geom.dispose();
  return [make(A), make(B)];
}
