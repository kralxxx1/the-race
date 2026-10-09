import type { BikeSpec, BikeStyle, EngineSpec } from '../data/bikes';
import { G, MonotoneCurve, clamp } from '../core/math';

export const HP_TO_KW = 0.745699872;
export const AIR_DENSITY = 1.2;
export const RIDER_MASS = 80;
export const DRIVETRAIN_EFFICIENCY = 0.9;
export const ROLLING_RESISTANCE = 0.015;
const RPM_TO_RAD = (2 * Math.PI) / 60;

/** Torque (N·m) available at a given crank rpm at full throttle. */
export interface PowerCurve {
  readonly kind: 'combustion' | 'electric';
  readonly idle: number;
  readonly redline: number;
  readonly limiter: number;
  /** Maximum mechanical rpm the unit is allowed to reach. */
  readonly maxRpm: number;
  torqueAt(rpm: number): number;
  /** Positive braking torque when throttle is closed (engine braking / regen). */
  dragTorqueAt(rpm: number): number;
}

const FLAT_TORQUE_LAYOUTS = new Set(['V2_45', 'BOXER', 'F6', 'I6', 'V2_60']);

export function buildPowerCurve(e: EngineSpec): PowerCurve {
  const pkw = e.hp * HP_TO_KW;
  if (e.layout === 'ELECTRIC') {
    const tp = e.torque;
    const maxRpm = e.limiter;
    return {
      kind: 'electric',
      idle: 0,
      redline: e.redline,
      limiter: e.limiter,
      maxRpm,
      torqueAt(rpm: number) {
        if (rpm >= maxRpm) return 0;
        const r = Math.max(rpm, 1);
        return Math.min(tp, (pkw * 9549) / r);
      },
      dragTorqueAt(rpm: number) {
        // Regenerative braking: strongest mid-range, fades at very low speed.
        return tp * 0.28 * clamp(rpm / 1500, 0, 1);
      },
    };
  }

  const tHp = (pkw * 9549) / e.hpRpm;
  const tPeak = Math.max(e.torque, tHp);
  const torqueRpm = Math.min(e.torqueRpm, e.hpRpm * 0.92);
  const idleFrac = FLAT_TORQUE_LAYOUTS.has(e.layout) ? 0.72 : e.cc < 500 ? 0.5 : 0.56;
  const pts: [number, number][] = [
    [e.idle * 0.5, tPeak * idleFrac * 0.8],
    [e.idle, tPeak * idleFrac],
    [e.idle + (torqueRpm - e.idle) * 0.45, tPeak * (idleFrac + (1 - idleFrac) * 0.78)],
    [torqueRpm, tPeak],
  ];
  // Shape the shoulder around peak power so the power curve has a flat top at hpRpm.
  const pre = e.hpRpm * 0.95;
  if (pre > torqueRpm + 50) pts.push([pre, Math.min(tPeak, (pkw * 0.993 * 9549) / pre)]);
  pts.push([e.hpRpm, tHp]);
  const post = Math.min(e.hpRpm * 1.04, (e.hpRpm + e.limiter) / 2);
  if (post > e.hpRpm + 30) pts.push([post, (pkw * 0.993 * 9549) / post]);
  if (e.limiter > post + 30) pts.push([e.limiter, (pkw * 0.9 * 9549) / e.limiter]);
  pts.push([e.limiter * 1.15, (pkw * 0.6 * 9549) / (e.limiter * 1.15)]);

  const curve = new MonotoneCurve(pts.map(([r, t]) => [r, Math.min(t, tPeak)] as [number, number]));
  const bigTwin = FLAT_TORQUE_LAYOUTS.has(e.layout) || e.layout === 'SINGLE';
  return {
    kind: 'combustion',
    idle: e.idle,
    redline: e.redline,
    limiter: e.limiter,
    maxRpm: e.limiter * 1.05,
    torqueAt(rpm: number) {
      return Math.max(0, curve.sample(rpm));
    },
    dragTorqueAt(rpm: number) {
      // Pumping + friction losses grow with rpm; big twins/singles brake harder.
      const k = bigTwin ? 0.16 : 0.1;
      return tPeak * (0.04 + k * clamp(rpm / e.redline, 0, 1.2));
    },
  };
}

/** Sample peak power (hp) and peak torque from a curve, for validation and UI. */
export function measureCurve(c: PowerCurve): { hp: number; hpRpm: number; torque: number; torqueRpm: number } {
  let hp = 0;
  let hpRpm = 0;
  let torque = 0;
  let torqueRpm = 0;
  const start = c.kind === 'electric' ? 100 : c.idle;
  for (let rpm = start; rpm <= c.limiter; rpm += 25) {
    const t = c.torqueAt(rpm);
    const p = (t * rpm) / 9549 / HP_TO_KW;
    if (p > hp) {
      hp = p;
      hpRpm = rpm;
    }
    if (t > torque) {
      torque = t;
      torqueRpm = rpm;
    }
  }
  return { hp, hpRpm, torque, torqueRpm };
}

