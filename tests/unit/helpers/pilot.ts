import { BIKES, getBike, type BikeSpec } from '../../../src/data/bikes';
import type { MissionDef } from '../../../src/data/career';
import { missionMode } from '../../../src/data/career';
import { resolveEnvironment } from '../../../src/data/maps';
import { neutralInput, type RiderInput } from '../../../src/physics/bike';
import { GameSession } from '../../../src/game/session';
import { laneCenter } from '../../../src/world/road';

/**
 * A headless "decent rider": picks the freest lane, keeps a speed that fits the gap
 * ahead and optionally plays an objective (ride the oncoming lane, hug lane lines for
 * near misses, hold a wheelie). Used to prove that career missions are completable.
 */
export interface PilotOptions {
  /** Speed cap in m/s. */
  cruise: number;
  /** Prefer the oncoming lanes (two-way roads). */
  preferOpposite?: boolean;
  /** Ride lane lines next to cars to score close passes. */
  hunt?: boolean;
  wheelie?: boolean;
  /** Extra look-ahead safety (metres of gap per m/s of speed). */
  caution?: number;
  /** Speed (m/s) a keep-speed objective must not drop below: the pilot changes lane instead of braking. */
  minSpeed?: number;
}

const HALF_LEN = 1.05;

interface LaneView {
  /** Seconds until we reach the first obstacle in the lane at the current closing speed. */
  ttc: number;
  /** Highest speed (m/s) that keeps a safe headway behind the lane's same-direction leader. */
  follow: number;
  /** Like `follow` but with a long look-ahead: used to pick the lane early, before the speed is lost. */
  plan: number;
  /** Seconds until we catch up with the nearest same-direction vehicle in the lane (capped at 30). */
  reach: number;
  /** An oncoming vehicle is in the corridor. */
  oncoming: boolean;
}

function viewLane(sess: GameSession, lane: number, reach = 1.3, skip: object | null = null): LaneView {
  return viewAt(sess, laneCenter(sess.lanes, lane), lane, reach, skip);
}

function viewAt(sess: GameSession, dc: number, lane: number, reach: number, skip: object | null): LaneView {
  const b = sess.bike;
  const v: LaneView = { ttc: 30, follow: Infinity, plan: Infinity, reach: 30, oncoming: false };
  for (const c of sess.traffic.cars) {
    if (c === skip) continue;
    const intoLane = (c.laneChange && c.laneChange.to === lane) || (c.indicator !== 0 && c.lane + c.indicator === lane);
    if (Math.abs(c.d - dc) > c.width / 2 + reach && !intoLane) continue;
    const ahead = c.s - b.s;
    if (ahead + c.length / 2 + HALF_LEN < -2) continue; // behind us
    const gap = Math.max(0, ahead - c.length / 2 - HALF_LEN);
    const closing = c.dir === 1 ? b.v - c.v : b.v + c.v;
    const ttc = gap <= 0 ? 0 : closing > 0.3 ? gap / closing : 30;
    v.ttc = Math.min(v.ttc, ttc);
    if (c.dir === 1) {
      v.follow = Math.min(v.follow, c.v + Math.max(0, gap - 9) / 2.4);
      v.plan = Math.min(v.plan, c.v + Math.max(0, gap - 20) / 5);
      v.reach = Math.min(v.reach, ttc);
    }
    else v.oncoming = true;
  }
  return v;
}

