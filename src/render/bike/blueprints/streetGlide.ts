import type { BikeSpec, Livery } from '../../../data/bikes';
import { RX, RY, T, mul, type KitContext } from '../context';
import { bodyQ, buildSeat, buildTank, PAINT, screen, seatFinish, shell } from '../kit/body';
import { plateHanger } from '../kit/rear';
import { indicatorPod, lamp, roundHeadlight } from '../kit/lights';
import { curve, outlineLoft, stationPts, stationsBetween, type OutlineBody } from '../kit/shape';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type Pen } from '../livery';
import { extrude, lathe, roundBox, smooth2, sweep, type P2, type P3 } from '../mesh';
import { F, hard, tint } from '../sink';
import { cut, fAnd, fNot, frontRegion } from '../surface';
import type { BikeBlueprint } from '../types';

/**
 * Harley-Davidson Street Glide (Milwaukee-Eight, dual-headlamp batwing generation).
 * Spec sheet: wheelbase 1625 mm, rake 26°, trail 170 mm, seat ~690 mm,
 * 130/60B19 front + 180/55B18 rear on cast wheels, 49 mm fork, steel cradle frame,
 * 45° Milwaukee-Eight V-twin (black cylinders with machined fins, chrome covers),
 * dual mufflers, belt drive.
 * Design cues: fork-mounted batwing fairing with two LED headlamps and a short
 * smoked screen, wide pull-back bars, big "Fat Bob" tank with a console, low
 * stepped seat, stretched hard saddlebags, long rear fender, floorboards.
 */

/** Batwing fairing shell (bike space at rest; it is added to the steering group). */
function batwingBody(): OutlineBody {
  return {
    zs: stationsBetween(-1.56, -1.27, 9, 0.45),
    top: curve([[-1.56, 1.0], [-1.52, 1.07], [-1.44, 1.13], [-1.36, 1.158], [-1.27, 1.165]]),
    bottom: curve([[-1.56, 0.86], [-1.5, 0.82], [-1.4, 0.8], [-1.27, 0.82]]),
    half: curve([[-1.56, 0.17], [-1.52, 0.29], [-1.45, 0.39], [-1.36, 0.44], [-1.27, 0.45]]),
    // Front view: wide flat top, rounded shoulders, the lower edge sweeping up to the wing tips.
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.99], [0.8, 0.95], [0.95, 0.85], [1, 0.7], [0.94, 0.52], [0.74, 0.3], [0.4, 0.08], [0, 0]] }],
  };
}

function bag(): OutlineBody {
  // Stretched saddlebag: angled front, long flat top, rounded rear, bottom kicked up at the back.
  return {
    zs: stationsBetween(-0.4, 0.33, 10, 0.5),
    top: curve([[-0.4, 0.66], [-0.34, 0.715], [-0.2, 0.73], [0.15, 0.73], [0.28, 0.715], [0.33, 0.68]]),
    bottom: curve([[-0.4, 0.5], [-0.3, 0.4], [-0.1, 0.38], [0.2, 0.39], [0.3, 0.43], [0.33, 0.5]]),
    half: curve([[-0.4, 0.07], [-0.33, 0.095], [0.0, 0.1], [0.26, 0.095], [0.33, 0.06]]),
    sections: [{ z: 0, pts: [[0, 1], [0.7, 0.99], [0.96, 0.92], [1, 0.6], [0.98, 0.15], [0.85, 0.01], [0, 0]] }],
    xOff: () => 0.335,
  };
}

