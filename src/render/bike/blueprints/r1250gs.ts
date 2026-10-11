import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, RY, T, mul, type KitContext } from '../context';
import { bodyQ, buildSeat, buildTank, PAINT, screen, seatFinish, shell } from '../kit/body';
import { lamp, ledStrip } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, roundBox, smooth2, sweep, tube, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import type { BikeBlueprint } from '../types';

/**
 * BMW R 1250 GS (2019–2023).
 * Spec sheet: wheelbase 1525 mm, steering head 64.3° (rake 25.7°), trail 100.6 mm,
 * seat 850 mm, L×W×H 2207 × 953 × 1430 mm, 120/70R19 + 170/60R17 on cross-spoke
 * tubeless wheels, Telelever front (A-arm + central shock), Paralever single-sided
 * swingarm with shaft drive on the right, 1254 cc ShiftCam boxer whose cylinder
 * heads stick out in front of the rider's boots.
 * Design cues: the "beak" (high frame-mounted fender) under the LED headlight, tall
 * adjustable screen, tank with big radiator side panels, split seat with luggage
 * rack, hand guards, engine guards, upswept right-side silencer, GS Trophy colours.
 */

function shroud(): OutlineBody {
  // Tank side panel / radiator shroud (right half): from the headlight mask back over the tank flank.
  return {
    zs: stationsBetween(-1.32, -0.84, 9, 0.4),
    top: curve([[-1.32, 1.04], [-1.15, 1.06], [-0.98, 1.06], [-0.84, 1.03]]),
    bottom: curve([[-1.32, 0.78], [-1.2, 0.68], [-1.05, 0.66], [-0.9, 0.74], [-0.84, 0.8]]),
    half: curve([[-1.32, 0.2], [-1.2, 0.26], [-1.05, 0.27], [-0.9, 0.245], [-0.84, 0.22]]),
    sections: [{ z: 0, pts: [[0.62, 1], [0.84, 0.94], [0.97, 0.78], [1, 0.52], [0.97, 0.24], [0.9, 0]] }],
  };
}

