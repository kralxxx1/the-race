import * as THREE from 'three';
import { clamp, damp, lerp, noise1, smoothstep } from '../core/math';
import type { HeadPose } from './fpv/headMotion';

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
  /** Chassis (sprung body) world matrix: the helmet eye is authored in this space. */
  chassis: THREE.Matrix4;
  /** Blueprint helmet eye point in chassis space (BikeFrame.eye). */
  eyeLocal: THREE.Vector3;
  /** Head dynamics for this frame (offsets in bike space, rotations relative to the bike). */
  head: HeadPose;
  /** Base vertical FOV (deg) before the speed/punch additions in `head.fovAdd`. */
  baseFov: number;
  /** Camera shake gain (0 = none). */
  shake: number;
}

const _target = new THREE.Vector3();
const _look = new THREE.Vector3();
const _off = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _e = new THREE.Euler();
const _neck = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

/** The neck pivots ~11 cm below and ~8 cm behind the eyes: turning the head swings the eyes around it. */
const NECK_DOWN = 0.11;
const NECK_BACK = 0.085;
/** Resting look-down relative to the horizon so the screen, dash and bars frame the bottom of the view. */
const BASE_PITCH = -0.2;

/** Gameplay is first-person only; the other rigs remain for crash/intro shots. */
export type CameraMode = 'helmet' | 'chase' | 'far' | 'low';

