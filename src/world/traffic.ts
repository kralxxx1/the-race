import { Rng, clamp, smoothstep } from '../core/math';
import {
  MAP_TRAFFIC_DENSITY,
  MAP_TRAFFIC_MIX,
  TIME_TRAFFIC_DENSITY,
  VEHICLES,
  VEHICLE_KINDS,
  WEATHER_TRAFFIC_DENSITY,
  type VehicleArchetype,
  type VehicleKind,
} from '../data/vehicles';
import { laneCenter, type LaneConfig } from './road';

export interface TrafficCar {
  id: number;
  kind: VehicleKind;
  arch: VehicleArchetype;
  color: string;
  /** Road-space centre position. */
  s: number;
  d: number;
  /** Lane index; -1 for a vehicle parked on the shoulder. */
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
  /** The rider already earned an overtake / near miss from this vehicle: passing it again pays nothing. */
  credited?: boolean;
  nearMiss: boolean;
  honkCooldown: number;
  /** Rolling distance used for wheel rotation in the renderer. */
  odometer: number;
  seed: number;
  /** Seconds of headlight flashing left (a driver warning the rider). */
  flash: number;
  /** Emergency beacons flashing. */
  beacon: boolean;
  /** Daytime running lights / dipped beam on in daylight. */
  drl: boolean;
  /** Stationary on the shoulder (police stop, breakdown): never leaves its place, ignores the rider. */
  parked: boolean;
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
  /** Multiplier on the target car count (map, time of day, weather). Default 1. */
  densityScale?: number;
  /** Per-kind spawn weight multipliers of the map (missing kind = 1). */
  kindMix?: Partial<Record<VehicleKind, number>>;
  /** Dusk / night / bad weather: headlights on, oncoming drivers flash. */
  night?: boolean;
  /** Police stops and roadworks now and then (default on). */
  zones?: boolean;
}

export type TrafficEvent =
  | { type: 'spawn'; car: TrafficCar }
  | { type: 'despawn'; car: TrafficCar }
  | { type: 'honk'; car: TrafficCar }
  | { type: 'signal'; car: TrafficCar }
  | { type: 'laneChange'; car: TrafficCar; to: number };

/** A slowdown ahead: a police stop on the shoulder or a closed lane with cones. */
export interface SlowZone {
  kind: 'police' | 'works';
  /** Road-space extent where traffic slows down. */
  s0: number;
  s1: number;
  /** Closed lane (works) or -1 (shoulder stop). */
  lane: number;
  /** Speed limit inside the zone (m/s). */
  limit: number;
  /** Traffic cones: road-space positions for the renderer. */
  cones: { s: number; d: number }[];
  /** The parked vehicle that marks the zone. */
  blocker: TrafficCar;
}

/** Traffic knobs derived from the resolved environment (`map:time:weather` id). */
export function trafficContext(env: { id: string; headlights: boolean; rain?: boolean }): Pick<TrafficOptions, 'densityScale' | 'kindMix' | 'night'> {
  const [map, time, weather] = env.id.split(':');
  const t = time ? (TIME_TRAFFIC_DENSITY[time] ?? 1) : env.headlights ? 0.6 : 1;
  const w = weather ? (WEATHER_TRAFFIC_DENSITY[weather] ?? 1) : env.rain ? 0.82 : 1;
  const m = MAP_TRAFFIC_DENSITY[map] ?? 1;
  return { densityScale: m * t * w, kindMix: MAP_TRAFFIC_MIX[map], night: env.headlights };
}

// Spawn beyond the fog line so vehicles never pop into view.
const SPAWN_MIN_AHEAD = 620;
const SPAWN_MAX_AHEAD = 860;
const DESPAWN_BEHIND = 160;
const DESPAWN_AHEAD = 1150;

// Intelligent Driver Model parameters (cars; heavy vehicles accelerate and brake gently)
const IDM_A = 1.6;
const IDM_A_HEAVY = 0.9;
const IDM_B = 2.6;
const IDM_T = 1.25;
const IDM_T_HEAVY = 1.7;
const IDM_S0 = 3.2;
const SHOULDER_STOP_D = 8.1;

