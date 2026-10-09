import type { BikeSpec } from '../data/bikes';
import { G, approach, clamp, lerp, smoothstep } from '../core/math';
import {
  AIR_DENSITY,
  buildChassis,
  buildDrivetrain,
  buildPowerCurve,
  speedAtRpm,
  wheelRpm,
  type ChassisParams,
  type Drivetrain,
  type PowerCurve,
} from './powertrain';

export interface RiderInput {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  /** Rider shifts weight back and pops the clutch. */
  wheelie: boolean;
  /** Edge-triggered manual shift requests. */
  shiftUp: boolean;
  shiftDown: boolean;
  /** Clutch lever pulled: the engine revs freely and drives nothing (grid revving). */
  clutchIn?: boolean;
}

export function neutralInput(): RiderInput {
  return { throttle: 0, brake: 0, steer: 0, wheelie: false, shiftUp: false, shiftDown: false };
}

export interface Upgrades {
  engine: number;
  brakes: number;
  handling: number;
}

export const MAX_UPGRADE = 5;

/** Road properties the physics needs, decoupled from the road implementation. */
export interface RoadSample {
  curvature(s: number): number;
  grade(s: number): number;
  metric(s: number): number;
}

export interface RoadLimits {
  /** Lateral limit for the bike's centre before touching the barrier (m). */
  halfWidth: number;
  /** Tyre/road friction coefficient. */
  grip: number;
}

export type PhysicsEvent =
  | { type: 'shift'; gear: number; up: boolean; quick: boolean }
  | { type: 'limiter' }
  | { type: 'overrun'; rpm: number }
  | { type: 'land'; impact: number }
  | { type: 'scrape'; side: -1 | 1; intensity: number }
  | { type: 'crash'; reason: CrashReason };

export type CrashReason = 'traffic' | 'barrier' | 'loop';

const MIN_SHIFT_INTERVAL = 0.32;

export class BikePhysics {
  readonly spec: BikeSpec;
  readonly curve: PowerCurve;
  readonly drive: Drivetrain;
  readonly chassis: ChassisParams;
  upgrades: Upgrades;
  autoShift = true;

  // ── state ──
  s = 0;
  d = 0;
  /** Forward speed, m/s. */
  v = 0;
  /** Heading relative to the road tangent (rad, + = right). */
  heading = 0;
  /** Roll angle (rad, + = leaning right). */
  lean = 0;
  leanRate = 0;
  /** Wheelie pitch (rad, + = front wheel up). */
  pitch = 0;
  pitchRate = 0;
  rpm = 0;
  gear = 1;
  shiftTimer = 0;
  private shiftCooldown = 0;
  private limiterCut = 0;
  throttle = 0;
  brake = 0;
  /** Longitudinal acceleration (m/s²) of the last step. */
  accel = 0;
  /** Lateral acceleration (m/s²). */
  latAccel = 0;
  yawRate = 0;
  clutchSlip = false;
  wheelspin = 0;
  scraping = 0;
  /** 0..1 slipstream behind a vehicle, set by the session. */
  draft = 0;
  distance = 0;
  crashed = false;
  crashReason: CrashReason | null = null;
  time = 0;
  events: PhysicsEvent[] = [];
  private prevThrottle = 0;
  private clutchEngaged = false;
  private wheelieHeld = false;
  private grounded = true;

  constructor(spec: BikeSpec, upgrades: Upgrades = { engine: 0, brakes: 0, handling: 0 }) {
    this.spec = spec;
    this.curve = buildPowerCurve(spec.engine);
    this.drive = buildDrivetrain(spec, this.curve);
    this.chassis = buildChassis(spec);
    this.upgrades = { ...upgrades };
    this.rpm = this.curve.idle;
  }

  get speedKmh(): number {
    return this.v * 3.6;
  }

  get gearCount(): number {
    return this.drive.ratios.length;
  }

