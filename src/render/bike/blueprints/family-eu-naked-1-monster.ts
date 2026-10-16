import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { addPanel, buildSeat, buildTank, frontFender, PAINT, seatFinish } from '../kit/body';
import { collector, heatPipe } from '../kit/jp-sport-exhaust';
import { lamp, ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, flat, lathe, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { fAnd, fNot, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { bladeIndicator, forkBrackets, loftPart, ovalCan, panelPair, steerMat, steerStrip, tailPipe, veePorts } from './family-eu-naked-1-parts';

/**
 * Ducati Monster (937, 2021+; catalogue "Monster +", i.e. with the flyscreen).
 * Spec sheet: wheelbase 1474 mm, rake 24°, trail 93 mm, seat 820 mm, 120/70ZR17 + 180/55ZR17
 * on 3.50 / 5.50 in cast wheels, 43 mm USD fork, 2 × 320 mm discs with Brembo M4.32 radial
 * monoblocs, 245 mm rear disc, aluminium front frame bolted to the 937 cc Testastretta 11°
 * L-twin, GFRP subframe, double-sided cast swingarm, 2-1 exhaust under the engine with a
 * short right-hand silencer carrying two stacked tail pipes.
 * Design cues: the round LED headlight with its DRL ring (homage to the 1993 original) under a
 * small flyscreen; the compact "bison back" tank with its front side scoops; slim rising tail.
 */

// ── face (steering-local) ──
const LAMP_Y = -0.165;
const LAMP_Z = -0.2;
const LAMP_R = 0.086;

function headBowl(): OutlineBody {
  const z0 = LAMP_Z + 0.03;
  const z1 = LAMP_Z + 0.115;
  const circle: P2[] = [[0, 1], [0.5, 0.933], [0.866, 0.75], [1, 0.5], [0.866, 0.25], [0.5, 0.067], [0, 0]];
  return {
    zs: stationsBetween(z0, z1, 6, 0.5),
    top: curve([[z0, LAMP_Y + LAMP_R + 0.004], [z1, LAMP_Y + LAMP_R * 0.62]]),
    bottom: curve([[z0, LAMP_Y - LAMP_R - 0.004], [z1, LAMP_Y - LAMP_R * 0.6]]),
    half: curve([[z0, LAMP_R + 0.004], [(z0 + z1) / 2, LAMP_R * 0.92], [z1, LAMP_R * 0.6]]),
    sections: [{ z: z0, pts: circle }],
  };
}

function headUnit(ctx: KitContext): void {
  // Round black bowl behind the lens, slightly flattened at the top like the 937's lamp.
  loftPart(ctx, headBowl(), F.glossBlack, { steer: true, capBack: true, depth: 0.004, q: 1.2 });
  const at = (x: number, y: number, z: number, m?: THREE.Matrix4) => steerMat(ctx, m ? mul(T(x, y, z), m) : T(x, y, z));
  // Lamp face (local frame: lens facing local −Z): dark reflector, DRL ring, central LED module, dome lens.
  const face = new THREE.Matrix4().makeRotationY(Math.PI);
  const zf = LAMP_Z + 0.03;
  ctx.add('steer', lathe([[LAMP_R * 1.06, -0.012], [LAMP_R * 1.08, 0.004], [LAMP_R * 0.98, 0.009], [LAMP_R * 0.95, 0.0]], { segs: ctx.seg(40, 14), axis: 'z' }), F.glossBlack, at(0, LAMP_Y, zf, face));
  ctx.add('steer', lathe([[0, -0.02], [LAMP_R * 0.5, -0.016], [LAMP_R * 0.96, 0.0]], { segs: ctx.seg(40, 14), axis: 'z' }), hard('#2a2c30', 0.8, 0.3), at(0, LAMP_Y, zf, face));
  // Main LED module: a horizontal lozenge across the middle.
  const mod: P2[] = smooth2([[-0.042, -0.012], [0.042, -0.012], [0.05, 0.004], [0.036, 0.018], [-0.036, 0.018], [-0.05, 0.004]], 2, true);
  ctx.add('steer', extrude(mod, 0.012, { plane: 'xy', bevel: 0.002, center: 0.0 }), F.texturedBlack, at(0, LAMP_Y - 0.004, zf - 0.008, face));
  ctx.add('steer', flat(mod.map(([x, y]) => [x * 0.86, y * 0.8] as P2), 'xy', 0.0065, 1), F.head, at(0, LAMP_Y - 0.004, zf - 0.008, face));
  // DRL: a horseshoe ring open at the bottom, its ends turning in as two short "fangs".
  const drl: P3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = -Math.PI * 0.22 + (i / 16) * Math.PI * 1.44;
    drl.push([Math.cos(a) * LAMP_R * 0.8, LAMP_Y + Math.sin(a) * LAMP_R * 0.8, zf - 0.004]);
  }
  steerStrip(ctx, drl, 0.011, 0.005, 'drl');
  for (const s of [-1, 1]) {
    const a = -Math.PI * 0.22;
    steerStrip(ctx, [[s * Math.cos(a) * LAMP_R * 0.8, LAMP_Y + Math.sin(a) * LAMP_R * 0.8, zf - 0.004], [s * LAMP_R * 0.36, LAMP_Y - LAMP_R * 0.6, zf - 0.004]], 0.009, 0.005, 'drl');
  }
  ctx.add('steer', lathe(([[0, LAMP_R * 0.16], [LAMP_R * 0.6, LAMP_R * 0.11], [LAMP_R * 0.97, 0.004]] as P2[]).reverse(), { segs: ctx.seg(40, 14), axis: 'z' }), F.lens, at(0, LAMP_Y, zf - 0.006, face));
  for (const s of [-1, 1]) {
    // Indicators: small LED blades on the headlight bracket flanks.
    bladeIndicator(ctx, 'steer', ctx.fromSteer([s * 0.07, LAMP_Y - 0.03, LAMP_Z + 0.1]), ctx.fromSteer([s * 0.125, LAMP_Y - 0.035, LAMP_Z + 0.085]), 0.0065);
  }
  forkBrackets(ctx, [-0.11, -0.215], LAMP_Z + 0.11, 0.05);
  // Flyscreen (Monster +): a small smoked screen on two stays above the lamp, raked back.
  const scr = smooth2([[-0.088, 0], [0.088, 0], [0.1, 0.06], [0.08, 0.15], [0.0, 0.172], [-0.08, 0.15], [-0.1, 0.06]], 4, true);
  const sm = mul(T(0, LAMP_Y + LAMP_R - 0.012, LAMP_Z + 0.018), RX(0.5));
  ctx.add('steer', extrude(scr, 0.0035, { plane: 'xy', bevel: 0.0012, curveSegs: 1 }), F.screen, steerMat(ctx, sm));
  for (const s of [-1, 1]) {
    ctx.add('steer', roundBox(0.008, 0.07, 0.012, 0.003), F.texturedBlack, steerMat(ctx, mul(T(s * 0.055, LAMP_Y + LAMP_R + 0.014, LAMP_Z + 0.064), RX(0.5))));
  }
}

// ── chassis bodywork (bike space) ──

/** Black radiator side covers under the tank front (right panel, mirrored). */
function radiatorCover(): OutlineBody {
  return {
    zs: stationsBetween(-1.215, -1.0, 8, 0.5),
    top: curve([[-1.215, 0.79], [-1.12, 0.82], [-1.0, 0.82]]),
    bottom: curve([[-1.215, 0.66], [-1.12, 0.6], [-1.0, 0.64]]),
    half: curve([[-1.215, 0.15], [-1.1, 0.185], [-1.0, 0.17]]),
    sections: [
      { z: -1.215, pts: [[0.78, 1], [0.95, 0.85], [1, 0.5], [0.95, 0.15], [0.85, 0]] },
      { z: -1.0, pts: [[0.85, 1], [0.97, 0.85], [1, 0.5], [0.96, 0.15], [0.9, 0]] },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.56, 0.035, 12, 0.5),
    top: curve([[-0.56, 0.8], [-0.4, 0.83], [-0.32, 0.885], [-0.18, 0.92], [-0.05, 0.945], [0.035, 0.96]]),
    bottom: curve([[-0.56, 0.7], [-0.38, 0.73], [-0.2, 0.8], [-0.05, 0.87], [0.035, 0.915]]),
    half: curve([[-0.56, 0.14], [-0.4, 0.125], [-0.2, 0.098], [-0.05, 0.074], [0.035, 0.046]]),
    sections: [
      { z: -0.56, pts: [[0, 1], [0.6, 0.97], [0.94, 0.82], [1, 0.55], [0.94, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.035, pts: [[0, 1], [0.7, 0.97], [1, 0.75], [0.98, 0.45], [0.86, 0.18], [0.45, 0.02], [0, 0]] },
    ],
  };
}

function body(ctx: KitContext): void {
  headUnit(ctx);
  // Tank: tall rounded front ("bison back"), side scoops, tapering into the seat.
  const tank = buildTank(ctx, {
    front: -1.165,
    back: -0.64,
    top: 1.045,
    bottomFront: 0.82,
    bottomBack: 0.78,
    width: 0.4,
    style: 'muscle',
    knee: 0.16,
    capZ: -0.98,
    topLine: [[-1.165, 0.9], [-1.13, 0.985], [-1.06, 1.03], [-0.96, 1.045], [-0.84, 1.025], [-0.73, 0.97], [-0.64, 0.875]],
    bottomLine: [[-1.165, 0.82], [-1.0, 0.8], [-0.82, 0.79], [-0.64, 0.78]],
    halfLine: [[-1.165, 0.115], [-1.1, 0.18], [-1.0, 0.195], [-0.88, 0.183], [-0.75, 0.15], [-0.64, 0.1]],
  });
  // Front side scoops: black inserts recessed into the lower front corners of the tank.
  for (const s of [-1, 1]) {
    const scoop = smooth2([[-1.15, 0.86], [-1.04, 0.875], [-0.96, 0.86], [-1.0, 0.83], [-1.13, 0.825]], 3, true);
    const z = -1.05;
    const x = tank.half(z) * 0.985;
    ctx.add('chassis', extrude(scoop, 0.012, { plane: 'zy', bevel: 0.003, center: s * (x - 0.003) }), F.texturedBlack);
  }
  panelPair(ctx, radiatorCover(), F.texturedBlack, { depth: 0.008 });
  // Seats: rider + pillion.
  buildSeat(ctx, { front: -0.7, back: -0.36, yFront: 0.805, y: 0.82, yBack: 0.85, width: 0.29, thick: 0.07, frontWidth: 0.19 });
  buildSeat(ctx, { front: -0.35, back: -0.07, yFront: 0.895, y: 0.915, yBack: 0.94, width: 0.19, thick: 0.05, frontWidth: 0.16 }, tint(seatFinish(ctx), '#161616'));
  // Painted tail cover around the seats, with the seat recess cut out.
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(11, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    sideRegion([[-0.8, 0.79], [-0.36, 0.8], [-0.34, 0.87], [-0.06, 0.89], [-0.06, 1.4], [-0.8, 1.4]]),
    planRegion([[-0.8, -0.01], [-0.06, -0.01], [-0.06, 0.09], [-0.36, 0.1], [-0.4, 0.14], [-0.8, 0.14]]),
  );
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  const ut: OutlineBody = {
    zs: stationsBetween(-0.48, 0.02, 6, 0.4),
    top: curve([[-0.48, 0.74], [0.02, 0.91]]),
    bottom: curve([[-0.48, 0.7], [-0.15, 0.77], [0.02, 0.89]]),
    half: curve([[-0.48, 0.125], [0.02, 0.045]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.95], [0.95, 0.7], [1, 0.45], [0.9, 0.2], [0.5, 0.02], [0, 0]] }],
  };
  ctx.add('chassis', outlineLoft(ut, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), F.texturedBlack);
  // Tail light: slim LED bar under the tip, with a smoked lens.
  const tl: P2[] = smooth2([[-0.05, -0.008], [0.05, -0.008], [0.055, 0.006], [-0.055, 0.006]], 3, true);
  lamp(ctx, 'chassis', tl, mul(T(0, 0.93, 0.038), RX(-0.35)), { kind: 'tail', inner: 'led', count: 1, depth: 0.025, rim: 0.003 });
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 4; i++) {
      const z = -0.07 + (i / 4) * 0.1;
      pts.push([s * tb.half(z) * 0.98, tb.bottom(z) + 0.01, z]);
    }
    ledStrip(ctx, 'chassis', pts, 0.006, 0.004, 'tail', [s, 0.3, 0]);
  }
  // Black side covers under the seat (ECU / battery), heat shield over the exhaust.
  for (const s of [-1, 1]) {
    ctx.add('chassis', extrude(smooth2([[-0.68, 0.77], [-0.5, 0.76], [-0.44, 0.66], [-0.58, 0.6], [-0.68, 0.66]], 3, true), 0.01, { plane: 'zy', bevel: 0.003, center: s * 0.125 }), F.texturedBlack);
  }
  frontFender(ctx, { from: -0.55, to: 0.75, gap: 0.02, width: 0.14 });
  hugger(ctx, F.texturedBlack, -0.15, 0.55);
  plateHanger(ctx, { fromZ: -0.08, fromY: 0.76 });
  exhaust(ctx);
  beltCovers(ctx);
}

