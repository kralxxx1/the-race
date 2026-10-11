import { describe, expect, it } from 'vitest';
import { SEGMENT_IDS } from '../../src/physics/crash/scenario';
import { q4, v3, vlen } from '../../src/physics/crash/math';
import { Body, CrashWorld, FIXED_STEP } from '../../src/physics/crash/world';
import { rig } from './helpers/crashRig';

function run(scene: ReturnType<typeof rig>, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) scene.update(dt);
}

function hash(scene: ReturnType<typeof rig>): string {
  const parts: number[] = [];
  for (const b of scene.world.bodies) parts.push(b.x.x, b.x.y, b.x.z, b.q.x, b.q.y, b.q.z, b.q.w, b.v.x, b.v.y, b.v.z);
  return parts.map((v) => v.toFixed(9)).join(',');
}

describe('crash solver', () => {
  it('a free sphere keeps energy and bounces lower each time', () => {
    const w = new CrashWorld(() => 0);
    const b = new Body('ball', 'bike');
    b.massSphere(5, 0.2);
    b.spheres = [{ c: v3(), r: 0.2 }];
    b.restitution = 0.6;
    b.mu = 0.5;
    b.linDamp = 0;
    b.angDamp = 0;
    b.place(v3(0, 3, 0), q4(), v3(), v3());
    w.add(b);
    const e0 = w.energy();
    let maxY = 0;
    let bounced = 0;
    let prevVy = 0;
    for (let i = 0; i < 600; i++) {
      w.step(FIXED_STEP);
      if (prevVy < 0 && b.v.y > 0) bounced++;
      prevVy = b.v.y;
      if (i > 120) maxY = Math.max(maxY, b.x.y);
    }
    expect(w.energy()).toBeLessThanOrEqual(e0 * 1.001);
    expect(bounced).toBeGreaterThan(0);
    expect(maxY).toBeLessThan(3);
    expect(w.sane()).toBe(true);
  });

  it('conserves momentum in a free two-body impact (no gravity, no ground)', () => {
    const w = new CrashWorld(() => -1e6);
    w.gravity = 0;
    const mk = (name: string, kind: 'bike' | 'rider', m: number, x: number, vx: number) => {
      const b = new Body(name, kind);
      b.massSphere(m, 0.3);
      b.spheres = [{ c: v3(), r: 0.3 }];
      b.restitution = 0.2;
      b.linDamp = 0;
      b.angDamp = 0;
      b.place(v3(x, 0, 0), q4(), v3(vx, 0, 0), v3());
      return w.add(b);
    };
    mk('a', 'bike', 200, 0, 10);
    mk('b', 'rider', 80, 1.2, 0);
    const p0 = w.momentum(v3());
    for (let i = 0; i < 240; i++) w.step(FIXED_STEP);
    const p1 = w.momentum(v3());
    expect(p1.x).toBeCloseTo(p0.x, 0);
    expect(Math.abs(p1.y)).toBeLessThan(5);
    // Heavier body keeps going, lighter one is pushed ahead of it.
    const [a, b] = w.bodies;
    expect(b.v.x).toBeGreaterThan(a.v.x - 1e-6);
  });

  it('a rear-end crash transfers momentum by mass and stays finite', () => {
    const s = rig({ car: true, bikeSpeed: 30, carSpeed: 16 });
    const carV0 = s.car!.v.z;
    run(s, 6);
    const car = s.car!;
    // The car is pushed forward (more negative z velocity) before its brakes bite; just check it moved sanely.
    expect(Number.isFinite(car.x.z)).toBe(true);
    expect(s.world.sane()).toBe(true);
    // Bike lost most of its speed.
    expect(vlen(s.bike.v)).toBeLessThan(30);
    expect(car.v.z).toBeLessThanOrEqual(0.5);
    expect(carV0).toBeLessThan(0);
    expect(s.kind).toBe('rearEnd');
  });

  it('is deterministic: identical inputs give bit-identical states', () => {
    const a = rig({ car: true, bikeSpeed: 28, carSpeed: 14, offset: 0.4 });
    const b = rig({ car: true, bikeSpeed: 28, carSpeed: 14, offset: 0.4 });
    run(a, 3);
    run(b, 3);
    expect(hash(a)).toBe(hash(b));
    const c = rig({ car: true, bikeSpeed: 28, carSpeed: 14, offset: 0.45 });
    run(c, 3);
    expect(hash(c)).not.toBe(hash(a));
  });

  it('never explodes across a sweep of impacts', () => {
    for (const o of [
      { car: true, bikeSpeed: 8, carSpeed: 0 },
      { car: true, bikeSpeed: 45, carSpeed: 20, offset: 0.7 },
      { car: true, bikeSpeed: 60, carSpeed: -25, carHeavy: true },
      { car: true, bikeSpeed: 35, carSpeed: 10, yaw: 0.5, offset: 0.9 },
      { bikeSpeed: 30 },
    ]) {
      const s = rig(o);
      for (let t = 0; t < 8; t += 1 / 60) {
        s.update(1 / 60);
        expect(s.world.sane(100)).toBe(true);
      }
      for (const b of s.world.bodies) expect(b.x.y).toBeGreaterThan(-0.5);
    }
  });

  it('the rider comes to rest after sliding down the road', () => {
    const s = rig({ bikeSpeed: 25 });
    run(s, 14);
    expect(s.world.settled).toBe(true);
    for (const id of SEGMENT_IDS) expect(vlen(s.riders[id].v)).toBeLessThan(0.5);
    // Sliding at ~0.5–0.8 g stops a 25 m/s rider within ~60 m.
    expect(Math.abs(s.riders.torso.x.z)).toBeLessThan(90);
    expect(Math.abs(s.riders.torso.x.z)).toBeGreaterThan(8);
  });

  it('ragdoll joints hold: limb ends stay attached to their parents', () => {
    const s = rig({ car: true, bikeSpeed: 35, carSpeed: 10 });
    run(s, 4);
    for (const j of s.world.joints) {
      // The two anchor points of every joint coincide within a few cm.
      const pa = v3();
      const pb = v3();
      const rot = (b: Body, l: typeof pa, o: typeof pa) => {
        const q = b.q;
        const tx = 2 * (q.y * l.z - q.z * l.y), ty = 2 * (q.z * l.x - q.x * l.z), tz = 2 * (q.x * l.y - q.y * l.x);
        o.x = b.x.x + l.x + q.w * tx + (q.y * tz - q.z * ty);
        o.y = b.x.y + l.y + q.w * ty + (q.z * tx - q.x * tz);
        o.z = b.x.z + l.z + q.w * tz + (q.x * ty - q.y * tx);
      };
      rot(j.a, j.la, pa);
      rot(j.b, j.lb, pb);
      expect(Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z)).toBeLessThan(0.08);
    }
  });

  it('momentum transfer follows mass: a truck barely moves, a sedan is shoved', () => {
    const sedan = rig({ car: true, bikeSpeed: 32, carSpeed: 14 });
    const truck = rig({ car: true, carHeavy: true, bikeSpeed: 32, carSpeed: 14 });
    // Measure before the driver's brakes engage (0.45 s) so only the impact acts on the car.
    run(sedan, 0.4);
    run(truck, 0.4);
    const dvSedan = Math.abs(sedan.car!.v.z) - 14;
    const dvTruck = Math.abs(truck.car!.v.z) - 14;
    expect(dvSedan).toBeGreaterThan(0.8);
    expect(dvTruck).toBeLessThan(dvSedan * 0.4);
    // The bike is the one that stops: it loses most of its speed against either vehicle.
    expect(Math.abs(truck.bike.v.z)).toBeLessThan(25);
    expect(Math.abs(sedan.bike.v.z)).toBeLessThan(25);
  });

  it('classifies the hit by where the bike meets the vehicle', () => {
    expect(rig({ car: true, offset: 0 }).kind).toBe('rearEnd');
    expect(rig({ car: true, offset: 1.1 }).kind).toBe('glancing');
    expect(rig({}).kind).toBe('fall');
  });

  it('an off-centre hit spins the car and throws the bike sideways', () => {
    const centred = rig({ car: true, bikeSpeed: 30, carSpeed: 12, offset: 0 });
    const glance = rig({ car: true, bikeSpeed: 30, carSpeed: 12, offset: 0.85 });
    let wc = 0;
    let wg = 0;
    for (let t = 0; t < 0.6; t += 1 / 60) {
      centred.update(1 / 60);
      glance.update(1 / 60);
      wc = Math.max(wc, Math.abs(centred.car!.w.y));
      wg = Math.max(wg, Math.abs(glance.car!.w.y));
    }
    expect(wg).toBeGreaterThan(wc + 0.1);
  });

  it('a barrier stops sideways motion, scrapes and reports sliding contacts', () => {
    const s = rig({ bikeSpeed: 30, yaw: -0.35 });
    s.world.barrier = { p: v3(2.5, 0, 0), n: v3(-1, 0, 0), height: 0.85, mu: 0.5 };
    // The wall is to the +x side of the start: the bike (heading −z, yawed) drifts into it.
    let slid = 0;
    let hits = 0;
    for (let t = 0; t < 4; t += 1 / 60) {
      s.update(1 / 60);
      slid += s.world.slideCount;
      for (let i = 0; i < s.world.eventCount; i++) if (s.world.events[i].kind === 1) hits++;
    }
    for (const b of s.world.bodies) expect(b.x.x).toBeLessThan(2.5 + 1.2);
    expect(slid).toBeGreaterThan(5);
    expect(hits).toBeGreaterThan(0);
    expect(s.world.sane()).toBe(true);
  });

  it('a dropped ragdoll never gains energy', () => {
    const s = rig({ bikeSpeed: 0 });
    for (const b of s.world.bodies) b.x.y += 2;
    for (const b of s.world.bodies) b.px.y = b.x.y;
    const e0 = s.world.energy();
    let last = e0;
    for (let t = 0; t < 5; t += 1 / 60) {
      s.update(1 / 60);
      last = s.world.energy();
      // Gravity, inelastic contacts and friction only ever take energy out.
      expect(last).toBeLessThanOrEqual(e0 * 1.01 + 30);
    }
    expect(last).toBeLessThan(e0 * 0.7);
  });
});
