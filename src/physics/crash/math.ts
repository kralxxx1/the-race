/**
 * Minimal mutable vector / quaternion helpers for the crash solver. Plain objects and
 * in-place functions: no allocation inside the solver loop, no dependency on three.js
 * (the solver is unit-tested headlessly and is deterministic).
 */
export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface Q4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const q4 = (): Q4 => ({ x: 0, y: 0, z: 0, w: 1 });

export function vset(o: V3, x: number, y: number, z: number): V3 {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
}
export function vcopy(o: V3, a: V3): V3 {
  o.x = a.x;
  o.y = a.y;
  o.z = a.z;
  return o;
}
export function vadd(o: V3, a: V3, b: V3): V3 {
  o.x = a.x + b.x;
  o.y = a.y + b.y;
  o.z = a.z + b.z;
  return o;
}
export function vsub(o: V3, a: V3, b: V3): V3 {
  o.x = a.x - b.x;
  o.y = a.y - b.y;
  o.z = a.z - b.z;
  return o;
}
export function vscale(o: V3, a: V3, s: number): V3 {
  o.x = a.x * s;
  o.y = a.y * s;
  o.z = a.z * s;
  return o;
}
/** o += a * s */
export function vmad(o: V3, a: V3, s: number): V3 {
  o.x += a.x * s;
  o.y += a.y * s;
  o.z += a.z * s;
  return o;
}
export const vdot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export function vcross(o: V3, a: V3, b: V3): V3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
}
export const vlen2 = (a: V3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const vlen = (a: V3): number => Math.sqrt(vlen2(a));
export function vnorm(o: V3, a: V3): number {
  const l = vlen(a);
  if (l < 1e-12) {
    o.x = 0;
    o.y = 1;
    o.z = 0;
    return 0;
  }
  const s = 1 / l;
  o.x = a.x * s;
  o.y = a.y * s;
  o.z = a.z * s;
  return l;
}

export function qcopy(o: Q4, a: Q4): Q4 {
  o.x = a.x;
  o.y = a.y;
  o.z = a.z;
  o.w = a.w;
  return o;
}
export function qnormalize(q: Q4): Q4 {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
  q.x /= l;
  q.y /= l;
  q.z /= l;
  q.w /= l;
  return q;
}
/** o = a * b (Hamilton product); o may alias a or b. */
export function qmul(o: Q4, a: Q4, b: Q4): Q4 {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  o.x = x;
  o.y = y;
  o.z = z;
  o.w = w;
  return o;
}
export function qconj(o: Q4, a: Q4): Q4 {
  o.x = -a.x;
  o.y = -a.y;
  o.z = -a.z;
  o.w = a.w;
  return o;
}
/** Rotate v by q into o (o may alias v). */
export function qrot(o: V3, q: Q4, v: V3): V3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  const x = v.x + q.w * tx + (q.y * tz - q.z * ty);
  const y = v.y + q.w * ty + (q.z * tx - q.x * tz);
  const z = v.z + q.w * tz + (q.x * ty - q.y * tx);
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
}
/** Rotate v by the inverse of q. */
export function qrotInv(o: V3, q: Q4, v: V3): V3 {
  const tx = -2 * (q.y * v.z - q.z * v.y);
  const ty = -2 * (q.z * v.x - q.x * v.z);
  const tz = -2 * (q.x * v.y - q.y * v.x);
  const x = v.x + q.w * tx + (-q.y * tz + q.z * ty);
  const y = v.y + q.w * ty + (-q.z * tx + q.x * tz);
  const z = v.z + q.w * tz + (-q.x * ty + q.y * tx);
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
}
export function qfromAxisAngle(o: Q4, ax: number, ay: number, az: number, angle: number): Q4 {
  const h = angle * 0.5;
  const s = Math.sin(h);
  o.x = ax * s;
  o.y = ay * s;
  o.z = az * s;
  o.w = Math.cos(h);
  return o;
}
/** Quaternion from Euler angles in three.js 'YXZ' order (yaw, pitch, roll). */
export function qfromYXZ(o: Q4, pitch: number, yaw: number, roll: number): Q4 {
  const c1 = Math.cos(pitch / 2), s1 = Math.sin(pitch / 2);
  const c2 = Math.cos(yaw / 2), s2 = Math.sin(yaw / 2);
  const c3 = Math.cos(roll / 2), s3 = Math.sin(roll / 2);
  o.x = s1 * c2 * c3 + c1 * s2 * s3;
  o.y = c1 * s2 * c3 - s1 * c2 * s3;
  o.z = c1 * c2 * s3 - s1 * s2 * c3;
  o.w = c1 * c2 * c3 + s1 * s2 * s3;
  return o;
}
/** q += ½ [ω, 0] q  (small rotation by the vector ω, not normalised). */
export function qaddRot(q: Q4, wx: number, wy: number, wz: number): Q4 {
  const x = q.x + 0.5 * (wx * q.w + wy * q.z - wz * q.y);
  const y = q.y + 0.5 * (wy * q.w + wz * q.x - wx * q.z);
  const z = q.z + 0.5 * (wz * q.w + wx * q.y - wy * q.x);
  const w = q.w + 0.5 * (-wx * q.x - wy * q.y - wz * q.z);
  q.x = x;
  q.y = y;
  q.z = z;
  q.w = w;
  return q;
}

/** Deterministic PRNG (mulberry32) returning floats in [0, 1). */
export function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
