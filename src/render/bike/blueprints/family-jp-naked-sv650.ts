import type { BikeSpec, Livery } from '../../../data/bikes';
import type { KitContext } from '../context';
import { addPanel, buildSeat, buildTank, frontFender, PAINT, seatFinish } from '../kit/body';
import { tailLamp, undertray } from '../kit/jp-sport-parts';
import { indicatorPod, roundHeadlight } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, smooth2, type P2 } from '../mesh';
import { F, hard, tint } from '../sink';
import { fAnd, fNot, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { forkBrackets, loftPart, panelPair, steerDir } from './family-jp-naked-parts';

/**
 * Suzuki SV650 (2017–2024).
 * Spec sheet: wheelbase 1445 mm, caster 25°, trail 106 mm, seat 785 mm,
 * L×W×H 2140 × 760 × 1090 mm, ground clearance 135 mm, 120/70ZR17 + 160/60ZR17 on
 * 3.50/4.50 cast wheels, 41 mm conventional fork, twin 290 mm discs with two-piston
 * Tokico calipers, steel pipe trellis frame, 645 cc 90° V-twin.
 * Design cues: a simple, honest naked: one round headlight with a small black visor and
 * the LCD above it, a slim sculpted tank with small radiator side covers, the trellis
 * frame (blue on the white bike) and the exposed V-twin with its front cylinder leaning
 * forward, both headers running under the engine to the side silencer that rises under
 * the pillion seat, a short tail with the LED light, a one-piece bar.
 */

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.66, 0.04, 12, 0.5),
    top: curve([[-0.66, 0.77], [-0.46, 0.78], [-0.3, 0.8], [-0.26, 0.85], [-0.1, 0.885], [0.0, 0.905], [0.04, 0.91]]),
    bottom: curve([[-0.66, 0.64], [-0.4, 0.67], [-0.16, 0.73], [-0.02, 0.81], [0.04, 0.86]]),
    half: curve([[-0.66, 0.14], [-0.46, 0.136], [-0.24, 0.115], [-0.05, 0.085], [0.04, 0.05]]),
    sections: [
      { z: -0.66, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.04, pts: [[0, 1], [0.74, 0.97], [1, 0.72], [0.98, 0.44], [0.84, 0.2], [0.42, 0.02], [0, 0]] },
    ],
  };
}

/** Small black radiator side cover on each side of the radiator. */
function radiatorCover(): OutlineBody {
  return {
    zs: stationsBetween(-1.21, -1.0, 7, 0.4),
    top: curve([[-1.21, 0.72], [-1.1, 0.75], [-1.02, 0.76]]),
    bottom: curve([[-1.21, 0.62], [-1.1, 0.57], [-1.02, 0.6]]),
    half: curve([[-1.21, 0.17], [-1.1, 0.19], [-1.02, 0.18]]),
    sections: [{ z: 0, pts: [[0.7, 1], [0.92, 0.88], [1, 0.6], [0.97, 0.28], [0.9, 0]] }],
  };
}

/** Round headlight in its fork ears, the small visor, front indicators. */
function headUnit(ctx: KitContext): void {
  const zc = -0.15, yc = -0.25;
  const at = ctx.fromSteer([0, yc, zc]);
  roundHeadlight(ctx, 'steer', at, 0.086, steerDir(ctx, [0, -0.38, -1]), { led: false });
  // Small black visor over the headlight (carries the LCD behind it).
  const visor: OutlineBody = {
    zs: stationsBetween(zc - 0.075, zc + 0.04, 6, 0.3),
    top: curve([[zc - 0.075, yc + 0.098], [zc - 0.02, yc + 0.125], [zc + 0.04, yc + 0.138]]),
    bottom: curve([[zc - 0.075, yc + 0.055], [zc + 0.04, yc + 0.07]]),
    half: curve([[zc - 0.075, 0.084], [zc - 0.02, 0.098], [zc + 0.04, 0.09]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.97], [0.95, 0.75], [1, 0.3], [0.96, 0]] }],
  };
  loftPart(ctx, visor, hard('#141517', 0.15, 0.4, 0.6), { steer: true, depth: 0.005, q: 0.8 });
  // Headlight ears: pressed brackets from the fork tubes to the bucket sides.
  const half = ctx.bp.fork.spacing / 2;
  for (const s of [-1, 1]) {
    const ear: P2[] = smooth2([[yc + 0.045, -0.02], [yc + 0.06, 0.06], [yc - 0.03, 0.07], [yc - 0.06, 0.0], [yc - 0.02, -0.03]], 2, true);
    ctx.add('steer', extrude(ear.map(([y, z]) => [zc + z * 0.9 + 0.06, y] as P2), 0.006, { plane: 'zy', center: s * (half - 0.012), bevel: 0.002 }), F.texturedBlack, ctx.steerM);
    indicatorPod(ctx, 'steer', ctx.fromSteer([s * (half + 0.01), yc + 0.02, zc + 0.05]), ctx.fromSteer([s * (half + 0.085), yc + 0.025, zc + 0.03]), 0.012);
  }
  forkBrackets(ctx, [-0.215], zc + 0.06, 0.05);
}

