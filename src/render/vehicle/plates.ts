import * as THREE from 'three';
import type { PlateDef } from './build';

/**
 * Turkish licence plates for the whole fleet in one draw call: an atlas of white plates with the
 * blue "TR" band and a province / letters / digits sequence (34 ABC 123), instanced as unit quads
 * placed from each model's plate anchors.
 */

export const PLATE_ROWS = 8;
const PROVINCES = ['34', '06', '35', '16', '07', '41', '01', '27', '33', '42', '26', '55', '61', '20', '38', '44'];
const LETTERS = 'ABCDEFGHJKLMNPRSTUVYZ';

let atlas: THREE.Texture | null | undefined;

function plateTexture(): THREE.Texture | null {
  if (atlas !== undefined) return atlas;
  atlas = null;
  if (typeof document === 'undefined') return atlas;
  const w = 512;
  const h = 112;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h * PLATE_ROWS;
  const g = c.getContext('2d');
  if (!g) return atlas;
  let seed = 1234567;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let r = 0; r < PLATE_ROWS; r++) {
    const y0 = (PLATE_ROWS - 1 - r) * h; // canvas rows run top-down, uv rows bottom-up
    g.fillStyle = '#f4f4f0';
    g.fillRect(0, y0, w, h);
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 4;
    g.strokeRect(3, y0 + 3, w - 6, h - 6);
    g.fillStyle = '#1b3f9b';
    g.fillRect(6, y0 + 6, 62, h - 12);
    g.fillStyle = '#ffffff';
    g.font = 'bold 34px sans-serif';
    g.textAlign = 'center';
    g.fillText('TR', 37, y0 + h - 22);
    g.fillStyle = '#ffd400';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillRect(37 + Math.cos(a) * 16 - 1.5, y0 + 24 + Math.sin(a) * 9 - 1.5, 3, 3);
    }
    const letters = 1 + Math.floor(rnd() * 3);
    let txt = PROVINCES[Math.floor(rnd() * PROVINCES.length)] + ' ';
    for (let i = 0; i < letters; i++) txt += LETTERS[Math.floor(rnd() * LETTERS.length)];
    txt += ' ' + String(Math.floor(rnd() * (letters === 1 ? 9000 : 900)) + 100);
    g.fillStyle = '#101010';
    g.font = 'bold 76px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(txt, 70 + (w - 70) / 2, y0 + h - 26);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  atlas = t;
  return t;
}

export interface PlateRenderer {
  mesh: THREE.InstancedMesh;
  /** Place a plate in world space. */
  add(x: number, y: number, z: number, face: -1 | 1, w: number, h: number, tilt: number, row: number): void;
  /** Place a plate from a prepared world matrix (unit quad scaled by w × h). */
  addMatrix(m: THREE.Matrix4, row: number): void;
  begin(): void;
  commit(): void;
  dispose(): void;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Local matrix of a plate anchor in vehicle space (unit quad facing +z rotated to `face`). */
export function plateLocal(p: PlateDef, out: THREE.Matrix4): THREE.Matrix4 {
  // face = +1 → the rear plate looks backwards (+z, no turn); face = −1 → turned round to look forwards.
  _e.set(p.tilt * p.face, p.face === 1 ? 0 : Math.PI, 0, 'YXZ');
  _q.setFromEuler(_e);
  return out.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.w, p.h, 1));
}

export function platesMaterial(capacity = 160): PlateRenderer {
  const geo = new THREE.PlaneGeometry(1, 1);
  const row = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aRow', row);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: plateTexture(), roughness: 0.42, metalness: 0, envMapIntensity: 0.6 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRow;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv.y = (vMapUv.y + aRow) / ${PLATE_ROWS.toFixed(1)};\n#endif`);
  };
  mat.customProgramCacheKey = () => 'vehicle-plate';
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.name = 'plates';
  let n = 0;
  return {
    mesh,
    add(x, y, z, face, w, h, tilt, r) {
      if (n >= capacity) return;
      _e.set(tilt * face, face === 1 ? 0 : Math.PI, 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(x, y, z), _q, _s.set(w, h, 1));
      mesh.setMatrixAt(n, _m);
      row.setX(n, r);
      n++;
    },
    addMatrix(m, r) {
      if (n >= capacity) return;
      mesh.setMatrixAt(n, m);
      row.setX(n, r);
      n++;
    },
    begin() {
      n = 0;
    },
    commit() {
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      row.needsUpdate = true;
    },
    dispose() {
      mesh.dispose();
      geo.dispose();
      mat.dispose();
      mesh.removeFromParent();
    },
  };
}
