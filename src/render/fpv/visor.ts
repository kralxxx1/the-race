import { clamp, mulberry32 } from '../../core/math';
import { DropletField, type DropParams } from './visorDrops';

export interface VisorState extends DropParams {
  /** First-person view active (overlay hidden otherwise). */
  active: boolean;
  /** Visor opening shading. */
  frame: boolean;
  /** 0..1 crack overlay opacity (after a crash). */
  crack: number;
  /** Cinematic letterbox + "replay" tag. */
  letterbox: number;
}

const BASE_W = 1280;

/**
 * Screen-space visor layer drawn on a transparent 2D canvas stacked over the game canvas:
 * rain droplets (see DropletField), the cracked-visor overlay and a subtle edge vignette.
 * The canvas runs at reduced resolution (≤ 960 px wide) — everything on it is soft anyway.
 */
export class VisorFx {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private drops = new DropletField();
  private sprites: HTMLCanvasElement[] = [];
  private frameLayer: HTMLCanvasElement | null = null;
  private crackLayer: HTMLCanvasElement | null = null;
  private crackSeed = 1;
  private w = 0;
  private h = 0;
  private drawn = false;
  private label: HTMLDivElement;
  private idle: DropParams = { rain: 0, speed: 0, side: 0, buffet: 0 };

  constructor(private parent: HTMLElement, anchor: HTMLElement | null) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'visor-fx';
    this.canvas.setAttribute('aria-hidden', 'true');
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', display: 'none' });
    this.label = document.createElement('div');
    Object.assign(this.label.style, {
      position: 'absolute', left: '0', right: '0', bottom: '9%', textAlign: 'center', color: '#fff', font: '700 15px system-ui, sans-serif',
      letterSpacing: '0.45em', textShadow: '0 1px 6px rgba(0,0,0,.7)', pointerEvents: 'none', display: 'none', opacity: '0.85',
    });
    this.label.textContent = 'TEKRAR';
    if (anchor && anchor.parentElement === parent) {
      anchor.after(this.canvas);
      this.canvas.after(this.label);
    } else {
      parent.append(this.canvas, this.label);
    }
    this.ctx = this.canvas.getContext('2d');
    for (let k = 0; k < 3; k++) this.sprites.push(makeDropSprite(k));
  }

  private resize(): void {
    const cw = this.parent.clientWidth || window.innerWidth;
    const ch = this.parent.clientHeight || window.innerHeight;
    const scale = Math.min(1, 960 / Math.max(1, cw));
    const w = Math.max(2, Math.round(cw * scale));
    const h = Math.max(2, Math.round(ch * scale));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.frameLayer = null;
    this.crackLayer = null;
  }

  /** Forget standing droplets (new run / respawn). */
  reset(): void {
    this.drops.clear();
    this.crackSeed = (this.crackSeed * 16807) % 2147483647;
    this.crackLayer = null;
  }

  update(dt: number, s: VisorState): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const rainOn = s.active && s.rain > 0.01;
    if (rainOn) this.drops.update(dt, s);
    else if (this.drops.count > 0) {
      const z = this.idle;
      z.speed = s.speed;
      z.side = s.side;
      z.buffet = s.buffet;
      this.drops.update(dt, z);
    }
    const show = s.active && (rainOn || this.drops.count > 0 || s.crack > 0.01 || s.frame) || s.letterbox > 0.01;
    this.label.style.display = s.letterbox > 0.5 ? 'block' : 'none';
    if (!show) {
      if (this.drawn) {
        ctx.clearRect(0, 0, this.w, this.h);
        this.canvas.style.display = 'none';
        this.drawn = false;
      }
      return;
    }
    this.resize();
    this.canvas.style.display = 'block';
    this.drawn = true;
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const k = w / BASE_W;
    if (s.active && s.frame) ctx.drawImage(this.frame(), 0, 0);
    // Droplets
    const d = this.drops;
    if (s.active) {
      for (let i = 0; i < d.count; i++) {
        const x = d.x[i] * w;
        const y = d.y[i] * h;
        const r = d.r[i] * k;
        const tl = d.trail[i];
        if (tl > 0.004) {
          // Wet streak left behind a sliding droplet.
          const g = ctx.createLinearGradient(x, y, x, y + tl * h);
          g.addColorStop(0, 'rgba(255,255,255,0.20)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - r * 0.35, y, r * 0.7, tl * h);
        }
        const spr = this.sprites[d.kind[i]];
        ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
      }
      if (s.crack > 0.01) {
        ctx.globalAlpha = clamp(s.crack, 0, 1);
        ctx.drawImage(this.crack(), 0, 0);
        ctx.globalAlpha = 1;
      }
    }
    if (s.letterbox > 0.01) {
      const bar = Math.round(h * 0.11 * clamp(s.letterbox, 0, 1));
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
    }
  }

  private frame(): HTMLCanvasElement {
    if (this.frameLayer) return this.frameLayer;
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext('2d')!;
    // Rounded visor opening: darkness creeping in from the sides and a heavier brow at the top.
    g.save();
    g.translate(this.w / 2, this.h * 0.52);
    g.scale(this.w / this.h, 1);
    const R = this.h * 0.95;
    const rg = g.createRadialGradient(0, 0, R * 0.62, 0, 0, R);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = rg;
    g.fillRect(-this.w, -this.h, this.w * 2, this.h * 2);
    g.restore();
    const tg = g.createLinearGradient(0, 0, 0, this.h * 0.14);
    tg.addColorStop(0, 'rgba(0,0,0,0.5)');
    tg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = tg;
    g.fillRect(0, 0, this.w, this.h * 0.14);
    this.frameLayer = c;
    return c;
  }

  /** Impact star + radial and ring cracks, generated once per crash. */
  private crack(): HTMLCanvasElement {
    if (this.crackLayer) return this.crackLayer;
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext('2d')!;
    const rnd = mulberry32(this.crackSeed * 977 + 13);
    const cx = this.w * (0.28 + rnd() * 0.44);
    const cy = this.h * (0.25 + rnd() * 0.35);
    const reach = this.h * (0.55 + rnd() * 0.25);
    const rays = 9 + ((rnd() * 5) | 0);
    const paths: [number, number][][] = [];
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
      const len = reach * (0.35 + rnd() * 0.65);
      const pts: [number, number][] = [[cx, cy]];
      let a = a0;
      let r = 0;
      while (r < len) {
        r += len / (5 + rnd() * 4);
        a += (rnd() - 0.5) * 0.28;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        // Little forks.
        if (rnd() < 0.3) {
          const fa = a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6);
          const fl = (len - r) * (0.2 + rnd() * 0.35);
          paths.push([[cx + Math.cos(a) * r, cy + Math.sin(a) * r], [cx + Math.cos(fa) * (r + fl), cy + Math.sin(fa) * (r + fl)]]);
        }
      }
      paths.push(pts);
    }
    // Concentric rings joining neighbouring rays.
    for (const f of [0.08, 0.17, 0.3]) {
      const pts: [number, number][] = [];
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const rr = reach * f * (0.85 + rnd() * 0.3);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      if (rnd() < 0.85) paths.push(pts.slice(0, Math.floor(steps * (0.4 + rnd() * 0.5))));
    }
    const stroke = (col: string, wd: number, ox: number, oy: number) => {
      g.strokeStyle = col;
      g.lineWidth = wd;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const p of paths) {
        g.beginPath();
        g.moveTo(p[0][0] + ox, p[0][1] + oy);
        for (let i = 1; i < p.length; i++) g.lineTo(p[i][0] + ox, p[i][1] + oy);
        g.stroke();
      }
    };
    const k = this.w / BASE_W;
    stroke('rgba(0,0,0,0.55)', 2.6 * k, 1.2 * k, 1.2 * k);
    stroke('rgba(235,242,250,0.8)', 1.4 * k, 0, 0);
    // Bright chipped impact point.
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 16 * k);
    rg.addColorStop(0, 'rgba(255,255,255,0.85)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(cx - 20 * k, cy - 20 * k, 40 * k, 40 * k);
    this.crackLayer = c;
    return c;
  }

  dispose(): void {
    this.canvas.remove();
    this.label.remove();
    this.frameLayer = this.crackLayer = null;
  }
}