function body(ctx: KitContext): void {
  headUnit(ctx);
  panelPair(ctx, radiatorCover(), F.texturedBlack, { depth: 0.008, q: 1 });
  // ── Slim sculpted tank with its painted side covers ──
  buildTank(ctx, {
    front: -1.06,
    back: -0.62,
    top: 1.04,
    bottomFront: 0.85,
    bottomBack: 0.79,
    width: 0.37,
    style: 'sport',
    knee: 0.16,
    capZ: -0.92,
    topLine: [[-1.06, 0.95], [-1.0, 1.0], [-0.92, 1.035], [-0.82, 1.04], [-0.73, 1.015], [-0.66, 0.95], [-0.62, 0.88]],
    bottomLine: [[-1.06, 0.85], [-0.86, 0.81], [-0.62, 0.79]],
    halfLine: [[-1.06, 0.1], [-0.99, 0.162], [-0.9, 0.185], [-0.8, 0.178], [-0.7, 0.14], [-0.62, 0.1]],
  });
  // Tank side panels: the sculpted wings under the tank flanks that hide the airbox.
  const wing: OutlineBody = {
    zs: stationsBetween(-1.08, -0.72, 9, 0.4),
    top: curve([[-1.08, 0.88], [-0.98, 0.9], [-0.86, 0.89], [-0.76, 0.86], [-0.72, 0.84]]),
    bottom: curve([[-1.08, 0.82], [-1.0, 0.74], [-0.9, 0.7], [-0.8, 0.72], [-0.72, 0.76]]),
    half: curve([[-1.08, 0.16], [-0.98, 0.2], [-0.86, 0.205], [-0.76, 0.18], [-0.72, 0.16]]),
    sections: [{ z: 0, pts: [[0.62, 1], [0.86, 0.95], [0.98, 0.75], [1, 0.45], [0.96, 0.15], [0.88, 0]] }],
  };
  panelPair(ctx, wing, PAINT, { creases: [2], depth: 0.008 });
  // ── Seat, tail, undertray, light ──
  buildSeat(ctx, { front: -0.64, back: -0.3, yFront: 0.8, y: 0.785, yBack: 0.81, width: 0.3, thick: 0.075, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.29, back: -0.03, yFront: 0.855, y: 0.865, yBack: 0.88, width: 0.22, thick: 0.05, frontWidth: 0.18 }, tint(seatFinish(ctx), '#18191b'));
  const tm = outlineLoft(tail(), { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    sideRegion([[-0.85, 0.765], [-0.29, 0.765], [-0.28, 0.84], [0.0, 0.84], [0.0, 1.4], [-0.85, 1.4]]),
    planRegion([[-0.85, -0.01], [0.01, -0.01], [0.01, 0.115], [-0.28, 0.115], [-0.29, 0.15], [-0.85, 0.15]]),
  );
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  undertray(ctx, { z0: -0.5, z1: 0.03, top0: 0.7, top1: 0.87, bot0: 0.64, botMid: 0.7, bot1: 0.84, w0: 0.13, w1: 0.05 });
  tailLamp(ctx, smooth2([[-0.055, -0.014], [0.055, -0.014], [0.06, 0.012], [0.0, 0.018], [-0.06, 0.012]], 4, true), [0, 0.875, 0.045], -0.25, { count: 1 });
  frontFender(ctx, { from: -0.45, to: 0.82, gap: 0.02, width: 0.15, f: PAINT });
  hugger(ctx, F.texturedBlack);
  plateHanger(ctx, { fromZ: -0.05, fromY: 0.76 });
}

// ───────────────────────────── livery ─────────────────────────────

const SUZUKI_BLUE = '#1747a6';

function lettering(p: Pen, main: string, accent: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('SV650', -0.86, 0.805, { color: accent, size: 0.042, weight: '900', italic: true, stretch: 1.1 });
  p.text('ABS', -0.75, 0.765, { color: main, size: 0.012, weight: '800' });
  p.text('SUZUKI', -0.86, 0.95, { color: accent, size: 0.022, weight: '900', spacing: 0.04 });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const black = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (black) {
      // Glass Sparkle Black with red pinstripes and grey lettering.
      p.fill(lv.primary, 'metallic');
      if (p.view === 'right' || p.view === 'left') {
        p.line([[-1.06, 0.83], [-0.86, 0.79], [-0.72, 0.8]], lv.accent, 0.004);
        lettering(p, '#9aa0a8', lv.accent);
      }
      return;
    }
    // Pearl Glacier White with a blue/black wing flash and blue lettering.
    p.fill(lv.primary, 'pearl');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.1, 0.74], [-0.9, 0.69], [-0.7, 0.74], [-0.7, 0.78], [-0.9, 0.76], [-1.08, 0.8]], lv.secondary, 'gloss');
      p.line([[-1.08, 0.82], [-0.9, 0.785], [-0.72, 0.8]], SUZUKI_BLUE, 0.005);
      p.poly([[-0.5, 0.67], [-0.1, 0.75], [0.05, 0.84], [0.05, 0.8], [-0.1, 0.72], [-0.5, 0.65]], SUZUKI_BLUE);
      lettering(p, '#1b1c1f', SUZUKI_BLUE);
    }
  });
}

