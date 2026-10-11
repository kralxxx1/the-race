import { RX, T, mul, type KitContext } from '../context';
import { addPanel, bodyQ, buildSeat, buildTank, frontFender, PAINT, screen, seatFinish, type SeatOpts, type TankOpts } from '../kit/body';
import { indicatorPod, lamp } from '../kit/lights';
import { hugger, plateHanger } from '../kit/rear';
import { curve, outlineLoft, sideAt, stationsBetween, type OutlineBody, type SectionKey } from '../kit/shape';
import { extrude, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, Micro, tint, type Finish } from '../sink';
import { cut, fAnd, fNot, frontRegion, fOr, planRegion, sideRegion, type Field } from '../surface';
import { ductFloor, fasteners, insetLamp, louvredVent } from './family-kawa-sport-parts';

/**
 * Data-driven full-fairing body for the Kawasaki supersport family (ZX-10R, ZX-6R,
 * ZX-4RR, Ninja 400) and the KTM RC 390: one master fairing surface cut into upper
 * cowl / side panel / belly pan, a face drawn in front view (ram-air mouth, lamps cut
 * from the same surface), optional winglet duct, vents, screen, tank, seats, tail.
 * All coordinates are bike space (m); side-view polygons are [z, y], front-view
 * polygons [|x|, y] for the right half.
 */

export interface ZxLamp {
  /** Lamp opening (front view, right half; mirrored). */
  poly: P2[];
  /** Only surfaces ahead of this z are cut (keeps the prism off the flanks further back). */
  zMax: number;
  /** Emitter blocks and DRL guides inside the opening (front view, right half). */
  emit?: P2[][];
  drl?: P2[][];
}

export interface ZxVent {
  poly: P2[];
  fins: number;
  slope?: number;
}

export interface ZxBody {
  fairing: {
    zs: number[];
    top: P2[];
    bottom: P2[];
    half: P2[];
    sections: SectionKey[];
    creases?: number[];
  };
  /** Rear edge of the side panel (tank front → belly end). */
  sideEdge: P2[];
  /** Front-wheel arch radius around the axle. */
  archR: number;
  /** Cockpit opening under the screen: rear end z and minimum y. */
  underScreen: { base: number; rear: number; y: number; half?: [number, number] };
  intake?: { poly: P2[]; zMax: number; depth?: number; mesh?: boolean; sym?: boolean } | null;
  heads: ZxLamp[];
  /** Winglet duct slot (side view) and the lip above it: [z0, z1, y0, y1, out]. */
  wingDuct?: { poly: P2[]; lip?: [number, number, number, number, number] } | null;
  /** Upper cowl region (side view): everything ahead of this polygon's rear edge. */
  cowl: P2[];
  /** Belly pan region (side view) — a separate panel. */
  belly?: P2[] | null;
  vents: ZxVent[];
  inner: { top: P2[]; bottom: P2[]; half: P2[] };
  screen: { zs: [number, number]; top: P2[]; bottom: P2[]; half: P2[]; tint: string };
  tank: TankOpts;
  seat: SeatOpts;
  pillion?: SeatOpts | null;
  tail: { z0: number; z1: number; top: P2[]; bottom: P2[]; half: P2[]; tipSection?: P2[] };
  /** Seat recess cut into the tail: rider/pillion side-view boxes and plan width. */
  seatHole: { rider: P2[]; pillion?: P2[]; plan: P2[] };
  tailVent?: P2[] | null;
  undertray: { z0: number; z1: number; top: P2[]; bottom: P2[]; half: P2[] };
  tailLight: { outline: P2[]; at: P3; tilt: number; segments?: number };
  fender: { from: number; to: number; width: number };
  plate: { fromZ: number; fromY: number };
  fasteners: P2[];
  /** Front indicators on the fairing flanks (when not in the mirrors): side-view base point. */
  frontIndicators?: P2 | null;
  /** Bike-specific additions (badges, extra ducts…), run last. */
  extras?: (ctx: KitContext, ob: OutlineBody) => void;
}

export function zxFairing(d: ZxBody): OutlineBody {
  return {
    zs: d.fairing.zs,
    top: curve(d.fairing.top),
    bottom: curve(d.fairing.bottom),
    half: curve(d.fairing.half),
    sections: d.fairing.sections,
  };
}

/**
 * Horizontal aero lip following the fairing flank between z0 and z1 at height y0 → y1:
 * a thin plan-view blade standing `out` proud of the skin (integrated winglet).
 */
