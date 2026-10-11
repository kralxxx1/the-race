import type { BikeSpec, EngineLayout, Livery } from '../../data/bikes';
import type { P3 } from './mesh';
import type { KitContext } from './context';
import type { LiveryPainter, LiveryZones } from './livery';

/**
 * A BikeBlueprint describes one real motorcycle with real-world hardpoints and
 * dimensions. Everything is in metres (angles in degrees) in bike space:
 * +Y up, −Z forward, +X = rider's right, rear axle at z = 0, ground at y = 0.
 * See docs/dev/BIKE_BLUEPRINTS.md for the authoring checklist.
 */

export interface WheelDesign {
  /** Cast / forged alloy, cross-laced wire spokes, solid disc (custom cruisers) or small scooter wheels. */
  type: 'cast' | 'forged' | 'wire' | 'disc' | 'scooter';
  /** Number of spoke arms (a Y/split spoke counts once). Wire wheels: spoke count (32/36/40). */
  spokes: number;
  /** straight: plain arm; y: splits into two near the rim; split: two parallel thin arms; twin: pairs of arms
   *  converging at the hub; curved: swept arms; blade: wide flat arms. */
  shape: 'straight' | 'split' | 'y' | 'twin' | 'curved' | 'blade';
  color: string;
  /** Machined (bright) rim edge. */
  machinedLip?: boolean;
  /** Thin rim stripe colour. */
  stripe?: string;
  /** Tubeless-style cross-spoke rims (spokes anchored on the rim edge, BMW GS / Africa Twin). */
  crossSpoke?: boolean;
  /** Anodised rim colour for wire wheels (default polished aluminium), e.g. the GS Trophy's gold rims. */
  rimColor?: string;
}

export interface WheelEnd {
  /** Tyre size, e.g. "120/70ZR17". */
  tyre: string;
  /** Rim width in inches (3.5 → MT3.50). */
  rimWidthIn: number;
  /** Generic tread name printed on the sidewall (no tyre brands). */
  tyreLabel?: string;
  /** Profile crown shape (<1 triangular race, >1 round touring). */
  crown?: number;
  /** Tread pattern style. */
  tread?: TreadStyle;
}

export type TreadStyle = 'slickish' | 'sport' | 'touring' | 'dual' | 'knobbly' | 'scooter' | 'cruiser';

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
  /** Caliper position on the disc, degrees from straight up, positive towards the rear. */
  caliperAngleDeg?: number;
}

export interface ForkSpec {
  type: 'usd' | 'rwu' | 'telelever' | 'springer';
  /** Stanchion (inner tube) diameter (m). */
  stanchion: number;
  /** Fork tube centre spacing (m). */
  spacing: number;
  /** Outer (upper on USD) tube colour. */
  outerColor: string;
  /** Sliding tube colour (TiN gold, chrome, DLC black…). */
  innerColor: string;
  /** Axle clamp / fork foot colour. */
  footColor: string;
  capColor: string;
  /** Preload / damping adjuster colour. */
  adjusterColor?: string;
  gaiters?: boolean;
  /** Small printed label on the outer tube. */
  label?: string;
  labelColor?: string;
  /** Fork tube length above the top clamp (m). */
  aboveClamp?: number;
  /** Top clamp → bottom clamp distance (m). */
  clampGap?: number;
}

export interface FrameSpec {
  type: 'twinSpar' | 'trellis' | 'cradle' | 'monocoque' | 'backbone' | 'scooter' | 'boxer';
  color: string;
  metal: number;
  rough: number;
  subframe: 'tubular' | 'cast' | 'integrated' | 'trellis';
  subframeColor: string;
  /** Beam outer width at the widest point (m). */
  width?: number;
}

export interface SwingarmSpec {
  type: 'braced' | 'banana' | 'box' | 'singleSided' | 'shaft' | 'tubular' | 'scooter';
  /** Pivot → axle length (m). */
  length: number;
  /** Rest angle below horizontal from pivot to axle (degrees, positive = pivot higher than axle). */
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
  /** Cylinder tilt forward from vertical (degrees). V engines: front-bank angle above horizontal. */
  tiltDeg: number;
  caseColor: string;
  coverColor: string;
  headColor: string;
  camCoverColor: string;
  camCoverText?: string;
  finned: boolean;
  liquidCooled: boolean;
  radiator?: { w: number; h: number; z: number; y: number; tiltDeg: number; curved?: boolean; side?: boolean };
  supercharger?: boolean;
  /** Oil filter colour (default dark; Yamaha-style blue on some bikes). */
  filterColor?: string;
  /** Overall width of the crankcase (m). */
  width?: number;
}

