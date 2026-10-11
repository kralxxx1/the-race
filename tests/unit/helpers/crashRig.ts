import * as THREE from 'three';
import { solveTwoBone } from '../../../src/render/riderModel';
import { buildCrash, RIDER_DIMS, SEGMENT_IDS, type CrashInit, type CrashScene, type Pose, type RiderPose, type SegmentId } from '../../../src/physics/crash/scenario';
import { q4, v3, type Q4, type V3 } from '../../../src/physics/crash/math';

/** A seated sport-bike rider (bike space: +Y up, −Z forward, rear axle at the origin). */
export function seatedRider(): RiderPose {
  const hip = new THREE.Vector3(0, 0.84, -0.22);
  const torsoQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.75, 0, 0, 'YXZ'));
  const up = new THREE.Vector3(0, 1, 0);
  const pose = {} as RiderPose;
  const put = (id: SegmentId, pos: THREE.Vector3, q: THREE.Quaternion) => {
    pose[id] = { x: v3(pos.x, pos.y, pos.z), q: { x: q.x, y: q.y, z: q.z, w: q.w } };
  };
  // pelvis & torso (COM at +TORSO/2 along the torso axis)
  put('pelvis', hip, torsoQ);
  put('torso', hip.clone().add(up.clone().multiplyScalar(RIDER_DIMS.torso / 2).applyQuaternion(torsoQ)), torsoQ);
  const neckBase = new THREE.Vector3(0, RIDER_DIMS.torso + 0.06, -0.02).applyQuaternion(torsoQ).add(hip);
  const headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0, 0, 'YXZ'));
  put('head', neckBase.clone().add(new THREE.Vector3(0, 0.17, -0.03).applyQuaternion(headQ)), headQ);
  const mid = new THREE.Vector3();
  const end = new THREE.Vector3();
  const limb = (idA: SegmentId, idB: SegmentId, root: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number) => {
    solveTwoBone(root, target, pole, l1, l2, mid, end);
    const place = (id: SegmentId, a: THREE.Vector3, b: THREE.Vector3) => {
      const q = new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize());
      put(id, a.clone().add(b).multiplyScalar(0.5), q);
    };
    place(idA, root, mid);
    place(idB, mid, end);
  };
  for (const s of [-1, 1]) {
    const sh = new THREE.Vector3(s * 0.2, RIDER_DIMS.torso - 0.05, 0.02).applyQuaternion(torsoQ).add(hip);
    const grip = new THREE.Vector3(s * 0.36, 0.98, -0.62);
    limb(s < 0 ? 'uarmL' : 'uarmR', s < 0 ? 'farmL' : 'farmR', sh, grip, new THREE.Vector3(s * 0.8, 0.8, -0.2), RIDER_DIMS.upperArm, RIDER_DIMS.foreArm);
    const hp = new THREE.Vector3(s * 0.11, -0.02, 0).applyQuaternion(torsoQ).add(hip);
    const peg = new THREE.Vector3(s * 0.26, 0.38, -0.12 + 0.0);
    limb(s < 0 ? 'thighL' : 'thighR', s < 0 ? 'shinL' : 'shinR', hp, peg, new THREE.Vector3(s * 0.4, 0.9, -0.9), RIDER_DIMS.thigh, RIDER_DIMS.shin);
  }
  return pose;
}

/** Transform a bike-space pose into the world by a rigid transform. */
export function transformPose(p: RiderPose, origin: V3, q: Q4): RiderPose {
  const out = {} as RiderPose;
  const Q = new THREE.Quaternion(q.x, q.y, q.z, q.w);
  for (const id of SEGMENT_IDS) {
    const pos = new THREE.Vector3(p[id].x.x, p[id].x.y, p[id].x.z).applyQuaternion(Q).add(new THREE.Vector3(origin.x, origin.y, origin.z));
    const rq = Q.clone().multiply(new THREE.Quaternion(p[id].q.x, p[id].q.y, p[id].q.z, p[id].q.w));
    out[id] = { x: v3(pos.x, pos.y, pos.z), q: { x: rq.x, y: rq.y, z: rq.z, w: rq.w } } as Pose;
  }
  return out;
}

export interface RigOpts {
  /** Bike speed (m/s) along −Z. */
  bikeSpeed?: number;
  carSpeed?: number;
  /** Lateral offset of the bike relative to the car centre (m). */
  offset?: number;
  car?: boolean;
  carHeavy?: boolean;
  seed?: number;
  /** Bike yaw (rad) relative to the car heading. */
  yaw?: number;
}

/** Bike at z = 0 heading −Z, optional car ahead of it, flat ground. */
export function rig(o: RigOpts = {}): CrashScene {
  const bikeSpeed = o.bikeSpeed ?? 30;
  const yaw = o.yaw ?? 0;
  const bq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  const q: Q4 = { x: bq.x, y: bq.y, z: bq.z, w: bq.w };
  const origin = v3(o.offset ?? 0, 0, 0);
  const vel = new THREE.Vector3(0, 0, -bikeSpeed).applyQuaternion(bq);
  const init: CrashInit = {
    seed: o.seed ?? 1,
    ground: () => 0,
    grip: 1,
    bike: { x: origin, q, v: v3(vel.x, 0, vel.z), w: v3(), mass: 205, wheelbase: 1.45, frontR: 0.3, rearR: 0.315, seatY: 0.82 },
    rider: transformPose(seatedRider(), origin, q),
    riderVel: v3(vel.x, 0, vel.z),
  };
  if (o.car !== false && o.car !== undefined) {
    const heavy = o.carHeavy ?? false;
    const length = heavy ? 8.2 : 4.7;
    const carSpeed = o.carSpeed ?? 16;
    const h = heavy ? 3.5 : 1.45;
    // Car rear bumper ≈ 1 m ahead of the bike's front wheel.
    init.car = { x: v3(0, 0, -(1.45 + 0.6 + length / 2)), q: q4(), v: v3(0, 0, -carSpeed), mass: heavy ? 9500 : 1450, length, width: heavy ? 2.45 : 1.84, height: h, heavy };
  }
  return buildCrash(init);
}