export interface ChassisParams {
  /** Distance from the rear contact patch to the centre of gravity (m). */
  lr: number;
  /** Centre-of-gravity height including rider (m). */
  h: number;
  wheelbase: number;
  /** Brake system quality multiplier. */
  brakeQuality: number;
  /** Natural roll frequency of the lean controller (rad/s). */
  leanOmega: number;
  /** Fraction of power-to-weight usable for rider initiated wheelies. */
  wheelieAuthority: number;
}

const STYLE_CHASSIS: Record<BikeStyle, { front: number; h: number; brake: number }> = {
  sport: { front: 0.5, h: 0.7, brake: 1.0 },
  hyper: { front: 0.5, h: 0.68, brake: 1.0 },
  naked: { front: 0.49, h: 0.72, brake: 0.97 },
  adventure: { front: 0.47, h: 0.8, brake: 0.92 },
  touring: { front: 0.46, h: 0.74, brake: 0.9 },
  cruiser: { front: 0.43, h: 0.66, brake: 0.82 },
  classic: { front: 0.46, h: 0.7, brake: 0.8 },
  scooter: { front: 0.42, h: 0.66, brake: 0.78 },
};

export function buildChassis(spec: BikeSpec): ChassisParams {
  const st = STYLE_CHASSIS[spec.style];
  const L = spec.look.wheelbase;
  // Heavier machines respond more slowly to lean input.
  const leanOmega = clamp(10.5 - (spec.weight - 160) * 0.017, 5.2, 10);
  let auth = 1;
  if (spec.style === 'touring' || spec.style === 'scooter') auth = 0.55;
  if (spec.style === 'cruiser') auth = 0.8;
  return { lr: st.front * L, h: st.h, wheelbase: L, brakeQuality: st.brake, leanOmega, wheelieAuthority: auth };
}

export interface Drivetrain {
  wheelRadius: number;
  /** Overall reduction (crank rpm / wheel rpm) per gear, index 0 = 1st. */
  ratios: number[];
  /** For CVT: lowest and highest overall ratios. */
  cvtLow: number;
  cvtHigh: number;
  efficiency: number;
  /** Aerodynamic drag area C_d·A (m²), solved so the spec top speed is reached. */
  cda: number;
  crr: number;
  /** Bike + rider mass (kg). */
  mass: number;
  /** rpm at which a moving launch fully engages the clutch. */
  clutchEngageRpm: number;
  /** Target rpm while slipping the clutch at full throttle. */
  launchRpm: number;
}

const GEAR_SPREAD: Record<BikeStyle, number> = {
  sport: 2.05,
  hyper: 2.1,
  naked: 2.3,
  adventure: 2.6,
  touring: 2.5,
  cruiser: 2.35,
  classic: 2.6,
  scooter: 2.6,
};

export function wheelRpm(v: number, ratio: number, radius: number): number {
  return (v / radius / RPM_TO_RAD) * ratio;
}

export function speedAtRpm(rpm: number, ratio: number, radius: number): number {
  return (rpm * RPM_TO_RAD * radius) / ratio;
}

export function buildDrivetrain(spec: BikeSpec, curve: PowerCurve = buildPowerCurve(spec.engine)): Drivetrain {
  const r = spec.look.rearWheelR;
  const vTop = spec.topSpeed / 3.6;
  const mass = spec.weight + RIDER_MASS;
  const e = spec.engine;
  const rpmTop =
    curve.kind === 'electric' ? e.limiter * 0.97 : Math.min(e.hpRpm * 1.05, e.limiter * 0.985, e.redline * 1.02);
  const topRatio = (rpmTop * RPM_TO_RAD * r) / vTop;
  const n = Math.max(1, spec.gears);
  const ratios: number[] = [];
  if (spec.transmission === 'manual' && n > 1) {
    const spread = GEAR_SPREAD[spec.style] * Math.pow(6 / n, 0.25);
    const first = topRatio * spread;
    for (let i = 0; i < n; i++) {
      const t = Math.pow(i / (n - 1), 0.82);
      ratios.push(first * Math.pow(topRatio / first, t));
    }
  } else {
    ratios.push(topRatio);
  }
  const wheelPower = curve.torqueAt(rpmTop) * rpmTop * RPM_TO_RAD * DRIVETRAIN_EFFICIENCY;
  const rollPower = ROLLING_RESISTANCE * mass * G * vTop;
  const cda = (wheelPower - rollPower) / (0.5 * AIR_DENSITY * vTop * vTop * vTop);
  const launchRpm =
    curve.kind === 'electric' ? 0 : Math.min(Math.max(e.torqueRpm * 0.58, e.idle * 2.2), e.redline * 0.52);
  return {
    wheelRadius: r,
    ratios,
    cvtLow: topRatio * GEAR_SPREAD[spec.style],
    cvtHigh: topRatio,
    efficiency: DRIVETRAIN_EFFICIENCY,
    cda,
    crr: ROLLING_RESISTANCE,
    mass,
    clutchEngageRpm: curve.kind === 'electric' ? 0 : e.idle * 1.35,
    launchRpm,
  };
}
