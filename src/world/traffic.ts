import { Rng, clamp, smoothstep } from '../core/math';
import { VEHICLES, VEHICLE_KINDS, type VehicleArchetype, type VehicleKind } from '../data/vehicles';
import { laneCenter, type LaneConfig } from './road';

export interface TrafficCar {
  id: number;
  kind: VehicleKind;
  arch: VehicleArchetype;
  color: string;
  /** Road-space centre position. */
  s: number;
  d: number;
  lane: number;
  dir: 1 | -1;
  /** Speed along its own travel direction (m/s, ≥ 0). */
  v: number;
  /** Desired cruise speed (m/s). */
  v0: number;
  accel: number;
  length: number;
  width: number;
  /** 0..1 brake light intensity. */
  braking: number;
  /** -1 left, 0 off, 1 right (from the driver's point of view, in road space). */
  indicator: -1 | 0 | 1;
  signalTime: number;
  laneChange: { from: number; to: number; t: number; dur: number } | null;
  nextDecision: number;
  hazard: boolean;
  /** Direction of motion in road space: atan2(ḋ, ṡ). 0 = along +s, π = oncoming. */
  yaw: number;
  /** Bookkeeping for near misses / pass events, owned by the session. */
  passed: boolean;
  nearMiss: boolean;
  honkCooldown: number;
  /** Rolling distance used for wheel rotation in the renderer. */
  odometer: number;
  seed: number;
}

export interface PlayerProbe {
  s: number;
  d: number;
  v: number;
}

export interface TrafficOptions {
  seed: number;
  /** Base number of cars kept around the player. */
  baseDensity: number;
  /** Extra cars per kilometre travelled. */
  densityGrowth: number;
  maxDensity: number;
  /** 0..1 how eager drivers are to change lanes. */
  aggression: number;
  enabled: boolean;
}

export type TrafficEvent =
  | { type: 'spawn'; car: TrafficCar }
  | { type: 'despawn'; car: TrafficCar }
  | { type: 'honk'; car: TrafficCar }
  | { type: 'signal'; car: TrafficCar };

// Spawn beyond the fog line so vehicles never pop into view.
const SPAWN_MIN_AHEAD = 620;
const SPAWN_MAX_AHEAD = 860;
const DESPAWN_BEHIND = 160;
const DESPAWN_AHEAD = 1150;

// Intelligent Driver Model parameters
const IDM_A = 1.6;
const IDM_B = 2.6;
const IDM_T = 1.25;
const IDM_S0 = 3.2;

export class TrafficSystem {
  cars: TrafficCar[] = [];
  readonly events: TrafficEvent[] = [];
  private rng: Rng;
  private nextId = 1;
  private buckets: TrafficCar[][] = [];
  private bucketsValid = false;
  private laneSpeed: number[] = [];

  constructor(
    readonly cfg: LaneConfig,
    readonly opts: TrafficOptions,
  ) {
    this.rng = new Rng(opts.seed);
    this.computeLaneSpeeds();
  }

  private computeLaneSpeeds(): void {
    const cfg = this.cfg;
    // Rank lanes within each direction group: rank 0 = that direction's slow (outer) lane.
    for (let i = 0; i < cfg.lanes; i++) {
      const dir = cfg.dirs[i];
      const group = [...Array(cfg.lanes).keys()].filter((j) => cfg.dirs[j] === dir);
      // For dir +1 the slow lane is the rightmost (largest d); for -1 it is the leftmost.
      const ordered = group.sort((a, b) => (dir === 1 ? b - a : a - b));
      const rank = ordered.indexOf(i);
      const kmh = dir === 1 ? [78, 94, 108, 122][rank] ?? 100 : [84, 100, 112, 120][rank] ?? 100;
      this.laneSpeed[i] = kmh / 3.6;
    }
  }

  laneRank(lane: number): number {
    const cfg = this.cfg;
    const dir = cfg.dirs[lane];
    const group = [...Array(cfg.lanes).keys()].filter((j) => cfg.dirs[j] === dir);
    const ordered = group.sort((a, b) => (dir === 1 ? b - a : a - b));
    return ordered.indexOf(lane);
  }

