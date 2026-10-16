import * as THREE from 'three';
import { GeoBuilder, rgb } from './kit';
import { billboardTexture, neonTexture } from './signs';

/**
 * Advertising signs of the city maps from one painted atlas (a 4×4 grid of 512×256 cells): eight
 * invented-brand billboards on posts and eight neon shop signs (horizontal plates and rotated blades).
 * One texture and two materials serve every sign, so a whole chunk of signs is a handful of instanced draws.
 */

export const BILLBOARDS: readonly [string, string, number][] = [
  ['ANADOLU BANK', 'Yarına güvenle', 0],
  ['MAVİ OTEL', 'Boğaz manzaralı', 2],
  ['LEZZET USTASI', 'Taze · sıcak · hızlı', 1],
  ['GÜNEŞ SİGORTA', 'Her yolda yanınızda', 3],
  ['TURKUAZ TUR', 'Hemen rezerve edin', 4],
  ['YENİ NESİL', 'Mega fırsatlar', 5],
  ['ÇAY BAHÇESİ', 'Demli sohbet', 1],
  ['METRO LINE', 'Şehrin hızı', 2],
];

export const NEONS: readonly [string, string][] = [
  ['KEBAP', '#ff3b5c'],
  ['OTEL', '#35e0ff'],
  ['ECZANE', '#4dff8b'],
  ['CAFE', '#ffb23b'],
  ['BAR', '#c64dff'],
  ['MARKET', '#ffe44d'],
  ['PİZZA', '#ff6a3b'],
  ['KARAOKE', '#ff4dd8'],
];

const COLS = 4;
const ROWS = 4;
const CELL_W = 512;
const CELL_H = 256;

/** UV rectangle (u0, v0, u1, v1) of atlas cell `i` (row-major from the top-left of the image). */
export function cellRect(i: number): [number, number, number, number] {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  return [c / COLS, 1 - (r + 1) / ROWS, (c + 1) / COLS, 1 - r / ROWS];
}

export function buildSignAtlas(): THREE.Texture {
  if (typeof document === 'undefined') {
    const t = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    t.userData.owned = true;
    return t;
  }
  const c = document.createElement('canvas');
  c.width = COLS * CELL_W;
  c.height = ROWS * CELL_H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  BILLBOARDS.forEach(([title, tag, style], i) => {
    const t = billboardTexture(title, tag, style, CELL_W, CELL_H);
    g.drawImage(t.image as CanvasImageSource, (i % COLS) * CELL_W, Math.floor(i / COLS) * CELL_H);
    t.dispose();
  });
  NEONS.forEach(([text, color], i) => {
    const idx = BILLBOARDS.length + i;
    const t = neonTexture(text, color, CELL_W, CELL_H);
    g.drawImage(t.image as CanvasImageSource, (idx % COLS) * CELL_W, Math.floor(idx / COLS) * CELL_H);
    t.dispose();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.owned = true;
  return tex;
}

/** Billboard on two posts, front facing −z: 12 × 6 m panel with a frame, catwalk and a backing. */
export function billboardGeometry(cell: number, scale = 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const [u0, v0, u1, v1] = cellRect(cell);
  const w = 12 * scale;
  const h = 6 * scale;
  const y0 = 9 * scale;
  const steel = rgb('#4b5258');
  for (const x of [-w * 0.3, w * 0.3]) b.frustum(x, 0, 0.5, 0.28 * scale, 0.22 * scale, y0 + h * 0.1, 8, { color: steel }, true);
  b.box(0, y0 + h / 2, 0.22, w + 0.5, h + 0.5, 0.35, { color: steel });
  b.quad([w / 2, y0, 0], [-w / 2, y0, 0], [-w / 2, y0 + h, 0], [w / 2, y0 + h, 0], { color: [1, 1, 1] }, [u0, v0, u1, v0, u1, v1, u0, v1]);
  b.box(0, y0 - 0.55, 0.5, w * 0.9, 0.08, 0.7, { color: steel });
  return b.build();
}

/** Flat plate (rooftop billboard) with its own posts standing on y=0, front −z. */
export function plateGeometry(cell: number, w: number, h: number, lift: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const [u0, v0, u1, v1] = cellRect(cell);
  const steel = rgb('#4b5258');
  for (const x of [-w * 0.35, w * 0.35]) b.box(x, lift / 2, 0.1, 0.25, lift, 0.25, { color: steel });
  b.box(0, lift + h / 2, 0.14, w + 0.3, h + 0.3, 0.2, { color: steel });
  b.quad([w / 2, lift, 0], [-w / 2, lift, 0], [-w / 2, lift + h, 0], [w / 2, lift + h, 0], { color: [1, 1, 1] }, [u0, v0, u1, v0, u1, v1, u0, v1]);
  return b.build();
}

/** Neon sign: horizontal plate (6 × 3 m) facing −z, or a blade (text rotated 90°) projecting from the facade. */
export function neonGeometry(cell: number, blade: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const [u0, v0, u1, v1] = cellRect(cell);
  const w = blade ? 1.5 : 6;
  const h = blade ? 3.6 : 3;
  const quad = (z: number, flip: boolean) => {
    const xa = flip ? -w / 2 : w / 2;
    const xb = flip ? w / 2 : -w / 2;
    // Blade signs read bottom-to-top: swap the uv axes.
    const uv = blade ? ([u0, v1, u0, v0, u1, v0, u1, v1] as const) : ([u0, v0, u1, v0, u1, v1, u0, v1] as const);
    if (!flip) b.quad([xa, 0, z], [xb, 0, z], [xb, h, z], [xa, h, z], { color: [1, 1, 1] }, uv);
    else b.quad([xa, 0, z], [xb, 0, z], [xb, h, z], [xa, h, z], { color: [1, 1, 1] }, blade ? ([u1, v1, u1, v0, u0, v0, u0, v1] as const) : ([u1, v0, u0, v0, u0, v1, u1, v1] as const));
  };
  quad(0, false);
  if (blade) quad(0.02, true);
  return b.build();
}

export interface SignMaterials {
  billboard: THREE.MeshStandardMaterial;
  neon: THREE.MeshBasicMaterial;
}

/** Materials for the atlas: billboards are backlit at night, neon is additive at night and a dull tube by day. */
export function signMaterials(atlas: THREE.Texture, night: boolean): SignMaterials {
  const billboard = new THREE.MeshStandardMaterial({
    map: atlas,
    roughness: 0.6,
    metalness: 0,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: atlas,
    emissiveIntensity: night ? 1.15 : 0.05,
    vertexColors: true,
  });
  const neon = new THREE.MeshBasicMaterial({
    map: atlas,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: night ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    opacity: night ? 1 : 0.55,
  });
  neon.color.setScalar(night ? 1.8 : 0.9);
  return { billboard, neon };
}
