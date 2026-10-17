import type { BikeSpec, Livery } from '../../../data/bikes';
import { T, type KitContext } from '../context';
import { bodyQ, buildTank, PAINT, seatFinish } from '../kit/body';
import { blackPipe, can, clampRing, heatShield, pipe, portFlange } from '../kit/cruisers-exhaust';
import { indicatorPod, roundHeadlight } from '../kit/lights';
import { plateHanger } from '../kit/rear';
import { curve, outlineLoft, SECTIONS, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { roundBox, type P3 } from '../mesh';
import { F, tint, vary } from '../sink';
import type { BikeBlueprint } from '../types';
import { footPegs, pillionPegs, sideStand } from './family-cruisers-controls';
import { bead, capMeshOf, fenderArc, roundTailLamp, sidePlate, tubeAlong } from './family-cruisers-parts';

/**
 * Honda Rebel 500 (2024): the small bobber.
 * Spec sheet: wheelbase 1485 mm, rake 28°, trail 110 mm, seat 690 mm, 130/90-16 front + 150/80-16 rear
 * on black cast wheels, 41 mm fork, single 296 mm front disc, steel diamond frame, 471 cc DOHC
 * parallel twin (chain drive left), twin black shocks, black megaphone-style silencer on the right.
 * Design cues: round headlight, short peanut tank, long flat low bench seat, bobbed fenders, flat low bar.
 */

function tankTop(ctx: KitContext): OutlineBody {
  return buildTank(ctx, {
    front: -1.12,
    back: -0.66,
    top: 0.85,
    bottomFront: 0.69,
    bottomBack: 0.66,
    width: 0.31,
    style: 'round',
    knee: 0.1,
    capZ: -0.93,
    topLine: [[-1.12, 0.775], [-1.07, 0.815], [-0.98, 0.845], [-0.88, 0.85], [-0.78, 0.835], [-0.7, 0.805], [-0.66, 0.78]],
    bottomLine: [[-1.12, 0.69], [-1.0, 0.66], [-0.84, 0.645], [-0.66, 0.66]],
    halfLine: [[-1.12, 0.07], [-1.06, 0.115], [-0.96, 0.15], [-0.84, 0.155], [-0.74, 0.135], [-0.66, 0.095]],
  });
}

/** Long, low, flat bench seat with a slightly raised pillion half. */
function seatBody(ctx: KitContext): void {
  const ob: OutlineBody = {
    zs: stationsBetween(-0.91, -0.03, 14, 0.4),
    top: curve([[-0.91, 0.715], [-0.84, 0.706], [-0.7, 0.692], [-0.5, 0.688], [-0.36, 0.7], [-0.25, 0.722], [-0.14, 0.735], [-0.06, 0.727], [-0.03, 0.71]]),
    bottom: curve([[-0.91, 0.665], [-0.7, 0.6], [-0.4, 0.595], [-0.1, 0.63], [-0.03, 0.66]]),
    half: curve([[-0.91, 0.045], [-0.84, 0.08], [-0.72, 0.135], [-0.5, 0.16], [-0.3, 0.165], [-0.14, 0.15], [-0.05, 0.1], [-0.03, 0.07]]),
    sections: [{ z: -0.91, pts: SECTIONS.seat }],
  };
  const m = outlineLoft(ob, { ...bodyQ(ctx, 1.2), capFront: true, capBack: false });
  ctx.add('chassis', m, seatFinish(ctx));
  ctx.add('chassis', capMeshOf(ob, -0.03, true), seatFinish(ctx));
  // Stitched seam where the rider and pillion halves meet.
  const seam: P3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = (t - 0.5) * 0.28;
    seam.push([x, 0.699 + 0.014 * Math.pow(Math.abs(t - 0.5) * 2, 2) + 0.004, -0.34]);
  }
  bead(ctx, 'chassis', seam, 0.0016, tint(F.rubber, '#2a2a2a'));
}