/** Timing-belt covers on the right of both cylinders: the signature of a Ducati desmo twin. */
function beltCovers(ctx: KitContext): void {
  const e = ctx.bp.engine;
  const k = Math.cbrt(e.cc / 1000);
  const c = e.crank;
  for (const [phi, x] of [[(e.tiltDeg * Math.PI) / 180, 0.072], [((e.tiltDeg + 90) * Math.PI) / 180, 0.112]] as const) {
    const dz = -Math.cos(phi), dy = Math.sin(phi);
    const nz = dy, ny = -dz;
    const a0 = 0.05, a1 = 0.08 * k + 0.25 * k + 0.11 * k;
    const pt = (a: number, w: number): P2 => [c[2] + dz * a + nz * w, c[1] + dy * a + ny * w];
    const outline = smooth2([pt(a0, -0.045), pt(a1 - 0.03, -0.06), pt(a1, -0.035), pt(a1 + 0.01, 0.0), pt(a1, 0.04), pt(a1 - 0.03, 0.062), pt(a0, 0.05), pt(a0 - 0.02, 0.0)], 3, true);
    ctx.add('chassis', extrude(outline, 0.026, { plane: 'zy', bevel: 0.009, bevelSegs: 2, center: x, curveSegs: 1 }), hard('#202125', 0.35, 0.28, 0.8));
  }
}

