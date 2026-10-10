import { describe, expect, it } from 'vitest';
import { BIKES, BIKE_BY_ID, STARTER_BIKE_ID } from '../../src/data/bikes';
import {
  AVG_SHARE,
  CAREER_MIN_TOP_SPEED,
  KEEP_SHARE,
  LOWER_IS_BETTER,
  MISSIONS,
  MISSION_BY_ID,
  OBJECTIVE_TYPES,
  TOP_SHARE,
  TRAFFIC_LEVELS,
  checkpointRequiredAvgKmh,
  missionMode,
  missionsForMap,
  nextMissionId,
  requiredAvgKmh,
  requiredTopSpeed,
  scorePerMetre,
  scoreRequiredAvgKmh,
} from '../../src/data/career';
import { MAPS } from '../../src/data/maps';
import { BIKE_UNLOCK_LEVEL, CAREER_BIKE_REWARDS } from '../../src/data/progression';
import { levelForXp } from '../../src/game/progression';
import { STARTING_CASH } from '../../src/storage/save';

describe('career data', () => {
  it('has 80 missions: 10 on each of the 8 maps, in map order', () => {
    expect(MISSIONS).toHaveLength(80);
    expect(MAPS).toHaveLength(8);
    MAPS.forEach((m, mi) => {
      const list = missionsForMap(m.id);
      expect(list, m.id).toHaveLength(10);
      list.forEach((d, i) => {
        expect(d.number).toBe(mi * 10 + i + 1);
        expect(d.index).toBe(i + 1);
        expect(d.id).toBe(`${m.id}-${String(i + 1).padStart(2, '0')}`);
      });
    });
    MISSIONS.forEach((d, i) => expect(d.number).toBe(i + 1));
    expect(new Set(MISSIONS.map((d) => d.id)).size).toBe(80);
    expect(new Set(MISSIONS.map((d) => d.title)).size).toBe(80);
  });

  it('every mission has Turkish copy, valid environment and mode', () => {
    for (const d of MISSIONS) {
      expect(d.title.length, d.id).toBeGreaterThan(3);
      expect(d.briefing.length, d.id).toBeGreaterThan(20);
      expect(d.hint.length, d.id).toBeGreaterThan(10);
      const map = MAPS.find((m) => m.id === d.map)!;
      expect(map.times, d.id).toContain(d.time);
      expect(map.weathers, d.id).toContain(d.weather);
      const mode = missionMode(d);
      expect(mode.id).toBe('career');
      expect(mode.respawn).toBe(false);
      expect(mode.timer).toBeNull();
      expect(mode.layout).toBe(d.layout);
      expect(mode.traffic.baseDensity).toBe(TRAFFIC_LEVELS[d.traffic.level].baseDensity);
      expect(d.traffic.aggression).toBeGreaterThan(0);
      expect(d.traffic.aggression).toBeLessThanOrEqual(1);
    }
  });

  it('uses all 11 objective types and mixes in night, rain, fog, snow and two-way roads', () => {
    const types = new Set(MISSIONS.map((d) => d.objective.type));
    for (const t of OBJECTIVE_TYPES) expect(types.has(t), t).toBe(true);
    expect(OBJECTIVE_TYPES).toHaveLength(11);
    for (const w of ['rain', 'fog', 'snow', 'cloudy', 'clear'] as const) expect(MISSIONS.some((d) => d.weather === w), w).toBe(true);
    for (const t of ['dawn', 'day', 'sunset', 'night'] as const) expect(MISSIONS.some((d) => d.time === t), t).toBe(true);
    expect(MISSIONS.filter((d) => d.layout === 'twoway').length).toBeGreaterThanOrEqual(10);
    // No objective type dominates a single map: each map offers variety.
    for (const m of MAPS) expect(new Set(missionsForMap(m.id).map((d) => d.objective.type)).size, m.id).toBeGreaterThanOrEqual(7);
  });

  it('opposite-lane objectives are only offered on two-way roads', () => {
    for (const d of MISSIONS) {
      if (d.objective.type === 'oppositeLane') expect(d.layout, d.id).toBe('twoway');
      if (d.secondary?.kind === 'oppositeLane') expect(d.layout, d.id).toBe('twoway');
    }
  });

  it('objective parameters are positive and well formed', () => {
    for (const d of MISSIONS) {
      const o = d.objective;
      switch (o.type) {
        case 'distance':
        case 'oppositeLane':
          expect(o.meters, d.id).toBeGreaterThan(0);
          break;
        case 'checkpoints':
          expect(o.count, d.id).toBeGreaterThanOrEqual(2);
          expect(o.spacing, d.id).toBeGreaterThan(300);
          expect(o.startTime, d.id).toBeGreaterThan(20);
          expect(o.bonusTime, d.id).toBeGreaterThan(10);
          break;
        case 'overtakes':
        case 'nearMisses':
          expect(o.count, d.id).toBeGreaterThanOrEqual(3);
          break;
        case 'keepSpeed':
          expect(o.kmh, d.id).toBeGreaterThanOrEqual(80);
          expect(o.meters, d.id).toBeGreaterThanOrEqual(1000);
          expect(o.startWindow, d.id).toBeGreaterThanOrEqual(15);
          break;
        case 'topSpeed':
          expect(o.kmh, d.id).toBeGreaterThanOrEqual(120);
          break;
        case 'wheelie':
          expect(o.meters, d.id).toBeGreaterThan(0);
          break;
        case 'score':
          expect(o.points, d.id).toBeGreaterThan(0);
          expect(d.limit.distance, `${d.id} needs a distance budget`).toBeGreaterThan(0);
          break;
        case 'survive':
          expect(o.seconds, d.id).toBeGreaterThanOrEqual(30);
          expect(o.minKmh, d.id).toBeGreaterThanOrEqual(40);
          break;
        case 'combo':
          expect(o.combo, d.id).toBeGreaterThanOrEqual(3);
          break;
      }
      if (d.limit.time) expect(d.limit.time, d.id).toBeGreaterThan(20);
      if (d.secondary) expect(d.secondary.target, d.id).toBeGreaterThan(0);
    }
  });

  it('difficulty ramps up from map to map', () => {
    const avg = (f: (d: (typeof MISSIONS)[number]) => number) => MAPS.map((m) => missionsForMap(m.id).reduce((a, d) => a + f(d), 0) / 10);
    const cash = avg((d) => d.rewards.cash);
    const xp = avg((d) => d.rewards.xp);
    for (let i = 1; i < 8; i++) {
      expect(cash[i], `cash map ${i}`).toBeGreaterThan(cash[i - 1]);
      expect(xp[i], `xp map ${i}`).toBeGreaterThan(xp[i - 1]);
    }
    const traffic = avg((d) => TRAFFIC_LEVELS[d.traffic.level].baseDensity);
    expect(traffic[7]).toBeGreaterThan(traffic[0]);
    const aggr = avg((d) => d.traffic.aggression);
    expect(aggr[7]).toBeGreaterThan(aggr[0]);
    // The finale of each map pays more than its opener.
    for (const m of MAPS) {
      const l = missionsForMap(m.id);
      expect(l[9].rewards.cash).toBeGreaterThan(l[0].rewards.cash);
    }
  });

  it('rewards: bike unlocks on every map finale, none elsewhere', () => {
    expect(CAREER_BIKE_REWARDS).toHaveLength(8);
    expect(new Set(CAREER_BIKE_REWARDS).size).toBe(8);
    for (const id of CAREER_BIKE_REWARDS) expect(BIKE_BY_ID.has(id), id).toBe(true);
    MAPS.forEach((m, i) => {
      const l = missionsForMap(m.id);
      expect(l[9].rewards.unlockBike, m.id).toBe(CAREER_BIKE_REWARDS[i]);
      for (const d of l.slice(0, 9)) expect(d.rewards.unlockBike, d.id).toBeUndefined();
    });
    for (const d of MISSIONS) {
      expect(d.rewards.cash, d.id).toBeGreaterThan(0);
      expect(d.rewards.xp, d.id).toBeGreaterThan(0);
      expect(d.rewards.firstClearBonus, d.id).toBeGreaterThan(0);
      expect(Number.isInteger(d.rewards.cash)).toBe(true);
      if (d.secondary) expect(d.rewards.secondaryCash, d.id).toBeGreaterThan(0);
      else expect(d.rewards.secondaryCash, d.id).toBe(0);
    }
  });

  it('mission chain: nextMissionId follows career order and ends after mission 80', () => {
    expect(nextMissionId('suburb-01')).toBe('suburb-02');
    expect(nextMissionId('suburb-10')).toBe('highway-01');
    expect(nextMissionId('industrial-10')).toBeNull();
    expect(nextMissionId('nonsense')).toBeNull();
    expect(MISSION_BY_ID.get('industrial-10')!.number).toBe(80);
  });

  it('star thresholds are in the right direction for every metric', () => {
    for (const d of MISSIONS) {
      const lower = LOWER_IS_BETTER[d.stars.metric];
      expect(lower ? d.stars.three < d.stars.two : d.stars.three > d.stars.two, d.id).toBe(true);
    }
  });
});

