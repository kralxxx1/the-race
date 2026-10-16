import type { Livery } from '../../../data/bikes';
import { RX, T, mul, type KitContext } from '../context';
import { addPanel, buildSeat, buildTank, PAINT, seatFinish, type TankOpts } from '../kit/body';
import { lamp, ledStrip } from '../kit/lights';
import { curve, outlineLoft, stationsBetween, type OutlineBody } from '../kit/shape';
import type { Pen } from '../livery';
import { extrude, roundBox, smooth2, type P2, type P3 } from '../mesh';
import { F, hard, tint, type Finish } from '../sink';
import { fAnd, fNot, planRegion, sideRegion, type Field } from '../surface';
import { bladeIndicator, forkBrackets, loftPart, panelPair, steerLamp, steerMat, steerStrip } from './family-eu-naked-1-parts';

/**
 * Shared KTM Duke design language for family "eu-naked-1": the split LED "mask" headlight on
 * the fork, the angular tank spoilers that wrap the radiator and frame the ram-air intakes,
 * and the short knife-edge tail. Used by the 1290 Super Duke R Evo and the 390 Duke.
 */

export interface KtmFace {
  /** Face plane (steering-local z) and mask outline (front view, right half, local x/y). */
  z: number;
  mask: readonly P2[];
  /** Depth of the mask shell behind the face. */
  depth: number;
  /** One lamp half (right side), local x/y outline. */
  lamp: readonly P2[];
  /** LED segments per lamp half (stacked vertically). */
  leds: number;
  /** DRL light guide along the outer edge of each half (right side, local x/y). */
  drl: readonly P2[];
  /** Fork bracket heights (local y) and how far forward/wide they reach. */
  brackets: readonly number[];
  bracketHalf: number;
  /** Indicator blade mount (right side, local) and tip. */
  indicator: [P3, P3];
  /** Mask finish (painted plastic or black). */
  finish?: Finish;
}

/** Split LED mask headlight on the fork (steer group). */
export function ktmFace(ctx: KitContext, f: KtmFace): void {
  const ys = f.mask.map((p) => p[1]);
  const top = Math.max(...ys);
  const bot = Math.min(...ys);
  const half = Math.max(...f.mask.map((p) => p[0]));
  // Normalised section from the mask outline: [x/half, (y-bot)/(top-bot)].
  const pts = f.mask.map(([x, y]) => [x / half, (y - bot) / (top - bot)] as P2);
  const zB = f.z + f.depth;
  const ob: OutlineBody = {
    zs: stationsBetween(f.z, zB, 6, 0.4),
    top: curve([[f.z, top], [zB, top - 0.01]]),
    bottom: curve([[f.z, bot], [zB, bot + 0.04]]),
    half: curve([[f.z, half], [(f.z + zB) / 2, half * 0.94], [zB, half * 0.72]]),
    sections: [{ z: f.z, pts }],
  };
  loftPart(ctx, ob, f.finish ?? F.texturedBlack, { steer: true, capFront: true, depth: 0.006, q: 1.1, creases: [2] });
  for (const s of [-1, 1]) {
    const outline = f.lamp.map(([x, y]) => [s * x, y] as P2);
    const ordered = s > 0 ? outline : [...outline].reverse();
    steerLamp(ctx, ordered, [0, 0, f.z - 0.001], { kind: 'head', inner: 'led', count: f.leds, depth: 0.025, rim: 0.003 });
    steerStrip(ctx, f.drl.map(([x, y]) => [s * x, y, f.z - 0.004] as P3), 0.008, 0.005, 'drl');
    const [a, b] = f.indicator;
    bladeIndicator(ctx, 'steer', ctx.fromSteer([s * a[0], a[1], a[2]]), ctx.fromSteer([s * b[0], b[1], b[2]]), 0.0065);
  }
  forkBrackets(ctx, f.brackets, f.z + f.depth * 0.8, f.bracketHalf);
}

/**
 * Tank spoiler (right panel; mirrored): an angular plastic shroud over the tank flank and the
 * radiator, open at the front where it frames the intake.
 */
export interface Spoiler {
  z0: number;
  z1: number;
  top: readonly P2[];
  bottom: readonly P2[];
  half: readonly P2[];
}

export function spoilers(ctx: KitContext, s: Spoiler, f: Finish = PAINT): OutlineBody {
  const ob: OutlineBody = {
    zs: stationsBetween(s.z0, s.z1, 12, 0.45),
    top: curve(s.top),
    bottom: curve(s.bottom),
    half: curve(s.half),
    sections: [
      { z: s.z0, pts: [[0.58, 1], [0.86, 0.94], [0.99, 0.74], [1, 0.45], [0.95, 0.16], [0.86, 0]] },
      { z: s.z1, pts: [[0.62, 1], [0.88, 0.95], [0.99, 0.76], [1, 0.48], [0.97, 0.2], [0.92, 0]] },
    ],
  };
  panelPair(ctx, ob, f, { creases: [1, 3], depth: 0.012 });
  return ob;
}

