import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { PAINT, bodyQ, buildSeat, frontFender, shell } from '../kit/body';
import { beam } from '../kit/frame';
import { indicatorPod, ledStrip, roundHeadlight } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { bezelRing, castTint, pipeAlong } from '../kit/retro-scooter-ev-body';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, rod, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, Micro, hard, vary } from '../sink';
import type { BikeBlueprint } from '../types';

/**
 * LiveWire One (2023): the electric roadster.
 * Spec sheet: wheelbase 1490 mm, rake 24.5°, 120/70ZR17 + 180/55ZR17 on cast wheels, 43 mm USD fork, twin 300 mm
 * front discs, Gates belt final drive on the left, no exhaust, ~249 kg.
 * Design cues: finned black battery casing as the central structure with a dark "tank" cover on top (charge port
 * flap on the right), copper Revelation motor housing at the swingarm pivot, orange HV cables, round LED lamp with a
 * ring DRL, short flat seat, abbreviated tail.
 */

const COPPER = '#b0643a';
const casing = (): ReturnType<typeof hard> => hard('#141517', 0.55, 0.5, 0.3, Micro.cast);
const copperF = (): ReturnType<typeof hard> => hard(COPPER, 0.9, 0.3, 0.4, Micro.anodised);

// ───────────────────────────── structure: battery casing, motor, frame ─────────────────────────────

function batteryCasing(ctx: KitContext): void {
  const z0 = -1.0, z1 = -0.5;
  const ob: OutlineBody = {
    zs: stationsBetween(z0, z1, 12, 0.35),
    top: curve([[z0, 0.88], [-0.9, 0.9], [-0.7, 0.9], [z1, 0.86]]),
    bottom: curve([[z0, 0.46], [-0.85, 0.36], [-0.6, 0.34], [z1, 0.38]]),
    half: curve([[z0, 0.1], [-0.92, 0.135], [-0.7, 0.14], [z1, 0.12]]),
    sections: [{ z: z0, pts: [[0, 1], [0.6, 0.995], [0.95, 0.95], [1, 0.75], [1, 0.35], [0.93, 0.08], [0.7, 0], [0.3, 0], [0, 0]] }],
  };
  ctx.add('chassis', outlineLoft(ob, { ...bodyQ(ctx, 1.2), capFront: true, capBack: true }), casing());
  // Longitudinal cooling fins on both flanks, copper-edged lower rail
  for (const s of [-1, 1]) {
    const n = ctx.micro ? 13 : 7;
    for (let i = 0; i < n; i++) {
      const y = 0.44 + i * (0.4 / (n - 1));
      const hw = ob.half(-0.75) + 0.006;
      ctx.add('chassis', roundBox(0.012, 0.011, 0.44, 0.004, 1), hard('#1c1d20', 0.6, 0.42, 0.3, Micro.cast), T(s * hw, y, -0.74));
    }
    ctx.add('chassis', roundBox(0.014, 0.014, 0.5, 0.005, 1), copperF(), T(s * (ob.half(-0.75) + 0.008), 0.405, -0.73));
  }
}

function tankCover(ctx: KitContext): void {
  const ob: OutlineBody = {
    zs: stationsBetween(-1.04, -0.58, 14, 0.4),
    top: curve([[-1.04, 0.925], [-0.98, 0.975], [-0.88, 1.005], [-0.76, 1.012], [-0.66, 0.985], [-0.58, 0.945]]),
    bottom: curve([[-1.04, 0.86], [-0.9, 0.8], [-0.58, 0.8]]),
    half: curve([[-1.04, 0.07], [-0.98, 0.125], [-0.88, 0.17], [-0.76, 0.18], [-0.66, 0.15], [-0.58, 0.1]]),
    sections: [
      { z: -1.04, pts: [[0, 1], [0.5, 0.985], [0.82, 0.9], [0.98, 0.65], [1, 0.38], [0.94, 0.1], [0.84, 0]] },
      { z: -0.8, pts: [[0, 1], [0.55, 0.99], [0.86, 0.92], [1, 0.7], [1, 0.4], [0.94, 0.1], [0.84, 0]] },
    ],
  };
  const m = outlineLoft(ob, { ...bodyQ(ctx, 1.5), creases: [], capFront: true, capBack: true });
  shell(ctx, 'chassis', m, PAINT, 0.015);
  // Charge-port flap on the right with its copper ring
  ctx.add('chassis', roundBox(0.006, 0.07, 0.12, 0.003, 1), F.glossBlack, T(0.152, 0.92, -0.8));
  ctx.add('chassis', lathe([[0.016, 0], [0.024, 0.0], [0.024, 0.006], [0.016, 0.006]], { segs: ctx.seg(20, 8), axis: 'x', sharp: true }), copperF(), T(0.156, 0.92, -0.8));
  // Faint tank-top seam line + the glove-box style hinge
  pipeAlong(ctx, 'chassis', [[-0.095, 0.995, -0.98], [-0.1, 1.0, -0.82], [-0.09, 0.985, -0.66]], 0.0018, F.texturedBlack);
  pipeAlong(ctx, 'chassis', [[0.095, 0.995, -0.98], [0.1, 1.0, -0.82], [0.09, 0.985, -0.66]], 0.0018, F.texturedBlack);
}

