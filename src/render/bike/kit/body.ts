import * as THREE from 'three';
import { RX, RY, T, mul, type KitContext } from '../context';
import { MeshData, bolt, extrude, lathe, rod, roundBox, smooth2, sweep, tube, type P2, type P3 } from '../mesh';
import { F, fin, hard, Micro, tint, vary, type Finish, type GroupName } from '../sink';
import { cut, fAnd, fNot, flange, panel, planRegion, sideRegion, type Field } from '../surface';
import { lamp, ledStrip, roundHeadlight, indicatorPod } from './lights';
import { hugger, plateHanger } from './rear';
import { curve, outlineLoft, SECTIONS, stationPts, stationsBetween, surfaceAt, type OutlineBody } from './shape';

/** Painted / carbon / black plastic finishes for bodywork. */
export const PAINT = F.paint;

export function seatFinish(ctx: KitContext): Finish {
  return fin('seat', ctx.bp.seat.color, 0, 0.62, 0, Micro.grain);
}

/** Loft quality for bodywork. */
export function bodyQ(ctx: KitContext, base = 1): { su: number; sv: number } {
  return { su: ctx.seg(9 * base, 3), sv: ctx.seg(5 * base, 2) };
}

/** Add a lofted shell with folded edges (gives thickness and dark panel gaps). */
export function shell(ctx: KitContext, group: GroupName, m: MeshData, f: Finish, depth = 0.01): void {
  if (!m.tcount) return;
  ctx.add(group, m, f);
  const fl = flange(m, { depth, roll: 0.0015 });
  if (fl.tcount) ctx.add(group, fl, f);
}

/** Cut a panel from a master surface and add it (with gap + folded edges). */
export function addPanel(ctx: KitContext, group: GroupName, master: MeshData, region: Field, f: Finish, gap = 0.003, depth = 0.012): MeshData {
  const p = panel(master, region, { gap, depth });
  if (p.tcount) ctx.add(group, p, f);
  return p;
}

// ───────────────────────────── tank ─────────────────────────────

export interface TankOpts {
  front: number;
  back: number;
  top: number;
  /** Bottom edge at the front / back. */
  bottomFront: number;
  bottomBack: number;
  width: number;
  style: 'sport' | 'teardrop' | 'round' | 'boxy' | 'adventure' | 'muscle';
  /** Knee recess depth (fraction of half width). */
  knee?: number;
  capZ?: number;
  /** Optional authored side-view top line / plan-view half-width line (override the style defaults). */
  topLine?: readonly P2[];
  bottomLine?: readonly P2[];
  halfLine?: readonly P2[];
}

export function tankBody(o: TankOpts): OutlineBody {
  const { front: zf, back: zb, top } = o;
  const L = zb - zf;
  const hw = o.width / 2;
  const tear = o.style === 'teardrop' || o.style === 'round';
  return {
    zs: stationsBetween(zf, zb, 11, 0.6),
    top: o.topLine ? curve(o.topLine) : curve([
      [zf, top - 0.07],
      [zf + L * 0.12, top - 0.02],
      [zf + L * 0.4, top],
      [zf + L * 0.75, top - (tear ? 0.03 : 0.035)],
      [zb, top - (tear ? 0.12 : 0.12)],
    ]),
    bottom: o.bottomLine ? curve(o.bottomLine) : curve([
      [zf, o.bottomFront],
      [zf + L * 0.5, (o.bottomFront + o.bottomBack) / 2 - 0.02],
      [zb, o.bottomBack],
    ]),
    half: o.halfLine ? curve(o.halfLine) : curve([
      [zf, hw * (tear ? 0.55 : 0.7)],
      [zf + L * 0.2, hw * 0.97],
      [zf + L * 0.45, hw],
      [zf + L * 0.78, hw * (tear ? 0.82 : 0.78)],
      [zb, hw * (tear ? 0.38 : 0.5)],
    ]),
    sections: [
      { z: zf, pts: o.style === 'boxy' || o.style === 'adventure' || o.style === 'muscle' ? SECTIONS.crisp : SECTIONS.round },
      { z: zb, pts: SECTIONS.round },
    ],
    shape: (z, pts) => {
      const k = o.knee ?? (tear ? 0 : 0.12);
      if (!k) return pts;
      // Knee recesses in the rear 40 % of the tank, mid-height.
      const t = Math.max(0, Math.min(1, (z - (zf + L * 0.55)) / (L * 0.3)));
      const s = t * t * (3 - 2 * t);
      return pts.map(([x, y], i) => (i >= 3 && i <= 5 ? [x * (1 - k * s * (i === 4 ? 1 : 0.6)), y] : [x, y]) as P2);
    },
  };
}

export function buildTank(ctx: KitContext, o: TankOpts, f: Finish = PAINT): OutlineBody {
  const ob = tankBody(o);
  const q = bodyQ(ctx);
  const m = outlineLoft(ob, { su: q.su, sv: q.sv, capFront: false });
  shell(ctx, 'chassis', m, f, 0.02);
  // Fuel cap: flush aircraft-style cap with bolt ring
  const cz = o.capZ ?? o.front + (o.back - o.front) * 0.33;
  const top = surfaceAt(ob, cz, 0);
  const capM = mul(T(0, top.p[1] - 0.001, cz), RX(Math.atan2(-top.n[2], top.n[1])));
  ctx.add('chassis', lathe(([[0, 0.006], [0.036, 0.006], [0.042, 0.002], [0.046, -0.004]] as P2[]).reverse(), { segs: ctx.seg(32, 12), axis: 'y' }), vary(F.brushedAlu, { micro: Micro.brushed }), capM);
  ctx.add('chassis', lathe(([[0, 0.0085], [0.026, 0.0085], [0.03, 0.006]] as P2[]).reverse(), { segs: ctx.seg(32, 12), axis: 'y' }), F.texturedBlack, capM);
  if (ctx.micro) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.26;
      ctx.add('chassis', bolt(0.0028, 0.003, false, 8), F.steel, mul(capM, T(Math.cos(a) * 0.039, 0.004, Math.sin(a) * 0.039)));
    }
  }
  return ob;
}