  get powerScale(): number {
    return 1 + 0.035 * clamp(this.upgrades.engine, 0, MAX_UPGRADE);
  }

  get isWheelie(): boolean {
    return this.pitch > 0.12;
  }

  get mass(): number {
    return this.drive.mass;
  }

  /** Current overall ratio (CVT computes it from speed). */
  private currentRatio(targetRpm: number): number {
    const dr = this.drive;
    if (this.spec.transmission === 'cvt') {
      const k = (Math.PI * 2 * dr.wheelRadius) / 60;
      const ideal = (targetRpm * k) / Math.max(this.v, 0.1);
      return clamp(ideal, dr.cvtHigh, dr.cvtLow);
    }
    return dr.ratios[this.gear - 1];
  }

  reset(s = 0, d = 0, v = 0): void {
    this.s = s;
    this.d = d;
    this.v = v;
    this.heading = 0;
    this.lean = 0;
    this.leanRate = 0;
    this.pitch = 0;
    this.pitchRate = 0;
    this.gear = 1;
    this.shiftTimer = 0;
    this.shiftCooldown = 0;
    this.limiterCut = 0;
    this.throttle = 0;
    this.brake = 0;
    this.accel = 0;
    this.crashed = false;
    this.crashReason = null;
    this.distance = 0;
    this.time = 0;
    this.events.length = 0;
    this.grounded = true;
    this.clutchEngaged = v > 0;
    if (v > 0) this.selectGearForSpeed();
    this.rpm = Math.max(this.curve.idle, this.lockedRpm());
  }

  /** Pick the gear a rider would be in at the current speed (used for rolling starts). */
  selectGearForSpeed(): void {
    if (this.spec.transmission !== 'manual') return;
    const n = this.gearCount;
    for (let g = 1; g <= n; g++) {
      this.gear = g;
      if (this.lockedRpm() < this.spec.engine.redline * 0.7) return;
    }
  }

  private lockedRpm(): number {
    const ratio = this.currentRatio(this.curve.idle);
    return wheelRpm(this.v, ratio, this.drive.wheelRadius);
  }

  crash(reason: CrashReason): void {
    if (this.crashed) return;
    this.crashed = true;
    this.crashReason = reason;
    this.events.push({ type: 'crash', reason });
  }

  /** Request a gear change; returns true if executed. */
  shift(up: boolean): boolean {
    if (this.spec.transmission !== 'manual' || this.shiftTimer > 0) return false;
    const n = this.gearCount;
    const target = this.gear + (up ? 1 : -1);
    if (target < 1 || target > n) return false;
    if (!up) {
      // Prevent a "money shift": refuse downshifts that would over-rev the engine.
      const after = wheelRpm(this.v, this.drive.ratios[target - 1], this.drive.wheelRadius);
      if (after > this.spec.engine.limiter * 0.98) return false;
    }
    const quick = this.spec.quickshifter;
    this.gear = target;
    this.shiftTimer = up ? (quick ? 0.05 : 0.2) : quick ? 0.08 : 0.16;
    this.shiftCooldown = MIN_SHIFT_INTERVAL;
    this.events.push({ type: 'shift', gear: target, up, quick });
    return true;
  }

  private autoShiftLogic(): void {
    if (this.spec.transmission !== 'manual' || this.shiftTimer > 0 || this.shiftCooldown > 0) return;
    const e = this.spec.engine;
    const n = this.gearCount;
    const thr = this.throttle;
    const rpm = this.lockedRpm();
    const upAt = lerp(lerp(e.idle, e.redline, 0.5), Math.min(e.redline * 0.985, e.limiter * 0.96), Math.pow(thr, 1.4));
    if (this.gear < n && rpm > upAt && !this.clutchSlip) {
      this.shift(true);
      return;
    }
    if (this.gear > 1) {
      const after = wheelRpm(this.v, this.drive.ratios[this.gear - 2], this.drive.wheelRadius);
      let downAt: number;
      if (this.brake > 0.1) downAt = lerp(e.redline * 0.42, e.redline * 0.58, this.brake);
      else if (thr > 0.85) downAt = Math.max(e.torqueRpm * 0.62, e.idle * 2);
      else downAt = e.idle * 1.7 + (e.redline - e.idle) * 0.12;
      if (rpm < downAt && after < Math.min(upAt * 0.92, e.redline * 0.9)) this.shift(false);
    }
  }