/** Soft bead with a dark rim, a clear centre that mimics refraction, and specular glints. */
function makeDropSprite(variant: number): HTMLCanvasElement {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const m = S / 2;
  const body = g.createRadialGradient(m, m, S * 0.05, m, m, m * 0.96);
  body.addColorStop(0, 'rgba(220,235,250,0.10)');
  body.addColorStop(0.6, 'rgba(190,210,230,0.14)');
  body.addColorStop(0.88, 'rgba(20,28,38,0.42)');
  body.addColorStop(1, 'rgba(20,28,38,0)');
  g.fillStyle = body;
  g.beginPath();
  g.arc(m, m, m * 0.97, 0, Math.PI * 2);
  g.fill();
  // Inverted-image caustic along the lower inside edge.
  const lo = g.createRadialGradient(m, m + m * 0.35, 0, m, m + m * 0.35, m * 0.65);
  lo.addColorStop(0, 'rgba(255,255,255,0.34)');
  lo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lo;
  g.fill();
  // Specular highlights (position varies per variant).
  const hx = m - m * (0.32 + variant * 0.08);
  const hy = m - m * (0.38 - variant * 0.06);
  const sp = g.createRadialGradient(hx, hy, 0, hx, hy, m * 0.28);
  sp.addColorStop(0, 'rgba(255,255,255,0.95)');
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sp;
  g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.arc(m + m * 0.38, m + m * 0.42, m * 0.08, 0, Math.PI * 2);
  g.fill();
  return c;
}