// ───────────────────────────── seat & tail ─────────────────────────────

export interface SeatOpts {
  front: number;
  back: number;
  /** Seat top height at front / crotch / back. */
  yFront: number;
  y: number;
  yBack: number;
  width: number;
  thick?: number;
  stitch?: boolean;
  frontWidth?: number;
}

export function buildSeat(ctx: KitContext, o: SeatOpts, f: Finish = seatFinish(ctx)): OutlineBody {
  const L = o.back - o.front;
  const thick = o.thick ?? 0.07;
  const fw = (o.frontWidth ?? o.width * 0.55) / 2;
  const ob: OutlineBody = {
    zs: stationsBetween(o.front, o.back, 8, 0.5),
    top: curve([[o.front, o.yFront], [o.front + L * 0.35, o.y], [o.front + L * 0.65, o.y + 0.005], [o.back, o.yBack]]),
    bottom: curve([[o.front, o.yFront - thick * 0.7], [o.back, o.yBack - thick]]),
    half: curve([[o.front, fw], [o.front + L * 0.4, o.width / 2], [o.front + L * 0.85, o.width / 2 * 0.95], [o.back, o.width / 2 * 0.7]]),
    sections: [{ z: o.front, pts: SECTIONS.seat }],
  };
  const q = bodyQ(ctx);
  const m = outlineLoft(ob, { su: q.su, sv: q.sv, capFront: true, capBack: true });
  ctx.add('chassis', m, f);
  if (o.stitch !== false && ctx.micro) {
    // Twin-needle stitching along the shoulder line.
    for (const s of [-1, 1]) {
      const pts: P3[] = [];
      for (let i = 1; i < 30; i++) {
        const z = o.front + (L * i) / 30;
        const sp = surfaceAt(ob, z, s * ob.half(z) * 0.82);
        pts.push([sp.p[0] + sp.n[0] * 0.0008, sp.p[1] + sp.n[1] * 0.0008, z]);
      }
      const dashes = new MeshData();
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const mid: P3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        dashes.append(rod(a, mid, 0.0011, 0.0011, 4, false));
      }
      ctx.add('chassis', dashes, tint(f, '#3a3a3a'));
    }
  }
  return ob;
}

export interface TailOpts {
  front: number;
  tip: number;
  yTop: number;
  yTipTop: number;
  yBottom: number;
  yTipBottom: number;
  width: number;
  tipWidth: number;
}

export function tailBody(o: TailOpts): OutlineBody {
  const L = o.tip - o.front;
  return {
    zs: stationsBetween(o.front, o.tip, 8, 0.55),
    top: curve([[o.front, o.yTop], [o.front + L * 0.5, (o.yTop + o.yTipTop) / 2 + 0.012], [o.tip, o.yTipTop]]),
    bottom: curve([[o.front, o.yBottom], [o.front + L * 0.6, o.yBottom + (o.yTipBottom - o.yBottom) * 0.7], [o.tip, o.yTipBottom]]),
    half: curve([[o.front, o.width / 2], [o.front + L * 0.6, (o.width / 2) * 0.82], [o.tip, o.tipWidth / 2]]),
    sections: [{ z: o.front, pts: SECTIONS.closed }],
  };
}

// ───────────────────────────── fenders & screens ─────────────────────────────

/** Front mudguard on the fork lowers: shell over the tyre between two angles (from vertical, + = rearwards). */
export function frontFender(ctx: KitContext, o: { from: number; to: number; gap?: number; width?: number; f?: Finish; long?: boolean }): void {
  const hp = ctx.hp;
  const A = hp.frontAxle;
  const r = hp.Rf + (o.gap ?? 0.022);
  const w = (o.width ?? hp.front.width + 0.03) / 2;
  const prof: P2[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const x = -w + (2 * w * i) / n;
    prof.push([-0.05 * Math.pow(Math.abs(x) / w, 2.6), x]);
  }
  for (let i = n; i >= 0; i--) {
    const x = (-w + (2 * w * i) / n) * 0.985;
    prof.push([-0.05 * Math.pow(Math.abs(x) / w, 2.6) - 0.0035, x]);
  }
  const steps = ctx.seg(22, 8);
  const path: P3[] = [];
  for (let i = 0; i <= steps; i++) {
    const b = o.from + ((o.to - o.from) * i) / steps;
    path.push([0, A[1] + Math.cos(b) * r, A[2] + Math.sin(b) * r]);
  }
  const m = sweep(path, prof, { up: [0, 1, 0], capStart: true, capEnd: true });
  ctx.add('forkLower', m, o.f ?? PAINT);
  // Mounting tabs to the fork legs
  for (const s of [-1, 1]) {
    const p: P3 = [s * (w + 0.008), A[1] + Math.cos(0.15) * r - 0.04, A[2] + Math.sin(0.15) * r];
    ctx.add('forkLower', roundBox(0.012, 0.05, 0.05, 0.005), F.texturedBlack, T(...p));
  }
}

/** Windscreen as a thin curved shell (rendered double sided, tinted). */
export function screen(ctx: KitContext, group: GroupName, ob: OutlineBody, f: Finish = F.screen): MeshData {
  const q = bodyQ(ctx);
  const m = outlineLoft(ob, { su: q.su, sv: q.sv });
  ctx.add(group, m, f);
  return m;
}

// ───────────────────────────── generic body ─────────────────────────────

