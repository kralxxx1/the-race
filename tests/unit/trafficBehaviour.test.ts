import { describe, expect, it } from 'vitest';
import { VEHICLES } from '../../src/data/vehicles';
import { TrafficSystem, trafficContext, type PlayerProbe, type TrafficCar, type TrafficEvent, type TrafficOptions } from '../../src/world/traffic';
import { laneCenter, makeLaneConfig } from '../../src/world/road';

const BASE: TrafficOptions = { seed: 3, baseDensity: 26, densityGrowth: 4, maxDensity: 42, aggression: 0.7, enabled: true };

function overlap(a: TrafficCar, b: TrafficCar): boolean {
  return Math.abs(a.s - b.s) < (a.length + b.length) / 2 - 0.25 && Math.abs(a.d - b.d) < (a.width + b.width) / 2 - 0.15;
}

interface Run {
  sys: TrafficSystem;
  events: TrafficEvent[];
  overlaps: number;
  player: PlayerProbe;
}

/** Run a headless simulation with a rider driving along `lane` at `kmh`, collecting events and checking invariants. */
function run(layout: 'oneway' | 'twoway', seed: number, seconds: number, kmh: number, opts: Partial<TrafficOptions> = {}, lane?: number, onStep?: (r: Run, t: number) => void): Run {
  const cfg = makeLaneConfig(layout);
  const sys = new TrafficSystem(cfg, { ...BASE, seed, ...opts });
  sys.reset(0);
  const ln = lane ?? cfg.lanes - 1;
  const player: PlayerProbe = { s: 0, d: laneCenter(cfg, ln), v: kmh / 3.6 };
  const r: Run = { sys, events: [], overlaps: 0, player };
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    player.s += player.v * dt;
    sys.update(dt, player, player.s);
    for (const e of sys.events) r.events.push(e);
    sys.events.length = 0;
    if (i % 6 === 0) {
      for (let a = 0; a < sys.cars.length; a++) for (let b = a + 1; b < sys.cars.length; b++) if (overlap(sys.cars[a], sys.cars[b])) r.overlaps++;
      for (const c of sys.cars) if (!(Number.isFinite(c.s) && Number.isFinite(c.d) && Number.isFinite(c.v) && c.v >= 0)) throw new Error('bad car state');
    }
    onStep?.(r, i * dt);
  }
  return r;
}

