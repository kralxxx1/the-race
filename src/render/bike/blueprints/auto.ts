import type { BikeSpec, BikeStyle, EngineLayout } from '../../../data/bikes';
import { genericBody } from '../kit/body';
import { genericLivery } from '../livery';
import type { P3 } from '../mesh';
import { tyreFor } from '../tyre';
import type { BikeBlueprint, DashKind, ExhaustSpec, TreadStyle, WheelDesign } from '../types';

/**
 * Automatic blueprint for bikes without an authored one: real-world style
 * defaults (fork length, swingarm, trail, footrests…) combined with the bike's
 * look parameters. Proportions come from the catalogue (wheelbase, wheel radii,
 * seat height, rake); everything else is chosen to match the style.
 */

const FORK_LEN: Record<BikeStyle, number> = { sport: 0.73, hyper: 0.74, naked: 0.75, adventure: 0.88, touring: 0.78, cruiser: 0.84, classic: 0.72, scooter: 0.6 };
const SWING_LEN: Record<BikeStyle, number> = { sport: 0.58, hyper: 0.6, naked: 0.58, adventure: 0.62, touring: 0.6, cruiser: 0.64, classic: 0.5, scooter: 0.42 };
const TRAIL: Record<BikeStyle, number> = { sport: 0.1, hyper: 0.104, naked: 0.1, adventure: 0.11, touring: 0.11, cruiser: 0.145, classic: 0.105, scooter: 0.09 };
const DEG = 180 / Math.PI;

/** Rim width (inches) commonly paired with a tyre section width (mm). */
export function rimFor(widthMm: number): number {
  const table: [number, number][] = [[80, 1.85], [90, 2.15], [100, 2.5], [110, 3.0], [120, 3.5], [130, 3.5], [140, 4.0], [150, 4.25], [160, 4.5], [170, 5.0], [180, 5.5], [190, 6.0], [200, 6.0], [240, 8.0]];
  let best = table[0];
  for (const t of table) if (Math.abs(t[0] - widthMm) < Math.abs(best[0] - widthMm)) best = t;
  return best[1];
}

function preferredRim(style: BikeStyle, R: number, front: boolean, wire: boolean): number | undefined {
  if (style === 'scooter') return R > 0.27 ? 15 : R > 0.24 ? 13 : 12;
  if (style === 'adventure' && wire) return front ? (R > 0.35 ? 21 : 19) : R > 0.335 ? 18 : 17;
  if (style === 'cruiser' || style === 'classic' || style === 'touring') return undefined;
  return 17;
}

function treadFor(style: BikeStyle, wire: boolean): TreadStyle {
  if (style === 'scooter') return 'scooter';
  if (style === 'adventure') return wire ? 'dual' : 'touring';
  if (style === 'cruiser') return 'cruiser';
  if (style === 'touring' || style === 'classic') return 'touring';
  if (style === 'hyper' || style === 'sport') return 'sport';
  return 'sport';
}

function wheelDesign(spec: BikeSpec, color: string, front: boolean): WheelDesign {
  const w = spec.look.wheel;
  switch (w) {
    case 'cast3':
      return { type: 'forged', spokes: 3, shape: 'y', color };
    case 'cast5':
      return { type: 'cast', spokes: 5, shape: spec.style === 'sport' || spec.style === 'hyper' ? 'y' : 'split', color };
    case 'cast7':
      return { type: 'cast', spokes: 7, shape: 'curved', color };
    case 'cast10':
      return { type: 'cast', spokes: 10, shape: 'straight', color, machinedLip: true };
    case 'spoke':
      return { type: 'wire', spokes: front ? 36 : 40, shape: 'straight', color, crossSpoke: spec.style === 'adventure' };
    case 'disc':
      return { type: 'disc', spokes: 0, shape: 'straight', color };
    default:
      return { type: 'scooter', spokes: 5, shape: 'blade', color };
  }
}