/** Body for auto blueprints: style-driven parametric bodywork. */
export function genericBody(ctx: KitContext): void {
  const spec = ctx.spec;
  const look = spec.look;
  const hp = ctx.hp;
  const style = spec.style;
  const feats = new Set(ctx.bp.features ?? []);
  const hy = hp.head[1];
  const hz = hp.head[2];
  const sy = hp.seatY;
  const sf = hp.seatFront;
  const sb = hp.seatBack;
  const carbonWings = feats.has('winglets');

  if (look.fairing === 'scooter') {
    scooterBody(ctx);
    plateHanger(ctx);
    return;
  }

  // ── tank ──
  const touring = look.fairing === 'touring';
  const tankTop = Math.max(sy + 0.15, hy + (style === 'cruiser' ? 0.0 : 0.06));
  if (!touring) {
    const tank = look.tank;
    const w = tank === 'round' ? 0.34 : tank === 'teardrop' ? 0.4 : tank === 'adventure' ? 0.52 : tank === 'muscle' || tank === 'boxy' ? 0.48 : style === 'hyper' ? 0.47 : 0.44;
    buildTank(ctx, {
      front: hz + 0.0,
      back: sf + 0.04,
      top: tankTop,
      bottomFront: hy - (tank === 'adventure' ? 0.3 : 0.17),
      bottomBack: sy - 0.04,
      width: w,
      style: tank,
    });
  }

  // ── seat ──
  const cruiser = style === 'cruiser';
  buildSeat(ctx, {
    front: sf - 0.02,
    back: cruiser ? sb : ctx.bp.seat.pillion === 'cowl' ? sb : sb + 0.22,
    yFront: sy - 0.01,
    y: sy,
    yBack: cruiser ? sy + 0.04 : sy + 0.06,
    width: cruiser || touring ? 0.36 : style === 'adventure' ? 0.32 : 0.28,
    thick: cruiser ? 0.09 : 0.07,
  });

  // ── tail ──
  if (style === 'sport' || style === 'hyper' || style === 'naked') {
    const tipZ = sb + (style === 'naked' ? 0.3 : 0.36);
    const seatEnd = ctx.bp.seat.pillion === 'cowl' ? sb : sb + 0.22;
    const tail = tailBody({
      front: sf + 0.04,
      tip: tipZ,
      yTop: sy - 0.015,
      yTipTop: sy + (style === 'naked' ? 0.1 : 0.15),
      yBottom: sy - 0.2,
      yTipBottom: sy + (style === 'naked' ? 0.02 : 0.07),
      width: 0.3,
      tipWidth: 0.06,
    });
    const q = bodyQ(ctx);
    const m = outlineLoft(tail, { su: q.su, sv: q.sv, capBack: true });
    // The seat sits in a recess of the tail: remove its footprint.
    const seatHole: Field = fAnd(
      sideRegion([[sf - 0.1, sy - 0.03], [seatEnd, sy - 0.03], [seatEnd, sy + 0.5], [sf - 0.1, sy + 0.5]]),
      planRegion([[sf - 0.2, -0.01], [seatEnd - 0.03, -0.01], [seatEnd, 0.11], [seatEnd + 0.01, 0.135], [sf - 0.2, 0.135]]),
    );
    addPanel(ctx, 'chassis', m, fNot(seatHole), PAINT, 0.002, 0.012);
    // Undertray (black) closing the tail from below
    const ut = tailBody({ front: sf + 0.12, tip: tipZ - 0.04, yTop: sy - 0.17, yTipTop: sy + 0.05, yBottom: sy - 0.22, yTipBottom: sy + 0.02, width: 0.26, tipWidth: 0.05 });
    ctx.add('chassis', outlineLoft(ut, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), F.texturedBlack);
    // Tail light at the tip
    const tl: P2[] = smooth2([[-0.055, -0.01], [0.055, -0.01], [0.062, 0.006], [0.0, 0.014], [-0.062, 0.006]], 4, true);
    const ty = (tail.top(tipZ) + tail.bottom(tipZ)) / 2;
    lamp(ctx, 'chassis', tl, mul(T(0, ty, tipZ + 0.004), RX(-0.35)), { kind: 'tail', inner: 'led', count: 6, depth: 0.025 });
    hugger(ctx, F.texturedBlack);
    plateHanger(ctx, { fromZ: tipZ - 0.12, fromY: sy - 0.05 });
  } else if (style === 'cruiser' || style === 'classic') {
    rearFender(ctx, cruiser);
    plateHanger(ctx);
  } else {
    // Adventure / touring: luggage rack tail
    const tail = tailBody({ front: sf + 0.1, tip: sb + 0.32, yTop: sy - 0.02, yTipTop: sy + 0.06, yBottom: sy - 0.22, yTipBottom: sy - 0.06, width: 0.32, tipWidth: 0.18 });
    const q = bodyQ(ctx);
    const seatHole: Field = fAnd(sideRegion([[sf - 0.1, sy - 0.03], [sb + 0.25, sy - 0.03], [sb + 0.25, sy + 0.4], [sf - 0.1, sy + 0.4]]), planRegion([[sf - 0.2, -0.01], [sb + 0.24, -0.01], [sb + 0.24, 0.15], [sf - 0.2, 0.15]]));
    addPanel(ctx, 'chassis', outlineLoft(tail, { su: q.su, sv: q.sv }), fNot(seatHole), PAINT, 0.002, 0.012);
    const tl: P2[] = smooth2([[-0.07, -0.015], [0.07, -0.015], [0.07, 0.015], [-0.07, 0.015]], 3, true);
    lamp(ctx, 'chassis', tl, mul(T(0, sy - 0.02, sb + 0.33), RY(Math.PI)), { kind: 'tail', inner: 'led', count: 5, depth: 0.03 });
    // Rack
    for (const s of [-1, 1]) ctx.add('chassis', tube([[s * 0.12, sy - 0.0, sb + 0.05], [s * 0.13, sy + 0.04, sb + 0.25], [s * 0.05, sy + 0.04, sb + 0.36]], 0.009, 10, 6), F.texturedBlack);
    hugger(ctx, F.texturedBlack);
    plateHanger(ctx, { fromZ: sb + 0.25, fromY: sy - 0.12 });
  }

  // ── front ──
  switch (look.fairing) {
    case 'full':
      sportFairing(ctx, carbonWings, feats.has('bellypan'));
      frontFender(ctx, { from: -0.55, to: 0.95 });
      break;
    case 'half':
      halfFairing(ctx);
      frontFender(ctx, { from: -0.55, to: 0.95 });
      break;
    case 'adventure':
      adventureFront(ctx, feats.has('windscreenTall'));
      frontFender(ctx, { from: -0.3, to: 0.9, gap: 0.03 });
      break;
    case 'touring':
      touringFront(ctx);
      frontFender(ctx, { from: -0.6, to: 1.0 });
      break;
    case 'batwing':
      batwing(ctx);
      frontFender(ctx, { from: -0.9, to: 1.1, long: true });
      break;
    default:
      nakedFront(ctx, style, feats.has('flyscreen'));
      frontFender(ctx, { from: cruiser || style === 'classic' ? -1.0 : -0.5, to: cruiser || style === 'classic' ? 1.3 : 0.9, f: cruiser || style === 'classic' ? PAINT : PAINT });
  }
  if (feats.has('panniers')) panniers(ctx);
  if (feats.has('topcase')) topcase(ctx);
  if (feats.has('crashbars')) crashbars(ctx);
  // Side covers under the seat (unfaired bikes)
  if (look.fairing === 'none' || look.fairing === 'batwing') {
    for (const s of [-1, 1]) {
      const sc = smooth2([[sf + 0.0, sy - 0.04], [sf + 0.22, sy - 0.02], [sf + 0.24, sy - 0.18], [sf + 0.04, sy - 0.22]], 4, true);
      ctx.add('chassis', extrude(sc, 0.02, { plane: 'zy', bevel: 0.008, center: s * 0.135, curveSegs: 1 }), style === 'classic' || cruiser ? PAINT : F.texturedBlack);
    }
  }
}

