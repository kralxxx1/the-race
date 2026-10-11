import * as THREE from 'three';
import type { BikeStyle, Livery } from '../data/bikes';
import { clamp, damp, lerp, smoothstep } from '../core/math';
import type { BikeModel } from './bikeModel';
import { buildGlove, type GloveParts } from './fpv/hands';
import type { SegmentId } from '../physics/crash/scenario';
import type { Materials } from './materials';

const UPPER_ARM = 0.3;
const FOREARM = 0.29;
const THIGH = 0.45;
const SHIN = 0.45;
const TORSO = 0.5;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const _m2 = new THREE.Matrix4();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** Analytic two-bone IK. Writes the middle joint into `outMid` and the reached end into `outEnd`. */
export function solveTwoBone(
  root: THREE.Vector3,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  a: number,
  b: number,
  outMid: THREE.Vector3,
  outEnd: THREE.Vector3,
): void {
  const dir = _a.copy(target).sub(root);
  let d = dir.length();
  if (d < 1e-6) {
    dir.set(0, -1, 0);
    d = 1e-6;
  }
  dir.divideScalar(d);
  const dc = clamp(d, Math.abs(a - b) + 1e-4, a + b - 1e-4);
  const cosA = clamp((a * a + dc * dc - b * b) / (2 * a * dc), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  // Bend direction: component of (pole - root) perpendicular to dir.
  const p = _b.copy(pole).sub(root);
  p.addScaledVector(dir, -p.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, 0, -1).addScaledVector(dir, -dir.z);
  p.normalize();
  outMid.copy(root).addScaledVector(dir, cosA * a).addScaledVector(p, sinA * a);
  outEnd.copy(target).sub(outMid).normalize().multiplyScalar(b).add(outMid);
}

interface Limb {
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  end: THREE.Mesh;
  joint: THREE.Mesh;
}

/** Joint targets in the rider-root (bike chassis) frame. */
export interface RiderPose {
  hip: THREE.Vector3;
  torso: THREE.Quaternion;
  head: THREE.Quaternion;
  handL: THREE.Vector3;
  handR: THREE.Vector3;
  footL: THREE.Vector3;
  footR: THREE.Vector3;
  elbowPoleL: THREE.Vector3;
  elbowPoleR: THREE.Vector3;
  kneePoleL: THREE.Vector3;
  kneePoleR: THREE.Vector3;
}

export function makePose(): RiderPose {
  return {
    hip: new THREE.Vector3(),
    torso: new THREE.Quaternion(),
    head: new THREE.Quaternion(),
    handL: new THREE.Vector3(),
    handR: new THREE.Vector3(),
    footL: new THREE.Vector3(),
    footR: new THREE.Vector3(),
    elbowPoleL: new THREE.Vector3(),
    elbowPoleR: new THREE.Vector3(),
    kneePoleL: new THREE.Vector3(),
    kneePoleR: new THREE.Vector3(),
  };
}

/** A segment transform in rider space (position of the segment's body frame + orientation). */
export interface SegmentPose {
  x: THREE.Vector3;
  q: THREE.Quaternion;
}

export interface RideParams {
  speedKmh: number;
  lean: number;
  accel: number;
  brake: number;
  pitch: number;
  steer: number;
  /** -1 downshift, +1 upshift, 0 none: triggers the foot animation. */
  shift: number;
  /** 0..1 right-hand throttle twist. */
  throttle?: number;
  /** 0..1 clutch lever pull. */
  clutch?: number;
  dt: number;
}

/** Articulated rider in leathers and a full-face helmet. */
export class RiderModel {
  readonly root = new THREE.Group();
  private pelvis: THREE.Mesh;
  private pelvisHolder: THREE.Group;
  private torso: THREE.Group;
  private headGroup: THREE.Group;
  private armL: Limb;
  private armR: Limb;
  private legL: Limb;
  private legR: Limb;
  readonly pose = makePose();
  /** Eye position in rider-root space (for the helmet camera). */
  readonly eye = new THREE.Vector3();
  readonly eyeQuat = new THREE.Quaternion();
  private footDown = 0;
  private shiftT = 0;
  private shiftDir = 0;
  private tuck = 0;
  private hang = 0;
  private torsoLag = new THREE.Vector2();
  private breath = 0;
  private headVisible = true;
  private helmetParts: THREE.Object3D[] = [];
  /** Gloved hands on the grips (right = brake/throttle side, left = clutch side). */
  readonly gloveR: GloveParts;
  readonly gloveL: GloveParts;
  private bodyParts: THREE.Object3D[] = [];
  private throttleS = 0;
  private clutchS = 0;
  private brakeS = 0;

  constructor(
    mats: Materials,
    livery: Livery,
    readonly style: BikeStyle,
  ) {
    const [c1, c2] = livery.suit;
    const suit = mats.suit(c1);
    const suit2 = mats.suit(c2);
    const glove = mats.leather('#141516');
    const boot = mats.leather('#18191b');
    const capsule = (r: number, len: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 12), mat);
      m.castShadow = true;
      return m;
    };
    this.pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.1, 6, 12), suit2);
    this.pelvis.scale.set(1, 1, 0.85);
    this.pelvis.rotation.z = Math.PI / 2;
    this.pelvis.castShadow = true;
    const pelvisHolder = new THREE.Group();
    pelvisHolder.add(this.pelvis);
    this.pelvisHolder = pelvisHolder;

    this.torso = new THREE.Group();
    const chest = capsule(0.17, TORSO + 0.06, suit);
    chest.scale.set(1.12, 1, 0.78);
    chest.position.y = TORSO / 2 + 0.01;
    this.torso.add(chest);
    // Contrasting side panels / stripes
    const stripe = capsule(0.172, TORSO * 0.7, suit2);
    stripe.scale.set(1.13, 1, 0.5);
    stripe.position.set(0, TORSO * 0.45, 0.04);
    this.torso.add(stripe);
    if (style === 'sport' || style === 'hyper') {
      // Aero hump on the back of race leathers.
      const hump = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), suit2);
      hump.rotation.x = Math.PI / 2 + 0.3;
      hump.scale.set(0.9, 1.3, 0.7);
      hump.position.set(0, TORSO * 0.86, 0.1);
      hump.castShadow = true;
      this.torso.add(hump);
    }

    // Helmet
    this.headGroup = new THREE.Group();
    const helmetMat = mats.helmet(c1);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.145, 24, 18), helmetMat);
    shell.scale.set(0.95, 1.0, 1.12);
    shell.castShadow = true;
    const stripeH = new THREE.Mesh(new THREE.SphereGeometry(0.1465, 24, 18, Math.PI * 0.42, Math.PI * 0.16, 0, Math.PI * 0.75), mats.helmet(c2));
    stripeH.scale.copy(shell.scale);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.149, 24, 12, Math.PI * 0.63, Math.PI * 0.74, Math.PI * 0.32, Math.PI * 0.28), mats.visor());
    visor.scale.copy(shell.scale);
    const chin = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 10), helmetMat);
    chin.rotation.z = Math.PI / 2;
    chin.position.set(0, -0.07, -0.11);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.06), mats.plastic('#111'));
    spoiler.position.set(0, 0.05, 0.16);
    spoiler.rotation.x = -0.4;
    this.headGroup.add(shell, stripeH, visor, chin, spoiler);
    this.helmetParts = [shell, stripeH, visor, chin, spoiler];
    const neck = capsule(0.055, 0.14, mats.leather('#1b1c1e'));
    neck.position.y = -0.12;
    this.headGroup.add(neck);

    const limb = (r1: number, r2: number, l1: number, l2: number, m1: THREE.Material, m2: THREE.Material, endGeo: THREE.BufferGeometry, endMat: THREE.Material): Limb => {
      const upper = capsule(r1, l1 + r1, m1);
      const lower = capsule(r2, l2 + r2 * 0.5, m2);
      const end = new THREE.Mesh(endGeo, endMat);
      end.castShadow = true;
      const joint = new THREE.Mesh(new THREE.SphereGeometry(r1 * 1.08, 10, 8), m2);
      return { upper, lower, end, joint };
    };
    const handGeo = new THREE.BoxGeometry(0.085, 0.05, 0.11);
    handGeo.translate(0, 0, -0.03);
    const bootGeo = new THREE.BoxGeometry(0.1, 0.1, 0.27);
    bootGeo.translate(0, -0.02, -0.06);
    this.armL = limb(0.06, 0.05, UPPER_ARM, FOREARM, suit, suit, handGeo, glove);
    this.armR = limb(0.06, 0.05, UPPER_ARM, FOREARM, suit, suit, handGeo.clone(), glove);
    this.legL = limb(0.085, 0.065, THIGH, SHIN, suit2, suit, bootGeo, boot);
    this.legR = limb(0.085, 0.065, THIGH, SHIN, suit2, suit, bootGeo.clone(), boot);
    // Knee sliders
    for (const leg of [this.legL, this.legR]) {
      const puck = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.1), mats.plastic('#d8d8d8'));
      leg.joint.add(puck);
      puck.position.set(0, 0, -0.07);
    }
    this.root.add(pelvisHolder, this.torso, this.headGroup);
    for (const l of [this.armL, this.armR, this.legL, this.legR]) this.root.add(l.upper, l.lower, l.end, l.joint);
    // Detailed gloves replace the box hands (the IK still ends at the wrist).
    this.gloveR = buildGlove(mats, c2, '#141516');
    this.gloveL = buildGlove(mats, c2, '#141516');
    this.gloveL.group.scale.x = -1;
    this.armL.end.visible = false;
    this.armR.end.visible = false;
    this.root.add(this.gloveR.group, this.gloveL.group);
    this.bodyParts = [this.pelvisHolder, this.torso, this.headGroup];
  }

  /**
   * First-person: the camera sits at the blueprint eye, inside the model's own head and chest,
   * so those are hidden; arms, gloves and legs stay.
   */
  setFirstPerson(on: boolean): void {
    for (const p of this.bodyParts) p.visible = !on;
    // Only forearms and gloves are seen from the helmet: an upper arm swings across the view in hard leans.
    for (const l of [this.armL, this.armR]) l.joint.visible = l.upper.visible = !on;
  }

  setHeadVisible(v: boolean): void {
    if (v === this.headVisible) return;
    this.headVisible = v;
    for (const p of this.helmetParts) p.visible = v;
  }

  // ───────────────────────────── ragdoll interface ─────────────────────────────

  /** Relative transforms of the gloves / boots in their forearm / shin frames (captured when a crash starts). */
  private endRel: THREE.Matrix4[] = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];

  private endObjects(): THREE.Object3D[] {
    return [this.gloveL.group, this.gloveR.group, this.legL.end, this.legR.end];
  }

  private endParents(): THREE.Mesh[] {
    return [this.armL.lower, this.armR.lower, this.legL.lower, this.legR.lower];
  }

  /**
   * Current pose of the eleven rigid segments in rider-root space (body frames: torso centre of
   * mass, limb centres with local +Y pointing to the distal end). Also remembers where the
   * gloves and boots sit relative to their limbs so the ragdoll can carry them.
   */
  captureSegments(out: Record<SegmentId, SegmentPose>): void {
    const set = (id: SegmentId, p: THREE.Vector3, q: THREE.Quaternion) => {
      out[id].x.copy(p);
      out[id].q.copy(q);
    };
    set('pelvis', this.pelvisHolder.position, this.pelvisHolder.quaternion);
    _c.set(0, TORSO / 2, 0).applyQuaternion(this.torso.quaternion).add(this.torso.position);
    set('torso', _c, this.torso.quaternion);
    set('head', this.headGroup.position, this.headGroup.quaternion);
    set('uarmL', this.armL.upper.position, this.armL.upper.quaternion);
    set('uarmR', this.armR.upper.position, this.armR.upper.quaternion);
    set('farmL', this.armL.lower.position, this.armL.lower.quaternion);
    set('farmR', this.armR.lower.position, this.armR.lower.quaternion);
    set('thighL', this.legL.upper.position, this.legL.upper.quaternion);
    set('thighR', this.legR.upper.position, this.legR.upper.quaternion);
    set('shinL', this.legL.lower.position, this.legL.lower.quaternion);
    set('shinR', this.legR.lower.position, this.legR.lower.quaternion);
    const parents = this.endParents();
    const ends = this.endObjects();
    for (let i = 0; i < 4; i++) {
      parents[i].updateMatrix();
      ends[i].updateMatrix();
      this.endRel[i].copy(parents[i].matrix).invert().multiply(ends[i].matrix);
    }
  }

  /** Pose the whole body from ragdoll segment transforms (world space; the root must be at the origin). */
  applySegments(get: (id: SegmentId, p: THREE.Vector3, q: THREE.Quaternion) => void): void {
    const p = _a;
    const q = _q2;
    get('pelvis', p, q);
    this.pelvisHolder.position.copy(p);
    this.pelvisHolder.quaternion.copy(q);
    get('torso', p, q);
    this.torso.quaternion.copy(q);
    this.torso.position.set(0, -TORSO / 2, 0).applyQuaternion(q).add(p);
    get('head', p, q);
    this.headGroup.position.copy(p);
    this.headGroup.quaternion.copy(q);
    const limb = (l: Limb, up: SegmentId, lo: SegmentId, len2: number) => {
      get(up, p, q);
      l.upper.position.copy(p);
      l.upper.quaternion.copy(q);
      l.joint.quaternion.copy(q);
      get(lo, p, q);
      l.lower.position.copy(p);
      l.lower.quaternion.copy(q);
      // Elbow / knee cap sits at the proximal end of the lower segment.
      l.joint.position.set(0, -len2 / 2, 0).applyQuaternion(q).add(p);
    };
    limb(this.armL, 'uarmL', 'farmL', FOREARM);
    limb(this.armR, 'uarmR', 'farmR', FOREARM);
    limb(this.legL, 'thighL', 'shinL', SHIN);
    limb(this.legR, 'thighR', 'shinR', SHIN);
    const parents = this.endParents();
    const ends = this.endObjects();
    for (let i = 0; i < 4; i++) {
      parents[i].updateMatrix();
      _m.multiplyMatrices(parents[i].matrix, this.endRel[i]);
      _m.decompose(ends[i].position, ends[i].quaternion, ends[i].scale);
    }
  }

  /** All body parts visible (external cameras) with the helmet shown or hidden (inside it). */
  showBody(helmet: boolean): void {
    this.setFirstPerson(false);
    this.setHeadVisible(helmet);
  }

  dispose(): void {
    for (const g of [this.gloveR, this.gloveL]) for (const geo of g.geometries) geo.dispose();
  }

  /** Place limb meshes from solved joint positions. */
  private placeBone(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    _c.copy(b).sub(a).normalize();
    mesh.quaternion.setFromUnitVectors(UP, _c);
  }

  private solveLimb(limb: Limb, root: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number, endQuat: THREE.Quaternion | null): void {
    const mid = new THREE.Vector3();
    const end = new THREE.Vector3();
    solveTwoBone(root, target, pole, l1, l2, mid, end);
    this.placeBone(limb.upper, root, mid);
    this.placeBone(limb.lower, mid, end);
    limb.joint.position.copy(mid);
    limb.joint.quaternion.copy(limb.upper.quaternion);
    limb.end.position.copy(end);
    if (endQuat) limb.end.quaternion.copy(endQuat);
  }

  /** Apply a pose (all in rider-root space). */
  applyPose(p: RiderPose, handQuat: THREE.Quaternion, footQuatL: THREE.Quaternion, footQuatR: THREE.Quaternion): void {
    this.pelvisHolder.position.copy(p.hip);
    this.pelvisHolder.quaternion.copy(p.torso);
    this.torso.position.copy(p.hip);
    this.torso.quaternion.copy(p.torso);
    const shoulderC = _a.set(0, TORSO, 0).applyQuaternion(p.torso).add(p.hip);
    const sL = new THREE.Vector3(-0.2, -0.05, 0.02).applyQuaternion(p.torso).add(shoulderC);
    const sR = new THREE.Vector3(0.2, -0.05, 0.02).applyQuaternion(p.torso).add(shoulderC);
    const neckBase = new THREE.Vector3(0, TORSO + 0.06, -0.02).applyQuaternion(p.torso).add(p.hip);
    this.headGroup.position.copy(neckBase).add(new THREE.Vector3(0, 0.17, -0.03).applyQuaternion(p.head));
    this.headGroup.quaternion.copy(p.head);
    this.eye.copy(this.headGroup.position).add(new THREE.Vector3(0, 0.0, -0.1).applyQuaternion(p.head));
    this.eyeQuat.copy(p.head);
    this.solveLimb(this.armL, sL, p.handL, p.elbowPoleL, UPPER_ARM, FOREARM, handQuat);
    this.solveLimb(this.armR, sR, p.handR, p.elbowPoleR, UPPER_ARM, FOREARM, handQuat);
    const hL = new THREE.Vector3(-0.11, -0.02, 0).applyQuaternion(p.torso).add(p.hip);
    const hR = new THREE.Vector3(0.11, -0.02, 0).applyQuaternion(p.torso).add(p.hip);
    this.solveLimb(this.legL, hL, p.footL, p.kneePoleL, THIGH, SHIN, footQuatL);
    this.solveLimb(this.legR, hR, p.footR, p.kneePoleR, THIGH, SHIN, footQuatR);
  }

  /** Put a glove on its grip (rider space) and write the wrist target for the arm IK. */
  private placeGlove(g: GloveParts, grip: THREE.Object3D, roll: number, pull: number, wristOut: THREE.Vector3): void {
    _m2.multiplyMatrices(_m, grip.matrixWorld);
    _m2.decompose(g.group.position, _q, _s);
    // Rolling the wrist about the bar axis (grip-space X): negative = knuckles forward = on-throttle.
    g.group.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(RIGHT, roll));
    g.leverFingers.rotation.x = -pull * 0.42;
    wristOut.copy(g.wrist).applyQuaternion(g.group.quaternion).add(g.group.position);
  }

  /** Procedural riding animation driven by the bike state. */
  ride(bike: BikeModel, r: RideParams): void {
    const f = bike.frame;
    const p = this.pose;
    const dt = Math.max(r.dt, 1e-4);
    const sporty = this.style === 'sport' || this.style === 'hyper';
    const hangK = sporty ? 1 : this.style === 'naked' ? 0.55 : 0.2;
    // Smoothed behaviours
    const tuckTarget = sporty ? smoothstep(110, 220, r.speedKmh) : this.style === 'naked' ? smoothstep(150, 240, r.speedKmh) * 0.6 : 0;
    this.tuck = damp(this.tuck, tuckTarget, 2.5, dt);
    const leanFrac = clamp(r.lean / 0.7, -1, 1);
    this.hang = damp(this.hang, leanFrac * hangK, 4, dt);
    // + when accelerating (rider pushed back), − when braking (thrown forward).
    this.torsoLag.x = damp(this.torsoLag.x, clamp(r.accel / 12, -0.8, 0.6), 6, dt);
    const stopped = r.speedKmh < 4;
    this.footDown = damp(this.footDown, stopped ? 1 : 0, stopped ? 5 : 8, dt);
    if (r.shift !== 0) {
      this.shiftT = 0.18;
      this.shiftDir = r.shift;
    }
    this.shiftT = Math.max(0, this.shiftT - dt);
    this.breath += dt;

    // Hips
    p.hip.copy(bike.hipAnchor.position);
    p.hip.x += this.hang * 0.12;
    p.hip.z += this.torsoLag.x * 0.06 - this.tuck * 0.03;
    p.hip.y += -Math.abs(this.hang) * 0.02 + Math.sin(this.breath * 1.7) * 0.003;

    // Torso orientation
    const pitchT = f.torsoPitch + this.tuck * 0.32 - this.torsoLag.x * 0.12 + r.pitch * 0.45;
    const rollT = this.hang * 0.35 + r.lean * 0.12 * hangK;
    _q.setFromEuler(new THREE.Euler(-pitchT, -this.hang * 0.15, -rollT, 'YXZ'));
    p.torso.copy(_q);

    // Head: stays closer to level and looks into the turn / ahead.
    const headPitch = -pitchT * 0.28 + this.tuck * 0.12 - r.pitch * 0.3;
    const headRoll = -rollT * 0.4 + r.lean * 0.55;
    const look = clamp(r.steer * 0.5 + r.lean * 0.25, -0.5, 0.5);
    p.head.setFromEuler(new THREE.Euler(headPitch, -look, headRoll, 'YXZ'));

    // Gloves follow the grips (which follow the steering) in rider space; the throttle hand twists.
    bike.chassis.updateMatrixWorld(true);
    _m.copy(bike.chassis.matrixWorld).invert();
    this.throttleS = damp(this.throttleS, r.throttle ?? 0, 14, dt);
    this.clutchS = damp(this.clutchS, r.clutch ?? 0, 18, dt);
    this.brakeS = damp(this.brakeS, r.brake, 16, dt);
    this.placeGlove(this.gloveR, bike.gripR, -this.throttleS * 0.5, this.brakeS, p.handR);
    this.placeGlove(this.gloveL, bike.gripL, 0, this.clutchS, p.handL);
    p.elbowPoleL.set(p.handL.x - 0.5, p.handL.y - 0.25 - this.tuck * 0.1, p.handL.z + 0.25);
    p.elbowPoleR.set(p.handR.x + 0.5, p.handR.y - 0.25 - this.tuck * 0.1, p.handR.z + 0.25);

    // Feet on the pegs, with gear-change taps and a foot down when stopped.
    p.footL.copy(bike.pegL.position);
    p.footR.copy(bike.pegR.position);
    if (this.shiftT > 0) {
      const k = Math.sin((1 - this.shiftT / 0.18) * Math.PI);
      p.footL.y += k * (this.shiftDir > 0 ? 0.05 : -0.03);
      p.footL.z -= k * 0.04;
    }
    if (this.footDown > 0.001) {
      const ground = new THREE.Vector3(-0.42, 0.04, p.hip.z + 0.05);
      p.footL.lerp(ground, this.footDown);
    }
    const kneeOut = 0.32 + Math.max(0, -leanFrac) * 0.35 * hangK;
    const kneeOutR = 0.32 + Math.max(0, leanFrac) * 0.35 * hangK;
    p.kneePoleL.set(p.hip.x - kneeOut, p.hip.y + 0.1, p.hip.z - 0.8);
    p.kneePoleR.set(p.hip.x + kneeOutR, p.hip.y + 0.1, p.hip.z - 0.8);

    const handQ = _q.setFromEuler(new THREE.Euler(-0.3, 0, 0));
    const footQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(lerp(0.25, -0.1, this.footDown), 0, 0));
    this.applyPose(p, handQ.clone(), footQ, footQ.clone().setFromEuler(new THREE.Euler(0.25, 0, 0)));
  }
}
