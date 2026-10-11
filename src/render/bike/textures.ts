import * as THREE from 'three';
import { makeCanvas } from './livery';
import type { TreadStyle } from './types';

/**
 * Procedural textures for the bike kit. Generated once and cached (the cache
 * owns them; they are shared by every bike). In environments without a 2D canvas
 * (unit tests) each texture falls back to a 1×1 data texture.
 */

const cache = new Map<string, THREE.Texture>();

function fallback(rgba: [number, number, number, number], srgb: boolean): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function fin(c: HTMLCanvasElement, srgb: boolean, repeat: boolean): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    t.userData.sharedBikeTexture = true;
    cache.set(key, t);
  }
  return t;
}

/** 2×2 twill carbon weave: colour in RGB, tow height in A (used for bump in the shader). */
export function carbonWeave(): THREE.Texture {
  return cached('carbon', () => {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c?.getContext('2d');
    if (!c || !g) return fallback([30, 32, 36, 255], true);
    const img = g.createImageData(S, S);
    const tows = 8;
    const cell = S / tows;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
        // 2/2 twill: warp over two, under two, shifted by one each row
        const warp = ((cx + cy) >> 1) % 2 === 0;
        const u = (x % cell) / cell, v = (y % cell) / cell;
        const across = warp ? v : u;
        const along = warp ? u : v;
        const round = Math.sin(across * Math.PI);
        const fibre = 0.5 + 0.5 * Math.sin(along * 40 + across * 3);
        const h = round * (0.85 + 0.15 * fibre);
        const lum = 14 + 34 * Math.pow(round, 1.6) + 8 * fibre * round + (warp ? 6 : 0);
        const i = (y * S + x) * 4;
        img.data[i] = lum;
        img.data[i + 1] = lum + 2;
        img.data[i + 2] = lum + 5;
        img.data[i + 3] = Math.round(h * 255);
      }
    }
    g.putImageData(img, 0, 0);
    return fin(c, true, true);
  });
}

/** Radiator core: vertical fins and horizontal tubes (tileable, 10 cm per repeat). */
export function radiatorCore(): THREE.Texture {
  return cached('radiator', () => {
    const S = 128;
    const c = makeCanvas(S, S);
    const g = c?.getContext('2d');
    if (!c || !g) return fallback([40, 40, 42, 255], true);
    g.fillStyle = '#0b0b0c';
    g.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 4) {
      g.fillStyle = x % 8 === 0 ? '#4a4c50' : '#33353a';
      g.fillRect(x, 0, 2, S);
    }
    for (let y = 0; y < S; y += 16) {
      const grd = g.createLinearGradient(0, y, 0, y + 6);
      grd.addColorStop(0, '#1a1b1d');
      grd.addColorStop(0.5, '#62656b');
      grd.addColorStop(1, '#1a1b1d');
      g.fillStyle = grd;
      g.fillRect(0, y, S, 6);
    }
    return fin(c, true, true);
  });
}

export interface TyreTextures {
  map: THREE.Texture;
  bump: THREE.Texture;
}

/**
 * Tyre texture in lathe UV space: u runs around the wheel, v across the profile
 * (0 = left bead, 1 = right bead). Raised sidewall lettering (size, tread name,
 * rotation arrows), tread grooves per tread style, scuffed contact band.
 */
