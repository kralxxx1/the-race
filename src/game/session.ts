import type { BikeSpec } from '../data/bikes';
import type { MissionDef } from '../data/career';
import type { EnvDef } from '../data/environments';
import type { ModeDef } from '../data/modes';
import { clamp, smoothstep } from '../core/math';
import { BikePhysics, neutralInput, type PhysicsEvent, type RiderInput, type RoadLimits, type Upgrades } from '../physics/bike';
import { RoadPath, laneCenter, makeLaneConfig, pavedHalfWidth, type LaneConfig } from '../world/road';
import { TrafficSystem, trafficContext, type TrafficCar, type TrafficEvent } from '../world/traffic';
import { MissionTracker, emptySample, type MissionFailReason, type MissionSample } from './missions';
import { computeWake, type WakeResult } from './wake';
import { NEAR_MISS_CLEARANCE, ScoreKeeper } from './scoring';

export const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 12;
export const PLAYER_HALF_LENGTH = 1.05;
export const COUNTDOWN_SECONDS = 3;
const COAST_SECONDS = 3;
const COAST_INPUT: RiderInput = { ...neutralInput(), brake: 0.7 };

/**
 * Seconds a time-trial checkpoint adds. It shrinks by a second per checkpoint so the pace has to rise, but never
 * below the floor: the bonus has to stay long enough to ride the next stretch at a speed the bikes can hold in traffic.
 */
export const TIME_TRIAL_MIN_BONUS = 24;
export function timeTrialBonus(base: number, checkpointIndex: number): number {
  return Math.max(TIME_TRIAL_MIN_BONUS, base - (checkpointIndex - 1));
}

export type SessionState = 'countdown' | 'running' | 'crashed' | 'finished';
export type FinishReason = 'crash' | 'timeUp' | 'quit' | 'missionComplete' | 'missionFailed';

export type SessionEvent =
  | PhysicsEvent
  | TrafficEvent
  | { type: 'nearMiss'; car: TrafficCar; side: -1 | 1; points: number; combo: number; clearance: number }
  | { type: 'pass'; car: TrafficCar; side: -1 | 1; oncoming: boolean; clearance: number }
  | { type: 'hit'; car: TrafficCar; relSpeed: number }
  | { type: 'checkpoint'; index: number; bonus: number }
  | { type: 'timeUp' }
  | { type: 'go' }
  | { type: 'respawn' }
  | { type: 'missionArmed' }
  | { type: 'missionComplete'; stars: number }
  | { type: 'missionFailed'; reason: MissionFailReason }
  | { type: 'finish'; reason: FinishReason };

/** Rider aids applied to the raw input before the physics sees it. */
export interface SessionAssists {
  /** Traffic Rider style auto-acceleration: full throttle unless braking. */
  autoThrottle?: boolean;
  /** Holding the wheelie control also holds the throttle at the balance point. */
  wheelie?: boolean;
}

export interface SessionConfig {
  bike: BikeSpec;
  upgrades: Upgrades;
  mode: ModeDef;
  env: EnvDef;
  seed: number;
  autoShift: boolean;
  /** Career mission played in this run (its objective decides when the run ends). */
  mission?: MissionDef;
  assists?: SessionAssists;
}

/** The complete, rendering-independent game simulation of one run. */
export class GameSession {
  readonly road: RoadPath;
  readonly lanes: LaneConfig;
  readonly bike: BikePhysics;
  readonly traffic: TrafficSystem;
  readonly score = new ScoreKeeper();
  readonly limits: RoadLimits;
  state: SessionState = 'countdown';
  countdown = COUNTDOWN_SECONDS;
  /** Time since the run started (excluding countdown). */
  time = 0;
  /** Remaining time for timed modes. */
  timeLeft: number | null = null;
  checkpointIndex = 0;
  crashTime = 0;
  crashedInto: TrafficCar | null = null;
  finishReason: FinishReason | null = null;
  events: SessionEvent[] = [];
  /** Wake of passing vehicles: lateral shove applied to the bike (m/s) and smoothed camera turbulence 0..1. */
  readonly wake: WakeResult = { push: 0, turbulence: 0 };
  /** Objective tracker of a career run (null in free modes). */
  readonly mission: MissionTracker | null;
  private acc = 0;
  private respawnTimer = 0;
  /** Seconds the world keeps rolling after a clean finish, so the result card never sits on a frozen frame. */
  private coast = 0;
  private readonly sample: MissionSample = emptySample();
  private readonly inputBuf: RiderInput = neutralInput();
  private readonly subInput: RiderInput = neutralInput();
  private shiftUpReq = false;
  private shiftDownReq = false;