/** Full sport fairing from a master surface, cut into cowl / side panels / belly pan with real gaps. */
export function sportFairing(ctx: KitContext, wings: boolean, bellyPainted: boolean): void {
  const hp = ctx.hp;
  const hy = hp.head[1];
  const hz = hp.head[2];
  const L = hp.L;
  const pv = hp.pivot;
  const B = ctx.spec.style === 'hyper' ? 1.08 : 1;
  const nose = -L - 0.1;
  const end = hz + 0.6;
  const ob: OutlineBody = {
    zs: stationsBetween(nose, end, 11, 0.55),
    top: curve([[nose, hy - 0.16], [nose + 0.07, hy - 0.09], [nose + 0.2, hy - 0.03], [hz - 0.08, hy + 0.0], [hz + 0.12, hy - 0.05], [hz + 0.38, hy - 0.22], [end, 0.5]]),
    bottom: curve([[nose, hy - 0.22], [nose + 0.07, hy - 0.34], [nose + 0.2, hy - 0.43], [hz - 0.08, 0.36], [hz + 0.12, 0.27], [hz + 0.38, 0.22], [end, 0.25]]),
    half: curve([[nose, 0.035], [nose + 0.07, 0.15 * B], [nose + 0.2, 0.25 * B], [hz - 0.08, 0.31 * B], [hz + 0.12, 0.32 * B], [hz + 0.38, 0.29 * B], [end, 0.17]]),
    sections: [
      { z: nose, pts: SECTIONS.nose },
      { z: hz - 0.08, pts: SECTIONS.round },
    ],
  };
  void pv;
  const q = bodyQ(ctx, 1.3);
  const master = outlineLoft(ob, { su: q.su, sv: q.sv });
  // Opening for tank / rider / steering behind the screen base.
  const open = sideRegion([
    [hz - 0.07, hy + 0.6],
    [hz - 0.07, hy - 0.035],
    [hz + 0.08, hy - 0.08],
    [hz + 0.3, hy - 0.16],
    [end + 0.2, 0.62],
    [end + 0.4, 2],
  ]);
  const body = cut(master, fNot(open));
  // Panels: upper cowl (front), side panels, lower belly
  const cowlR = sideRegion([[nose - 0.1, 2], [hz - 0.02, 2], [hz - 0.02, hy - 0.06], [nose + 0.3, hy - 0.2], [nose - 0.1, hy - 0.3]]);
  const bellyR = sideRegion([[nose, 0.34], [hz + 0.1, 0.34], [end + 0.1, 0.31], [end + 0.1, -1], [nose, -1]]);
  const sideR = fAnd(fNot(cowlR), fNot(bellyR));
  addPanel(ctx, 'chassis', body, cowlR, PAINT);
  // Vent cut into the side panels
  const vent = sideRegion(smooth2([[hz + 0.06, hy - 0.2], [hz + 0.22, hy - 0.24], [hz + 0.24, hy - 0.3], [hz + 0.08, hy - 0.28]], 4, true));
  addPanel(ctx, 'chassis', body, fAnd(sideR, fNot(vent)), PAINT);
  addPanel(ctx, 'chassis', body, bellyR, bellyPainted ? PAINT : F.texturedBlack);
  // Dark louvre behind the vent
  for (const s of [-1, 1]) {
    const sp = surfaceAt(ob, hz + 0.15, s * 0.3);
    const louv = smooth2([[hz + 0.06, hy - 0.2], [hz + 0.22, hy - 0.24], [hz + 0.24, hy - 0.3], [hz + 0.08, hy - 0.28]], 3, true);
    ctx.add('chassis', extrude(louv, 0.01, { plane: 'zy', center: sp.p[0] - s * 0.018 }), F.texturedBlack);
  }
  // Inner cockpit trim (black) between the cowl and the headstock.
  const inner = outlineLoft(
    {
      zs: stationsBetween(hz - 0.12, hz + 0.1, 5, 0.3),
      top: curve([[hz - 0.12, hy - 0.04], [hz + 0.1, hy - 0.09]]),
      bottom: curve([[hz - 0.12, hy - 0.2], [hz + 0.1, hy - 0.22]]),
      half: curve([[hz - 0.12, 0.27 * B], [hz + 0.1, 0.25 * B]]),
      sections: [{ z: hz, pts: SECTIONS.round.map(([x, y]) => [x, y] as P2) }],
    },
    { su: ctx.seg(4, 2), sv: ctx.seg(3, 2) },
  );
  ctx.add('chassis', cut(inner, fNot(planRegion([[hz - 0.3, -1], [hz + 0.3, -1], [hz + 0.3, 0.13], [hz - 0.3, 0.13]]))), F.texturedBlack);
  // Screen
  screen(ctx, 'chassis', {
    zs: stationsBetween(nose + 0.18, hz + 0.0, 6, 0.4),
    top: curve([[nose + 0.18, hy - 0.05], [hz - 0.16, hy + 0.08], [hz - 0.02, hy + 0.12], [hz, hy + 0.1]]),
    bottom: curve([[nose + 0.18, hy - 0.08], [hz, hy - 0.02]]),
    half: curve([[nose + 0.18, 0.1], [hz - 0.12, 0.16], [hz, 0.14]]),
    sections: [{ z: hz, pts: SECTIONS.round }],
  });
  // Twin headlights in the nose
  for (const s of [-1, 1]) {
    const z = nose + 0.09;
    const sp = surfaceAt(ob, z, s * 0.075);
    const outline: P2[] = smooth2([[-0.055, -0.016], [0.05, -0.022], [0.06, 0.012], [-0.04, 0.02]], 3, true).map(([x, y]) => [x * s, y] as P2);
    const n = new THREE.Vector3(...sp.n);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), n.clone().negate(), new THREE.Vector3(0, 1, 0));
    m.setPosition(sp.p[0] + n.x * 0.004, sp.p[1] + n.y * 0.004, sp.p[2] + n.z * 0.004);
    lamp(ctx, 'chassis', outline, m, { kind: 'head', inner: 'projector', depth: 0.03 });
  }
  // Ram-air intake below the nose
  const ram = smooth2([[-0.06, -0.025], [0.06, -0.025], [0.07, 0.02], [-0.07, 0.02]], 3, true);
  ctx.add('chassis', extrude(ram, 0.04, { plane: 'xy', bevel: 0.006 }), F.texturedBlack, T(0, hy - 0.3, nose + 0.07));
  if (wings) {
    for (const s of [-1, 1]) {
      const z0 = nose + 0.24;
      const sp = surfaceAt(ob, z0 + 0.06, s * 0.3);
      const wing = smooth2([[0, 0], [0.06, 0.008], [0.12, 0.004], [0.13, -0.004], [0.04, -0.008]], 3, true);
      const m = extrude(wing, 0.09, { plane: 'zy', bevel: 0.002, center: 0 });
      ctx.add('chassis', m, F.carbon, mul(T(sp.p[0] + s * 0.04, sp.p[1] - 0.04, z0), new THREE.Matrix4().makeRotationZ(s * 0.18)));
    }
  }
}