  reset(playerS: number): void {
    for (const c of this.cars) this.events.push({ type: 'despawn', car: c });
    this.cars = [];
    if (!this.opts.enabled) return;
    const target = this.targetCount(0);
    let attempts = 0;
    while (this.cars.length < target && attempts < target * 25) {
      attempts++;
      const s = playerS + this.rng.range(90, SPAWN_MAX_AHEAD);
      this.trySpawn(s, { s: playerS, d: 0, v: 0 }, true);
    }
  }

  targetCount(distance: number): number {
    const o = this.opts;
    return Math.round(clamp(o.baseDensity + (distance / 1000) * o.densityGrowth, 0, o.maxDensity));
  }

  private pickKind(lane: number): VehicleKind {
    const rank = this.laneRank(lane);
    const kinds = VEHICLE_KINDS.filter((k) => !(VEHICLES[k].heavy && rank > 1));
    return this.rng.weighted(kinds, kinds.map((k) => VEHICLES[k].weight));
  }

  /** Lateral half-extent of a car's occupied corridor (accounts for lane changes). */
  private occupies(c: TrafficCar, lane: number): boolean {
    if (c.lane === lane) return true;
    return c.laneChange !== null && (c.laneChange.to === lane || c.laneChange.from === lane);
  }

  private trySpawn(s: number, player: PlayerProbe, initial: boolean, lane?: number): TrafficCar | null {
    const cfg = this.cfg;
    const rng = this.rng;
    const ln = lane ?? rng.int(0, cfg.lanes - 1);
    const dir = cfg.dirs[ln];
    const kind = this.pickKind(ln);
    const arch = VEHICLES[kind];
    // Keep a generous gap to anything already in that lane.
    for (const c of this.cars) {
      if (!this.occupies(c, ln)) continue;
      const gap = Math.abs(c.s - s) - (c.length + arch.length) / 2;
      if (gap < 28) return null;
    }
    // Fairness: never create a wall that blocks every lane of the player's direction.
    let nearby = 0;
    const sameDirLanes = cfg.dirs.filter((x) => x === 1).length;
    for (const c of this.cars) if (c.dir === 1 && Math.abs(c.s - s) < 22) nearby++;
    if (dir === 1 && nearby >= sameDirLanes - 1) return null;
    // Do not spawn on top of / right in front of the player.
    const dc = laneCenter(cfg, ln);
    if (Math.abs(s - player.s) < (initial ? 120 : 60) && Math.abs(dc - player.d) < 2.5) return null;

    const base = this.laneSpeed[ln] * arch.speedFactor;
    let v0 = base * rng.range(0.9, 1.1);
    if (kind === 'police') v0 = Math.max(v0, (128 + rng.range(0, 20)) / 3.6);
    const car: TrafficCar = {
      id: this.nextId++,
      kind,
      arch,
      color: rng.pick(arch.colors),
      s,
      d: dc,
      lane: ln,
      dir,
      v: v0,
      v0,
      accel: 0,
      length: arch.length,
      width: arch.width,
      braking: 0,
      indicator: 0,
      signalTime: 0,
      laneChange: null,
      nextDecision: rng.range(3, 12),
      hazard: false,
      yaw: dir === 1 ? 0 : Math.PI,
      passed: false,
      nearMiss: false,
      honkCooldown: 0,
      odometer: 0,
      seed: Math.floor(rng.range(0, 1e9)),
    };
    this.cars.push(car);
    this.events.push({ type: 'spawn', car });
    return car;
  }

  /** Rebuild per-lane occupancy buckets (cars changing lanes appear in both lanes). */
  private rebuildBuckets(): void {
    const b = this.buckets;
    for (let i = 0; i < this.cfg.lanes; i++) {
      if (!b[i]) b[i] = [];
      b[i].length = 0;
    }
    for (const c of this.cars) {
      b[c.lane].push(c);
      if (c.laneChange) {
        const other = c.laneChange.to !== c.lane ? c.laneChange.to : c.laneChange.from;
        if (other !== c.lane) b[other].push(c);
      }
    }
  }