describe('traffic behaviour', () => {
  it.each([
    ['oneway', 11, 30],
    ['oneway', 12, 130],
    ['twoway', 13, 38],
    ['twoway', 14, 80],
  ] as const)('%s seed %i, rider %i km/h: 6 minutes with no car-on-car overlaps and no car in the wrong lane', (layout, seed, kmh) => {
    const r = run(layout, seed, 360, kmh, {}, undefined, (run0) => {
      for (const c of run0.sys.cars) {
        if (c.lane >= 0 && run0.sys.cfg.dirs[c.lane] !== c.dir) throw new Error('car in a wrong-direction lane');
      }
    });
    expect(r.overlaps).toBe(0);
    expect(r.events.filter((e) => e.type === 'laneChange').length).toBeGreaterThan(5);
  }, 90000);

  it('cars signal for at least 1.6 s before moving over, and keep the blinker on during the move', () => {
    const signalAt = new Map<number, number>();
    const leads: number[] = [];
    let violations = 0;
    run('oneway', 21, 300, 100, {}, undefined, (r, t) => {
      for (const e of r.events) {
        if (e.type === 'signal') signalAt.set(e.car.id, t);
        if (e.type === 'laneChange') {
          const t0 = signalAt.get(e.car.id);
          if (t0 !== undefined) leads.push(t - t0);
          signalAt.delete(e.car.id);
        }
      }
      r.events.length = 0;
      for (const c of r.sys.cars) if (c.laneChange && c.indicator === 0) violations++;
    });
    expect(leads.length).toBeGreaterThan(8);
    expect(Math.min(...leads)).toBeGreaterThan(1.6);
    expect(Math.max(...leads)).toBeLessThan(12);
    expect(violations).toBe(0);
  }, 60000);

  it('never starts a lane change into the rider: no contact within the manoeuvre time', () => {
    let starts = 0;
    let unsafe = 0;
    for (const [layout, kmh] of [['oneway', 70], ['oneway', 140], ['twoway', 110]] as const) {
      const cfg = makeLaneConfig(layout);
      run(layout, 31 + kmh, 240, kmh, {}, cfg.lanes - 2, (r) => {
        const p = r.player;
        for (const e of r.events) {
          if (e.type !== 'laneChange') continue;
          starts++;
          const dc = laneCenter(cfg, e.to);
          if (Math.abs(p.d - dc) >= 3.0) continue;
          const c = e.car;
          const g = c.s - p.s;
          if (Math.abs(g) < c.length / 2 + 9.5) unsafe++;
          const u = c.dir * c.v - p.v;
          if (g * u < 0 && Math.abs(g) / Math.abs(u) < c.laneChange!.dur) unsafe++;
        }
        r.events.length = 0;
      });
    }
    expect(starts).toBeGreaterThan(15);
    expect(unsafe).toBe(0);
  }, 90000);

  it('heavy vehicles keep to the right-hand lanes and run slower than cars', () => {
    const cfg = makeLaneConfig('oneway');
    const sys = new TrafficSystem(cfg, { ...BASE, seed: 5, maxDensity: 60, baseDensity: 60 });
    sys.reset(0);
    let heavyRank0 = 0;
    let heavy = 0;
    let rank2 = 0;
    const player: PlayerProbe = { s: 0, d: 0, v: 27 };
    for (let i = 0; i < 60 * 240; i++) {
      player.s += player.v / 60;
      sys.update(1 / 60, player, player.s);
      sys.events.length = 0;
      if (i % 60 === 0) {
        for (const c of sys.cars) {
          if (!c.arch.heavy) continue;
          heavy++;
          if (sys.laneRank(c.lane) === 0) heavyRank0++;
          if (sys.laneRank(c.lane) > 1) rank2++;
        }
      }
    }
    expect(heavy).toBeGreaterThan(80);
    expect(heavyRank0 / heavy).toBeGreaterThan(0.6);
    expect(rank2).toBe(0);
    const truck = sys.cars.filter((c) => c.kind === 'semi' || c.kind === 'truck');
    for (const t of truck) expect(t.v0).toBeLessThan(26);
  }, 60000);

  it('brake lights come on whenever a car slows noticeably, and go off again', () => {
    let hardBrakeNoLight = 0;
    let hardBrakes = 0;
    let lightsOnWhileCruising = 0;
    run('oneway', 41, 240, 40, { baseDensity: 40, maxDensity: 60 }, undefined, (r) => {
      for (const c of r.sys.cars) {
        if (c.accel < -2.5) {
          hardBrakes++;
          if (c.braking < 0.2) hardBrakeNoLight++;
        }
        if (c.accel > -0.1 && c.v > 5 && c.braking > 0.5) lightsOnWhileCruising++;
      }
    });
    expect(hardBrakes).toBeGreaterThan(0);
    // A few frames of lag while the light fades in are fine.
    expect(hardBrakeNoLight / Math.max(1, hardBrakes)).toBeLessThan(0.2);
    expect(lightsOnWhileCruising).toBeLessThan(400);
  }, 60000);

  it('is deterministic per seed', () => {
    const snap = (seed: number) => {
      const r = run('twoway', seed, 90, 100);
      return JSON.stringify(r.sys.cars.map((c) => [c.id, c.kind, c.color, +c.s.toFixed(3), +c.d.toFixed(3), +c.v.toFixed(3), c.lane, c.indicator]));
    };
    expect(snap(7)).toBe(snap(7));
    expect(snap(7)).not.toBe(snap(8));
  });

  it('a close cut-in makes the driver brake hard, flash and honk', () => {
    const cfg = makeLaneConfig('oneway');
    const sys = new TrafficSystem(cfg, { ...BASE, baseDensity: 0, densityGrowth: 0, aggression: 0 });
    sys.reset(0);
    const lane = 2;
    const car = (sys as unknown as { trySpawn: (s: number, p: unknown, i: boolean, l: number) => TrafficCar | null }).trySpawn(100, { s: -1000, d: 0, v: 0 }, false, lane)!;
    car.v = 30;
    car.nextDecision = 1e9;
    // The rider pulls in 9 m ahead at 20 m/s.
    const player: PlayerProbe = { s: car.s + 9, d: car.d, v: 20 };
    sys.update(1 / 60, player, 0);
    expect(car.accel).toBeLessThan(-3);
    expect(car.flash).toBeGreaterThan(0);
    expect(sys.events.some((e) => e.type === 'honk' && e.car === car)).toBe(true);
    for (let i = 0; i < 60 * 3; i++) {
      sys.update(1 / 60, player, 0);
      player.s += player.v / 60;
    }
    expect(car.s).toBeLessThan(player.s - car.length / 2);
  });

  it('oncoming traffic flashes and honks at a rider in its lane on a two-way road', () => {
    const cfg = makeLaneConfig('twoway');
    const sys = new TrafficSystem(cfg, { ...BASE, baseDensity: 0, densityGrowth: 0, aggression: 0, night: true });
    sys.reset(0);
    const car = (sys as unknown as { trySpawn: (s: number, p: unknown, i: boolean, l: number) => TrafficCar | null }).trySpawn(150, { s: -1000, d: 0, v: 0 }, false, 1)!;
    car.nextDecision = 1e9;
    const player: PlayerProbe = { s: 40, d: laneCenter(cfg, 1), v: 40 };
    let honked = false;
    let flashed = false;
    for (let i = 0; i < 60 * 3; i++) {
      sys.update(1 / 60, player, 0);
      player.s += player.v / 60;
      if (sys.events.some((e) => e.type === 'honk')) honked = true;
      sys.events.length = 0;
      if (car.flash > 0) flashed = true;
    }
    expect(honked).toBe(true);
    expect(flashed).toBe(true);
  });

  it('after a crash the cars behind stop with hazard lights, the ones ahead drive on', () => {
    const cfg = makeLaneConfig('oneway');
    const sys = new TrafficSystem(cfg, { ...BASE, seed: 9, baseDensity: 50, maxDensity: 60, zones: false });
    sys.reset(0);
    const player: PlayerProbe = { s: 0, d: 0, v: 28 };
    for (let i = 0; i < 60 * 20; i++) {
      player.s += player.v / 60;
      sys.update(1 / 60, player, player.s);
    }
    const sIncident = player.s;
    const behind = sys.cars.filter((c) => c.s < sIncident && c.s > sIncident - 200).map((c) => c.id);
    const ahead = sys.cars.filter((c) => c.s > sIncident + 60 && c.s < sIncident + 400).map((c) => c.id);
    sys.triggerIncident(sIncident);
    player.v = 0;
    for (let i = 0; i < 60 * 25; i++) sys.update(1 / 60, player, player.s);
    for (const c of sys.cars) {
      if (behind.includes(c.id)) {
        expect(c.hazard).toBe(true);
        expect(c.v).toBeLessThan(0.5);
        expect(c.braking).toBeGreaterThan(0.3);
        expect(c.s).toBeLessThan(sIncident + 30);
      }
    }
    const moving = sys.cars.filter((c) => ahead.includes(c.id) && c.v > 5).length;
    expect(moving).toBeGreaterThan(0);
  });

  it('thins out at night and per map, and mixes vehicle kinds by map', () => {
    const day = trafficContext({ id: 'highway:day:clear', headlights: false });
    const night = trafficContext({ id: 'highway:night:clear', headlights: true });
    const city = trafficContext({ id: 'city:day:clear', headlights: false });
    const desert = trafficContext({ id: 'desert:day:clear', headlights: false });
    expect(night.densityScale!).toBeLessThan(day.densityScale! * 0.7);
    expect(desert.densityScale!).toBeLessThan(day.densityScale!);
    expect(city.densityScale!).toBeGreaterThan(day.densityScale!);
    expect(night.night).toBe(true);
    expect(day.night).toBe(false);
    const count = (ctx: Partial<TrafficOptions>) => {
      const sys = new TrafficSystem(makeLaneConfig('oneway'), { ...BASE, baseDensity: 60, maxDensity: 100, ...ctx });
      return sys.targetCount(0);
    };
    expect(count(night)).toBeLessThan(count(day));
    // City: taxis and buses show up far more often than on the motorway.
    const kinds = (ctx: Partial<TrafficOptions>) => {
      const sys = new TrafficSystem(makeLaneConfig('oneway'), { ...BASE, baseDensity: 90, maxDensity: 120, seed: 77, ...ctx });
      sys.reset(0);
      const n = { taxi: 0, semi: 0 };
      for (const c of sys.cars) if (c.kind === 'taxi' || c.kind === 'semi') n[c.kind]++;
      return n;
    };
    const cityKinds = kinds(city);
    const hwKinds = kinds(trafficContext({ id: 'highway:day:clear', headlights: false }));
    expect(cityKinds.taxi).toBeGreaterThan(hwKinds.taxi);
    expect(hwKinds.semi).toBeGreaterThan(cityKinds.semi);
  });

  it('police stops and roadworks appear, slow the traffic down and never overlap anyone', () => {
    const seen = new Set<string>();
    const dist = { police: 0, works: 0 };
    let maxApproach = 0;
    for (const seed of [2, 4, 6, 8]) {
      const cfg = makeLaneConfig('oneway');
      const sys = new TrafficSystem(cfg, { ...BASE, seed, baseDensity: 30 });
      sys.reset(0);
      const player: PlayerProbe = { s: 0, d: laneCenter(cfg, 0), v: 33 };
      let overlaps = 0;
      for (let i = 0; i < 60 * 480; i++) {
        player.s += player.v / 60;
        sys.update(1 / 60, player, player.s);
        sys.events.length = 0;
        for (const z of sys.zones) {
          seen.add(z.kind);
          expect(z.blocker.parked).toBe(true);
          // Cars about to reach the zone respect its limit envelope (allowing a little slack).
          for (const c of sys.cars) {
            if (c.parked || c.dir !== 1 || c.s > z.s1 || c.s < z.s0 - 150) continue;
            const ahead = Math.max(0, z.s0 - c.s);
            maxApproach = Math.max(maxApproach, c.v - Math.sqrt(z.limit * z.limit + 2 * 1.8 * ahead));
          }
          if (z.kind === 'works') expect(z.cones.length).toBeGreaterThan(10);
        }
        if (i % 12 === 0) for (let a = 0; a < sys.cars.length; a++) for (let b = a + 1; b < sys.cars.length; b++) if (overlap(sys.cars[a], sys.cars[b])) overlaps++;
      }
      expect(overlaps).toBe(0);
      dist.police += sys.zones.filter((z) => z.kind === 'police').length;
    }
    expect(seen.has('police')).toBe(true);
    expect(seen.has('works')).toBe(true);
    expect(maxApproach).toBeLessThan(6);
    void dist;
  }, 120000);

  it('emergency vehicles carry beacons and special flags; every kind has an archetype with real dimensions', () => {
    for (const k of Object.keys(VEHICLES) as (keyof typeof VEHICLES)[]) {
      const a = VEHICLES[k];
      expect(a.length).toBeGreaterThan(3.8);
      expect(a.wheelbase).toBeLessThan(a.length);
      expect(a.width).toBeGreaterThan(1.7);
      expect(a.colors.length).toBeGreaterThan(0);
    }
    expect(VEHICLES.police.special && VEHICLES.ambulance.special).toBe(true);
    const cfg = makeLaneConfig('oneway');
    const sys = new TrafficSystem(cfg, { ...BASE, baseDensity: 120, maxDensity: 150, seed: 99, kindMix: { police: 40, ambulance: 40 } });
    sys.reset(0);
    const emerg = sys.cars.filter((c) => c.kind === 'police' || c.kind === 'ambulance');
    expect(emerg.length).toBeGreaterThan(5);
    expect(emerg.some((c) => c.beacon)).toBe(true);
    for (const c of emerg) expect(c.v0).toBeGreaterThan(30);
  });
});