  constructor(readonly cfg: SessionConfig) {
    this.road = new RoadPath(cfg.seed, 1, cfg.env.terrain === 'city' ? 0.5 : 1);
    this.lanes = makeLaneConfig(cfg.mode.layout);
    this.limits = { halfWidth: pavedHalfWidth(this.lanes) - 0.45, grip: cfg.env.grip };
    this.bike = new BikePhysics(cfg.bike, cfg.upgrades);
    this.bike.autoShift = cfg.autoShift;
    this.traffic = new TrafficSystem(this.lanes, { seed: cfg.seed * 31 + 7, ...trafficContext(cfg.env), ...cfg.mode.traffic });
    this.startPosition();
    this.traffic.reset(this.bike.s);
    if (cfg.mode.timer) this.timeLeft = cfg.mode.timer.start;
    this.mission = cfg.mission ? new MissionTracker(cfg.mission) : null;
    if (this.mission) this.timeLeft = this.mission.timeLeft;
  }

  /** Lane index the player starts in (rightmost lane of the player's direction). */
  get startLane(): number {
    const dirs = this.lanes.dirs;
    for (let i = dirs.length - 1; i >= 0; i--) if (dirs[i] === 1) return i;
    return 0;
  }

  private startPosition(): void {
    this.bike.reset(20, laneCenter(this.lanes, this.startLane) - 0.6, 0);
  }

  get playerHalfWidth(): number {
    return 0.38 + 0.32 * Math.abs(Math.sin(this.bike.lean));
  }

  /** Is the player on a lane carrying oncoming traffic? */
  get inOppositeLane(): boolean {
    if (this.lanes.layout !== 'twoway') return false;
    return this.bike.d < -0.3;
  }

  get oppositeLaneActive(): boolean {
    return this.inOppositeLane && this.bike.speedKmh >= 100;
  }

  update(frameDt: number, input: RiderInput): void {
    const dt = clamp(frameDt, 0, 0.1);
    if (this.state === 'finished') {
      if (this.coast > 0) {
        this.coast -= dt;
        // Collisions are no longer judged once the run is decided, so hold the world still
        // rather than let the bike roll through a vehicle it is about to reach.
        if (!this.coastBlocked()) this.stepPhysics(dt, COAST_INPUT);
      }
      return;
    }
    if (this.state === 'countdown') {
      this.countdown -= dt;
      // Rider may rev the engine on the grid; the bike is held by the front brake.
      this.stepPhysics(dt, { ...input, brake: 1, steer: 0, wheelie: false, clutchIn: true });
      if (this.countdown <= 0) {
        this.state = 'running';
        this.events.push({ type: 'go' });
      }
      return;
    }
    this.stepPhysics(dt, this.state === 'running' ? input : neutralInput());
  }

  /** Is a vehicle within braking reach straight ahead? (Only used while coasting after the finish.) */
  private coastBlocked(): boolean {
    const b = this.bike;
    const reach = b.v * 0.8 + 8;
    for (const c of this.traffic.cars) {
      const gap = c.s - b.s - c.length / 2 - PLAYER_HALF_LENGTH;
      if (gap < -1 || gap > reach) continue;
      if (Math.abs(c.d - b.d) < c.width / 2 + 1.0) return true;
    }
    return false;
  }

  /** Apply the rider aids; returns a reused buffer (no per-frame allocation). */
  private assisted(input: RiderInput): RiderInput {
    const out = this.inputBuf;
    out.throttle = input.throttle;
    out.brake = input.brake;
    out.steer = input.steer;
    out.wheelie = input.wheelie;
    out.shiftUp = input.shiftUp;
    out.shiftDown = input.shiftDown;
    // Explicit, so a grid-revving `clutchIn` never leaks into the ride.
    out.clutchIn = input.clutchIn === true;
    const a = this.cfg.assists;
    if (!a || this.state !== 'running') return out;
    if (a.autoThrottle) out.throttle = out.brake > 0.05 ? 0 : 1;
    if (a.wheelie && out.wheelie && out.brake < 0.2) {
      // Full drive pulls the front up to the bike's balance point; ease off near the limit.
      out.throttle = Math.max(out.throttle, this.bike.pitch > 0.75 ? 0.6 : 1);
    }
    return out;
  }