function body(ctx: KitContext): void {
  const hp = ctx.hp;
  const blackPl = F.texturedBlack;
  // ── Beak: high fender fixed to the front frame, pointing down/forward over the wheel ──
  const beak: OutlineBody = {
    zs: stationsBetween(-1.8, -1.32, 9, 0.4),
    top: curve([[-1.8, 0.74], [-1.7, 0.8], [-1.56, 0.87], [-1.44, 0.92], [-1.32, 0.95]]),
    bottom: curve([[-1.8, 0.725], [-1.7, 0.75], [-1.56, 0.8], [-1.44, 0.84], [-1.32, 0.86]]),
    half: curve([[-1.8, 0.03], [-1.7, 0.075], [-1.56, 0.11], [-1.44, 0.13], [-1.32, 0.14]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.97], [0.85, 0.82], [1, 0.5], [0.98, 0.2], [0.94, 0]] }],
  };
  shell(ctx, 'chassis', outlineLoft(beak, { ...bodyQ(ctx, 1.1), capFront: true }), PAINT, 0.006);
  // ── Headlight mask: the LED unit with its DRL ring, flanked by black mask panels ──
  const mask: OutlineBody = {
    zs: stationsBetween(-1.4, -1.22, 6, 0.3),
    top: curve([[-1.4, 1.1], [-1.3, 1.13], [-1.22, 1.14]]),
    bottom: curve([[-1.4, 0.9], [-1.3, 0.88], [-1.22, 0.88]]),
    half: curve([[-1.4, 0.14], [-1.3, 0.19], [-1.22, 0.2]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.98], [0.92, 0.85], [1, 0.55], [0.95, 0.2], [0.8, 0], [0, 0]] }],
  };
  shell(ctx, 'chassis', outlineLoft(mask, { ...bodyQ(ctx), capFront: true }), blackPl, 0.008);
  const head: P2[] = smooth2([[-0.085, -0.055], [0.0, -0.07], [0.085, -0.055], [0.1, 0.02], [0.06, 0.07], [-0.06, 0.07], [-0.1, 0.02]], 3, true);
  lamp(ctx, 'chassis', head, mul(T(0, 1.0, -1.408), RY(Math.PI), RX(0.12)), { kind: 'head', inner: 'led', count: 3, depth: 0.06, rim: 0.004 });
  // DRL: a ring around the headlight with a central horizontal bar.
  const ring: P3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ring.push([Math.cos(a) * 0.105, 1.0 + Math.sin(a) * 0.078, -1.412 - 0.004 * Math.abs(Math.cos(a))]);
  }
  ledStrip(ctx, 'chassis', ring, 0.006, 0.004, 'drl', [0, 0, -1]);
  // Tall adjustable screen on its frame.
  screen(ctx, 'chassis', {
    zs: stationsBetween(-1.32, -1.06, 7, 0.3),
    top: curve([[-1.32, 1.14], [-1.24, 1.27], [-1.14, 1.38], [-1.08, 1.42], [-1.06, 1.425]]),
    bottom: curve([[-1.32, 1.11], [-1.06, 1.16]]),
    half: curve([[-1.32, 0.17], [-1.2, 0.2], [-1.06, 0.18]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.985], [0.85, 0.93], [1, 0.75], [1, 0.4], [1, 0]] }],
  }, tint(F.screen, '#56616b'));
  for (const s of [-1, 1]) ctx.add('chassis', tube([[s * 0.13, 1.12, -1.25], [s * 0.15, 1.2, -1.16], [s * 0.15, 1.28, -1.1]], 0.007, 8, 4), F.darkAlu);
  // ── Tank and the big side panels (radiator shrouds) ──
  buildTank(ctx, {
    front: -1.2,
    back: -0.76,
    top: 1.08,
    bottomFront: 0.9,
    bottomBack: 0.86,
    width: 0.42,
    style: 'adventure',
    knee: 0.1,
    capZ: -1.0,
    topLine: [[-1.2, 1.02], [-1.1, 1.06], [-0.98, 1.08], [-0.86, 1.07], [-0.79, 1.02], [-0.76, 0.97]],
    bottomLine: [[-1.2, 0.92], [-1.0, 0.9], [-0.76, 0.88]],
    halfLine: [[-1.2, 0.14], [-1.08, 0.19], [-0.95, 0.2], [-0.82, 0.18], [-0.76, 0.14]],
  });
  const sh = outlineLoft(shroud(), { ...bodyQ(ctx, 1.2), mirror: false });
  shell(ctx, 'chassis', sh, PAINT, 0.01);
  shell(ctx, 'chassis', sh.mirrored(), PAINT, 0.01);
  // Black lower air deflectors under the shrouds
  for (const s of [-1, 1]) {
    const d: P2[] = smooth2([[-1.28, 0.78], [-1.12, 0.7], [-1.0, 0.68], [-0.98, 0.62], [-1.16, 0.6], [-1.3, 0.7]], 3, true);
    ctx.add('chassis', extrude(d, 0.012, { plane: 'zy', center: s * 0.265, bevel: 0.003, curveSegs: 1 }), blackPl);
  }
  // ── Split seat, luggage rack, rear light, hugger/plate ──
  buildSeat(ctx, { front: -0.8, back: -0.42, yFront: 0.86, y: 0.85, yBack: 0.88, width: 0.32, thick: 0.08, frontWidth: 0.22 });
  buildSeat(ctx, { front: -0.41, back: -0.06, yFront: 0.905, y: 0.915, yBack: 0.93, width: 0.3, thick: 0.07, frontWidth: 0.26 }, tint(seatFinish(ctx), '#1a1a1a'));
  const tail: OutlineBody = {
    zs: stationsBetween(-0.78, 0.12, 9, 0.4),
    top: curve([[-0.78, 0.83], [-0.4, 0.86], [-0.05, 0.89], [0.12, 0.9]]),
    bottom: curve([[-0.78, 0.7], [-0.4, 0.72], [0.0, 0.78], [0.12, 0.82]]),
    half: curve([[-0.78, 0.15], [-0.4, 0.15], [0.0, 0.13], [0.12, 0.1]]),
    sections: [{ z: 0, pts: [[0.7, 1], [0.95, 0.9], [1, 0.6], [0.95, 0.25], [0.8, 0.0]] }],
  };
  const tm = outlineLoft(tail, { ...bodyQ(ctx), mirror: false });
  shell(ctx, 'chassis', tm, blackPl, 0.006);
  shell(ctx, 'chassis', tm.mirrored(), blackPl, 0.006);
  // Aluminium luggage rack with tie-down slots
  ctx.add('chassis', roundBox(0.24, 0.012, 0.3, 0.01, 2), F.brushedAlu, T(0, 0.93, -0.0));
  for (const s of [-1, 1]) ctx.add('chassis', tube([[s * 0.12, 0.925, -0.16], [s * 0.15, 0.9, 0.0], [s * 0.12, 0.92, 0.15]], 0.008, 8, 4), F.darkAlu);
  const tl: P2[] = smooth2([[-0.06, -0.02], [0.06, -0.02], [0.065, 0.02], [-0.065, 0.02]], 3, true);
  lamp(ctx, 'chassis', tl, mul(T(0, 0.86, 0.128), RX(-0.2)), { kind: 'tail', inner: 'led', count: 3, depth: 0.03, lensSmoked: true });
  // Hand guards on the bars (steering group).
  for (const s of [-1, 1]) {
    const g = hp.grip;
    const hgPath: P3[] = [[s * (Math.abs(g[0]) - 0.13), g[1] + 0.02, g[2] - 0.02], [s * (Math.abs(g[0]) - 0.04), g[1] + 0.035, g[2] - 0.09], [s * (Math.abs(g[0]) + 0.06), g[1] + 0.01, g[2] - 0.06], [s * (Math.abs(g[0]) + 0.075), g[1] - 0.01, g[2]]];
    const guard = sweep(hgPath, smooth2([[0.0, -0.045], [0.012, -0.04], [0.016, 0.0], [0.012, 0.035], [0.0, 0.04], [-0.004, 0.0]], 2, true), { up: [0, 1, 0], capStart: true, capEnd: true });
    ctx.add('steer', guard, blackPl);
  }
  // Engine guards (crash bars) wrapping the cylinder heads.
  const bar = hard('#26282c', 0.6, 0.4, 0.4);
  for (const s of [-1, 1]) {
    ctx.add('chassis', tube([[s * 0.18, 0.76, -1.2], [s * 0.4, 0.62, -1.18], [s * 0.47, 0.44, -1.1], [s * 0.42, 0.3, -0.98], [s * 0.2, 0.22, -0.9]], 0.0125, ctx.seg(14, 6), 8), bar);
    ctx.add('chassis', tube([[s * 0.42, 0.62, -1.12], [s * 0.48, 0.5, -0.96], [s * 0.4, 0.42, -0.82]], 0.011, ctx.seg(10, 5), 6), bar);
  }
  plateHanger(ctx, { fromZ: 0.02, fromY: 0.74 });
}