/**
 * 2-1 exhaust: the front header loops under the engine, the rear one drops straight down,
 * both into a catalyst box under the sump; a short link runs to the right-hand silencer under
 * the footrest hanger, which ends in two stacked tail pipes angled up towards the rear tyre.
 */
function exhaust(ctx: KitContext): void {
  const ports = veePorts(ctx);
  const c = ctx.bp.engine.crank;
  const col: P3 = [0.04, 0.17, c[2] + 0.06];
  const r = 0.024;
  for (const p of ports) {
    const a = new THREE.Vector3(...p.pos);
    const d = new THREE.Vector3(...p.dir);
    const p1 = a.clone().addScaledVector(d, 0.05);
    if (p.front) {
      heatPipe(ctx, [p.pos, [p1.x, p1.y, p1.z], [p1.x + 0.03, 0.3, c[2] - 0.3], [0.05, 0.19, c[2] - 0.16], [col[0], col[1], col[2] - 0.1]], r, 'steel', 0, 0.75);
    } else {
      heatPipe(ctx, [p.pos, [p1.x, p1.y, p1.z], [p1.x + 0.05, 0.3, p1.z + 0.02], [0.07, 0.22, c[2] + 0.13], [col[0], col[1], col[2] + 0.08]], r, 'steel', 0, 0.75);
    }
  }
  collector(ctx, col, 0.06, 0.24, 'black', 0.5);
  ctx.add('chassis', roundBox(0.2, 0.09, 0.26, 0.035, 2), hard('#1d1e21', 0.3, 0.55), T(0.02, 0.165, c[2] + 0.07));
  // Link to the silencer.
  const s0: P3 = [0.15, 0.25, -0.6];
  const s1: P3 = [0.175, 0.33, -0.34];
  heatPipe(ctx, [[col[0], col[1], col[2] + 0.1], [0.1, 0.19, col[2] + 0.2], [0.14, 0.22, s0[2] - 0.08], s0], 0.03, 'black', 0.6, 1);
  ovalCan(ctx, s0, s1, 0.05, 0.075, hard('#17181b', 0.3, 0.5), 1.05);
  // Satin heat-guard over the outer face and the two stacked tail pipes.
  ctx.add('chassis', extrude(smooth2([[-0.6, 0.31], [-0.4, 0.37], [-0.33, 0.37], [-0.36, 0.25], [-0.58, 0.2]], 3, true), 0.006, { plane: 'zy', bevel: 0.002, center: 0.228 }), hard('#2a2b2e', 0.5, 0.45));
  tailPipe(ctx, [0.17, 0.355, -0.36], [0.18, 0.375, -0.27], 0.024, F.steel);
  tailPipe(ctx, [0.172, 0.3, -0.37], [0.182, 0.318, -0.282], 0.024, F.steel);
  ctx.anchor('exhaustOutlet', [0.18, 0.35, -0.27]);
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, main: string, sub: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('DUCATI', -0.93, 0.95, { color: main, size: 0.03, weight: '900', italic: true, spacing: 0.02 });
  p.text('MONSTER', -0.2, 0.86, { color: sub, size: 0.016, weight: '800', spacing: 0.05 });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const grey = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, grey ? 'metallic' : 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      // Lower tank edge in black where it meets the airbox covers.
      p.poly([[-1.2, 0.0], [-1.2, 0.8], [-0.62, 0.765], [-0.62, 0.0]], '#141518', 'satin');
      p.poly([[-0.62, 0.0], [-0.62, 0.72], [0.1, 0.87], [0.1, 0.0]], grey ? '#2a2c30' : '#1b1c1f', 'satin');
      lettering(p, grey ? '#cc0a0a' : '#f4f4f4', grey ? '#e8e8e8' : '#f4f4f4');
    } else if (p.view === 'top') {
      p.rect(-1.0, -0.004, -0.72, 0.004, grey ? '#cc0a0a' : '#f4f4f4');
    }
  });
}

