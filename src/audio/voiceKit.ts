import type { BikeSpec, EngineLayout } from '../data/bikes';
import { FIRING_ANGLES } from '../data/bikes';
import type {
  ChargerSpec,
  DriveType,
  ElectricSpec,
  EngineVoiceParams,
  ExhaustNetwork,
  IntakeSpec,
  MechSpec,
  MufflerSpec,
  NetNode,
  PipeSpec,
  ResonatorSpec,
} from './dsp/params';

/**
 * Authoring kit for engine voices: exhaust topologies, silencer types,
 * intake and mechanical presets. `voices.ts` describes each real bike with
 * these pieces; `resolveVoice` turns the description into the plain numeric
 * `EngineVoiceParams` the synthesiser runs on.
 */

/** Exhaust routing. Lengths in metres. */
export type Topology =
  /** Every header into one collector (4-1, 3-1, 2-1, single). */
  | { t: 'merge'; headers: number[]; collector: number }
  /** Pairs merge first, then the two secondaries merge (4-2-1). `pairs` = cylinder index pairs. */
  | { t: '4-2-1'; headers: number[]; pairs: [number, number][]; secondary: number; collector: number }
  /** Groups of cylinders feed separate silencers/outlets (6-2, 4-2-2, true dual, peashooters). */
  | { t: 'groups'; headers: number[]; groups: number[][]; collector: number; balance?: boolean }
  /** Merge then split into several short tips (MV Agusta / Rocket 3 "organ pipes"). */
  | { t: 'organ'; headers: number[]; collector: number; tips: number[] };

export type SilencerKind = 'stock' | 'sportCan' | 'titanium' | 'underbelly' | 'stubby' | 'touring' | 'fishtail' | 'shotgun' | 'peashooter' | 'adventure' | 'race' | 'scooter' | 'organ';

interface SilencerPreset {
  chamberLen: number;
  chamberArea: number;
  absorbHz: number;
  absorbGain: number;
  tailLen: number;
  tailArea: number;
  toneHz: number;
  hiss: number;
  hpHz: number;
  resonators: ResonatorSpec[];
}

/**
 * Silencer archetypes. Area ratio sets how much the expansion chamber
 * reflects (= how strongly it muffles low/mid frequencies), absorption sets
 * how much fibre packing eats the highs, the tail sets the radiation corner.
 */