  /** Advance the simulation by dt seconds (callers should use small fixed steps). */
  step(dt: number, input: RiderInput, road: RoadSample, limits: RoadLimits): void {
    this.time += dt;
    if (this.crashed) return;
    const spec = this.spec;
    const e = spec.engine;
    const ch = this.chassis;
    const dr = this.drive;
    const m = dr.mass;
    const up = this.upgrades;
    const grip = limits.grip;

    // ── inputs (ride-by-wire & hydraulic lag) ──
    const thrTarget = clamp(input.throttle, 0, 1);
    this.throttle = approach(this.throttle, thrTarget, dt * (thrTarget > this.throttle ? 7 : 12));
    this.brake = approach(this.brake, clamp(input.brake, 0, 1), dt * 8);
    if (input.shiftUp && !this.autoShift) this.shift(true);
    if (input.shiftDown && !this.autoShift) this.shift(false);
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    this.limiterCut = Math.max(0, this.limiterCut - dt);
    if (this.autoShift) this.autoShiftLogic();

    let thr = this.throttle;
    // Wheelie control electronics when the rider is not deliberately wheelieing:
    // a PD loop on pitch keeps the front tyre skimming the tarmac.
    const riderWheelie = input.wheelie && this.v > 2.5 && this.brake < 0.2;
    if (!riderWheelie && (this.pitch > 0.025 || this.pitchRate > 0.2)) {
      thr *= clamp(1 - (this.pitch - 0.025) * 9 - Math.max(0, this.pitchRate) * 0.9, 0, 1);
    }

    // ── powertrain ──
    const curve = this.curve;
    let engineTorque = 0;
    let ratio: number;
    let targetRpm: number;
    this.clutchSlip = false;
    if (curve.kind === 'electric') {
      ratio = dr.ratios[0];
      targetRpm = wheelRpm(this.v, ratio, dr.wheelRadius);
      engineTorque = thr * curve.torqueAt(targetRpm) * this.powerScale - (1 - thr) * curve.dragTorqueAt(targetRpm) * smoothstep(0.5, 4, this.v);
    } else {
      const cvt = spec.transmission === 'cvt';
      const cvtTarget = lerp(e.idle * 1.25, e.hpRpm * 1.02, thr);
      ratio = this.currentRatio(cvtTarget);
      const locked = wheelRpm(this.v, ratio, dr.wheelRadius);
      const engage = cvt ? e.idle * 1.9 : dr.clutchEngageRpm;
      // Clutch state machine: it releases at a stall-risk rpm and re-engages once the
      // drivetrain catches up with the slipping engine (based on the rider's throttle,
      // not the traction-control-modulated one, so it does not flap).
      const slipTarget = cvt ? Math.max(cvtTarget, engage) : lerp(e.idle, dr.launchRpm, this.throttle);
      if (cvt || this.gear === 1) {
        if (this.clutchEngaged && locked < engage) this.clutchEngaged = false;
        else if (!this.clutchEngaged && locked >= slipTarget - 40) this.clutchEngaged = true;
      } else {
        this.clutchEngaged = true;
      }
      if (cvt && locked < cvtTarget) this.clutchEngaged = false;
      const slipping = !this.clutchEngaged;
      if (slipping) {
        this.clutchSlip = true;
        targetRpm = Math.max(slipTarget, locked);
        // Clutch transmits the engine torque it is fed (no creep with the throttle closed).
        const feed = thr > 0.03 ? thr * curve.torqueAt(targetRpm) * this.powerScale : 0;
        engineTorque = feed * smoothstep(0.02, 0.25, thr);
        if (thr <= 0.03) engineTorque = -curve.dragTorqueAt(targetRpm) * smoothstep(engage * 0.8, engage * 1.2, locked);
      } else {
        targetRpm = Math.max(locked, e.idle);
        engineTorque = thr * curve.torqueAt(targetRpm) * this.powerScale - (1 - thr) * curve.dragTorqueAt(targetRpm);
      }
      if (input.clutchIn) {
        // Free revving: crank speed follows the throttle, nothing reaches the wheel.
        this.clutchSlip = true;
        this.clutchEngaged = false;
        targetRpm = lerp(e.idle, e.limiter * 1.01, Math.pow(thr, 0.8));
        engineTorque = 0;
      }
      if (targetRpm >= e.limiter && this.limiterCut <= 0) {
        this.limiterCut = 0.055;
        this.events.push({ type: 'limiter' });
      }
      if (this.limiterCut > 0) engineTorque = Math.min(engineTorque, 0);
    }
    if (this.shiftTimer > 0) engineTorque = 0;

    // Overrun crackle trigger: sharp throttle closure at high rpm.
    if (this.prevThrottle > 0.55 && thr < 0.15 && this.rpm > e.redline * 0.5) {
      this.events.push({ type: 'overrun', rpm: this.rpm });
    }
    this.prevThrottle = thr;

    let driveForce = (engineTorque * ratio * dr.efficiency) / dr.wheelRadius;

    // ── traction (rear tyre) ──
    const L = ch.wheelbase;
    const muH = (grip * ch.h) / L;
    const maxDrive = muH < 0.95 ? (grip * m * G * ((L - ch.lr) / L)) / (1 - muH) : grip * m * G;
    this.wheelspin = 0;
    if (driveForce > maxDrive) {
      this.wheelspin = clamp((driveForce - maxDrive) / Math.max(driveForce, 1), 0, 1);
      driveForce = maxDrive; // traction control
    }
    // Holding a wheelie: the rider feathers the throttle to stay at the balance point,
    // where the inertial moment m·a·y equals the gravity moment m·g·x about the rear
    // contact patch. More drive than that would flip the bike over backwards.
    if (riderWheelie && this.pitch > 0.06) {
      const p = this.pitch;
      const x = ch.lr * Math.cos(p) - ch.h * Math.sin(p);
      const y = ch.lr * Math.sin(p) + ch.h * Math.cos(p);
      const aBalance = (G * Math.max(0, x)) / Math.max(0.2, y);
      const resist = 0.5 * AIR_DENSITY * dr.cda * this.v * this.v + dr.crr * m * G;
      driveForce = Math.min(driveForce, m * (aBalance + 0.6) + resist);
    }

    // ── brakes (ABS limited by grip and stoppie threshold) ──
    const front = this.pitch > 0.05 ? 0.25 : 1; // airborne front wheel cannot brake
    const brakeCap =
      Math.min(grip * G * 0.98, ((G * (L - ch.lr)) / ch.h) * 0.96) * ch.brakeQuality * (1 + 0.03 * clamp(up.brakes, 0, MAX_UPGRADE));
    const brakeDecel = Math.min(this.brake * brakeCap * front, grip * G);
    const brakeForce = this.v > 0.01 ? brakeDecel * m : 0;

    // ── resistances ──
    const cda = dr.cda * (1 - 0.32 * clamp(this.draft, 0, 1));
    const aero = 0.5 * AIR_DENSITY * cda * this.v * this.v;
    const roll = this.v > 0.01 ? dr.crr * m * G : 0;
    const slope = m * G * road.grade(this.s);

    let a = (driveForce - brakeForce - aero - roll - slope) / m;
    if (this.v <= 0.01 && a < 0) a = Math.max(a, 0); // stationary bike does not roll back here
    this.accel = a;
    this.v = Math.max(0, this.v + a * dt);

    // Engine speed follows the drivetrain with a little inertia so audio stays smooth.
    let rpmGoal = targetRpm;
    if (this.shiftTimer > 0 && curve.kind !== 'electric') {
      rpmGoal = Math.max(e.idle, wheelRpm(this.v, ratio, dr.wheelRadius));
    }
    const rpmRate = this.clutchSlip ? 9 : this.shiftTimer > 0 ? 22 : 30;
    this.rpm += (rpmGoal - this.rpm) * Math.min(1, rpmRate * dt);
    if (curve.kind !== 'electric') this.rpm = clamp(this.rpm, e.idle * 0.85, e.limiter * 1.02);
    else this.rpm = Math.max(0, this.rpm);

    // ── wheelie / pitch dynamics about the rear contact patch ──
    this.updatePitch(dt, riderWheelie, input.throttle);

    // ── lateral: heading controller → lean → yaw ──
    const v = this.v;
    const handling = 1 + 0.05 * clamp(up.handling, 0, MAX_UPGRADE);
    const wheelieSteer = this.pitch > 0.06 ? 0.35 : 1;
    const latMax = clamp(2.2 + 0.068 * v, 2.2, 7.8) * handling * wheelieSteer;
    const steer = clamp(input.steer, -1, 1);
    const desiredHeading = v > 3 ? Math.asin(clamp((steer * latMax) / v, -0.6, 0.6)) : steer * 0.5;
    const kappa = road.curvature(this.s);
    const kh = 2.8 * handling;
    const yawDemand = kh * (desiredHeading - this.heading) + kappa * v;
    const maxLean = Math.min(lerp(0.12, 0.84, smoothstep(2, 20, v)), Math.atan(grip * 0.92));
    const leanTarget = clamp(Math.atan((v * yawDemand) / G), -maxLean, maxLean);
    const w = ch.leanOmega * handling;
    const zeta = 0.86;
    this.leanRate += (w * w * (leanTarget - this.lean) - 2 * zeta * w * this.leanRate) * dt;
    this.lean += this.leanRate * dt;
    this.lean = clamp(this.lean, -0.95, 0.95);
    const blend = smoothstep(2, 5, v);
    const dynYaw = v > 0.5 ? (G * Math.tan(this.lean)) / v : 0;
    this.yawRate = blend * dynYaw + (1 - blend) * yawDemand;
    this.latAccel = v * this.yawRate;
    this.heading += (this.yawRate - kappa * v) * dt;
    this.heading = clamp(this.heading, -0.9, 0.9);
    if (v < 0.3) this.heading *= Math.exp(-3 * dt);

    // ── integrate position in road space ──
    const metric = road.metric(this.s);
    this.s += (v * Math.cos(this.heading) * dt) / metric;
    this.d += v * Math.sin(this.heading) * dt;
    this.distance += v * dt;

    // ── barrier contact ──
    this.scraping = 0;
    const lim = limits.halfWidth;
    if (Math.abs(this.d) > lim) {
      const side: -1 | 1 = this.d > 0 ? 1 : -1;
      const lateralSpeed = v * Math.sin(this.heading) * side;
      if (lateralSpeed > 6.5 && v > 12) {
        this.d = side * lim;
        this.crash('barrier');
        return;
      }
      this.d = side * lim;
      if (this.heading * side > 0) this.heading = -side * Math.min(0.04, Math.abs(this.heading) * 0.5);
      this.leanRate *= 0.5;
      this.v = Math.max(0, this.v - (2.5 + v * 0.06) * dt);
      this.scraping = clamp(v / 40, 0.15, 1);
      this.events.push({ type: 'scrape', side, intensity: this.scraping });
    }
  }

