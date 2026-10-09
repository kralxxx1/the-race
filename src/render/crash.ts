import * as THREE from 'three';
import { clamp, noise1 } from '../core/math';
import type { BikeModel } from './bikeModel';
import type { Smoke, Sparks } from './effects';
import { makePose, type RiderModel } from './riderModel';

interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  angVel: THREE.Vector3;
  radius: number;
  restitution: number;
  friction: number;
  grounded: number;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

function integrate(b: Body, dt: number, ground: (x: number, z: number) => number): number {
  b.vel.y -= 9.81 * dt;
  b.pos.addScaledVector(b.vel, dt);
  const w = b.angVel.length();
  if (w > 1e-5) {
    _q.setFromAxisAngle(_v.copy(b.angVel).divideScalar(w), w * dt);
    b.quat.premultiply(_q).normalize();
  }
  const gy = ground(b.pos.x, b.pos.z) + b.radius;
  let impact = 0;
  if (b.pos.y < gy) {
    b.pos.y = gy;
    if (b.vel.y < 0) {
      impact = -b.vel.y;
      b.vel.y = -b.vel.y * b.restitution;
      if (b.vel.y < 0.6) b.vel.y = 0;
    }
    // Sliding friction on the tarmac (~0.6 g for leathers, ~0.45 g for plastics/metal).
    const hv = Math.hypot(b.vel.x, b.vel.z);
    if (hv > 1e-3) {
      const dec = Math.min(hv, b.friction * 9.81 * dt);
      b.vel.x -= (b.vel.x / hv) * dec;
      b.vel.z -= (b.vel.z / hv) * dec;
    }
    b.angVel.multiplyScalar(Math.exp(-2.6 * dt));
    b.grounded = 1;
  } else {
    b.grounded = Math.max(0, b.grounded - dt * 4);
  }
  return impact;
}

/** Debris shards (fairing plastic, mirror glass) thrown on impact. */
class Debris {
  readonly mesh: THREE.InstancedMesh;
  private bodies: Body[] = [];
  private scales: number[] = [];
  private tmp = new THREE.Matrix4();

