import { qrot, qrotInv, v3, vadd, vcopy, vcross, vdot, vlen, vmad, vnorm, vset, vsub, type Q4, type V3 } from './math';
import { Body, CrashWorld, Joint, type Barrier, type BoxShape, type SphereShape } from './world';

/** Rider segment ids (the same order the renderer uses). */
export const SEGMENT_IDS = ['pelvis', 'torso', 'head', 'uarmL', 'uarmR', 'farmL', 'farmR', 'thighL', 'thighR', 'shinL', 'shinR'] as const;
export type SegmentId = (typeof SEGMENT_IDS)[number];

/** Segment dimensions (m) shared with the visual rider model. */
export const RIDER_DIMS = {
  upperArm: 0.3,
  foreArm: 0.29,
  thigh: 0.45,
  shin: 0.45,
  torso: 0.5,
  /** Head centre → neck joint, in head space. */
  neck: { x: 0, y: -0.17, z: 0.03 },
} as const;

export interface Pose {
  x: V3;
  q: Q4;
}
export type RiderPose = Record<SegmentId, Pose>;

export interface BikeInit {
  /** Model origin (rear contact point) and orientation in the world. */
  x: V3;
  q: Q4;
  v: V3;
  w: V3;
  /** Total mass of the bike (kg). */
  mass: number;
  wheelbase: number;
  frontR: number;
  rearR: number;
  seatY: number;
}

export interface CarInit {
  x: V3;
  q: Q4;
  v: V3;
  mass: number;
  length: number;
  width: number;
  height: number;
  heavy: boolean;
}

export interface CrashInit {
  seed: number;
  ground: (x: number, z: number) => number;
  /** Surface grip multiplier (dry tarmac 1, wet ~0.7, snow ~0.35). */
  grip: number;
  bike: BikeInit;
  rider: RiderPose;
  riderVel: V3;
  car?: CarInit;
  barrier?: Barrier;
}

export interface CrashScene {
  world: CrashWorld;
  bike: Body;
  /** Offset of the bike body's centre of mass from the model origin (model space). */
  bikeCom: V3;
  riders: Record<SegmentId, Body>;
  car: Body | null;
  carCom: V3;
  seed: number;
  /** Impact classification at the moment of construction (for effects and audio). */
  kind: 'rearEnd' | 'sideSwipe' | 'glancing' | 'headOn' | 'barrier' | 'fall';
  /** Relative speed of the bike against what it hit (m/s). */
  closing: number;
  /** Advance the whole scene (world + car braking). */
  update(dt: number): void;
  /** Model-space origin of a body given its centre-of-mass offset. */
  originOf(body: Body, com: V3, out: V3): V3;
}

/** Vehicle masses (kg) by archetype id. */
const CAR_MASS: Record<string, number> = { sedan: 1450, hatch: 1250, suv: 1950, pickup: 2150, van: 2400, truck: 9500, semi: 26000, bus: 12500, taxi: 1500, police: 1750 };
export function vehicleMass(kind: string): number {
  return CAR_MASS[kind] ?? 1500;
}

const _a = v3();
const _b = v3();
const _c = v3();

function sphere(x: number, y: number, z: number, r: number): SphereShape {
  return { c: v3(x, y, z), r };
}
function box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): BoxShape {
  return { c: v3(cx, cy, cz), h: v3(hx, hy, hz) };
}

interface SegSpec {
  mass: number;
  r: number;
  halfLen: number;
  spheres: [number, number, number][];
  mu: number;
  mat: Body['mat'];
  angDamp: number;
}