export const SILENCERS: Record<SilencerKind, SilencerPreset> = {
  // Euro-5 side can with catalyst and two chambers: civil, a bit nasal.
  stock: { chamberLen: 0.34, chamberArea: 7.5, absorbHz: 1700, absorbGain: 0.8, tailLen: 0.07, tailArea: 1.1, toneHz: 3200, hiss: 0.14, hpHz: 70, resonators: [{ hz: 240, q: 2.2, gain: 0.25 }, { hz: 820, q: 3, gain: 0.12 }] },
  // Short sporty can, perforated core with packing.
  sportCan: { chamberLen: 0.3, chamberArea: 5.2, absorbHz: 2600, absorbGain: 0.84, tailLen: 0.06, tailArea: 1.15, toneHz: 4800, hiss: 0.28, hpHz: 65, resonators: [{ hz: 300, q: 2, gain: 0.2 }, { hz: 1150, q: 2.5, gain: 0.12 }] },
  // Factory titanium/Akrapovič-style straight-through: open, raspy, crackly.
  titanium: { chamberLen: 0.36, chamberArea: 3.4, absorbHz: 3800, absorbGain: 0.87, tailLen: 0.05, tailArea: 1.2, toneHz: 6800, hiss: 0.45, hpHz: 58, resonators: [{ hz: 340, q: 1.8, gain: 0.16 }, { hz: 1500, q: 2.2, gain: 0.14 }] },
  // Big pre-chamber under the engine + stub outlet: boomy, muffled highs.
  underbelly: { chamberLen: 0.24, chamberArea: 9.5, absorbHz: 1300, absorbGain: 0.76, tailLen: 0.05, tailArea: 1.3, toneHz: 2600, hiss: 0.1, hpHz: 82, resonators: [{ hz: 190, q: 2.5, gain: 0.32 }, { hz: 560, q: 3, gain: 0.16 }] },
  // Very short stub (naked middleweights): punchy and a little hollow.
  stubby: { chamberLen: 0.18, chamberArea: 6.5, absorbHz: 2000, absorbGain: 0.8, tailLen: 0.04, tailArea: 1.25, toneHz: 3600, hiss: 0.2, hpHz: 78, resonators: [{ hz: 260, q: 2.4, gain: 0.26 }, { hz: 940, q: 2.6, gain: 0.14 }] },
  // Large chrome touring mufflers: heavily baffled, deep and quiet.
  touring: { chamberLen: 0.56, chamberArea: 10, absorbHz: 900, absorbGain: 0.72, tailLen: 0.12, tailArea: 1.1, toneHz: 1800, hiss: 0.05, hpHz: 52, resonators: [{ hz: 120, q: 2.6, gain: 0.3 }, { hz: 410, q: 3.2, gain: 0.14 }, { hz: 1050, q: 4, gain: 0.08 }] },
  // Harley-style fishtail / slash-cut cruiser mufflers: baffled tube, deep "potato".
  fishtail: { chamberLen: 0.62, chamberArea: 5.6, absorbHz: 1150, absorbGain: 0.8, tailLen: 0.18, tailArea: 1.05, toneHz: 2100, hiss: 0.08, hpHz: 40, resonators: [{ hz: 92, q: 2.2, gain: 0.36 }, { hz: 330, q: 3, gain: 0.16 }, { hz: 760, q: 3.5, gain: 0.1 }] },
  // Shotgun duals (two stacked tubes): a little brighter than the fishtail.
  shotgun: { chamberLen: 0.55, chamberArea: 4.8, absorbHz: 1400, absorbGain: 0.82, tailLen: 0.16, tailArea: 1.05, toneHz: 2500, hiss: 0.1, hpHz: 42, resonators: [{ hz: 105, q: 2.2, gain: 0.32 }, { hz: 380, q: 3, gain: 0.14 }] },
  // Long thin classic "peashooter": mellow, woody.
  peashooter: { chamberLen: 0.72, chamberArea: 3.8, absorbHz: 1600, absorbGain: 0.83, tailLen: 0.14, tailArea: 1.0, toneHz: 2700, hiss: 0.1, hpHz: 48, resonators: [{ hz: 140, q: 2.4, gain: 0.26 }, { hz: 520, q: 3, gain: 0.12 }] },
  // Big adventure can, mounted high.
  adventure: { chamberLen: 0.42, chamberArea: 8, absorbHz: 1400, absorbGain: 0.78, tailLen: 0.08, tailArea: 1.1, toneHz: 2700, hiss: 0.12, hpHz: 62, resonators: [{ hz: 210, q: 2.4, gain: 0.26 }, { hz: 700, q: 3, gain: 0.12 }] },
  // Race / track-only straight pipe: barely muffled.
  race: { chamberLen: 0.26, chamberArea: 1.7, absorbHz: 7500, absorbGain: 0.93, tailLen: 0.1, tailArea: 1.25, toneHz: 11000, hiss: 0.7, hpHz: 45, resonators: [{ hz: 420, q: 1.5, gain: 0.12 }] },
  // Scooter can on the swingarm, CVT engine: dull and quiet.
  scooter: { chamberLen: 0.3, chamberArea: 12, absorbHz: 850, absorbGain: 0.66, tailLen: 0.06, tailArea: 1.0, toneHz: 1500, hiss: 0.04, hpHz: 95, resonators: [{ hz: 230, q: 2.6, gain: 0.3 }, { hz: 640, q: 3, gain: 0.12 }] },
  // Short stacked tips after a collector box (organ pipes).
  organ: { chamberLen: 0.28, chamberArea: 4.6, absorbHz: 3000, absorbGain: 0.85, tailLen: 0.09, tailArea: 0.75, toneHz: 5600, hiss: 0.32, hpHz: 66, resonators: [{ hz: 360, q: 2, gain: 0.18 }, { hz: 1350, q: 2.4, gain: 0.14 }] },
};

