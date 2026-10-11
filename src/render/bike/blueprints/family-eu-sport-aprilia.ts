import type { KitContext } from '../context';
import { PAINT } from '../kit/body';
import { aerofoil, noseStrip, skinX } from '../kit/eu-sport-parts';
import { ductLiner, ductWall, faceLamps } from '../kit/jp-sport-parts';
import type { OutlineBody } from '../kit/shape';
import { smooth2, type P2 } from '../mesh';
import { F, type Finish } from '../sink';
import { fAnd, fOr, frontRegion, sideRegion, type Field } from '../surface';

/**
 * Shared Aprilia design language (RSV4 2021+, RS 660): the triple full-LED face — a
 * small centre lamp at the beak tip and two side lamps, each framed by a DRL strip
 * running over the top and down the outer edge — plus the "double fairing": an outer
 * painted shell whose lower front is cut into an aero channel exposing the dark inner
 * layer, with an integrated wing blade spanning it.
 */

export interface ApriliaFace {
  /** Centre lamp outline (front view, spans the centre line). */
  centre: readonly P2[];
  centreAt: P2;
  /** Right side lamp outline (front view, x > 0). */
  side: readonly P2[];
  sideAt: P2;
  /** DRL frame path (front view, right side) over the top and down the outer edge of the side lamp. */
  drl: readonly P2[];
  drlWidth: number;
  /** Central ram-air intake under the beak (front view, |x| half outline from the centre line). */
  intake?: readonly P2[];
  /** z behind which the face openings are not cut (keeps holes on the nose only). */
  cutBehind: number;
  intakeBack: number;
}

/** Hole field for the face (lamps + intake) and a builder adding the lamp units, DRL frames and intake duct. */
export function apriliaFace(ob: OutlineBody, f: ApriliaFace): { hole: Field; add: (ctx: KitContext) => void } {
  const centre = faceLamps(ob, { outline: f.centre, at: f.centreAt, single: true, inset: 0.008, square: 0.45, opts: { kind: 'head', inner: 'led', count: 1, depth: 0.03, rim: 0.003 } });
  const side = faceLamps(ob, { outline: f.side, at: f.sideAt, inset: 0.01, square: 0.4, opts: { kind: 'head', inner: 'led', count: 3, depth: 0.04, rim: 0.003 } });
  const intake = f.intake ? frontRegion(smooth2(f.intake, 3, false)) : null;
  const front: Field = (_x, _y, z) => f.cutBehind - z;
  const hole = fOr(centre.hole, side.hole, ...(intake ? [fAnd(intake, front)] : []));
  return {
    hole,
    add: (ctx) => {
      centre.add(ctx, 'chassis');
      side.add(ctx, 'chassis');
      noseStrip(ctx, ob, f.drl, f.drlWidth, 'drl', 0.002);
      if (f.intake) {
        const half = smooth2(f.intake, 3, false);
        const loop: P2[] = [...half.map(([x, y]) => [x, y] as P2), ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as P2)];
        ductLiner(ctx, ob, loop, f.intakeBack, 0.8);
      }
    },
  };
}

export interface ApriliaAero {
  /** Aero channel in the lower front of the side fairing (right side view). */
  channel: readonly P2[];
  /** Reference point inside the channel for the inner wall. */
  ref: P2;
  /** Wing blades: [y, z0, z1, thickness, camber]. */
  blades: readonly (readonly [number, number, number, number, number])[];
  /** How far the inner wall sits inside the outer skin (m). */
  inset: number;
  bladeFinish?: Finish;
}

/** The side-channel region (for `cut`) and a builder for the inner layer and wing blades. */
export function apriliaAero(ob: OutlineBody, a: ApriliaAero): { region: Field; add: (ctx: KitContext) => void } {
  const poly = smooth2(a.channel, 3, true);
  return {
    region: sideRegion(poly),
    add: (ctx) => {
      const [zr, yr] = a.ref;
      ductWall(ctx, ob, a.channel.map(([z, y]) => [z + (z < zr ? -0.014 : 0.014), y + (y > yr ? 0.014 : -0.014)] as P2), zr, yr, a.inset, F.texturedBlack);
      for (const s of [-1, 1]) {
        for (const [y, z0, z1, th, cam] of a.blades) {
          const x = skinX(ob, (z0 + z1) / 2, y);
          const blade = aerofoil(z0, z1, y, x - a.inset + 0.004, x - 0.002, th, cam, -0.004);
          ctx.add('chassis', s > 0 ? blade : blade.mirrored(), a.bladeFinish ?? PAINT);
        }
      }
    },
  };
}