function motorAndBelt(ctx: KitContext): void {
  const hp = ctx.hp;
  const pv = hp.pivot;
  // Motor: round housing concentric with the belt pulley; copper end plate on the right with a machined ring
  const c: P3 = [0, pv[1] - 0.03, pv[2] - 0.075];
  ctx.add('chassis', lathe([[0, -0.11], [0.1, -0.11], [0.118, -0.098], [0.118, 0.098], [0.1, 0.11], [0, 0.11]].map(([r, a]) => [r, a] as P2), { segs: ctx.seg(44, 16), axis: 'x', sharp: [1, 4] }), castTint('#26282c', 0.7, 0.45), T(...c));
  ctx.add('chassis', lathe([[0, 0], [0.1, 0], [0.103, 0.004], [0.1, 0.012], [0.06, 0.014], [0.0, 0.014]].map(([r, a]) => [r, a] as P2), { segs: ctx.seg(44, 16), axis: 'x', sharp: [1] }), copperF(), T(0.11, c[1], c[2]));
  ctx.add('chassis', lathe([[0.06, 0], [0.066, 0], [0.066, 0.004], [0.06, 0.004]], { segs: ctx.seg(36, 12), axis: 'x', sharp: true }), vary(F.chrome, { rough: 0.2 }), T(0.126, c[1], c[2]));
  if (ctx.micro) for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.add('chassis', lathe([[0, 0], [0.005, 0], [0.005, 0.005], [0, 0.005]], { segs: 6, axis: 'x', sharp: true }), F.steel, T(0.12, c[1] + Math.cos(a) * 0.088, c[2] + Math.sin(a) * 0.088));
  }
  // Motor cooling fins around the case
  for (let i = 0; i < 6; i++) ctx.add('chassis', lathe([[0.112, -0.004], [0.126, -0.002], [0.126, 0.002], [0.112, 0.004]], { segs: ctx.seg(40, 14), axis: 'x', sharp: true }), castTint('#26282c', 0.7, 0.45), T(-0.07 + i * 0.026, c[1], c[2]));
  // Orange high-voltage cables from the battery to the motor
  for (const [x, dy] of [[0.07, 0.0], [0.095, 0.02]] as const) {
    pipeAlong(ctx, 'chassis', [[x, 0.46, -0.52], [x + 0.045, 0.42 + dy, -0.55], [x + 0.06, 0.38 + dy, c[2] + 0.04], [x + 0.045, c[1] + 0.09, c[2] + 0.012]], 0.0095, hard('#e8780f', 0, 0.55, 0.3));
  }
}