  private updatePitch(dt: number, riderWheelie: boolean, rawThrottle: number): void {
    const ch = this.chassis;
    const m = this.drive.mass;
    const p = this.pitch;
    if (riderWheelie && rawThrottle > 0.3) {
      this.wheelieHeld = true;
      const pw = (this.spec.engine.hp * this.powerScale) / this.spec.weight;
      const auth = ch.wheelieAuthority;
      const target = (0.12 + 0.44 * clamp((pw - 0.08) / 0.62, 0, 1)) * (0.6 + 0.4 * auth);
      // Throttle modulates the balance point like a real rider would.
      const goal = target * clamp(0.55 + rawThrottle * 0.5, 0, 1.05);
      const k = 16 * auth * clamp(0.35 + pw, 0.4, 1.4);
      const c = 2 * Math.sqrt(k) * 0.75;
      this.pitchRate += (k * (goal - p) - c * this.pitchRate) * dt;
    } else {
      this.wheelieHeld = false;
      const lr = ch.lr;
      const h = ch.h;
      const x = lr * Math.cos(p) - h * Math.sin(p);
      const y = lr * Math.sin(p) + h * Math.cos(p);
      const inertia = m * (lr * lr + h * h) * 1.15;
      const moment = m * this.accel * y - m * G * x;
      if (p <= 0 && moment <= 0) {
        this.pitchRate = 0;
      } else {
        this.pitchRate += (moment / inertia - 1.2 * this.pitchRate) * dt;
      }
    }
    this.pitch += this.pitchRate * dt;
    if (this.pitch <= 0) {
      if (!this.grounded && this.pitchRate < -0.4) this.events.push({ type: 'land', impact: clamp(-this.pitchRate / 4, 0, 1) });
      this.pitch = 0;
      if (this.pitchRate < 0) this.pitchRate = 0;
      this.grounded = true;
    } else if (this.pitch > 0.02) {
      this.grounded = false;
    }
    if (this.pitch > 1.25) this.crash('loop');
    if (this.pitch > 0.95 && this.wheelieHeld) {
      this.pitch = 0.95;
      this.pitchRate = Math.min(this.pitchRate, 0);
    }
  }