  private stepPhysics(dt: number, rawInput: RiderInput): void {
    this.acc += dt;
    let steps = 0;
    let first = true;
    const input = this.assisted(rawInput);
    // A frame shorter than a physics step (144/240 Hz displays) runs no step: the one-frame shift press is kept until one does.
    this.shiftUpReq ||= input.shiftUp;
    this.shiftDownReq ||= input.shiftDown;
    while (this.acc >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.acc -= FIXED_DT;
      steps++;
      // Edge-triggered shift requests only apply to the first sub-step.
      const inp = Object.assign(this.subInput, input);
      inp.shiftUp = first && this.shiftUpReq;
      inp.shiftDown = first && this.shiftDownReq;
      if (first) this.shiftUpReq = this.shiftDownReq = false;
      first = false;
      this.fixedStep(FIXED_DT, inp);
      if (this.state === 'finished' && this.coast <= 0) break;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0; // drop time instead of spiralling
  }

  private fixedStep(dt: number, input: RiderInput): void {
    const bike = this.bike;
    const running = this.state === 'running';
    const s0 = bike.distance;
    bike.draft = this.computeDraft();
    bike.step(dt, input, this.road, this.limits);
    if (running && !bike.crashed) this.applyWake(dt);
    for (const e of bike.events) this.events.push(e);
    bike.events.length = 0;

    const probe = { s: bike.s, d: bike.d, v: this.state === 'crashed' ? 0 : bike.v };
    this.traffic.update(dt, probe, bike.distance);
    for (const e of this.traffic.events) this.events.push(e);
    this.traffic.events.length = 0;

    if (running) {
      this.time += dt;
      this.score.update(dt, {
        speedKmh: bike.speedKmh,
        distanceDelta: bike.distance - s0,
        oppositeLane: this.inOppositeLane,
        wheelie: bike.isWheelie,
      });
      this.checkTraffic();
      if (bike.crashed && this.state === 'running') this.onCrash();
      this.updateTimer(dt);
      if (this.mission && this.state === 'running') this.updateMission(dt, bike.distance - s0);
    } else if (this.state === 'crashed') {
      this.crashTime += dt;
      if (this.cfg.mode.respawn) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawn();
      }
    }
  }

  /** Turbulence of passing traffic: a deterministic lateral shove plus the camera's buffeting level. */
  private applyWake(dt: number): void {
    const bike = this.bike;
    const w = computeWake(bike.s, bike.d, bike.v, this.traffic.cars, this.wakeRaw);
    // Eased in/out so a passing vehicle pushes like a gust, not a step.
    this.wake.push += (w.push - this.wake.push) * Math.min(1, dt * 7);
    this.wake.turbulence += (w.turbulence - this.wake.turbulence) * Math.min(1, dt * 5);
    const lim = this.limits.halfWidth;
    bike.d = clamp(bike.d + this.wake.push * dt * smoothstep(4, 12, bike.v), -lim, lim);
  }

  private readonly wakeRaw: WakeResult = { push: 0, turbulence: 0 };

  private computeDraft(): number {
    const bike = this.bike;
    let best = 0;
    for (const c of this.traffic.cars) {
      if (c.dir !== 1) continue;
      const gap = c.s - bike.s - c.length / 2 - PLAYER_HALF_LENGTH;
      if (gap < 0.5 || gap > 28) continue;
      if (Math.abs(c.d - bike.d) > c.width / 2) continue;
      const size = c.arch.heavy ? 1 : 0.6;
      best = Math.max(best, smoothstep(28, 5, gap) * size);
    }
    return best;
  }

  private checkTraffic(): void {
    const bike = this.bike;
    const hw = this.playerHalfWidth;
    for (const c of this.traffic.cars) {
      const ds = c.s - bike.s;
      // Collision: road-space box overlap.
      if (Math.abs(ds) < (c.length / 2 + PLAYER_HALF_LENGTH) && Math.abs(c.d - bike.d) < c.width / 2 * 0.96 + hw) {
        if (!bike.crashed) {
          bike.crash('traffic');
          this.crashedInto = c;
          const rel = c.dir === 1 ? bike.v - c.v : bike.v + c.v;
          this.events.push({ type: 'hit', car: c, relSpeed: rel });
        }
        return;
      }
      // Passing detection: the rider moves from behind the car's centre to in front of it.
      if (!c.passed && ds < 0) {
        c.passed = true;
        const clearance = Math.abs(c.d - bike.d) - c.width / 2 - hw;
        const side: -1 | 1 = c.d < bike.d ? -1 : 1;
        const oncoming = c.dir === -1;
        // Only count vehicles we actually overtook or met (not ones that spawned behind us).
        if (ds > -(c.length / 2 + 6)) {
          this.events.push({ type: 'pass', car: c, side, oncoming, clearance });
          // One credit per vehicle: braking to let it go by and overtaking it again must not pay a second time.
          const fresh = !c.credited;
          c.credited = true;
          if (fresh && !oncoming) this.score.overtake();
          if (fresh && clearance < NEAR_MISS_CLEARANCE) {
            const pts = this.score.nearMiss(clearance, bike.speedKmh, oncoming);
            if (pts > 0) {
              c.nearMiss = true;
              this.events.push({ type: 'nearMiss', car: c, side, points: pts, combo: this.score.combo, clearance });
            }
          }
        }
      } else if (c.passed && ds > c.length / 2 + 2 && c.dir === 1) {
        // A car re-passed us (e.g. we braked): allow it to be overtaken again.
        c.passed = false;
      }
    }
  }