function body(ctx: KitContext): void {
  const hp = ctx.hp;
  const black = F.glossBlack;
  buildTankAndSeat(ctx);

  // ── Bobbed rear fender with the little round LED lamp and the plate on a bracket ──
  fenderArc(ctx, { group: 'chassis', cz: 0, cy: hp.Rr, r: hp.Rr + 0.03, a0: -0.28, a1: 1.78, half: 0.088, drop: 0.045, power: 2.4, f: PAINT, taper: [0.9, 0.92] });
  const lampA = 1.76;
  const rr = hp.Rr + 0.03;
  roundTailLamp(ctx, [0, hp.Rr + Math.cos(lampA) * (rr + 0.01), Math.sin(lampA) * (rr + 0.01)], 0.032, -0.2 - (lampA - Math.PI / 2) * 0.9, 'chassis', F.glossBlack);
  // Fender stays (two bent tubes from the seat rails to the fender).
  for (const s of [-1, 1]) {
    tubeAlong(ctx, 'chassis', [[s * 0.1, 0.62, -0.2], [s * 0.1, 0.56, -0.02], [s * 0.095, 0.54, 0.16]], 0.007, F.black);
  }
  plateHanger(ctx, { fromZ: 0.1, fromY: 0.53 });
  for (const s of [-1, 1]) indicatorPod(ctx, 'chassis', [s * 0.07, 0.5, 0.28], [s * 0.16, 0.52, 0.33], 0.014);

  // ── Short bobbed front fender on the fork ──
  fenderArc(ctx, { group: 'forkLower', cz: hp.frontAxle[2], cy: hp.frontAxle[1], r: hp.Rf + 0.026, a0: -0.72, a1: 0.95, half: 0.082, drop: 0.04, power: 2.4, f: PAINT });

  // ── Round headlight: black bucket, chrome ring, small side brackets ──
  const hl: P3 = [0, hp.head[1] - 0.075, hp.head[2] - 0.2];
  roundHeadlight(ctx, 'steer', hl, 0.071, [0, 0.0, -1], { led: true, chrome: false });
  for (const s of [-1, 1]) {
    ctx.add('steer', roundBox(0.012, 0.03, 0.05, 0.004), black, T(s * 0.082, hl[1] + 0.0, hl[2] + 0.07));
    indicatorPod(ctx, 'steer', [s * 0.09, hl[1] - 0.035, hl[2] + 0.07], [s * 0.15, hl[1] - 0.04, hl[2] + 0.06], 0.014);
  }

  // ── Exhaust: two chrome headers sweep down and back into one matte-black megaphone on the right ──
  exhaust(ctx);

  // ── Foot controls: rubber pegs on stamped black hangers, side stand ──
  footPegs(ctx, { at: ctx.bp.rider.peg, f: F.satinBlack, pivot: hp.pivot });
  pillionPegs(ctx, [0.2, 0.42, 0.16], F.satinBlack);
  sideStand(ctx);

  // ── Side covers, battery box, air-box cover (black plastic) ──
  sidePlate(ctx, [[-0.62, 0.64], [-0.34, 0.64], [-0.3, 0.57], [-0.34, 0.47], [-0.5, 0.42], [-0.62, 0.46]], 0.12, 0.022, black);
  sidePlate(ctx, [[-0.3, 0.62], [-0.12, 0.64], [-0.06, 0.58], [-0.1, 0.5], [-0.28, 0.5]], 0.112, 0.016, F.texturedBlack);
  // Pillion grab-less tail: nothing.
}

function buildTankAndSeat(ctx: KitContext): void {
  tankTop(ctx);
  seatBody(ctx);
}

/** Exhaust ports of the inline-twin block (mirrors the generic engine layout so headers meet the head). */
function ports(ctx: KitContext): { pos: P3; dir: P3 }[] {
  const e = ctx.bp.engine;
  const k = Math.cbrt(e.cc / 1000);
  const t = (e.tiltDeg * Math.PI) / 180;
  const c = e.crank;
  const cyl: P3 = [0, Math.cos(t), -Math.sin(t)];
  const fwd: P3 = [0, -Math.sin(t), -Math.cos(t)];
  const pitch = 0.095 * k + 0.006;
  const d = 0.33 * k, f = 0.1 * k;
  const y = c[1] + cyl[1] * d + fwd[1] * f;
  const z = c[2] + cyl[2] * d + fwd[2] * f;
  return [-1, 1].map((s) => ({ pos: [s * pitch * 0.5, y, z] as P3, dir: [0, -0.35, -0.94] as P3 }));
}

function exhaust(ctx: KitContext): void {
  const hdr = F.chrome;
  const ps = ports(ctx);
  const [pl, pr] = ps;
  const r = 0.0185;
  const right = pipe(ctx, [pr.pos, [pr.pos[0] + 0.004, pr.pos[1] - 0.05, pr.pos[2] - 0.07], [0.06, 0.36, -1.0], [0.125, 0.255, -0.94], [0.175, 0.222, -0.78], [0.195, 0.222, -0.62]], r, hdr);
  pipe(ctx, [pl.pos, [pl.pos[0] - 0.004, pl.pos[1] - 0.05, pl.pos[2] - 0.07], [-0.02, 0.35, -1.01], [0.035, 0.26, -1.0], [0.11, 0.215, -0.86], [0.175, 0.212, -0.68], [0.195, 0.215, -0.6]], r, hdr);
  for (const p of ps) portFlange(ctx, p.pos, [0, 0.2, 0.98], r, F.steel);
  clampRing(ctx, right, 5, r, F.steel);
  // Heat shield over the right-hand run, perforated chrome.
  heatShield(ctx, right, 3, 9, r, vary(F.chrome, { rough: 0.12 }), { span: Math.PI * 1.1, centre: Math.PI * 0.4, slots: 4 });
  // Megaphone-style silencer, matte black with a polished slash-cut mouth.
  const a: P3 = [0.195, 0.222, -0.6];
  const b: P3 = [0.212, 0.278, 0.03];
  can(ctx, a, b, { r: 0.046, rEnd: 0.062, kind: 'tapered', f: blackPipe, capF: F.chrome, slash: 0.5, slashDir: 'out', bands: 1, bandF: F.chrome });
  ctx.anchor('exhaustOutlet', b);
  // Silencer hanger bracket to the rear footpeg plate.
  tubeAlong(ctx, 'chassis', [[0.2, 0.26, -0.3], [0.15, 0.32, -0.3], [0.1, 0.36, -0.32]], 0.006, F.black);
}