export function monsterBlueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    wheelbase: 1.474,
    rakeDeg: 24,
    trail: 0.093,
    forkLength: 0.715,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.9, tread: 'sport', tyreLabel: 'Rosso Sport' },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, crown: 0.98, tread: 'sport', tyreLabel: 'Rosso Sport' },
    frontWheel: { type: 'cast', spokes: 3, shape: 'y', color: lv.wheel, liveryColor: true, machinedLip: false },
    rearWheel: { type: 'cast', spokes: 3, shape: 'y', color: lv.wheel, liveryColor: true, machinedLip: false },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.205, outerColor: '#1c1d20', innerColor: '#c8ccd2', footColor: '#1c1d20', capColor: '#2a2c30', label: '', aboveClamp: 0.008, clampGap: 0.19 },
    frontBrake: { discs: 2, discDia: 0.32, disc: 'semiFloating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#2f3136', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 78 },
    rearBrake: { discs: 1, discDia: 0.245, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2f3136', caliperAngleDeg: 200 },
    frame: { type: 'monocoque', color: '#1b1c1f', metal: 0.45, rough: 0.45, subframe: 'cast', subframeColor: '#18191b', width: 0.3 },
    swingarm: { type: 'banana', length: 0.58, angleDeg: 10, color: '#1e1f22', metal: 0.55, rough: 0.45 },
    shock: { layout: 'mono', springColor: '#c41a1a', bodyColor: '#1e1f22', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 43, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'L2',
      cc: 937,
      crank: [0, 0.36, -0.79],
      tiltDeg: 21,
      caseColor: '#1f2023',
      coverColor: '#3a3d42',
      headColor: '#55585e',
      camCoverColor: '#1b1c1f',
      camCoverText: 'TESTASTRETTA',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.3, h: 0.19, z: -1.2, y: 0.68, tiltDeg: 24, curved: true },
      width: 0.3,
    },
    exhaust: { route: 'none', side: 'right', can: 'round', canLength: 0.26, canDia: 0.1, canFinish: 'black', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.34, 1.02, -1.02],
      barDia: 0.022,
      dash: 'tft',
      dashPos: [0, 1.005, -1.2],
      dashSize: [0.098, 0.058],
      dashTiltDeg: 48,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.36, 1.15, -1.0],
      mirrorSize: [0.12, 0.072],
      mirrorIndicators: false,
      mirrorShape: 'oval',
      mirrorColor: '#111214',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'clamp',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.82, front: -0.7, back: -0.36, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.9, -0.55], peg: [0.165, 0.37, -0.5], torsoPitch: 0.22, eye: [0, 1.5, -0.66] },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.3], tiltDeg: -12 },
    body,
    livery,
    groundClearance: 0.14,
    features: ['flyscreen'],
    zones: { splitY: 0.6, decal: [-0.93, 0.95] },
  };
}