/**
 * A tail pipe radiates volume-velocity *changes* (≈ +6 dB/oct) up to roughly ka ≈ 1. The
 * network works on flow, so the silencer presets' `hpHz` is scaled up to model that derivative
 * and stop the unipolar pulse trains from putting a boom at half the firing frequency.
 */
const RADIATION_HP = 5;

export interface SilencerTweak {
  kind: SilencerKind;
  /** Multiplies the chamber length (changes its resonances). */
  len?: number;
  /** Multiplies the absorption corner (brighter > 1). */
  bright?: number;
  /** Multiplies the expansion area ratio (more muffled > 1). */
  muffle?: number;
  /** Extra resonators appended after the preset's. */
  extra?: ResonatorSpec[];
  /** Outlet stereo position(s), −1 left … +1 right (one per outlet). */
  pan?: number[];
}

/** Build the waveguide network: headers → topology → silencer(s) → open tail(s). */
export function buildNetwork(topo: Topology, sil: SilencerTweak): ExhaustNetwork {
  const s = SILENCERS[sil.kind];
  const nodes: NetNode[] = [];
  const pipes: PipeSpec[] = [];
  const node = (n: NetNode): number => nodes.push(n) - 1;
  const pipe = (a: number, b: number, len: number, area: number, lossHz: number, lossGain: number) => pipes.push({ a, b, len, area, lossHz, lossGain });
  const chamberLen = s.chamberLen * (sil.len ?? 1);
  const chamberArea = s.chamberArea * (sil.muffle ?? 1);
  const absorbHz = s.absorbHz * (sil.bright ?? 1);
  const headerLoss = 11000;
  const outlets: ExhaustNetwork['outlets'] = [];
  const pans = sil.pan ?? [0.35];
  /** silencer from junction `j` (collector end) to a new open outlet. */
  const silencer = (j: number, inArea: number, tailLenMul = 1): void => {
    const j1 = node({ k: 'junction' });
    const j2 = node({ k: 'junction' });
    const out = outlets.length;
    const open = node({ k: 'open', out, refl: 0.88, reflHz: 1800 });
    // Inlet stub (perforated core start).
    pipe(j, j1, 0.05, inArea, 9000, 0.98);
    pipe(j1, j2, chamberLen, chamberArea, absorbHz, s.absorbGain);
    pipe(j2, open, s.tailLen * tailLenMul, s.tailArea, 9000, 0.97);
    outlets.push({ pan: pans[Math.min(out, pans.length - 1)], gain: 1, hpHz: s.hpHz * RADIATION_HP });
  };

  const ports = (headers: number[]) => headers.map((_, c) => node({ k: 'port', cyl: c, refl: 0.62 }));

  switch (topo.t) {
    case 'merge': {
      const p = ports(topo.headers);
      const j = node({ k: 'junction' });
      p.forEach((n, c) => pipe(n, j, topo.headers[c], 1, headerLoss, 0.985));
      const jc = node({ k: 'junction' });
      const collArea = Math.min(3, 0.8 + 0.45 * topo.headers.length);
      pipe(j, jc, topo.collector, collArea, 9000, 0.98);
      silencer(jc, collArea);
      break;
    }
    case '4-2-1': {
      const p = ports(topo.headers);
      const jc = node({ k: 'junction' });
      for (const [a, b] of topo.pairs) {
        const jp = node({ k: 'junction' });
        pipe(p[a], jp, topo.headers[a], 1, headerLoss, 0.985);
        pipe(p[b], jp, topo.headers[b], 1, headerLoss, 0.985);
        pipe(jp, jc, topo.secondary, 1.5, 10000, 0.982);
      }
      const jm = node({ k: 'junction' });
      pipe(jc, jm, topo.collector, 2.1, 9000, 0.98);
      silencer(jm, 2.1);
      break;
    }
    case 'groups': {
      const p = ports(topo.headers);
      const groupJ: number[] = [];
      topo.groups.forEach((g) => {
        const j = node({ k: 'junction' });
        groupJ.push(j);
        for (const c of g) pipe(p[c], j, topo.headers[c], 1, headerLoss, 0.985);
      });
      // Optional balance (crossover) pipe between the first two groups.
      if (topo.balance && groupJ.length >= 2) pipe(groupJ[0], groupJ[1], 0.32, 0.6, 7000, 0.97);
      groupJ.forEach((j, gi) => {
        const area = Math.min(2.4, 0.8 + 0.45 * topo.groups[gi].length);
        const jc = node({ k: 'junction' });
        pipe(j, jc, topo.collector * (1 + gi * 0.07), area, 9000, 0.98);
        silencer(jc, area, 1 + gi * 0.12);
      });
      break;
    }
    case 'organ': {
      const p = ports(topo.headers);
      const j = node({ k: 'junction' });
      p.forEach((n, c) => pipe(n, j, topo.headers[c], 1, headerLoss, 0.985));
      const jc = node({ k: 'junction' });
      pipe(j, jc, topo.collector, 2.2, 9000, 0.98);
      const j1 = node({ k: 'junction' });
      const j2 = node({ k: 'junction' });
      pipe(jc, j1, 0.05, 2.2, 9000, 0.98);
      pipe(j1, j2, chamberLen, chamberArea, absorbHz, s.absorbGain);
      topo.tips.forEach((len) => {
        const out = outlets.length;
        const open = node({ k: 'open', out, refl: 0.86, reflHz: 2200 });
        pipe(j2, open, len, s.tailArea, 9000, 0.97);
        outlets.push({ pan: pans[Math.min(out, pans.length - 1)], gain: 1 / Math.sqrt(topo.tips.length), hpHz: s.hpHz * RADIATION_HP });
      });
      break;
    }
  }
  return { nodes, pipes, outlets };
}

