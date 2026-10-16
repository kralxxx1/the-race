import * as THREE from 'three';
import { fbm2, smoothstep } from '../../core/math';

/**
 * Distant mountain ranges: textured open cylinders around the rider. Each range's silhouette is a
 * periodic ridged-noise skyline (seamless around the full circle) painted with altitude colour bands,
 * a snow line, sun-facing shading and a wooded base, then blended towards the fog colour so the
 * ranges sit in the atmosphere. Textures are generated once per run and owned by the Backdrop.
 */

export interface RangeSpec {
  /** Cylinder radius (metres). */
  radius: number;
  /** Cylinder height (metres); peaks reach at most this high above the base. */
  height: number;
  /** Colours: foothills, mid slopes, rock/peak. */
  low: string;
  mid: string;
  peak: string;
  /** Snow line as a fraction of the range height (>1 = no snow). */
  snowLine: number;
  /** Ridge sharpness 0 (rolling) .. 1 (alpine). */
  sharp: number;
  /** Horizon amplitude: fraction of the cylinder height covered by the tallest peaks. */
  amp: number;
  seed: number;
  /** 0..1 haze towards the fog colour. */
  haze: number;
  /** Optional tree-covered lower slopes colour. */
  forest?: string;
  /** Vertical placement offset below the rider's ground (metres). */
  drop?: number;
}

const W = 2048;
const H = 384;

function ridged(x: number, seed: number, sharp: number): number {
  // Periodic sampling: map the angle onto a circle in noise space so the first and last column match.
  const a = (x / W) * Math.PI * 2;
  const cx = Math.cos(a) * 2.2;
  const cy = Math.sin(a) * 2.2;
  let v = 0;
  let amp = 0.55;
  let f = 1;
  for (let o = 0; o < 5; o++) {
    const n = fbm2(cx * f + seed, cy * f + seed * 0.37, 2, seed + o * 7) * 2 - 1; // -1..1
    const r = 1 - Math.abs(n); // ridge
    v += (sharp * r * r + (1 - sharp) * (n * 0.5 + 0.5)) * amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return Math.min(1, Math.max(0, v / 1.0));
}

function parse(c: string): [number, number, number] {
  const col = new THREE.Color(c);
  return [col.r, col.g, col.b];
}

function toSrgb(v: number): number {
  v = Math.min(1, Math.max(0, v));
  return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
}

/** Paint one range into a canvas texture (RGBA, transparent above the skyline). */
export function rangeTexture(spec: RangeSpec, fogColor: THREE.Color): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const low = parse(spec.low);
  const mid = parse(spec.mid);
  const peak = parse(spec.peak);
  const forest = spec.forest ? parse(spec.forest) : null;
  const fog: [number, number, number] = [fogColor.r, fogColor.g, fogColor.b];
  const heights = new Float32Array(W);
  for (let x = 0; x < W; x++) heights[x] = ridged(x, spec.seed, spec.sharp);
  for (let x = 0; x < W; x++) {
    const top = Math.min(1, heights[x] * spec.amp * 1.25 + 0.04);
    const topY = Math.round(H * (1 - top));
    // Slope of the skyline decides sun-facing shading (sun from the left of the image).
    const slope = (heights[(x + 3) % W] - heights[(x + W - 3) % W]) * 14;
    const shade = 0.78 - slope * 0.32;
    for (let y = topY; y < H; y++) {
      const alt = (H - y) / (H * Math.max(top, 0.05)); // 0 base .. 1 peak (relative to this column)
      const absAlt = (H - y) / H / Math.max(spec.amp, 0.05); // 0..~1 over the whole range
      // Altitude bands: wooded foothills, grey slopes, bare peak rock.
      let r: number, gg: number, b: number;
      const t1 = smoothstep(0.0, 0.5, absAlt);
      const t2 = smoothstep(0.35, 0.95, absAlt);
      r = low[0] + (mid[0] - low[0]) * t1;
      gg = low[1] + (mid[1] - low[1]) * t1;
      b = low[2] + (mid[2] - low[2]) * t1;
      r += (peak[0] - r) * t2;
      gg += (peak[1] - gg) * t2;
      b += (peak[2] - b) * t2;
      if (forest) {
        const f = 1 - smoothstep(0.18, 0.5, absAlt + (fbm2(x * 0.02, y * 0.05, 2, spec.seed + 3) - 0.5) * 0.2);
        r += (forest[0] - r) * f;
        gg += (forest[1] - gg) * f;
        b += (forest[2] - b) * f;
      }
      // Rocky texture: vertical gullies and strata from noise.
      const gully = fbm2(x * 0.045 + spec.seed, y * 0.02, 3, spec.seed + 9);
      const k = (0.62 + gully * 0.7) * shade;
      r *= k;
      gg *= k;
      b *= k;
      // Snow cap with a ragged lower edge following the gullies (snow stays in the sunlit hollows).
      if (spec.snowLine < 1.2) {
        const edge = spec.snowLine + (gully - 0.5) * 0.28 - (1 - slope * 0.2) * 0.02;
        const sn = smoothstep(edge - 0.03, edge + 0.05, absAlt);
        const sv = 0.82 + 0.18 * shade;
        r += (sv - r) * sn;
        gg += (sv * 0.99 - gg) * sn;
        b += (sv * 1.0 - b) * sn;
      }
      // Aerial perspective: blend to the fog colour (more towards the base and for far ranges).
      const hz = Math.min(1, spec.haze + (1 - alt) * 0.12);
      r += (fog[0] - r) * hz;
      gg += (fog[1] - gg) * hz;
      b += (fog[2] - b) * hz;
      // Soft skyline edge.
      const a = y - topY < 2 ? 0.55 : 1;
      const i = (y * W + x) * 4;
      img.data[i] = toSrgb(r);
      img.data[i + 1] = toSrgb(gg);
      img.data[i + 2] = toSrgb(b);
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.owned = true;
  return t;
}

/** Cylinder group of the given ranges (back to front), following the rider horizontally. */
export class Backdrop {
  readonly group = new THREE.Group();
  private owned: { dispose(): void }[] = [];

  constructor(specs: readonly RangeSpec[], fog: THREE.ColorRepresentation) {
    const fogColor = new THREE.Color(fog);
    specs.forEach((sp, i) => {
      const tex = rangeTexture(sp, fogColor);
      if (!tex) return;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false, side: THREE.BackSide });
      const geo = new THREE.CylinderGeometry(sp.radius, sp.radius, sp.height, 64, 1, true);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = sp.height / 2 - 40 - (sp.drop ?? 0);
      mesh.renderOrder = -6 + i;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.owned.push(tex, mat, geo);
    });
    this.group.frustumCulled = false;
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.group.clear();
  }
}