/** Short knife-edge tail with a seat recess, black undertray and a slim LED tail lamp. */
export function ktmTail(ctx: KitContext, ob: OutlineBody, seatHole: Field, lampAt: P3, lampW: number): void {
  const tm = outlineLoft(ob, { su: ctx.seg(11, 4), sv: ctx.seg(6, 2), capBack: true });
  addPanel(ctx, 'chassis', tm, fNot(seatHole), PAINT, 0.0025, 0.012);
  const z0 = ob.zs[0];
  const z1 = ob.zs[ob.zs.length - 1];
  const ut: OutlineBody = {
    zs: stationsBetween(z0 + 0.06, z1 - 0.01, 6, 0.4),
    top: curve([[z0 + 0.06, ob.bottom(z0 + 0.06) + 0.04], [z1 - 0.01, ob.bottom(z1 - 0.01) + 0.02]]),
    bottom: curve([[z0 + 0.06, ob.bottom(z0 + 0.06) - 0.005], [(z0 + z1) / 2, ob.bottom((z0 + z1) / 2) - 0.004], [z1 - 0.01, ob.bottom(z1 - 0.01) - 0.002]]),
    half: curve([[z0 + 0.06, ob.half(z0 + 0.06) * 0.9], [z1 - 0.01, ob.half(z1 - 0.01) * 0.9]]),
    sections: [{ z: 0, pts: [[0, 1], [0.6, 0.95], [0.95, 0.7], [1, 0.45], [0.9, 0.2], [0.5, 0.02], [0, 0]] }],
  };
  ctx.add('chassis', outlineLoft(ut, { su: ctx.seg(5, 2), sv: ctx.seg(3, 2) }), F.texturedBlack);
  const tl: P2[] = smooth2([[-lampW, -0.006], [lampW, -0.006], [lampW * 0.8, 0.01], [-lampW * 0.8, 0.01]], 3, true);
  lamp(ctx, 'chassis', tl, mul(T(...lampAt), RX(-0.5)), { kind: 'tail', inner: 'led', count: 1, depth: 0.025, rim: 0.003, lensSmoked: true });
}

export function seatHoleOf(front: number, back: number, yCut: number, halfFront: number, halfBack: number): Field {
  return fAnd(sideRegion([[front - 0.2, yCut], [back, yCut + 0.06], [back, 1.5], [front - 0.2, 1.5]]), planRegion([[front - 0.2, -0.01], [back, -0.01], [back, halfBack], [front, halfFront], [front - 0.2, halfFront]]));
}

/** Rider + pillion seats. */
export function ktmSeats(ctx: KitContext, rider: Parameters<typeof buildSeat>[1], pillion: Parameters<typeof buildSeat>[1]): void {
  buildSeat(ctx, rider);
  buildSeat(ctx, pillion, tint(seatFinish(ctx), '#171717'));
}

export function ktmTank(ctx: KitContext, o: TankOpts): OutlineBody {
  return buildTank(ctx, o);
}

/** Black side covers under the seat (left/right), flat extruded. */
export function underSeatCovers(ctx: KitContext, outline: readonly P2[], x: number): void {
  for (const s of [-1, 1]) ctx.add('chassis', extrude(smooth2(outline, 3, true), 0.01, { plane: 'zy', bevel: 0.003, center: s * x }), F.texturedBlack);
}

/** Painted plate across the top clamp area that carries the TFT (steering-local). */
export function dashCowl(ctx: KitContext, at: P3, w: number, d: number, tilt: number): void {
  ctx.add('steer', roundBox(w, 0.012, d, 0.004), F.texturedBlack, steerMat(ctx, mul(T(...at), RX(tilt))));
}

/** Lettering helper for KTM liveries. */
export function ktmText(p: Pen, text: string, z: number, y: number, size: number, color: string, opts: { italic?: boolean; weight?: string; spacing?: number } = {}): void {
  p.text(text, z, y, { color, size, weight: opts.weight ?? '900', italic: opts.italic ?? true, spacing: opts.spacing ?? 0.01 });
}

export const KTM_ORANGE = '#ff6600';
export const isOrange = (lv: Livery): boolean => lv.primary.toLowerCase() === KTM_ORANGE;
export { hard, ledStrip };
