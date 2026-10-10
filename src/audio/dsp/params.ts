/**
 * Plain-data descriptions handed to the synthesisers. They must stay
 * structured-cloneable (no functions, no class instances) because they cross
 * into the AudioWorklet through `processorOptions`.
 */

export type EngineQuality = 'low' | 'medium' | 'high' | 'ultra' | 'extreme';
export const ENGINE_QUALITIES: readonly EngineQuality[] = ['low', 'medium', 'high', 'ultra', 'extreme'];

/** One acoustic tube of the exhaust (a bidirectional digital waveguide). */
export interface PipeSpec {
  /** Upstream node index (towards the engine). */
  a: number;
  /** Downstream node index (towards the tail pipe). */
  b: number;
  /** Length in metres. */
  len: number;
  /** Relative cross-section area (sets the scattering at junctions). */
  area: number;
  /** Wall-loss low-pass corner (Hz) applied on every traversal. */
  lossHz: number;
  /** Broadband loss per traversal (0..1, 1 = lossless). */
  lossGain: number;
}

export type NetNode =
  /** Exhaust port of cylinder `cyl`; `refl` = reflection of returning waves off the (mostly closed) valve. */
  | { k: 'port'; cyl: number; refl: number }
  /** Pressure junction where 2+ pipes meet (collector, Y-piece, muffler expansion). */
  | { k: 'junction' }
  /** Open tail pipe radiating to output tap `out`; `reflHz` low-pass of the (negative) open-end reflection. */
  | { k: 'open'; out: number; refl: number; reflHz: number };

/** A radiating outlet (tail pipe) and where it sits relative to the rider. */
export interface OutletSpec {
  /** Stereo position −1 (left) … +1 (right). */
  pan: number;
  gain: number;
  /** Radiation high-pass corner (Hz): small pipes radiate low frequencies poorly. */
  hpHz: number;
}

export interface ExhaustNetwork {
  nodes: NetNode[];
  pipes: PipeSpec[];
  outlets: OutletSpec[];
}

export interface ResonatorSpec {
  hz: number;
  q: number;
  gain: number;
}

export interface MufflerSpec {
  /** Overall absorptive low-pass of the silencer packing (Hz). */
  toneHz: number;
  /** Helmholtz side-branch / shell resonances added after the network. */
  resonators: ResonatorSpec[];
  /** Straight-through perforated-core hiss (0..1). */
  hiss: number;
}

export interface IntakeSpec {
  /** Airbox Helmholtz resonance (Hz). */
  helmholtzHz: number;
  helmholtzQ: number;
  /** Intake runner / velocity stack quarter-wave resonance (Hz). */
  runnerHz: number;
  runnerQ: number;
  /** Level of the intake pulses (suction honk). */
  gain: number;
  /** Broadband induction roar at wide-open throttle (0..1). */
  roar: number;
  /** Centre frequency of the roar band (Hz). */
  roarHz: number;
  /** Ram-air duct whoosh with road speed (0..1). */
  ramAir: number;
}

export type DriveType = 'chain' | 'belt' | 'shaft' | 'cvt';

export interface MechSpec {
  /** Valve-train tick level (0..1). */
  tick: number;
  /** Main tick resonance (Hz). */
  tickHz: number;
  /** Desmodromic clatter (Ducati) 0..1. */
  desmo: number;
  /** Cam-chain whine 0..1 and cam sprocket teeth. */
  camWhine: number;
  camTeeth: number;
  /** Primary gear whine 0..1 and crank-gear teeth (mesh = rpm/60·teeth). */
  gearWhine: number;
  gearTeeth: number;
  /** Clutch basket rattle at idle (0..1); dry clutches ≈ 1. */
  clutchRattle: number;
  drive: DriveType;
  /** Final drive whine/whir level 0..1. */
  driveWhine: number;
  /** Starter motor commutator pitch (Hz). */
  starterHz: number;
}

export interface ChargerSpec {
  /** Impeller speed / crank speed. */
  ratio: number;
  /** Impeller blade count (blade-pass harmonic). */
  blades: number;
  whine: number;
  /** Compressor surge "chirp" level when the throttle snaps shut at boost. */
  blowoff: number;
}

