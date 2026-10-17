import { VEHICLES, type VehicleKind } from '../../../src/data/vehicles';
import type { GameSession } from '../../../src/game/session';
import { laneCenter } from '../../../src/world/road';
import type { TrafficCar } from '../../../src/world/traffic';

/** Remove all traffic and stop new vehicles from spawning (scripted scenarios). */
export function clearRoad(sess: GameSession): void {
  for (const c of sess.traffic.cars) sess.traffic.events.push({ type: 'despawn', car: c });
  sess.traffic.cars = [];
  sess.traffic.opts.enabled = false;
}

let nextId = 9000;

export interface CarSpec {
  /** Metres ahead of (positive) or behind the rider along the road. */
  ahead: number;
  lane: number;
  kmh: number;
  kind?: VehicleKind;
  /** Lateral offset from the lane centre (m). */
  dOffset?: number;
}

/** Place a vehicle that keeps its lane and speed (no lane changes) so scripted passes are deterministic. */
export function addCar(sess: GameSession, spec: CarSpec): TrafficCar {
  const arch = VEHICLES[spec.kind ?? 'sedan'];
  const dir = sess.lanes.dirs[spec.lane];
  const v = spec.kmh / 3.6;
  const car: TrafficCar = {
    id: nextId++,
    kind: arch.kind,
    arch,
    color: '#c9ccd1',
    s: sess.bike.s + spec.ahead,
    d: laneCenter(sess.lanes, spec.lane) + (spec.dOffset ?? 0),
    lane: spec.lane,
    dir,
    v,
    v0: v,
    accel: 0,
    length: arch.length,
    width: arch.width,
    braking: 0,
    indicator: 0,
    signalTime: 0,
    laneChange: null,
    nextDecision: 1e9,
    hazard: false,
    yaw: dir === 1 ? 0 : Math.PI,
    passed: false,
    nearMiss: false,
    honkCooldown: 0,
    odometer: 0,
    seed: 1,
    flash: 0,
    beacon: false,
    drl: false,
    parked: false,
  };
  sess.traffic.cars.push(car);
  return car;
}
