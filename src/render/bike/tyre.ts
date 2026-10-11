/**
 * Motorcycle tyre sizes → real geometry.
 *
 * Supports metric radial/bias sizes ("120/70ZR17", "190/55 ZR 17", "90/90-21",
 * "120/70-12", "130/90B16") and the rim width in inches ("MT3.50" → 3.5).
 */

export interface TyreSize {
  /** Section width (m). */
  width: number;
  /** Aspect ratio (sidewall height / width). */
  aspect: number;
  /** Rim diameter (inches). */
  rimInch: number;
  /** Rim (bead seat) radius (m). */
  rimR: number;
  /** Overall unloaded radius (m). */
  R: number;
  /** Sidewall height (m). */
  sidewall: number;
  radial: boolean;
  /** Original size label, normalised (e.g. "120/70 ZR17"). */
  label: string;
}

export const VALID_RIMS: readonly number[] = [10, 12, 13, 14, 15, 16, 17, 18, 19, 21];
const INCH = 0.0254;

export function parseTyre(size: string): TyreSize | null {
  const m = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*(ZR|R|B|-|\s)?\s*-?\s*(\d{2})\s*$/i.exec(size.replace(/\s+/g, ' '));
  if (!m) return null;
  const w = Number(m[1]);
  const asp = Number(m[2]);
  const rim = Number(m[4]);
  if (!(w >= 60 && w <= 360) || !(asp >= 25 && asp <= 110) || !VALID_RIMS.includes(rim)) return null;
  const width = w / 1000;
  const aspect = asp / 100;
  const sidewall = width * aspect;
  const rimR = (rim * INCH) / 2;
  const kind = (m[3] ?? '').trim().toUpperCase();
  const radial = kind === 'ZR' || kind === 'R';
  return {
    width,
    aspect,
    rimInch: rim,
    rimR,
    R: rimR + sidewall,
    sidewall,
    radial,
    label: `${w}/${asp} ${kind === 'ZR' ? 'ZR' : kind === 'R' ? 'R' : kind === 'B' ? 'B' : '-'}${rim}`.replace(' -', '-'),
  };
}

/** Build a size string from look parameters (for auto blueprints). */
export function tyreFor(outerR: number, width: number, preferredRim?: number): string {
  const w = Math.round((width * 1000) / 10) * 10;
  let best = '';
  let bestErr = Infinity;
  const rims = preferredRim ? [preferredRim] : VALID_RIMS;
  for (const rim of rims) {
    for (const asp of [40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100]) {
      const R = (rim * INCH) / 2 + (w / 1000) * (asp / 100);
      const err = Math.abs(R - outerR);
      if (err < bestErr) {
        bestErr = err;
        best = `${w}/${asp}${rim >= 17 && w >= 110 ? 'ZR' : '-'}${rim}`;
      }
    }
  }
  return best;
}

/**
 * Cross-section profile of a tyre as [radius, axial] points, counter-clockwise
 * from the inner bead on −X over the crown to the bead on +X. `crown` < 1 makes
 * a more triangular race profile (front sport tyres), > 1 a rounder touring one.
 */
export function tyreProfile(t: TyreSize, rimWidth: number, crown = 1, steps = 9): [number, number][] {
  const hw = t.width / 2;
  const bead = rimWidth / 2 + 0.002;
  const rimTop = t.rimR + 0.012; // rim flange height
  const shoulderR = t.rimR + t.sidewall * 0.52;
  const out: [number, number][] = [];
  out.push([rimTop - 0.003, -bead]);
  out.push([rimTop + 0.004, -bead - 0.003]);
  out.push([t.rimR + t.sidewall * 0.28, -hw * 0.97]);
  out.push([shoulderR, -hw]);
  for (let i = 1; i < steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * Math.PI;
    const s = Math.sin(a);
    const c = Math.cos(a);
    // superellipse-ish crown: flatter on touring (crown>1), pointier on sport
    const ex = 2 / (1.6 + crown * 0.6);
    const x = Math.sign(s) * Math.pow(Math.abs(s), ex) * hw * 0.985;
    const r = shoulderR + Math.pow(Math.abs(c), ex) * (t.R - shoulderR);
    out.push([r, x]);
  }
  out.push([shoulderR, hw]);
  out.push([t.rimR + t.sidewall * 0.28, hw * 0.97]);
  out.push([rimTop + 0.004, bead + 0.003]);
  out.push([rimTop - 0.003, bead]);
  return out;
}