export interface ElectricSpec {
  /** Motor pole pairs: electrical frequency = rpm/60 · polePairs. */
  polePairs: number;
  /** Primary (bevel) gear teeth on the motor shaft. */
  gearTeeth: number;
  /** Inverter PWM carrier (Hz). */
  inverterHz: number;
  whine: number;
}

export interface EngineVoiceParams {
  id: string;
  kind: 'combustion' | 'electric';
  /** Firing angle per cylinder, crank degrees in the 720° cycle. Empty for electric. */
  firing: number[];
  ccPerCyl: number;
  idle: number;
  redline: number;
  limiter: number;

  /** Exhaust valve open duration (crank degrees). */
  exhDuration: number;
  /** 0..1: how sharp the blowdown spike is (high-performance heads, short pipes). */
  blowdown: number;
  /** 0..1 cycle-to-cycle combustion variation. */
  roughness: number;
  /** 0..1 extra lumpy/irregular idle (big cams, big twins). */
  idleLope: number;
  /** 0..1 crank speed fluctuation within the cycle (light flywheel, big cylinders). */
  flywheel: number;
  /** 0..1 turbulent rasp riding on each exhaust pulse. */
  rasp: number;
  /** Exhaust gas speed of sound (m/s), ~480 (cool, quiet) … 620 (hot, race). */
  gasC: number;
  network: ExhaustNetwork;
  muffler: MufflerSpec;
  intake: IntakeSpec;
  mech: MechSpec;
  /** Engine block / frame resonances excited by combustion (felt through the tank). */
  body: ResonatorSpec[];
  /** Overrun crackle tendency 0..1 and occasional big backfire 0..1. */
  crackle: number;
  backfire: number;
  charger: ChargerSpec | null;
  electric: ElectricSpec | null;
  /** Final loudness trim (dB) on top of the automatic calibration. */
  loudness: number;
  /** Automatic level calibration (linear) — filled in by `calibrateVoice`. */
  calib: number;
}

/** How the engine is heard. */
export interface EngineMix {
  /** Exhaust (behind the rider) gain. */
  exhaust: number;
  /** Intake / airbox (under the tank, in front of the rider) gain. */
  intake: number;
  /** Mechanical noise and block resonance gain. */
  mech: number;
  /** 0..1: rider's head shadows the exhaust (first person) → softer highs. */
  rearShadow: number;
  /** Stereo width of outlets (0 = mono). */
  width: number;
  /** Listener EQ: low-shelf (≈140 Hz) and high-shelf gains in dB, shelf corner in Hz. */
  lowDb: number;
  highDb: number;
  highHz: number;
}

/** Rider on the bike: helmet and ear protection tame the highs, chest/seat add body. */
export const FIRST_PERSON_MIX: EngineMix = { exhaust: 0.85, intake: 1.0, mech: 1.4, rearShadow: 0.6, width: 0.55, lowDb: 4, highDb: -9, highHz: 1800 };
/** Bystander a few metres away (garage rev preview, replay cameras). */
export const EXTERNAL_MIX: EngineMix = { exhaust: 1.0, intake: 0.32, mech: 0.4, rearShadow: 0, width: 0.85, lowDb: 1, highDb: -3, highHz: 3000 };

export type VehicleEngineType = 'car' | 'van' | 'diesel' | 'bus' | 'moto' | 'sport';

export interface VehicleVoiceParams {
  type: VehicleEngineType;
  cylinders: number;
  idle: number;
  /** Engine rpm per m/s of road speed in each gear (low → high). */
  gearRpmPerMs: number[];
  /** Muffler low-pass (Hz). */
  mufflerHz: number;
  /** Exhaust tail resonance (Hz). */
  resonanceHz: number;
  engineGain: number;
  tyreGain: number;
  /** Diesel clatter 0..1. */
  clatter: number;
  /** Turbo whistle 0..1. */
  turbo: number;
  /** Aerodynamic / body rumble 0..1 (large vehicles). */
  aero: number;
  seed: number;
}