const GS_BLUE = '#1c69d4';
const GS_DARK = '#16307a';
const GS_RED = '#d1001f';

function lettering(p: Pen, color: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('GS', -1.1, 0.92, { color, size: 0.07, weight: '900', italic: true });
  p.text('R 1250', -0.62, 0.79, { color, size: 0.02, weight: '700' });
}

function livery(c: LiveryCanvas, _lv: Livery, env: LiveryEnv): void {
  const black = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (black) {
      p.fill('#1b1c1f', 'metallic');
      lettering(p, '#9aa3ad');
      return;
    }
    // GS Trophy: Light White with Racing Blue / dark blue / red flashes on the shrouds and beak.
    p.fill('#f1f2f3', 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.34, 0.8], [-1.1, 1.08], [-0.92, 1.08], [-1.08, 0.66], [-1.34, 0.7]], GS_BLUE, 'metallic');
      p.poly([[-1.06, 0.66], [-0.9, 1.08], [-0.86, 1.08], [-1.0, 0.66]], GS_DARK);
      p.poly([[-0.98, 0.66], [-0.84, 1.05], [-0.82, 1.03], [-0.94, 0.66]], GS_RED);
      p.poly([[-1.82, 0.7], [-1.5, 0.9], [-1.32, 0.97], [-1.32, 0.86], [-1.6, 0.77], [-1.82, 0.7]], GS_BLUE, 'metallic');
      lettering(p, '#ffffff');
    } else if (p.view === 'top') {
      p.rect(-1.82, -0.02, -1.32, 0.02, GS_RED);
    }
  });
}

