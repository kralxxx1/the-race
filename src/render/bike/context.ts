import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../data/bikes';
import { DecalAtlas, decalQuad, type DecalRect, type LabelOpts } from './decals';
import type { Hardpoints } from './hardpoints';
import { MeshData, type P3 } from './mesh';
import { segs, type KitQuality } from './quality';
import { GROUPS, GroupSink, type Finish, type GroupName } from './sink';
import type { BikeBlueprint } from './types';

/**
 * Everything a kit generator needs while one bike is being assembled: the
 * blueprint, derived hardpoints, quality, the per-group geometry sinks and the
 * shared decal atlas. Generators add geometry in *bike space at rest pose*
 * (`add`) or in a group's local frame (`addLocal`).
 */
export class KitContext {
  readonly sinks: Record<GroupName, GroupSink>;
  readonly rest: Record<GroupName, THREE.Matrix4>;
  readonly decals: DecalAtlas;
  /** Named points other generators can attach to (exhaust ports, sprocket, mirror glass…). */
  readonly anchors = new Map<string, P3>();
  /** Lists of points (e.g. exhaust ports, in firing order). */
  readonly anchorLists = new Map<string, P3[]>();
  /** Steering-local → bike transform at rest. */
  readonly steerM: THREE.Matrix4;
  readonly steerInv: THREE.Matrix4;

