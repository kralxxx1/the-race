import * as THREE from 'three';
import { makeCanvas } from './livery';
import type { DashKind } from './types';

export interface DashState {
  rpmFrac: number;
  gear: number;
  speed: number;
  shift: boolean;
  units: 'kmh' | 'mph';
}

/**
 * Instrument panel drawn on a canvas (one per bike instance) in the style of the
 * real bike: R1-style bar-graph TFT, Ducati-style arc TFT, round TFT, LCD,
 * analogue clocks… The canvas maps onto the dash screen quad (UV 0..1).
 */
export class DashRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.Texture;
  private g: CanvasRenderingContext2D | null;
  readonly w: number;
  readonly h: number;

  constructor(
    readonly kind: DashKind,
    px: number,
    aspect: number,
    private brand = '',
  ) {
    const round = kind === 'tftRound' || kind === 'analog' || kind === 'harley';
    this.w = Math.max(128, px);
    this.h = round ? this.w : Math.max(64, Math.round(this.w / Math.max(0.8, aspect)));
    const c = makeCanvas(this.w, this.h);
    this.canvas = c ?? ({ width: this.w, height: this.h } as HTMLCanvasElement);
    this.g = c?.getContext('2d') ?? null;
    this.texture = c ? new THREE.CanvasTexture(c) : new THREE.DataTexture(new Uint8Array([4, 6, 10, 255]), 1, 1);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  draw(s: DashState): void {
    const g = this.g;
    if (!g) return;
    switch (this.kind) {
      case 'tftR1':
        this.r1(g, s);
        break;
      case 'tftDucati':
        this.ducati(g, s);
        break;
      case 'tftBmw':
      case 'tftWide':
        this.wide(g, s);
        break;
      case 'tftRound':
        this.round(g, s);
        break;
      case 'lcd':
      case 'scooter':
        this.lcd(g, s);
        break;
      case 'analog':
      case 'harley':
        this.analog(g, s, true);
        break;
      case 'analogTwin':
        this.analog(g, s, false);
        break;
      default:
        this.tft(g, s);
    }
    this.texture.needsUpdate = true;
  }

  private font(px: number, weight = '700', family = 'Arial, Helvetica, sans-serif'): string {
    return `${weight} ${Math.round(px)}px ${family}`;
  }

  private gearText(gear: number): string {
    return gear <= 0 ? 'N' : String(gear);
  }

  private unitText(u: 'kmh' | 'mph'): string {
    return u === 'kmh' ? 'km/h' : 'mph';
  }

  /** Yamaha R1 (2020+): white-on-black TFT, segmented rev bar sweeping across the top, big gear on the right. */
  private r1(g: CanvasRenderingContext2D, s: DashState): void {
    const W = this.w, H = this.h;
    g.fillStyle = '#030406';
    g.fillRect(0, 0, W, H);
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const on = t < s.rpmFrac;
      const x = W * 0.04 + t * W * 0.92;
      const hgt = H * (0.08 + 0.2 * Math.pow(t, 1.6));
      g.fillStyle = on ? (t > 0.86 ? '#ff2a2a' : t > 0.7 ? '#ffffff' : '#3fb6ff') : '#121a24';
      g.fillRect(x, H * 0.34 - hgt, W * 0.017, hgt);
    }
    // rpm scale numbers
    g.fillStyle = '#7d8a99';
    g.font = this.font(H * 0.07);
    g.textAlign = 'center';
    for (let i = 0; i <= 14; i += 2) g.fillText(String(i), W * 0.04 + (i / 15) * W * 0.92, H * 0.42);
    g.fillStyle = '#ffffff';
    g.font = this.font(H * 0.36, '800');
    g.textAlign = 'right';
    g.fillText(String(Math.round(s.speed)), W * 0.62, H * 0.84);
    g.font = this.font(H * 0.08);
    g.fillStyle = '#9fb3c8';
    g.fillText(this.unitText(s.units), W * 0.62, H * 0.95);
    // Gear box
    g.strokeStyle = '#3fb6ff';
    g.lineWidth = H * 0.015;
    g.strokeRect(W * 0.74, H * 0.48, W * 0.2, H * 0.44);
    g.fillStyle = s.shift ? '#ff2a2a' : '#ffffff';
    g.font = this.font(H * 0.38, '900');
    g.textAlign = 'center';
    g.fillText(this.gearText(s.gear), W * 0.84, H * 0.85);
    // Mode indicators
    g.font = this.font(H * 0.065, '700');
    g.textAlign = 'left';
    g.fillStyle = '#3fb6ff';
    g.fillText('PWR 1  TCS 3  SCS 2  LIF 1', W * 0.04, H * 0.56);
    g.fillStyle = '#7d8a99';
    g.fillText('TRIP 1  0124.6', W * 0.04, H * 0.66);
    if (s.shift) {
      g.fillStyle = '#ff2a2a';
      g.fillRect(0, 0, W, H * 0.03);
    }
  }

  /** Ducati Panigale (2022+): arc rev counter, central gear, speed on the left, rpm number on top. */
  private ducati(g: CanvasRenderingContext2D, s: DashState): void {
    const W = this.w, H = this.h;
    g.fillStyle = '#020203';
    g.fillRect(0, 0, W, H);
    // Arc bar graph across the top
    const cx = W / 2, cy = H * 1.55, r = H * 1.32;
    const a0 = Math.PI * 1.22, a1 = Math.PI * 1.78;
    g.lineWidth = H * 0.14;
    g.strokeStyle = '#1a1c20';
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.stroke();
    const aRpm = a0 + (a1 - a0) * Math.max(0, Math.min(1, s.rpmFrac));
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.75, '#ffffff');
    grad.addColorStop(0.82, '#ffb300');
    grad.addColorStop(1, '#ff1e1e');
    g.strokeStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, a0, aRpm);
    g.stroke();
    // Tick numbers
    g.fillStyle = '#a7a9ad';
    g.font = this.font(H * 0.07);
    g.textAlign = 'center';
    for (let i = 0; i <= 16; i += 2) {
      const a = a0 + ((a1 - a0) * i) / 16;
      g.fillText(String(i), cx + Math.cos(a) * (r - H * 0.14), cy + Math.sin(a) * (r - H * 0.14));
    }
    // Gear (centre) in a red box when shifting
    g.fillStyle = s.shift ? '#d40000' : '#141518';
    g.fillRect(W * 0.43, H * 0.42, W * 0.14, H * 0.42);
    g.fillStyle = '#ffffff';
    g.font = this.font(H * 0.38, '800');
    g.fillText(this.gearText(s.gear), W * 0.5, H * 0.77);
    // Speed (left)
    g.textAlign = 'right';
    g.font = this.font(H * 0.3, '800');
    g.fillText(String(Math.round(s.speed)), W * 0.36, H * 0.74);
    g.font = this.font(H * 0.07);
    g.fillStyle = '#a7a9ad';
    g.fillText(this.unitText(s.units), W * 0.36, H * 0.86);
    // Riding mode block (right)
    g.textAlign = 'left';
    g.fillStyle = '#cc0a0a';
    g.fillRect(W * 0.63, H * 0.46, W * 0.31, H * 0.12);
    g.fillStyle = '#ffffff';
    g.font = this.font(H * 0.08, '800');
    g.fillText('RACE A', W * 0.65, H * 0.55);
    g.fillStyle = '#a7a9ad';
    g.font = this.font(H * 0.07);
    g.fillText('DTC 3  DWC 2  EBC 1', W * 0.64, H * 0.7);
    g.fillText('ABS 2  DQS ON', W * 0.64, H * 0.8);
  }

  private tft(g: CanvasRenderingContext2D, s: DashState): void {
    const W = this.w, H = this.h;
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, W, H);
    const segs = 28;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      g.fillStyle = t < s.rpmFrac ? (t > 0.82 ? '#ff3030' : t > 0.65 ? '#ffb020' : '#36d1ff') : '#16202a';
      const hgt = H * (0.08 + 0.18 * t);
      g.fillRect(W * 0.04 + t * W * 0.92, H * 0.32 - hgt, W * 0.025, hgt);
    }
    g.fillStyle = '#e8f6ff';
    g.font = this.font(H * 0.42, '800');
    g.textAlign = 'right';
    g.fillText(String(Math.round(s.speed)), W * 0.66, H * 0.86);
    g.font = this.font(H * 0.12);
    g.fillStyle = '#7fa8c4';
    g.fillText(this.unitText(s.units), W * 0.84, H * 0.86);
    g.textAlign = 'center';
    g.font = this.font(H * 0.34, '800');
    g.fillStyle = s.shift ? '#ff3030' : '#ffd24a';
    g.fillText(this.gearText(s.gear), W * 0.9, H * 0.62);
    if (this.brand) {
      g.font = this.font(H * 0.07);
      g.fillStyle = '#4a6a85';
      g.textAlign = 'left';
      g.fillText(this.brand.toUpperCase(), W * 0.04, H * 0.95);
    }
  }

  private wide(g: CanvasRenderingContext2D, s: DashState): void {
    const W = this.w, H = this.h;
    g.fillStyle = '#06080b';
    g.fillRect(0, 0, W, H);
    // Half-moon rev counter on the left, info panes on the right
    const cx = W * 0.3, cy = H * 0.62, r = H * 0.46;
    g.lineWidth = H * 0.06;
    g.strokeStyle = '#1b222b';
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 2.15);
    g.stroke();
    g.strokeStyle = s.rpmFrac > 0.85 ? '#ff3b30' : '#e9eef5';
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 0.85 + Math.PI * 1.3 * Math.max(0, Math.min(1, s.rpmFrac)));
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = this.font(H * 0.3, '800');
    g.textAlign = 'center';
    g.fillText(String(Math.round(s.speed)), cx, cy + H * 0.08);
    g.font = this.font(H * 0.08);
    g.fillStyle = '#8ca0b8';
    g.fillText(this.unitText(s.units), cx, cy + H * 0.2);
    g.fillStyle = '#10161d';
    g.fillRect(W * 0.6, H * 0.12, W * 0.36, H * 0.76);
    g.fillStyle = '#ffffff';
    g.font = this.font(H * 0.32, '800');
    g.fillText(this.gearText(s.gear), W * 0.78, H * 0.56);
    g.font = this.font(H * 0.07);
    g.fillStyle = '#8ca0b8';
    g.fillText('RIDE PRO', W * 0.78, H * 0.76);
  }

  private round(g: CanvasRenderingContext2D, s: DashState): void {
    const W = this.w;
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, W, W);
    const c = W / 2;
    g.lineWidth = W * 0.06;
    g.strokeStyle = '#1a222c';
    g.beginPath();
    g.arc(c, c, W * 0.4, Math.PI * 0.75, Math.PI * 2.25);
    g.stroke();
    g.strokeStyle = s.rpmFrac > 0.85 ? '#ff3b30' : '#f0a020';
    g.beginPath();
    g.arc(c, c, W * 0.4, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * Math.max(0, Math.min(1, s.rpmFrac)));
    g.stroke();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.font = this.font(W * 0.22, '800');
    g.fillText(String(Math.round(s.speed)), c, c + W * 0.06);
    g.font = this.font(W * 0.06);
    g.fillStyle = '#93a3b5';
    g.fillText(this.unitText(s.units), c, c + W * 0.15);
    g.font = this.font(W * 0.12, '800');
    g.fillStyle = '#f0a020';
    g.fillText(this.gearText(s.gear), c, c + W * 0.33);
  }

  private lcd(g: CanvasRenderingContext2D, s: DashState): void {
    const W = this.w, H = this.h;
    g.fillStyle = '#9fae93';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 24; i++) g.fillRect(W * 0.05 + i * W * 0.038, H * 0.12, W * 0.028, H * 0.18);
    g.fillStyle = '#1a2216';
    for (let i = 0; i < 24; i++) if (i / 24 < s.rpmFrac) g.fillRect(W * 0.05 + i * W * 0.038, H * 0.12, W * 0.028, H * 0.18);
    g.font = this.font(H * 0.46, '700', '"Courier New", monospace');
    g.textAlign = 'right';
    g.fillText(String(Math.round(s.speed)), W * 0.7, H * 0.88);
    g.font = this.font(H * 0.12);
    g.fillText(this.unitText(s.units), W * 0.92, H * 0.88);
    g.font = this.font(H * 0.3, '700', '"Courier New", monospace');
    g.textAlign = 'center';
    g.fillText(this.gearText(s.gear), W * 0.86, H * 0.58);
  }

  /** Analogue clocks: speedometer (and tachometer on twin-clock dashes). */
  private analog(g: CanvasRenderingContext2D, s: DashState, single: boolean): void {
    const W = this.w, H = this.h;
    g.fillStyle = '#0a0b0d';
    g.fillRect(0, 0, W, H);
    const dial = (cx: number, cy: number, r: number, frac: number, max: number, label: string) => {
      g.fillStyle = '#f2efe6';
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#111';
      g.lineWidth = r * 0.02;
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      for (let i = 0; i <= max; i++) {
        const a = a0 + ((a1 - a0) * i) / max;
        const major = i % 2 === 0;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
        g.lineTo(cx + Math.cos(a) * r * (major ? 0.78 : 0.85), cy + Math.sin(a) * r * (major ? 0.78 : 0.85));
        g.stroke();
        if (major) {
          g.fillStyle = '#111';
          g.font = this.font(r * 0.16);
          g.textAlign = 'center';
          g.fillText(String(Math.round((i * (label === 'km/h' || label === 'mph' ? 20 : 1)))), cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62 + r * 0.05);
        }
      }
      g.fillStyle = '#555';
      g.font = this.font(r * 0.12);
      g.fillText(label, cx, cy + r * 0.45);
      const a = a0 + (a1 - a0) * Math.max(0, Math.min(1, frac));
      g.strokeStyle = '#d0201a';
      g.lineWidth = r * 0.05;
      g.beginPath();
      g.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12);
      g.lineTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82);
      g.stroke();
      g.fillStyle = '#222';
      g.beginPath();
      g.arc(cx, cy, r * 0.08, 0, Math.PI * 2);
      g.fill();
    };
    const vmax = s.units === 'kmh' ? 240 : 150;
    if (single) {
      dial(W / 2, H / 2, Math.min(W, H) * 0.46, s.speed / vmax, vmax / 20, this.unitText(s.units));
      g.fillStyle = '#d0201a';
      g.font = this.font(H * 0.08, '800');
      g.textAlign = 'center';
      g.fillText(this.gearText(s.gear), W / 2, H * 0.82);
    } else {
      dial(W * 0.26, H * 0.5, H * 0.45, s.speed / vmax, vmax / 20, this.unitText(s.units));
      dial(W * 0.74, H * 0.5, H * 0.45, s.rpmFrac, 10, 'x1000');
    }
  }

  dispose(): void {
    this.texture.dispose();
  }
}