function frameStructure(ctx: KitContext): void {
  const hp = ctx.hp;
  const pv = hp.pivot;
  const head = hp.head;
  const alu = castTint('#33363b', 0.85, 0.42);
  // Cast steering-head block
  const hb = ctx.fromSteer([0, -0.07, 0.03]);
  ctx.add('chassis', roundBox(0.1, 0.16, 0.13, 0.03, 2), alu, mul(T(hb[0], hb[1], hb[2]), RX(hp.rake)));
  // Upper side beams from the head to the pivot plates, passing the sides of the battery casing
  for (const s of [-1, 1]) {
    const path: P3[] = [[s * 0.04, head[1] - 0.04, head[2] + 0.07], [s * 0.1, head[1] - 0.12, head[2] + 0.25], [s * 0.16, 0.8, -0.78], [s * 0.17, 0.62, -0.56], [s * 0.15, pv[1] + 0.14, pv[2] + 0.01]];
    ctx.add('chassis', beam(path, 0.055, 0.03, [1, 0.9, 0.9, 0.95, 1], ctx.seg(8, 3), 0.012), alu);
    // Lower rail under the casing to the pivot
    const low: P3[] = [[s * 0.035, head[1] - 0.2, head[2] + 0.1], [s * 0.1, 0.5, -0.92], [s * 0.16, 0.36, -0.72], [s * 0.16, pv[1] - 0.03, pv[2] + 0.02]];
    ctx.add('chassis', beam(low, 0.04, 0.026, [1, 0.9, 0.9, 1], ctx.seg(8, 3), 0.01), alu);
    // Cast pivot plate
    const plate = smooth2([[pv[2] - 0.07, pv[1] + 0.17], [pv[2] + 0.03, pv[1] + 0.18], [pv[2] + 0.05, pv[1] + 0.04], [pv[2] + 0.02, pv[1] - 0.05], [pv[2] - 0.05, pv[1] - 0.05], [pv[2] - 0.09, pv[1] + 0.04]], ctx.micro ? 4 : 2, true);
    ctx.add('chassis', extrude(plate, 0.03, { plane: 'zy', bevel: 0.008, center: s * 0.172, curveSegs: 1 }), alu);
    ctx.add('chassis', lathe([[0, 0], [0.02, 0], [0.022, 0.006], [0.02, 0.014], [0, 0.014]], { segs: 6, axis: 'x', sharp: true }), F.steel, mul(T(s * 0.19, pv[1], pv[2]), s > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)));
    // Subframe: aluminium tubes from the pivot plate to the tail
    ctx.add('chassis', beam([[s * 0.15, pv[1] + 0.2, pv[2] + 0.0], [s * 0.1, 0.8, -0.2], [s * 0.065, 0.835, 0.14]], 0.04, 0.024, [1, 0.85, 0.7], ctx.seg(8, 3), 0.008), alu);
    ctx.add('chassis', beam([[s * 0.15, pv[1] + 0.08, pv[2] + 0.04], [s * 0.1, 0.66, -0.16], [s * 0.07, 0.72, 0.12]], 0.03, 0.02, [1, 0.85, 0.7], ctx.seg(8, 3), 0.007), alu);
  }
  ctx.add('chassis', rod([-0.07, 0.83, 0.12], [0.07, 0.83, 0.12], 0.009, 0.009, 10), alu);
}

// ───────────────────────────── front end, seat, tail ─────────────────────────────

function frontEnd(ctx: KitContext): void {
  const hp = ctx.hp;
  const head = hp.head;
  const lampAt: P3 = [0, head[1] - 0.075, head[2] - 0.2];
  // Round LED lamp (black bezel, ring DRL) in a short nacelle bracket
  roundHeadlight(ctx, 'steer', lampAt, 0.088, [0, -0.04, -1], { led: true, chrome: false });
  bezelRing(ctx, 'steer', [lampAt[0], lampAt[1], lampAt[2] + 0.018], [0, -0.04, -1], 0.094, 0.0045, hard('#1b1c1f', 0.6, 0.3, 0.5));
  for (const s of [-1, 1]) {
    ctx.add('steer', roundBox(0.03, 0.026, 0.13, 0.008, 2), alu(), T(s * 0.093, lampAt[1] + 0.01, lampAt[2] + 0.07));
    indicatorPod(ctx, 'steer', [s * 0.12, lampAt[1] - 0.06, lampAt[2] + 0.14], [s * 0.17, lampAt[1] - 0.075, lampAt[2] + 0.15], 0.012);
  }
  frontFender(ctx, { from: -0.5, to: 0.8, gap: 0.022, width: 0.15, f: PAINT });
}

function alu(): ReturnType<typeof hard> {
  return castTint('#2b2d31', 0.8, 0.42);
}

function seatAndTail(ctx: KitContext): void {
  buildSeat(ctx, { front: -0.66, back: 0.1, yFront: 0.795, y: 0.81, yBack: 0.85, width: 0.3, thick: 0.08, frontWidth: 0.16 });
  // Short, upswept tail with the LED strip
  const ob: OutlineBody = {
    zs: stationsBetween(0.0, 0.36, 9, 0.5),
    top: curve([[0.0, 0.84], [0.14, 0.88], [0.28, 0.9], [0.36, 0.89]]),
    bottom: curve([[0.0, 0.7], [0.18, 0.74], [0.36, 0.8]]),
    half: curve([[0.0, 0.1], [0.14, 0.095], [0.26, 0.07], [0.36, 0.045]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.97], [0.92, 0.82], [1, 0.5], [0.85, 0.15], [0.5, 0.0], [0, 0]] }],
  };
  shell(ctx, 'chassis', outlineLoft(ob, { ...bodyQ(ctx, 1.2), capFront: false, capBack: true }), PAINT, 0.01);
  ledStrip(ctx, 'chassis', [[-0.05, 0.855, 0.355], [0, 0.862, 0.362], [0.05, 0.855, 0.355]], 0.014, 0.006, 'tail', [0, 1, 0]);
  for (const s of [-1, 1]) indicatorPod(ctx, 'chassis', [s * 0.05, 0.8, 0.3], [s * 0.1, 0.8, 0.325], 0.011);
  hugger(ctx, F.glossBlack, -0.15, 1.0);
  plateHanger(ctx, { fromZ: 0.18, fromY: 0.72 });
}