function halfFairing(ctx: KitContext): void {
  const hp = ctx.hp;
  const hy = hp.head[1], hz = hp.head[2];
  const ob: OutlineBody = {
    zs: stationsBetween(hz - 0.26, hz + 0.1, 7, 0.4),
    top: curve([[hz - 0.26, hy - 0.06], [hz - 0.1, hy + 0.05], [hz + 0.1, hy + 0.0]]),
    bottom: curve([[hz - 0.26, hy - 0.16], [hz - 0.08, hy - 0.3], [hz + 0.1, hy - 0.26]]),
    half: curve([[hz - 0.26, 0.07], [hz - 0.12, 0.22], [hz + 0.1, 0.25]]),
    sections: [{ z: hz - 0.26, pts: SECTIONS.nose }, { z: hz + 0.1, pts: SECTIONS.round }],
  };
  const m = outlineLoft(ob, bodyQ(ctx));
  const body = cut(m, fNot(sideRegion([[hz - 0.08, hy + 0.5], [hz - 0.08, hy + 0.02], [hz + 0.2, hy - 0.1], [hz + 0.2, hy + 0.5]])));
  shell(ctx, 'chassis', body, PAINT);
  screen(ctx, 'chassis', {
    zs: stationsBetween(hz - 0.18, hz - 0.04, 5, 0.3),
    top: curve([[hz - 0.18, hy + 0.02], [hz - 0.06, hy + 0.13], [hz - 0.04, hy + 0.12]]),
    bottom: curve([[hz - 0.18, hy - 0.0], [hz - 0.04, hy + 0.03]]),
    half: curve([[hz - 0.18, 0.11], [hz - 0.04, 0.14]]),
    sections: [{ z: hz, pts: SECTIONS.round }],
  });
  for (const s of [-1, 1]) {
    const sp = surfaceAt(ob, hz - 0.2, s * 0.07);
    const outline: P2[] = [[-0.04, -0.02], [0.04, -0.02], [0.045, 0.02], [-0.045, 0.02]];
    const n = new THREE.Vector3(...sp.n);
    const mm = new THREE.Matrix4().lookAt(new THREE.Vector3(), n.clone().negate(), new THREE.Vector3(0, 1, 0));
    mm.setPosition(sp.p[0] + n.x * 0.004, sp.p[1] + n.y * 0.004, sp.p[2] + n.z * 0.004);
    lamp(ctx, 'chassis', outline, mm, { kind: 'head', inner: 'projector', depth: 0.03 });
  }
}