const SEG: Record<SegmentId, SegSpec> = {
  pelvis: { mass: 12, r: 0.13, halfLen: 0.07, spheres: [[-0.07, 0, 0], [0.07, 0, 0]], mu: 0.9, mat: 'leather', angDamp: 0.6 },
  torso: { mass: 26, r: 0.17, halfLen: 0.12, spheres: [[0, -0.11, 0], [0, 0.11, 0]], mu: 0.9, mat: 'leather', angDamp: 0.6 },
  head: { mass: 5.5, r: 0.15, halfLen: 0, spheres: [[0, 0, 0]], mu: 0.55, mat: 'helmet', angDamp: 0.4 },
  uarmL: { mass: 2.4, r: 0.06, halfLen: 0.09, spheres: [[0, -0.09, 0], [0, 0.09, 0]], mu: 0.9, mat: 'leather', angDamp: 1.2 },
  uarmR: { mass: 2.4, r: 0.06, halfLen: 0.09, spheres: [[0, -0.09, 0], [0, 0.09, 0]], mu: 0.9, mat: 'leather', angDamp: 1.2 },
  farmL: { mass: 2.0, r: 0.05, halfLen: 0.095, spheres: [[0, -0.095, 0], [0, 0.095, 0]], mu: 0.8, mat: 'leather', angDamp: 1.2 },
  farmR: { mass: 2.0, r: 0.05, halfLen: 0.095, spheres: [[0, -0.095, 0], [0, 0.095, 0]], mu: 0.8, mat: 'leather', angDamp: 1.2 },
  thighL: { mass: 9, r: 0.085, halfLen: 0.14, spheres: [[0, -0.14, 0], [0, 0.14, 0]], mu: 0.9, mat: 'leather', angDamp: 0.9 },
  thighR: { mass: 9, r: 0.085, halfLen: 0.14, spheres: [[0, -0.14, 0], [0, 0.14, 0]], mu: 0.9, mat: 'leather', angDamp: 0.9 },
  shinL: { mass: 5.5, r: 0.065, halfLen: 0.16, spheres: [[0, -0.16, 0], [0, 0.16, 0]], mu: 0.7, mat: 'leather', angDamp: 0.9 },
  shinR: { mass: 5.5, r: 0.065, halfLen: 0.16, spheres: [[0, -0.16, 0], [0, 0.16, 0]], mu: 0.7, mat: 'leather', angDamp: 0.9 },
};

function angleBetween(a: V3, b: V3): number {
  return Math.acos(Math.max(-1, Math.min(1, vdot(a, b) / (vlen(a) * vlen(b) || 1))));
}

