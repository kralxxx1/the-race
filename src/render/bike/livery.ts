import * as THREE from 'three';
import type { BikeSpec, Livery } from '../../data/bikes';
import type { P2 } from './mesh';
import type { Hardpoints } from './hardpoints';

/**
 * Livery atlas.
 *
 * Paint schemes are painted with canvas 2D in five orthographic views of the
 * bike (right, left, top, front, rear) — the way livery designers draw them.
 * The paint shader projects the atlas back onto the bodywork in bike space with
 * normal-weighted (triplanar) blending, so stripes, colour blocks and model
 * lettering follow the real surfaces without any per-panel UV unwrapping.
 *
 * A second "finish" atlas stores clear-coat (R), roughness (G) and metalness (B)
 * so one bike can mix gloss, metallic and matte areas (Tech Black, carbon-look…).
 */

export type LiveryView = 'right' | 'left' | 'top' | 'front' | 'rear';
export const ALL_VIEWS: readonly LiveryView[] = ['right', 'left', 'top', 'front', 'rear'];
export const SIDE_VIEWS: readonly LiveryView[] = ['right', 'left'];

/** Bike-space box covered by the atlas. */
export const LV_BOX = { xmin: -0.6, xmax: 0.6, ymin: 0, ymax: 1.6, zmin: -2.3, zmax: 0.75 } as const;
/** Atlas size in "metres" (rect units) — W:H = 1:2. */
export const AW = 3.15;
export const AH = 6.3;
/** Region rects in atlas metres: [x0, y0, x1, y1] (canvas orientation, y down). */
const RECT: Record<LiveryView, [number, number, number, number]> = {
  right: [0.05, 0.0, 3.1, 1.6],
  left: [0.05, 1.6, 3.1, 3.2],
  top: [0.05, 3.2, 3.1, 4.4],
  front: [0.05, 4.45, 1.25, 6.05],
  rear: [1.4, 4.45, 2.6, 6.05],
};

/** Normalised rects for the shader, in the order right, left, top, front, rear. */
export function liveryRects(): THREE.Vector4[] {
  return (['right', 'left', 'top', 'front', 'rear'] as LiveryView[]).map((v) => {
    const r = RECT[v];
    return new THREE.Vector4(r[0] / AW, r[1] / AH, r[2] / AW, r[3] / AH);
  });
}

export type PaintFinish = 'gloss' | 'metallic' | 'pearl' | 'matte' | 'satin' | 'chrome' | 'flat';

/** clear-coat, roughness, metalness (0..255) */
const FINISH_RGB: Record<PaintFinish, [number, number, number]> = {
  gloss: [255, 92, 40],
  metallic: [255, 80, 165],
  pearl: [255, 70, 100],
  matte: [0, 165, 35],
  satin: [80, 120, 60],
  chrome: [255, 18, 255],
  flat: [0, 215, 0],
};

export function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  try {
    if (!c.getContext('2d')) return null;
  } catch {
    return null;
  }
  return c;
}

export interface TextOpts {
  color: string;
  /** Letter height (m). */
  size: number;
  font?: string;
  weight?: string;
  italic?: boolean;
  align?: CanvasTextAlign;
  /** Rotation (degrees, canvas orientation). */
  rotate?: number;
  /** Horizontal stretch. */
  stretch?: number;
  /** Max width (m). */
  maxWidth?: number;
  stroke?: string;
  strokeWidth?: number;
  finish?: PaintFinish;
  /** Letter spacing (em). */
  spacing?: number;
}

/** Affine 2D map [a, b, c, d, e, f] (canvas convention). */
type Affine = readonly [number, number, number, number, number, number];

interface Layer {
  ctx: CanvasRenderingContext2D;
  m: Affine;
  /** px per metre */
  s: number;
}

const apply = (m: Affine, a: number, b: number): [number, number] => [m[0] * a + m[2] * b + m[4], m[1] * a + m[3] * b + m[5]];

/** Drawing context for one view, in that view's natural coordinates (metres). */
export class Pen {
  constructor(
    readonly view: LiveryView,
    private col: Layer,
    private fin: Layer,
  ) {}

  private layers(color: string, finish: PaintFinish): [Layer, string][] {
    return [
      [this.col, color],
      [this.fin, finishCss(finish)],
    ];
  }