function body(ctx: KitContext): void {
  const hp = ctx.hp;
  const chrome = F.chrome;
  // ── Batwing (turns with the fork) ──
  const ob = batwingBody();
  const lampCut = frontRegion([[0.0, 0.865], [0.165, 0.865], [0.165, 1.012], [0.0, 1.012]]);
  const shellMesh = cut(outlineLoft(ob, { ...bodyQ(ctx, 1.4), capFront: false }), fNot(fAnd(lampCut, (_x, _y, z) => -1.53 - z)));
  shell(ctx, 'steer', shellMesh, PAINT, 0.012);
  // Inner fairing: black panel closing the back, with gauges and the infotainment screen.
  const back = stationPts(ob, -1.272);
  const full: P2[] = [...back, ...back.slice(1, -1).reverse().map(([x, y]) => [-x, y] as P2)];
  ctx.add('steer', extrude(full, 0.012, { plane: 'xy', center: -1.272, bevel: 0.003, curveSegs: 1 }), F.texturedBlack);
  // Infotainment screen + the tach gauge (the animated speedo is the cockpit dash).
  ctx.add('steer', roundBox(0.17, 0.1, 0.012, 0.008, 2), F.glossBlack, mul(T(0, 1.07, -1.252), RX(-0.35)));
  ctx.add('steer', roundBox(0.155, 0.085, 0.004, 0.004, 1), tint(F.lens, '#1b2a3a'), mul(T(0, 1.07, -1.244), RX(-0.35)));
  ctx.add('steer', lathe([[0, 0], [0.05, 0], [0.056, 0.006], [0.054, 0.014], [0.046, 0.016], [0, 0.012]], { segs: ctx.seg(32, 12), axis: 'z' }), F.chrome, mul(T(0.16, 1.06, -1.255), RX(-0.35)));
  ctx.add('steer', lathe([[0, 0.013], [0.046, 0.013], [0.046, 0.014], [0, 0.014]], { segs: ctx.seg(32, 12), axis: 'z' }), hard('#f1ede2', 0, 0.5), mul(T(0.16, 1.06, -1.255), RX(-0.35)));
  // Headlamp nacelle: twin LED headlamps behind the cut-outs, chrome trim rings, fork-mounted bullet indicators.
  for (const s of [-1, 1]) {
    roundHeadlight(ctx, 'steer', [s * 0.085, 0.938, -1.545], 0.066, [0, -0.04, -1], { led: true, chrome: false });
    indicatorPod(ctx, 'steer', [s * 0.13, 0.78, -1.47], [s * 0.21, 0.79, -1.5], 0.016);
  }
  // Short smoked windscreen along the top edge.
  screen(ctx, 'steer', {
    zs: stationsBetween(-1.52, -1.36, 5, 0.3),
    top: curve([[-1.52, 1.16], [-1.45, 1.27], [-1.39, 1.3], [-1.36, 1.3]]),
    bottom: curve([[-1.52, 1.13], [-1.36, 1.19]]),
    half: curve([[-1.52, 0.25], [-1.42, 0.3], [-1.36, 0.3]]),
    sections: [{ z: 0, pts: [[0, 1], [0.5, 0.99], [0.85, 0.95], [1, 0.85], [1, 0]] }],
  }, tint(F.screen, '#2f343a'));
  // Chrome trim strip along the fairing top
  const trim: P3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = -0.4 + t * 0.8;
    const pts = stationPts(ob, -1.37);
    let y = pts[0][1];
    for (let k = 0; k < pts.length - 1; k++) if (Math.abs(x) >= pts[k][0] && Math.abs(x) <= pts[k + 1][0]) y = pts[k][1] + ((pts[k + 1][1] - pts[k][1]) * (Math.abs(x) - pts[k][0])) / (pts[k + 1][0] - pts[k][0] || 1);
    trim.push([x, y + 0.004, -1.37]);
  }
  ctx.add('steer', sweep(trim, smooth2([[0.003, 0], [0, 0.004], [-0.003, 0], [0, -0.004]], 2, true), { capStart: true, capEnd: true }), chrome);

  // ── Tank with chrome console, low stepped seat, side covers ──
  buildTank(ctx, {
    front: -1.2,
    back: -0.76,
    top: 0.985,
    bottomFront: 0.8,
    bottomBack: 0.72,
    width: 0.44,
    style: 'round',
    knee: 0,
    capZ: -0.93,
    topLine: [[-1.2, 0.93], [-1.12, 0.965], [-1.0, 0.985], [-0.88, 0.982], [-0.8, 0.95], [-0.76, 0.9]],
    bottomLine: [[-1.2, 0.8], [-1.0, 0.76], [-0.76, 0.72]],
    halfLine: [[-1.2, 0.15], [-1.1, 0.21], [-0.95, 0.225], [-0.82, 0.2], [-0.76, 0.15]],
  });
  ctx.add('chassis', roundBox(0.1, 0.02, 0.36, 0.008, 2), chrome, T(0, 0.988, -0.96));
  buildSeat(ctx, { front: -0.86, back: -0.44, yFront: 0.72, y: 0.69, yBack: 0.76, width: 0.36, thick: 0.09, frontWidth: 0.2 });
  buildSeat(ctx, { front: -0.44, back: -0.12, yFront: 0.775, y: 0.79, yBack: 0.82, width: 0.3, thick: 0.07, frontWidth: 0.26 }, tint(seatFinish(ctx), '#1a1714'));
  for (const s of [-1, 1]) {
    const cover: P2[] = smooth2([[-0.66, 0.66], [-0.47, 0.66], [-0.45, 0.54], [-0.57, 0.47], [-0.66, 0.52]], 3, true);
    ctx.add('chassis', extrude(cover, 0.03, { plane: 'zy', center: s * 0.17, bevel: 0.01, curveSegs: 1 }), PAINT);
  }
  // ── Saddlebags (painted shells, black lid seam, chrome latches) ──
  for (const s of [-1, 1]) {
    const b = bag();
    const m = outlineLoft({ ...b, xOff: () => s * 0.335 }, { ...bodyQ(ctx, 1.1), capFront: true, capBack: true });
    shell(ctx, 'chassis', m, PAINT, 0.01);
    const seam: P3[] = [];
    for (let i = 0; i <= 14; i++) {
      const z = -0.38 + (i / 14) * 0.69;
      seam.push([s * (0.335 + b.half(z) + 0.002), b.top(z) - 0.06, z]);
    }
    ctx.add('chassis', sweep(seam, smooth2([[0.004, 0], [0, 0.005], [-0.004, 0], [0, -0.005]], 2, true), { capStart: true, capEnd: true }), F.texturedBlack);
    ctx.add('chassis', roundBox(0.012, 0.05, 0.06, 0.005), chrome, T(s * 0.44, 0.66, -0.24));
    ctx.add('chassis', roundBox(0.012, 0.05, 0.06, 0.005), chrome, T(s * 0.44, 0.66, 0.16));
  }
  // ── Long rear fender with the tail light, guard rails ──
  {
    const r = hp.Rr + 0.04;
    const w = hp.rear.width / 2 + 0.04;
    const prof: P2[] = [];
    for (let i = 0; i <= 10; i++) {
      const x = -w + (2 * w * i) / 10;
      prof.push([-0.09 * Math.pow(Math.abs(x) / w, 2.4), x]);
    }
    for (let i = 10; i >= 0; i--) {
      const x = (-w + (2 * w * i) / 10) * 0.985;
      prof.push([-0.09 * Math.pow(Math.abs(x) / w, 2.4) - 0.004, x]);
    }
    const path: P3[] = [];
    const steps = ctx.seg(24, 8);
    for (let i = 0; i <= steps; i++) {
      const b = -0.55 + (2.25 * i) / steps;
      path.push([0, hp.Rr + Math.cos(b) * r, Math.sin(b) * r]);
    }
    ctx.add('chassis', sweep(path, prof, { up: [0, 1, 0], capStart: true, capEnd: true }), PAINT);
    const tl: P2[] = smooth2([[-0.07, -0.022], [0.07, -0.022], [0.075, 0.018], [-0.075, 0.018]], 3, true);
    const a = 1.32;
    lamp(ctx, 'chassis', tl, mul(T(0, hp.Rr + Math.cos(a) * (r + 0.008), Math.sin(a) * (r + 0.008)), RY(Math.PI), RX(-0.25 - (a - Math.PI / 2))), { kind: 'tail', inner: 'led', count: 1, depth: 0.03, housing: chrome });
    for (const s of [-1, 1]) indicatorPod(ctx, 'chassis', [s * 0.12, 0.6, 0.36], [s * 0.2, 0.6, 0.38], 0.016);
  }
  // Front fender: short "street" fender on the 19" wheel.
  {
    const A = hp.frontAxle;
    const r = hp.Rf + 0.03;
    const w = hp.front.width / 2 + 0.03;
    const prof: P2[] = [];
    for (let i = 0; i <= 10; i++) {
      const x = -w + (2 * w * i) / 10;
      prof.push([-0.06 * Math.pow(Math.abs(x) / w, 2.4), x]);
    }
    for (let i = 10; i >= 0; i--) {
      const x = (-w + (2 * w * i) / 10) * 0.985;
      prof.push([-0.06 * Math.pow(Math.abs(x) / w, 2.4) - 0.004, x]);
    }
    const path: P3[] = [];
    const steps = ctx.seg(20, 8);
    for (let i = 0; i <= steps; i++) {
      const b = -0.95 + (1.85 * i) / steps;
      path.push([0, A[1] + Math.cos(b) * r, A[2] + Math.sin(b) * r]);
    }
    ctx.add('forkLower', sweep(path, prof, { up: [0, 1, 0], capStart: true, capEnd: true }), PAINT);
  }
  // Engine guard (chrome) in front of the cylinders.
  for (const s of [-1, 1]) {
    const g: P3[] = [[s * 0.12, 0.72, -1.06], [s * 0.3, 0.6, -1.08], [s * 0.32, 0.42, -1.04], [s * 0.2, 0.3, -0.98]];
    ctx.add('chassis', sweep(g, smooth2([[0.015, 0], [0, 0.015], [-0.015, 0], [0, -0.015]], 3, true), { capStart: true, capEnd: true }), chrome);
  }
  plateHanger(ctx);
}