/** Naked / classic / cruiser front: headlight on the steering, flyscreen, shrouds. */
function nakedFront(ctx: KitContext, style: string, fly: boolean): void {
  const hp = ctx.hp;
  const hl = ctx.spec.look.headlight;
  const L = { z: -hp.offset };
  const at = ctx.fromSteer([0, -0.12, L.z - 0.11]);
  if (hl === 'round' || style === 'classic' || style === 'cruiser') {
    const big = style === 'cruiser';
    roundHeadlight(ctx, 'steer', at, big ? 0.1 : 0.088, [0, -0.08, -1], { led: style !== 'classic', chrome: big || style === 'classic' });
    // Brackets to the fork tubes
    for (const s of [-1, 1]) ctx.add('steer', rod([s * 0.05, at[1], at[2] + 0.06], [s * ctx.bp.fork.spacing * 0.5, at[1] + 0.02, at[2] + 0.07], 0.006, 0.006, 8), big ? F.chrome : F.texturedBlack);
    // Indicators beside the headlight
    for (const s of [-1, 1]) indicatorPod(ctx, 'steer', [s * (ctx.bp.fork.spacing / 2 + 0.03), at[1] - 0.02, at[2] + 0.08], [s * (ctx.bp.fork.spacing / 2 + 0.1), at[1] - 0.02, at[2] + 0.06]);
  } else {
    // Angular LED headlight unit with a short cowl
    const outline: P2[] = smooth2([[-0.11, 0.0], [-0.06, -0.06], [0.06, -0.06], [0.11, 0.0], [0.07, 0.05], [-0.07, 0.05]], 3, true);
    const m = mul(T(...at), RY(Math.PI), RX(0.15));
    lamp(ctx, 'steer', outline, m, { kind: 'head', inner: 'led', count: 2, depth: 0.08, rim: 0.012 });
    ledStrip(ctx, 'steer', [[-0.09, at[1] + 0.05, at[2] - 0.012], [0, at[1] + 0.065, at[2] - 0.02], [0.09, at[1] + 0.05, at[2] - 0.012]], 0.006, 0.006, 'drl');
    if (fly) {
      screen(ctx, 'steer', {
        zs: stationsBetween(at[2] - 0.02, at[2] + 0.06, 4, 0.2),
        top: curve([[at[2] - 0.02, at[1] + 0.08], [at[2] + 0.06, at[1] + 0.2]]),
        bottom: curve([[at[2] - 0.02, at[1] + 0.05], [at[2] + 0.06, at[1] + 0.16]]),
        half: curve([[at[2] - 0.02, 0.1], [at[2] + 0.06, 0.12]]),
        sections: [{ z: 0, pts: SECTIONS.round }],
      });
    }
    for (const s of [-1, 1]) indicatorPod(ctx, 'chassis', [s * 0.12, hp.head[1] - 0.18, hp.head[2] + 0.1], [s * 0.2, hp.head[1] - 0.17, hp.head[2] + 0.06]);
  }
  if (style === 'naked') {
    // Radiator shrouds / tank scoops
    const hy = hp.head[1], hz = hp.head[2];
    // Curved side shells wrapping the radiator and the front of the tank (right half, then mirrored).
    const ob: OutlineBody = {
      zs: stationsBetween(hz + 0.02, hz + 0.36, 7, 0.4),
      top: curve([[hz + 0.02, hy - 0.05], [hz + 0.2, hy - 0.06], [hz + 0.36, hy - 0.12]]),
      bottom: curve([[hz + 0.02, hy - 0.26], [hz + 0.18, hy - 0.4], [hz + 0.36, hy - 0.3]]),
      half: curve([[hz + 0.02, 0.19], [hz + 0.16, 0.255], [hz + 0.36, 0.235]]),
      sections: [{ z: 0, pts: [[0.7, 1], [0.88, 0.92], [0.98, 0.7], [1, 0.42], [0.96, 0.15], [0.88, 0]] }],
    };
    const shroud = outlineLoft(ob, { ...bodyQ(ctx), mirror: false });
    shell(ctx, 'chassis', shroud, PAINT, 0.006);
    shell(ctx, 'chassis', shroud.mirrored(), PAINT, 0.006);
  }
}

function adventureFront(ctx: KitContext, tall: boolean): void {
  const hp = ctx.hp;
  const hy = hp.head[1], hz = hp.head[2];
  const ob: OutlineBody = {
    zs: stationsBetween(hz - 0.3, hz + 0.16, 7, 0.4),
    top: curve([[hz - 0.3, hy + 0.0], [hz - 0.12, hy + 0.12], [hz + 0.16, hy + 0.12]]),
    bottom: curve([[hz - 0.3, hy - 0.08], [hz - 0.1, hy - 0.24], [hz + 0.16, hy - 0.3]]),
    half: curve([[hz - 0.3, 0.07], [hz - 0.12, 0.2], [hz + 0.16, 0.24]]),
    sections: [{ z: hz - 0.3, pts: SECTIONS.nose }, { z: hz + 0.1, pts: SECTIONS.crisp }],
  };
  const body = cut(outlineLoft(ob, bodyQ(ctx)), fNot(sideRegion([[hz - 0.1, hy + 0.6], [hz - 0.1, hy + 0.1], [hz + 0.25, hy - 0.02], [hz + 0.25, hy + 0.6]])));
  shell(ctx, 'chassis', body, PAINT);
  // Beak
  const beak: OutlineBody = {
    zs: stationsBetween(hz - 0.56, hz - 0.12, 6, 0.4),
    top: curve([[hz - 0.56, hy - 0.17], [hz - 0.3, hy - 0.12], [hz - 0.12, hy - 0.08]]),
    bottom: curve([[hz - 0.56, hy - 0.2], [hz - 0.3, hy - 0.24], [hz - 0.12, hy - 0.22]]),
    half: curve([[hz - 0.56, 0.02], [hz - 0.36, 0.08], [hz - 0.12, 0.11]]),
    sections: [{ z: 0, pts: SECTIONS.nose }],
  };
  shell(ctx, 'chassis', outlineLoft(beak, bodyQ(ctx)), PAINT);
  const h = tall ? 0.34 : 0.22;
  screen(ctx, 'chassis', {
    zs: stationsBetween(hz - 0.2, hz - 0.04, 5, 0.3),
    top: curve([[hz - 0.2, hy + 0.12], [hz - 0.06, hy + 0.1 + h], [hz - 0.04, hy + 0.09 + h]]),
    bottom: curve([[hz - 0.2, hy + 0.08], [hz - 0.04, hy + 0.12]]),
    half: curve([[hz - 0.2, 0.15], [hz - 0.04, 0.18]]),
    sections: [{ z: 0, pts: SECTIONS.round }],
  });
  for (const s of [-1, 1]) {
    const sp = surfaceAt(ob, hz - 0.24, s * 0.06);
    const outline: P2[] = smooth2([[-0.045, -0.03], [0.045, -0.03], [0.05, 0.025], [-0.05, 0.025]], 3, true);
    const n = new THREE.Vector3(...sp.n);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), n.clone().negate(), new THREE.Vector3(0, 1, 0));
    m.setPosition(sp.p[0] + n.x * 0.004, sp.p[1] + n.y * 0.004, sp.p[2] + n.z * 0.004);
    lamp(ctx, 'chassis', outline, m, { kind: 'head', inner: 'led', count: 3, depth: 0.03 });
  }
}

