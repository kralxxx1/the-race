import type { BikeSpec, EngineLayout, Livery } from '../../data/bikes';
import type { P3 } from './mesh';
import type { BodyContext } from './context';
import type { LiveryPainter } from './livery';

/**
 * A BikeBlueprint describes one real motorcycle with real-world hardpoints and
 * dimensions. Everything is in metres / degrees in bike space:
 * +Y up, −Z forward, +X = rider's right, rear axle at z = 0, ground at y = 0.
 * See docs/dev/BIKE_BLUEPRINTS.md for the authoring checklist.
 */

export interface WheelDesign {
  /** cast / forged alloy, wire-spoked, solid disc (custom cruisers) or small scooter wheels. */
  type: 'cast' | 'forged' | 'wire' | 'disc' | 'scooter';
  /** Number of spoke arms (a split/Y spoke counts once). Wire wheels: spoke count (32/36/40). */
  spokes: number;
  shape: 'straight' | 'split' | 'y' | 'twin' | 'curved' | 'blade';
  color: string;
  /** Machined (bright) rim edge. */
  machinedLip?: boolean;
  /** Thin rim stripe colour. */
  stripe?: string;
}

export interface WheelEnd {
  /** Tyre size, e.g. "120/70ZR17". */
  tyre: string;
  /** Rim width in inches (3.5 → MT3.50). */
  rimWidthIn: number;
  /** Tread label printed on the sidewall (generic, no tyre brands). */
  tyreLabel?: string;
  /** Profile crown shape (<1 triangular race, >1 round touring). */
  crown?: number;
  /** Tread pattern style. */
  tread?: 'slickish' | 'sport' | 'touring' | 'dual' | 'knobbly' | 'scooter';
}

export interface BrakeSpec {
  discs: 0 | 1 | 2;
  /** Disc diameter (m). */
  discDia: number;
  disc: 'floating' | 'semiFloating' | 'fixed' | 'wave';
  carrierColor: string;
  caliper: 'radialMono4' | 'radial4' | 'axial2' | 'axial1' | 'drum';
  caliperColor: string;
  caliperText?: string;
  caliperTextColor?: string;
}

export interface ForkSpec {
  type: 'usd' | 'rwu' | 'telelever' | 'duolever' | 'springer';
  /** Stanchion (inner tube) diameter (m). */
  stanchion: number;
  /** Fork tube centre spacing (m). */
  spacing: number;
  /** Upper/outer tube colour (USD) or upper stanchion colour (RWU). */
  outerColor: string;
  /** Lower sliding tube / stanchion colour (TiN gold, chrome, DLC black…). */
  innerColor: string;
  /** Axle clamp / fork foot colour. */
  footColor: string;
  capColor: string;
  /** Adjuster colour (preload/rebound on the caps). */
  adjusterColor?: string;
  gaiters?: boolean;
  /** Small printed label on the outer tube. */
  label?: string;
  labelColor?: string;
}

export interface FrameSpec {
  type: 'twinSpar' | 'trellis' | 'cradle' | 'monocoque' | 'backbone' | 'perimeter' | 'scooter' | 'boxer';
  color: string;
  metal: number;
  rough: number;
  subframe: 'tubular' | 'cast' | 'integrated' | 'trellis';
  subframeColor: string;
}

export interface SwingarmSpec {
  type: 'braced' | 'banana' | 'box' | 'singleSided' | 'shaft' | 'tubular' | 'scooter';
  /** Pivot → axle length (m). */
  length: number;
  /** Rest angle below horizontal from pivot to axle (degrees). */
  angleDeg: number;
  /** Arm side for single-sided / shaft swingarms. */
  side?: 'left' | 'right';
  color: string;
  metal: number;
  rough: number;
}

export interface ShockSpec {
  layout: 'mono' | 'twin' | 'monoSide' | 'none';
  springColor: string;
  bodyColor: string;
  reservoir: boolean;
}

export interface DriveSpec {
  type: 'chain' | 'belt' | 'shaft' | 'none';
  side: 'left' | 'right';
  frontTeeth: number;
  rearTeeth: number;
  /** Chain pitch (m): 520 = 15.875 mm. */
  pitch?: number;
  sprocketColor: string;
  chainColor?: string;
}

export interface EngineVisual {
  layout: EngineLayout;
  cc: number;
  /** Crankshaft position (bike space). */
  crank: P3;
  /** Cylinder bank tilt forward from vertical (degrees). For V engines: bank angle bisector tilt. */
  tiltDeg: number;
  caseColor: string;
  coverColor: string;
  headColor: string;
  camCoverColor: string;
  camCoverText?: string;
  finned: boolean;
  liquidCooled: boolean;
  radiator?: { w: number; h: number; z: number; y: number; tiltDeg: number; curved?: boolean };
  supercharger?: boolean;
}

