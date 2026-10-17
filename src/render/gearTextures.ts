import * as THREE from 'three';
import type { HelmetDesign, SuitDesign } from '../data/riderGear';

/**
 * Canvas-painted textures for the rider's customised helmet and leathers (src/data/riderGear.ts).
 * Helmet UVs come from a sphere: u runs around the head (front at u = 0.75, rear at 0.25, sides at
 * 0 and 0.5), v runs from the chin (0) to the crown (1). Leathers are capsules (u around, v along).
 */

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  return g ? { c, g } : null;
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Draw `fn` at u offsets 0 and ±1 so shapes crossing the texture seam stay continuous. */
function wrapped(w: number, fn: (dx: number) => void): void {
  fn(0);
  fn(-w);
  fn(w);
}

export function helmetTexture(design: HelmetDesign, base: string, accent: string): THREE.CanvasTexture | null {
  const W = 1024;
  const H = 512;
  const cv = canvas(W, H);
  if (!cv) return null;
  const { c, g } = cv;
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const x = (u: number) => u * W;
  const y = (v: number) => (1 - v) * H;
  g.fillStyle = accent;
  g.strokeStyle = accent;
  switch (design) {
    case 'solid':
      break;
    case 'stripe':
      for (const u of [0.75, 0.25]) g.fillRect(x(u - 0.035), 0, x(0.07), H);
      break;
    case 'twin':
      for (const u of [0.75, 0.25]) {
        g.fillRect(x(u - 0.07), 0, x(0.035), H);
        g.fillRect(x(u + 0.035), 0, x(0.035), H);
      }
      break;
    case 'checker': {
      const cols = 40;
      const cw = W / cols;
      const rows = 4;
      const top = y(0.46);
      const rh = (y(0.26) - top) / rows;
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) {
          if ((k + r) % 2 === 0) g.fillRect(k * cw, top + r * rh, cw + 0.5, rh + 0.5);
        }
      }
      break;
    }
    case 'flame': {
      // Tongues licking up from the lower rim, taller at the sides than the front.
      wrapped(W, (dx) => {
        for (let k = 0; k < 18; k++) {
          const cx = dx + (k + 0.5) * (W / 18);
          const hgt = H * (0.16 + 0.1 * Math.abs(Math.sin(k * 1.9)));
          g.beginPath();
          g.moveTo(cx - W / 36, y(0.12));
          g.bezierCurveTo(cx - W / 60, y(0.12) - hgt * 0.5, cx + W / 90, y(0.12) - hgt * 0.7, cx + W / 140, y(0.12) - hgt);
          g.bezierCurveTo(cx + W / 70, y(0.12) - hgt * 0.5, cx + W / 40, y(0.12) - hgt * 0.2, cx + W / 36, y(0.12));
          g.closePath();
          g.fill();
        }
      });
      g.fillRect(0, y(0.14), W, H * 0.14);
      break;
    }
    case 'chevron': {
      // Nested arrow heads pointing up the front of the helmet.
      g.lineJoin = 'miter';
      g.lineWidth = H * 0.05;
      for (let k = 0; k < 4; k++) {
        const v0 = 0.3 + k * 0.1;
        g.beginPath();
        g.moveTo(x(0.75 - 0.14 - k * 0.012), y(v0 - 0.12));
        g.lineTo(x(0.75), y(v0));
        g.lineTo(x(0.75 + 0.14 + k * 0.012), y(v0 - 0.12));
        g.stroke();
      }
      break;
    }
  }
  return finish(c);
}

export function suitTexture(design: SuitDesign, base: string, accent: string): THREE.CanvasTexture | null {
  const W = 256;
  const H = 256;
  const cv = canvas(W, H);
  if (!cv) return null;
  const { c, g } = cv;
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  g.fillStyle = accent;
  switch (design) {
    case 'solid':
      break;
    case 'panels':
      // Colour-blocked shoulders and cuffs.
      g.fillRect(0, H * 0.08, W, H * 0.16);
      g.fillRect(0, H * 0.76, W, H * 0.1);
      break;
    case 'racing':
      for (const u of [0.25, 0.75]) {
        g.fillRect(W * (u - 0.07), 0, W * 0.06, H);
        g.fillRect(W * (u + 0.02), 0, W * 0.02, H);
      }
      break;
    case 'split':
      g.fillRect(0, H * 0.5, W, H * 0.5);
      break;
  }
  return finish(c);
}
