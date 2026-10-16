import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { addPanel, buildSeat, buildTank, frontFender, PAINT, seatFinish } from '../kit/body';
import { lamp, ledStrip } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { fAnd, fNot, fOr, planRegion, sideRegion, type Field } from '../surface';
import type { BikeBlueprint } from '../types';
import { biplaneWing, bladeIndicator, forkBrackets, loftPart, panelPair, steerLamp, steerMat, steerStrip } from './family-eu-naked-1-parts';

/**
 * Ducati Streetfighter V4 S (2023+).
 * Spec sheet: wheelbase 1488 mm, rake 24.5°, trail 100 mm, seat 845 mm, 120/70ZR17 +
 * 200/60ZR17 on forged three-spoke wheels (3.50 / 6.00 in), Öhlins NIX30 43 mm fork and
 * TTX36 shock, 2 × 330 mm discs with Brembo Stylema monobloc calipers, aluminium "Front
 * Frame" on the 1103 cc Desmosedici Stradale 90° V4 (rotated back 42°), single-sided
 * swingarm on the left, 4-2-1-2 exhaust under the engine with two short stacked outlets on
 * the right.
 * Design cues: the "Joker" face — a compact black headlight with two LED DRL blades forming a
 * V around the main LED unit, no fairing; big red side intakes (radiator shrouds) carrying the
 * biplane winglets; a tall sculpted tank over the airbox; flat wide bar; a short slim tail with
 * the split LED light lines.
 */

// ── face (steering-local: origin at the top of the fork tubes, −Z forward along the face) ──
const FACE_Z = -0.205;

function headShell(): OutlineBody {
  const zB = -0.078;
  // Face outline (front view, right half): wide flat top, sides tapering to a narrow chin.
  const face: P2[] = [[0, 1], [0.86, 0.975], [1, 0.88], [0.9, 0.6], [0.6, 0.2], [0.33, 0.03], [0, 0]];
  return {
    zs: stationsBetween(FACE_Z, zB, 7, 0.4),
    top: curve([[FACE_Z, -0.122], [-0.15, -0.115], [zB, -0.1]]),
    bottom: curve([[FACE_Z, -0.33], [-0.15, -0.322], [zB, -0.3]]),
    half: curve([[FACE_Z, 0.118], [-0.16, 0.112], [zB, 0.09]]),
    sections: [{ z: FACE_Z, pts: face }],
  };
}

function headUnit(ctx: KitContext): void {
  const black = F.texturedBlack;
  loftPart(ctx, headShell(), black, { steer: true, capFront: true, depth: 0.006, q: 1.1, creases: [2] });
  // Main LED unit inside the V: an inverted trapezoid with two LED modules.
  // Two compact LED modules side by side inside the V, under a dark centre bar.
  for (const s of [-1, 1]) {
    const mod: P2[] = smooth2([[-0.026, 0.016], [0.026, 0.016], [0.022, -0.014], [0.006, -0.026], [-0.016, -0.02]].map(([x, y]) => [s * x, y] as P2), 2, true);
    steerLamp(ctx, mod, [s * 0.034, -0.172, FACE_Z - 0.001], { kind: 'head', inner: 'led', count: 1, depth: 0.025, rim: 0.003 });
  }
  // The two DRL blades of the "Joker" V, from the upper outer corners down to the chin.
  for (const s of [-1, 1]) {
    steerStrip(ctx, [[s * 0.104, -0.138, FACE_Z - 0.004], [s * 0.088, -0.19, FACE_Z - 0.004], [s * 0.054, -0.262, FACE_Z - 0.004], [s * 0.016, -0.316, FACE_Z - 0.004]], 0.011, 0.005, 'drl');
    // Small LED indicators on the headlight flanks.
    bladeIndicator(ctx, 'steer', ctx.fromSteer([s * 0.105, -0.2, -0.12]), ctx.fromSteer([s * 0.15, -0.205, -0.135]), 0.007);
  }
  forkBrackets(ctx, [-0.13, -0.28], -0.09, 0.07);
  // TFT bracket from the top clamp forward to the dash.
  ctx.add('steer', roundBox(0.06, 0.012, 0.09, 0.004), F.texturedBlack, steerMat(ctx, mul(T(0, -0.02, -0.075), RX(0.6))));
}

// ── chassis bodywork (bike space) ──