  private updateTimer(dt: number): void {
    const t = this.cfg.mode.timer;
    if (!t || this.timeLeft === null) return;
    this.timeLeft -= dt;
    const next = (this.checkpointIndex + 1) * t.checkpointEvery;
    if (this.score.distance >= next) {
      this.checkpointIndex++;
      const bonus = timeTrialBonus(t.bonus, this.checkpointIndex);
      this.timeLeft += bonus;
      this.score.addBonus(1000 * this.checkpointIndex);
      this.events.push({ type: 'checkpoint', index: this.checkpointIndex, bonus });
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.events.push({ type: 'timeUp' });
      this.finish('timeUp');
    }
  }

  private updateMission(dt: number, distanceDelta: number): void {
    const m = this.mission!;
    const sc = this.score;
    const sm = this.sample;
    sm.time = this.time;
    sm.distance = sc.distance;
    sm.distanceDelta = distanceDelta;
    sm.speedKmh = this.bike.speedKmh;
    sm.score = sc.score;
    sm.overtakes = sc.overtakes;
    sm.nearMisses = sc.nearMisses;
    sm.combo = sc.combo;
    sm.maxCombo = sc.maxCombo;
    sm.topSpeed = sc.topSpeed;
    sm.oppositeDistance = sc.oppositeDistance;
    sm.wheelieDistance = sc.wheelieDistance;
    sm.currentWheelie = sc.currentWheelie;
    sm.longestWheelie = sc.longestWheelie;
    m.update(dt, sm);
    this.timeLeft = m.timeLeft;
    this.flushMissionEvents();
    if (m.status === 'complete') this.finish('missionComplete');
    else if (m.status === 'failed') this.finish('missionFailed');
  }

  private flushMissionEvents(): void {
    const m = this.mission;
    if (!m) return;
    for (const e of m.events) {
      if (e.type === 'checkpoint') this.events.push({ type: 'checkpoint', index: e.index, bonus: e.bonus });
      else if (e.type === 'armed') this.events.push({ type: 'missionArmed' });
      else if (e.type === 'complete') this.events.push({ type: 'missionComplete', stars: e.stars });
      else {
        if (e.reason === 'timeUp') this.events.push({ type: 'timeUp' });
        this.events.push({ type: 'missionFailed', reason: e.reason });
      }
    }
    m.events.length = 0;
  }

  private onCrash(): void {
    this.state = 'crashed';
    this.crashTime = 0;
    this.traffic.triggerIncident(this.bike.s);
    if (this.cfg.mode.respawn) this.respawnTimer = 2.8;
    if (this.mission) {
      this.mission.fail('crash');
      this.flushMissionEvents();
    }
  }

  /** End the run after the crash cinematic (missions report a failed mission). */
  finishAfterCrash(): void {
    this.finish(this.mission ? 'missionFailed' : 'crash');
  }

  private respawn(): void {
    const bike = this.bike;
    const lane = this.startLane;
    // Clear the area around the respawn point.
    this.traffic.cars = this.traffic.cars.filter((c) => {
      const keep = Math.abs(c.s - bike.s) > 90;
      if (!keep) this.traffic.events.push({ type: 'despawn', car: c });
      else {
        c.hazard = false;
        c.v0 = Math.max(c.v0, 20);
      }
      return keep;
    });
    for (const c of this.traffic.cars) if (c.v0 === 0) c.v0 = 22;
    bike.reset(bike.s + 5, laneCenter(this.lanes, lane), 0);
    this.crashedInto = null;
    this.state = 'running';
    this.events.push({ type: 'respawn' });
  }

  finish(reason: FinishReason): void {
    if (this.state === 'finished') return;
    const m = this.mission;
    if (m) {
      // Ending a mission run any other way than completing it counts as a failure.
      if (m.running) {
        m.fail(reason === 'quit' ? 'quit' : reason === 'timeUp' ? 'timeUp' : 'crash');
        this.flushMissionEvents();
      }
      if (reason !== 'quit') reason = m.status === 'complete' ? 'missionComplete' : 'missionFailed';
    }
    this.state = 'finished';
    this.finishReason = reason;
    // A clean ending (not a crash or quit) lets the world roll on for a moment before the result card.
    if (reason === 'missionComplete' || reason === 'timeUp' || (reason === 'missionFailed' && m?.failReason !== 'crash')) this.coast = COAST_SECONDS;
    this.events.push({ type: 'finish', reason });
  }

  drainEvents(): SessionEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