  constructor(
    readonly bp: BikeBlueprint,
    readonly spec: BikeSpec,
    readonly hp: Hardpoints,
    readonly q: KitQuality,
    readonly livery: Livery,
    readonly liveryIndex: number,
  ) {
    const steer = new THREE.Matrix4().compose(
      new THREE.Vector3(...hp.head),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), hp.rake),
      new THREE.Vector3(1, 1, 1),
    );
    const forkLower = steer.clone().multiply(new THREE.Matrix4().makeTranslation(0, -hp.forkLen, 0));
    const frontWheel = forkLower.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -hp.offset));
    const rearWheel = new THREE.Matrix4().makeTranslation(0, hp.Rr, 0);
    this.rest = {
      chassis: new THREE.Matrix4(),
      steer,
      forkLower,
      frontWheel,
      frontSpokes: frontWheel.clone(),
      rearWheel,
      rearSpokes: rearWheel.clone(),
      swingarm: new THREE.Matrix4().makeTranslation(...hp.pivot),
      // Lever groups default to the steering frame; `leverFrame` re-pivots them.
      leverBrake: steer.clone(),
      leverClutch: steer.clone(),
    };
    this.sinks = {} as Record<GroupName, GroupSink>;
    for (const g of GROUPS) this.sinks[g] = new GroupSink(g, this.rest[g]);
    this.steerM = steer;
    this.steerInv = steer.clone().invert();
    const tex = q.tex;
    this.decals = new DecalAtlas(tex, tex >> 1);
  }

  /**
   * Give a lever group its own pivot frame (bike space, rest pose): origin at the pivot, x along the
   * bar, y up, z rearwards. Geometry added to the group afterwards is authored in that frame, and the
   * frame is exported as anchors so the bike model can rotate the blade about its pivot.
   */
  leverFrame(group: 'leverBrake' | 'leverClutch', pivot: THREE.Vector3, bar: THREE.Vector3, up: THREE.Vector3, fwd: THREE.Vector3): void {
    const m = new THREE.Matrix4().makeBasis(bar, up, fwd.clone().negate());
    m.setPosition(pivot);
    this.rest[group] = m;
    this.sinks[group] = new GroupSink(group, m);
    this.anchors.set(`${group}:o`, [pivot.x, pivot.y, pivot.z]);
    this.anchors.set(`${group}:x`, [bar.x, bar.y, bar.z]);
    this.anchors.set(`${group}:y`, [up.x, up.y, up.z]);
  }

  /** Add geometry given in bike space (rest pose). */
  add(group: GroupName, mesh: MeshData, f: Finish, m?: THREE.Matrix4): void {
    this.sinks[group].addBike(mesh, f, m);
  }

  /** Add geometry given in the group's local frame. */
  addLocal(group: GroupName, mesh: MeshData, f: Finish, m?: THREE.Matrix4): void {
    this.sinks[group].add(mesh, f, m);
  }

  /** Add geometry authored in steering-local coordinates (Y along the steering axis, fork tubes at z = −offset). */
  addSteer(group: 'steer' | 'forkLower' | 'frontWheel', mesh: MeshData, f: Finish, m?: THREE.Matrix4): void {
    const full = m ? this.steerM.clone().multiply(m) : this.steerM;
    this.sinks[group].addBike(mesh, f, full);
  }

  /** Segment count scaled by quality. */
  seg(base: number, min = 3): number {
    return segs(this.q, base, min);
  }

  get micro(): boolean {
    return this.q.micro;
  }

  /** Bike-space point → steering-local. */
  toSteer(p: P3): [number, number, number] {
    const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.steerInv);
    return [v.x, v.y, v.z];
  }

  /** Steering-local point → bike space (rest). */
  fromSteer(p: P3): [number, number, number] {
    const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.steerM);
    return [v.x, v.y, v.z];
  }

  /**
   * A text/graphic decal quad: centre `pos`, facing `normal`, `up` hint, height h (m).
   * Bike-space unless a group-local frame is passed through `m`.
   */
  decal(group: GroupName, r: DecalRect, h: number, pos: P3, normal: P3, up: P3 = [0, 1, 0], opts: { w?: number; bendR?: number; local?: boolean; steer?: boolean } = {}): void {
    if (r.u1 <= r.u0) return;
    const q = decalQuad(r, h, opts.w, opts.bendR ?? 0, opts.bendR ? 8 : 1);
    const n = new THREE.Vector3(...normal).normalize();
    let u = new THREE.Vector3(...up);
    u.sub(n.clone().multiplyScalar(u.dot(n)));
    if (u.lengthSq() < 1e-8) u = new THREE.Vector3(1, 0, 0);
    u.normalize();
    const x = new THREE.Vector3().crossVectors(u, n);
    const m = new THREE.Matrix4().makeBasis(x, u, n);
    m.setPosition(pos[0] + n.x * 0.0006, pos[1] + n.y * 0.0006, pos[2] + n.z * 0.0006);
    const f: Finish = { slot: 'decal', color: [1, 1, 1], metal: 0, rough: 0.4, coat: 0, micro: 0 };
    if (opts.steer) this.addSteer(group as 'steer', q, f, m);
    else if (opts.local) this.addLocal(group, q, f, m);
    else this.add(group, q, f, m);
  }

  label(text: string, o: LabelOpts, px = 48): DecalRect {
    return this.decals.label(text, o, px);
  }

  anchor(name: string, p: P3): void {
    this.anchors.set(name, p);
  }

  /** Total triangles in all sinks. */
  get triangles(): number {
    let n = 0;
    for (const g of GROUPS) n += this.sinks[g].triangles;
    return n;
  }
}

/** Translation/rotation/scale matrix shorthand for kit generators. */
export function T(x: number, y: number, z: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

export function RX(a: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationX(a);
}
export function RY(a: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(a);
}
export function RZ(a: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationZ(a);
}
export function S(x: number, y = x, z = x): THREE.Matrix4 {
  return new THREE.Matrix4().makeScale(x, y, z);
}

/** Matrix product a·b·c… (applied right to left). */
export function mul(...ms: THREE.Matrix4[]): THREE.Matrix4 {
  const out = new THREE.Matrix4();
  for (const m of ms) out.multiply(m);
  return out;
}

/** Basis matrix mapping local X/Y/Z to the given axes, origin at `o`. */
export function frame(o: P3, x: P3, y: P3, z: P3): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z));
  m.setPosition(o[0], o[1], o[2]);
  return m;
}

/** Empty mesh helper (keeps imports tidy in generators). */
export const empty = (): MeshData => new MeshData();