export type IntakeKind = 'ramAirSport' | 'sportAirbox' | 'naked' | 'nakedAmplified' | 'adventure' | 'cruiser' | 'classic' | 'single' | 'scooter' | 'touring' | 'none';

export const INTAKES: Record<IntakeKind, IntakeSpec> = {
  // Superbike with ram-air: big airbox, short velocity stacks, huge induction howl.
  ramAirSport: { helmholtzHz: 128, helmholtzQ: 4.5, runnerHz: 780, runnerQ: 3, gain: 1.0, roar: 0.95, roarHz: 1450, ramAir: 0.9 },
  sportAirbox: { helmholtzHz: 120, helmholtzQ: 4, runnerHz: 690, runnerQ: 2.8, gain: 0.9, roar: 0.75, roarHz: 1300, ramAir: 0.55 },
  naked: { helmholtzHz: 108, helmholtzQ: 3.5, runnerHz: 620, runnerQ: 2.5, gain: 0.85, roar: 0.62, roarHz: 1150, ramAir: 0.12 },
  // Yamaha MT-09 style: "acoustic amplifier grilles" route intake sound to the rider.
  nakedAmplified: { helmholtzHz: 112, helmholtzQ: 5.5, runnerHz: 660, runnerQ: 3.5, gain: 1.25, roar: 0.9, roarHz: 1050, ramAir: 0.1 },
  adventure: { helmholtzHz: 96, helmholtzQ: 3.2, runnerHz: 540, runnerQ: 2.4, gain: 0.7, roar: 0.45, roarHz: 980, ramAir: 0.08 },
  cruiser: { helmholtzHz: 72, helmholtzQ: 3, runnerHz: 380, runnerQ: 2.2, gain: 0.75, roar: 0.4, roarHz: 760, ramAir: 0 },
  classic: { helmholtzHz: 88, helmholtzQ: 3, runnerHz: 470, runnerQ: 2.2, gain: 0.65, roar: 0.36, roarHz: 880, ramAir: 0 },
  single: { helmholtzHz: 118, helmholtzQ: 3.4, runnerHz: 720, runnerQ: 2.6, gain: 0.8, roar: 0.5, roarHz: 1250, ramAir: 0.05 },
  scooter: { helmholtzHz: 140, helmholtzQ: 2.4, runnerHz: 850, runnerQ: 2, gain: 0.4, roar: 0.18, roarHz: 1400, ramAir: 0 },
  touring: { helmholtzHz: 80, helmholtzQ: 2.6, runnerHz: 430, runnerQ: 2, gain: 0.45, roar: 0.22, roarHz: 820, ramAir: 0.05 },
  none: { helmholtzHz: 100, helmholtzQ: 1, runnerHz: 500, runnerQ: 1, gain: 0, roar: 0, roarHz: 1000, ramAir: 0 },
};