export interface ExhaustSpec {
  route: 'underslung' | 'sideCan' | 'underbelly' | 'highTwin' | 'underseatTwin' | 'dualSide' | 'peashooter' | 'megaphone' | 'shotgun' | 'scooter' | 'highSingle' | 'none';
  side: 'right' | 'left' | 'both';
  can: 'stubby' | 'round' | 'hex' | 'slash' | 'megaphone' | 'fishtail' | 'tri' | 'box' | 'oval';
  canLength: number;
  canDia: number;
  canFinish: 'titanium' | 'carbon' | 'chrome' | 'black' | 'steel';
  headerFinish: 'titanium' | 'steel' | 'chrome' | 'black';
  /** Silencer outlet centre (bike space, right side; mirrored for left). */
  outlet?: P3;
}

export type DashKind = 'tftR1' | 'tftDucati' | 'tftBmw' | 'tftWide' | 'tft' | 'tftRound' | 'lcd' | 'analog' | 'analogTwin' | 'scooter' | 'harley';

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
  /** Right mirror glass centre (bike space). */
  mirrorPos?: P3;
  mirrorSize?: [number, number];
  mirrorIndicators?: boolean;
  /** Mirror outline: oval (default), sport (tapered wedge, outer end high), rect (rounded rectangle), round. */
  mirrorShape?: 'oval' | 'sport' | 'rect' | 'round';
  /** Mirror housing colour (default: body paint for fairing mirrors, gloss black for bar mirrors). */
  mirrorColor?: string;
  topClamp: 'milled' | 'cast' | 'riser';
  steeringDamper?: 'top' | 'side' | 'none';
  leverColor: string;
  reservoirs: boolean;
  switchColor?: string;
  gripColor?: string;
  clutch?: 'cable' | 'hydraulic';
  ignition?: 'clamp' | 'tank' | 'keyless';
  /** Bar-end weights / bar-end mirrors colour. */
  barEndColor?: string;
}

export interface LightsSpec {
  head: 'r1' | 'panigale' | 'sportTwin' | 'round' | 'angular' | 'ledBar' | 'beak' | 'touring' | 'scooter' | 'batwing' | 'custom';
  tail: 'r1' | 'panigale' | 'strip' | 'compact' | 'round' | 'bar' | 'scooter' | 'custom';
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
  /**
   * Helmet-camera eye point (bike space) of a rider in the normal riding position, from
   * which the cockpit (screen top, dash, clamps, mirrors) frames the bottom of the view.
   * Defaults to a point derived from `hip` and `torsoPitch`.
   */
  eye?: P3;
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

export type BodyBuilder = (ctx: KitContext) => void;

export type FootrestType = 'rearset' | 'peg' | 'floorboard' | 'scooter';

export interface BikeBlueprint {
  id: string;
  /** 'authored' blueprints are hand-built from photos/spec sheets; 'auto' are derived from look params. */
  source: 'authored' | 'auto';
  /** Real overall dimensions (m) for validation: length, width, height. */
  overall?: [number, number, number];
  wheelbase: number;
  rakeDeg: number;
  /** Trail (m). */
  trail: number;
  /** Axle → top of the fork tubes, along the fork axis (m, static sag included). */
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
  footrests: FootrestType;
  plate: PlateSpec;
  /** Builds the painted bodywork, screen, tank, seat, tail and model-specific parts. */
  body: BodyBuilder;
  /** Paints the livery atlas (index = livery index in the BikeSpec). */
  livery: LiveryPainter;
  /** Livery zone overrides for the painter. */
  zones?: Partial<LiveryZones>;
  /** Ground clearance (m) for validation. */
  groundClearance?: number;
  /** Feature flags understood by the generic body builder and kit (crash bars, panniers…). */
  features?: readonly string[];
}

export interface BlueprintSource {
  spec: BikeSpec;
  livery: Livery;
}
