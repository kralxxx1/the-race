import * as THREE from 'three';
import type { BikeSpec } from '../data/bikes';
import { BikeModel } from './bikeModel';
import { Materials } from './materials';
import type { Renderer } from './renderer';

/** Thumbnail size (px). 3:2 matches the garage cards. */
const W = 360;
const H = 240;

/** Linear → display curve (soft shoulder + sRGB), baked once because render targets skip tone mapping. */
const LUT = (() => {
  const t = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 1.35;
    const mapped = (x * (1 + x / 4)) / (1 + x); // gentle Reinhard-style shoulder
    const s = mapped <= 0.0031308 ? mapped * 12.92 : 1.055 * Math.pow(mapped, 1 / 2.4) - 0.055;
    t[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
  }
  return t;
})();

interface Job {
  key: string;
  spec: BikeSpec;
  livery: number;
  resolve(url: string | null): void;
}

/**
 * Offscreen bike renders for the garage cards. A small studio (floor disc, three lights, the
 * showroom's reflection environment) is drawn into a render target with the shared WebGL context,
 * tone-mapped on the CPU and cached as a JPEG data URL. Jobs run one per frame so scrolling the
 * list never stalls; results are cached per bike + livery.
 */
export class BikeThumbs {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(26, W / H, 0.1, 60);
  private readonly target: THREE.WebGLRenderTarget;
  private readonly mats = new Materials();
  private readonly cache = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private readonly queue: Job[] = [];
  private readonly canvas = document.createElement('canvas');
  private readonly pixels = new Uint8Array(W * H * 4);
  private running = false;
  private disposed = false;
  private failed = false;
  /** Last keyboard/pointer/wheel activity: thumbnails wait while the player is typing or scrolling. */
  private lastInput = 0;
  private readonly onInput = (): void => {
    this.lastInput = performance.now();
  };

  constructor(
    private readonly renderer: Renderer,
    env: THREE.Texture | null,
  ) {
    this.canvas.width = W;
    this.canvas.height = H;
    for (const ev of ['keydown', 'pointerdown', 'wheel', 'touchmove'] as const) window.addEventListener(ev, this.onInput, { passive: true });
    this.target = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.UnsignedByteType, depthBuffer: true });
    const s = this.scene;
    s.background = new THREE.Color('#0d1017');
    s.environment = env;
    s.environmentIntensity = 0.55;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: '#171b24', roughness: 0.5, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(3, 5, 4);
    const rim = new THREE.DirectionalLight('#7fb2ff', 1.6);
    rim.position.set(-4, 3, -3);
    const fill = new THREE.DirectionalLight('#ffb070', 0.7);
    fill.position.set(-3, 2, 4);
    s.add(key, rim, fill, new THREE.HemisphereLight('#9fb7d9', '#1a1c22', 0.5));
  }

  get ready(): boolean {
    return !this.failed && !this.disposed;
  }

  /** Cached data URL, or a promise that resolves once the job has run (null when rendering failed). */
  request(spec: BikeSpec, livery: number): Promise<string | null> {
    const key = `${spec.id}:${livery}`;
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    if (!this.ready) return Promise.resolve(null);
    const pend = this.pending.get(key);
    if (pend) return pend;
    const p = new Promise<string | null>((resolve) => this.queue.push({ key, spec, livery, resolve }));
    this.pending.set(key, p);
    void p.finally(() => this.pending.delete(key));
    this.pump();
    return p;
  }

  /** Forget a cached bike (its livery or upgrade look changed). */
  invalidate(bikeId: string): void {
    for (const k of [...this.cache.keys()]) if (k.startsWith(`${bikeId}:`)) this.cache.delete(k);
  }

  private pump(): void {
    if (this.running || !this.queue.length) return;
    this.running = true;
    // One thumbnail per idle slot keeps menus responsive; a build costs tens of milliseconds, so wait
    // while the player is typing or scrolling and let the browser pick a quiet moment.
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const schedule = (cb: () => void): void => {
      if (idle) idle(cb, { timeout: 400 });
      else requestAnimationFrame(cb);
    };
    const run = (): void => {
      if (this.disposed) return;
      if (performance.now() - this.lastInput < 250) {
        schedule(run);
        return;
      }
      const job = this.queue.shift();
      this.running = false;
      if (job) {
        let url: string | null = null;
        try {
          url = this.render(job.spec, job.livery);
          this.cache.set(job.key, url);
        } catch (e) {
          console.warn('bike thumbnail failed', e);
          this.failed = true;
        }
        job.resolve(url);
      }
      if (this.failed) {
        for (const j of this.queue.splice(0)) j.resolve(null);
      } else this.pump();
    };
    schedule(run);
  }

  private render(spec: BikeSpec, livery: number): string {
    const gl = this.renderer.renderer;
    const bike = new BikeModel(spec, livery, this.mats, { detail: 'medium', lod: 1 });
    try {
      bike.root.position.z = bike.frame.L / 2;
      bike.root.rotation.y = 0;
      bike.update({ lean: 0, pitch: 0, steer: 0.1, wheelSpeed: 0, frontComp: 0, rearComp: 0, brake: 0, headlight: false, dt: 0 });
      bike.updateDash(0, 1, 0, false, 'kmh');
      this.scene.add(bike.root);
      // Three-quarter front view, framed by the bike length.
      const L = bike.frame.L;
      const dist = 0.7 + L * 1.62;
      const angle = -0.62;
      this.camera.position.set(Math.sin(angle) * dist, 0.62 + L * 0.12, Math.cos(angle) * dist);
      this.camera.lookAt(0, 0.56, 0);
      this.camera.updateMatrixWorld();

      const prevTarget = gl.getRenderTarget();
      const prevAuto = gl.autoClear;
      const prevShadow = gl.shadowMap.enabled;
      gl.shadowMap.enabled = false;
      gl.autoClear = true;
      gl.setRenderTarget(this.target);
      gl.render(this.scene, this.camera);
      gl.readRenderTargetPixels(this.target, 0, 0, W, H, this.pixels);
      gl.setRenderTarget(prevTarget);
      gl.autoClear = prevAuto;
      gl.shadowMap.enabled = prevShadow;
    } finally {
      this.scene.remove(bike.root);
      bike.dispose();
    }
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2d context unavailable');
    const img = g.createImageData(W, H);
    const src = this.pixels;
    const dst = img.data;
    // Rows come bottom-up; flip while applying the tone curve.
    for (let y = 0; y < H; y++) {
      let si = (H - 1 - y) * W * 4;
      let di = y * W * 4;
      for (let x = 0; x < W; x++, si += 4, di += 4) {
        dst[di] = LUT[src[si]];
        dst[di + 1] = LUT[src[si + 1]];
        dst[di + 2] = LUT[src[si + 2]];
        dst[di + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/jpeg', 0.84);
  }

  dispose(): void {
    this.disposed = true;
    for (const ev of ['keydown', 'pointerdown', 'wheel', 'touchmove'] as const) window.removeEventListener(ev, this.onInput);
    for (const j of this.queue.splice(0)) j.resolve(null);
    this.target.dispose();
  }
}