export interface ExhaustSpec {
  route: 'underslung' | 'sideCan' | 'underbelly' | 'highTwin' | 'underseatTwin' | 'dualSide' | 'peashooter' | 'megaphone' | 'shotgun' | 'scooter' | 'organ' | 'highSingle' | 'none';
  side: 'right' | 'left' | 'both';
  can: 'stubby' | 'round' | 'hex' | 'slash' | 'megaphone' | 'fishtail' | 'tri' | 'box' | 'oval';
  canLength: number;
  canDia: number;
  canFinish: 'titanium' | 'carbon' | 'chrome' | 'black' | 'steel';
  headerFinish: 'titanium' | 'steel' | 'chrome' | 'black';
  /** Where the silencer outlet ends (bike space, right-side mirror for 'left'). */
  outlet?: P3;
}

export type DashKind = 'tftR1' | 'tftDucati' | 'tft' | 'tftRound' | 'lcd' | 'analog' | 'analogTwin' | 'scooter';

export interface CockpitSpec {
  bars: 'clipon' | 'tubular' | 'tall' | 'cruiser' | 'scooter';
  /** Right grip centre (bike space, rest pose). The left grip mirrors it. */
  grip: P3;
  /** Handlebar (tube) diameter (m). */
  barDia: number;
  dash: DashKind;
  /** Dash screen centre (bike space) and size (m); tilt back from vertical (deg). */
  dashPos: P3;
  dashSize: [number, number];
  dashTiltDeg: number;
  /** 'fairing' = frame-mounted behind the screen; 'bars' = turns with the steering. */
  dashMount: 'fairing' | 'bars';
  mirrors: 'fairing' | 'bar' | 'barEnd' | 'none';
  /** Right mirror head centre (bike space). */
  mirrorPos?: P3;
  mirrorSize?: [number, number];
  mirrorIndicators?: boolean;
  topClamp: 'milled' | 'cast' | 'riser';
  steeringDamper?: 'top' | 'side' | 'none';
  leverColor: string;
  reservoirs: boolean;
}

export interface LightsSpec {
  head: 'r1' | 'panigale' | 'sportTwin' | 'round' | 'angular' | 'ledBar' | 'beak' | 'touring' | 'scooter' | 'batwing';
  tail: 'r1' | 'panigale' | 'strip' | 'compact' | 'round' | 'bar' | 'scooter';
  /** Separate stalk indicators on the plate hanger. */
  rearIndicators: 'stalk' | 'integrated';
}

export interface RiderSpec {
  /** Hip joint (bike space). */
  hip: P3;
  /** Right foot peg centre. */
  peg: P3;
  /** Torso pitch forward from vertical (radians). */
  torsoPitch: number;
}

export interface SeatSpec {
  /** Seat height at the rider's crotch point (m, unladen). */
  height: number;
  /** Rider seat front/back z. */
  front: number;
  back: number;
  /** Pillion seat (or cowl). */
  pillion: 'seat' | 'cowl' | 'none';
  color: string;
}

export interface PlateSpec {
  mount: 'hanger' | 'tailTidy' | 'fender' | 'swingarm' | 'body';
  /** Plate centre (bike space). */
  pos: P3;
  tiltDeg: number;
}

export type BodyBuilder = (ctx: BodyContext) => void;

export interface BikeBlueprint {
  id: string;
  /** 'authored' blueprints are hand-built from photos/spec sheets; 'auto' are derived from look params. */
  source: 'authored' | 'auto';
  /** Real overall dimensions (m) for validation: length, width, height. */
  overall?: [number, number, number];
  wheelbase: number;
  rakeDeg: number;
  trail: number;
  /** Axle → top of fork tubes, along the fork axis (m, static sag included). */
  forkLength: number;
  front: WheelEnd;
  rear: WheelEnd;
  frontWheel: WheelDesign;
  rearWheel: WheelDesign;
  fork: ForkSpec;
  frontBrake: BrakeSpec;
  rearBrake: BrakeSpec;
  frame: FrameSpec;
  swingarm: SwingarmSpec;
  shock: ShockSpec;
  drive: DriveSpec;
  engine: EngineVisual;
  exhaust: ExhaustSpec;
  cockpit: CockpitSpec;
  lights: LightsSpec;
  seat: SeatSpec;
  rider: RiderSpec;
  plate: PlateSpec;
  /** Builds all painted bodywork, screen, tank, seat and tail. */
  body: BodyBuilder;
  /** Paints the livery atlas. */
  livery: LiveryPainter;
  /** Ground clearance (m) for validation. */
  groundClearance?: number;
}

export interface BlueprintSource {
  spec: BikeSpec;
  livery: Livery;
}