export function flankLip(ctx: KitContext, ob: OutlineBody, z0: number, z1: number, y0: number, y1: number, out: number, thick: number, f: Finish): void {
  const n = ctx.seg(10, 5);
  for (const s of [-1, 1]) {
    const outer: P2[] = [], inner: P2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const z = z0 + (z1 - z0) * t;
      const y = y0 + (y1 - y0) * t;
      const x = Math.abs(sideAt(ob, z, y, 1).p[0]);
      // Blade stands proud in the middle and blends into the skin at both ends.
      const o = out * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (t > 0.85 ? 1 - ((t - 0.85) / 0.15) * 0.8 : 1);
      outer.push([x + o, z]);
      inner.push([x - 0.02, z]);
    }
    const plan = [...outer, ...inner.reverse()].map(([x, z]) => [s * x, z] as P2);
    const m = extrude(s > 0 ? plan : [...plan].reverse(), thick, { plane: 'xz', center: 0, bevel: thick * 0.4, curveSegs: 1 });
    const pitch = Math.atan2(y1 - y0, z1 - z0);
    ctx.add('chassis', m, f, mul(T(0, y0, z0), RX(-pitch), T(0, 0, -z0)));
  }
}

export function zxBody(d: ZxBody): (ctx: KitContext) => void {
  return (ctx) => {
    const ob = zxFairing(d);
    const q = bodyQ(ctx, 1.7);
    const master = outlineLoft(ob, { su: q.su, sv: q.sv, creases: d.fairing.creases ?? [2], capFront: true });
    const A = ctx.hp.frontAxle;
    const e0 = d.sideEdge[0];
    const open = sideRegion([[e0[0], 2], ...d.sideEdge, [-0.3, 0.1], [-0.3, 2]]);
    const arch: Field = (_x, y, z) => d.archR - Math.hypot(z - A[2], y - A[1]);
    const us = d.underScreen;
    const [uh0, uh1] = us.half ?? [0.11, 0.165];
    const underScreen = fAnd(planRegion([[us.base + 0.07, -1], [us.rear, -1], [us.rear, 0.15], [-1.3, uh1], [us.base + 0.07, uh0]]), (_x, y) => y - us.y);
    const front = (poly: P2[], zMax: number, sym = true): Field => fAnd(frontRegion(smooth2(poly, 3, true), sym), (_x, _y, z) => zMax - z);
    const intake = d.intake ? front(d.intake.poly, d.intake.zMax, d.intake.sym ?? true) : null;
    const heads = d.heads.map((h) => front(h.poly, h.zMax));
    const duct = d.wingDuct ? sideRegion(smooth2(d.wingDuct.poly, 3, true)) : null;
    const holes: Field[] = [fNot(open), fNot(arch), fNot(underScreen)];
    if (intake) holes.push(fNot(intake));
    for (const h of heads) holes.push(fNot(h));
    if (duct) holes.push(fNot(duct));
    const body = cut(master, fAnd(...holes));
    // Panels: upper cowl / side panel (minus vents) / belly pan.
    const cowl = sideRegion(d.cowl);
    const vents = d.vents.map((v) => sideRegion(smooth2(v.poly, 4, true)));
    const belly = d.belly ? sideRegion(d.belly) : null;
    addPanel(ctx, 'chassis', body, cowl, PAINT, 0.003, 0.014);
    const sideParts: Field[] = [fNot(cowl), ...vents.map((v) => fNot(v))];
    if (belly) sideParts.push(fNot(belly));
    addPanel(ctx, 'chassis', body, fAnd(...sideParts), PAINT, 0.003, 0.014);
    if (belly) addPanel(ctx, 'chassis', body, fAnd(belly, fNot(cowl)), PAINT, 0.003, 0.014);
    for (const v of d.vents) louvredVent(ctx, ob, master, v.poly, v.fins, hard('#0b0c0e', 0.15, 0.25, 1), v.slope ?? 0.012);
    // Lamps: lens on the skin, chrome floor, LED blocks and DRL guides behind it.
    d.heads.forEach((h, i) => {
      insetLamp(ctx, master, heads[i], {
        emit: (h.emit ?? []).map((p) => frontRegion(smooth2(p, 2, true))),
        drl: (h.drl ?? []).map((p) => frontRegion(p)),
      });
    });
    if (intake && d.intake) {
      ductFloor(ctx, master, intake, d.intake.depth ?? 0.06);
      if (d.intake.mesh !== false) ductFloor(ctx, master, intake, 0.018, hard('#2a2c30', 0.6, 0.5, 0, Micro.knurl));
    }
    if (duct && d.wingDuct) {
      ductFloor(ctx, master, duct, 0.03);
      const l = d.wingDuct.lip;
      if (l) flankLip(ctx, ob, l[0], l[1], l[2], l[3], l[4], 0.008, PAINT);
    }
    // Inner panels seen through the screen.
    const inner = outlineLoft(
      {
        zs: stationsBetween(d.inner.top[0][0], d.inner.top[d.inner.top.length - 1][0], 6, 0.3),
        top: curve(d.inner.top),
        bottom: curve(d.inner.bottom),
        half: curve(d.inner.half),
        sections: [{ z: 0, pts: [[0, 1], [0.5, 0.98], [0.86, 0.88], [0.98, 0.65], [1, 0.4], [0.97, 0.15], [0.9, 0]] }],
      },
      { su: ctx.seg(6, 2), sv: ctx.seg(4, 2) },
    );
    ctx.add('chassis', inner, F.texturedBlack);
    screen(ctx, 'chassis', {
      zs: stationsBetween(d.screen.zs[0], d.screen.zs[1], 8, 0.35),
      top: curve(d.screen.top),
      bottom: curve(d.screen.bottom),
      half: curve(d.screen.half),
      sections: [{ z: 0, pts: [[0, 1], [0.45, 0.985], [0.8, 0.93], [0.95, 0.8], [1, 0.55], [1, 0.25], [0.98, 0]] }],
    }, tint(F.screen, d.screen.tint));
    buildTank(ctx, d.tank);
    buildSeat(ctx, d.seat);
    if (d.pillion) buildSeat(ctx, d.pillion, tint(seatFinish(ctx), '#141414'));
    // Tail with seat recesses and vent; black undertray; LED tail light.
    const t = d.tail;
    const tb: OutlineBody = {
      zs: stationsBetween(t.z0, t.z1, 14, 0.5),
      top: curve(t.top),
      bottom: curve(t.bottom),
      half: curve(t.half),
      sections: [
        { z: t.z0, pts: [[0, 1], [0.6, 0.98], [0.95, 0.84], [1, 0.55], [0.93, 0.22], [0.6, 0.02], [0, 0]] },
        { z: t.z1, pts: t.tipSection ?? [[0, 1], [0.74, 0.97], [1, 0.72], [0.97, 0.44], [0.82, 0.18], [0.4, 0.02], [0, 0]] },
      ],
    };
    const tm = outlineLoft(tb, { su: ctx.seg(12, 4), sv: ctx.seg(6, 2), capBack: true });
    const sh = d.seatHole;
    const seatHole: Field = fAnd(sh.pillion ? fOr(sideRegion(sh.rider), sideRegion(sh.pillion)) : sideRegion(sh.rider), planRegion(sh.plan));
    const tailParts: Field[] = [fNot(seatHole)];
    if (d.tailVent) tailParts.push(fNot(sideRegion(smooth2(d.tailVent, 3, true))));
    addPanel(ctx, 'chassis', tm, fAnd(...tailParts), PAINT, 0.0025, 0.012);
    const u = d.undertray;
    const ut: OutlineBody = {
      zs: stationsBetween(u.z0, u.z1, 7, 0.4),
      top: curve(u.top),
      bottom: curve(u.bottom),
      half: curve(u.half),
      sections: [{ z: 0, pts: [[0, 1], [0.6, 0.95], [0.95, 0.7], [1, 0.45], [0.9, 0.2], [0.5, 0.02], [0, 0]] }],
    };
    ctx.add('chassis', outlineLoft(ut, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), F.texturedBlack);
    const tl = d.tailLight;
    lamp(ctx, 'chassis', smooth2(tl.outline, 3, true), mul(T(...tl.at), RX(tl.tilt)), { kind: 'tail', inner: 'led', count: tl.segments ?? 1, depth: 0.03, rim: 0.003, lensSmoked: true });
    frontFender(ctx, { from: d.fender.from, to: d.fender.to, gap: 0.02, width: d.fender.width });
    hugger(ctx, hard('#0b0c0e', 0.15, 0.2, 1));
    plateHanger(ctx, { fromZ: d.plate.fromZ, fromY: d.plate.fromY });
    if (d.frontIndicators) {
      for (const s of [-1, 1]) {
        const p = sideAt(ob, d.frontIndicators[0], d.frontIndicators[1], s);
        indicatorPod(ctx, 'chassis', [p.p[0] - s * 0.005, p.p[1], p.p[2]], [p.p[0] + s * 0.05, p.p[1] - 0.004, p.p[2] - 0.01], 0.01);
      }
    }
    fasteners(ctx, ob, d.fasteners);
    d.extras?.(ctx, ob);
  };
}

