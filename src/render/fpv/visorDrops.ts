import { clamp, mulberry32, smoothstep } from '../../core/math';

/**
 * Rain on a helmet visor, in normalised screen space (x right, y DOWN, both 0..1).
 * Pure simulation (no canvas) so it is testable. Droplets bead up where they land;
 * wind over the visor pushes them up and outwards (faster for big drops at speed),
 * and at a standstill big drops slowly run down under gravity.
 */
export const MAX_DROPS = 150;

export interface DropParams {
  /** 0..1 rain intensity at the visor. */
  rain: number;
  /** Ground speed (m/s). */
  speed: number;
  /** Sideways air component in the visor plane (-1 left .. +1 right), e.g. from steering/lean. */
  side: number;
  /** 0..1 buffeting, adds jitter to the run-off direction. */
  buffet: number;
}

export class DropletField {
  readonly x = new Float32Array(MAX_DROPS);
  readonly y = new Float32Array(MAX_DROPS);
  /** Radius in px at a 1280-wide viewport. */
  readonly r = new Float32Array(MAX_DROPS);
  readonly vx = new Float32Array(MAX_DROPS);
  readonly vy = new Float32Array(MAX_DROPS);
  readonly age = new Float32Array(MAX_DROPS);
  /** Highlight variant 0..2. */
  readonly kind = new Uint8Array(MAX_DROPS);
  /** Trail length accumulated while sliding (normalised y). */
  readonly trail = new Float32Array(MAX_DROPS);
  count = 0;
  private rng: () => number;
  private spawnAcc = 0;
  private time = 0;

  constructor(seed = 7) {
    this.rng = mulberry32(seed);
  }

  clear(): void {
    this.count = 0;
    this.spawnAcc = 0;
  }

  private spawn(speedK: number): void {
    if (this.count >= MAX_DROPS) return;
    const i = this.count++;
    const rnd = this.rng;
    // Mostly fine droplets; the occasional fat one.
    const big = rnd() < 0.12;
    this.r[i] = big ? 6 + rnd() * 6 : 1.6 + rnd() * rnd() * 4.5;
    this.x[i] = rnd();
    // Rain hits the lower-front of the visor most at speed.
    this.y[i] = clamp(rnd() * (1 - 0.35 * speedK) + 0.1 * speedK, 0, 1);
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.age[i] = 0;
    this.trail[i] = 0;
    this.kind[i] = (rnd() * 3) | 0;
  }

  private remove(i: number): void {
    const l = --this.count;
    if (i === l) return;
    this.x[i] = this.x[l];
    this.y[i] = this.y[l];
    this.r[i] = this.r[l];
    this.vx[i] = this.vx[l];
    this.vy[i] = this.vy[l];
    this.age[i] = this.age[l];
    this.kind[i] = this.kind[l];
    this.trail[i] = this.trail[l];
  }

  update(dt: number, p: DropParams): void {
    dt = clamp(dt, 0, 0.1);
    this.time += dt;
    const speedK = smoothstep(2, 40, p.speed);
    const rain = clamp(p.rain, 0, 1);
    // Fine spray at speed, fewer but bigger drops when slow.
    this.spawnAcc += dt * rain * (3 + 62 * speedK);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.spawn(speedK);
    }
    // Air speed over the visor (m/s) squared scales the aerodynamic force.
    const air = (p.speed / 28) * (p.speed / 28);
    const jitter = 0.4 * p.buffet;
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i] += dt;
      const r = this.r[i];
      // Adhesion grows with droplet contact area; weight grows with volume (r³).
      const adhesion = 0.55 + r * 0.05;
      const force = air * (1.6 / (0.6 + r * 0.22));
      const gravity = r > 5 && p.speed < 6 ? (r - 5) * 0.06 : 0;
      let ax = 0;
      let ay = 0;
      let moving = false;
      if (force > adhesion) {
        moving = true;
        const push = (force - adhesion) * 0.34;
        // Flow lifts up the visor and diverges outwards from the centre line.
        ay = -push;
        ax = ((this.x[i] - 0.5) * 0.9 + p.side * 0.5 + (this.rng() - 0.5) * jitter) * push * 0.6;
      } else if (gravity > 0) {
        moving = true;
        ay = gravity * 0.1;
      }
      if (moving) {
        // Overdamped slide: velocity follows the force.
        const k = 1 - Math.exp(-9 * dt);
        this.vx[i] += (ax - this.vx[i]) * k;
        this.vy[i] += (ay - this.vy[i]) * k;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.trail[i] = Math.min(0.22, this.trail[i] + Math.abs(this.vy[i]) * dt * 0.9);
        // Wiping through other drops makes this one a little bigger.
        this.r[i] = Math.min(13, r + Math.abs(this.vy[i]) * dt * 0.8);
      } else {
        this.vx[i] *= 0.8;
        this.vy[i] *= 0.8;
        this.trail[i] *= Math.exp(-0.6 * dt);
        // Standing droplets slowly evaporate / are shaken off.
        if (this.age[i] > 14 + (i % 7)) this.r[i] -= dt * 0.6;
      }
      if (this.x[i] < -0.05 || this.x[i] > 1.05 || this.y[i] < -0.08 || this.y[i] > 1.08 || this.r[i] < 0.9) this.remove(i);
    }
  }
}