/**
 * Painted side intake / radiator shroud (right panel; mirrored): a scoop under the tank
 * front whose blunt front face carries the black intake mouth and whose lower edge sweeps
 * up and back towards the knee.
 */
function intake(): OutlineBody {
  // The bottom line rises to meet the top at the nose: the front edge is a forward-raked slash
  // and the scoop stays open there (the radiator shows through it as the intake mouth).
  return {
    zs: stationsBetween(-1.375, -0.97, 13, 0.4),
    top: curve([[-1.375, 0.85], [-1.3, 0.885], [-1.2, 0.93], [-1.1, 0.962], [-0.97, 0.975]]),
    bottom: curve([[-1.375, 0.826], [-1.34, 0.72], [-1.3, 0.635], [-1.24, 0.595], [-1.14, 0.6], [-1.05, 0.65], [-0.97, 0.74]]),
    half: curve([[-1.375, 0.165], [-1.3, 0.222], [-1.18, 0.25], [-1.06, 0.244], [-0.97, 0.215]]),
    sections: [
      { z: -1.375, pts: [[0.62, 1], [0.86, 0.95], [0.98, 0.76], [1, 0.48], [0.95, 0.18], [0.84, 0]] },
      { z: -0.97, pts: [[0.48, 1], [0.76, 0.95], [0.94, 0.8], [1, 0.52], [0.97, 0.22], [0.9, 0]] },
    ],
  };
}

