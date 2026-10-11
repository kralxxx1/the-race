import { clamp, noise1, smoothstep } from '../../core/math';

/**
 * Rider head dynamics for the helmet camera. Pure maths (no three.js, no DOM) so it is
 * unit-testable: springs are integrated on a fixed internal step and every periodic
 * or noise-driven component is a function of the accumulated time, so the result does
 * not depend on the frame rate.
 *
 * Conventions follow three.js: yaw + = look left, pitch + = look up, roll + = rotate
 * about the +Z axis (counter-clockwise seen from behind the rider). Offsets are in
 * bike space (x right, y up, z backwards) relative to the blueprint eye point.
 */

export interface HeadSettings {
  /** Overall head dynamics intensity (inertia, tilt). */
  motion: number;
  /** 0..1 fraction of the bike's roll that the head cancels (1 = perfectly level horizon). */
  horizon: number;
  lookTurn: number;
  tuck: number;
  engineVib: number;
  roadVib: number;
  wind: number;
  /** 0 disables every vibration/shake component. */
  shake: number;
  fov: number;
  speedFov: number;
}

export interface HeadInput {
  /** Forward speed (m/s). */
  speed: number;
  /** Roll angle (rad, + = leaning right). */
  lean: number;
  leanRate: number;
  /** Longitudinal acceleration (m/s², negative while braking). */
  accel: number;
  /** Wheelie pitch (rad). */
  pitch: number;
  yawRate: number;
  rpmFrac: number;
  /** Surface roughness 0 (fresh tarmac) .. 1 (gravel / grass). */
  roughness: number;
  /** 0..1 rumble-strip contact. */
  rumble: number;
  /** 0..1 turbulent wake of a large vehicle. */
  turbulence: number;
  /** 0..1 how far this bike's rider can tuck (sport 1, naked 0.6, cruiser 0). */
  tuckStyle: number;
  /** 1 while the look-back control is held. */
  lookBack: number;
  /** Shoulder to look over: -1 right, +1 left (yaw sign). */
  lookBackSide: number;
}

export interface HeadPose {
  px: number;
  py: number;
  pz: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** Extra field of view (deg) from speed and close passes. */
  fovAdd: number;
  /** 0..1 progress of the look-back turn. */
  lookBack: number;
  /** Current tuck 0..1 (bike speed and style dependent). */
  tuck: number;
  /** 0..1 wind buffeting strength (drives the visor droplets too). */
  buffet: number;
}

export function makeHeadInput(): HeadInput {
  return { speed: 0, lean: 0, leanRate: 0, accel: 0, pitch: 0, yawRate: 0, rpmFrac: 0.2, roughness: 0.1, rumble: 0, turbulence: 0, tuckStyle: 0, lookBack: 0, lookBackSide: 1 };
}

export function makeHeadPose(): HeadPose {
  return { px: 0, py: 0, pz: 0, yaw: 0, pitch: 0, roll: 0, fovAdd: 0, lookBack: 0, tuck: 0, buffet: 0 };
}

export const DEFAULT_HEAD_SETTINGS: HeadSettings = { motion: 1, horizon: 0.6, lookTurn: 1, tuck: 1, engineVib: 1, roadVib: 1, wind: 1, shake: 1, fov: 74, speedFov: 14 };

/** Head turned fully over the shoulder (≈150°). */
export const LOOK_BACK_YAW = 2.62;
/** Pose limits: whatever the inputs, the camera stays within these. */
export const HEAD_LIMITS = { pos: 0.22, pitch: 0.42, roll: 0.5, yaw: 0.55, fov: 40 };

const STEP = 1 / 240;
const MAX_SUBSTEPS = 48;
const TAU = Math.PI * 2;

/** Critically-ish damped spring state. */
class Spring {
  x = 0;
  v = 0;
  constructor(
    readonly omega: number,
    readonly zeta: number,
  ) {}
  step(target: number, h: number): void {
    const a = this.omega * this.omega * (target - this.x) - 2 * this.zeta * this.omega * this.v;
    this.v += a * h;
    this.x += this.v * h;
  }
  reset(): void {
    this.x = 0;
    this.v = 0;
  }
}

export class HeadMotion {
  private yawS = new Spring(7, 0.85);
  private leanS = new Spring(9, 0.9);
  private pitchS = new Spring(9, 0.45);
  private surgeS = new Spring(8, 0.5);
  private heaveS = new Spring(12, 0.35);
  private tuckV = 0;
  private lookV = 0;
  private fovV = 0;
  private punchV = 0;
  private punchRoll = 0;
  private buffetV = 0;
  private acc = 0;
  /** Accumulated time (s): drives every periodic/noise component. */
  private time = 0;
  private enginePhase = 0;
  private rumblePhase = 0;
  private initialised = false;