function body(ctx: KitContext): void {
  batteryCasing(ctx);
  tankCover(ctx);
  motorAndBelt(ctx);
  frameStructure(ctx);
  frontEnd(ctx);
  seatAndTail(ctx);
}

// ───────────────────────────── livery ─────────────────────────────

function paintText(p: Pen): void {
  if (p.view === 'right' || p.view === 'left') {
    p.text('LIVEWIRE', -0.82, 0.93, { color: COPPER, size: 0.026, weight: '800', spacing: 0.28, finish: 'satin' });
    p.rect(-1.0, 0.86, -0.6, 0.865, COPPER, 'satin');
  }
  if (p.view === 'top') p.rect(-1.02, -0.003, -0.6, 0.003, COPPER, 'satin');
}

function livery(c: LiveryCanvas, lv: Livery, _env: LiveryEnv): void {
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, 'satin');
    paintText(p);
  });
}

export function liveWireOneBlueprint(spec: BikeSpec): BikeBlueprint {
  const black = '#141518';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.14, 0.8, 1.17],
    wheelbase: 1.49,
    rakeDeg: 24.5,
    trail: 0.1,
    forkLength: 0.74,
    front: { tyre: '120/70ZR17', rimWidthIn: 3.5, tyreLabel: 'Sport Radial', tread: 'sport', crown: 0.9 },
    rear: { tyre: '180/55ZR17', rimWidthIn: 5.5, tyreLabel: 'Sport Radial', tread: 'sport', crown: 1.0 },
    frontWheel: { type: 'cast', spokes: 5, shape: 'y', color: '#16171a', stripe: COPPER },
    rearWheel: { type: 'cast', spokes: 5, shape: 'y', color: '#16171a', stripe: COPPER },
    fork: { type: 'usd', stanchion: 0.043, spacing: 0.2, outerColor: black, innerColor: '#c8ccd2', footColor: '#2a2c30', capColor: '#2a2c30', adjusterColor: COPPER, aboveClamp: 0.012, clampGap: 0.2 },
    frontBrake: { discs: 2, discDia: 0.3, disc: 'floating', carrierColor: '#2a2c30', caliper: 'radial4', caliperColor: '#1c1d20', caliperAngleDeg: 78 },
    rearBrake: { discs: 1, discDia: 0.26, disc: 'fixed', carrierColor: '#2a2c30', caliper: 'axial1', caliperColor: '#1c1d20', caliperAngleDeg: 205 },
    frame: { type: 'twinSpar', color: '#2b2d31', metal: 0.8, rough: 0.42, subframe: 'cast', subframeColor: '#2b2d31', width: 0.38 },
    swingarm: { type: 'box', length: 0.58, angleDeg: 4, color: '#26282c', metal: 0.7, rough: 0.45 },
    shock: { layout: 'mono', springColor: COPPER, bodyColor: '#1c1d20', reservoir: true },
    drive: { type: 'belt', side: 'left', frontTeeth: 28, rearTeeth: 64, sprocketColor: '#2a2c30' },
    engine: { layout: 'ELECTRIC', cc: 0, crank: [0, 0.325, -0.65], tiltDeg: 0, caseColor: '#26282c', coverColor: COPPER, headColor: '#26282c', camCoverColor: '#26282c', finned: true, liquidCooled: false },
    exhaust: { route: 'none', side: 'right', can: 'round', canLength: 0.3, canDia: 0.08, canFinish: 'black', headerFinish: 'black' },
    cockpit: {
      bars: 'tubular',
      grip: [0.37, 1.07, -1.05],
      barDia: 0.0222,
      dash: 'tftWide',
      dashPos: [0, 1.085, -1.145],
      dashSize: [0.13, 0.082],
      dashTiltDeg: 52,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.4, 1.2, -1.02],
      mirrorSize: [0.1, 0.06],
      mirrorShape: 'rect',
      mirrorColor: '#16171a',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#2a2c30',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: COPPER,
    },
    lights: { head: 'round', tail: 'strip', rearIndicators: 'integrated' },
    seat: { height: 0.78, front: -0.66, back: 0.1, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.875, -0.42], peg: [0.26, 0.36, -0.2], torsoPitch: 0.4 },
    footrests: 'peg',
    plate: { mount: 'hanger', pos: [0, 0.62, 0.48], tiltDeg: -18 },
    body,
    livery,
    groundClearance: 0.14,
    features: ['skip:frame', 'skip:engine'],
    zones: { splitY: 0.5, decal: [-0.82, 0.93] },
  };
}