  constructor(color: string, n = 18) {
    const g = new THREE.BoxGeometry(1, 0.15, 0.7);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 });
    this.mesh = new THREE.InstancedMesh(g, m, n);
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  burst(origin: THREE.Vector3, vel: THREE.Vector3): void {
    const n = this.mesh.instanceMatrix.count;
    this.bodies = [];
    this.scales = [];
    for (let i = 0; i < n; i++) {
      this.bodies.push({
        pos: origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5)),
        vel: vel.clone().multiplyScalar(0.6 + Math.random() * 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 7, 1 + Math.random() * 5, (Math.random() - 0.5) * 7)),
        quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
        angVel: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
        radius: 0.02,
        restitution: 0.3,
        friction: 0.5,
        grounded: 0,
      });
      this.scales.push(0.05 + Math.random() * 0.13);
    }
    this.mesh.count = n;
  }

  update(dt: number, ground: (x: number, z: number) => number): void {
    this.bodies.forEach((b, i) => {
      integrate(b, dt, ground);
      const s = this.scales[i];
      this.tmp.compose(b.pos, b.quat, _v.set(s, s, s));
      this.mesh.setMatrixAt(i, this.tmp);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  shift(d: THREE.Vector3): void {
    for (const b of this.bodies) b.pos.sub(d);
  }
}

/**
 * Visual crash simulation: the motorcycle tumbles and slides on its side
 * throwing sparks, the rider is thrown and rag-dolls down the road.
 */
export class CrashSim {
  private bike: Body;
  private rider: Body;
  private t = 0;
  private side: number;
  readonly debris: Debris;
  private pose = makePose();
  private seed = Math.random() * 100;
  private bikeYaw: number;
  done = false;

  constructor(
    private bikeModel: BikeModel,
    private riderModel: RiderModel,
    private scene: THREE.Object3D,
    vel: THREE.Vector3,
    impactSpeed: number,
    lean: number,
    hitSide: number,
  ) {
    const root = bikeModel.root;
    root.updateMatrixWorld(true);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    root.matrixWorld.decompose(pos, quat, new THREE.Vector3());
    this.bikeYaw = new THREE.Euler().setFromQuaternion(quat, 'YXZ').y;
    this.side = lean !== 0 ? Math.sign(lean) : hitSide || (Math.random() < 0.5 ? -1 : 1);
    const k = clamp(impactSpeed / 30, 0.3, 1.6);
    this.bike = {
      pos: pos.clone().add(new THREE.Vector3(0, 0.35, 0)),
      vel: vel.clone().multiplyScalar(0.55).add(new THREE.Vector3(hitSide * 2.5 * k, 2.0 * k, 0)),
      quat: quat.clone(),
      angVel: new THREE.Vector3((Math.random() - 0.3) * 4 * k, (Math.random() - 0.5) * 6 * k, -this.side * 5 * k),
      radius: 0.32,
      restitution: 0.25,
      friction: 0.45,
      grounded: 0,
    };
    // Detach the rider and keep its world transform.
    riderModel.root.updateMatrixWorld(true);
    const hip = new THREE.Vector3().copy(riderModel.pose.hip).applyMatrix4(riderModel.root.matrixWorld);
    this.rider = {
      pos: hip,
      vel: vel.clone().multiplyScalar(0.92).add(new THREE.Vector3(hitSide * 1.5 + (Math.random() - 0.5) * 2, 3 + 2.5 * k, 0)),
      quat: quat.clone(),
      angVel: new THREE.Vector3((Math.random() + 0.5) * 6 * k, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6 * k),
      radius: 0.2,
      restitution: 0.3,
      friction: 0.75,
      grounded: 0,
    };
    scene.add(riderModel.root);
    riderModel.root.position.set(0, 0, 0);
    riderModel.root.quaternion.identity();
    riderModel.setHeadVisible(true);
    this.debris = new Debris(bikeModel.livery.primary);
    this.debris.burst(pos, vel);
    scene.add(this.debris.mesh);
    // Bike root is moved into world space too.
    scene.add(root);
  }

  /** Current rider position (for the crash camera). */
  get focus(): THREE.Vector3 {
    return this.rider.pos;
  }

  get bikeSpeed(): number {
    return this.bike.vel.length();
  }

  get riderSpeed(): number {
    return this.rider.vel.length();
  }

  update(dt: number, ground: (x: number, z: number) => number, sparks: Sparks, smoke: Smoke): number {
    this.t += dt;
    const b = this.bike;
    let impact = integrate(b, dt, ground);
    // Once the bike touches down it falls onto its side and slides.
    if (b.grounded > 0.5) {
      const yaw = new THREE.Euler().setFromQuaternion(b.quat, 'YXZ').y;
      const rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, this.side * 1.38, 'YXZ'));
      b.quat.slerp(rest, 1 - Math.exp(-5 * dt));
      b.angVel.x *= Math.exp(-6 * dt);
      b.angVel.z *= Math.exp(-6 * dt);
      const hv = Math.hypot(b.vel.x, b.vel.z);
      if (hv > 2) {
        sparks.emit(b.pos.x, b.pos.y - 0.25, b.pos.z, b.vel.x * 0.6, 1.2, b.vel.z * 0.6, Math.min(8, 1 + Math.floor(hv / 4)), 2.5);
        if (Math.random() < 0.3) smoke.emit(b.pos.x, b.pos.y - 0.2, b.pos.z, b.vel.x * 0.2, 0.4, b.vel.z * 0.2, { size: 0.7, life: 1.2, alpha: 0.35, shade: 0.8 });
      }
    }
    const root = this.bikeModel.root;
    root.position.copy(b.pos).sub(_w.set(0, 0.35, 0).applyQuaternion(b.quat));
    root.quaternion.copy(b.quat);

    const r = this.rider;
    const ri = integrate(r, dt, ground);
    impact = Math.max(impact, ri);
    if (ri > 2) smoke.emit(r.pos.x, r.pos.y - 0.1, r.pos.z, r.vel.x * 0.3, 0.6, r.vel.z * 0.3, { size: 0.9, life: 1.4, alpha: 0.3, shade: 0.75, n: 3 });
    if (r.grounded > 0.5) {
      // Settle lying on the back/side.
      const yaw = new THREE.Euler().setFromQuaternion(r.quat, 'YXZ').y;
      const rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.15, yaw, 0.3, 'YXZ'));
      r.quat.slerp(rest, 1 - Math.exp(-(this.riderSpeed < 2 ? 3 : 1.2) * dt));
    }
    this.poseRider();
    this.debris.update(dt, ground);
    if (this.t > 6 && this.bikeSpeed < 0.2 && this.riderSpeed < 0.2) this.done = true;
    return impact;
  }

  private poseRider(): void {
    const p = this.pose;
    const t = this.t;
    const r = this.rider;
    const rm = this.riderModel;
    // The rider root follows the tumbling body; the pelvis sits at its centre.
    rm.root.position.copy(r.pos);
    rm.root.quaternion.copy(r.quat);
    p.hip.set(0, 0, 0);
    // Flail while airborne and sliding, go limp as speed drops.
    const energy = clamp(this.riderSpeed / 8, 0, 1);
    const n = (k: number, f: number) => noise1(t * f + this.seed + k * 13.7, k) * energy;
    p.torso.setFromEuler(new THREE.Euler(n(1, 3) * 0.8 - 0.2, n(2, 2) * 0.4, n(3, 3) * 0.6));
    p.head.setFromEuler(new THREE.Euler(n(4, 4) * 0.7, n(5, 3) * 0.8, n(6, 4) * 0.5));
    const spread = 1 - energy * 0.4;
    p.handL.set(-0.55 * spread + n(7, 5) * 0.25, 0.55 + n(8, 5) * 0.35, -0.15 + n(9, 6) * 0.4);
    p.handR.set(0.55 * spread + n(10, 5) * 0.25, 0.55 + n(11, 5) * 0.35, -0.15 + n(12, 6) * 0.4);
    p.footL.set(-0.25 + n(13, 4) * 0.3, -0.8 + n(14, 4) * 0.25, 0.1 + n(15, 5) * 0.5);
    p.footR.set(0.25 + n(16, 4) * 0.3, -0.8 + n(17, 4) * 0.25, 0.1 + n(18, 5) * 0.5);
    p.elbowPoleL.set(-1, 0.2, 0.4);
    p.elbowPoleR.set(1, 0.2, 0.4);
    p.kneePoleL.set(-0.2, -0.3, -1);
    p.kneePoleR.set(0.2, -0.3, -1);
    rm.applyPose(p, new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion());
  }

  shift(d: THREE.Vector3): void {
    this.bike.pos.sub(d);
    this.rider.pos.sub(d);
    this.debris.shift(d);
  }

  get yaw(): number {
    return this.bikeYaw;
  }

  dispose(): void {
    this.scene.remove(this.debris.mesh);
    this.debris.mesh.geometry.dispose();
    (this.debris.mesh.material as THREE.Material).dispose();
    this.debris.mesh.dispose();
  }
}
