import { clamp } from '../core/math';
import { UI_PALETTE } from './uiApply';

export type GaugeStyle = 'dial' | 'bar' | 'digital';

export interface GaugeOptions {
  style: GaugeStyle;
  /** Show the rev needle / bar. */
  rpm: boolean;
  /** Show the gear letter. */
  gear: boolean;
  /** Show the shift LEDs. */
  shiftLights: boolean;
}

/** Pixel size of the gauge canvas (CSS px at scale 1) for each style. */
export function gaugeSize(style: GaugeStyle, small: boolean): { w: number; h: number } {
  switch (style) {
    case 'dial':
      return small ? { w: 150, h: 150 } : { w: 220, h: 220 };
    case 'bar':
      return small ? { w: 250, h: 92 } : { w: 340, h: 118 };
    case 'digital':
      return small ? { w: 170, h: 78 } : { w: 230, h: 100 };
  }
}

/**
 * Instrument cluster drawn on a canvas: an analog tachometer with the speed in the middle
 * ("dial"), a Traffic Rider style horizontal rev bar with big speed and gear ("bar"), or only
 * speed and gear ("digital"). Colours come from the shared UI palette so the colour-blind
 * modes recolour the gauge too.
 */
export class Tacho {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private w = 220;
  private h = 220;
  private needle = 0;
  private maxRpm = 12000;
  private redline = 10000;
  private electric = false;
  private automatic = false;
  opts: GaugeOptions = { style: 'dial', rpm: true, gear: true, shiftLights: true };

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'tacho';
    this.g = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.resize(220, 220);
  }

  resize(w: number, h = w): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  configure(redline: number, limiter: number, automatic: boolean, electric: boolean): void {
    this.electric = electric;
    this.automatic = automatic;
    this.redline = redline;
    this.maxRpm = Math.ceil((limiter * 1.06) / 1000) * 1000;
  }

  draw(rpm: number, speed: number, unit: string, gear: number, dt: number, shift: boolean): void {
    this.needle += (rpm - this.needle) * Math.min(1, dt * 18);
    this.g.clearRect(0, 0, this.w, this.h);
    switch (this.opts.style) {
      case 'dial':
        this.drawDial(rpm, speed, unit, gear, shift);
        break;
      case 'bar':
        this.drawBar(rpm, speed, unit, gear, shift);
        break;
      case 'digital':
        this.drawDigital(rpm, speed, unit, gear, shift);
        break;
    }
  }

  private gearText(gear: number): string {
    return this.automatic ? 'D' : gear <= 0 ? 'N' : String(gear);
  }

  private ledColor(i: number, n: number): string {
    const k = i / n;
    return k < 0.55 ? UI_PALETTE.good : k < 0.82 ? UI_PALETTE.warn : UI_PALETTE.bad;
  }

  // ───────────────────────────── dial ─────────────────────────────
  private drawDial(rpm: number, speed: number, unit: string, gear: number, shift: boolean): void {
    const g = this.g;
    const S = this.w;
    const cx = S / 2;
    const cy = S / 2;
    const R = S * 0.46;
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    const ang = (r: number) => a0 + (a1 - a0) * clamp(r / this.maxRpm, 0, 1);
    // Face
    const grd = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    grd.addColorStop(0, 'rgba(20,23,30,0.9)');
    grd.addColorStop(1, 'rgba(6,7,10,0.9)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.stroke();
    if (this.opts.rpm) {
      // Live sweep behind the ticks.
      g.lineCap = 'round';
      g.lineWidth = S * 0.05;
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.beginPath();
      g.arc(cx, cy, R * 0.86, a0, a1);
      g.stroke();
      const sweep = g.createConicGradient ? g.createConicGradient(a0, cx, cy) : null;
      if (sweep) {
        sweep.addColorStop(0, UI_PALETTE.good);
        sweep.addColorStop(0.45, UI_PALETTE.warn);
        sweep.addColorStop(0.75, UI_PALETTE.bad);
        g.strokeStyle = sweep;
      } else g.strokeStyle = UI_PALETTE.accent;
      g.globalAlpha = 0.55;
      g.beginPath();
      g.arc(cx, cy, R * 0.86, a0, Math.max(a0 + 0.001, ang(this.needle)));
      g.stroke();
      g.globalAlpha = 1;
      g.lineCap = 'butt';
      // Red zone
      g.lineWidth = S * 0.02;
      g.strokeStyle = UI_PALETTE.bad;
      g.beginPath();
      g.arc(cx, cy, R * 0.95, ang(this.redline), ang(this.maxRpm));
      g.stroke();
      // Ticks
      const step = this.maxRpm > 14000 ? 2000 : 1000;
      g.font = `700 ${Math.round(S * 0.058)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let r = 0; r <= this.maxRpm; r += step / 2) {
        const a = ang(r);
        const major = r % step === 0;
        const r0 = R * (major ? 0.74 : 0.8);
        g.strokeStyle = r >= this.redline ? UI_PALETTE.bad : '#cfd6df';
        g.lineWidth = major ? 2.4 : 1.2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92);
        g.stroke();
        if (major) {
          g.fillStyle = r >= this.redline ? UI_PALETTE.bad : '#cfd6df';
          g.fillText(String(r / 1000), cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6);
        }
      }
      // Needle
      const na = ang(this.needle);
      g.strokeStyle = UI_PALETTE.accent;
      g.lineWidth = 3.5;
      g.shadowColor = UI_PALETTE.accent;
      g.shadowBlur = 10;
      g.beginPath();
      g.moveTo(cx - Math.cos(na) * R * 0.1, cy - Math.sin(na) * R * 0.1);
      g.lineTo(cx + Math.cos(na) * R * 0.82, cy + Math.sin(na) * R * 0.82);
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = '#2a2d35';
      g.beginPath();
      g.arc(cx, cy, R * 0.08, 0, Math.PI * 2);
      g.fill();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (this.opts.gear) {
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.beginPath();
      g.roundRect(cx - R * 0.2, cy - R * 0.5, R * 0.4, R * 0.36, R * 0.06);
      g.fill();
      g.fillStyle = shift ? UI_PALETTE.bad : '#ffd24a';
      g.font = `800 ${Math.round(S * 0.15)}px system-ui, sans-serif`;
      g.fillText(this.gearText(gear), cx, cy - R * 0.32);
    }
    g.fillStyle = '#ffffff';
    g.font = `800 ${Math.round(S * (this.opts.rpm ? 0.17 : 0.22))}px system-ui, sans-serif`;
    g.fillText(String(Math.round(speed)), cx, cy + R * 0.32);
    g.fillStyle = '#8f9aab';
    g.font = `600 ${Math.round(S * 0.055)}px system-ui, sans-serif`;
    g.fillText(unit, cx, cy + R * 0.55);
    if (this.opts.rpm) g.fillText('x1000 d/dk', cx, cy + R * 0.7);
    if (this.opts.shiftLights && !this.electric) {
      const frac = clamp((rpm - this.redline * 0.82) / (this.redline * 0.18), 0, 1);
      for (let i = 0; i < 5; i++) {
        const on = frac > i / 5;
        g.fillStyle = on ? (i < 2 ? UI_PALETTE.good : i < 4 ? UI_PALETTE.warn : UI_PALETTE.bad) : 'rgba(255,255,255,0.08)';
        if (shift && Math.floor(performance.now() / 80) % 2 === 0) g.fillStyle = UI_PALETTE.bad;
        g.beginPath();
        g.arc(cx - R * 0.3 + i * R * 0.15, cy - R * 0.62, R * 0.045, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // ───────────────────────────── bar ─────────────────────────────
  private drawBar(_rpm: number, speed: number, unit: string, gear: number, shift: boolean): void {
    const g = this.g;
    const W = this.w;
    const H = this.h;
    g.fillStyle = 'rgba(8,10,14,0.66)';
    g.beginPath();
    g.roundRect(0, 0, W, H, 14);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 1.5;
    g.stroke();
    const pad = 12;
    let top = pad;
    if (this.opts.rpm) {
      const n = 30;
      const gap = 2;
      const segW = (W - pad * 2 - gap * (n - 1)) / n;
      const lit = clamp(this.needle / this.maxRpm, 0, 1) * n;
      const redFrom = (this.redline / this.maxRpm) * n;
      for (let i = 0; i < n; i++) {
        const on = i < lit;
        g.fillStyle = on ? (i >= redFrom ? UI_PALETTE.bad : this.ledColor(i, redFrom)) : 'rgba(255,255,255,0.09)';
        if (on && shift && Math.floor(performance.now() / 80) % 2 === 0) g.fillStyle = '#fff';
        g.fillRect(pad + i * (segW + gap), top, segW, H * 0.17);
      }
      top += H * 0.17 + 8;
    }
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = '#fff';
    const sz = Math.round((H - top - pad) * 1.18);
    g.font = `900 italic ${sz}px system-ui, sans-serif`;
    const baseY = H - pad - 2;
    g.fillText(String(Math.round(speed)), pad, baseY);
    const tw = g.measureText(String(Math.round(speed))).width;
    g.fillStyle = '#8f9aab';
    g.font = `700 ${Math.round(sz * 0.26)}px system-ui, sans-serif`;
    g.fillText(unit, pad + tw + 6, baseY);
    if (this.opts.gear) {
      g.textAlign = 'right';
      g.fillStyle = shift ? UI_PALETTE.bad : '#ffd24a';
      g.font = `900 italic ${Math.round(sz * 0.95)}px system-ui, sans-serif`;
      g.fillText(this.gearText(gear), W - pad, baseY);
    }
  }

  // ───────────────────────────── digital ─────────────────────────────
  private drawDigital(rpm: number, speed: number, unit: string, gear: number, shift: boolean): void {
    const g = this.g;
    const W = this.w;
    const H = this.h;
    g.fillStyle = 'rgba(8,10,14,0.66)';
    g.beginPath();
    g.roundRect(0, 0, W, H, 14);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 1.5;
    g.stroke();
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = '#fff';
    g.font = `900 italic ${Math.round(H * 0.62)}px system-ui, sans-serif`;
    const txt = String(Math.round(speed));
    g.fillText(txt, 12, H * 0.72);
    const tw = g.measureText(txt).width;
    g.fillStyle = '#8f9aab';
    g.font = `700 ${Math.round(H * 0.16)}px system-ui, sans-serif`;
    g.fillText(unit, 16 + tw, H * 0.72);
    if (this.opts.gear) {
      g.textAlign = 'right';
      g.fillStyle = shift ? UI_PALETTE.bad : '#ffd24a';
      g.font = `900 italic ${Math.round(H * 0.5)}px system-ui, sans-serif`;
      g.fillText(this.gearText(gear), W - 12, H * 0.62);
    }
    if (this.opts.shiftLights && !this.electric) {
      const frac = clamp((rpm - this.redline * 0.82) / (this.redline * 0.18), 0, 1);
      for (let i = 0; i < 5; i++) {
        const on = frac > i / 5;
        g.fillStyle = on ? (i < 2 ? UI_PALETTE.good : i < 4 ? UI_PALETTE.warn : UI_PALETTE.bad) : 'rgba(255,255,255,0.09)';
        if (shift && Math.floor(performance.now() / 80) % 2 === 0) g.fillStyle = UI_PALETTE.bad;
        g.beginPath();
        g.arc(14 + i * 14, H * 0.9, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}
