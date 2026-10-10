import * as THREE from 'three';
import { makeCanvas } from './livery';
import { MeshData } from './mesh';

/**
 * Small text labels on mechanical parts (caliper and fork lettering, cam-cover
 * script, swingarm stickers, tyre-pressure labels…) packed into one atlas so
 * they cost a single draw call. Quads are placed slightly proud of the part.
 */
export interface DecalRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Width / height of the label as drawn. */
  aspect: number;
}

export interface LabelOpts {
  color: string;
  bg?: string;
  font?: string;
  weight?: string;
  italic?: boolean;
  /** Outline stroke colour. */
  stroke?: string;
  /** Text height in atlas pixels (relative to the atlas row height). */
  scale?: number;
  /** Letter spacing (em). */
  spacing?: number;
}

export class DecalAtlas {
  readonly canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null;
  private x = 0;
  private y = 0;
  private rowH = 0;
  private cache = new Map<string, DecalRect>();
  used = false;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.canvas = makeCanvas(w, h);
    this.ctx = this.canvas?.getContext('2d') ?? null;
    if (this.ctx) this.ctx.clearRect(0, 0, w, h);
  }

  /** Reserve a rect and draw into it. Returns null when the atlas is full or unavailable. */
  private alloc(pw: number, ph: number): [number, number] | null {
    const pad = 2;
    if (this.x + pw + pad > this.w) {
      this.x = 0;
      this.y += this.rowH + pad;
      this.rowH = 0;
    }
    if (this.y + ph > this.h || pw > this.w) return null;
    const at: [number, number] = [this.x, this.y];
    this.x += pw + pad;
    this.rowH = Math.max(this.rowH, ph);
    return at;
  }

  private rect(px: number, py: number, pw: number, ph: number): DecalRect {
    return { u0: px / this.w, v0: 1 - (py + ph) / this.h, u1: (px + pw) / this.w, v1: 1 - py / this.h, aspect: pw / ph };
  }

  /** Text label; `heightPx` is the row height in atlas pixels. */
  label(text: string, o: LabelOpts, heightPx = 48): DecalRect {
    const key = `${text}|${o.color}|${o.bg ?? ''}|${o.font ?? ''}|${o.weight ?? ''}|${o.italic ? 1 : 0}|${o.stroke ?? ''}|${heightPx}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const g = this.ctx;
    const font = `${o.italic ? 'italic ' : ''}${o.weight ?? '800'} ${Math.round(heightPx * (o.scale ?? 0.78))}px ${o.font ?? 'Arial, Helvetica, sans-serif'}`;
    let tw = text.length * heightPx * 0.6;
    if (g) {
      g.font = font;
      if (o.spacing && 'letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing * heightPx}px`;
      tw = g.measureText(text).width;
    }
    const pw = Math.ceil(tw + heightPx * 0.3);
    const at = this.alloc(pw, heightPx);
    if (!at) return { u0: 0, v0: 0, u1: 0, v1: 0, aspect: pw / heightPx };
    if (g) {
      g.save();
      if (o.bg) {
        g.fillStyle = o.bg;
        g.fillRect(at[0], at[1], pw, heightPx);
      }
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (o.stroke) {
        g.lineWidth = heightPx * 0.08;
        g.strokeStyle = o.stroke;
        g.strokeText(text, at[0] + pw / 2, at[1] + heightPx / 2 + 1);
      }
      g.fillStyle = o.color;
      g.fillText(text, at[0] + pw / 2, at[1] + heightPx / 2 + 1);
      g.restore();
    }
    this.used = true;
    const r = this.rect(at[0], at[1], pw, heightPx);
    this.cache.set(key, r);
    return r;
  }

  /** Arbitrary drawing (logos, warning stickers) into a pw×ph rect. */
  draw(key: string, pw: number, ph: number, fn: (g: CanvasRenderingContext2D, w: number, h: number) => void): DecalRect {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const at = this.alloc(pw, ph);
    if (!at) return { u0: 0, v0: 0, u1: 0, v1: 0, aspect: pw / ph };
    const g = this.ctx;
    if (g) {
      g.save();
      g.translate(at[0], at[1]);
      g.beginPath();
      g.rect(0, 0, pw, ph);
      g.clip();
      fn(g, pw, ph);
      g.restore();
    }
    this.used = true;
    const r = this.rect(at[0], at[1], pw, ph);
    this.cache.set(key, r);
    return r;
  }

  texture(): THREE.Texture {
    let t: THREE.Texture;
    if (this.canvas) t = new THREE.CanvasTexture(this.canvas);
    else t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }
}

/**
 * Decal quad of height `h` (width from the label aspect unless given) in the
 * XY plane facing +Z, centred on the origin. Optional bend wraps it around a
 * cylinder of that radius about the Y axis (labels on fork tubes and cans).
 */
export function decalQuad(r: DecalRect, h: number, w = h * r.aspect, bendR = 0, segs = 1): MeshData {
  const m = new MeshData();
  const n = bendR > 0 ? Math.max(4, segs) : 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (t - 0.5) * w;
    let px = x, pz = 0, nx = 0, nz = 1;
    if (bendR > 0) {
      const a = x / bendR;
      px = Math.sin(a) * bendR;
      pz = Math.cos(a) * bendR - bendR;
      nx = Math.sin(a);
      nz = Math.cos(a);
    }
    const u = r.u0 + (r.u1 - r.u0) * t;
    m.v(px, -h / 2, pz, nx, 0, nz, u, r.v0);
    m.v(px, h / 2, pz, nx, 0, nz, u, r.v1);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    m.t(a, a + 2, a + 1);
    m.t(a + 1, a + 2, a + 3);
  }
  return m.orient();
}
