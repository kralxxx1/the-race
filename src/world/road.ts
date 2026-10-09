import { Rng, smoothstep } from '../core/math';

export type RoadLayout = 'oneway' | 'twoway';

export interface LaneConfig {
  layout: RoadLayout;
  lanes: number;
  laneWidth: number;
  shoulder: number;
  /** Travel direction per lane: +1 = same as player, -1 = oncoming. Index 0 = leftmost. */
  dirs: (1 | -1)[];
}

export function makeLaneConfig(layout: RoadLayout): LaneConfig {
  const lanes = 4;
  const dirs: (1 | -1)[] = layout === 'oneway' ? [1, 1, 1, 1] : [-1, -1, 1, 1];
  return { layout, lanes, laneWidth: 3.6, shoulder: 1.9, dirs };
}

export function laneCenter(cfg: LaneConfig, lane: number): number {
  return (lane - (cfg.lanes - 1) / 2) * cfg.laneWidth;
}

/** Index of the lane closest to lateral offset d (clamped to the road). */
export function laneAt(cfg: LaneConfig, d: number): number {
  const i = Math.round(d / cfg.laneWidth + (cfg.lanes - 1) / 2);
  return Math.max(0, Math.min(cfg.lanes - 1, i));
}

/** Half width of the paved surface including shoulders. */
export function pavedHalfWidth(cfg: LaneConfig): number {
  return (cfg.lanes * cfg.laneWidth) / 2 + cfg.shoulder;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Procedural, infinite highway centre line. `s` is the forward road parameter
 * (≈ metres); the world forward axis is −Z. All gameplay runs in road space
 * (s, d) and is projected to world space only for rendering.
 */
export class RoadPath {
  private ax: number[] = [];
  private kx: number[] = [];
  private px: number[] = [];
  private ay: number[] = [];
  private ky: number[] = [];
  private py: number[] = [];
  private static readonly H = 0.5;

  constructor(
    readonly seed = 1,
    curviness = 1,
    hilliness = 1,
  ) {
    const rng = new Rng(seed * 7919 + 13);
    // Gentle motorway geometry: radii stay above ~1.2 km so 300 km/h is rideable.
    const xs: [number, number][] = [
      [28, 2400],
      [9, 1150],
      [2.2, 560],
    ];
    for (const [amp, wl] of xs) {
      this.ax.push(amp * curviness * rng.range(0.8, 1.1));
      this.kx.push((Math.PI * 2) / (wl * rng.range(0.92, 1.15)));
      this.px.push(rng.range(0, Math.PI * 2));
    }
    const ys: [number, number][] = [
      [7, 1700],
      [2.2, 620],
    ];
    for (const [amp, wl] of ys) {
      this.ay.push(amp * hilliness * rng.range(0.7, 1.2));
      this.ky.push((Math.PI * 2) / (wl * rng.range(0.85, 1.2)));
      this.py.push(rng.range(0, Math.PI * 2));
    }
  }

  /** Blend-in so the start grid is straight and flat. */
  private envelope(s: number): number {
    return smoothstep(60, 1300, s);
  }

  centerX(s: number): number {
    let x = 0;
    for (let i = 0; i < this.ax.length; i++) x += this.ax[i] * Math.sin(s * this.kx[i] + this.px[i]);
    // Remove the offset at s=0 so the start is centred on the origin.
    let x0 = 0;
    for (let i = 0; i < this.ax.length; i++) x0 += this.ax[i] * Math.sin(this.px[i]);
    return (x - x0) * this.envelope(s);
  }

  height(s: number): number {
    let y = 0;
    let y0 = 0;
    for (let i = 0; i < this.ay.length; i++) {
      y += this.ay[i] * Math.sin(s * this.ky[i] + this.py[i]);
      y0 += this.ay[i] * Math.sin(this.py[i]);
    }
    return (y - y0) * this.envelope(s);
  }

  dxds(s: number): number {
    const h = RoadPath.H;
    return (this.centerX(s + h) - this.centerX(s - h)) / (2 * h);
  }

  dyds(s: number): number {
    const h = RoadPath.H;
    return (this.height(s + h) - this.height(s - h)) / (2 * h);
  }

  /** Road direction angle (radians, positive = toward +X / rightwards). */
  angle(s: number): number {
    return Math.atan(this.dxds(s));
  }

  /** Signed curvature per metre (positive = bending right). */
  curvature(s: number): number {
    const h = 2;
    const d1 = this.dxds(s);
    const d2 = (this.centerX(s + h) - 2 * this.centerX(s) + this.centerX(s - h)) / (h * h);
    return d2 / Math.pow(1 + d1 * d1, 1.5);
  }

  /** Sine of the slope angle (positive = uphill). */
  grade(s: number): number {
    const g = this.dyds(s);
    return g / Math.sqrt(1 + g * g);
  }

  /** ds/dℓ conversion: metres travelled per unit of s. */
  metric(s: number): number {
    const dx = this.dxds(s);
    const dy = this.dyds(s);
    return Math.sqrt(1 + dx * dx + dy * dy);
  }

  /** World-space position of road-space point (s, d) at height offset `up`. */
  toWorld(s: number, d: number, out: Vec3Like, up = 0): Vec3Like {
    const dx = this.dxds(s);
    const n = Math.sqrt(1 + dx * dx);
    out.x = this.centerX(s) + d / n;
    out.y = this.height(s) + up;
    out.z = -s + (d * dx) / n;
    return out;
  }

  /** three.js rotation.y that aligns a −Z-forward object with the road at s. */
  yaw(s: number): number {
    return -this.angle(s);
  }

  /** Pitch angle of the road at s (positive = nose up). */
  pitch(s: number): number {
    return Math.atan(this.dyds(s) / Math.sqrt(1 + this.dxds(s) ** 2));
  }
}