export function pilotInput(sess: GameSession, o: PilotOptions): RiderInput {
  const b = sess.bike;
  const cfg = sess.lanes;
  const cur = Math.max(0, Math.min(cfg.lanes - 1, Math.round(b.d / cfg.laneWidth + (cfg.lanes - 1) / 2)));
  const here = viewLane(sess, cur);
  // Value of a lane = the speed we can hold in it (+ a pull for the oncoming-lane objective).
  const value = (l: number, v: LaneView): number => {
    // Slow traffic we would reach within ~9 s makes a lane worse long before we have to brake.
    let x = Math.min(o.cruise, v.plan) - Math.max(0, 9 - v.reach) * 3;
    if (o.preferOpposite) x += (cfg.dirs[l] === -1 ? 12 : 0) + (l < cur ? 3 : l > cur ? -3 : 0) - (l === 0 ? 6 : 0);
    if (v.oncoming && v.ttc < (o.preferOpposite ? 3.4 : 5)) x -= 30;
    if (v.ttc < 2) x -= 30;
    if (o.minSpeed && v.plan < o.minSpeed + 2) x -= 15;
    return x;
  };
  let bestLane = cur;
  let bestValue = value(cur, here) + 2; // hysteresis: only move for a clear gain
  for (let l = 0; l < cfg.lanes; l++) {
    if (l === cur) continue;
    if (cfg.dirs[l] === -1 && !o.preferOpposite) continue;
    // Lanes further away are reached one step at a time; the first step must be safe.
    const step = cur + Math.sign(l - cur);
    if (cfg.dirs[step] === -1 && !o.preferOpposite) continue;
    const first = viewLane(sess, step, 1.8);
    if (first.ttc < 4.2) continue;
    const v = step === l ? first : viewLane(sess, l, 1.8);
    const x = value(l, v) - 2 * (Math.abs(l - cur) - 1);
    if (x > bestValue) {
      bestValue = x;
      bestLane = step;
    }
  }
  const view = bestLane === cur ? here : viewLane(sess, bestLane, 1.8);
  let target = laneCenter(cfg, bestLane);
  if (o.hunt && b.speedKmh > 95) {
    // Brush past the closest car ahead: ride 0.5 m off its flank (clear of the lane line traffic).
    let best: (typeof sess.traffic.cars)[number] | null = null;
    for (const c of sess.traffic.cars) {
      if (c.dir !== 1 || c.laneChange) continue;
      // Keep hugging a car until we are clear of it (its rear is behind our front wheel).
      const ahead = c.s - b.s + c.length / 2;
      if (ahead < -1 || ahead > 150) continue;
      if (!best || ahead < best.s - b.s + best.length / 2) best = c;
    }
    if (best) {
      const side = best.d >= b.d ? -1 : 1; // approach from the side we are already on
      const dc = best.d + side * (best.width / 2 + sess.playerHalfWidth + 0.5);
      const lane = Math.max(0, Math.min(cfg.lanes - 1, Math.round(dc / cfg.laneWidth + (cfg.lanes - 1) / 2)));
      const flank = viewAt(sess, dc, lane, 1.1, best);
      if (cfg.dirs[lane] === 1 && Math.abs(dc) < 6.2 && flank.ttc > 3) {
        target = dc;
      }
    }
  }
  // Cornered by an oncoming vehicle with no lane to move to: swerve onto the shoulder instead of braking to a stop.
  let evading = false;
  if (bestLane === cur && here.oncoming && here.ttc < 3.4) {
    const edge = cur === 0 ? -1 : cur === cfg.lanes - 1 ? 1 : 0;
    if (edge !== 0) {
      target = laneCenter(cfg, cur) + edge * 2.5;
      evading = true;
    }
  }
  const err = target - b.d;
  const steer = Math.max(-1, Math.min(1, err * 0.7 - b.heading * 8));
  let want = Math.min(o.cruise, view.follow, here.follow);
  // Keep-speed: only brake below the floor when a collision is really imminent.
  if (o.minSpeed && Math.min(here.ttc, view.ttc) > 2.4) want = Math.max(want, o.minSpeed + 3);
  if (here.oncoming && here.ttc < 3.4 && bestLane === cur && !evading) want = Math.min(want, 4);
  const hard = Math.min(here.ttc, view.ttc) < 1.6;
  return {
    ...neutralInput(),
    steer,
    throttle: b.v < want ? 1 : 0,
    brake: hard ? 1 : b.v > want + 2.5 ? Math.min(1, 0.4 + (b.v - want) * 0.08) : 0,
    wheelie: !!o.wheelie,
  };
}

/** The slowest bike that still meets the mission's top-speed requirement. */
export function slowestBikeFor(minTopSpeed: number): BikeSpec {
  const ok = BIKES.filter((b) => b.topSpeed >= minTopSpeed).sort((a, b) => a.topSpeed - b.topSpeed || a.price - b.price);
  return ok[0] ?? getBike('yamaha-r3');
}

export function missionSession(def: MissionDef, bike: BikeSpec, seed = 11): GameSession {
  return new GameSession({
    bike,
    upgrades: { engine: 0, brakes: 0, handling: 0 },
    mode: missionMode(def),
    env: resolveEnvironment(def.map, def.time, def.weather),
    seed,
    autoShift: true,
    mission: def,
  });
}

/** Drive a session with `drive` until it finishes or `maxSeconds` of game time pass. */
export function runSession(sess: GameSession, drive: (s: GameSession) => RiderInput, maxSeconds: number): void {
  const dt = 1 / 60;
  for (let i = 0; i < maxSeconds * 60 && sess.state !== 'finished'; i++) {
    sess.update(dt, drive(sess));
    if (sess.state === 'crashed') sess.finishAfterCrash();
  }
}

/** Hold a lateral position at (at most) a given speed: for scripted scenarios on an empty road. */
export function holdLane(sess: GameSession, targetD: number, maxMps: number, extra: Partial<RiderInput> = {}): RiderInput {
  const b = sess.bike;
  const steer = Math.max(-1, Math.min(1, (targetD - b.d) * 0.7 - b.heading * 8));
  return { ...neutralInput(), steer, throttle: b.v < maxMps ? 1 : 0, brake: b.v > maxMps + 3 ? 0.5 : 0, ...extra };
}

/** How the reference rider plays a mission: the objective decides lane preference, hunting and speed. */
export function referenceRiderOptions(def: MissionDef, bike: BikeSpec, extra: Partial<PilotOptions> = {}): PilotOptions {
  const t = def.objective.type;
  const hunt = t === 'nearMisses' || t === 'combo';
  return {
    // Hunting rides at a sane 122 km/h (lane-line passes at higher speed are a crash lottery); top-speed runs go all out.
    cruise: Math.min(hunt ? 34 : 99, (bike.topSpeed / 3.6) * (t === 'topSpeed' ? 1.02 : 0.9)),
    preferOpposite: t === 'oppositeLane',
    hunt,
    wheelie: t === 'wheelie',
    minSpeed: def.objective.type === 'keepSpeed' ? def.objective.kmh / 3.6 : undefined,
    ...extra,
  };
}