/**
 * Re-map every longitudinal coordinate of a body description through `S(z)` (and
 * optionally every height through `H(y)`): derives a sibling model's bodywork from
 * a family member with different proportions (shorter wheelbase, lower screen…).
 */
export function remapZxBody(d: ZxBody, S: (z: number) => number, H: (y: number) => number = (y) => y): ZxBody {
  const sv = (pts: readonly P2[]): P2[] => pts.map(([z, y]) => [S(z), H(y)] as P2);
  const pl = (pts: readonly P2[]): P2[] => pts.map(([z, x]) => [S(z), x] as P2);
  const fv = (pts: readonly P2[]): P2[] => pts.map(([x, y]) => [x, H(y)] as P2);
  const lamp = (l: ZxLamp): ZxLamp => ({ poly: fv(l.poly), zMax: S(l.zMax), emit: l.emit?.map(fv), drl: l.drl?.map(fv) });
  const seat = (o: SeatOpts): SeatOpts => ({ ...o, front: S(o.front), back: S(o.back), yFront: H(o.yFront), y: H(o.y), yBack: H(o.yBack) });
  const t = d.tank;
  return {
    ...d,
    fairing: {
      ...d.fairing,
      zs: d.fairing.zs.map(S),
      top: sv(d.fairing.top),
      bottom: sv(d.fairing.bottom),
      half: pl(d.fairing.half),
      sections: d.fairing.sections.map((k) => ({ z: S(k.z), pts: k.pts })),
    },
    sideEdge: sv(d.sideEdge),
    underScreen: { ...d.underScreen, base: S(d.underScreen.base), rear: S(d.underScreen.rear), y: H(d.underScreen.y) },
    intake: d.intake ? { ...d.intake, poly: fv(d.intake.poly), zMax: S(d.intake.zMax) } : d.intake,
    heads: d.heads.map(lamp),
    wingDuct: d.wingDuct
      ? { poly: sv(d.wingDuct.poly), lip: d.wingDuct.lip ? [S(d.wingDuct.lip[0]), S(d.wingDuct.lip[1]), H(d.wingDuct.lip[2]), H(d.wingDuct.lip[3]), d.wingDuct.lip[4]] : undefined }
      : d.wingDuct,
    cowl: sv(d.cowl),
    belly: d.belly ? sv(d.belly) : d.belly,
    vents: d.vents.map((v) => ({ ...v, poly: sv(v.poly) })),
    inner: { top: sv(d.inner.top), bottom: sv(d.inner.bottom), half: pl(d.inner.half) },
    screen: { ...d.screen, zs: [S(d.screen.zs[0]), S(d.screen.zs[1])], top: sv(d.screen.top), bottom: sv(d.screen.bottom), half: pl(d.screen.half) },
    tank: {
      ...t,
      front: S(t.front),
      back: S(t.back),
      top: H(t.top),
      bottomFront: H(t.bottomFront),
      bottomBack: H(t.bottomBack),
      capZ: t.capZ !== undefined ? S(t.capZ) : undefined,
      topLine: t.topLine ? sv(t.topLine) : undefined,
      bottomLine: t.bottomLine ? sv(t.bottomLine) : undefined,
      halfLine: t.halfLine ? pl(t.halfLine) : undefined,
    },
    seat: seat(d.seat),
    pillion: d.pillion ? seat(d.pillion) : d.pillion,
    tail: { ...d.tail, z0: S(d.tail.z0), z1: S(d.tail.z1), top: sv(d.tail.top), bottom: sv(d.tail.bottom), half: pl(d.tail.half) },
    seatHole: { rider: sv(d.seatHole.rider), pillion: d.seatHole.pillion ? sv(d.seatHole.pillion) : undefined, plan: pl(d.seatHole.plan) },
    tailVent: d.tailVent ? sv(d.tailVent) : d.tailVent,
    undertray: { z0: S(d.undertray.z0), z1: S(d.undertray.z1), top: sv(d.undertray.top), bottom: sv(d.undertray.bottom), half: pl(d.undertray.half) },
    tailLight: { ...d.tailLight, at: [d.tailLight.at[0], H(d.tailLight.at[1]), S(d.tailLight.at[2])] },
    plate: { fromZ: S(d.plate.fromZ), fromY: H(d.plate.fromY) },
    fasteners: sv(d.fasteners),
    frontIndicators: d.frontIndicators ? ([S(d.frontIndicators[0]), H(d.frontIndicators[1])] as P2) : d.frontIndicators,
  };
}
