import type { Livery } from '../../../data/bikes';
import { ALL_VIEWS, type LiveryCanvas, type LiveryEnv, type LiveryPainter, type PaintFinish } from '../livery';
import type { P2 } from '../mesh';

/**
 * Livery painter shared by the Kawasaki supersports: a two-tone body (upper colour /
 * Ebony lower fairing rising to the tail), the KRT white slash and pinstripes, and the
 * model lettering. Geometry (where the split and stripes run) is per bike; colour
 * schemes are per catalogue livery (env.index).
 */

export interface KawaLiveryGeo {
  /** Lower-colour area on the flanks (side view). */
  lower: P2[];
  /** Pinstripe along the colour split (side view polyline). */
  splitLine: P2[];
  /** KRT white slash on the side panel (side view polygon), if any. */
  slash?: P2[];
  /** Lower colour on the tail and the stripe above it. */
  tailLower: P2[];
  tailLine: P2[];
  /** Dark chin / headlight surround on the nose (side view). */
  chin?: P2[];
  /** Front view: everything below this height in the lower colour. */
  frontLowerY: number;
  /** Tank-top centre stripe [zFront, zBack, halfWidth] (top view). */
  tankStripe?: [number, number, number];
  /** Lettering: [text, z, y, size] (side views). */
  texts: { str: string; z: number; y: number; size: number; role: 'model' | 'logo' | 'accent' }[];
  /** Top-view lettering on the tail. */
  topText?: { str: string; z: number; size: number };
}

export interface KawaScheme {
  base: string;
  baseFinish: PaintFinish;
  lower: string;
  lowerFinish: PaintFinish;
  /** Slash / pinstripe colour. */
  stripe: string;
  /** Show the KRT slash (KRT editions only). */
  slash: boolean;
  /** Model lettering, small logo and accent text colours. */
  model: string;
  logo: string;
  accent: string;
}

export const KRT: KawaScheme = {
  base: '#5fd02c',
  baseFinish: 'gloss',
  lower: '#16171a',
  lowerFinish: 'gloss',
  stripe: '#eef0f2',
  slash: true,
  model: '#eef0f2',
  logo: '#16171a',
  accent: '#5fd02c',
};

export function kawaLivery(geo: KawaLiveryGeo, schemes: readonly KawaScheme[]): LiveryPainter {
  return (c: LiveryCanvas, _lv: Livery, env: LiveryEnv) => {
    const k = schemes[Math.max(0, Math.min(schemes.length - 1, env.index))];
    c.views(ALL_VIEWS, (p) => {
      p.fill(k.base, k.baseFinish);
      if (p.view === 'right' || p.view === 'left') {
        p.poly(geo.lower, k.lower, k.lowerFinish);
        if (k.slash && geo.slash) p.poly(geo.slash, k.stripe, 'gloss');
        p.line(geo.splitLine, k.stripe, 0.006);
        p.poly(geo.tailLower, k.lower, k.lowerFinish);
        p.line(geo.tailLine, k.stripe, 0.007);
        if (geo.chin) p.poly(geo.chin, k.lower, k.lowerFinish);
        for (const t of geo.texts) {
          const color = t.role === 'model' ? k.model : t.role === 'logo' ? k.logo : k.accent;
          p.text(t.str, t.z, t.y, { color, size: t.size, italic: t.role !== 'logo', weight: '900', spacing: t.role === 'logo' ? 0.1 : 0, stretch: t.role === 'model' ? 1.05 : 1 });
        }
      } else if (p.view === 'front') {
        p.rect(-1, -1, 1, geo.frontLowerY, k.lower, k.lowerFinish);
      } else if (p.view === 'top') {
        if (geo.tankStripe) p.rect(geo.tankStripe[0], -geo.tankStripe[2], geo.tankStripe[1], geo.tankStripe[2], k.lower, k.lowerFinish);
        if (geo.topText) p.text(geo.topText.str, geo.topText.z, 0, { color: k.model, size: geo.topText.size, weight: '900', italic: true, rotate: Math.PI / 2 });
      } else if (p.view === 'rear') {
        p.rect(-1, -1, 1, 0.9, k.lower, k.lowerFinish);
      }
    });
  };
}

/** Re-map a livery layout's longitudinal coordinates (sibling model with other proportions). */
export function remapLiveryGeo(g: KawaLiveryGeo, S: (z: number) => number, texts?: KawaLiveryGeo['texts']): KawaLiveryGeo {
  const sv = (pts: readonly P2[]): P2[] => pts.map(([z, y]) => [S(z), y] as P2);
  return {
    ...g,
    lower: sv(g.lower),
    splitLine: sv(g.splitLine),
    slash: g.slash ? sv(g.slash) : undefined,
    tailLower: sv(g.tailLower),
    tailLine: sv(g.tailLine),
    chin: g.chin ? sv(g.chin) : undefined,
    tankStripe: g.tankStripe ? [S(g.tankStripe[0]), S(g.tankStripe[1]), g.tankStripe[2]] : undefined,
    texts: texts ?? g.texts.map((t) => ({ ...t, z: S(t.z) })),
    topText: g.topText ? { ...g.topText, z: S(g.topText.z) } : undefined,
  };
}
