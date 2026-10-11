import * as THREE from 'three';
import { Rng, clamp, fbm2, noise2 } from '../core/math';
import type { LaneConfig } from '../world/road';
import { laneCenter, pavedHalfWidth } from '../world/road';

/** Length of road (metres) covered by one repeat of the asphalt texture. */
export const ROAD_TEX_LENGTH = 24;

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas unavailable');
  return [c, g];
}

let anisotropy = 8;

/** Anisotropic filtering of every generated texture (graphics setting), applied now and to later ones. */
export function setTextureAnisotropy(n: number): void {
  if (n === anisotropy) return;
  anisotropy = n;
  for (const t of cache.values()) {
    t.anisotropy = n;
    t.needsUpdate = true;
  }
}

function finish(tex: THREE.Texture, srgb: boolean, repeat = true): THREE.Texture {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Height field → tangent-space normal map. */
function normalFromHeight(h: Float32Array, w: number, hh: number, strength: number): HTMLCanvasElement {
  const [c, g] = canvas(w, hh);
  const img = g.createImageData(w, hh);
  const d = img.data;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const xl = h[y * w + ((x - 1 + w) % w)];
      const xr = h[y * w + ((x + 1) % w)];
      const yu = h[((y - 1 + hh) % hh) * w + x];
      const yd = h[((y + 1) % hh) * w + x];
      let nx = (xl - xr) * strength;
      let ny = (yu - yd) * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export interface RoadTextures {
  map: THREE.Texture;
  roughness: THREE.Texture;
  normal: THREE.Texture;
}

/**
 * Asphalt with lane markings. The texture spans the full paved width (u) and
 * ROAD_TEX_LENGTH metres (v). Includes rubber wheel-paths, cracks, patches,
 * worn paint and — when wet — puddles in the roughness map.
 */
export function roadTextures(cfg: LaneConfig, wet: boolean, hiRes: boolean): RoadTextures {
  const key = `road:${cfg.layout}:${wet}:${hiRes}`;
  const cached = cache.get(key + ':map');
  if (cached) return { map: cached, roughness: cache.get(key + ':rough')!, normal: cache.get(key + ':normal')! };

  const W = hiRes ? 1024 : 512;
  const H = hiRes ? 2048 : 1024;
  const half = pavedHalfWidth(cfg);
  const pxPerM = W / (half * 2);
  const pyPerM = H / ROAD_TEX_LENGTH;
  const dToX = (d: number) => (d + half) * pxPerM;
  const rng = new Rng(77);

  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  const px = img.data;
  const height = new Float32Array(W * H);
  const rough = new Float32Array(W * H);
  const base = wet ? 44 : 58;

  // Wheel-path (rubber) positions in each lane.
  const paths: number[] = [];
  for (let l = 0; l < cfg.lanes; l++) {
    const c0 = laneCenter(cfg, l);
    paths.push(c0 - 0.85, c0 + 0.85);
  }

  for (let y = 0; y < H; y++) {
    const sM = y / pyPerM;
    for (let x = 0; x < W; x++) {
      const dM = x / pxPerM - half;
      const i = y * W + x;
      // Tileable noise: wrap the long axis by sampling on a circle.
      const ang = (sM / ROAD_TEX_LENGTH) * Math.PI * 2;
      const nx = dM * 1.3;
      const ny = Math.cos(ang) * 6 + Math.sin(ang) * 3.1;
      const large = fbm2(nx * 0.35 + ny * 0.2, Math.sin(ang) * 4, 3, 3);
      const fine = (rng.float() - 0.5) * 2;
      let v = base + large * 9 + fine * 9;
      // Aggregate speckles.
      if (rng.float() < 0.025) v += 28 * rng.float();
      if (rng.float() < 0.02) v -= 18 * rng.float();
      let r = 0.92 - large * 0.05;
      // Rubbered wheel paths: darker and smoother.
      let wear = 0;
      for (const p of paths) wear = Math.max(wear, Math.exp(-(((dM - p) / 0.32) ** 2)));
      v -= wear * 10;
      r -= wear * 0.12;
      // Shoulders are lighter, older asphalt.
      if (Math.abs(dM) > cfg.lanes * cfg.laneWidth * 0.5 + 0.15) {
        v += 7 + noise2(dM * 2, ny, 9) * 4;
        r += 0.03;
      }
      if (wet) {
        // Water collects in the wheel ruts and near the edges.
        const puddle = clamp((noise2(dM * 0.9, ny * 0.8 + Math.sin(ang) * 2, 31) * 0.5 + 0.5) * (0.6 + wear * 0.9) - 0.42, 0, 1);
        r = clamp(0.38 - wear * 0.12 - puddle * 1.6, 0.03, 1);
        v -= puddle * 10;
      }
      height[i] = large * 0.6 + fine * 0.35 + (rng.float() < 0.03 ? 0.6 : 0);
      rough[i] = r;
      const k = i * 4;
      const tint = wet ? 0.96 : 1;
      px[k] = clamp(v * tint, 0, 255);
      px[k + 1] = clamp(v * tint, 0, 255);
      px[k + 2] = clamp(v * tint + 2, 0, 255);
      px[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // Cracks and repair patches.
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 9; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H - 200);
    g.fillStyle = `rgba(${rng.range(30, 50)},${rng.range(30, 50)},${rng.range(32, 52)},0.35)`;
    g.fillRect(x, y, rng.range(40, 160), rng.range(60, 260));
  }
  g.strokeStyle = 'rgba(15,15,16,0.55)';
  for (let i = 0; i < 26; i++) {
    g.lineWidth = rng.range(0.7, 1.8);
    let x = rng.range(0, W);
    let y = rng.range(0, H);
    g.beginPath();
    g.moveTo(x, y);
    const n = rng.int(4, 12);
    for (let k = 0; k < n; k++) {
      x += rng.range(-14, 14);
      y += rng.range(-30, 30);
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // Lane markings with worn paint.
  const paint = (d: number, widthM: number, dash: [number, number] | null, color: string) => {
    const x0 = dToX(d - widthM / 2);
    const wpx = widthM * pxPerM;
    const segs: [number, number][] = [];
    if (!dash) segs.push([0, H]);
    else {
      const cycle = (dash[0] + dash[1]) * pyPerM;
      for (let y = 0; y < H; y += cycle) segs.push([y, dash[0] * pyPerM]);
    }
    for (const [y0, len] of segs) {
      g.fillStyle = color;
      g.globalAlpha = 0.92;
      g.fillRect(x0, y0, wpx, len);
      // Wear: knock out random flecks.
      g.globalAlpha = 1;
      for (let k = 0; k < len * wpx * 0.03; k++) {
        g.fillStyle = `rgba(${base},${base},${base + 2},${rng.range(0.25, 0.8)})`;
        g.fillRect(x0 + rng.range(0, wpx), y0 + rng.range(0, len), rng.range(1, 3), rng.range(1, 4));
      }
      for (let yy = y0; yy < y0 + len; yy++) {
        for (let xx = Math.floor(x0); xx < x0 + wpx; xx++) {
          if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
          const idx = yy * W + xx;
          height[idx] += 0.5;
          rough[idx] = wet ? 0.3 : 0.62;
        }
      }
    }
  };
  const laneEdge = (cfg.lanes * cfg.laneWidth) / 2;
  const white = '#e9e9e4';
  paint(-laneEdge, 0.2, null, cfg.layout === 'oneway' ? '#e3c341' : white);
  paint(laneEdge, 0.2, null, white);
  for (let l = 1; l < cfg.lanes; l++) {
    const d = -laneEdge + l * cfg.laneWidth;
    if (cfg.layout === 'twoway' && cfg.dirs[l - 1] !== cfg.dirs[l]) {
      paint(d - 0.13, 0.12, null, white);
      paint(d + 0.13, 0.12, null, white);
    } else {
      paint(d, 0.15, [4, 8], white);
    }
  }
  // Rumble strip grooves on the shoulders.
  g.fillStyle = 'rgba(20,20,22,0.35)';
  for (let y = 0; y < H; y += 0.3 * pyPerM) {
    g.fillRect(dToX(laneEdge + 0.35), y, 0.35 * pxPerM, 0.12 * pyPerM);
    g.fillRect(dToX(-laneEdge - 0.7), y, 0.35 * pxPerM, 0.12 * pyPerM);
  }

  const map = finish(new THREE.CanvasTexture(c), true);

  const [rc, rg] = canvas(W, H);
  const rimg = rg.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const v = clamp(rough[i], 0, 1) * 255;
    rimg.data[i * 4] = v;
    rimg.data[i * 4 + 1] = v;
    rimg.data[i * 4 + 2] = v;
    rimg.data[i * 4 + 3] = 255;
  }
  rg.putImageData(rimg, 0, 0);
  const roughness = finish(new THREE.CanvasTexture(rc), false);
  const normal = finish(new THREE.CanvasTexture(normalFromHeight(height, W, H, 2.2)), false);
  cache.set(key + ':map', map);
  cache.set(key + ':rough', roughness);
  cache.set(key + ':normal', normal);
  return { map, roughness, normal };
}

export type GroundKind = 'grass' | 'sand' | 'city' | 'forest';

/** Tileable ground detail texture. */
export function groundTexture(kind: GroundKind): THREE.Texture {
  const key = `ground:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 512;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const rng = new Rng(kind.length * 99);
  const pal: Record<GroundKind, [number, number, number][]> = {
    grass: [[86, 108, 52], [104, 124, 60], [74, 92, 46], [120, 118, 72]],
    sand: [[196, 132, 82], [178, 114, 70], [210, 150, 96], [160, 100, 64]],
    city: [[92, 92, 90], [80, 80, 80], [104, 102, 98], [70, 72, 70]],
    forest: [[48, 64, 36], [60, 74, 40], [70, 58, 40], [40, 52, 32]],
  };
  const cols = pal[kind];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * Math.PI * 2;
      const v = (y / S) * Math.PI * 2;
      // Seamless by sampling noise on a torus.
      const n1 = fbm2(Math.cos(u) * 2 + Math.cos(v) * 0.7, Math.sin(u) * 2 + Math.sin(v) * 1.9, 4, 7);
      const n2 = noise2(Math.cos(u) * 9 + 5, Math.sin(v) * 9 + Math.sin(u) * 3, 3);
      const t = clamp(n1 * 0.5 + 0.5, 0, 1);
      const a = cols[Math.floor(t * 3.99)];
      const b = cols[(Math.floor(t * 3.99) + 1) % 4];
      const f = (t * 4) % 1;
      const j = (rng.float() - 0.5) * 22 + n2 * 10;
      const i = (y * S + x) * 4;
      img.data[i] = clamp(a[0] + (b[0] - a[0]) * f + j, 0, 255);
      img.data[i + 1] = clamp(a[1] + (b[1] - a[1]) * f + j, 0, 255);
      img.data[i + 2] = clamp(a[2] + (b[2] - a[2]) * f + j * 0.8, 0, 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (kind === 'grass' || kind === 'forest') {
    // Blades / needles.
    for (let k = 0; k < 2400; k++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      g.strokeStyle = kind === 'grass' ? `rgba(${rng.int(90, 150)},${rng.int(120, 160)},${rng.int(50, 80)},0.5)` : `rgba(${rng.int(60, 90)},${rng.int(70, 90)},${rng.int(40, 60)},0.5)`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rng.range(-2, 2), y - rng.range(3, 7));
      g.stroke();
    }
  }
  if (kind === 'sand') {
    g.strokeStyle = 'rgba(120,70,40,0.12)';
    for (let k = 0; k < 40; k++) {
      const y = rng.range(0, S);
      g.lineWidth = rng.range(1, 3);
      g.beginPath();
      for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x * 0.05 + k) * 6);
      g.stroke();
    }
  }
  const t = finish(new THREE.CanvasTexture(c), true);
  cache.set(key, t);
  return t;
}

/** Building façade with lit/unlit windows; emissive version for the night. */
export function facadeTextures(): { map: THREE.Texture; emissive: THREE.Texture } {
  const hit = cache.get('facade:map');
  if (hit) return { map: hit, emissive: cache.get('facade:em')! };
  const W = 256;
  const H = 512;
  const [c, g] = canvas(W, H);
  const [ec, eg] = canvas(W, H);
  const rng = new Rng(5);
  g.fillStyle = '#3b3f46';
  g.fillRect(0, 0, W, H);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, W, H);
  const cols = 8;
  const rows = 16;
  const cw = W / cols;
  const rh = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = k * cw + 3;
      const y = r * rh + 4;
      const lit = rng.float() < 0.42;
      g.fillStyle = lit ? '#6b6a5a' : `rgb(${rng.int(28, 40)},${rng.int(34, 46)},${rng.int(48, 60)})`;
      g.fillRect(x, y, cw - 6, rh - 9);
      if (lit) {
        const warm = rng.float() < 0.7;
        eg.fillStyle = warm ? `rgb(${rng.int(220, 255)},${rng.int(170, 210)},${rng.int(90, 130)})` : `rgb(${rng.int(170, 210)},${rng.int(200, 230)},255)`;
        eg.globalAlpha = rng.range(0.5, 1);
        eg.fillRect(x, y, cw - 6, rh - 9);
        eg.globalAlpha = 1;
      }
    }
  }
  const map = finish(new THREE.CanvasTexture(c), true);
  const emissive = finish(new THREE.CanvasTexture(ec), true);
  cache.set('facade:map', map);
  cache.set('facade:em', emissive);
  return { map, emissive };
}

/** Layered mountain silhouettes for the horizon ring (alpha = sky). */
export function mountainTexture(near: string, far: string, heightScale: number, seed: number): THREE.Texture {
  const key = `mtn:${near}:${far}:${heightScale}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 2048;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const layers: [string, number, number, number][] = [
    [far, 0.55, 0.012, 1.0],
    [near, 0.38, 0.02, 0.85],
  ];
  layers.forEach(([col, amp, freq, alpha], li) => {
    g.fillStyle = col;
    g.globalAlpha = alpha;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) {
      const u = (x / W) * Math.PI * 2;
      // Periodic in x so the ring has no seam.
      const n =
        fbm2(Math.cos(u) * freq * 160 + li * 10, Math.sin(u) * freq * 160 + seed, 5, seed + li) * 0.5 + 0.5;
      const y = H - (0.12 + n * amp * heightScale) * H;
      g.lineTo(x, clamp(y, 4, H));
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  });
  g.globalAlpha = 1;
  const t = finish(new THREE.CanvasTexture(c), true);
  t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}

/** Soft radial glow sprite. */
export function glowTexture(): THREE.Texture {
  const hit = cache.get('glow');
  if (hit) return hit;
  const S = 128;
  const [c, g] = canvas(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = finish(new THREE.CanvasTexture(c), true, false);
  cache.set('glow', t);
  return t;
}

/** Soft puff for smoke/spray particles. */
export function puffTexture(): THREE.Texture {
  const hit = cache.get('puff');
  if (hit) return hit;
  const S = 64;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2);
      const dy = (y - S / 2) / (S / 2);
      const r = Math.hypot(dx, dy);
      const n = fbm2(x * 0.15, y * 0.15, 3, 2) * 0.35;
      const a = clamp(1 - r + n * (1 - r), 0, 1) ** 1.8;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  g.putImageData(img, 0, 0);
  const t = finish(new THREE.CanvasTexture(c), true, false);
  cache.set('puff', t);
  return t;
}

/** Turkish licence plate: white with the blue TR band. */
export function plateTexture(text: string): THREE.Texture {
  const key = `plate:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#1b3c9c';
  g.fillRect(0, 0, 34, 64);
  g.fillStyle = '#fff';
  g.font = 'bold 18px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('TR', 17, 52);
  g.fillStyle = '#111';
  g.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
  g.fillText(text, 146, 47);
  g.strokeStyle = '#111';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 253, 61);
  const t = finish(new THREE.CanvasTexture(c), true, false);
  cache.set(key, t);
  return t;
}

/**
 * Green motorway direction sign (Turkish otoyol style). Not cached: every gantry
 * shows different distances, so the caller owns and disposes the texture.
 */
export function signTexture(lines: [string, string][]): THREE.Texture {
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#0d6b3b';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#f2f2f2';
  g.lineWidth = 8;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = '#f2f2f2';
  g.font = 'bold 54px "Arial Narrow", Arial, sans-serif';
  const step = (H - 40) / lines.length;
  lines.forEach(([name, km], i) => {
    const y = 30 + step * i + step * 0.68;
    g.textAlign = 'left';
    g.fillText(name, 36, y);
    g.textAlign = 'right';
    g.fillText(km, W - 36, y);
  });
  const t = finish(new THREE.CanvasTexture(c), true, false);
  t.userData.owned = true;
  return t;
}

/** Brand/model lettering for fairings and tanks (transparent background). */
export function decalTexture(text: string, color: string, italic = true): THREE.Texture {
  const key = `decal:${text}:${color}:${italic}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(512, 128);
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = color;
  g.font = `${italic ? 'italic ' : ''}900 78px "Arial Black", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 78;
  while (g.measureText(text).width > 490 && size > 20) {
    size -= 4;
    g.font = `${italic ? 'italic ' : ''}900 ${size}px "Arial Black", Arial, sans-serif`;
  }
  g.fillText(text, 256, 66);
  const t = finish(new THREE.CanvasTexture(c), true, false);
  cache.set(key, t);
  return t;
}

/** Wheel/carbon weave used on hypersport parts. */
export function carbonTexture(): THREE.Texture {
  const hit = cache.get('carbon');
  if (hit) return hit;
  const S = 64;
  const [c, g] = canvas(S, S);
  for (let y = 0; y < S; y += 8)
    for (let x = 0; x < S; x += 8) {
      const odd = ((x + y) / 8) % 2 === 0;
      const grd = odd ? g.createLinearGradient(x, y, x + 8, y) : g.createLinearGradient(x, y, x, y + 8);
      grd.addColorStop(0, '#0d0e10');
      grd.addColorStop(0.5, '#2b2e33');
      grd.addColorStop(1, '#0d0e10');
      g.fillStyle = grd;
      g.fillRect(x, y, 8, 8);
    }
  const t = finish(new THREE.CanvasTexture(c), true);
  t.repeat.set(6, 6);
  cache.set('carbon', t);
  return t;
}
