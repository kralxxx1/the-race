import { clamp } from '../core/math';

/** Analog tachometer with digital speed, gear indicator and shift lights. */
export class Tacho {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private size = 230;
  private needle = 0;
  private maxRpm = 12000;
  private redline = 10000;
  private electric = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'tacho';
    this.g = this.canvas.getContext('2d')!;
    this.resize(230);
  }

  resize(css: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = css;
    this.canvas.width = Math.round(css * dpr);
    this.canvas.height = Math.round(css * dpr);
    this.canvas.style.width = `${css}px`;
    this.canvas.style.height = `${css}px`;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  configure(redline: number, limiter: number, electric: boolean): void {
    this.electric = electric;
    this.redline = redline;
    this.maxRpm = Math.ceil((limiter * 1.06) / 1000) * 1000;
  }

  draw(rpm: number, speed: number, unit: string, gear: number, dt: number, shift: boolean): void {
    const g = this.g;
    const S = this.size;
    const cx = S / 2;
    const cy = S / 2;
    const R = S * 0.46;
    g.clearRect(0, 0, S, S);
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    const ang = (r: number) => a0 + (a1 - a0) * clamp(r / this.maxRpm, 0, 1);
    // Face
    const grd = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    grd.addColorStop(0, 'rgba(18,20,26,0.92)');
    grd.addColorStop(1, 'rgba(6,7,10,0.92)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.stroke();
    // Red zone
    g.lineWidth = S * 0.035;
    g.strokeStyle = '#e0241b';
    g.beginPath();
    g.arc(cx, cy, R * 0.86, ang(this.redline), ang(this.maxRpm));
    g.stroke();
    // Ticks
    const step = this.maxRpm > 14000 ? 2000 : 1000;
    g.fillStyle = '#d8dee8';
    g.font = `600 ${Math.round(S * 0.06)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let r = 0; r <= this.maxRpm; r += step / 2) {
      const a = ang(r);
      const major = r % step === 0;
      const r0 = R * (major ? 0.78 : 0.83);
      g.strokeStyle = r >= this.redline ? '#ff4a3a' : '#cfd6df';
      g.lineWidth = major ? 2.4 : 1.2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92);
      g.stroke();
      if (major) {
        g.fillStyle = r >= this.redline ? '#ff6a5a' : '#cfd6df';
        g.fillText(String(r / 1000), cx + Math.cos(a) * R * 0.64, cy + Math.sin(a) * R * 0.64);
      }
    }
    // Needle with a little inertia
    this.needle += (rpm - this.needle) * Math.min(1, dt * 18);
    const na = ang(this.needle);
    g.strokeStyle = '#ff5a1f';
    g.lineWidth = 3.5;
    g.shadowColor = '#ff5a1f';
    g.shadowBlur = 10;
    g.beginPath();
    g.moveTo(cx - Math.cos(na) * R * 0.12, cy - Math.sin(na) * R * 0.12);
    g.lineTo(cx + Math.cos(na) * R * 0.84, cy + Math.sin(na) * R * 0.84);
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#2a2d35';
    g.beginPath();
    g.arc(cx, cy, R * 0.09, 0, Math.PI * 2);
    g.fill();
    // Gear (centre) + speed (below)
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath();
    g.roundRect(cx - R * 0.2, cy - R * 0.24, R * 0.4, R * 0.4, R * 0.06);
    g.fill();
    g.fillStyle = shift ? '#ff3b30' : '#ffd24a';
    g.font = `800 ${Math.round(S * 0.15)}px system-ui, sans-serif`;
    g.fillText(this.electric ? 'D' : gear <= 0 ? 'N' : String(gear), cx, cy - R * 0.03);
    g.fillStyle = '#ffffff';
    g.font = `800 ${Math.round(S * 0.17)}px system-ui, sans-serif`;
    g.fillText(String(Math.round(speed)), cx, cy + R * 0.42);
    g.fillStyle = '#8f9aab';
    g.font = `600 ${Math.round(S * 0.055)}px system-ui, sans-serif`;
    g.fillText(unit, cx, cy + R * 0.62);
    g.fillText('x1000 rpm', cx, cy + R * 0.76);
    // Shift lights
    if (!this.electric) {
      const frac = clamp((rpm - this.redline * 0.82) / (this.redline * 0.18), 0, 1);
      for (let i = 0; i < 5; i++) {
        const on = frac > i / 5;
        g.fillStyle = on ? (i < 2 ? '#34d058' : i < 4 ? '#ffb020' : '#ff3b30') : 'rgba(255,255,255,0.08)';
        if (shift && Math.floor(performance.now() / 80) % 2 === 0) g.fillStyle = '#ff3b30';
        g.beginPath();
        g.arc(cx - R * 0.3 + i * R * 0.15, cy - R * 0.42, R * 0.045, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}