  /** Nearest vehicle ahead of `c` (in its travel direction) whose corridor overlaps lane `lane`. */
  leaderOf(c: TrafficCar, lane: number, player: PlayerProbe | null): { gap: number; v: number } | null {
    let best: { gap: number; v: number } | null = null;
    const dc = laneCenter(this.cfg, lane);
    const pool = this.bucketsValid ? this.buckets[lane] : this.cars;
    for (const o of pool) {
      if (o === c) continue;
      if (!this.bucketsValid && Math.abs(o.d - dc) > (o.width + c.width) / 2 + 0.3 && !this.occupies(o, lane)) continue;
      const ahead = (o.s - c.s) * c.dir;
      if (ahead <= 0) continue;
      const gap = ahead - (o.length + c.length) / 2;
      const ov = o.dir === c.dir ? o.v : -o.v;
      if (!best || gap < best.gap) best = { gap, v: ov };
    }
    if (player && c.dir === 1 && Math.abs(player.d - dc) < (c.width / 2 + 0.6)) {
      const ahead = player.s - c.s;
      if (ahead > 0) {
        const gap = ahead - (c.length / 2 + 1.1);
        if (!best || gap < best.gap) best = { gap, v: player.v };
      }
    }
    return best;
  }

  private idm(v: number, v0: number, lead: { gap: number; v: number } | null): number {
    const free = 1 - Math.pow(v / Math.max(v0, 0.1), 4);
    if (!lead) return IDM_A * free;
    const dv = v - lead.v;
    const sStar = IDM_S0 + Math.max(0, v * IDM_T + (v * dv) / (2 * Math.sqrt(IDM_A * IDM_B)));
    const gap = Math.max(lead.gap, 0.1);
    return IDM_A * (free - (sStar / gap) ** 2);
  }

  private laneIsSafe(c: TrafficCar, to: number, player: PlayerProbe): boolean {
    const cfg = this.cfg;
    if (to < 0 || to >= cfg.lanes || cfg.dirs[to] !== c.dir) return false;
    for (const o of this.cars) {
      if (o === c || !this.occupies(o, to)) continue;
      const rel = (o.s - c.s) * c.dir;
      const gap = Math.abs(o.s - c.s) - (o.length + c.length) / 2;
      if (rel >= 0 && gap < Math.max(14, c.v * 0.9 + (c.v - o.v) * 2.5)) return false;
      if (rel < 0 && gap < Math.max(12, o.v * 0.8 + (o.v - c.v) * 3)) return false;
    }
    // Drivers check their mirrors for the motorcycle: refuse if it is alongside or
    // would arrive (time-to-contact) before the manoeuvre completes.
    const dc = laneCenter(cfg, to);
    if (Math.abs(player.d - dc) < 2.6) {
      const g = c.s - player.s; // signed gap along s
      if (Math.abs(g) < (c.length / 2 + 10)) return false;
      const u = c.dir * c.v - player.v; // car velocity relative to the rider
      if (g * u < 0) {
        const ttc = Math.abs(g) / Math.abs(u);
        if (ttc < 3.2) return false;
      }
    }
    return true;
  }

  /** Make every car near the crash site brake to a halt with hazard lights on. */
  triggerIncident(s: number, radius = 220): void {
    for (const c of this.cars) {
      if (Math.abs(c.s - s) < radius) {
        c.hazard = true;
        c.v0 = 0;
      }
    }
  }

