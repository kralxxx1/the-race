/**
 * Frame pacing helpers: a frame limiter the game loop can query and the
 * adaptive-resolution controller. Both are pure (no DOM / GL) so they are unit
 * tested with simulated clocks.
 */

/**
 * Caps the render rate below the display refresh. requestAnimationFrame ticks at
 * the monitor rate; `shouldRender(now)` says whether this tick is due. It keeps a
 * running deadline instead of comparing against the last frame time, so a 60 fps
 * cap on a 144 Hz monitor settles at a steady 48/72 cadence mix averaging 60
 * instead of drifting to 48.
 */
export class FrameLimiter {
  private interval = 0;
  private due = 0;

  constructor(cap = 0) {
    this.setCap(cap);
  }

  /** Cap in frames per second; 0 disables the limiter. */
  setCap(cap: number): void {
    this.interval = cap > 0 ? 1000 / cap : 0;
    this.due = 0;
  }

  get cap(): number {
    return this.interval > 0 ? 1000 / this.interval : 0;
  }

  /** True when a frame should be produced for the rAF timestamp `now` (ms). */
  shouldRender(now: number): boolean {
    if (this.interval === 0) return true;
    if (this.due === 0) {
      this.due = now + this.interval;
      return true;
    }
    // rAF timestamps jitter by about a millisecond; accept ticks slightly early.
    const slack = Math.min(2, this.interval * 0.12);
    if (now + slack < this.due) return false;
    this.due += this.interval;
    // After a long stall do not try to catch up with a burst of frames.
    if (this.due < now) this.due = now + this.interval;
    return true;
  }
}

export interface AdaptiveOptions {
  /** Frame-rate goal the controller tries to hold. */
  targetFps: number;
  /** Lowest scale it may drop to. */
  minScale: number;
  /** Highest scale it may rise to (1 = never above the preset's own scale). */
  maxScale?: number;
  /** Scale granularity (changing resolution re-allocates targets, so step coarsely). */
  step?: number;
}

/**
 * Dynamic resolution controller. Feed it each frame's duration; it returns the
 * scale (relative to the preset's render scale) that keeps the smoothed frame
 * time inside the budget. Pixel cost scales with scale², so the reduction is
 * sized from the overshoot instead of creeping down one step per second:
 * dropping fast avoids a long stutter.
 *
 * Raising is trickier: with vsync the frame interval is pinned at the refresh
 * period even when the GPU is mostly idle, so "fast enough" cannot be told from
 * "plenty of headroom". When frames meet the budget for a while the controller
 * probes one step up; if that step misses the budget it falls back to the last
 * good scale and refuses to go above it for a while (no oscillation).
 */
export class AdaptiveResolution {
  private _scale: number;
  private ema = 0;
  private over = 0;
  private under = 0;
  private cooldown = 0;
  private clock = 0;
  /** Highest scale allowed until `ceilingUntil` (a probe above it recently failed). */
  private ceiling = 1;
  private ceilingUntil = 0;
  /** Scale before the last upward probe and when the probe happened. */
  private lastGood = 1;
  private probeAt = -1e9;
  private readonly step: number;

  constructor(private opts: AdaptiveOptions) {
    this.step = opts.step ?? 0.05;
    this._scale = opts.maxScale ?? 1;
    this.lastGood = this._scale;
  }

  get scale(): number {
    return this._scale;
  }

  configure(opts: Partial<AdaptiveOptions>): void {
    this.opts = { ...this.opts, ...opts };
    this._scale = Math.max(this.opts.minScale, Math.min(this.opts.maxScale ?? 1, this._scale));
  }

  reset(scale = this.opts.maxScale ?? 1): void {
    this._scale = scale;
    this.lastGood = scale;
    this.ema = 0;
    this.over = 0;
    this.under = 0;
    this.cooldown = 0;
    this.ceilingUntil = 0;
    this.probeAt = -1e9;
  }

  /** Advance by one frame of `frameMs`; returns the (possibly new) scale. */
  update(frameMs: number): number {
    const dt = Math.min(frameMs, 250) / 1000;
    this.clock += dt;
    this.ema = this.ema === 0 ? frameMs : this.ema + (Math.min(frameMs, 250) - this.ema) * 0.1;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return this._scale;
    }
    const budget = 1000 / this.opts.targetFps;
    const max = this.opts.maxScale ?? 1;
    const limit = this.clock < this.ceilingUntil ? Math.min(max, this.ceiling) : max;
    if (this.ema > budget * 1.1) {
      this.over += dt;
      this.under = 0;
      if (this.over > 0.6) {
        // Pixel cost ∝ scale²: aim at the scale whose cost fits the budget, with a little margin.
        let target = Math.floor((this._scale * Math.sqrt((budget * 0.95) / this.ema)) / this.step) * this.step;
        if (this.clock - this.probeAt < 6) {
          // The step we just probed does not fit: return to the last good scale and keep off it for a while.
          target = Math.max(target, this.lastGood);
          if (target < this._scale) {
            this.ceiling = target;
            this.ceilingUntil = this.clock + 25;
          }
        }
        this.setScale(target);
      }
    } else if (this.ema <= budget * 1.06 && this._scale < limit) {
      this.under += dt;
      this.over = 0;
      const need = this.ema < budget * 0.72 ? 2.5 : 7;
      if (this.under > need) {
        this.lastGood = this._scale;
        this.probeAt = this.clock;
        this.setScale(this._scale + this.step);
      }
    } else {
      this.over = 0;
      this.under = 0;
    }
    return this._scale;
  }

  private setScale(next: number): void {
    const clamped = Math.max(this.opts.minScale, Math.min(this.opts.maxScale ?? 1, next));
    if (Math.abs(clamped - this._scale) < 1e-6) {
      this.over = 0;
      this.under = 0;
      return;
    }
    this._scale = clamped;
    this.over = 0;
    this.under = 0;
    // Let the new resolution settle (the EMA still holds the old cost) before judging again.
    this.cooldown = 1.0;
    this.ema = 0;
  }
}

/** Rolling frame-time history for the performance overlay. */
export class FrameStats {
  readonly history: Float32Array;
  private head = 0;
  private count = 0;
  private acc = 0;
  private frames = 0;
  /** Smoothed frames per second (updated twice a second). */
  fps = 0;
  /** Smoothed frame time in ms. */
  frameMs = 0;
  /** Worst frame of the last second, ms. */
  worstMs = 0;
  private worstAcc = 0;

  constructor(size = 120) {
    this.history = new Float32Array(size);
  }

  push(frameMs: number): void {
    this.history[this.head] = frameMs;
    this.head = (this.head + 1) % this.history.length;
    this.count = Math.min(this.count + 1, this.history.length);
    this.acc += frameMs;
    this.frames++;
    this.worstAcc = Math.max(this.worstAcc, frameMs);
    if (this.acc >= 500) {
      this.frameMs = this.acc / this.frames;
      this.fps = 1000 / this.frameMs;
      this.worstMs = this.worstAcc;
      this.acc = 0;
      this.frames = 0;
      this.worstAcc = 0;
    }
  }

  /** History oldest → newest into `out` (length = number of valid samples). */
  ordered(out: number[]): number[] {
    out.length = 0;
    const n = this.history.length;
    for (let i = 0; i < this.count; i++) out.push(this.history[(this.head - this.count + i + n * 2) % n]);
    return out;
  }
}
