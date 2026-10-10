import type { BikeSpec } from '../data/bikes';
import type { EngineVoiceParams } from './dsp/params';
import { type BikeVoice, type SilencerKind, mech, resolveVoice } from './voiceKit';
import { VOICE_CALIB } from './voiceCalib';

/**
 * Per-bike engine voices — one entry for every bike in `src/data/bikes.ts`.
 *
 * Each voice is built from what makes the real motorcycle sound the way it
 * does: its firing order (from the catalogue layout), displacement per
 * cylinder, rev range, the stock exhaust routing and silencer (side can,
 * underbelly box, organ pipes, true duals, peashooters…), airbox/intake, valve
 * train and final drive. Bikes sharing an engine family still differ in
 * exhaust, intake and tune. Figures are informed approximations of the real
 * hardware (no manufacturer recordings or CAD data are used).
 *
 * How to tune a voice: see docs/dev/AUDIO.md.
 */

const I4_PAIRS: [number, number][] = [
  [0, 2],
  [1, 3],
];

/** Defaults shared by the different engine families; each bike overrides what differs. */
const chain = (o: Partial<Parameters<typeof mech>[0]> = {}) => mech({ drive: 'chain', ...o });

export const BIKE_VOICES: Record<string, BikeVoice> = {
  // ───────────────────────────── Honda ─────────────────────────────
  'honda-cbr1000rr-r': {
    note: 'Flat-plane 1000 screaming to 15k; semi-cam gear train whine, Akrapovič-developed titanium can.',
    topology: { t: '4-2-1', headers: [0.62, 0.6, 0.6, 0.62], pairs: I4_PAIRS, secondary: 0.32, collector: 0.42 },
    silencer: { kind: 'titanium', pan: [0.45] },
    intake: 'ramAirSport',
    mech: chain({ tick: 0.2, tickHz: 4600, camWhine: 0.3, gearWhine: 0.8, gearTeeth: 42, clutchRattle: 0.12, driveWhine: 0.8 }),
    exhDuration: 262, blowdown: 0.9, roughness: 0.07, idleLope: 0.05, flywheel: 0.18, rasp: 0.75, gasC: 590, crackle: 0.55, backfire: 0.15, loudness: 0.5,
  },
  'honda-cbr650r': {
    note: 'Smooth 649 four with the swooping 4-into-1 headers; civil, high-pitched wail.',
    topology: { t: 'merge', headers: [0.78, 0.74, 0.74, 0.78], collector: 0.5 },
    silencer: { kind: 'stubby', pan: [0.3] },
    intake: 'sportAirbox',
    intakeGain: 0.9,
    mech: chain({ tick: 0.22, tickHz: 4800, camWhine: 0.45, gearWhine: 0.3 }),
    exhDuration: 245, blowdown: 0.75, roughness: 0.09, idleLope: 0.05, flywheel: 0.22, rasp: 0.5, gasC: 550, crackle: 0.3, backfire: 0.08, loudness: -0.5,
  },
  'honda-cb500-hornet': {
    note: '180° parallel twin: even, buzzy, a little sewing-machine at idle.',
    topology: { t: 'merge', headers: [0.62, 0.6], collector: 0.35 },
    silencer: { kind: 'stubby', muffle: 1.1, pan: [0.3] },
    intake: 'naked',
    intakeGain: 0.8,
    mech: chain({ tick: 0.3, tickHz: 4000, camWhine: 0.35, gearWhine: 0.2 }),
    exhDuration: 240, blowdown: 0.65, roughness: 0.12, idleLope: 0.1, flywheel: 0.45, rasp: 0.35, gasC: 530, crackle: 0.2, backfire: 0.05, loudness: -1.5,
  },
  'honda-africa-twin': {
    note: '1084 Unicam 270° twin: V-twin-like off-beat thud through a big high-mounted can.',
    topology: { t: 'merge', headers: [0.7, 0.68], collector: 0.6 },
    silencer: { kind: 'adventure', pan: [0.4] },
    intake: 'adventure',
    mech: chain({ tick: 0.3, tickHz: 3600, camWhine: 0.35, gearWhine: 0.25, clutchRattle: 0.15 }),
    exhDuration: 238, blowdown: 0.7, roughness: 0.28, idleLope: 0.3, flywheel: 0.55, rasp: 0.35, gasC: 530, crackle: 0.3, backfire: 0.08, loudness: 0,
  },
  'honda-gold-wing': {
    note: 'Flat-six: turbine-smooth, muted, a soft Porsche-like burble from twin chrome mufflers.',
    topology: { t: 'groups', headers: [0.7, 0.72, 0.74, 0.7, 0.72, 0.74], groups: [[0, 2, 4], [1, 3, 5]], collector: 0.5, balance: true },
    silencer: { kind: 'touring', muffle: 1.2, pan: [-0.6, 0.6] },
    intake: 'touring',
    mech: mech({ drive: 'shaft', tick: 0.1, tickHz: 3800, camWhine: 0.2, gearWhine: 0.15, clutchRattle: 0.05, driveWhine: 0.5, starterHz: 760 }),
    exhDuration: 228, blowdown: 0.35, roughness: 0.05, idleLope: 0.02, flywheel: 0.08, rasp: 0.15, gasC: 500, crackle: 0.05, backfire: 0.02, loudness: -2.5,
  },
  'honda-rebel-500': {
    note: 'Same 180° twin as the Hornet but with a long low cruiser muffler: softer and duller.',
    topology: { t: 'merge', headers: [0.7, 0.68], collector: 0.55 },
    silencer: { kind: 'peashooter', bright: 0.9, pan: [0.5] },
    intake: 'cruiser',
    mech: chain({ tick: 0.28, tickHz: 3900, camWhine: 0.3, gearWhine: 0.15 }),
    exhDuration: 235, blowdown: 0.6, roughness: 0.14, idleLope: 0.12, flywheel: 0.5, rasp: 0.28, gasC: 520, crackle: 0.15, backfire: 0.05, loudness: -1.5,
  },
  // ───────────────────────────── Yamaha ─────────────────────────────
  'yamaha-r1': {
    note: 'Crossplane: uneven 270-180-90-180 beat gives a V4-like growl instead of a scream; loud airbox honk.',
    topology: { t: '4-2-1', headers: [0.6, 0.64, 0.62, 0.6], pairs: I4_PAIRS, secondary: 0.3, collector: 0.36 },
    silencer: { kind: 'sportCan', extra: [{ hz: 175, q: 2.4, gain: 0.22 }], pan: [0.4] },
    intake: 'ramAirSport',
    intakeGain: 1.15,
    mech: chain({ tick: 0.22, tickHz: 4400, camWhine: 0.4, gearWhine: 0.3, clutchRattle: 0.12, driveWhine: 0.8 }),
    exhDuration: 258, blowdown: 0.88, roughness: 0.2, idleLope: 0.15, flywheel: 0.28, rasp: 0.6, gasC: 580, crackle: 0.6, backfire: 0.15, loudness: 0.8,
  },
  'yamaha-r6': {
    note: '600 four revving to 16,500: the famous induction howl above 12k.',
    topology: { t: '4-2-1', headers: [0.66, 0.64, 0.64, 0.66], pairs: I4_PAIRS, secondary: 0.28, collector: 0.3 },
    silencer: { kind: 'sportCan', bright: 1.2, pan: [0.4] },
    intake: 'ramAirSport',
    intakeGain: 1.2,
    mech: chain({ tick: 0.24, tickHz: 5200, camWhine: 0.5, gearWhine: 0.35, driveWhine: 0.8 }),
    exhDuration: 268, blowdown: 0.9, roughness: 0.07, idleLope: 0.08, flywheel: 0.15, rasp: 0.6, gasC: 600, crackle: 0.45, backfire: 0.1, loudness: 0,
  },
  'yamaha-mt09': {
    note: 'CP3 triple; Yamaha routes intake sound to the rider through acoustic amplifier grilles.',
    topology: { t: 'merge', headers: [0.52, 0.5, 0.52], collector: 0.3 },
    silencer: { kind: 'underbelly', bright: 1.1, pan: [0.15] },
    intake: 'nakedAmplified',
    mech: chain({ tick: 0.26, tickHz: 4300, camWhine: 0.4, gearWhine: 0.25 }),
    exhDuration: 250, blowdown: 0.82, roughness: 0.15, idleLope: 0.12, flywheel: 0.3, rasp: 0.5, gasC: 560, crackle: 0.6, backfire: 0.15, loudness: 0.5,
  },
  'yamaha-mt07': {
    note: 'CP2 270° twin: punchy off-beat bark from a stubby underbelly box.',
    topology: { t: 'merge', headers: [0.55, 0.57], collector: 0.28 },
    silencer: { kind: 'underbelly', muffle: 0.9, pan: [0.2] },
    intake: 'naked',
    intakeGain: 1.05,
    mech: chain({ tick: 0.3, tickHz: 3900, camWhine: 0.35, gearWhine: 0.2 }),
    exhDuration: 242, blowdown: 0.75, roughness: 0.25, idleLope: 0.22, flywheel: 0.5, rasp: 0.4, gasC: 540, crackle: 0.4, backfire: 0.1, loudness: 0,
  },
  'yamaha-r3': {
    note: 'Small 180° twin that loves revs; thin, buzzy and well muffled.',
    topology: { t: 'merge', headers: [0.6, 0.6], collector: 0.38 },
    silencer: { kind: 'sportCan', muffle: 1.2, pan: [0.45] },
    intake: 'sportAirbox',
    intakeGain: 0.75,
    mech: chain({ tick: 0.3, tickHz: 4800, camWhine: 0.35, gearWhine: 0.25 }),
    exhDuration: 245, blowdown: 0.7, roughness: 0.1, idleLope: 0.08, flywheel: 0.4, rasp: 0.35, gasC: 540, crackle: 0.2, backfire: 0.05, loudness: -1.5,
  },
  'yamaha-tmax': {
    note: '360° twin maxi-scooter: CVT whine and a muted, even hum.',
    topology: { t: 'merge', headers: [0.5, 0.5], collector: 0.3 },
    silencer: { kind: 'scooter', pan: [0.5] },
    intake: 'scooter',
    intakeGain: 1.2,
    mech: mech({ drive: 'cvt', tick: 0.2, tickHz: 4300, camWhine: 0.3, gearWhine: 0.15, driveWhine: 0.7, starterHz: 1150 }),
    exhDuration: 232, blowdown: 0.45, roughness: 0.1, idleLope: 0.06, flywheel: 0.35, rasp: 0.15, gasC: 500, crackle: 0.08, backfire: 0.02, loudness: -2,
  },
  'yamaha-vmax': {
    note: '65° V4 muscle bike: uneven V4 rumble, big air scoops, four stubby outlets.',
    topology: { t: 'groups', headers: [0.62, 0.7, 0.64, 0.72], groups: [[0, 2], [1, 3]], collector: 0.45 },
    silencer: { kind: 'stubby', muffle: 1.1, extra: [{ hz: 110, q: 2, gain: 0.25 }], pan: [-0.55, 0.55] },
    intake: 'cruiser',
    intakeGain: 1.3,
    mech: mech({ drive: 'shaft', tick: 0.25, tickHz: 3900, camWhine: 0.35, gearWhine: 0.3, driveWhine: 0.4 }),
    exhDuration: 248, blowdown: 0.85, roughness: 0.3, idleLope: 0.3, flywheel: 0.3, rasp: 0.5, gasC: 560, crackle: 0.5, backfire: 0.15, loudness: 1.2,
  },
  // ───────────────────────────── Kawasaki ─────────────────────────────
  'kawasaki-h2': {
    note: 'Supercharged four: impeller whine over a hoarse I4 and the compressor "chirp" on lift-off.',
    topology: { t: '4-2-1', headers: [0.58, 0.56, 0.56, 0.58], pairs: I4_PAIRS, secondary: 0.3, collector: 0.45 },
    silencer: { kind: 'sportCan', muffle: 1.15, pan: [0.45] },
    intake: 'sportAirbox',
    intakeGain: 0.8,
    mech: chain({ tick: 0.2, tickHz: 4500, camWhine: 0.4, gearWhine: 0.45, gearTeeth: 40 }),
    charger: { ratio: 9.18, blades: 12, whine: 1, blowoff: 1 },
    exhDuration: 252, blowdown: 0.8, roughness: 0.08, idleLope: 0.05, flywheel: 0.2, rasp: 0.5, gasC: 580, crackle: 0.5, backfire: 0.12, loudness: 0.5,
  },
  'kawasaki-h2r': {
    note: 'Track-only H2R: open race pipe, screaming supercharger, constant pops and bangs.',
    topology: { t: '4-2-1', headers: [0.58, 0.56, 0.56, 0.58], pairs: I4_PAIRS, secondary: 0.3, collector: 0.4 },
    silencer: { kind: 'race', pan: [0.4] },
    intake: 'ramAirSport',
    intakeGain: 0.9,
    mech: chain({ tick: 0.2, tickHz: 4500, camWhine: 0.4, gearWhine: 0.5, gearTeeth: 40 }),
    charger: { ratio: 9.18, blades: 12, whine: 1.3, blowoff: 1.3 },
    exhDuration: 270, blowdown: 0.95, roughness: 0.08, idleLope: 0.08, flywheel: 0.18, rasp: 0.95, gasC: 620, crackle: 0.95, backfire: 0.6, loudness: 3,
  },
  'kawasaki-zx10r': {
    note: 'WSBK-bred four: hard metallic howl from the underbelly pre-chamber and side can.',
    topology: { t: '4-2-1', headers: [0.6, 0.58, 0.58, 0.6], pairs: I4_PAIRS, secondary: 0.34, collector: 0.55 },
    silencer: { kind: 'sportCan', extra: [{ hz: 170, q: 2.5, gain: 0.2 }], pan: [0.4] },
    intake: 'ramAirSport',
    mech: chain({ tick: 0.22, tickHz: 4500, camWhine: 0.45, gearWhine: 0.35 }),
    exhDuration: 260, blowdown: 0.88, roughness: 0.08, idleLope: 0.06, flywheel: 0.2, rasp: 0.6, gasC: 585, crackle: 0.5, backfire: 0.12, loudness: 0.3,
  },
  'kawasaki-zx6r': {
    note: '636 four: high, nasal and frantic near its 16k redline.',
    topology: { t: '4-2-1', headers: [0.64, 0.62, 0.62, 0.64], pairs: I4_PAIRS, secondary: 0.3, collector: 0.5 },
    silencer: { kind: 'sportCan', extra: [{ hz: 190, q: 2.5, gain: 0.18 }], bright: 1.05, pan: [0.4] },
    intake: 'ramAirSport',
    intakeGain: 1.1,
    mech: chain({ tick: 0.24, tickHz: 5000, camWhine: 0.45, gearWhine: 0.3 }),
    exhDuration: 265, blowdown: 0.88, roughness: 0.08, idleLope: 0.06, flywheel: 0.16, rasp: 0.55, gasC: 590, crackle: 0.45, backfire: 0.1, loudness: 0,
  },
  'kawasaki-zx4rr': {
    note: '399 cc four spinning to 16k+: a tiny, shrieking superbike.',
    topology: { t: 'merge', headers: [0.68, 0.66, 0.66, 0.68], collector: 0.42 },
    silencer: { kind: 'sportCan', bright: 1.15, pan: [0.45] },
    intake: 'ramAirSport',
    intakeGain: 1.1,
    mech: chain({ tick: 0.25, tickHz: 5400, camWhine: 0.5, gearWhine: 0.3 }),
    exhDuration: 268, blowdown: 0.85, roughness: 0.07, idleLope: 0.06, flywheel: 0.12, rasp: 0.5, gasC: 590, crackle: 0.35, backfire: 0.08, loudness: -0.5,
  },
  'kawasaki-z900': {
    note: 'Naked 948 four tuned for intake growl; underbelly pre-chamber and short can.',
    topology: { t: '4-2-1', headers: [0.66, 0.62, 0.62, 0.66], pairs: I4_PAIRS, secondary: 0.36, collector: 0.4 },
    silencer: { kind: 'stubby', extra: [{ hz: 150, q: 2.4, gain: 0.25 }], pan: [0.3] },
    intake: 'naked',
    intakeGain: 1.15,
    mech: chain({ tick: 0.24, tickHz: 4300, camWhine: 0.4, gearWhine: 0.3 }),
    exhDuration: 248, blowdown: 0.8, roughness: 0.09, idleLope: 0.08, flywheel: 0.25, rasp: 0.5, gasC: 560, crackle: 0.45, backfire: 0.12, loudness: 0.3,
  },
  'kawasaki-ninja400': {
    note: '180° 399 twin: light, smooth, quiet stock can.',
    topology: { t: 'merge', headers: [0.62, 0.62], collector: 0.4 },
    silencer: { kind: 'sportCan', muffle: 1.25, bright: 0.9, pan: [0.45] },
    intake: 'sportAirbox',
    intakeGain: 0.8,
    mech: chain({ tick: 0.28, tickHz: 4500, camWhine: 0.35, gearWhine: 0.2 }),
    exhDuration: 242, blowdown: 0.68, roughness: 0.11, idleLope: 0.08, flywheel: 0.42, rasp: 0.32, gasC: 535, crackle: 0.2, backfire: 0.05, loudness: -1.2,
  },
  // ───────────────────────────── Suzuki ─────────────────────────────
  'suzuki-gsxr1000r': {
    note: 'Classic GSX-R four with the triangular titanium can: raw, rasping top end.',
    topology: { t: '4-2-1', headers: [0.62, 0.6, 0.6, 0.62], pairs: I4_PAIRS, secondary: 0.33, collector: 0.48 },
    silencer: { kind: 'titanium', muffle: 1.2, pan: [0.45] },
    intake: 'ramAirSport',
    mech: chain({ tick: 0.24, tickHz: 4300, camWhine: 0.4, gearWhine: 0.35 }),
    exhDuration: 258, blowdown: 0.86, roughness: 0.08, idleLope: 0.07, flywheel: 0.2, rasp: 0.55, gasC: 580, crackle: 0.45, backfire: 0.12, loudness: 0.3,
  },
  'suzuki-hayabusa': {
    note: '1340 four: deep, smooth, effortless whoosh through twin long silencers.',
    topology: { t: 'groups', headers: [0.7, 0.68, 0.68, 0.7], groups: [[0, 2], [1, 3]], collector: 0.5 },
    silencer: { kind: 'stock', len: 1.2, muffle: 1.2, pan: [-0.6, 0.6] },
    intake: 'ramAirSport',
    intakeGain: 0.85,
    mech: chain({ tick: 0.2, tickHz: 4100, camWhine: 0.35, gearWhine: 0.3 }),
    exhDuration: 248, blowdown: 0.78, roughness: 0.08, idleLope: 0.05, flywheel: 0.22, rasp: 0.4, gasC: 550, crackle: 0.3, backfire: 0.08, loudness: 0,
  },
  'suzuki-vstrom650': {
    note: 'SV-derived 90° V-twin in touring trim: gentle off-beat thrum, big can.',
    topology: { t: 'merge', headers: [0.85, 0.55], collector: 0.45 },
    silencer: { kind: 'adventure', pan: [0.45] },
    intake: 'adventure',
    mech: chain({ tick: 0.28, tickHz: 3700, camWhine: 0.3, gearWhine: 0.2 }),
    exhDuration: 240, blowdown: 0.7, roughness: 0.27, idleLope: 0.25, flywheel: 0.55, rasp: 0.35, gasC: 530, crackle: 0.35, backfire: 0.1, loudness: 0,
  },
  'suzuki-sv650': {
    note: 'The SV 90° V-twin: lively, slightly hollow off-beat bark.',
    topology: { t: 'merge', headers: [0.8, 0.5], collector: 0.35 },
    silencer: { kind: 'stock', bright: 1.1, pan: [0.4] },
    intake: 'naked',
    mech: chain({ tick: 0.28, tickHz: 3800, camWhine: 0.3, gearWhine: 0.2 }),
    exhDuration: 240, blowdown: 0.75, roughness: 0.28, idleLope: 0.28, flywheel: 0.55, rasp: 0.42, gasC: 540, crackle: 0.45, backfire: 0.12, loudness: 0.5,
  },
  // ───────────────────────────── Ducati ─────────────────────────────
  'ducati-panigale-v4s': {
    note: 'Desmosedici Stradale "twin pulse" V4: a V-twin rhythm with V4 rasp, desmo clatter, underbelly box.',
    topology: { t: '4-2-1', headers: [0.72, 0.42, 0.7, 0.44], pairs: I4_PAIRS, secondary: 0.22, collector: 0.3 },
    silencer: { kind: 'underbelly', bright: 1.35, muffle: 0.9, pan: [0.05] },
    intake: 'ramAirSport',
    intakeGain: 1.1,
    mech: chain({ tick: 0.3, tickHz: 3900, desmo: 0.7, camWhine: 0.45, gearWhine: 0.45, gearTeeth: 30, clutchRattle: 0.25, driveWhine: 0.8 }),
    exhDuration: 262, blowdown: 0.92, roughness: 0.22, idleLope: 0.25, flywheel: 0.3, rasp: 0.7, gasC: 595, crackle: 0.7, backfire: 0.2, loudness: 1.2,
  },
  'ducati-panigale-v2': {
    note: 'Superquadro 90° L-twin: hard-edged, short-stroke bark from the underbelly silencer.',
    topology: { t: 'merge', headers: [0.82, 0.5], collector: 0.3 },
    silencer: { kind: 'underbelly', bright: 1.2, pan: [0.05] },
    intake: 'ramAirSport',
    intakeGain: 0.95,
    mech: chain({ tick: 0.3, tickHz: 3800, desmo: 0.75, camWhine: 0.35, gearWhine: 0.3, clutchRattle: 0.3 }),
    exhDuration: 255, blowdown: 0.9, roughness: 0.26, idleLope: 0.32, flywheel: 0.55, rasp: 0.6, gasC: 580, crackle: 0.55, backfire: 0.15, loudness: 1,
  },
  'ducati-streetfighter-v4': {
    note: 'Panigale V4 engine, no fairing: more intake roar reaches the rider, slightly deeper box.',
    topology: { t: '4-2-1', headers: [0.74, 0.44, 0.72, 0.46], pairs: I4_PAIRS, secondary: 0.24, collector: 0.34 },
    silencer: { kind: 'underbelly', bright: 1.25, muffle: 0.95, extra: [{ hz: 150, q: 2.2, gain: 0.2 }], pan: [0.05] },
    intake: 'naked',
    intakeGain: 1.25,
    mech: chain({ tick: 0.3, tickHz: 3900, desmo: 0.7, camWhine: 0.45, gearWhine: 0.45, gearTeeth: 30, clutchRattle: 0.25, driveWhine: 0.8 }),
    exhDuration: 262, blowdown: 0.92, roughness: 0.22, idleLope: 0.25, flywheel: 0.3, rasp: 0.68, gasC: 590, crackle: 0.7, backfire: 0.2, loudness: 1.2,
  },
  'ducati-monster': {
    note: 'Testastretta 11° L-twin: lumpy idle, belt-driven desmo, stacked short silencer.',
    topology: { t: 'merge', headers: [0.78, 0.48], collector: 0.3 },
    silencer: { kind: 'stubby', bright: 1.1, pan: [0.45] },
    intake: 'naked',
    mech: chain({ tick: 0.32, tickHz: 3700, desmo: 0.65, camWhine: 0, gearWhine: 0.25, clutchRattle: 0.35 }),
    exhDuration: 245, blowdown: 0.85, roughness: 0.28, idleLope: 0.38, flywheel: 0.6, rasp: 0.5, gasC: 560, crackle: 0.5, backfire: 0.15, loudness: 0.8,
  },
  'ducati-scrambler': {
    note: 'Air-cooled two-valve Desmodue: loose, rattly, honest L-twin thump.',
    topology: { t: 'merge', headers: [0.75, 0.5], collector: 0.38 },
    silencer: { kind: 'stock', bright: 0.95, pan: [0.5] },
    intake: 'classic',
    intakeGain: 1.1,
    mech: chain({ tick: 0.4, tickHz: 3400, desmo: 0.6, camWhine: 0, gearWhine: 0.2, clutchRattle: 0.4 }),
    exhDuration: 238, blowdown: 0.78, roughness: 0.33, idleLope: 0.42, flywheel: 0.65, rasp: 0.4, gasC: 540, crackle: 0.35, backfire: 0.1, loudness: 0.4,
  },
  'ducati-multistrada-v4': {
    note: 'V4 Granturismo (valve springs, not desmo): twin-pulse rhythm, heavily silenced side can.',
    topology: { t: '4-2-1', headers: [0.7, 0.46, 0.68, 0.48], pairs: I4_PAIRS, secondary: 0.25, collector: 0.4 },
    silencer: { kind: 'adventure', muffle: 1.15, pan: [0.5] },
    intake: 'adventure',
    intakeGain: 1.1,
    mech: chain({ tick: 0.22, tickHz: 4000, camWhine: 0.4, gearWhine: 0.3, gearTeeth: 30, clutchRattle: 0.15 }),
    exhDuration: 248, blowdown: 0.8, roughness: 0.2, idleLope: 0.18, flywheel: 0.32, rasp: 0.45, gasC: 560, crackle: 0.45, backfire: 0.12, loudness: 0.4,
  },
  // ───────────────────────────── BMW ─────────────────────────────
  'bmw-s1000rr': {
    note: 'ShiftCam four: sharp, metallic top-end howl with a flap-valve side can.',
    topology: { t: '4-2-1', headers: [0.6, 0.58, 0.58, 0.6], pairs: I4_PAIRS, secondary: 0.3, collector: 0.42 },
    silencer: { kind: 'sportCan', bright: 1.1, pan: [0.45] },
    intake: 'ramAirSport',
    mech: chain({ tick: 0.22, tickHz: 4700, camWhine: 0.45, gearWhine: 0.3 }),
    exhDuration: 264, blowdown: 0.9, roughness: 0.08, idleLope: 0.07, flywheel: 0.18, rasp: 0.62, gasC: 590, crackle: 0.5, backfire: 0.12, loudness: 0.4,
  },
  'bmw-m1000rr': {
    note: 'M version: titanium Akrapovič system, lighter internals, louder and more crackly.',
    topology: { t: '4-2-1', headers: [0.6, 0.58, 0.58, 0.6], pairs: I4_PAIRS, secondary: 0.29, collector: 0.38 },
    silencer: { kind: 'titanium', len: 0.9, pan: [0.45] },
    intake: 'ramAirSport',
    intakeGain: 1.05,
    mech: chain({ tick: 0.22, tickHz: 4800, camWhine: 0.45, gearWhine: 0.35 }),
    exhDuration: 268, blowdown: 0.92, roughness: 0.08, idleLope: 0.08, flywheel: 0.16, rasp: 0.72, gasC: 600, crackle: 0.65, backfire: 0.2, loudness: 1,
  },
  'bmw-r1250gs': {
    note: 'Boxer twin: even 360° thrum, loud tappets right by your boots, shaft drive.',
    topology: { t: 'merge', headers: [0.95, 0.95], collector: 0.4 },
    silencer: { kind: 'adventure', pan: [0.5] },
    intake: 'adventure',
    mech: mech({ drive: 'shaft', tick: 0.45, tickHz: 3300, camWhine: 0.35, gearWhine: 0.25, clutchRattle: 0.2, driveWhine: 0.5 }),
    exhDuration: 240, blowdown: 0.72, roughness: 0.15, idleLope: 0.15, flywheel: 0.5, rasp: 0.35, gasC: 530, crackle: 0.3, backfire: 0.08, loudness: 0,
  },
  'bmw-k1600gt': {
    note: 'Inline six: silky, rising turbine howl; six-into-two touring mufflers.',
    topology: { t: 'groups', headers: [0.7, 0.72, 0.74, 0.76, 0.72, 0.7], groups: [[0, 4, 2], [5, 1, 3]], collector: 0.45, balance: true },
    silencer: { kind: 'touring', bright: 1.4, muffle: 0.85, pan: [-0.6, 0.6] },
    intake: 'touring',
    intakeGain: 1.2,
    mech: mech({ drive: 'shaft', tick: 0.16, tickHz: 4100, camWhine: 0.35, gearWhine: 0.3, driveWhine: 0.5, starterHz: 820 }),
    exhDuration: 240, blowdown: 0.55, roughness: 0.05, idleLope: 0.02, flywheel: 0.08, rasp: 0.3, gasC: 540, crackle: 0.15, backfire: 0.04, loudness: -0.8,
  },
  'bmw-r18': {
    note: 'The "Big Boxer" 1802 OHV: slow, deep potato-thump, pushrod clatter, open cardan shaft.',
    topology: { t: 'groups', headers: [0.9, 0.9], groups: [[0], [1]], collector: 0.4, balance: true },
    silencer: { kind: 'fishtail', bright: 0.9, pan: [-0.7, 0.7] },
    intake: 'cruiser',
    intakeGain: 1.1,
    mech: mech({ drive: 'shaft', tick: 0.5, tickHz: 2900, camWhine: 0.3, gearWhine: 0.3, driveWhine: 0.4, starterHz: 700 }),
    exhDuration: 232, blowdown: 0.75, roughness: 0.25, idleLope: 0.3, flywheel: 0.7, rasp: 0.3, gasC: 500, crackle: 0.25, backfire: 0.08, loudness: 1,
  },
  // ───────────────────────────── KTM ─────────────────────────────
  'ktm-1290-superduke-r': {
    note: 'LC8 75° V-twin "Beast": brutal bark, big pops on the overrun.',
    topology: { t: 'merge', headers: [0.78, 0.52], collector: 0.35 },
    silencer: { kind: 'stubby', bright: 1.15, pan: [0.4] },
    intake: 'naked',
    intakeGain: 1.2,
    mech: chain({ tick: 0.3, tickHz: 3800, camWhine: 0.35, gearWhine: 0.3, clutchRattle: 0.4 }),
    exhDuration: 252, blowdown: 0.92, roughness: 0.3, idleLope: 0.4, flywheel: 0.5, rasp: 0.6, gasC: 580, crackle: 0.75, backfire: 0.4, loudness: 1.3,
  },
  'ktm-390-duke': {
    note: '399 single: snappy thump, short side-mounted silencer.',
    topology: { t: 'merge', headers: [0.72], collector: 0.3 },
    silencer: { kind: 'stubby', pan: [0.5] },
    intake: 'single',
    mech: chain({ tick: 0.32, tickHz: 4300, camWhine: 0.35, gearWhine: 0.2 }),
    exhDuration: 248, blowdown: 0.82, roughness: 0.3, idleLope: 0.3, flywheel: 0.75, rasp: 0.45, gasC: 560, crackle: 0.35, backfire: 0.1, loudness: -0.8,
  },
  'ktm-rc390': {
    note: 'Same single as the Duke behind a fairing: longer header, sportier can, less intake noise.',
    topology: { t: 'merge', headers: [0.82], collector: 0.36 },
    silencer: { kind: 'sportCan', muffle: 1.1, pan: [0.45] },
    intake: 'sportAirbox',
    intakeGain: 0.85,
    mech: chain({ tick: 0.3, tickHz: 4300, camWhine: 0.35, gearWhine: 0.2 }),
    exhDuration: 250, blowdown: 0.8, roughness: 0.28, idleLope: 0.28, flywheel: 0.75, rasp: 0.42, gasC: 560, crackle: 0.3, backfire: 0.08, loudness: -1,
  },
  'ktm-890-adventure-r': {
    note: 'LC8c parallel twin with 285° crank (435° firing): growly V-twin feel, rally can.',
    topology: { t: 'merge', headers: [0.6, 0.62], collector: 0.45 },
    silencer: { kind: 'adventure', bright: 1.1, pan: [0.5] },
    intake: 'adventure',
    intakeGain: 1.1,
    mech: chain({ tick: 0.28, tickHz: 4000, camWhine: 0.35, gearWhine: 0.25, clutchRattle: 0.3 }),
    exhDuration: 245, blowdown: 0.8, roughness: 0.26, idleLope: 0.28, flywheel: 0.5, rasp: 0.45, gasC: 555, crackle: 0.5, backfire: 0.2, loudness: 0.6,
  },
  // ───────────────────────────── Aprilia ─────────────────────────────
  'aprilia-rsv4': {
    note: '65° V4 with gear/chain cam drive: the screaming, uneven "best-sounding V4".',
    topology: { t: '4-2-1', headers: [0.64, 0.48, 0.62, 0.5], pairs: I4_PAIRS, secondary: 0.26, collector: 0.36 },
    silencer: { kind: 'sportCan', bright: 1.3, muffle: 0.85, pan: [0.45] },
    intake: 'ramAirSport',
    intakeGain: 1.15,
    mech: chain({ tick: 0.24, tickHz: 4400, camWhine: 0.3, gearWhine: 0.55, gearTeeth: 30 }),
    exhDuration: 266, blowdown: 0.93, roughness: 0.22, idleLope: 0.25, flywheel: 0.28, rasp: 0.72, gasC: 600, crackle: 0.75, backfire: 0.25, loudness: 1.3,
  },
  'aprilia-tuono-v4': {
    note: 'RSV4 engine in a naked: lower redline, louder intake right under the rider.',
    topology: { t: '4-2-1', headers: [0.66, 0.5, 0.64, 0.52], pairs: I4_PAIRS, secondary: 0.28, collector: 0.4 },
    silencer: { kind: 'sportCan', bright: 1.15, pan: [0.45] },
    intake: 'naked',
    intakeGain: 1.25,
    mech: chain({ tick: 0.24, tickHz: 4300, camWhine: 0.3, gearWhine: 0.5, gearTeeth: 30 }),
    exhDuration: 260, blowdown: 0.9, roughness: 0.22, idleLope: 0.25, flywheel: 0.3, rasp: 0.68, gasC: 590, crackle: 0.75, backfire: 0.25, loudness: 1.2,
  },
  'aprilia-rs660': {
    note: 'Front bank of the RSV4 as a 270° twin: sharp, racy, underbelly outlet.',
    topology: { t: 'merge', headers: [0.56, 0.58], collector: 0.3 },
    silencer: { kind: 'underbelly', bright: 1.15, pan: [0.1] },
    intake: 'ramAirSport',
    intakeGain: 0.9,
    mech: chain({ tick: 0.26, tickHz: 4400, camWhine: 0.35, gearWhine: 0.3 }),
    exhDuration: 252, blowdown: 0.85, roughness: 0.22, idleLope: 0.2, flywheel: 0.42, rasp: 0.5, gasC: 570, crackle: 0.45, backfire: 0.12, loudness: 0.2,
  },
  // ───────────────────────────── Triumph ─────────────────────────────
  'triumph-speed-triple': {
    note: '1160 triple: deep triple howl (strong 1.5-order) with crackles, high side can.',
    topology: { t: 'merge', headers: [0.62, 0.6, 0.62], collector: 0.4 },
    silencer: { kind: 'sportCan', bright: 1.05, pan: [0.4] },
    intake: 'naked',
    intakeGain: 1.2,
    mech: chain({ tick: 0.24, tickHz: 4100, camWhine: 0.4, gearWhine: 0.3 }),
    exhDuration: 252, blowdown: 0.86, roughness: 0.14, idleLope: 0.12, flywheel: 0.32, rasp: 0.55, gasC: 570, crackle: 0.65, backfire: 0.15, loudness: 0.8,
  },
  'triumph-street-triple': {
    note: '765 triple revving to 13k: the trademark induction howl, short underslung can.',
    topology: { t: 'merge', headers: [0.6, 0.58, 0.6], collector: 0.32 },
    silencer: { kind: 'stubby', bright: 1.2, pan: [0.3] },
    intake: 'naked',
    intakeGain: 1.3,
    mech: chain({ tick: 0.24, tickHz: 4600, camWhine: 0.4, gearWhine: 0.3 }),
    exhDuration: 260, blowdown: 0.86, roughness: 0.13, idleLope: 0.1, flywheel: 0.25, rasp: 0.55, gasC: 575, crackle: 0.6, backfire: 0.12, loudness: 0.5,
  },
  'triumph-bonneville-t120': {
    note: '1200 270° twin through twin peashooters: mellow, woody British burble.',
    topology: { t: 'groups', headers: [0.9, 0.92], groups: [[0], [1]], collector: 0.35, balance: true },
    silencer: { kind: 'peashooter', bright: 0.9, pan: [-0.6, 0.6] },
    intake: 'classic',
    mech: chain({ tick: 0.3, tickHz: 3400, camWhine: 0.3, gearWhine: 0.2, clutchRattle: 0.15 }),
    exhDuration: 232, blowdown: 0.68, roughness: 0.3, idleLope: 0.3, flywheel: 0.65, rasp: 0.3, gasC: 510, crackle: 0.35, backfire: 0.1, loudness: 0.3,
  },
  'triumph-rocket3': {
    note: '2458 cc triple — biggest production engine — through three stacked pipes: massive, gruff.',
    topology: { t: 'organ', headers: [0.75, 0.73, 0.75], collector: 0.4, tips: [0.16, 0.2, 0.24] },
    silencer: { kind: 'organ', muffle: 1.3, bright: 0.8, pan: [0.5] },
    intake: 'cruiser',
    intakeGain: 1.3,
    mech: mech({ drive: 'shaft', tick: 0.22, tickHz: 3600, camWhine: 0.3, gearWhine: 0.3, driveWhine: 0.4, starterHz: 720 }),
    exhDuration: 240, blowdown: 0.85, roughness: 0.2, idleLope: 0.22, flywheel: 0.45, rasp: 0.45, gasC: 540, crackle: 0.55, backfire: 0.15, loudness: 1.2,
  },
  // ───────────────────────────── Harley-Davidson / Indian ─────────────────────────────
  'harley-street-glide': {
    note: 'Milwaukee-Eight 117, 45° common-pin: the "potato-potato" lope, pushrod tick, true duals.',
    topology: { t: 'groups', headers: [0.82, 1.08], groups: [[0], [1]], collector: 0.5, balance: true },
    silencer: { kind: 'fishtail', pan: [-0.65, 0.65] },
    intake: 'cruiser',
    intakeGain: 1.1,
    mech: mech({ drive: 'belt', tick: 0.42, tickHz: 2600, camWhine: 0.15, gearWhine: 0.35, gearTeeth: 25, clutchRattle: 0.25, driveWhine: 0.4, starterHz: 640 }),
    exhDuration: 228, blowdown: 0.72, roughness: 0.5, idleLope: 0.85, flywheel: 0.65, rasp: 0.3, gasC: 500, crackle: 0.25, backfire: 0.08, loudness: 1.6,
  },
  'harley-fat-boy': {
    note: 'Milwaukee-Eight 114 with shotgun duals on the right: same lope, a touch brighter.',
    topology: { t: 'groups', headers: [0.86, 1.04], groups: [[0], [1]], collector: 0.45, balance: true },
    silencer: { kind: 'shotgun', pan: [0.55, 0.7] },
    intake: 'cruiser',
    mech: mech({ drive: 'belt', tick: 0.42, tickHz: 2650, camWhine: 0.15, gearWhine: 0.35, gearTeeth: 25, clutchRattle: 0.25, driveWhine: 0.4, starterHz: 640 }),
    exhDuration: 228, blowdown: 0.75, roughness: 0.5, idleLope: 0.8, flywheel: 0.68, rasp: 0.32, gasC: 505, crackle: 0.25, backfire: 0.08, loudness: 1.6,
  },
  'harley-pan-america': {
    note: 'Revolution Max: 60° V with offset pins fires like a 90° twin; DOHC, modern and revvy.',
    topology: { t: 'merge', headers: [0.62, 0.88], collector: 0.4 },
    silencer: { kind: 'adventure', bright: 1.15, pan: [0.45] },
    intake: 'adventure',
    intakeGain: 1.15,
    mech: chain({ tick: 0.25, tickHz: 4000, camWhine: 0.35, gearWhine: 0.3 }),
    exhDuration: 250, blowdown: 0.85, roughness: 0.25, idleLope: 0.25, flywheel: 0.45, rasp: 0.5, gasC: 565, crackle: 0.45, backfire: 0.12, loudness: 0.8,
  },
  'livewire-one': {
    note: 'Electric: no combustion — motor orders, bevel-gear "jet" whine, inverter tone, belt whir.',
    topology: { t: 'merge', headers: [0.3], collector: 0.2 },
    silencer: { kind: 'stock' },
    intake: 'none',
    mech: mech({ drive: 'belt', tick: 0, camWhine: 0, gearWhine: 0, clutchRattle: 0, driveWhine: 0.6 }),
    electric: { polePairs: 4, gearTeeth: 11, inverterHz: 9600, whine: 1 },
    exhDuration: 240, blowdown: 0, roughness: 0, idleLope: 0, flywheel: 0, rasp: 0, gasC: 540, crackle: 0, backfire: 0, loudness: -2,
  },
  'indian-chief': {
    note: 'Thunderstroke 116 is a 49° V-twin (311/409° firing): slower, rounder lope than the Harley.',
    firing: [0, 311],
    topology: { t: 'groups', headers: [0.86, 1.06], groups: [[0], [1]], collector: 0.5, balance: true },
    silencer: { kind: 'fishtail', len: 0.95, bright: 1.05, pan: [0.45, 0.65] },
    intake: 'cruiser',
    intakeGain: 1.1,
    mech: mech({ drive: 'belt', tick: 0.45, tickHz: 2500, camWhine: 0.12, gearWhine: 0.35, gearTeeth: 27, clutchRattle: 0.25, driveWhine: 0.4, starterHz: 620 }),
    exhDuration: 228, blowdown: 0.75, roughness: 0.48, idleLope: 0.8, flywheel: 0.7, rasp: 0.32, gasC: 500, crackle: 0.25, backfire: 0.08, loudness: 1.6,
  },
  'indian-ftr': {
    note: '60° V-twin flat-tracker: 420/300 firing, twin high pipes, raw and punchy.',
    topology: { t: 'organ', headers: [0.7, 0.86], collector: 0.3, tips: [0.18, 0.22] },
    silencer: { kind: 'sportCan', bright: 1.05, pan: [0.5, 0.6] },
    intake: 'naked',
    intakeGain: 1.1,
    mech: chain({ tick: 0.28, tickHz: 3900, camWhine: 0.35, gearWhine: 0.3 }),
    exhDuration: 245, blowdown: 0.85, roughness: 0.3, idleLope: 0.35, flywheel: 0.55, rasp: 0.5, gasC: 560, crackle: 0.45, backfire: 0.15, loudness: 1,
  },
  // ───────────────────────────── MV Agusta ─────────────────────────────
  'mv-agusta-f3-rr': {
    note: 'Counter-rotating triple to 15k through three organ pipes: the shrill Italian triple wail.',
    topology: { t: 'organ', headers: [0.58, 0.56, 0.58], collector: 0.3, tips: [0.12, 0.15, 0.18] },
    silencer: { kind: 'organ', bright: 1.25, pan: [0.55] },
    intake: 'ramAirSport',
    intakeGain: 1.15,
    mech: chain({ tick: 0.24, tickHz: 4800, camWhine: 0.45, gearWhine: 0.4 }),
    exhDuration: 268, blowdown: 0.9, roughness: 0.13, idleLope: 0.1, flywheel: 0.22, rasp: 0.68, gasC: 595, crackle: 0.65, backfire: 0.15, loudness: 1,
  },
  'mv-agusta-brutale-1000-rr': {
    note: 'Radial-valve four with four stacked organ pipes on the right: shrieking and crackly.',
    topology: { t: 'organ', headers: [0.6, 0.58, 0.58, 0.6], collector: 0.32, tips: [0.11, 0.13, 0.15, 0.17] },
    silencer: { kind: 'organ', bright: 1.2, pan: [0.6] },
    intake: 'naked',
    intakeGain: 1.25,
    mech: chain({ tick: 0.22, tickHz: 4600, camWhine: 0.4, gearWhine: 0.4 }),
    exhDuration: 262, blowdown: 0.9, roughness: 0.08, idleLope: 0.06, flywheel: 0.2, rasp: 0.66, gasC: 595, crackle: 0.6, backfire: 0.18, loudness: 1.1,
  },
  // ───────────────────────────── Royal Enfield ─────────────────────────────
  're-interceptor-650': {
    note: 'Air/oil-cooled 270° twin through long twin peashooters: warm, soft, vintage.',
    topology: { t: 'groups', headers: [0.95, 0.95], groups: [[0], [1]], collector: 0.3, balance: true },
    silencer: { kind: 'peashooter', bright: 0.95, len: 1.05, pan: [-0.6, 0.6] },
    intake: 'classic',
    intakeGain: 0.9,
    mech: chain({ tick: 0.32, tickHz: 3500, camWhine: 0.3, gearWhine: 0.2, clutchRattle: 0.15 }),
    exhDuration: 232, blowdown: 0.62, roughness: 0.28, idleLope: 0.25, flywheel: 0.6, rasp: 0.28, gasC: 505, crackle: 0.3, backfire: 0.08, loudness: -0.3,
  },
  're-classic-350': {
    note: 'Long-stroke 349 single: slow "thump-thump" with a heavy flywheel and long peashooter.',
    topology: { t: 'merge', headers: [1.0], collector: 0.35 },
    silencer: { kind: 'peashooter', len: 1.1, bright: 0.85, pan: [0.55] },
    intake: 'classic',
    mech: chain({ tick: 0.45, tickHz: 3200, camWhine: 0.25, gearWhine: 0.15, clutchRattle: 0.2 }),
    exhDuration: 228, blowdown: 0.65, roughness: 0.4, idleLope: 0.5, flywheel: 0.95, rasp: 0.25, gasC: 490, crackle: 0.12, backfire: 0.05, loudness: -1,
  },
  // ───────────────────────────── Others ─────────────────────────────
  'husqvarna-svartpilen-401': {
    note: 'KTM 399 single in a café-scrambler: short can, smaller snorkelled airbox.',
    topology: { t: 'merge', headers: [0.7], collector: 0.3 },
    silencer: { kind: 'stubby', bright: 1.1, muffle: 0.9, pan: [0.5] },
    intake: { helmholtzHz: 134, helmholtzQ: 4.2, runnerHz: 760, runnerQ: 2.8, gain: 0.88, roar: 0.55, roarHz: 1350, ramAir: 0 },
    mech: chain({ tick: 0.32, tickHz: 4300, camWhine: 0.35, gearWhine: 0.2 }),
    exhDuration: 248, blowdown: 0.82, roughness: 0.3, idleLope: 0.32, flywheel: 0.75, rasp: 0.48, gasC: 565, crackle: 0.4, backfire: 0.1, loudness: -0.6,
  },
  'vespa-gts-300': {
    note: 'HPE 278 single with CVT: polite putter and variator whine.',
    topology: { t: 'merge', headers: [0.45], collector: 0.25 },
    silencer: { kind: 'scooter', pan: [0.5] },
    intake: 'scooter',
    mech: mech({ drive: 'cvt', tick: 0.3, tickHz: 4100, camWhine: 0.25, gearWhine: 0.15, driveWhine: 0.8, starterHz: 1200 }),
    exhDuration: 236, blowdown: 0.5, roughness: 0.25, idleLope: 0.2, flywheel: 0.85, rasp: 0.18, gasC: 500, crackle: 0.08, backfire: 0.02, loudness: -3,
  },
  'benelli-trk-502x': {
    note: '360° parallel twin: even, single-like beat, big high adventure can.',
    topology: { t: 'merge', headers: [0.7, 0.7], collector: 0.5 },
    silencer: { kind: 'adventure', muffle: 1.1, pan: [0.5] },
    intake: 'adventure',
    intakeGain: 0.9,
    mech: chain({ tick: 0.3, tickHz: 4000, camWhine: 0.35, gearWhine: 0.2 }),
    exhDuration: 238, blowdown: 0.62, roughness: 0.12, idleLope: 0.1, flywheel: 0.45, rasp: 0.3, gasC: 525, crackle: 0.18, backfire: 0.05, loudness: -1,
  },
  'cfmoto-800nk': {
    note: 'KTM-derived 799 parallel twin: off-beat growl, underslung can.',
    topology: { t: 'merge', headers: [0.56, 0.58], collector: 0.36 },
    silencer: { kind: 'stubby', bright: 1.1, pan: [0.35] },
    intake: 'naked',
    intakeGain: 1.05,
    mech: chain({ tick: 0.28, tickHz: 4000, camWhine: 0.4, gearWhine: 0.25, clutchRattle: 0.25 }),
    exhDuration: 248, blowdown: 0.8, roughness: 0.24, idleLope: 0.22, flywheel: 0.5, rasp: 0.45, gasC: 560, crackle: 0.45, backfire: 0.12, loudness: 0.3,
  },
};