export function sv650Blueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.14, 0.76, 1.09],
    wheelbase: 1.445,
    rakeDeg: 25,
    trail: 0.106,
    forkLength: 0.71,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.95, tread: 'sport', tyreLabel: 'Sport Touring' },
    rear: { tyre: '160/60ZR17', rimWidthIn: 4.5, crown: 1.05, tread: 'sport', tyreLabel: 'Sport Touring' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'twin', color: lv.wheel, liveryColor: true },
    rearWheel: { type: 'cast', spokes: 5, shape: 'twin', color: lv.wheel, liveryColor: true },
    fork: { type: 'rwu', stanchion: 0.041, spacing: 0.2, outerColor: '#26282c', innerColor: '#d9dce0', footColor: '#26282c', capColor: '#1c1d20', aboveClamp: 0.03, clampGap: 0.17 },
    frontBrake: { discs: 2, discDia: 0.29, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: '#2c2e33', caliperAngleDeg: 70 },
    rearBrake: { discs: 1, discDia: 0.24, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: '#2c2e33', caliperAngleDeg: 200 },
    // Steel pipe trellis; its colour follows the livery (Suzuki blue on the white bike).
    frame: { type: 'trellis', color: lv.frame, metal: 0.35, rough: 0.38, subframe: 'tubular', subframeColor: '#1d1e21', width: 0.29, liveryColor: true },
    swingarm: { type: 'box', length: 0.58, angleDeg: 10, color: '#3a3d42', metal: 0.7, rough: 0.4 },
    shock: { layout: 'mono', springColor: '#2b2d31', bodyColor: '#1d1e21', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 46, pitch: 0.015875, sprocketColor: '#1e1f22' },
    engine: {
      layout: 'L2',
      cc: 645,
      crank: [0, 0.37, -0.76],
      tiltDeg: 35,
      caseColor: '#1c1d20',
      coverColor: '#2c2e33',
      headColor: '#34373c',
      camCoverColor: '#5d6168',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.32, h: 0.26, z: -1.17, y: 0.57, tiltDeg: 10, curved: true },
      width: 0.3,
    },
    exhaust: { route: 'sideCan', side: 'right', can: 'tri', canLength: 0.36, canDia: 0.115, canFinish: 'black', headerFinish: 'steel', outlet: [0.19, 0.5, -0.04] },
    cockpit: {
      bars: 'tubular',
      grip: [0.37, 1.03, -0.86],
      barDia: 0.023,
      dash: 'lcd',
      dashPos: [0, 0.99, -1.135],
      dashSize: [0.13, 0.07],
      dashTiltDeg: 40,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.34, 1.2, -0.92],
      mirrorSize: [0.12, 0.075],
      mirrorIndicators: false,
      mirrorShape: 'oval',
      mirrorColor: '#141517',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#9aa0a7',
      reservoirs: true,
      clutch: 'cable',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#141414',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'round', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.785, front: -0.64, back: -0.3, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.865, -0.5], peg: [0.19, 0.33, -0.45], torsoPitch: 0.22, eye: [0, 1.41, -0.57] },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.56, 0.34], tiltDeg: -12 },
    body,
    livery,
    groundClearance: 0.135,
    features: ['trellis'],
    zones: { splitY: 0.6, decal: [-0.95, 0.8] },
  };
}