/** Per-car behaviour state that does not need to be visible to the renderer. */
interface CarAi {
  /** Seconds the indicator blinks before the car starts moving over. */
  signalLead: number;
  /** Currently overtaking: wants to return to the slower lane once clear. */
  overtaking: boolean;
  /** Seconds until the driver reacts to the rider again (horn / flash). */
  react: number;
  /** Personal headway factor (0.85..1.2). */
  headway: number;
}

export class TrafficSystem {
  cars: TrafficCar[] = [];
  readonly zones: SlowZone[] = [];
  readonly events: TrafficEvent[] = [];
  private rng: Rng;
  private nextId = 1;
  private buckets: TrafficCar[][] = [];
  private bucketsValid = false;
  private laneSpeed: number[] = [];
  private ai = new Map<number, CarAi>();
  private zoneCooldown = 0;

  constructor(
    readonly cfg: LaneConfig,
    readonly opts: TrafficOptions,
  ) {
    this.rng = new Rng(opts.seed);
    this.computeLaneSpeeds();
    this.zoneCooldown = 25;
  }

  private computeLaneSpeeds(): void {
    const cfg = this.cfg;
    // Rank lanes within each direction group: rank 0 = that direction's slow (outer) lane.
    for (let i = 0; i < cfg.lanes; i++) {
      const rank = this.laneRank(i);
      const kmh = cfg.dirs[i] === 1 ? [78, 94, 108, 122][rank] ?? 100 : [84, 100, 112, 120][rank] ?? 100;
      this.laneSpeed[i] = kmh / 3.6;
    }
  }

  laneRank(lane: number): number {
    const cfg = this.cfg;
    const dir = cfg.dirs[lane];
    const group = [...Array(cfg.lanes).keys()].filter((j) => cfg.dirs[j] === dir);
    // For dir +1 the slow lane is the rightmost (largest d); for -1 it is the leftmost.
    const ordered = group.sort((a, b) => (dir === 1 ? b - a : a - b));
    return ordered.indexOf(lane);
  }

  /** Lane one rank faster (towards the centre line) than `lane`, or -1. */
  private fasterLane(lane: number): number {
    const to = lane + (this.cfg.dirs[lane] === 1 ? -1 : 1);
    return to >= 0 && to < this.cfg.lanes && this.cfg.dirs[to] === this.cfg.dirs[lane] ? to : -1;
  }

  private slowerLane(lane: number): number {
    const to = lane + (this.cfg.dirs[lane] === 1 ? 1 : -1);
    return to >= 0 && to < this.cfg.lanes && this.cfg.dirs[to] === this.cfg.dirs[lane] ? to : -1;
  }

  private aiOf(c: TrafficCar): CarAi {
    let a = this.ai.get(c.id);
    if (!a) {
      a = { signalLead: this.rng.range(1.7, 3.1), overtaking: false, react: 0, headway: this.rng.range(0.85, 1.2) };
      this.ai.set(c.id, a);
    }
    return a;
  }

  reset(playerS: number): void {
    for (const c of this.cars) this.events.push({ type: 'despawn', car: c });
    this.cars = [];
    this.zones.length = 0;
    this.ai.clear();
    this.zoneCooldown = 25;
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
    const scale = o.densityScale ?? 1;
    return Math.round(clamp((o.baseDensity + (distance / 1000) * o.densityGrowth) * scale, 0, o.maxDensity));
  }

  private pickKind(lane: number): VehicleKind {
    const rank = this.laneRank(lane);
    const mix = this.opts.kindMix;
    const kinds = VEHICLE_KINDS.filter((k) => !(VEHICLES[k].heavy && rank > 1));
    // Trucks and buses mostly keep to the right lane; the next lane sees only a few.
    const w = kinds.map((k) => VEHICLES[k].weight * (mix?.[k] ?? 1) * (VEHICLES[k].heavy ? (rank === 0 ? 1 : 0.1) : 1));
    return this.rng.weighted(kinds, w);
  }