  update(dt: number, player: PlayerProbe, distance: number): void {
    const cfg = this.cfg;
    const rng = this.rng;

    // ── spawning / despawning ──
    if (this.opts.enabled) {
      const target = this.targetCount(distance);
      let attempts = 0;
      while (this.cars.length < target && attempts < 4) {
        attempts++;
        const s = player.s + rng.range(SPAWN_MIN_AHEAD, SPAWN_MAX_AHEAD);
        this.trySpawn(s, player, false);
      }
      // Slow player: let faster traffic come from behind in the overtaking lanes.
      if (player.v < 16 && this.cars.length < target + 2 && rng.chance(dt * 0.25)) {
        const fast = [...Array(cfg.lanes).keys()].filter((l) => cfg.dirs[l] === 1 && this.laneRank(l) >= 1);
        if (fast.length) {
          const c = this.trySpawn(player.s - 150, player, false, rng.pick(fast));
          if (c) c.v = Math.max(c.v, player.v + 8);
        }
      }
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const rel = c.s - player.s;
      if (rel < -DESPAWN_BEHIND || rel > DESPAWN_AHEAD) {
        this.cars.splice(i, 1);
        this.events.push({ type: 'despawn', car: c });
      }
    }

    // ── behaviour ──
    this.rebuildBuckets();
    this.bucketsValid = true;
    for (const c of this.cars) {
      c.honkCooldown = Math.max(0, c.honkCooldown - dt);
      // Longitudinal: IDM against the leader in the current (and target) lane.
      let lead = this.leaderOf(c, c.lane, player);
      if (c.laneChange) {
        const l2 = this.leaderOf(c, c.laneChange.to, player);
        if (l2 && (!lead || l2.gap < lead.gap)) lead = l2;
      }
      let a = this.idm(c.v, c.v0, lead);
      if (c.hazard && c.v0 === 0) a = Math.min(a, -4.5);
      a = clamp(a, -8.5, IDM_A);
      c.accel = a;
      c.v = Math.max(0, c.v + a * dt);
      c.s += c.dir * c.v * dt;
      c.odometer += c.v * dt;
      const brakeTarget = a < -0.6 || (c.v < 0.5 && c.hazard) ? clamp(-a / 4, 0.4, 1) : 0;
      c.braking += (brakeTarget - c.braking) * Math.min(1, dt * 10);

      // Oncoming drivers flash and honk at a rider in their lane.
      if (c.dir === -1 && c.honkCooldown <= 0) {
        const rel = (c.s - player.s) * 1;
        if (rel > 20 && rel < 170 && Math.abs(player.d - c.d) < 1.8 && player.v > 8) {
          c.honkCooldown = 6;
          this.events.push({ type: 'honk', car: c });
        }
      }

      // Lateral: lane change state machine.
      if (c.laneChange) {
        const lc = c.laneChange;
        lc.t += dt;
        const k = smoothstep(0, 1, lc.t / lc.dur);
        const d0 = laneCenter(cfg, lc.from);
        const d1 = laneCenter(cfg, lc.to);
        const prevD = c.d;
        c.d = d0 + (d1 - d0) * k;
        c.yaw = Math.atan2((c.d - prevD) / Math.max(dt, 1e-4), c.dir * Math.max(c.v, 1));
        if (k > 0.5) c.lane = lc.to;
        if (lc.t >= lc.dur) {
          c.laneChange = null;
          c.lane = lc.to;
          c.d = d1;
          c.indicator = 0;
          c.yaw = c.dir === 1 ? 0 : Math.PI;
          c.nextDecision = rng.range(6, 16) * (1.2 - this.opts.aggression * 0.6);
        }
      } else if (c.indicator !== 0) {
        c.signalTime += dt;
        if (c.signalTime > 1.4) {
          // Indicator dir is in road space (+1 = towards larger d / lane index).
          const to = c.lane + c.indicator;
          if (this.laneIsSafe(c, to, player)) {
            c.laneChange = { from: c.lane, to, t: 0, dur: rng.range(2.4, 3.6) * (1.1 - this.opts.aggression * 0.3) };
            this.buckets[to].push(c);
          } else if (c.signalTime > 4) {
            c.indicator = 0;
            c.nextDecision = rng.range(3, 8);
          }
        }
      } else if (!c.hazard) {
        c.nextDecision -= dt;
        if (c.nextDecision <= 0) {
          c.nextDecision = rng.range(4, 12) * (1.2 - this.opts.aggression * 0.6);
          const blocked = lead !== null && lead.gap < 45 && lead.v < c.v0 * 0.92;
          const wantsMove = blocked || rng.chance(0.18 + this.opts.aggression * 0.25);
          if (wantsMove) {
            const options: number[] = [];
            for (const to of [c.lane - 1, c.lane + 1]) {
              if (to < 0 || to >= cfg.lanes || cfg.dirs[to] !== c.dir) continue;
              if (c.arch.heavy && this.laneRank(to) > 1) continue;
              options.push(to);
            }
            if (options.length) {
              const to = rng.pick(options);
              if (this.laneIsSafe(c, to, player)) {
                c.indicator = to > c.lane ? 1 : -1;
                c.signalTime = 0;
                this.events.push({ type: 'signal', car: c });
              }
            }
          }
        }
      }
    }
    this.bucketsValid = false;
  }
}