  reset(): void {
    for (const s of [this.yawS, this.leanS, this.pitchS, this.surgeS, this.heaveS]) s.reset();
    this.tuckV = this.lookV = this.fovV = this.punchV = this.punchRoll = this.buffetV = 0;
    this.acc = 0;
    this.initialised = false;
  }

  /** Close pass / near miss / landing: a short wind-punch (FOV swell and a roll kick). */
  punch(amount: number, rollDir: number): void {
    this.punchV = clamp(this.punchV + amount, 0, 1.2);
    this.punchRoll += rollDir * amount * 0.5;
  }

  /** A hard jolt (landing, kerb): drives the vertical and pitch springs. */
  jolt(amount: number): void {
    this.heaveS.v -= amount * 0.6;
    this.pitchS.v -= amount * 0.5;
  }

  get tuckAmount(): number {
    return this.tuckV;
  }

  /** Advance by `dt` seconds and write the head pose into `out`. */
  step(dt: number, inp: HeadInput, s: HeadSettings, out: HeadPose): HeadPose {
    dt = clamp(dt, 0, 0.25);
    const speed = clamp(inp.speed, 0, 120);
    if (!this.initialised) {
      this.initialised = true;
      this.tuckV = this.tuckTarget(speed, inp, s);
    }
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < MAX_SUBSTEPS) {
      this.acc -= STEP;
      n++;
      this.substep(STEP, inp, s, speed);
    }
    if (n === MAX_SUBSTEPS) this.acc = 0;
    this.time += dt;
    // Engine phase is integrated per call (frequency follows rpm); amplitude-only effects use `time`.
    this.enginePhase = (this.enginePhase + (16 + 52 * clamp(inp.rpmFrac, 0, 1.2)) * dt) % 1;
    this.rumblePhase = (this.rumblePhase + (38 + 0.9 * speed) * dt) % 1;
    return this.compose(inp, s, speed, out);
  }

  private tuckTarget(speed: number, inp: HeadInput, s: HeadSettings): number {
    // Riders only crouch behind the screen above ~125 km/h, fully at ~220 km/h.
    return smoothstep(34, 61, speed) * clamp(inp.tuckStyle, 0, 1) * clamp(s.tuck, 0, 1.5);
  }

  private substep(h: number, inp: HeadInput, s: HeadSettings, speed: number): void {
    const m = s.motion;
    // Look into the corner: the head leads the lean (a little of the lean rate predicts it).
    const yawT = -(inp.lean + 0.1 * clamp(inp.leanRate, -4, 4)) * 0.3 * s.lookTurn - clamp(inp.yawRate, -1.2, 1.2) * 0.12 * s.lookTurn;
    this.yawS.step(clamp(yawT, -0.5, 0.5) * smoothstep(1, 9, speed), h);
    // Roll counter-tilt: smoothed lean, so a flick does not snap the horizon.
    this.leanS.step(clamp(inp.lean, -1.2, 1.2), h);
    // Inertia: braking pitches the head down and forward, acceleration pushes it back.
    const a = clamp(inp.accel, -14, 9);
    this.pitchS.step(a * 0.0065 * m, h);
    this.surgeS.step(a * 0.0042 * m, h);
    this.heaveS.step(-Math.abs(a) * 0.0006 * m, h);
    this.tuckV += (this.tuckTarget(speed, inp, s) - this.tuckV) * (1 - Math.exp(-1.6 * h));
    this.lookV += (clamp(inp.lookBack, 0, 1) - this.lookV) * (1 - Math.exp(-7 * h));
    const fovT = smoothstep(8, 75, speed);
    this.fovV += (fovT - this.fovV) * (1 - Math.exp(-2.2 * h));
    this.punchV *= Math.exp(-4.5 * h);
    this.punchRoll *= Math.exp(-5.5 * h);
    const bT = smoothstep(33, 75, speed) * (1 - 0.85 * this.tuckV) + inp.turbulence * 0.9;
    this.buffetV += (bT - this.buffetV) * (1 - Math.exp(-3 * h));
  }

  private compose(inp: HeadInput, s: HeadSettings, speed: number, out: HeadPose): HeadPose {
    const t = this.time;
    const m = s.motion;
    const tuck = this.tuckV;
    const lb = easeLook(this.lookV);
    const shake = s.shake;
    // Static dynamics.
    let px = 0;
    let py = this.heaveS.x - 0.07 * tuck;
    let pz = this.surgeS.x - 0.055 * tuck;
    let yaw = this.yawS.x;
    let pitch = this.pitchS.x + 0.045 * tuck - clamp(inp.pitch, 0, 1.2) * 0.32;
    // Counter-tilt towards the horizon (head rotates against the bike's roll).
    let roll = this.leanS.x * s.horizon * clamp(m, 0, 1.2) * 0.92;
    // Head leans slightly into the turn as well.
    px += this.leanS.x * 0.035 * m;
    // Vibration & buffeting (all functions of time).
    const speedK = smoothstep(2, 30, speed);
    if (shake > 0) {
      const rpm = clamp(inp.rpmFrac, 0, 1.2);
      const ea = (0.00045 + 0.0014 * rpm * rpm) * s.engineVib * shake * (1 - 0.4 * tuck);
      const p1 = this.enginePhase * TAU;
      py += ea * (Math.sin(p1) + 0.4 * Math.sin(2 * p1 + 0.7));
      px += ea * 0.55 * Math.sin(p1 + 1.3);
      roll += ea * 0.6 * Math.sin(p1 + 0.4);
      pitch += ea * 0.45 * Math.sin(2 * p1);
      // Road texture and suspension chatter.
      const ra = (0.0008 + 0.0042 * clamp(inp.roughness, 0, 1)) * speedK * s.roadVib * shake;
      py += ra * (noise1(t * 11, 3) * 0.7 + noise1(t * 27, 5) * 0.4);
      pitch += ra * 0.9 * noise1(t * 9, 7);
      roll += ra * 0.7 * noise1(t * 8.3, 9);
      // Rumble strip: a coarse buzz at a speed-dependent frequency.
      if (inp.rumble > 0.01) {
        const rb = 0.0042 * inp.rumble * s.roadVib * shake * smoothstep(3, 20, speed);
        const p2 = this.rumblePhase * TAU;
        py += rb * Math.sin(p2);
        pitch += rb * 1.6 * Math.sin(p2 + 1.1);
        roll += rb * 1.2 * Math.sin(p2 * 0.5 + 0.3);
      }
      // Wind buffeting (and the wake of large vehicles).
      const w = this.buffetV * s.wind * shake;
      if (w > 0.002) {
        const ww = Math.pow(w, 1.35);
        roll += 0.014 * ww * noise1(t * 6.1, 11);
        yaw += 0.012 * ww * noise1(t * 5.3, 13);
        pitch += 0.014 * ww * noise1(t * 7.3, 17);
        px += 0.005 * ww * noise1(t * 9.1, 19);
        py += 0.004 * ww * noise1(t * 10.7, 23);
        pz += 0.004 * ww * noise1(t * 7.7, 29);
      }
    }
    // Look-back: turn the head over the shoulder; the body twists a little.
    yaw += lb * LOOK_BACK_YAW * (inp.lookBackSide >= 0 ? 1 : -1);
    pitch += lb * 0.17;
    px += lb * (inp.lookBackSide >= 0 ? -1 : 1) * 0.02;
    pz += lb * 0.03;
    roll *= 1 - 0.5 * lb;
    // Close-pass punch.
    roll += this.punchRoll;
    out.px = clamp(px, -HEAD_LIMITS.pos, HEAD_LIMITS.pos);
    out.py = clamp(py, -HEAD_LIMITS.pos, HEAD_LIMITS.pos);
    out.pz = clamp(pz, -HEAD_LIMITS.pos, HEAD_LIMITS.pos);
    out.yaw = clamp(yaw, -(HEAD_LIMITS.yaw + LOOK_BACK_YAW * lb), HEAD_LIMITS.yaw + LOOK_BACK_YAW * lb);
    out.pitch = clamp(pitch, -HEAD_LIMITS.pitch, HEAD_LIMITS.pitch);
    out.roll = clamp(roll, -HEAD_LIMITS.roll, HEAD_LIMITS.roll);
    out.fovAdd = clamp(s.speedFov * this.fovV + this.punchV * 6 * (s.motion > 0 ? 1 : 0), -HEAD_LIMITS.fov, HEAD_LIMITS.fov);
    out.lookBack = lb;
    out.tuck = tuck;
    out.buffet = clamp(this.buffetV, 0, 1);
    return out;
  }
}

/** Ease-in-out so the head accelerates and settles like a neck, not a hinge. */
function easeLook(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}