  /** Lateral half-extent of a car's occupied corridor (accounts for lane changes). */
  private occupies(c: TrafficCar, lane: number): boolean {
    if (c.lane === lane) return true;
    return c.laneChange !== null && (c.laneChange.to === lane || c.laneChange.from === lane);
  }

  private makeCar(kind: VehicleKind, ln: number, s: number, d: number, dir: 1 | -1, v0: number): TrafficCar {
    const arch = VEHICLES[kind];
    const car: TrafficCar = {
      id: this.nextId++,
      kind,
      arch,
      color: this.rng.pick(arch.colors),
      s,
      d,
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
      nextDecision: this.rng.range(3, 12),
      hazard: false,
      yaw: dir === 1 ? 0 : Math.PI,
      passed: false,
      nearMiss: false,
      honkCooldown: 0,
      odometer: 0,
      seed: Math.floor(this.rng.range(0, 1e9)),
      flash: 0,
      beacon: false,
      drl: this.rng.chance(0.55),
      parked: false,
    };
    return car;
  }

  private trySpawn(s: number, player: PlayerProbe, initial: boolean, lane?: number, minSpeed = 0): TrafficCar | null {
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
    // A slowdown zone ahead keeps its closed lane empty: nothing spawns inside it.
    for (const z of this.zones) if (dir === 1 && s > z.s0 - 40 && s < z.s1 + 40 && (z.lane === ln || z.lane < 0)) return null;

    const base = this.laneSpeed[ln] * arch.speedFactor;
    let v0 = base * rng.range(0.9, 1.1);
    if (kind === 'police') v0 = Math.max(v0, (128 + rng.range(0, 20)) / 3.6);
    if (kind === 'ambulance') v0 = Math.max(v0, (118 + rng.range(0, 20)) / 3.6);
    const car = this.makeCar(kind, ln, s, dc, dir, v0);
    // Spawned inside a slowdown's approach: start at the speed the zone allows (it is beyond the fog anyway).
    car.v = Math.min(car.v, this.zoneCeiling(car));
    // A car coming up from behind a slow rider appears already at speed.
    if (minSpeed > 0) car.v = Math.max(car.v, minSpeed);
    // A fast spawn (police, ambulance) must be able to brake to the speed of whatever it appears behind, and a slow
    // one must not appear right in front of a fast car: the bare 28 m gap above ignores the closing speed.
    for (const o of this.cars) {
      if (!this.occupies(o, ln)) continue;
      const gap = Math.abs(o.s - s) - (o.length + car.length) / 2;
      const closing = (o.s - s) * dir > 0 ? car.v - o.v : o.v - car.v;
      if (closing > 0 && gap < (closing * closing) / (2 * 3.5) + 12) return null;
    }
    if (minSpeed > 0) {
      // ...and it must be able to stop for whatever is ahead of it, the rider included (a queue after a crash, a
      // roadworks jam), because it cannot start from a standstill.
      const lead = this.leaderOf(car, ln, player);
      if (lead) {
        const closing = Math.max(0, car.v - lead.v);
        if (lead.gap < (closing * closing) / (2 * 4) + 25) return null;
      }
    }
    // Emergency vehicles occasionally run with their beacons on.
    if (kind === 'ambulance') car.beacon = rng.chance(0.7);
    if (kind === 'police') car.beacon = rng.chance(0.3);
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
      if (c.lane < 0) continue; // a vehicle on the shoulder is nobody's leader
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
      if (o === c || o.lane < 0) continue;
      if (!this.bucketsValid && Math.abs(o.d - dc) > (o.width + c.width) / 2 + 0.3 && !this.occupies(o, lane)) continue;
      const ahead = (o.s - c.s) * c.dir;
      if (ahead <= 0) continue;
      const gap = ahead - (o.length + c.length) / 2;
      const ov = o.dir === c.dir ? o.v : -o.v;
      if (!best || gap < best.gap) best = { gap, v: ov };
    }
    if (player && c.dir === 1 && Math.abs(player.d - dc) < c.width / 2 + 0.6) {
      const ahead = player.s - c.s;
      if (ahead > 0) {
        const gap = ahead - (c.length / 2 + 1.1);
        if (!best || gap < best.gap) best = { gap, v: player.v };
      }
    }
    return best;
  }

  private idm(c: TrafficCar, v0: number, lead: { gap: number; v: number } | null, headway: number): number {
    const a0 = c.arch.heavy ? IDM_A_HEAVY : IDM_A;
    const T = (c.arch.heavy ? IDM_T_HEAVY : IDM_T) * headway;
    const v = c.v;
    const free = 1 - Math.pow(v / Math.max(v0, 0.1), 4);
    if (!lead) return a0 * free;
    const dv = v - lead.v;
    const sStar = IDM_S0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(a0 * IDM_B)));
    const gap = Math.max(lead.gap, 0.1);
    return a0 * (free - (sStar / gap) ** 2);
  }

  /**
   * Is it safe for `c` to start moving into lane `to`? Checks the neighbours (gap and closing speed)
   * and — the part that matters for fairness — the rider: never merge into the rider's path unless the
   * rider could neither reach the car nor be reached by it before the move is finished.
   */
  private laneIsSafe(c: TrafficCar, to: number, player: PlayerProbe, dur = 3.4): boolean {
    const cfg = this.cfg;
    if (to < 0 || to >= cfg.lanes || cfg.dirs[to] !== c.dir) return false;
    for (const o of this.cars) {
      if (o === c || o.lane < 0 || !this.occupies(o, to)) continue;
      const rel = (o.s - c.s) * c.dir;
      const gap = Math.abs(o.s - c.s) - (o.length + c.length) / 2;
      if (rel >= 0 && gap < Math.max(14, c.v * 0.9 + (c.v - o.v) * 2.5)) return false;
      if (rel < 0 && gap < Math.max(12, o.v * 0.8 + (o.v - c.v) * 3)) return false;
    }
    // Drivers check their mirrors for the motorcycle: refuse if it is alongside or
    // would arrive (time-to-contact) before the manoeuvre completes.
    const dc = laneCenter(cfg, to);
    if (Math.abs(player.d - dc) < 3.0) {
      const g = c.s - player.s; // signed gap along s
      if (Math.abs(g) < c.length / 2 + 10) return false;
      const u = c.dir * c.v - player.v; // car velocity relative to the rider
      if (g * u < 0) {
        const ttc = Math.abs(g) / Math.abs(u);
        if (ttc < Math.max(3.2, dur + 0.8)) return false;
      }
    }
    return true;
  }

  /** Is the stretch of road `lane` (or the shoulder) between s0 and s1 free of own-direction vehicles? */
  private stretchFree(s0: number, s1: number, lane: number): boolean {
    for (const c of this.cars) {
      if (c.dir !== 1 || c.s < s0 - 30 || c.s > s1 + 30) continue;
      if (c.lane < 0 || this.occupies(c, lane)) return false;
    }
    return true;
  }

  /**
   * An accident happened at `s`: traffic coming up behind it stops with hazard lights, drivers further
   * back slow down, and oncoming traffic eases off to look. Cars already past the scene drive on.
   */
  triggerIncident(s: number, radius = 220): void {
    for (const c of this.cars) {
      if (c.parked) continue;
      const rel = c.s - s;
      if (c.dir === 1) {
        if (rel < 30 && rel > -radius) {
          c.hazard = true;
          c.v0 = 0;
        } else if (rel <= -radius && rel > -radius * 2.2) {
          // Brake lights ahead: slow right down well before the queue.
          c.v0 = Math.min(c.v0, 11);
        }
      } else if (Math.abs(rel) < radius * 0.7) {
        c.v0 = Math.min(c.v0, 12);
      }
    }
  }

  // ───────────────────────────── slowdown zones ─────────────────────────────

  /** Try a few spots far ahead of the rider; true when a zone was set up. */
  private trySpawnZone(player: PlayerProbe): boolean {
    const rng = this.rng;
    const cfg = this.cfg;
    const own = [...Array(cfg.lanes).keys()].filter((l) => cfg.dirs[l] === 1);
    if (!own.length) return false;
    const outer = Math.max(...own);
    const works = own.length >= 3 && rng.chance(0.45);
    for (let attempt = 0; attempt < 8; attempt++) {
      const s = player.s + rng.range(SPAWN_MIN_AHEAD + 40, SPAWN_MAX_AHEAD);
      if (works) {
        const s0 = s;
        const s1 = s + rng.range(140, 260);
        if (!this.stretchFree(s0 - 40, s1, outer)) continue;
        const van = this.makeCar('van', outer, s0 + 6, laneCenter(cfg, outer), 1, 0);
        van.v = 0;
        van.parked = true;
        van.hazard = true;
        van.nextDecision = 1e9;
        van.drl = true;
        this.cars.push(van);
        this.events.push({ type: 'spawn', car: van });
        // Cone line along the boundary between the closed lane and the open one, with a taper before it.
        const edge = laneCenter(cfg, outer) - cfg.laneWidth / 2;
        const cones: { s: number; d: number }[] = [];
        for (let cs = s0 - 90; cs < s1; cs += 6) {
          const t = clamp((cs - (s0 - 90)) / 90, 0, 1);
          cones.push({ s: cs, d: edge + cfg.laneWidth * (1 - t) * 0.55 });
        }
        this.zones.push({ kind: 'works', s0: s0 - 40, s1, lane: outer, limit: 50 / 3.6, cones, blocker: van });
        this.settleApproach(this.zones[this.zones.length - 1]);
        return true;
      }
      if (!this.stretchFree(s - 40, s + 30, outer)) continue;
      const car = this.makeCar('police', -1, s, SHOULDER_STOP_D, 1, 0);
      car.v = 0;
      car.parked = true;
      car.beacon = true;
      car.nextDecision = 1e9;
      this.cars.push(car);
      this.events.push({ type: 'spawn', car });
      this.zones.push({ kind: 'police', s0: s - 110, s1: s + 50, lane: -1, limit: 70 / 3.6, cones: [], blocker: car });
      this.settleApproach(this.zones[this.zones.length - 1]);
      return true;
    }
    return false;
  }

  /** A zone has just been set up far ahead: cars already inside its approach start at the safe speed (out of sight). */
  private settleApproach(z: SlowZone): void {
    for (const c of this.cars) {
      if (c.parked || c.dir !== 1 || c.s > z.s1 || c.s < z.s0 - 220) continue;
      c.v = Math.min(c.v, this.zoneCeiling(c));
    }
  }

  /** Speed ceiling a car must respect because of a zone ahead (comfortable-braking envelope), or Infinity. */
  private zoneCeiling(c: TrafficCar): number {
    let best = Infinity;
    if (c.dir !== 1) return best;
    for (const z of this.zones) {
      if (c.s > z.s1) continue;
      const ahead = Math.max(0, z.s0 - c.s);
      const allowed = Math.sqrt(z.limit * z.limit + 2 * 1.8 * ahead);
      if (allowed < best) best = allowed;
    }
    return best;
  }

  /** Lane a car must move to because a roadworks lane closure is ahead of it, or -1. */
  private forcedMove(c: TrafficCar): number {
    if (c.dir !== 1 || c.lane < 0) return -1;
    for (const z of this.zones) {
      if (z.kind !== 'works' || c.s > z.s1 || z.s0 - c.s > 260) continue;
      if (c.lane === z.lane) return this.fasterLane(c.lane);
    }
    return -1;
  }

  /** Is a police stop close ahead of this car on its side of the road (drivers "move over")? */
  private policeStopAhead(c: TrafficCar): boolean {
    if (c.dir !== 1) return false;
    for (const z of this.zones) if (z.kind === 'police' && c.s < z.s1 && z.s0 - c.s < 200) return true;
    return false;
  }

  // ───────────────────────────────── update ─────────────────────────────────

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
          this.trySpawn(player.s - 150, player, false, rng.pick(fast), player.v + 8);
        }
      }
      // Now and then a police stop or roadworks appears far ahead.
      this.zoneCooldown -= dt;
      if (this.opts.zones !== false && this.zoneCooldown <= 0 && this.zones.length === 0) {
        // A stop or roadworks every couple of minutes; try again soon when the road ahead is too busy.
        this.zoneCooldown = rng.chance(0.55) && this.trySpawnZone(player) ? rng.range(60, 140) : rng.range(6, 20);
      }
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const rel = c.s - player.s;
      if (rel < -DESPAWN_BEHIND || rel > DESPAWN_AHEAD) {
        this.cars.splice(i, 1);
        this.ai.delete(c.id);
        this.events.push({ type: 'despawn', car: c });
      }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) if (this.zones[i].s1 < player.s - DESPAWN_BEHIND) this.zones.splice(i, 1);

    // ── behaviour ──
    this.rebuildBuckets();
    this.bucketsValid = true;
    for (const c of this.cars) {
      c.honkCooldown = Math.max(0, c.honkCooldown - dt);
      c.flash = Math.max(0, c.flash - dt);
      if (c.parked) {
        c.v = 0;
        c.accel = 0;
        c.braking = 0.0;
        continue;
      }
      const ai = this.aiOf(c);
      ai.react = Math.max(0, ai.react - dt);

      // Longitudinal: IDM against the leader in the current (and target) lane.
      let lead = this.leaderOf(c, c.lane, player);
      if (c.laneChange) {
        const l2 = this.leaderOf(c, c.laneChange.to, player);
        if (l2 && (!lead || l2.gap < lead.gap)) lead = l2;
      }
      const v0 = Math.min(c.v0, this.zoneCeiling(c));
      let a = this.idm(c, v0, lead, ai.headway);
      if (c.hazard && c.v0 === 0) a = Math.min(a, -4.5);
      // The rider cuts in just ahead and closing: brake hard and say so.
      if (c.dir === 1) a = this.reactToRider(c, a, player, ai);
      a = clamp(a, -8.5, c.arch.heavy ? IDM_A_HEAVY : IDM_A);
      c.accel = a;
      c.v = Math.max(0, c.v + a * dt);
      c.s += c.dir * c.v * dt;
      c.odometer += c.v * dt;
      const brakeTarget = a < -0.55 || (c.v < 0.5 && c.hazard) ? clamp(-a / 4, 0.4, 1) : 0;
      c.braking += (brakeTarget - c.braking) * Math.min(1, dt * 10);

      if (c.dir === -1) this.oncomingWarnings(c, player, ai);

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
          c.nextDecision = rng.range(5, 14) * (1.2 - this.opts.aggression * 0.6);
        }
      } else if (c.indicator !== 0) {
        c.signalTime += dt;
        if (c.signalTime > ai.signalLead) {
          // Indicator dir is in road space (+1 = towards larger d / lane index).
          const to = c.lane + c.indicator;
          const dur = rng.range(2.4, 3.6) * (1.1 - this.opts.aggression * 0.3);
          if (this.laneIsSafe(c, to, player, dur)) {
            c.laneChange = { from: c.lane, to, t: 0, dur };
            this.buckets[to].push(c);
            this.events.push({ type: 'laneChange', car: c, to });
          } else if (c.signalTime > ai.signalLead + 3) {
            c.indicator = 0;
            c.nextDecision = rng.range(2, 6);
          }
        }
      } else if (!c.hazard) {
        c.nextDecision -= dt;
        const forced = this.forcedMove(c);
        if (forced >= 0 && c.nextDecision > 0.5) c.nextDecision = 0.5;
        if (c.nextDecision <= 0) this.decideLaneChange(c, lead, player, ai, forced);
      }
    }
    this.bucketsValid = false;
  }

  /** Cut-in and close-pass reactions: a hard brake, a horn and a flash, rate-limited per driver. */
  private reactToRider(c: TrafficCar, a: number, player: PlayerProbe, ai: CarAi): number {
    const ahead = player.s - c.s;
    const lat = Math.abs(player.d - c.d);
    // Rider just ahead in (or entering) the car's path, and the car is closing on it.
    if (ahead > 0 && ahead < 16 && lat < c.width / 2 + 0.9 && c.v - player.v > 1.5) {
      a = Math.min(a, -3.2);
      if (ai.react <= 0 && ahead < 12) {
        ai.react = 6;
        c.flash = 0.7;
        c.honkCooldown = 5;
        this.events.push({ type: 'honk', car: c });
      }
    } else if (ai.react <= 0 && c.honkCooldown <= 0 && Math.abs(ahead) < 4 && lat < c.width / 2 + 0.75 && player.v - c.v > 6) {
      // A close overtake alongside: some drivers lean on the horn.
      ai.react = 8;
      if (this.rng.chance(0.3)) {
        c.honkCooldown = 6;
        this.events.push({ type: 'honk', car: c });
      }
    }
    return a;
  }

  /** Oncoming drivers flash and honk at a rider in their lane; at night some dip their lights for courtesy. */
  private oncomingWarnings(c: TrafficCar, player: PlayerProbe, ai: CarAi): void {
    const rel = c.s - player.s;
    if (rel < 20 || rel > 170 || player.v <= 8) return;
    const lat = Math.abs(player.d - c.d);
    if (lat < 1.8 && c.honkCooldown <= 0) {
      c.honkCooldown = 6;
      c.flash = 1.4;
      this.events.push({ type: 'honk', car: c });
    } else if (this.opts.night && ai.react <= 0 && lat < 5.5 && rel < 110 && this.rng.chance(0.0015)) {
      ai.react = 10;
      c.flash = 0.8;
    }
  }

  /**
   * Pick whether (and where) a car wants to move: out of a closed lane or a police stop, past a slower
   * leader, back to the slower lane once the overtake is done, or occasionally just because. Only signals
   * (the move itself starts after the blinker lead time, if it is still safe).
   */
  private decideLaneChange(c: TrafficCar, lead: { gap: number; v: number } | null, player: PlayerProbe, ai: CarAi, forced: number): void {
    const rng = this.rng;
    const aggr = this.opts.aggression;
    c.nextDecision = rng.range(3, 9) * (1.25 - aggr * 0.6);
    let to = -1;
    const faster = this.fasterLane(c.lane);
    const slower = this.slowerLane(c.lane);
    const rank = this.laneRank(c.lane);
    const blocked = lead !== null && lead.gap < 55 && lead.v < c.v0 * 0.9;
    if (forced >= 0) {
      to = forced;
    } else if (rank === 0 && faster >= 0 && this.policeStopAhead(c) && rng.chance(0.55)) {
      to = faster;
    } else if (blocked && faster >= 0 && (!c.arch.heavy || (rank === 0 && rng.chance(0.1)))) {
      // Overtake: the heavy ones only when the vehicle in front is much slower.
      to = faster;
      ai.overtaking = true;
    } else if (slower >= 0 && rank > 0 && !blocked) {
      // Keep right: return once the lane to the right has room (always after an overtake, usually otherwise).
      const free = this.leaderOf(c, slower, null);
      const room = !free || free.gap > (c.arch.heavy ? 28 : 45) + Math.max(0, c.v - free.v) * 3;
      if (room && (ai.overtaking || rng.chance(0.2 + 0.25 * (1 - aggr) + (c.arch.heavy ? 0.4 : 0)))) {
        to = slower;
        ai.overtaking = false;
      }
    } else if (!c.arch.heavy && rng.chance(0.05 + aggr * 0.12)) {
      const options = [faster, slower].filter((l) => l >= 0 && !(c.arch.heavy && this.laneRank(l) > 1));
      if (options.length) to = rng.pick(options);
    }
    if (to < 0) return;
    if (c.arch.heavy && this.laneRank(to) > 1) return;
    if (!this.laneIsSafe(c, to, player)) {
      // Not now: try again soon (a blocked overtaker keeps waiting for a gap).
      c.nextDecision = rng.range(1, 3);
      return;
    }
    c.indicator = to > c.lane ? 1 : -1;
    c.signalTime = 0;
    ai.signalLead = rng.range(1.7, 3.1);
    this.events.push({ type: 'signal', car: c });
  }
}
