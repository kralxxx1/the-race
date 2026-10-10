import * as THREE from 'three';
import { clamp, damp, lerp, noise1, smoothstep } from '../core/math';

export interface CameraInput {
  dt: number;
  /** Rebased world position of the bike's ground contact (rear). */
  bikePos: THREE.Vector3;
  /** Heading of the bike (three.js yaw, includes road yaw). */
  yaw: number;
  roadPitch: number;
  lean: number;
  wheelie: number;
  speed: number;
  accel: number;
  rpmFrac: number;
  /** Helmet camera eye (world) and orientation. */
  eye: THREE.Vector3;
  eyeQuat: THREE.Quaternion;
  shakeEnabled: boolean;
}

const _target = new THREE.Vector3();
const _look = new THREE.Vector3();
const _off = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const FWD = new THREE.Vector3(0, 0, -1);

/** Gameplay is first-person only; the other rigs remain for crash/intro shots. */
export type CameraMode = 'helmet' | 'chase' | 'far' | 'low';

/** Chase / helmet / cinematic camera with spring smoothing, speed FOV and trauma shake. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'helmet';
  private pos = new THREE.Vector3();
  /** Smoothed camera offset relative to the bike (no speed-proportional lag). */
  private rel = new THREE.Vector3();
  private prevBike = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private yawS = 0;
  private trauma = 0;
  private time = 0;
  private initialized = false;
  private introT = 0;
  private crashT = 0;
  private fovS = 65;
  private accelLag = 0;
  private rollS = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.05, 6000);
  }

  setMode(m: CameraMode): void {
    this.mode = m;
  }

  addTrauma(t: number): void {
    this.trauma = clamp(this.trauma + t, 0, 1);
  }

  /** Begin the pre-race orbit that ends behind the bike. */
  startIntro(duration = 3): void {
    this.introT = duration;
    this.initialized = false;
  }

  snap(): void {
    this.initialized = false;
  }

  private rigFor(mode: CameraMode): { off: [number, number, number]; look: [number, number, number]; fov: number; roll: number } {
    switch (mode) {
      case 'far':
        return { off: [0, 2.6, 7.4], look: [0, 1.1, -12], fov: 60, roll: 0.15 };
      case 'low':
        return { off: [0.55, 0.42, 2.3], look: [0, 0.65, -12], fov: 68, roll: 0.55 };
      case 'helmet':
        return { off: [0, 1.4, 0], look: [0, 1.2, -20], fov: 74, roll: 0.5 };
      default:
        return { off: [0, 1.5, 4.0], look: [0, 0.95, -8], fov: 64, roll: 0.25 };
    }
  }

  update(c: CameraInput): void {
    const dt = Math.max(c.dt, 1e-4);
    this.time += dt;
    const cam = this.camera;
    const spd = c.speed;
    const rig = this.rigFor(this.mode);

    if (!this.initialized) {
      this.yawS = c.yaw;
      this.initialized = true;
      this.rel.set(...rig.off).applyAxisAngle(THREE.Object3D.DEFAULT_UP, c.yaw);
      this.pos.copy(c.bikePos).add(this.rel);
      this.lookAt.copy(c.bikePos);
      this.prevBike.copy(c.bikePos);
    }
    // Smoothed heading so the camera swings gently through lane changes.
    let dy = c.yaw - this.yawS;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yawS += dy * (1 - Math.exp(-(this.mode === 'helmet' ? 30 : 6) * dt));
    this.accelLag = damp(this.accelLag, clamp(c.accel, -12, 12), 3, dt);

    if (this.mode === 'helmet') {
      cam.position.copy(c.eye);
      // Head keeps the horizon steadier than the bike: blend the eye orientation towards upright.
      _e.setFromQuaternion(c.eyeQuat, 'YXZ');
      _e.z *= 0.75;
      // Look down a touch so the dash, screen and bars frame the bottom of the view.
      _e.x -= 0.16;
      cam.quaternion.setFromEuler(_e);
      // Engine vibration and road texture
      const vib = (0.0006 + c.rpmFrac * 0.0012) * (c.shakeEnabled ? 1 : 0);
      cam.position.y += Math.sin(this.time * 190) * vib + noise1(this.time * 9, 3) * 0.002 * smoothstep(5, 40, spd);
      this.pos.copy(cam.position);
    } else {
      _off.set(rig.off[0], rig.off[1] + c.wheelie * 0.5, rig.off[2] - this.accelLag * 0.03 + smoothstep(20, 90, spd) * 0.35);
      _off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yawS);
      _off.y += Math.sin(c.roadPitch) * -2;
      // Smooth the offset in the bike's frame; the camera itself rides along rigidly,
      // so there is no lag proportional to speed (only to changes in heading/accel).
      const k = this.mode === 'low' ? 14 : 8;
      this.rel.x = damp(this.rel.x, _off.x, k, dt);
      this.rel.z = damp(this.rel.z, _off.z, k, dt);
      this.rel.y = damp(this.rel.y, _off.y, 6, dt);
      // Vertical follow is softened so bumps and crests feel physical.
      const dyBike = c.bikePos.y - this.prevBike.y;
      this.prevBike.copy(c.bikePos);
      this.pos.x = c.bikePos.x + this.rel.x;
      this.pos.z = c.bikePos.z + this.rel.z;
      this.pos.y = damp(this.pos.y + dyBike, c.bikePos.y + this.rel.y, 12, dt);
      _look.set(rig.look[0], rig.look[1], rig.look[2]).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yawS).add(c.bikePos);
      this.lookAt.copy(_look);
      cam.position.copy(this.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.lookAt);
      this.rollS = damp(this.rollS, -c.lean * rig.roll, 5, dt);
      _q.setFromAxisAngle(FWD, this.rollS);
      cam.quaternion.multiply(_q);
    }

    // Pre-race cinematic: orbit from the front to the riding view.
    if (this.introT > 0) {
      this.introT = Math.max(0, this.introT - dt);
      const t = 1 - this.introT / 3;
      const ease = t * t * (3 - 2 * t);
      const ang = lerp(Math.PI * 0.85, 0, ease);
      _off.set(Math.sin(ang) * lerp(5, 1, ease) + 1.2 * (1 - ease), lerp(1.1, 1.5, ease), Math.cos(ang) * 4.2).applyAxisAngle(THREE.Object3D.DEFAULT_UP, c.yaw);
      const p = _target.copy(c.bikePos).add(_off);
      cam.position.lerp(p, 1 - ease * ease);
      _look.copy(c.bikePos).add(new THREE.Vector3(0, 0.8, 0));
      const m = new THREE.Matrix4().lookAt(cam.position, _look, THREE.Object3D.DEFAULT_UP);
      _q2.setFromRotationMatrix(m);
      cam.quaternion.slerp(_q2, 1 - ease * ease);
    }

    // Speed sensation: wider FOV and a little high-frequency shake.
    const fovTarget = rig.fov + smoothstep(15, 95, spd) * (this.mode === 'helmet' ? 18 : 14);
    this.fovS = damp(this.fovS, fovTarget, 2.5, dt);
    cam.fov = this.fovS;
    const speedShake = c.shakeEnabled ? smoothstep(55, 110, spd) * 0.15 : 0;
    const tr = Math.min(1, this.trauma * this.trauma + speedShake * 0.08);
    if (tr > 0.0005 && c.shakeEnabled) {
      const a = tr * 0.06;
      _e.set(noise1(this.time * 23, 1) * a, noise1(this.time * 21, 2) * a, noise1(this.time * 19, 3) * a * 0.6);
      _q.setFromEuler(_e);
      cam.quaternion.multiply(_q);
      cam.position.y += noise1(this.time * 31, 4) * tr * 0.08;
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    cam.updateProjectionMatrix();
  }

  /** Cinematic crash camera orbiting the tumbling rider. */
  crash(dt: number, focus: THREE.Vector3, yaw: number): void {
    this.crashT += dt;
    const cam = this.camera;
    const ang = yaw + Math.PI * 0.6 + this.crashT * 0.35;
    const dist = 6.5 + Math.min(4, this.crashT * 1.2);
    _target.set(focus.x + Math.sin(ang) * dist, focus.y + 2.2 + this.crashT * 0.25, focus.z + Math.cos(ang) * dist);
    cam.position.lerp(_target, 1 - Math.exp(-2.5 * dt));
    this.lookAt.lerp(focus, 1 - Math.exp(-6 * dt));
    cam.up.set(0, 1, 0);
    cam.lookAt(this.lookAt);
    this.fovS = damp(this.fovS, 55, 2, dt);
    cam.fov = this.fovS;
    if (this.trauma > 0) {
      const a = this.trauma * this.trauma * 0.08;
      _e.set(noise1(this.time * 23, 1) * a, noise1(this.time * 21, 2) * a, 0);
      cam.quaternion.multiply(_q.setFromEuler(_e));
      this.trauma = Math.max(0, this.trauma - dt);
    }
    this.time += dt;
    cam.updateProjectionMatrix();
  }

  resetCrash(): void {
    this.crashT = 0;
  }

  /** Shift internal smoothing state when the world origin is rebased. */
  shift(d: THREE.Vector3): void {
    this.prevBike.sub(d);
    this.pos.sub(d);
    this.lookAt.sub(d);
    this.camera.position.sub(d);
  }
}
