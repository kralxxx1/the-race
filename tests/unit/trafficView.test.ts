import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VEHICLE_KINDS } from '../../src/data/vehicles';
import { resolveEnvironment } from '../../src/data/maps';
import { TrafficView } from '../../src/render/trafficView';
import type { GlowPoints } from '../../src/render/effects';
import type { Materials } from '../../src/render/materials';
import type { WorldView } from '../../src/render/worldView';
import { TrafficSystem, type TrafficCar } from '../../src/world/traffic';
import { laneCenter, makeLaneConfig } from '../../src/world/road';

/** The road / world mapping the view needs: a straight road along -z. */
function fakeWorld(): WorldView {
  return {
    road: { pitch: () => 0, yaw: () => 0 },
    worldPos: (s: number, d: number, _up: number, out: THREE.Vector3) => out.set(d, 0, -s),
  } as unknown as WorldView;
}

function fakeGlow() {
  const pts: number[][] = [];
  const g = { add: (...a: number[]) => void pts.push(a) } as unknown as GlowPoints;
  return { g, pts };
}

function makeView(map: 'highway' | 'city' = 'highway', time: 'day' | 'night' = 'day') {
  return new TrafficView({} as Materials, fakeWorld(), resolveEnvironment(map, time, 'clear'));
}

let nextCarId = 1000;
function carOf(kind: (typeof VEHICLE_KINDS)[number], s: number, lane = 2): TrafficCar {
  const cfg = makeLaneConfig('oneway');
  const sys = new TrafficSystem(cfg, { seed: 1, baseDensity: 0, densityGrowth: 0, maxDensity: 0, aggression: 0, enabled: true });
  const c = (sys as unknown as { makeCar: (k: string, l: number, s: number, d: number, dir: number, v: number) => TrafficCar }).makeCar(kind, lane, s, laneCenter(cfg, lane), 1, 25);
  c.id = nextCarId++;
  return c;
}