/** Build the whole crash: ragdoll, bike, hit vehicle, barrier, joints and initial velocities. */
export function buildCrash(init: CrashInit): CrashScene {
  const world = new CrashWorld(init.ground);
  world.groundMu = init.grip;

  // ── bike ──
  const bk = init.bike;
  const L = bk.wheelbase;
  const bikeCom = v3(0, 0.5, -L * 0.52);
  const bike = new Body('bike', 'bike');
  bike.massBox(bk.mass, 0.3, 0.5, (L + 0.7) / 2);
  const rel = (x: number, y: number, z: number, r: number) => sphere(x - bikeCom.x, y - bikeCom.y, z - bikeCom.z, r);
  bike.spheres = [
    rel(0, bk.rearR, 0, bk.rearR * 0.97),
    rel(0, bk.frontR, -L, bk.frontR * 0.97),
    rel(-0.4, 1.0, -L * 0.8, 0.05),
    rel(0.4, 1.0, -L * 0.8, 0.05),
    rel(0, bk.seatY + 0.1, -L * 0.8, 0.17),
    rel(0, bk.seatY, 0.4, 0.14),
    rel(-0.27, 0.34, -L * 0.5, 0.13),
    rel(0.27, 0.34, -L * 0.5, 0.13),
    rel(0, 1.12, -L * 0.74, 0.1),
  ];
  bike.mu = 0.5;
  bike.restitution = 0.22;
  bike.mat = 'metal';
  bike.linDamp = 0.01;
  bike.angDamp = 0.03;
  qrot(_a, bk.q, bikeCom);
  vadd(_a, _a, bk.x);
  // A body's angular velocity is about its COM: ω is shared, v at COM = v + ω × (COM - origin).
  vcross(_b, bk.w, qrot(_c, bk.q, bikeCom));
  vadd(_b, _b, bk.v);
  bike.place(_a, bk.q, _b, bk.w);
  world.add(bike);

  // ── rider ──
  const riders = {} as Record<SegmentId, Body>;
  for (const id of SEGMENT_IDS) {
    const sp = SEG[id];
    const b = new Body(id, 'rider');
    b.massCapsule(sp.mass, sp.r, sp.halfLen);
    b.spheres = sp.spheres.map(([x, y, z]) => sphere(x, y, z, sp.r));
    b.mu = sp.mu;
    b.mat = sp.mat;
    b.restitution = id === 'head' ? 0.18 : 0.1;
    b.angDamp = sp.angDamp;
    b.linDamp = 0.03;
    b.place(init.rider[id].x, init.rider[id].q, init.riderVel, v3());
    riders[id] = world.add(b);
  }
  buildJoints(world, riders);

  // ── hit vehicle ──
  let car: Body | null = null;
  const carCom = v3(0, 0.55, 0);
  let closing = vlen(init.riderVel);
  if (init.car) {
    const c = init.car;
    car = new Body('car', 'car');
    const H = c.height;
    const W = c.width;
    const Ln = c.length;
    if (c.heavy || H > 2) {
      const bh = (H - 0.3) / 2;
      carCom.y = 0.6 + H * 0.15;
      car.boxes = [box(0, 0.3 + bh - carCom.y, 0, W / 2, bh, Ln / 2)];
    } else {
      const lowTop = Math.min(H * 0.62, 1.0);
      const lh = (lowTop - 0.25) / 2;
      car.boxes = [
        box(0, 0.25 + lh - carCom.y, 0, W / 2, lh, Ln / 2),
        box(0, lowTop + (H - lowTop) / 2 - carCom.y, Ln * 0.05, W * 0.45, (H - lowTop) / 2, Ln * 0.25),
      ];
    }
    const wr = c.heavy ? 0.5 : 0.33;
    const wx = W / 2 - 0.1;
    const wz = Ln * 0.33;
    car.spheres = [
      sphere(-wx, wr - carCom.y, -wz, wr),
      sphere(wx, wr - carCom.y, -wz, wr),
      sphere(-wx, wr - carCom.y, wz, wr),
      sphere(wx, wr - carCom.y, wz, wr),
    ];
    car.massBox(c.mass, W / 2, H / 2, Ln / 2);
    car.mu = 0.5;
    car.restitution = 0.15;
    car.mat = 'metal';
    car.muLong = 0.02;
    car.muLat = 0.95;
    car.linDamp = 0;
    car.angDamp = 0.05;
    qrot(_a, c.q, carCom);
    vadd(_a, _a, c.x);
    car.place(_a, c.q, c.v, v3());
    world.add(car);
    vsub(_b, bike.v, car.v);
    closing = vlen(_b);
    // Start in contact, not inside it: the session's collision box is a little generous.
    vnorm(_c, _b);
    for (let i = 0; i < 40; i++) {
      if (world.maxPenetration(bike, car) < 0.01 && world.maxPenetrationRider(car) < 0.01) break;
      const d = -0.04;
      for (const body of [bike, ...SEGMENT_IDS.map((id) => riders[id])]) {
        vmad(body.x, _c, d);
        vcopy(body.px, body.x);
      }
    }
  }
  if (init.barrier) world.barrier = init.barrier;

  // ── classification ──
  let kind: CrashScene['kind'] = 'fall';
  if (init.barrier) kind = 'barrier';
  if (car && init.car) {
    // Where the bike meets the car, in the car's frame (car forward = −Z).
    qrotInv(_a, init.car.q, vsub(_a, bike.x, car.x));
    const hx = init.car.width / 2;
    const hz = init.car.length / 2;
    const centred = Math.abs(_a.x) < hx * 0.7;
    if (_a.z > hz - 0.6) kind = centred ? 'rearEnd' : 'glancing';
    else if (_a.z < -(hz - 0.6)) kind = centred ? 'headOn' : 'glancing';
    else kind = 'sideSwipe';
  }

  const scene: CrashScene = {
    world,
    bike,
    bikeCom,
    riders,
    car,
    carCom,
    seed: init.seed,
    kind,
    closing,
    originOf(body, com, out) {
      qrot(out, body.q, com);
      return vsub(out, body.x, out);
    },
    update(dt) {
      if (car && init.car) {
        // The driver stands on the brake shortly after the impact.
        const t = world.time;
        const k = Math.min(1, Math.max(0, (t - 0.45) / 0.6));
        car.muLong = 0.02 + k * (init.car.heavy ? 0.5 : 0.72);
      }
      world.step(dt);
    },
  };
  return scene;
}