export function r1250gsBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.207, 0.953, 1.43],
    wheelbase: 1.525,
    rakeDeg: 25.7,
    trail: 0.1006,
    forkLength: 0.8,
    front: { tyre: '120/70R19', rimWidthIn: 3.0, crown: 1.1, tread: 'dual', tyreLabel: 'Trail Attack' },
    rear: { tyre: '170/60R17', rimWidthIn: 4.5, crown: 1.1, tread: 'dual', tyreLabel: 'Trail Attack' },
    frontWheel: { type: 'wire', spokes: 40, shape: 'straight', color: '#c9ccd2', crossSpoke: true, rimColor: spec.liveries[0].wheel },
    rearWheel: { type: 'wire', spokes: 40, shape: 'straight', color: '#c9ccd2', crossSpoke: true, rimColor: spec.liveries[0].wheel },
    fork: { type: 'telelever', stanchion: 0.037, spacing: 0.2, outerColor: '#2a2c30', innerColor: '#c9ccd2', footColor: '#2a2c30', capColor: '#2a2c30', aboveClamp: 0.0, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.305, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radial4', caliperColor: '#2a2c30', caliperText: 'BMW', caliperTextColor: '#d6d8dc', caliperAngleDeg: 76 },
    rearBrake: { discs: 1, discDia: 0.276, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2a2c30', caliperAngleDeg: 205 },
    frame: { type: 'boxer', color: '#3a3d42', metal: 0.4, rough: 0.4, subframe: 'tubular', subframeColor: '#2a2c30', width: 0.3 },
    swingarm: { type: 'shaft', length: 0.62, angleDeg: 8, side: 'right', color: '#9aa0a7', metal: 0.85, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#c9ccd2', bodyColor: '#2a2c30', reservoir: true },
    drive: { type: 'shaft', side: 'right', frontTeeth: 1, rearTeeth: 1, sprocketColor: '#2a2c30' },
    engine: {
      layout: 'BOXER',
      cc: 1254,
      crank: [0, 0.43, -0.95],
      tiltDeg: 0,
      caseColor: '#2a2c30',
      coverColor: '#9aa0a7',
      headColor: '#9aa0a7',
      camCoverColor: '#c9ccd2',
      camCoverText: 'ShiftCam',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.2, h: 0.26, z: -1.2, y: 0.76, tiltDeg: 10, side: true },
      width: 0.36,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'hex', canLength: 0.42, canDia: 0.12, canFinish: 'steel', headerFinish: 'steel', outlet: [0.21, 0.62, 0.06] },
    cockpit: {
      bars: 'tubular',
      grip: [0.42, 1.17, -0.99],
      barDia: 0.0254,
      dash: 'tftBmw',
      dashPos: [0, 1.17, -1.2],
      dashSize: [0.15, 0.09],
      dashTiltDeg: 35,
      dashMount: 'fairing',
      mirrors: 'bar',
      mirrorPos: [0.34, 1.34, -1.04],
      mirrorSize: [0.12, 0.08],
      mirrorIndicators: false,
      mirrorShape: 'rect',
      mirrorColor: '#1b1c1f',
      topClamp: 'riser',
      steeringDamper: 'none',
      leverColor: '#9aa0a7',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'beak', tail: 'compact', rearIndicators: 'stalk' },
    seat: { height: 0.85, front: -0.8, back: -0.42, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.95, -0.6], peg: [0.22, 0.4, -0.68], torsoPitch: 0.22 },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.32], tiltDeg: -10 },
    body,
    livery,
    groundClearance: 0.2,
    features: ['crashbars', 'windscreenTall'],
    zones: { splitY: 0.5, decal: [-1.1, 0.92] },
  };
}