function lettering(p: Pen, color: string): void {
  if (p.view === 'right' || p.view === 'left') {
    p.text('HARLEY-DAVIDSON', -0.98, 0.86, { color, size: 0.03, weight: '800', spacing: 0.02 });
    p.text('Street Glide', -1.44, 1.06, { color, size: 0.028, italic: true, weight: '700' });
  }
}

function livery(c: LiveryCanvas, lv: Livery, env: LiveryEnv): void {
  const whiskey = env.index === 1;
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, whiskey ? 'metallic' : 'gloss');
    if (whiskey && (p.view === 'right' || p.view === 'left')) {
      // Black accent panel on the bags and the fairing lower edge
      p.poly([[-0.4, 0.5], [0.34, 0.5], [0.34, 0.36], [-0.4, 0.36]], '#1b1c1f', 'gloss');
    }
    lettering(p, whiskey ? '#e8c76a' : '#d6d8dc');
  });
}

export function streetGlideBlueprint(spec: BikeSpec): BikeBlueprint {
  return {
    id: spec.id,
    source: 'authored',
    overall: [2.4, 0.96, 1.33],
    wheelbase: 1.625,
    rakeDeg: 26,
    trail: 0.17,
    forkLength: 0.78,
    front: { tyre: '130/60B19', rimWidthIn: 3.5, crown: 1.1, tread: 'cruiser', tyreLabel: 'Touring Radial' },
    rear: { tyre: '180/55B18', rimWidthIn: 5.0, crown: 1.15, tread: 'cruiser', tyreLabel: 'Touring Radial' },
    frontWheel: { type: 'cast', spokes: 10, shape: 'straight', color: '#141518', machinedLip: true },
    rearWheel: { type: 'cast', spokes: 10, shape: 'straight', color: '#141518', machinedLip: true },
    fork: { type: 'rwu', stanchion: 0.049, spacing: 0.26, outerColor: '#17181b', innerColor: '#e6e8eb', footColor: '#17181b', capColor: '#e6e8eb', aboveClamp: 0.0, clampGap: 0.22 },
    frontBrake: { discs: 2, discDia: 0.3, disc: 'floating', carrierColor: '#17181b', caliper: 'radial4', caliperColor: '#17181b', caliperText: 'brembo', caliperTextColor: '#d6d8dc', caliperAngleDeg: 70 },
    rearBrake: { discs: 1, discDia: 0.3, disc: 'floating', carrierColor: '#17181b', caliper: 'axial2', caliperColor: '#17181b', caliperAngleDeg: 200 },
    frame: { type: 'cradle', color: '#141518', metal: 0.3, rough: 0.4, subframe: 'tubular', subframeColor: '#141518' },
    swingarm: { type: 'tubular', length: 0.56, angleDeg: 4, color: '#141518', metal: 0.3, rough: 0.4 },
    shock: { layout: 'twin', springColor: '#141518', bodyColor: '#e6e8eb', reservoir: false },
    drive: { type: 'belt', side: 'left', frontTeeth: 30, rearTeeth: 68, sprocketColor: '#c9ccd2' },
    engine: {
      layout: 'V2_45',
      cc: 1923,
      crank: [0, 0.34, -0.84],
      tiltDeg: 67.5,
      caseColor: '#16171a',
      coverColor: '#e6e8eb',
      headColor: '#16171a',
      camCoverColor: '#e6e8eb',
      camCoverText: 'MILWAUKEE-EIGHT',
      finned: true,
      liquidCooled: false,
    },
    exhaust: { route: 'dualSide', side: 'both', can: 'slash', canLength: 0.62, canDia: 0.1, canFinish: 'chrome', headerFinish: 'chrome' },
    cockpit: {
      bars: 'cruiser',
      grip: [0.43, 1.08, -1.04],
      barDia: 0.0254,
      dash: 'harley',
      dashPos: [-0.16, 1.06, -1.252],
      dashSize: [0.096, 0.096],
      dashTiltDeg: 20,
      dashMount: 'bars',
      mirrors: 'bar',
      mirrorPos: [0.36, 1.27, -1.08],
      mirrorSize: [0.13, 0.075],
      mirrorIndicators: false,
      mirrorShape: 'rect',
      mirrorColor: '#e6e8eb',
      topClamp: 'riser',
      steeringDamper: 'none',
      leverColor: '#e6e8eb',
      reservoirs: true,
      clutch: 'hydraulic',
      ignition: 'keyless',
      switchColor: '#141518',
      gripColor: '#141414',
      barEndColor: '#e6e8eb',
    },
    lights: { head: 'batwing', tail: 'custom', rearIndicators: 'stalk' },
    seat: { height: 0.69, front: -0.86, back: -0.44, pillion: 'seat', color: '#141210' },
    rider: { hip: [0, 0.79, -0.58], peg: [0.28, 0.3, -1.0], torsoPitch: -0.05 },
    footrests: 'floorboard',
    plate: { mount: 'fender', pos: [0, 0.5, 0.37], tiltDeg: -18 },
    body,
    livery,
    groundClearance: 0.125,
    features: ['chromeEngine'],
    zones: { splitY: 0.3, decal: [-0.98, 0.86] },
  };
}