function buildJoints(world: CrashWorld, r: Record<SegmentId, Body>): void {
  const anchor = v3();
  const local = (b: Body, p: V3, o: V3) => {
    qrot(o, b.q, p);
    return vadd(o, o, b.x);
  };
  const ax = (x: number, y: number, z: number) => v3(x, y, z);
  const Y = ax(0, 1, 0);
  const mY = ax(0, -1, 0);
  const initAngle = (a: Body, la: V3, b: Body, lb: V3): number => {
    qrot(_a, a.q, la);
    qrot(_b, b.q, lb);
    return angleBetween(_a, _b);
  };

  // spine
  vcopy(anchor, r.pelvis.x);
  world.joints.push(new Joint(r.pelvis, r.torso, anchor, { cone: { axisA: Y, axisB: Y, max: Math.max(0.5, initAngle(r.pelvis, Y, r.torso, Y) + 0.12) }, damping: 6 }));
  // neck
  local(r.head, v3(RIDER_DIMS.neck.x, RIDER_DIMS.neck.y, RIDER_DIMS.neck.z), anchor);
  world.joints.push(new Joint(r.torso, r.head, anchor, { cone: { axisA: Y, axisB: Y, max: Math.max(0.75, initAngle(r.torso, Y, r.head, Y) + 0.12) }, damping: 8 }));
  for (const s of ['L', 'R'] as const) {
    const ua = r[`uarm${s}`];
    const fa = r[`farm${s}`];
    const th = r[`thigh${s}`];
    const sh = r[`shin${s}`];
    // shoulder
    local(ua, v3(0, -RIDER_DIMS.upperArm / 2, 0), anchor);
    world.joints.push(new Joint(r.torso, ua, anchor, { cone: { axisA: mY, axisB: Y, max: Math.max(2.4, initAngle(r.torso, mY, ua, Y) + 0.15) }, damping: 3 }));
    // elbow (hinge, flexes one way only)
    local(fa, v3(0, -RIDER_DIMS.foreArm / 2, 0), anchor);
    world.joints.push(new Joint(ua, fa, anchor, { hinge: hingeFor(ua, fa, 2.55), damping: 3 }));
    // hip
    local(th, v3(0, -RIDER_DIMS.thigh / 2, 0), anchor);
    world.joints.push(new Joint(r.pelvis, th, anchor, { cone: { axisA: mY, axisB: Y, max: Math.max(2.1, initAngle(r.pelvis, mY, th, Y) + 0.15) }, damping: 3 }));
    // knee
    local(sh, v3(0, -RIDER_DIMS.shin / 2, 0), anchor);
    world.joints.push(new Joint(th, sh, anchor, { hinge: hingeFor(th, sh, 2.5), damping: 3 }));
  }
}

/** Hinge limits derived from the current bend plane of two straight-ish bones. */
function hingeFor(a: Body, b: Body, hi: number): NonNullable<import('./world').JointOpts['hinge']> {
  const Y = v3(0, 1, 0);
  qrot(_a, a.q, Y);
  qrot(_b, b.q, Y);
  vcross(_c, _a, _b);
  let angle = vnorm(_c, _c);
  if (angle < 0.05) {
    // Straight limb: bend about the body's sideways axis, towards the rider's front/back.
    vset(_c, 1, 0, 0);
    qrot(_c, a.q, _c);
    angle = 0;
  }
  const axisA = qrotInv(v3(), a.q, _c);
  const axisB = qrotInv(v3(), b.q, _c);
  const phi = Math.atan2(angle, vdot(_a, _b));
  return { axisA, axisB, refA: v3(0, 1, 0), refB: v3(0, 1, 0), lo: -0.1, hi: Math.max(hi, phi + 0.1) };
}