describe('TrafficView', () => {
  it('draws every vehicle kind through the instanced fleet', () => {
    const view = makeView();
    const cars = VEHICLE_KINDS.map((k, i) => carOf(k, 20 + i * 24, i % 4));
    cars.forEach((c) => view.spawn(c));
    const { g } = fakeGlow();
    view.update(1 / 60, g, new THREE.Vector3(0, 1.2, 0));
    expect(view.debug.cars).toBe(VEHICLE_KINDS.length);
    expect(view.debug.lod0).toBeGreaterThan(2);
    expect(view.debug.wheels).toBeGreaterThan(VEHICLE_KINDS.length * 4 - 1);
    expect(view.debug.tris).toBeGreaterThan(20000);
    view.despawn(cars[0]);
    view.update(1 / 60, g, new THREE.Vector3(0, 1.2, 0));
    expect(view.debug.cars).toBe(VEHICLE_KINDS.length - 1);
    view.dispose();
  });

  it('keeps a realistic traffic scene inside the triangle and draw-call budgets', () => {
    const view = makeView();
    const cfg = makeLaneConfig('oneway');
    const sys = new TrafficSystem(cfg, { seed: 5, baseDensity: 45, densityGrowth: 0, maxDensity: 60, aggression: 0.5, enabled: true });
    sys.reset(0);
    for (const c of sys.cars) view.spawn(c);
    const { g } = fakeGlow();
    const cam = new THREE.Vector3(0, 1.3, 0);
    for (let i = 0; i < 30; i++) view.update(1 / 60, g, cam);
    // Everything visible on a motorway: at most a few hundred thousand triangles, a few dozen instanced draws.
    expect(view.debug.tris).toBeLessThan(450000);
    let draws = 0;
    view.group.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh && o.visible && (o as THREE.InstancedMesh).count > 0) draws++;
    });
    expect(draws).toBeLessThan(90);
    view.dispose();
  });

  it('lights: brake lamps, blinkers, headlights at night and beacons reach the instance buffers and glows', () => {
    const view = makeView('highway', 'night');
    const c = carOf('police', 30, 2);
    c.braking = 1;
    c.indicator = 1;
    c.beacon = true;
    view.spawn(c);
    const { g, pts } = fakeGlow();
    // Step until the blinker is in its on phase.
    let sawInd = false;
    for (let i = 0; i < 90; i++) {
      pts.length = 0;
      view.update(1 / 60, g, new THREE.Vector3(0, 1.3, 0));
      if (pts.some((p) => p[3] > 1.4 && p[4] > 0.7 && p[5] < 0.1 && p[6] < 1)) sawInd = true;
    }
    expect(sawInd).toBe(true);
    // Head and tail glows exist at night; one of them is red (brake), one white-ish (head).
    expect(pts.some((p) => p[3] > 1.5 && p[4] < 0.2)).toBe(true);
    expect(pts.some((p) => p[3] > 1.4 && p[4] > 1.4)).toBe(true);
    // The projected headlight pool and brake-light wash are drawn.
    expect(view.debug.pools).toBeGreaterThanOrEqual(2);
    view.dispose();
  });

  it('daytime: no headlight glow, no pools', () => {
    const view = makeView('highway', 'day');
    const c = carOf('sedan', 30, 2);
    c.drl = false;
    view.spawn(c);
    const { g, pts } = fakeGlow();
    view.update(1 / 60, g, new THREE.Vector3(0, 1.3, 0));
    expect(pts.length).toBe(0);
    expect(view.debug.pools).toBe(0);
    c.braking = 1;
    pts.length = 0;
    view.update(1 / 60, g, new THREE.Vector3(0, 1.3, 0));
    expect(pts.some((p) => p[3] > 1)).toBe(true);
    view.dispose();
  });

  it('far cars fall back to the impostor LOD and distant ones are skipped', () => {
    const view = makeView();
    const near = carOf('sedan', 25);
    const far = carOf('hatch', 400);
    const gone = carOf('suv', 1600);
    [near, far, gone].forEach((c) => view.spawn(c));
    const { g } = fakeGlow();
    view.update(1 / 60, g, new THREE.Vector3(0, 1.3, 0));
    expect(view.debug.cars).toBe(2);
    expect(view.debug.lod0).toBe(1);
    expect(view.fleet.bucket('hatch', 1).count).toBe(1);
    expect(view.fleet.bucket('hatch', 0).count).toBe(0);
    view.dispose();
  });

  it('crash hand-over: the crash simulation positions the body and spins the wheels, then releases it', () => {
    const view = makeView();
    const c = carOf('suv', 30);
    view.spawn(c);
    const { g } = fakeGlow();
    const cam = new THREE.Vector3(0, 1.3, 0);
    view.update(1 / 60, g, cam);
    const cv = view.detachForCrash(c)!;
    expect(cv).not.toBeNull();
    expect(cv.wheels.length).toBe(4);
    expect(view.detachForCrash(c)).toBeNull();
    cv.obj.group.position.set(1, 0.4, -25);
    cv.obj.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4);
    cv.wheels.forEach((w) => (w.rotation.x = 1.2));
    view.crashVehicleLights(cv, true, true, g);
    view.update(1 / 60, g, cam);
    expect(view.debug.cars).toBe(0);
    const bucket = view.fleet.bucket('suv', 0);
    expect(bucket.count).toBe(1);
    expect(view.debug.wheels).toBe(4);
    view.releaseCrashVehicle(cv);
    view.update(1 / 60, g, cam);
    expect(bucket.count).toBe(0);
    view.dispose();
  });

  it('roadworks cones are drawn from the zones the simulation owns', () => {
    const view = makeView();
    const { g } = fakeGlow();
    const zone = { kind: 'works' as const, s0: 100, s1: 300, lane: 3, limit: 14, cones: [{ s: 60, d: 3 }, { s: 90, d: 3.4 }, { s: 5000, d: 3 }], blocker: carOf('van', 120, 3) };
    view.update(1 / 60, g, new THREE.Vector3(0, 1.3, 0), [zone]);
    const cones = view.group.getObjectByName('cones') as THREE.InstancedMesh;
    expect(cones.count).toBe(2);
    view.dispose();
  });

  it('dispose releases every child and is safe to call twice', () => {
    const view = makeView();
    view.dispose();
    expect(view.group.children.length).toBe(0);
    view.dispose();
  });
});