/** First-person helmet rig, plus the cinematic rigs used for the intro and crash replay. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'helmet';
  private pos = new THREE.Vector3();
  private rel = new THREE.Vector3();
  private prevBike = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private yawS = 0;
  private trauma = 0;
  private time = 0;
  private initialised = false;
  private introT = 0;
  private crashT = 0;
  private fovS = 74;
  private accelLag = 0;
  private rollS = 0;
  // Crash cameras
  private fpvQuat = new THREE.Quaternion();
  private fpvInit = false;
  private cineInit = false;
  private cineAngle = 0;
  private cineFocus = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(74, aspect, 0.05, 6000);
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
    this.initialised = false;
  }

  snap(): void {
    this.initialised = false;
    this.fpvInit = false;
    this.cineInit = false;
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

    if (!this.initialised) {
      this.yawS = c.yaw;
      this.initialised = true;
      this.rel.set(...rig.off).applyAxisAngle(UP, c.yaw);
      this.pos.copy(c.bikePos).add(this.rel);
      this.lookAt.copy(c.bikePos);
      this.prevBike.copy(c.bikePos);
    }
    let dy = c.yaw - this.yawS;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yawS += dy * (1 - Math.exp(-(this.mode === 'helmet' ? 30 : 6) * dt));
    this.accelLag = damp(this.accelLag, clamp(c.accel, -12, 12), 3, dt);

    if (this.mode === 'helmet') {
      this.placeHelmet(c);
    } else {
      _off.set(rig.off[0], rig.off[1] + c.wheelie * 0.5, rig.off[2] - this.accelLag * 0.03 + smoothstep(20, 90, spd) * 0.35);
      _off.applyAxisAngle(UP, this.yawS);
      _off.y += Math.sin(c.roadPitch) * -2;
      const k = this.mode === 'low' ? 14 : 8;
      this.rel.x = damp(this.rel.x, _off.x, k, dt);
      this.rel.z = damp(this.rel.z, _off.z, k, dt);
      this.rel.y = damp(this.rel.y, _off.y, 6, dt);
      const dyBike = c.bikePos.y - this.prevBike.y;
      this.prevBike.copy(c.bikePos);
      this.pos.x = c.bikePos.x + this.rel.x;
      this.pos.z = c.bikePos.z + this.rel.z;
      this.pos.y = damp(this.pos.y + dyBike, c.bikePos.y + this.rel.y, 12, dt);
      _look.set(rig.look[0], rig.look[1], rig.look[2]).applyAxisAngle(UP, this.yawS).add(c.bikePos);
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
      _off.set(Math.sin(ang) * lerp(5, 1, ease) + 1.2 * (1 - ease), lerp(1.1, 1.5, ease), Math.cos(ang) * 4.2).applyAxisAngle(UP, c.yaw);
      const p = _target.copy(c.bikePos).add(_off);
      cam.position.lerp(p, 1 - ease * ease);
      _look.copy(c.bikePos);
      _look.y += 0.8;
      _m4.lookAt(cam.position, _look, UP);
      _q2.setFromRotationMatrix(_m4);
      cam.quaternion.slerp(_q2, 1 - ease * ease);
    }

    // Field of view: base + speed + close-pass punch (chase rigs keep their own).
    const fovTarget = this.mode === 'helmet' ? c.baseFov + c.head.fovAdd : rig.fov + smoothstep(15, 95, spd) * 14;
    this.fovS = this.mode === 'helmet' ? fovTarget : damp(this.fovS, fovTarget, 2.5, dt);
    cam.fov = this.fovS;
    // Impact/landing trauma shake (quadratic so small bumps barely register).
    const tr = Math.min(1, this.trauma * this.trauma) * c.shake;
    if (tr > 0.0005) {
      const a = tr * (this.mode === 'helmet' ? 0.045 : 0.06);
      _e.set(noise1(this.time * 23, 1) * a, noise1(this.time * 21, 2) * a, noise1(this.time * 19, 3) * a * 0.6);
      _q.setFromEuler(_e);
      cam.quaternion.multiply(_q);
      cam.position.y += noise1(this.time * 31, 4) * tr * 0.06;
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    cam.updateProjectionMatrix();
  }

  /** Helmet camera: blueprint eye in chassis space + head dynamics, rotating about the neck. */
  private placeHelmet(c: CameraInput): void {
    const cam = this.camera;
    const h = c.head;
    // Neck pivot below/behind the eye; the look-back yaw swings the eye about it.
    _neck.copy(c.eyeLocal);
    _neck.y -= NECK_DOWN;
    _neck.z += NECK_BACK;
    _rel.set(0, NECK_DOWN, -NECK_BACK).applyAxisAngle(UP, h.yaw);
    _rel.add(_neck);
    // Keep the eye on the pivot's side of the look-back turn only (normal yaw is a tiny rotation).
    _rel.x += h.px;
    _rel.y += h.py;
    _rel.z += h.pz;
    cam.position.copy(_rel).applyMatrix4(c.chassis);
    _q.setFromRotationMatrix(c.chassis);
    _e.set(BASE_PITCH + h.pitch, h.yaw, h.roll, 'YXZ');
    _qb.setFromEuler(_e);
    cam.quaternion.copy(_q).multiply(_qb);
    this.pos.copy(cam.position);
  }

  // ───────────────────────────── crash cameras ─────────────────────────────

  /**
   * First-person crash camera: rides the helmet of the tumbling rider. `headPos/headQuat`
   * are the ragdoll head; the orientation is smoothed so the tumble is readable (and gentle
   * on the stomach) instead of a raw spin.
   */
  crashFpv(dt: number, headPos: THREE.Vector3, headQuat: THREE.Quaternion, spin: number): void {
    const cam = this.camera;
    this.crashT += dt;
    // Eye sits at the front of the helmet shell.
    _off.set(0, 0.0, -0.1).applyQuaternion(headQuat);
    cam.position.copy(headPos).add(_off);
    // Smooth the orientation (rate falls as the spin speeds up so the horizon swings visibly).
    if (!this.fpvInit) {
      this.fpvInit = true;
      this.fpvQuat.copy(cam.quaternion);
    }
    _q.copy(headQuat);
    // Look slightly down the helmet axis (the visor's line of sight).
    _qb.setFromAxisAngle(RIGHT, -0.12);
    _q.multiply(_qb);
    const rate = clamp(14 - spin * 0.35, 5, 14);
    this.fpvQuat.slerp(_q, 1 - Math.exp(-rate * dt));
    cam.quaternion.copy(this.fpvQuat);
    this.fovS = damp(this.fovS, 92, 4, dt);
    cam.fov = this.fovS;
    this.applyCrashShake(dt, 0.05);
    cam.updateProjectionMatrix();
  }

  /** Cinematic third-person crash camera orbiting the action from a low, dramatic angle. */
  crash(dt: number, focus: THREE.Vector3, yaw: number, replayT = this.crashT): void {
    this.crashT += dt;
    const cam = this.camera;
    if (!this.cineInit) {
      this.cineInit = true;
      this.cineFocus.copy(focus);
      // Start ahead of the action, slightly to the side, looking back at the rider.
      this.cineAngle = yaw + Math.PI * 0.78;
      cam.position.set(focus.x + Math.sin(this.cineAngle) * 7, focus.y + 1.2, focus.z + Math.cos(this.cineAngle) * 7);
    }
    this.cineAngle += dt * 0.28;
    const dist = 6.4 + Math.min(3, replayT * 0.8);
    _target.set(focus.x + Math.sin(this.cineAngle) * dist, focus.y + 1.15 + Math.min(1.8, replayT * 0.5), focus.z + Math.cos(this.cineAngle) * dist);
    cam.position.lerp(_target, 1 - Math.exp(-2.2 * dt));
    this.cineFocus.lerp(focus, 1 - Math.exp(-5 * dt));
    cam.up.set(0, 1, 0);
    cam.lookAt(this.cineFocus);
    this.fovS = damp(this.fovS, 48, 3, dt);
    cam.fov = this.fovS;
    this.applyCrashShake(dt, 0.08);
    cam.updateProjectionMatrix();
  }

  private applyCrashShake(dt: number, gain: number): void {
    this.time += dt;
    if (this.trauma > 0) {
      const a = this.trauma * this.trauma * gain;
      _e.set(noise1(this.time * 23, 1) * a, noise1(this.time * 21, 2) * a, noise1(this.time * 17, 5) * a * 0.5);
      this.camera.quaternion.multiply(_q.setFromEuler(_e));
      this.trauma = Math.max(0, this.trauma - dt);
    }
  }

  resetCrash(): void {
    this.crashT = 0;
    this.fpvInit = false;
    this.cineInit = false;
  }

  /** Shift internal smoothing state when the world origin is rebased. */
  shift(d: THREE.Vector3): void {
    this.prevBike.sub(d);
    this.pos.sub(d);
    this.lookAt.sub(d);
    this.cineFocus.sub(d);
    this.camera.position.sub(d);
  }
}