describe('career requirements are consistent with the bike catalogue', () => {
  it('minTopSpeed equals the model and is at least the career minimum', () => {
    for (const d of MISSIONS) {
      expect(d.minTopSpeed, d.id).toBe(requiredTopSpeed(d.objective, d.limit, d.secondary));
      expect(d.minTopSpeed, d.id).toBeGreaterThanOrEqual(CAREER_MIN_TOP_SPEED);
    }
  });

  it('the starter bike can ride the first missions', () => {
    const starter = BIKE_BY_ID.get(STARTER_BIKE_ID)!;
    for (const d of MISSIONS.slice(0, 12)) expect(starter.topSpeed, d.id).toBeGreaterThanOrEqual(d.minTopSpeed);
  });

  it('time limits and speed targets stay below what the slowest qualifying bike can do', () => {
    for (const d of MISSIONS) {
      const slowest = BIKES.filter((b) => b.topSpeed >= d.minTopSpeed).sort((a, b) => a.topSpeed - b.topSpeed)[0];
      expect(slowest, `${d.id} has a qualifying bike`).toBeDefined();
      const top = slowest.topSpeed;
      const need = requiredAvgKmh(d.objective, d.limit);
      // Pace-limited missions never ask for more than the traffic-flow share of the top speed.
      if (d.objective.type !== 'keepSpeed') expect(need, d.id).toBeLessThanOrEqual(top * AVG_SHARE + 1e-6);
      if (d.objective.type === 'topSpeed') expect(d.objective.kmh, d.id).toBeLessThanOrEqual(top * TOP_SHARE + 1e-6);
      if (d.objective.type === 'keepSpeed') expect(d.objective.kmh, d.id).toBeLessThanOrEqual(top * KEEP_SHARE + 1e-6);
      if (d.objective.type === 'survive') expect(d.objective.minKmh, d.id).toBeLessThanOrEqual(top * KEEP_SHARE + 1e-6);
      if (d.secondary?.kind === 'topSpeed') expect(d.secondary.target, d.id).toBeLessThanOrEqual(top * TOP_SHARE + 1e-6);
    }
  });

  it('checkpoints are reachable: every checkpoint can be made at the required pace', () => {
    for (const d of MISSIONS) {
      if (d.objective.type !== 'checkpoints') continue;
      const o = d.objective;
      const slowest = BIKES.filter((b) => b.topSpeed >= d.minTopSpeed).sort((a, b) => a.topSpeed - b.topSpeed)[0];
      const avg = checkpointRequiredAvgKmh(o);
      expect(avg, d.id).toBeLessThanOrEqual(slowest.topSpeed * AVG_SHARE);
      // Time to reach checkpoint k at that pace never exceeds the clock accumulated so far.
      for (let k = 1; k <= o.count; k++) {
        const t = (k * o.spacing) / (avg / 3.6);
        expect(t, `${d.id} #${k}`).toBeLessThanOrEqual(o.startTime + (k - 1) * o.bonusTime + 1e-6);
      }
    }
  });

  it('score targets need a pace and bonus rate a normal ride can deliver', () => {
    for (const d of MISSIONS) {
      if (d.objective.type !== 'score') continue;
      const need = scoreRequiredAvgKmh(d.objective.points, d.limit.distance!);
      expect(Number.isFinite(need), d.id).toBe(true);
      expect(need, d.id).toBeLessThanOrEqual(130);
      expect(scorePerMetre(need), d.id).toBeCloseTo(d.objective.points / d.limit.distance!, 1);
    }
  });

  it('every mission can be started with a bike the rider can unlock by then (level, career reward and cash)', () => {
    // Conservative progression: one first-clear of every earlier mission, no achievements, no repeat runs.
    let xp = 0;
    let cash = STARTING_CASH;
    const careerBikes: string[] = [];
    for (const d of MISSIONS) {
      const level = levelForXp(xp);
      const ok = BIKES.filter(
        (b) =>
          b.topSpeed >= d.minTopSpeed &&
          b.price <= cash + (b.id === STARTER_BIKE_ID ? Infinity : 0) &&
          (b.id === STARTER_BIKE_ID || (BIKE_UNLOCK_LEVEL.get(b.id) ?? 99) <= level || careerBikes.includes(b.id)),
      );
      expect(ok.length, `${d.id} (level ${level}, $${cash})`).toBeGreaterThan(0);
      xp += d.rewards.xp;
      cash += d.rewards.cash + d.rewards.firstClearBonus;
      if (d.rewards.unlockBike) careerBikes.push(d.rewards.unlockBike);
    }
  });

  it('the requirement model rounds up to a catalogue tier', () => {
    expect(requiredTopSpeed({ type: 'distance', meters: 1000 }, {})).toBe(CAREER_MIN_TOP_SPEED);
    expect(requiredTopSpeed({ type: 'topSpeed', kmh: 200 }, {})).toBeGreaterThanOrEqual(200 / TOP_SHARE);
    expect(requiredTopSpeed({ type: 'keepSpeed', kmh: 120, meters: 1000, startWindow: 20 }, {})).toBeGreaterThanOrEqual(120 / KEEP_SHARE);
    expect(requiredTopSpeed({ type: 'distance', meters: 6000 }, { time: 200 })).toBeGreaterThanOrEqual(((6000 / 200) * 3.6) / AVG_SHARE);
  });
});
