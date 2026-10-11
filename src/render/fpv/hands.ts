import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Materials } from '../materials';

/**
 * Gloved hand on a handlebar grip. Authored for the RIGHT hand in grip space:
 * origin on the bar axis at the grip centre, +X outboard along the bar, +Y up,
 * +Z towards the rider. The left hand is the same mesh mirrored on X.
 *
 * Three draw calls per hand: leather body, backhand/knuckle armour (accent), and the
 * two lever fingers (index + middle) as a separate pivoting mesh so they can squeeze the
 * brake / clutch lever.
 */

const GRIP_R = 0.0205;
const RC = GRIP_R + 0.0095;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** Capsule between two points. */
function capsule(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.0005, len - 2 * r), 4, seg);
  _q.setFromUnitVectors(UP, _b.copy(b).sub(a).normalize());
  _m.compose(_a.copy(a).add(b).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

function box(w: number, h: number, d: number, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], round = 0.006): THREE.BufferGeometry {
  // A slightly inflated, low-poly rounded box: a capsule-edged look at a fraction of the cost.
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const hx = w / 2 - round;
  const hy = h / 2 - round;
  const hz = d / 2 - round;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const cx = Math.max(-hx, Math.min(hx, x));
    const cy = Math.max(-hy, Math.min(hy, y));
    const cz = Math.max(-hz, Math.min(hz, z));
    _a.set(x - cx, y - cy, z - cz);
    if (_a.lengthSq() > 1e-12) _a.normalize().multiplyScalar(round);
    p.setXYZ(i, cx + _a.x, cy + _a.y, cz + _a.z);
  }
  g.computeVertexNormals();
  g.applyMatrix4(_m.compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Point on the circle around the bar axis (φ from the top, towards the front). */
function around(x: number, phi: number, r = RC): THREE.Vector3 {
  return new THREE.Vector3(x, r * Math.cos(phi), -r * Math.sin(phi));
}

export interface GloveParts {
  group: THREE.Group;
  /** Index + middle fingers (pivot at the knuckles) — rotate about X to squeeze a lever. */
  leverFingers: THREE.Group;
  /** Wrist target in grip space: where the forearm ends. */
  wrist: THREE.Vector3;
  geometries: THREE.BufferGeometry[];
}

export function buildGlove(mats: Materials, accent: string, leatherColor: string): GloveParts {
  const body: THREE.BufferGeometry[] = [];
  const armour: THREE.BufferGeometry[] = [];
  const fingers: THREE.BufferGeometry[] = [];
  // Ring + little finger wrap round the grip.
  const xs = [-0.03, -0.0095, 0.0115, 0.032];
  for (let i = 2; i < 4; i++) {
    const x = xs[i];
    const phis = [-0.28, 0.75, 1.95, 3.0];
    const pts = phis.map((p) => around(x, p, RC - (i === 3 ? 0.001 : 0)));
    for (let k = 0; k < pts.length - 1; k++) body.push(capsule(pts[k], pts[k + 1], 0.0094 - k * 0.0006 - (i === 3 ? 0.0008 : 0)));
  }
  // Index + middle rest forwards on the lever (separate mesh, pivot at the knuckles).
  for (let i = 0; i < 2; i++) {
    const x = xs[i];
    const k0 = new THREE.Vector3(x, 0.03, 0.012);
    const k1 = new THREE.Vector3(x, 0.027, -0.034);
    const k2 = new THREE.Vector3(x, 0.003, -0.07);
    const k3 = new THREE.Vector3(x, -0.017, -0.064);
    for (const [a, b, r] of [[k0, k1, 0.0098], [k1, k2, 0.0092], [k2, k3, 0.0085]] as const) fingers.push(capsule(a, b, r));
  }
  // Palm, back of the hand and thumb.
  body.push(box(0.092, 0.03, 0.062, [0.0, 0.036, 0.046], [-0.12, 0, 0], 0.012));
  body.push(capsule(new THREE.Vector3(-0.044, 0.026, 0.056), new THREE.Vector3(-0.046, -0.003, 0.012), 0.0125));
  body.push(capsule(new THREE.Vector3(-0.046, -0.003, 0.012), new THREE.Vector3(-0.034, -0.0225, -0.006), 0.0105));
  // Gauntlet cuff running back along the forearm.
  body.push(capsule(new THREE.Vector3(0.0, 0.043, 0.074), new THREE.Vector3(0.0, 0.052, 0.14), 0.037, 10));
  // Knuckle armour plate + the backhand panel (livery accent) and cuff band.
  armour.push(box(0.088, 0.012, 0.04, [0.0, 0.058, 0.028], [-0.2, 0, 0], 0.005));
  armour.push(box(0.074, 0.01, 0.034, [0.0, 0.056, 0.064], [-0.1, 0, 0], 0.004));
  armour.push(capsule(new THREE.Vector3(0.0, 0.046, 0.1), new THREE.Vector3(0.0, 0.049, 0.112), 0.039, 10));
  const bodyGeo = mergeGeometries(body, false)!;
  const armourGeo = mergeGeometries(armour, false)!;
  const fingerGeo = mergeGeometries(fingers, false)!;
  for (const list of [body, armour, fingers]) for (const g of list) g.dispose();
  const leather = mats.leather(leatherColor);
  const acc = mats.suit(accent);
  const group = new THREE.Group();
  const bodyMesh = new THREE.Mesh(bodyGeo, leather);
  const armMesh = new THREE.Mesh(armourGeo, acc);
  const fingerMesh = new THREE.Mesh(fingerGeo, leather);
  const leverFingers = new THREE.Group();
  leverFingers.add(fingerMesh);
  for (const m of [bodyMesh, armMesh, fingerMesh]) m.castShadow = true;
  group.add(bodyMesh, armMesh, leverFingers);
  // Pivot the finger group at the knuckles: geometry is authored in grip space, so offset it back.
  const pivot = new THREE.Vector3(0, 0.03, 0.012);
  leverFingers.position.copy(pivot);
  fingerMesh.position.copy(pivot).negate();
  return { group, leverFingers, wrist: new THREE.Vector3(0, 0.046, 0.125), geometries: [bodyGeo, armourGeo, fingerGeo] };
}