function tail(): OutlineBody {
  return {
    zs: stationsBetween(-0.7, 0.07, 14, 0.5),
    top: curve([[-0.7, 0.86], [-0.52, 0.862], [-0.34, 0.885], [-0.29, 0.935], [-0.14, 0.97], [-0.02, 1.0], [0.07, 1.03]]),
    bottom: curve([[-0.7, 0.7], [-0.45, 0.72], [-0.22, 0.79], [-0.06, 0.89], [0.03, 0.965], [0.07, 1.0]]),
    half: curve([[-0.7, 0.15], [-0.5, 0.138], [-0.3, 0.12], [-0.12, 0.092], [0.0, 0.066], [0.07, 0.045]]),
    sections: [
      { z: -0.7, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
      { z: 0.07, pts: [[0, 1], [0.72, 0.98], [1, 0.76], [0.99, 0.48], [0.86, 0.2], [0.45, 0.02], [0, 0]] },
    ],
  };
}

function body(ctx: KitContext): void {
  const blackGloss = hard('#0b0c0e', 0.15, 0.2, 1);
  const carbonish = F.carbon;
  headUnit(ctx);
  // Side intakes (painted) over black duct liners, the biplane winglets on their flanks.
  panelPair(ctx, intake(), PAINT, { creases: [1], depth: 0.012 });
  biplaneWing(
    ctx,
    [[-1.235, 0.752], [-1.16, 0.765], [-1.08, 0.76], [-1.08, 0.754], [-1.16, 0.756], [-1.235, 0.746]],
    [[-1.215, 0.69], [-1.14, 0.703], [-1.065, 0.698], [-1.065, 0.692], [-1.14, 0.694], [-1.215, 0.684]],
    0.238,
    0.292,
    carbonish,
  );
  // Tank over the airbox: high crowned front, deep knee cut-outs, long tail under the seat.
  buildTank(ctx, {
    front: -1.13,
    back: -0.64,
    top: 1.07,
    bottomFront: 0.9,
    bottomBack: 0.8,
    width: 0.44,
    style: 'muscle',
    knee: 0.17,
    capZ: -0.93,
    topLine: [[-1.13, 0.965], [-1.07, 1.02], [-0.98, 1.058], [-0.88, 1.07], [-0.78, 1.055], [-0.7, 0.99], [-0.64, 0.9]],
    bottomLine: [[-1.13, 0.9], [-0.98, 0.86], [-0.8, 0.82], [-0.64, 0.8]],
    halfLine: [[-1.13, 0.13], [-1.05, 0.2], [-0.95, 0.222], [-0.84, 0.215], [-0.72, 0.17], [-0.64, 0.115]],
  });
  // Seats: rider + pillion pad.
  buildSeat(ctx, { front: -0.67, back: -0.33, yFront: 0.84, y: 0.845, yBack: 0.875, width: 0.28, thick: 0.065, frontWidth: 0.17 });
  buildSeat(ctx, { front: -0.31, back: -0.08, yFront: 0.93, y: 0.94, yBack: 0.96, width: 0.18, thick: 0.045, frontWidth: 0.14 }, tint(seatFinish(ctx), '#161616'));
  // Tail with seat recesses, a central split and side air channels.
  const tb = tail();
  const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
  const seatHole: Field = fAnd(
    fOr(sideRegion([[-0.85, 0.82], [-0.322, 0.82], [-0.322, 1.4], [-0.85, 1.4]]), sideRegion([[-0.312, 0.915], [-0.07, 0.915], [-0.07, 1.4], [-0.312, 1.4]])),
    planRegion([[-0.85, -0.01], [-0.06, -0.01], [-0.06, 0.092], [-0.31, 0.092], [-0.32, 0.142], [-0.85, 0.142]]),
  );
  const split = fAnd(planRegion([[-0.04, -1], [0.2, -1], [0.2, 0.024], [-0.04, 0.01]]), (_x, y) => y - 0.92);
  const tailVent = sideRegion(smooth2([[-0.32, 0.79], [-0.14, 0.855], [-0.04, 0.9], [-0.08, 0.855], [-0.26, 0.775]], 3, true));
  addPanel(ctx, 'chassis', tm, fAnd(fNot(seatHole), fNot(split), fNot(tailVent)), PAINT, 0.0025, 0.012);
  const ut: OutlineBody = {
    zs: stationsBetween(-0.5, 0.05, 7, 0.4),
    top: curve([[-0.5, 0.76], [0.05, 0.975]]),
    bottom: curve([[-0.5, 0.71], [-0.15, 0.77], [0.05, 0.94]]),
    half: curve([[-0.5, 0.135], [0.05, 0.045]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.95], [0.95, 0.7], [1, 0.45], [0.9, 0.2], [0.5, 0.02], [0, 0]] }],
  };
  ctx.add('chassis', outlineLoft(ut, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), F.texturedBlack);
  // Split LED tail light: one line under each fin, meeting under the tip.
  for (const s of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 5; i++) {
      const z = -0.12 + (i / 5) * 0.18;
      pts.push([s * tb.half(z) * 0.97, tb.bottom(z) + 0.012, z]);
    }
    ledStrip(ctx, 'chassis', pts, 0.008, 0.005, 'tail', [0, 1, 0]);
  }
  const tl: P2[] = smooth2([[-0.045, -0.004], [0.045, -0.004], [0.05, 0.004], [-0.05, 0.004]], 3, true);
  lamp(ctx, 'chassis', tl, mul(T(0, 0.975, 0.055), RX(-0.7)), { kind: 'tail', inner: 'led', count: 1, depth: 0.02, rim: 0.002, lensSmoked: true });
  // Small black side covers under the seat and the belly heat shield.
  for (const s of [-1, 1]) {
    ctx.add('chassis', extrude(smooth2([[-0.66, 0.79], [-0.5, 0.78], [-0.44, 0.7], [-0.56, 0.64], [-0.66, 0.7]], 3, true), 0.01, { plane: 'zy', bevel: 0.003, center: s * 0.135 }), F.texturedBlack);
  }
  frontFender(ctx, { from: -0.62, to: 0.8, gap: 0.02, width: 0.15 });
  hugger(ctx, blackGloss, -0.15, 0.85);
  plateHanger(ctx, { fromZ: -0.1, fromY: 0.79 });
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, main: string): void {
  if (p.view !== 'right' && p.view !== 'left') return;
  p.text('DUCATI', -0.9, 0.95, { color: main, size: 0.028, weight: '900', italic: true, spacing: 0.02 });
  p.text('V4 S', -0.12, 0.865, { color: main, size: 0.038, weight: '900', italic: true });
  p.text('STREETFIGHTER', -1.16, 0.84, { color: main, size: 0.016, weight: '800', spacing: 0.04 });
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const stealth = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    if (stealth) {
      // Dark Stealth: matte black with a gloss black tank top and red detailing.
      p.fill(lv.primary, 'matte');
      if (p.view === 'right' || p.view === 'left') {
        p.line([[-1.34, 0.77], [-1.2, 0.86], [-1.0, 0.95]], '#cc0a0a', 0.004);
        lettering(p, '#5c5f66');
      } else if (p.view === 'top') p.rect(-1.0, -0.06, -0.66, 0.06, '#0f1012', 'gloss');
      return;
    }
    // Ducati Red: solid red; dark grey lower intake lips and tail base, white wordmarks.
    p.fill(lv.primary, 'gloss');
    if (p.view === 'right' || p.view === 'left') {
      p.poly([[-1.38, 0.0], [-1.38, 0.68], [-1.26, 0.6], [-1.12, 0.58], [-0.98, 0.64], [-0.98, 0.0]], '#1b1c1f', 'satin');
      p.poly([[-0.4, 0.74], [0.2, 0.92], [0.2, 0.6], [-0.4, 0.6]], '#1b1c1f', 'satin');
      p.line([[-1.34, 0.79], [-1.22, 0.865], [-1.06, 0.93]], '#f4f4f4', 0.003);
      lettering(p, '#f4f4f4');
    } else if (p.view === 'top') {
      p.rect(-0.98, -0.006, -0.7, 0.006, '#f4f4f4');
    }
  });
}