export function tyreTextures(size: string, label: string, tread: TreadStyle, px: number): TyreTextures {
  const key = `tyre:${size}:${label}:${tread}:${px}`;
  const map = cache.get(key + ':map');
  const bump = cache.get(key + ':bump');
  if (map && bump) return { map, bump };
  const W = Math.max(512, px * 2);
  const H = Math.max(64, px >> 2);
  const cm = makeCanvas(W, H);
  const cb = makeCanvas(W, H);
  const gm = cm?.getContext('2d');
  const gb = cb?.getContext('2d');
  if (!cm || !cb || !gm || !gb) {
    const out = { map: fallback([26, 26, 26, 255], true), bump: fallback([128, 128, 128, 255], false) };
    cache.set(key + ':map', out.map);
    cache.set(key + ':bump', out.bump);
    return out;
  }
  // Base rubber + slightly lighter, scuffed crown
  gm.fillStyle = '#161616';
  gm.fillRect(0, 0, W, H);
  const crown = gm.createLinearGradient(0, 0, 0, H);
  crown.addColorStop(0.0, '#151515');
  crown.addColorStop(0.3, '#1c1c1c');
  crown.addColorStop(0.5, '#262625');
  crown.addColorStop(0.7, '#1c1c1c');
  crown.addColorStop(1.0, '#151515');
  gm.fillStyle = crown;
  gm.fillRect(0, H * 0.22, W, H * 0.56);
  gb.fillStyle = 'rgb(128,128,128)';
  gb.fillRect(0, 0, W, H);
  // Tread grooves (dark in map, low in bump)
  const groove = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    for (const [g, col] of [
      [gm, '#070707'],
      [gb, 'rgb(40,40,40)'],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  };
  const reps = tread === 'knobbly' ? 48 : tread === 'dual' ? 36 : tread === 'touring' || tread === 'cruiser' ? 40 : tread === 'scooter' ? 30 : 18;
  // Racing slicks (track-only bikes) have no grooves at all.
  for (let i = 0; i < reps && tread !== 'slick'; i++) {
    const x = (i / reps) * W;
    const step = W / reps;
    if (tread === 'slickish') {
      groove(x, H * 0.3, x + step * 0.25, H * 0.36, H * 0.012);
      groove(x + step * 0.5, H * 0.7, x + step * 0.75, H * 0.64, H * 0.012);
    } else if (tread === 'sport') {
      groove(x, H * 0.26, x + step * 0.45, H * 0.4, H * 0.016);
      groove(x + step * 0.5, H * 0.74, x + step * 0.95, H * 0.6, H * 0.016);
      groove(x + step * 0.2, H * 0.46, x + step * 0.32, H * 0.47, H * 0.01);
    } else if (tread === 'knobbly' || tread === 'dual') {
      for (const yy of [0.3, 0.42, 0.58, 0.7]) {
        const off = (i % 2) * step * 0.5;
        for (const [g, col] of [
          [gm, '#262626'],
          [gb, 'rgb(220,220,220)'],
        ] as const) {
          g.fillStyle = col;
          g.fillRect(x + off, H * yy - H * 0.04, step * (tread === 'knobbly' ? 0.45 : 0.6), H * 0.07);
        }
      }
    } else {
      groove(x, H * 0.3, x + step * 0.8, H * 0.42, H * 0.018);
      groove(x + step * 0.4, H * 0.7, x + step * 1.2, H * 0.58, H * 0.018);
      groove(x, H * 0.5, x + step, H * 0.5, H * 0.008);
    }
  }
  // Sidewall lettering (raised): left side upright, right side rotated 180°.
  const write = (text: string, x: number, yc: number, hpx: number, flip: boolean, bold = true) => {
    for (const [g, col] of [
      [gm, '#383838'],
      [gb, 'rgb(205,205,205)'],
    ] as const) {
      g.save();
      g.translate(x, yc);
      if (flip) g.rotate(Math.PI);
      g.font = `${bold ? '900' : '700'} ${Math.round(hpx)}px Arial, Helvetica, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = col;
      g.fillText(text, 0, 0);
      g.restore();
    }
  };
  const sideH = H * 0.11;
  for (const rep of [0, 0.5]) {
    write(label.toUpperCase(), W * (rep + 0.12), H * 0.9, sideH, false);
    write(size, W * (rep + 0.3), H * 0.9, sideH * 0.7, false, false);
    write('TUBELESS  ▸', W * (rep + 0.42), H * 0.9, sideH * 0.5, false, false);
    write(label.toUpperCase(), W * (rep + 0.12), H * 0.1, sideH, true);
    write(size, W * (rep + 0.3), H * 0.1, sideH * 0.7, true, false);
    write('◂  TUBELESS', W * (rep + 0.42), H * 0.1, sideH * 0.5, true, false);
  }
  const m = fin(cm, true, true);
  const b = fin(cb, false, true);
  m.wrapT = b.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key + ':map', m);
  cache.set(key + ':bump', b);
  m.userData.sharedBikeTexture = b.userData.sharedBikeTexture = true;
  return { map: m, bump: b };
}

/** Turkish motorcycle plate (two lines: province code + letters / digits). */
export function turkishPlate(text: string): THREE.Texture {
  return cached(`plate:${text}`, () => {
    const W = 300, H = 240;
    const c = makeCanvas(W, H);
    const g = c?.getContext('2d');
    if (!c || !g) return fallback([240, 240, 236, 255], true);
    g.fillStyle = '#f4f4f0';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1b3c9c';
    g.fillRect(0, 0, 44, H);
    g.fillStyle = '#ffffff';
    g.font = 'bold 26px Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText('TR', 22, H - 22);
    const [a, b, d] = text.split(' ');
    g.fillStyle = '#111';
    g.font = 'bold 92px "Arial Narrow", Arial, sans-serif';
    g.fillText(`${a} ${b}`, 172, 104);
    g.fillText(d ?? '', 172, 210);
    g.strokeStyle = '#111';
    g.lineWidth = 5;
    g.strokeRect(3, 3, W - 6, H - 6);
    return fin(c, true, false);
  });
}

/** Free all cached kit textures (tests / hot reload). */
export function disposeKitTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