  /** Max speed in the current gear at the limiter (km/h), for UI. */
  gearTopSpeedKmh(gear = this.gear): number {
    const ratio = this.drive.ratios[Math.max(0, Math.min(gear - 1, this.drive.ratios.length - 1))];
    return speedAtRpm(this.spec.engine.limiter, ratio, this.drive.wheelRadius) * 3.6;
  }
}

export const FLAT_ROAD: RoadSample = {
  curvature: () => 0,
  grade: () => 0,
  metric: () => 1,
};

export interface PerformanceFigures {
  zeroTo100: number;
  zeroTo200: number | null;
  quarterMile: number;
  topSpeed: number;
}

/** Headless drag-strip run used by the garage UI and the unit tests. */
export function measurePerformance(spec: BikeSpec, upgrades?: Upgrades, maxTime = 150): PerformanceFigures {
  const bike = new BikePhysics(spec, upgrades);
  bike.reset(0, 0, 0);
  const input = { ...neutralInput(), throttle: 1 };
  const limits: RoadLimits = { halfWidth: 1e6, grip: 1.1 };
  const dt = 1 / 120;
  let t = 0;
  let t100 = Infinity;
  let t200: number | null = null;
  let quarter = Infinity;
  let vmax = 0;
  let stableFor = 0;
  while (t < maxTime) {
    bike.step(dt, input, FLAT_ROAD, limits);
    t += dt;
    const kmh = bike.speedKmh;
    if (t100 === Infinity && kmh >= 100) t100 = t;
    if (t200 === null && kmh >= 200) t200 = t;
    if (quarter === Infinity && bike.distance >= 402.336) quarter = t;
    if (kmh > vmax + 0.02) {
      vmax = kmh;
      stableFor = 0;
    } else {
      stableFor += dt;
      if (stableFor > 6 && quarter !== Infinity) break;
    }
  }
  return { zeroTo100: t100, zeroTo200: t200, quarterMile: quarter, topSpeed: vmax };
}