/** Aftermarket exhaust option (audio setting). */
export type ExhaustMod = 'stock' | 'slipon' | 'race';

/** Ducati-style dry clutch conversion: the famous idle rattle. */
export interface VoiceOptions {
  exhaustMod?: ExhaustMod;
  dryClutch?: boolean;
  /** Apply the generated loudness calibration (default true; the calibration tool turns it off). */
  calib?: boolean;
}

function modSilencer(kind: SilencerKind, mod: ExhaustMod): SilencerKind {
  if (mod === 'stock' || kind === 'scooter') return kind;
  if (mod === 'race') return 'race';
  if (kind === 'touring' || kind === 'fishtail' || kind === 'shotgun') return 'shotgun';
  if (kind === 'organ') return 'organ';
  return 'titanium';
}

/** Synthesiser parameters for a bike, with the user's exhaust/clutch options applied. */
export function voiceParams(spec: BikeSpec, opts: VoiceOptions = {}): EngineVoiceParams {
  const base = BIKE_VOICES[spec.id] ?? fallbackVoice(spec);
  const mod = opts.exhaustMod ?? 'stock';
  let v: BikeVoice = base;
  if (mod !== 'stock' && spec.engine.layout !== 'ELECTRIC') {
    const kind = modSilencer(base.silencer.kind, mod);
    v = {
      ...base,
      silencer: { ...base.silencer, kind, muffle: undefined, bright: kind === 'race' ? 1 : base.silencer.bright },
      crackle: Math.min(1, base.crackle + (mod === 'race' ? 0.35 : 0.2)),
      backfire: Math.min(1, base.backfire + (mod === 'race' ? 0.3 : 0.12)),
      rasp: Math.min(1, base.rasp + (mod === 'race' ? 0.25 : 0.12)),
      loudness: base.loudness + (mod === 'race' ? 3.5 : 1.8),
    };
  }
  if (opts.dryClutch && spec.brand === 'Ducati') v = { ...v, mech: { ...v.mech, clutchRattle: Math.max(v.mech.clutchRattle, 1.2) } };
  const params = resolveVoice(spec, v);
  params.calib = opts.calib === false ? 1 : (VOICE_CALIB[spec.id] ?? 1);
  return params;
}

/** Generic voice for a bike added to the catalogue without its own entry. */
function fallbackVoice(spec: BikeSpec): BikeVoice {
  const n = Math.max(1, spec.engine.layout === 'ELECTRIC' ? 1 : spec.engine.cc > 0 ? Math.round(spec.engine.cc / Math.max(1, spec.engine.cc / 4)) : 1);
  return {
    note: 'Generic voice (no dedicated entry yet).',
    topology: { t: 'merge', headers: new Array(Math.max(1, n)).fill(0.65), collector: 0.4 },
    silencer: { kind: 'stock' },
    intake: 'naked',
    mech: chain(),
    electric: spec.engine.layout === 'ELECTRIC' ? { polePairs: 4, gearTeeth: 11, inverterHz: 9000, whine: 1 } : undefined,
    exhDuration: 245, blowdown: 0.75, roughness: spec.voice.roughness, idleLope: 0.15, flywheel: 0.4, rasp: 0.4, gasC: 550,
    crackle: spec.voice.crackle, backfire: 0.1, loudness: spec.voice.loudness,
  };
}