  private path(L: Layer, pts: readonly P2[]): void {
    const ctx = L.ctx;
    ctx.beginPath();
    pts.forEach(([a, b], i) => {
      const [x, y] = apply(L.m, a, b);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }

  /** Filled polygon (already smoothed by the caller if needed). */
  poly(pts: readonly P2[], color: string, finish: PaintFinish = 'gloss'): void {
    for (const [L, style] of this.layers(color, finish)) {
      this.path(L, pts);
      L.ctx.fillStyle = style;
      L.ctx.fill();
    }
  }

  /** Open polyline stroke (pinstripes). */
  line(pts: readonly P2[], color: string, width: number, finish: PaintFinish = 'gloss'): void {
    for (const [L, style] of this.layers(color, finish)) {
      const ctx = L.ctx;
      ctx.beginPath();
      pts.forEach(([a, b], i) => {
        const [x, y] = apply(L.m, a, b);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = style;
      ctx.lineWidth = width * L.s;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  rect(a0: number, b0: number, a1: number, b1: number, color: string, finish: PaintFinish = 'gloss'): void {
    this.poly([[a0, b0], [a1, b0], [a1, b1], [a0, b1]], color, finish);
  }

  /** Fill the whole view. */
  fill(color: string, finish: PaintFinish = 'gloss'): void {
    this.rect(-10, -10, 10, 10, color, finish);
  }

  /** Upright (never mirrored) text centred at view point (a, b). */
  text(str: string, a: number, b: number, o: TextOpts): void {
    for (const [L, fill] of this.layers(o.color, o.finish ?? 'gloss')) {
      const ctx = L.ctx;
      const [x, y] = apply(L.m, a, b);
      const px = o.size * L.s;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, x, y);
      if (o.rotate) ctx.rotate((o.rotate * Math.PI) / 180);
      ctx.scale(o.stretch ?? 1, 1);
      ctx.font = `${o.italic ? 'italic ' : ''}${o.weight ?? '900'} ${Math.max(2, px * 1.36)}px ${o.font ?? '"Arial Black", "Helvetica Neue", Arial, sans-serif'}`;
      ctx.textAlign = o.align ?? 'center';
      ctx.textBaseline = 'middle';
      if (o.spacing && 'letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing * px}px`;
      const maxW = o.maxWidth ? (o.maxWidth * L.s) / (o.stretch ?? 1) : undefined;
      if (o.stroke && L === this.col) {
        ctx.lineWidth = (o.strokeWidth ?? 0.004) * L.s;
        ctx.strokeStyle = o.stroke;
        ctx.lineJoin = 'round';
        ctx.strokeText(str, 0, 0, maxW);
      }
      ctx.fillStyle = fill;
      ctx.fillText(str, 0, 0, maxW);
      ctx.restore();
    }
  }

  /** Linear gradient fill (colour only; finish uniform). */
  gradientPoly(pts: readonly P2[], from: [number, number, string], to: [number, number, string], finish: PaintFinish = 'gloss'): void {
    const L = this.col;
    const [x0, y0] = apply(L.m, from[0], from[1]);
    const [x1, y1] = apply(L.m, to[0], to[1]);
    const gr = L.ctx.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, from[2]);
    gr.addColorStop(1, to[2]);
    this.path(L, pts);
    L.ctx.fillStyle = gr;
    L.ctx.fill();
    this.path(this.fin, pts);
    this.fin.ctx.fillStyle = finishCss(finish);
    this.fin.ctx.fill();
  }
}

function finishCss(f: PaintFinish): string {
  const [r, g, b] = FINISH_RGB[f];
  return `rgb(${r},${g},${b})`;
}

export interface LiveryTextures {
  map: THREE.Texture;
  finish: THREE.Texture;
}

function viewMatrix(v: LiveryView, s: number): Affine {
  const r = RECT[v];
  const B = LV_BOX;
  const X0 = r[0] * s, Y0 = r[1] * s;
  switch (v) {
    case 'right':
      return [-s, 0, 0, -s, X0 + B.zmax * s, Y0 + B.ymax * s];
    case 'left':
      return [s, 0, 0, -s, X0 - B.zmin * s, Y0 + B.ymax * s];
    case 'top':
      return [-s, 0, 0, s, X0 + B.zmax * s, Y0 - B.xmin * s];
    case 'front':
      return [-s, 0, 0, -s, X0 + B.xmax * s, Y0 + B.ymax * s];
    default:
      return [s, 0, 0, -s, X0 - B.xmin * s, Y0 + B.ymax * s];
  }
}

/** Paints all views of a livery atlas. */
export class LiveryCanvas {
  readonly color: HTMLCanvasElement | null;
  readonly fin: HTMLCanvasElement | null;
  private g: CanvasRenderingContext2D | null = null;
  private f: CanvasRenderingContext2D | null = null;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.color = makeCanvas(w, h);
    this.fin = this.color ? makeCanvas(Math.max(64, w >> 1), Math.max(128, h >> 1)) : null;
    this.g = this.color?.getContext('2d') ?? null;
    this.f = this.fin?.getContext('2d') ?? null;
  }

  get available(): boolean {
    return !!(this.g && this.f);
  }

  /** Run `draw` for each listed view with a pen in that view's coordinates. */
  views(list: readonly LiveryView[], draw: (p: Pen) => void): void {
    const g = this.g, f = this.f;
    if (!g || !f) return;
    const sg = this.w / AW;
    const sf = this.fin!.width / AW;
    for (const v of list) {
      const r = RECT[v];
      for (const [ctx, s] of [[g, sg], [f, sf]] as const) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(r[0] * s, r[1] * s, (r[2] - r[0]) * s, (r[3] - r[1]) * s);
        ctx.clip();
      }
      draw(new Pen(v, { ctx: g, m: viewMatrix(v, sg), s: sg }, { ctx: f, m: viewMatrix(v, sf), s: sf }));
      g.restore();
      f.restore();
    }
  }

  textures(): LiveryTextures {
    const mk = (c: HTMLCanvasElement | null, srgb: boolean): THREE.Texture => {
      let t: THREE.Texture;
      if (c) t = new THREE.CanvasTexture(c);
      else t = new THREE.DataTexture(new Uint8Array(srgb ? [255, 255, 255, 255] : [255, 92, 40, 255]), 1, 1);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      if (c) {
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
      }
      t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      return t;
    };
    return { map: mk(this.color, true), finish: mk(this.fin, false) };
  }
}

// ───────────────────────────── generic patterns ─────────────────────────────

export interface LiveryZones {
  /** Height of the two-tone split line on the flanks (m). */
  splitY: number;
  /** Tank top height, tank z range. */
  tankTop: number;
  tankFront: number;
  tankBack: number;
  /** Z range of the main fairing / side panels. */
  bodyFront: number;
  bodyBack: number;
  /** Brand decal anchor on the flank [z, y] and letter height. */
  decal: [number, number];
  decalSize: number;
}

export interface LiveryEnv {
  spec: BikeSpec;
  hp: Hardpoints;
  zones: LiveryZones;
  /** Index of the livery in spec.liveries (authored painters switch on it). */
  index: number;
}

export type LiveryPainter = (c: LiveryCanvas, livery: Livery, env: LiveryEnv) => void;

/** Relative luminance of a CSS colour (0..1). */
export function lum(hex: string): number {
  const c = new THREE.Color(hex);
  return c.getHSL({ h: 0, s: 0, l: 0 }).l;
}

/** Generic livery from the classic pattern field (used by auto blueprints). */
export const genericLivery: LiveryPainter = (c, lv, env) => {
  const z = env.zones;
  const two = lv.pattern === 'split' || lv.pattern === 'racing' || lv.pattern === 'tricolor';
  const striped = lv.pattern === 'stripes' || lv.pattern === 'racing' || lv.pattern === 'tricolor';
  const base: PaintFinish = lv.pattern === 'chrome' ? 'chrome' : 'metallic';
  c.views(ALL_VIEWS, (p) => {
    p.fill(lv.primary, base);
    if (p.view === 'right' || p.view === 'left') {
      if (two) p.rect(-3, -1, 3, z.splitY, lv.secondary, 'gloss');
      if (lv.pattern === 'tricolor') {
        p.poly([[z.bodyFront, z.splitY + 0.02], [z.bodyBack, z.splitY + 0.13], [z.bodyBack, z.splitY + 0.17], [z.bodyFront, z.splitY + 0.06]], lv.accent, 'gloss');
      }
      if (lv.pattern === 'racing') {
        p.poly([[z.bodyFront + 0.05, z.splitY + 0.03], [z.bodyBack, z.splitY + 0.09], [z.bodyBack, z.splitY + 0.115], [z.bodyFront + 0.05, z.splitY + 0.055]], lv.accent, 'gloss');
      }
      p.text(env.spec.brand.toUpperCase(), z.decal[0], z.decal[1], {
        color: lum(lv.primary) > 0.55 ? '#16171a' : '#f4f4f4',
        size: z.decalSize,
        italic: true,
        maxWidth: 0.42,
      });
    } else if (p.view === 'front' || p.view === 'rear') {
      if (two) p.rect(-3, -1, 3, z.splitY, lv.secondary, 'gloss');
    }
    if (striped) {
      // Twin racing stripes over the crown.
      if (p.view === 'top') {
        p.rect(-3, -0.07, 3, -0.035, lv.accent);
        p.rect(-3, 0.035, 3, 0.07, lv.accent);
      } else if (p.view === 'front' || p.view === 'rear') {
        p.rect(-0.07, -1, -0.035, 3, lv.accent);
        p.rect(0.035, -1, 0.07, 3, lv.accent);
      }
    }
  });
};
