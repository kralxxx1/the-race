import { qaddRot, qnormalize, rng32, type V3 } from './math';

/** Visual classes of crash debris (the renderer picks material / colour from these). */
export const DEBRIS = { plastic: 0, dark: 1, glass: 2, chrome: 3, lens: 4, metal: 5 } as const;
export type DebrisKind = (typeof DEBRIS)[keyof typeof DEBRIS];

/**
 * Ballistic shards thrown by an impact: fairing plastic, mirror glass, tail-light lenses, bumper
 * pieces. Cheap point bodies with spin that bounce and skid on the ground (they never push
 * anything). Seeded, so a replay of the same crash scatters them identically.
 */
export class DebrisField {
  readonly max: number;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly quat: Float32Array;
  readonly spin: Float32Array;
  readonly size: Float32Array;
  readonly color: Float32Array;
  readonly kind: Uint8Array;
  count = 0;
  private rng: () => number;
  private resting: Uint8Array;

  constructor(max = 96, seed = 1) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.quat = new Float32Array(max * 4);
    this.spin = new Float32Array(max * 3);
    this.size = new Float32Array(max * 3);
    this.color = new Float32Array(max * 3);
    this.kind = new Uint8Array(max);
    this.resting = new Uint8Array(max);
    this.rng = rng32(seed);
  }

  clear(): void {
    this.count = 0;
  }

  reseed(seed: number): void {
    this.rng = rng32(seed);
    this.count = 0;
  }

  /**
   * Throw `n` pieces of one kind from `origin`, inheriting `vel` plus a random spray. `spread` is the
   * extra speed (m/s) and `up` an upward kick; `rgb` tints plastics.
   */
  burst(origin: V3, vel: V3, n: number, kind: DebrisKind, spread: number, up: number, size: number, rgb: [number, number, number]): void {
    const r = this.rng;
    for (let k = 0; k < n; k++) {
      // Overwrite the oldest piece when full (ring behaviour).
      const i = this.count < this.max ? this.count++ : (k * 7 + Math.floor(r() * this.max)) % this.max;
      const o3 = i * 3;
      const o4 = i * 4;
      this.pos[o3] = origin.x + (r() - 0.5) * 0.4;
      this.pos[o3 + 1] = origin.y + (r() - 0.2) * 0.3;
      this.pos[o3 + 2] = origin.z + (r() - 0.5) * 0.4;
      const sp = spread * (0.3 + r());
      const a = r() * Math.PI * 2;
      const el = (r() - 0.35) * 1.2;
      this.vel[o3] = vel.x * (0.35 + r() * 0.6) + Math.cos(a) * Math.cos(el) * sp;
      this.vel[o3 + 1] = vel.y * 0.4 + up * (0.4 + r()) + Math.sin(el) * sp * 0.6;
      this.vel[o3 + 2] = vel.z * (0.35 + r() * 0.6) + Math.sin(a) * Math.cos(el) * sp;
      // random orientation
      const ax = r() - 0.5;
      const ay = r() - 0.5;
      const az = r() - 0.5;
      const l = Math.hypot(ax, ay, az) || 1;
      const ang = r() * Math.PI * 2;
      const s = Math.sin(ang / 2);
      this.quat[o4] = (ax / l) * s;
      this.quat[o4 + 1] = (ay / l) * s;
      this.quat[o4 + 2] = (az / l) * s;
      this.quat[o4 + 3] = Math.cos(ang / 2);
      this.spin[o3] = (r() - 0.5) * 36;
      this.spin[o3 + 1] = (r() - 0.5) * 36;
      this.spin[o3 + 2] = (r() - 0.5) * 36;
      const sz = size * (0.4 + r() * 1.1);
      this.size[o3] = sz;
      this.size[o3 + 1] = sz * (kind === DEBRIS.glass || kind === DEBRIS.lens ? 0.12 : 0.18);
      this.size[o3 + 2] = sz * (0.5 + r() * 0.6);
      const shade = 0.75 + r() * 0.25;
      this.color[o3] = rgb[0] * shade;
      this.color[o3 + 1] = rgb[1] * shade;
      this.color[o3 + 2] = rgb[2] * shade;
      this.kind[i] = kind;
      this.resting[i] = 0;
    }
  }

  step(dt: number, ground: (x: number, z: number) => number): void {
    const g = 9.81;
    const q = { x: 0, y: 0, z: 0, w: 1 };
    for (let i = 0; i < this.count; i++) {
      if (this.resting[i]) continue;
      const o3 = i * 3;
      const o4 = i * 4;
      this.vel[o3 + 1] -= g * dt;
      // Light air drag: plastic flutters, heavy bits carry on.
      const drag = Math.exp(-0.25 * dt);
      this.vel[o3] *= drag;
      this.vel[o3 + 2] *= drag;
      this.pos[o3] += this.vel[o3] * dt;
      this.pos[o3 + 1] += this.vel[o3 + 1] * dt;
      this.pos[o3 + 2] += this.vel[o3 + 2] * dt;
      q.x = this.quat[o4];
      q.y = this.quat[o4 + 1];
      q.z = this.quat[o4 + 2];
      q.w = this.quat[o4 + 3];
      qaddRot(q, this.spin[o3] * dt, this.spin[o3 + 1] * dt, this.spin[o3 + 2] * dt);
      qnormalize(q);
      this.quat[o4] = q.x;
      this.quat[o4 + 1] = q.y;
      this.quat[o4 + 2] = q.z;
      this.quat[o4 + 3] = q.w;
      const gy = ground(this.pos[o3], this.pos[o3 + 2]) + this.size[o3 + 1] * 0.5;
      if (this.pos[o3 + 1] < gy) {
        this.pos[o3 + 1] = gy;
        if (this.vel[o3 + 1] < 0) this.vel[o3 + 1] = -this.vel[o3 + 1] * 0.32;
        // Sliding friction and scrub of the spin.
        const f = Math.exp(-5 * dt);
        this.vel[o3] *= f;
        this.vel[o3 + 2] *= f;
        this.spin[o3] *= 0.8;
        this.spin[o3 + 1] *= 0.9;
        this.spin[o3 + 2] *= 0.8;
        const sp2 = this.vel[o3] * this.vel[o3] + this.vel[o3 + 2] * this.vel[o3 + 2] + this.vel[o3 + 1] * this.vel[o3 + 1];
        if (sp2 < 0.04) {
          this.resting[i] = 1;
          this.vel[o3] = this.vel[o3 + 1] = this.vel[o3 + 2] = 0;
        }
      }
    }
  }

  shift(dx: number, dy: number, dz: number): void {
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] -= dx;
      this.pos[i * 3 + 1] -= dy;
      this.pos[i * 3 + 2] -= dz;
    }
  }
}