function touringFront(ctx: KitContext): void {
  const hp = ctx.hp;
  const hy = hp.head[1], hz = hp.head[2];
  const nose = -hp.L - 0.02;
  const ob: OutlineBody = {
    zs: stationsBetween(nose, hz + 0.5, 9, 0.5),
    top: curve([[nose, hy - 0.1], [nose + 0.12, hy + 0.04], [hz, hy + 0.1], [hz + 0.3, hy + 0.06], [hz + 0.5, hy - 0.02]]),
    bottom: curve([[nose, hy - 0.22], [nose + 0.12, hy - 0.42], [hz, hy - 0.5], [hz + 0.3, hy - 0.52], [hz + 0.5, hy - 0.4]]),
    half: curve([[nose, 0.1], [nose + 0.12, 0.33], [hz, 0.45], [hz + 0.3, 0.44], [hz + 0.5, 0.3]]),
    sections: [{ z: nose, pts: SECTIONS.nose }, { z: hz, pts: SECTIONS.round }],
  };
  const body = cut(outlineLoft(ob, bodyQ(ctx, 1.2)), fNot(sideRegion([[hz - 0.04, hy + 0.6], [hz - 0.04, hy + 0.06], [hz + 0.6, hy - 0.04], [hz + 0.6, hy + 0.6]])));
  shell(ctx, 'chassis', body, PAINT);
  screen(ctx, 'chassis', {
    zs: stationsBetween(nose + 0.2, hz + 0.06, 6, 0.3),
    top: curve([[nose + 0.2, hy + 0.06], [hz, hy + 0.4], [hz + 0.06, hy + 0.41]]),
    bottom: curve([[nose + 0.2, hy + 0.02], [hz + 0.06, hy + 0.08]]),
    half: curve([[nose + 0.2, 0.2], [hz + 0.06, 0.26]]),
    sections: [{ z: 0, pts: SECTIONS.round }],
  });
  for (const s of [-1, 1]) {
    const sp = surfaceAt(ob, nose + 0.06, s * 0.13);
    const outline: P2[] = smooth2([[-0.08, -0.03], [0.07, -0.035], [0.08, 0.03], [-0.07, 0.035]], 3, true);
    const n = new THREE.Vector3(...sp.n);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), n.clone().negate(), new THREE.Vector3(0, 1, 0));
    m.setPosition(sp.p[0] + n.x * 0.004, sp.p[1] + n.y * 0.004, sp.p[2] + n.z * 0.004);
    lamp(ctx, 'chassis', outline, m, { kind: 'head', inner: 'projector', count: 2, depth: 0.04 });
  }
}

/** Fork-mounted batwing fairing (moves with the bars). */
export function batwing(ctx: KitContext): void {
  const hp = ctx.hp;
  const hy = hp.head[1], hz = hp.head[2];
  const top = hy + 0.12;
  const ob: OutlineBody = {
    zs: stationsBetween(hz - 0.3, hz + 0.02, 7, 0.4),
    top: curve([[hz - 0.3, top - 0.14], [hz - 0.18, top + 0.0], [hz + 0.02, top - 0.02]]),
    bottom: curve([[hz - 0.3, top - 0.32], [hz - 0.16, top - 0.42], [hz + 0.02, top - 0.42]]),
    half: curve([[hz - 0.3, 0.14], [hz - 0.18, 0.38], [hz - 0.02, 0.42], [hz + 0.02, 0.4]]),
    sections: [{ z: hz - 0.3, pts: SECTIONS.nose }, { z: hz, pts: SECTIONS.round }],
  };
  const body = cut(outlineLoft(ob, bodyQ(ctx, 1.2)), fNot(sideRegion([[hz - 0.08, top + 0.5], [hz - 0.08, top - 0.06], [hz + 0.1, top - 0.08], [hz + 0.1, top + 0.5]])));
  shell(ctx, 'steer', body, PAINT);
  screen(ctx, 'steer', {
    zs: stationsBetween(hz - 0.2, hz - 0.06, 4, 0.2),
    top: curve([[hz - 0.2, top - 0.0], [hz - 0.08, top + 0.16], [hz - 0.06, top + 0.15]]),
    bottom: curve([[hz - 0.2, top - 0.03], [hz - 0.06, top - 0.03]]),
    half: curve([[hz - 0.2, 0.26], [hz - 0.06, 0.3]]),
    sections: [{ z: 0, pts: SECTIONS.round }],
  });
  for (const s of [-1, 1]) roundHeadlight(ctx, 'steer', [s * 0.09, top - 0.24, hz - 0.29], 0.065, [0, -0.05, -1], { led: true });
}