export function sfv4Blueprint(spec: BikeSpec): BikeBlueprint {
  const lv = spec.liveries[0];
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.13, 0.85, 1.12],
    wheelbase: 1.488,
    rakeDeg: 24.5,
    trail: 0.1,
    forkLength: 0.725,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, crown: 0.82, tread: 'slickish', tyreLabel: 'Supercorsa SP' },
    rear: { tyre: '200/60ZR17', rimWidthIn: 6.0, crown: 0.92, tread: 'slickish', tyreLabel: 'Supercorsa SP' },
    frontWheel: { type: 'forged', spokes: 3, shape: 'y', color: lv.wheel, machinedLip: true },
    rearWheel: { type: 'forged', spokes: 3, shape: 'y', color: lv.wheel, machinedLip: true },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.212, outerColor: '#c9a028', innerColor: '#d8b45a', footColor: '#1e1f22', capColor: '#c9a028', adjusterColor: '#d33a1c', label: 'ÖHLINS', labelColor: '#1b1c1f', aboveClamp: 0.012, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.33, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radialMono4', caliperColor: '#2f3136', caliperText: 'brembo', caliperTextColor: '#d01c1c', caliperAngleDeg: 78 },
    rearBrake: { discs: 1, discDia: 0.245, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial2', caliperColor: '#2f3136', caliperAngleDeg: 200 },
    frame: { type: 'monocoque', color: '#2a2c30', metal: 0.75, rough: 0.42, subframe: 'cast', subframeColor: '#1c1d20', width: 0.33 },
    swingarm: { type: 'singleSided', length: 0.6, angleDeg: 11, side: 'left', color: '#202125', metal: 0.7, rough: 0.42 },
    shock: { layout: 'mono', springColor: '#e6c41c', bodyColor: '#c9a028', reservoir: true },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 42, pitch: 0.015875, sprocketColor: '#1d1e21' },
    engine: {
      layout: 'V4',
      cc: 1103,
      crank: [0, 0.39, -0.87],
      tiltDeg: 42,
      caseColor: '#232427',
      coverColor: '#2f3135',
      headColor: '#26272a',
      camCoverColor: '#1d1e21',
      camCoverText: 'DESMOSEDICI',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.36, h: 0.32, z: -1.27, y: 0.6, tiltDeg: 16, curved: true },
      width: 0.4,
    },
    exhaust: { route: 'underbelly', side: 'right', can: 'round', canLength: 0.12, canDia: 0.062, canFinish: 'steel', headerFinish: 'steel' },
    cockpit: {
      bars: 'tubular',
      grip: [0.345, 1.03, -0.99],
      barDia: 0.022,
      dash: 'tftDucati',
      dashPos: [0, 1.0, -1.25],
      dashSize: [0.11, 0.066],
      dashTiltDeg: 52,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.37, 1.17, -1.0],
      mirrorSize: [0.13, 0.062],
      mirrorIndicators: false,
      mirrorShape: 'sport',
      mirrorColor: '#111214',
      topClamp: 'milled',
      steeringDamper: 'side',
      leverColor: '#1e1f22',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#1d1e21',
    },
    lights: { head: 'custom', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.845, front: -0.67, back: -0.33, pillion: 'seat', color: '#141414' },
    rider: { hip: [0, 0.92, -0.5], peg: [0.19, 0.4, -0.48], torsoPitch: 0.42, eye: [0, 1.45, -0.66] },
    footrests: 'rearset',
    plate: { mount: 'hanger', pos: [0, 0.6, 0.33], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.13,
    features: ['winglets'],
    zones: { splitY: 0.58, decal: [-0.9, 0.95] },
  };
}
