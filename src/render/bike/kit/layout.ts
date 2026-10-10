import type { KitContext } from '../context';

/** Lateral layout of the rear end (all positive magnitudes, sides given separately). */
export interface RearLayout {
  chainSide: 1 | -1;
  /** Single-sided arm side (0 = conventional). */
  ss: 1 | -1 | 0;
  tyreHalf: number;
  chainX: number;
  armX: number;
  pivotX: number;
  discX: number;
}

export function rearLayout(ctx: KitContext): RearLayout {
  const bp = ctx.bp;
  const tyreHalf = ctx.hp.rear.width / 2;
  const chainSide: 1 | -1 = bp.drive.side === 'left' ? -1 : 1;
  const single = bp.swingarm.type === 'singleSided' || bp.swingarm.type === 'shaft';
  const ss: 1 | -1 | 0 = single ? (bp.swingarm.side === 'right' ? 1 : -1) : 0;
  const pivotX = Math.max(0.09, (bp.frame.width ?? 0.36) / 2 - 0.07);
  if (ss) {
    const armX = tyreHalf + 0.042;
    return { chainSide, ss, tyreHalf, armX, chainX: armX + 0.045, pivotX, discX: tyreHalf * 0.7 + 0.01 };
  }
  const chainX = tyreHalf + 0.016;
  return { chainSide, ss, tyreHalf, chainX, armX: chainX + 0.036, pivotX, discX: 0.082 };
}