function exhaustFor(spec: BikeSpec): ExhaustSpec {
  const e = spec.look.exhaust;
  const layout = spec.engine.layout;
  const premium = spec.price > 15000;
  switch (e) {
    case 'under':
      return { route: 'underslung', side: 'right', can: 'stubby', canLength: 0.26, canDia: 0.1, canFinish: 'titanium', headerFinish: 'titanium' };
    case 'high':
      return { route: 'highSingle', side: 'right', can: 'hex', canLength: 0.36, canDia: 0.1, canFinish: premium ? 'titanium' : 'steel', headerFinish: 'steel' };
    case 'twinUnderseat':
      return { route: 'underseatTwin', side: 'right', can: 'tri', canLength: 0.3, canDia: 0.085, canFinish: 'steel', headerFinish: 'steel' };
    case 'dualChrome':
      return { route: 'dualSide', side: 'both', can: layout === 'V2_45' ? 'round' : 'megaphone', canLength: 0.55, canDia: 0.1, canFinish: 'chrome', headerFinish: 'chrome' };
    case 'peashooter':
      return { route: 'peashooter', side: 'both', can: 'round', canLength: 0.5, canDia: 0.08, canFinish: 'chrome', headerFinish: 'chrome' };
    case 'organ':
      return { route: 'sideCan', side: 'right', can: 'tri', canLength: 0.36, canDia: 0.11, canFinish: 'titanium', headerFinish: 'titanium' };
    case 'scooter':
      return { route: 'scooter', side: 'right', can: 'oval', canLength: 0.3, canDia: 0.1, canFinish: 'black', headerFinish: 'black' };
    case 'none':
      return { route: 'none', side: 'right', can: 'round', canLength: 0, canDia: 0, canFinish: 'black', headerFinish: 'black' };
    default:
      return { route: 'sideCan', side: 'right', can: spec.style === 'sport' || spec.style === 'hyper' ? 'hex' : 'oval', canLength: 0.38, canDia: 0.11, canFinish: premium ? 'titanium' : 'steel', headerFinish: premium ? 'titanium' : 'steel' };
  }
}

function defaultTilt(layout: EngineLayout, style: BikeStyle): number {
  switch (layout) {
    case 'L2':
      return 21;
    case 'V4':
      return 42;
    case 'V4A':
      return 35;
    case 'V2_45':
      return 67.5;
    case 'V2_60':
      return 60;
    case 'V2_75':
      return 52.5;
    case 'SINGLE':
      return style === 'classic' ? 8 : 25;
    default:
      return style === 'sport' || style === 'hyper' ? 30 : style === 'classic' || style === 'cruiser' ? 8 : 22;
  }
}

function dashFor(spec: BikeSpec): DashKind {
  const s = spec.style;
  if (s === 'classic') return 'analogTwin';
  if (s === 'cruiser') return spec.brand === 'Harley-Davidson' ? 'harley' : 'tftRound';
  if (s === 'scooter') return 'scooter';
  if (s === 'touring') return 'tftWide';
  if (spec.price < 8000) return 'lcd';
  return 'tft';
}