export function mech(o: Partial<MechSpec> & { drive: DriveType }): MechSpec {
  return {
    tick: 0.25,
    tickHz: 4200,
    desmo: 0,
    camWhine: 0.4,
    camTeeth: 36,
    gearWhine: 0.25,
    gearTeeth: 34,
    clutchRattle: 0.1,
    driveWhine: 0.6,
    starterHz: 980,
    ...o,
  };
}

/** Block/frame resonances: big cylinders → lower and stronger. */
export function bodyModes(ccPerCyl: number, layout: EngineLayout, scale = 1): ResonatorSpec[] {
  const big = Math.min(2.2, Math.max(0.4, ccPerCyl / 400));
  const base = layout === 'V2_45' || layout === 'BOXER' ? 52 : layout === 'SINGLE' ? 70 : 90;
  return [
    { hz: base / Math.sqrt(big), q: 2.4, gain: 0.55 * big * scale },
    { hz: 330 / Math.sqrt(big), q: 4, gain: 0.3 * scale },
    { hz: 1250, q: 7, gain: 0.12 * scale },
    { hz: 640, q: 5, gain: 0.14 * scale },
    { hz: 2300, q: 9, gain: 0.06 * scale },
  ];
}

/** Author-facing description of one bike's voice. */
export interface BikeVoice {
  /** One line on what the real bike sounds like (documentation). */
  note: string;
  /** Override firing angles when the real engine differs from the catalogue layout's generic one. */
  firing?: number[];
  topology: Topology;
  silencer: SilencerTweak;
  intake: IntakeKind | IntakeSpec;
  /** Fine adjustment of intake gain/roar. */
  intakeGain?: number;
  mech: MechSpec;
  exhDuration: number;
  blowdown: number;
  roughness: number;
  idleLope: number;
  flywheel: number;
  rasp: number;
  gasC: number;
  bodyScale?: number;
  crackle: number;
  backfire: number;
  loudness: number;
  charger?: ChargerSpec;
  electric?: ElectricSpec;
}

/** Turn an authored voice + catalogue spec into synthesiser parameters. */
export function resolveVoice(spec: BikeSpec, v: BikeVoice): EngineVoiceParams {
  const e = spec.engine;
  const firing = spec.engine.layout === 'ELECTRIC' ? [] : (v.firing ?? FIRING_ANGLES[e.layout]);
  const cyl = Math.max(1, firing.length);
  const ccPerCyl = e.layout === 'ELECTRIC' ? 0 : e.cc / cyl;
  const intake: IntakeSpec = typeof v.intake === 'string' ? { ...INTAKES[v.intake] } : { ...v.intake };
  if (v.intakeGain !== undefined) {
    intake.gain *= v.intakeGain;
    intake.roar *= v.intakeGain;
  }
  const s = SILENCERS[v.silencer.kind];
  const muffler: MufflerSpec = {
    toneHz: s.toneHz * (v.silencer.bright ?? 1),
    resonators: [...s.resonators, ...(v.silencer.extra ?? [])],
    hiss: s.hiss,
  };
  return {
    id: spec.id,
    kind: e.layout === 'ELECTRIC' ? 'electric' : 'combustion',
    firing: [...firing],
    ccPerCyl,
    idle: e.idle,
    redline: e.redline,
    limiter: e.limiter,
    exhDuration: v.exhDuration,
    blowdown: v.blowdown,
    roughness: v.roughness,
    idleLope: v.idleLope,
    flywheel: v.flywheel,
    rasp: v.rasp,
    gasC: v.gasC,
    network: buildNetwork(v.topology, v.silencer),
    muffler,
    intake,
    mech: v.mech,
    body: bodyModes(ccPerCyl, e.layout, v.bodyScale ?? 1),
    crackle: v.crackle,
    backfire: v.backfire,
    charger: v.charger ?? null,
    electric: v.electric ?? null,
    loudness: v.loudness,
    calib: 1,
  };
}