// ───────────────────────────── livery ─────────────────────────────

function lettering(p: Pen, color: string): void {
  if (p.view === 'right') {
    p.text('HONDA', -0.9, 0.745, { color, size: 0.034, weight: '800', spacing: 0.06, finish: 'chrome' });
  } else if (p.view === 'left') {
    p.text('HONDA', -0.9, 0.745, { color, size: 0.034, weight: '800', spacing: 0.06, finish: 'chrome' });
  }
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const gray = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    // Matte gunpowder black (index 0) / pearl smoky gray (index 1)
    p.fill(lv.primary, gray ? 'pearl' : 'matte');
    lettering(p, gray ? '#1d1f22' : '#c8ccd2');
    if (p.view === 'right' || p.view === 'left') {
      // Small red/white wing-mark panel on the tank sides.
      p.rect(-1.04, 0.69, -0.76, 0.695, lv.secondary, 'gloss');
    }
  });
}

export function rebel500Blueprint(spec: BikeSpec): BikeBlueprint {
  const black = '#17181a';
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.19, 0.82, 1.09],
    wheelbase: 1.485,
    rakeDeg: 28,
    trail: 0.11,
    forkLength: 0.65,
    front: { tyre: '130/90-16', rimWidthIn: 3.0, crown: 1.05, tread: 'cruiser', tyreLabel: 'Cruise' },
    rear: { tyre: '150/80-16', rimWidthIn: 3.5, crown: 1.1, tread: 'cruiser', tyreLabel: 'Cruise' },
    frontWheel: { type: 'cast', spokes: 5, shape: 'split', color: black },
    rearWheel: { type: 'cast', spokes: 5, shape: 'split', color: black },
    fork: { type: 'rwu', stanchion: 0.041, spacing: 0.205, outerColor: black, innerColor: '#2b2d31', footColor: black, capColor: '#2b2d31', aboveClamp: 0.0, clampGap: 0.2 },
    frontBrake: { discs: 1, discDia: 0.296, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial2', caliperColor: black, caliperAngleDeg: 100 },
    rearBrake: { discs: 1, discDia: 0.24, disc: 'fixed', carrierColor: '#2b2d31', caliper: 'axial1', caliperColor: black, caliperAngleDeg: 205 },
    frame: { type: 'cradle', color: black, metal: 0.3, rough: 0.45, subframe: 'tubular', subframeColor: black, width: 0.3 },
    swingarm: { type: 'tubular', length: 0.53, angleDeg: 8, color: black, metal: 0.3, rough: 0.45 },
    shock: { layout: 'twin', springColor: '#2b2d31', bodyColor: '#1d1e21', reservoir: false },
    drive: { type: 'chain', side: 'left', frontTeeth: 15, rearTeeth: 40, sprocketColor: '#2b2d31', chainColor: '#2b2b2b' },
    engine: {
      layout: 'P2_180',
      cc: 471,
      crank: [0, 0.33, -0.7],
      tiltDeg: 30,
      caseColor: '#1b1c1f',
      coverColor: '#232428',
      headColor: '#1b1c1f',
      camCoverColor: '#202226',
      finned: false,
      liquidCooled: true,
      radiator: { w: 0.2, h: 0.22, z: -1.07, y: 0.5, tiltDeg: 12 },
      filterColor: '#1b1c1f',
    },
    exhaust: { route: 'none', side: 'right', can: 'round', canLength: 0.6, canDia: 0.09, canFinish: 'black', headerFinish: 'chrome' },
    cockpit: {
      bars: 'tall',
      grip: [0.37, 0.965, -1.02],
      barDia: 0.0222,
      dash: 'tftRound',
      dashPos: [0, 1.0, -1.15],
      dashSize: [0.088, 0.088],
      dashTiltDeg: 38,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.37, 1.12, -1.0],
      mirrorSize: [0.105, 0.105],
      mirrorIndicators: false,
      mirrorShape: 'round',
      mirrorColor: '#111214',
      topClamp: 'cast',
      steeringDamper: 'none',
      leverColor: '#222428',
      reservoirs: false,
      clutch: 'cable',
      ignition: 'tank',
      switchColor: '#151618',
      gripColor: '#121212',
      barEndColor: '#2a2c30',
    },
    lights: { head: 'round', tail: 'round', rearIndicators: 'stalk' },
    seat: { height: 0.69, front: -0.9, back: -0.03, pillion: 'seat', color: '#151515' },
    rider: { hip: [0, 0.785, -0.5], peg: [0.26, 0.3, -0.8], torsoPitch: 0.1 },
    // 'scooter' = the generic kit builds no rearsets / stand; the body adds the Rebel's own pegs.
    footrests: 'scooter',
    plate: { mount: 'fender', pos: [0, 0.5, 0.375], tiltDeg: -14 },
    body,
    livery,
    groundClearance: 0.135,
    features: [],
    zones: { splitY: 0.58, decal: [-0.9, 0.745] },
  };
}