export function autoBlueprint(spec: BikeSpec): BikeBlueprint {
  const k = spec.look;
  const style = spec.style;
  const lv = spec.liveries[0];
  const ex = new Set<string>(k.extras);
  const wire = k.wheel === 'spoke';
  const front = tyreFor(k.frontWheelR, k.frontTireW, preferredRim(style, k.frontWheelR, true, wire));
  const rear = tyreFor(k.rearWheelR, k.rearTireW, preferredRim(style, k.rearWheelR, false, wire));
  const fw = Number(front.split('/')[0]);
  const rw = Number(rear.split('/')[0]);
  const L = k.wheelbase;
  const rakeDeg = k.rake * DEG;
  const forkLength = FORK_LEN[style];
  const swingLen = Math.hypot(SWING_LEN[style], 0.1);
  const swingAngle = Math.atan2(0.1, SWING_LEN[style]) * DEG;
  // Approximate head (top of fork) for placing the rest of the hardpoints (ignores the small offset).
  const Rf = k.frontWheelR;
  const head: P3 = [0, Rf + Math.cos(k.rake) * forkLength, -L + Math.sin(k.rake) * forkLength];
  const pivot: P3 = [0, k.rearWheelR + 0.1, -SWING_LEN[style]];
  const seatFront = head[2] + (style === 'cruiser' || style === 'scooter' ? 0.62 : 0.5);
  const seatBack = seatFront + (style === 'touring' || style === 'cruiser' ? 0.55 : style === 'scooter' ? 0.62 : 0.45);
  const hipZ = seatFront + (style === 'sport' || style === 'hyper' ? 0.2 : 0.17);
  const grip: Record<BikeStyle, P3> = {
    sport: [0.34, -0.04, 0.12],
    hyper: [0.34, -0.03, 0.13],
    naked: [0.38, 0.11, 0.14],
    adventure: [0.42, 0.14, 0.12],
    touring: [0.38, 0.08, 0.26],
    cruiser: [0.42, 0.2, 0.3],
    classic: [0.38, 0.1, 0.16],
    scooter: [0.35, 0.1, 0.14],
  };
  let g = grip[style];
  if (k.handlebar === 'clipon') g = [0.34, -0.04, 0.12];
  if (k.handlebar === 'wide' && (style === 'touring' || style === 'cruiser')) g = [0.4, 0.12, 0.24];
  const pegs: Record<BikeStyle, P3> = {
    sport: [0.19, 0.4, hipZ + 0.02],
    hyper: [0.19, 0.39, hipZ + 0.02],
    naked: [0.19, 0.36, hipZ - 0.02],
    adventure: [0.2, 0.36, hipZ - 0.06],
    touring: [0.24, 0.32, hipZ - 0.14],
    cruiser: [0.3, 0.32, head[2] + 0.18],
    classic: [0.2, 0.32, hipZ - 0.12],
    scooter: [0.16, 0.28, hipZ - 0.42],
  };
  const torso: Record<BikeStyle, number> = { sport: 0.82, hyper: 0.78, naked: 0.42, adventure: 0.26, touring: 0.18, cruiser: -0.06, classic: 0.3, scooter: 0.12 };
  const layout = spec.engine.layout;
  const finned = style === 'classic' || (style === 'cruiser' && (layout === 'V2_45' || layout === 'BOXER' || layout === 'V2_60'));
  const crankZ = (pivot[2] + head[2]) / 2 - 0.02 + (layout === 'BOXER' ? -0.06 : 0);
  const base = style === 'cruiser' ? 0.28 : style === 'scooter' ? 0.22 : 0.3;
  const faired = k.fairing === 'full' || k.fairing === 'touring' || k.fairing === 'adventure';
  const bmwBoxer = layout === 'BOXER';
  const shaft = bmwBoxer || layout === 'I6' || layout === 'F6';
  const belt = layout === 'V2_45' || layout === 'V2_60' || layout === 'ELECTRIC';
  const ducatiV4 = spec.brand === 'Ducati' && layout === 'V4';
  const frameType: BikeBlueprint['frame']['type'] =
    style === 'scooter' ? 'scooter' : bmwBoxer ? 'boxer' : ex.has('trellis') ? 'trellis' : ducatiV4 ? 'monocoque' : style === 'cruiser' || style === 'classic' ? 'cradle' : style === 'adventure' ? 'trellis' : 'twinSpar';
  const swingType: BikeBlueprint['swingarm']['type'] =
    style === 'scooter' ? 'scooter' : shaft ? 'shaft' : ex.has('singleSided') ? 'singleSided' : style === 'cruiser' || style === 'classic' ? 'tubular' : style === 'sport' || style === 'hyper' ? 'braced' : 'box';
  const frameAlu = frameType === 'twinSpar' || frameType === 'monocoque';
  const frameColor = frameAlu && lv.frame === '#1b1c1f' ? '#8d939b' : lv.frame;
  const sportish = style === 'sport' || style === 'hyper';
  const cockpitFaired = k.fairing === 'full' || k.fairing === 'touring';
  const dashPos: P3 = cockpitFaired ? [0, head[1] + 0.1, head[2] - 0.02] : [0, head[1] + 0.1, head[2] + 0.03];
  return {
    id: spec.id,
    source: 'auto',
    wheelbase: L,
    rakeDeg,
    trail: TRAIL[style],
    forkLength,
    front: { tyre: front, rimWidthIn: rimFor(fw), crown: sportish ? 0.85 : 1.05, tread: treadFor(style, wire), tyreLabel: sportish ? 'Sport Radial' : style === 'adventure' ? 'Trail Attack' : 'Road Tour' },
    rear: { tyre: rear, rimWidthIn: rimFor(rw), crown: sportish ? 0.95 : 1.1, tread: treadFor(style, wire), tyreLabel: sportish ? 'Sport Radial' : style === 'adventure' ? 'Trail Attack' : 'Road Tour' },
    frontWheel: wheelDesign(spec, lv.wheel, true),
    rearWheel: wheelDesign(spec, lv.wheel, false),
    fork: {
      type: bmwBoxer && style === 'adventure' ? 'telelever' : style === 'cruiser' || style === 'classic' || style === 'scooter' || (style === 'touring' && !sportish) ? 'rwu' : 'usd',
      stanchion: style === 'scooter' ? 0.033 : style === 'classic' ? 0.041 : 0.043,
      spacing: style === 'cruiser' || style === 'touring' ? 0.24 : style === 'scooter' ? 0.17 : 0.205,
      outerColor: sportish ? '#c9a227' : '#2a2c30',
      innerColor: sportish ? '#d8b25a' : '#e6e8eb',
      footColor: '#2a2c30',
      capColor: '#2a2c30',
      adjusterColor: '#c9a227',
      gaiters: style === 'classic' && spec.brand === 'Royal Enfield',
    },
    frontBrake: {
      discs: style === 'classic' || style === 'scooter' ? 1 : 2,
      discDia: sportish ? 0.32 : style === 'scooter' ? 0.267 : 0.3,
      disc: sportish ? 'floating' : style === 'adventure' ? 'wave' : 'semiFloating',
      carrierColor: sportish ? '#c9a227' : '#2a2c30',
      caliper: sportish || spec.price > 14000 ? 'radialMono4' : style === 'classic' || style === 'scooter' ? 'axial2' : 'radial4',
      caliperColor: sportish ? '#b3121b' : '#2a2c30',
      caliperText: sportish || spec.price > 14000 ? 'brembo' : undefined,
      caliperTextColor: '#f2f2f2',
    },
    rearBrake: { discs: 1, discDia: style === 'cruiser' || style === 'touring' ? 0.292 : 0.22, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#2a2c30' },
    frame: { type: frameType, color: frameColor, metal: frameAlu ? 0.85 : 0.3, rough: frameAlu ? 0.38 : 0.4, subframe: style === 'scooter' ? 'integrated' : frameType === 'trellis' ? 'trellis' : 'tubular', subframeColor: '#1c1d20', width: frameType === 'twinSpar' ? 0.38 : 0.34 },
    swingarm: { type: swingType, length: swingLen, angleDeg: swingAngle, side: shaft ? 'right' : 'left', color: frameAlu ? '#8d939b' : '#1c1d20', metal: frameAlu ? 0.85 : 0.3, rough: 0.4 },
    shock: { layout: style === 'cruiser' && layout === 'V2_45' ? 'none' : style === 'classic' || (style === 'cruiser' && spec.brand !== 'Harley-Davidson' && spec.brand !== 'Indian') ? 'twin' : 'mono', springColor: sportish ? '#c9a227' : '#b3121b', bodyColor: '#2a2c30', reservoir: sportish },
    drive: { type: style === 'scooter' ? 'none' : shaft ? 'shaft' : belt ? 'belt' : 'chain', side: belt && layout === 'V2_45' ? 'right' : 'left', frontTeeth: 16, rearTeeth: belt ? 66 : 42, pitch: 0.015875, sprocketColor: sportish ? '#c9a227' : '#2a2c30' },
    engine: {
      layout,
      cc: spec.engine.cc,
      crank: [0, base + 0.1, crankZ],
      tiltDeg: defaultTilt(layout, style),
      caseColor: finned ? '#9ea3a9' : '#2a2c30',
      coverColor: finned ? '#c4c8cd' : '#3a3d42',
      headColor: finned ? '#9ea3a9' : '#2a2c30',
      camCoverColor: spec.brand === 'Kawasaki' ? '#1b1c1f' : spec.brand === 'Honda' ? '#b3121b' : '#3a3d42',
      camCoverText: spec.brand.toUpperCase(),
      finned,
      liquidCooled: !finned && layout !== 'ELECTRIC',
      supercharger: spec.engine.supercharged,
    },
    exhaust: exhaustFor(spec),
    cockpit: {
      bars: k.handlebar === 'clipon' ? 'clipon' : k.handlebar === 'tall' ? 'tall' : k.handlebar === 'cruiser' ? 'cruiser' : k.handlebar === 'scooter' ? 'scooter' : 'tubular',
      grip: [g[0], head[1] + g[1], head[2] + g[2]],
      barDia: k.handlebar === 'clipon' ? 0.022 : style === 'cruiser' || style === 'touring' ? 0.0254 : 0.0286 * 0.85,
      dash: dashFor(spec),
      dashPos,
      dashSize: style === 'touring' ? [0.2, 0.11] : style === 'classic' || style === 'cruiser' ? [0.1, 0.1] : [0.13, 0.075],
      dashTiltDeg: cockpitFaired ? 52 : 40,
      dashMount: cockpitFaired ? 'fairing' : 'bars',
      mirrors: k.fairing === 'full' || k.fairing === 'touring' ? 'fairing' : style === 'scooter' ? 'bar' : 'bar',
      mirrorPos: k.fairing === 'full' || k.fairing === 'touring' ? [0.31, head[1] + 0.06, head[2] - 0.1] : [g[0] - 0.02, head[1] + g[1] + 0.17, head[2] + g[2] - 0.05],
      mirrorSize: style === 'touring' ? [0.17, 0.09] : [0.13, 0.065],
      mirrorIndicators: sportish,
      topClamp: sportish ? 'milled' : 'cast',
      steeringDamper: sportish ? 'top' : 'none',
      leverColor: sportish ? '#2a2c30' : '#9ea3a9',
      reservoirs: style !== 'classic' && style !== 'scooter',
      clutch: sportish ? 'hydraulic' : 'cable',
      ignition: faired ? 'tank' : 'clamp',
    },
    lights: { head: (k.headlight as BikeBlueprint['lights']['head']) ?? 'round', tail: 'strip', rearIndicators: 'stalk' },
    seat: { height: k.seatH, front: seatFront, back: seatBack, pillion: sportish ? 'cowl' : 'seat', color: lv.seat },
    rider: { hip: [0, k.seatH + 0.09, hipZ], peg: pegs[style], torsoPitch: torso[style] },
    footrests: style === 'scooter' ? 'scooter' : sportish ? 'rearset' : style === 'cruiser' && (spec.brand === 'Harley-Davidson' || spec.brand === 'Indian') ? 'floorboard' : style === 'touring' && spec.brand === 'Harley-Davidson' ? 'floorboard' : 'peg',
    plate: {
      mount: style === 'cruiser' || style === 'classic' ? 'fender' : 'hanger',
      pos: style === 'cruiser' || style === 'classic' ? [0, k.rearWheelR + 0.28, k.rearWheelR * 0.95] : [0, k.seatH - 0.2, seatBack + 0.3],
      tiltDeg: style === 'cruiser' || style === 'classic' ? -20 : -12,
    },
    body: genericBody,
    livery: genericLivery,
    groundClearance: style === 'adventure' ? 0.22 : style === 'cruiser' ? 0.12 : 0.13,
    features: [...k.extras],
  };
}