function rearFender(ctx: KitContext, cruiser: boolean): void {
  const hp = ctx.hp;
  const r = hp.Rr + 0.035;
  const w = hp.rear.width / 2 + 0.035;
  const prof: P2[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const x = -w + (2 * w * i) / n;
    prof.push([-0.08 * Math.pow(Math.abs(x) / w, 2.2), x]);
  }
  for (let i = n; i >= 0; i--) {
    const x = (-w + (2 * w * i) / n) * 0.985;
    prof.push([-0.08 * Math.pow(Math.abs(x) / w, 2.2) - 0.004, x]);
  }
  const path: P3[] = [];
  const steps = ctx.seg(22, 8);
  const a0 = -0.5, a1 = cruiser ? 1.9 : 1.6;
  for (let i = 0; i <= steps; i++) {
    const b = a0 + ((a1 - a0) * i) / steps;
    path.push([0, hp.Rr + Math.cos(b) * r, Math.sin(b) * r]);
  }
  ctx.add('chassis', sweep(path, prof, { up: [0, 1, 0], capStart: true, capEnd: true }), PAINT);
  const tl: P2[] = smooth2([[-0.05, -0.02], [0.05, -0.02], [0.05, 0.02], [-0.05, 0.02]], 3, true);
  lamp(ctx, 'chassis', tl, mul(T(0, hp.Rr + Math.cos(1.25) * (r + 0.006), Math.sin(1.25) * (r + 0.006)), RY(Math.PI), RX(-0.3)), { kind: 'tail', inner: 'led', count: 1, depth: 0.03, housing: F.chrome });
}

function panniers(ctx: KitContext): void {
  const hp = ctx.hp;
  for (const s of [-1, 1]) {
    const box = roundBox(0.2, 0.36, 0.5, 0.06, 3);
    ctx.add('chassis', box, PAINT, T(s * 0.29, hp.Rr + 0.18, -0.02));
    ctx.add('chassis', roundBox(0.205, 0.02, 0.5, 0.008, 2), F.texturedBlack, T(s * 0.29, hp.Rr + 0.24, -0.02));
    if (ctx.micro) ctx.add('chassis', roundBox(0.01, 0.06, 0.08, 0.004), F.chrome, T(s * 0.39, hp.Rr + 0.22, -0.14));
  }
}

function topcase(ctx: KitContext): void {
  const hp = ctx.hp;
  ctx.add('chassis', roundBox(0.4, 0.3, 0.4, 0.08, 3), PAINT, T(0, hp.seatY + 0.2, hp.seatBack + 0.3));
  ctx.add('chassis', roundBox(0.405, 0.015, 0.405, 0.007, 2), F.texturedBlack, T(0, hp.seatY + 0.2, hp.seatBack + 0.3));
}

function crashbars(ctx: KitContext): void {
  const hp = ctx.hp;
  const hy = hp.head[1], hz = hp.head[2];
  for (const s of [-1, 1]) ctx.add('chassis', tube([[s * 0.2, hy - 0.3, hz + 0.14], [s * 0.34, 0.46, hz + 0.26], [s * 0.33, 0.28, hz + 0.46], [s * 0.18, 0.24, hz + 0.62]], 0.014, ctx.seg(12, 6), 8), hard('#2a2c30', 0.6, 0.4, 0.4));
}

function scooterBody(ctx: KitContext): void {
  const hp = ctx.hp;
  const hy = hp.head[1], hz = hp.head[2];
  const sy = hp.seatY;
  // Leg shield + front apron
  const shield: OutlineBody = {
    zs: stationsBetween(hz - 0.12, hz + 0.18, 6, 0.3),
    top: curve([[hz - 0.12, hy - 0.05], [hz + 0.18, hy + 0.0]]),
    bottom: curve([[hz - 0.12, 0.36], [hz + 0.18, 0.28]]),
    half: curve([[hz - 0.12, 0.2], [hz + 0.18, 0.24]]),
    sections: [{ z: 0, pts: SECTIONS.round }],
  };
  shell(ctx, 'chassis', outlineLoft(shield, bodyQ(ctx)), PAINT);
  // Floorboard
  ctx.add('chassis', roundBox(0.3, 0.05, 0.5, 0.02, 2), F.texturedBlack, T(0, 0.3, hz + 0.45));
  // Rear body around the engine, under the seat
  const rear: OutlineBody = {
    zs: stationsBetween(hz + 0.62, 0.35, 8, 0.4),
    top: curve([[hz + 0.62, sy - 0.08], [0.0, sy - 0.04], [0.35, sy - 0.02]]),
    bottom: curve([[hz + 0.62, 0.3], [0.0, 0.42], [0.35, sy - 0.18]]),
    half: curve([[hz + 0.62, 0.16], [-0.2, 0.2], [0.35, 0.1]]),
    sections: [{ z: 0, pts: SECTIONS.closed }],
  };
  shell(ctx, 'chassis', outlineLoft(rear, bodyQ(ctx)), PAINT);
  // Close the front of the rear body (the panel under the seat nose) with a painted bulkhead.
  {
    const z0 = hz + 0.62;
    const half = stationPts(rear, z0 + 0.004);
    const full: P2[] = [...half.map(([x, y]) => [x, y] as P2), ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as P2)];
    ctx.add('chassis', extrude(full, 0.008, { plane: 'xy', center: z0 + 0.008, bevel: 0.002, curveSegs: 1 }), PAINT);
  }
  buildSeat(ctx, { front: hz + 0.66, back: 0.25, yFront: sy - 0.02, y: sy, yBack: sy + 0.04, width: 0.32, thick: 0.09 });
  // Handlebar cowl with the headlight (steer)
  const at = ctx.fromSteer([0, 0.02, -0.06]);
  ctx.add('steer', roundBox(0.5, 0.1, 0.16, 0.04, 2), PAINT, T(at[0], at[1], at[2] + 0.04));
  const outline: P2[] = smooth2([[-0.09, -0.03], [0.09, -0.03], [0.1, 0.02], [-0.1, 0.02]], 3, true);
  lamp(ctx, 'steer', outline, mul(T(at[0], at[1], at[2] - 0.04), RY(Math.PI)), { kind: 'head', inner: 'led', count: 2, depth: 0.04 });
  frontFender(ctx, { from: -0.5, to: 0.9 });
  const tl: P2[] = smooth2([[-0.08, -0.02], [0.08, -0.02], [0.08, 0.02], [-0.08, 0.02]], 3, true);
  lamp(ctx, 'chassis', tl, mul(T(0, sy - 0.06, 0.36), RY(Math.PI)), { kind: 'tail', inner: 'led', count: 4, depth: 0.03 });
}

