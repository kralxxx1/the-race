import * as THREE from 'three';
import { glowTexture, puffTexture } from './textures';

/**
 * Additive glow sprites (head/tail lights, street lamps, indicators) rendered
 * as a single point cloud — one draw call for every light in the scene.
 */
export class GlowPoints {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private count = 0;
  private geo: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;

  constructor(readonly capacity: number, fogNear: number, fogFar: number) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: glowTexture() },
        scale: { value: 600 },
        fogNear: { value: fogNear },
        fogFar: { value: fogFar },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        uniform float scale;
        uniform float fogNear;
        uniform float fogFar;
        varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          float fade = 1.0 - smoothstep(fogNear, fogFar, d);
          vColor = color * fade;
          gl_PointSize = clamp(size * scale / max(d, 0.1), 0.0, 256.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor * t.a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  begin(): void {
    this.count = 0;
  }

  add(x: number, y: number, z: number, r: number, g: number, b: number, size: number): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.size[i] = size;
  }

  end(): void {
    this.geo.setDrawRange(0, this.count);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  setViewportHeight(h: number, fovDeg: number): void {
    this.material.uniforms.scale.value = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
}

/** Tiny deterministic generator for particle spread (no Math.random in hot paths, replays look alike). */
class Fx {
  private s = 0x9e3779b9;
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  reseed(n: number): void {
    this.s = (n | 0) || 1;
  }
}

/**
 * Glowing spark streaks (barrier scrapes, sliding crashes). Struct-of-arrays pool: no allocation
 * per spark, oldest sparks are recycled when the pool is full.
 */
export class Sparks {
  readonly lines: THREE.LineSegments;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private count = 0;
  private head = 0;
  private pos: Float32Array;
  private col: Float32Array;
  private geo: THREE.BufferGeometry;
  private fx = new Fx();
  /** Road height at (x, z); sparks bounce on it. */
  ground: (x: number, z: number) => number = () => 0;

  constructor(private capacity = 1200) {
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.pos = new Float32Array(capacity * 6);
    this.col = new Float32Array(capacity * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.lines = new THREE.LineSegments(this.geo, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, n: number, spread = 3): void {
    const f = this.fx;
    for (let k = 0; k < n; k++) {
      let i: number;
      if (this.count < this.capacity) i = this.count++;
      else {
        i = this.head;
        this.head = (this.head + 1) % this.capacity;
      }
      const life = 0.25 + f.next() * 0.6;
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      this.vx[i] = vx + (f.next() - 0.5) * spread * 2;
      this.vy[i] = vy + f.next() * spread * 1.2;
      this.vz[i] = vz + (f.next() - 0.5) * spread * 2;
      this.life[i] = life;
      this.max[i] = life;
    }
  }

  update(dt: number): void {
    const ground = this.ground;
    // Integrate and compact (swap-remove the dead).
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.count;
        if (i !== l) this.copy(l, i);
        continue;
      }
      this.vy[i] -= 9.81 * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const gy = ground(this.px[i], this.pz[i]) + 0.02;
      if (this.py[i] < gy && this.vy[i] < 0) {
        this.py[i] = gy;
        this.vy[i] *= -0.35;
        this.vx[i] *= 0.7;
        this.vz[i] *= 0.7;
      }
    }
    for (let i = 0; i < this.count; i++) {
      const t = this.life[i] / this.max[i];
      const o = i * 6;
      this.pos[o] = this.px[i];
      this.pos[o + 1] = this.py[i];
      this.pos[o + 2] = this.pz[i];
      this.pos[o + 3] = this.px[i] - this.vx[i] * 0.03;
      this.pos[o + 4] = this.py[i] - this.vy[i] * 0.03;
      this.pos[o + 5] = this.pz[i] - this.vz[i] * 0.03;
      const r = 3.0 * t + 0.6;
      const g = 1.6 * t * t + 0.2;
      const b = 0.4 * t * t * t;
      this.col[o] = r;
      this.col[o + 1] = g;
      this.col[o + 2] = b;
      this.col[o + 3] = r * 0.3;
      this.col[o + 4] = g * 0.2;
      this.col[o + 5] = b * 0.1;
    }
    this.geo.setDrawRange(0, this.count * 2);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  private copy(from: number, to: number): void {
    this.px[to] = this.px[from];
    this.py[to] = this.py[from];
    this.pz[to] = this.pz[from];
    this.vx[to] = this.vx[from];
    this.vy[to] = this.vy[from];
    this.vz[to] = this.vz[from];
    this.life[to] = this.life[from];
    this.max[to] = this.max[from];
  }

  /** Shift all particles (origin rebasing). */
  shift(dx: number, dy: number, dz: number): void {
    for (let i = 0; i < this.count; i++) {
      this.px[i] -= dx;
      this.py[i] -= dy;
      this.pz[i] -= dz;
    }
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
    this.fx.reseed(0x9e3779b9);
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geo.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}

/** Soft billboard puffs: tyre smoke, road spray, crash dust. Pooled (struct-of-arrays). */
export class Smoke {
  readonly points: THREE.Points;
  private cap: number;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private size: Float32Array;
  private grow: Float32Array;
  private shade: Float32Array;
  private alpha: Float32Array;
  private count = 0;
  private head = 0;
  private pos: Float32Array;
  private data: Float32Array;
  private geo: THREE.BufferGeometry;
  private fx = new Fx();
  readonly material: THREE.ShaderMaterial;

  constructor(capacity = 300) {
    this.cap = capacity;
    const f = () => new Float32Array(capacity);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.life = f();
    this.max = f();
    this.size = f();
    this.grow = f();
    this.shade = f();
    this.alpha = f();
    this.pos = new Float32Array(capacity * 3);
    this.data = new Float32Array(capacity * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('pdata', new THREE.BufferAttribute(this.data, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: puffTexture() }, scale: { value: 600 }, tint: { value: new THREE.Color('#d8dade') } },
      vertexShader: /* glsl */ `
        attribute vec3 pdata; // size, alpha, shade
        uniform float scale;
        varying float vAlpha;
        varying float vShade;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(pdata.x * scale / max(-mv.z, 0.1), 0.0, 512.0);
          vAlpha = pdata.y;
          vShade = pdata.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 tint;
        varying float vAlpha;
        varying float vShade;
        void main() {
          float a = texture2D(map, gl_PointCoord).a * vAlpha;
          gl_FragColor = vec4(tint * vShade, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, opts: { size?: number; life?: number; grow?: number; shade?: number; alpha?: number; n?: number; spread?: number } = {}): void {
    const n = opts.n ?? 1;
    const f = this.fx;
    for (let k = 0; k < n; k++) {
      let i: number;
      if (this.count < this.cap) i = this.count++;
      else {
        i = this.head;
        this.head = (this.head + 1) % this.cap;
      }
      const life = (opts.life ?? 1.6) * (0.7 + f.next() * 0.6);
      const sp = opts.spread ?? 0.6;
      this.px[i] = x + (f.next() - 0.5) * 0.2;
      this.py[i] = y;
      this.pz[i] = z + (f.next() - 0.5) * 0.2;
      this.vx[i] = vx + (f.next() - 0.5) * sp;
      this.vy[i] = vy + f.next() * sp * 0.6;
      this.vz[i] = vz + (f.next() - 0.5) * sp;
      this.life[i] = life;
      this.max[i] = life;
      this.size[i] = (opts.size ?? 0.8) * (0.7 + f.next() * 0.6);
      this.grow[i] = opts.grow ?? 1.4;
      this.shade[i] = opts.shade ?? 1;
      this.alpha[i] = opts.alpha ?? 0.45;
    }
  }

  update(dt: number): void {
    const drag = Math.exp(-2.2 * dt);
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.count;
        if (i !== l) this.copy(l, i);
        continue;
      }
      this.vx[i] *= drag;
      this.vz[i] *= drag;
      this.vy[i] = this.vy[i] * drag + 0.25 * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.size[i] += this.grow[i] * dt;
    }
    for (let i = 0; i < this.count; i++) {
      const t = this.life[i] / this.max[i];
      this.pos[i * 3] = this.px[i];
      this.pos[i * 3 + 1] = this.py[i];
      this.pos[i * 3 + 2] = this.pz[i];
      this.data[i * 3] = this.size[i];
      this.data[i * 3 + 1] = this.alpha[i] * Math.min(1, t * 2) * Math.min(1, (1 - t) * 8);
      this.data[i * 3 + 2] = this.shade[i];
    }
    this.geo.setDrawRange(0, this.count);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.pdata as THREE.BufferAttribute).needsUpdate = true;
  }

  private copy(from: number, to: number): void {
    this.px[to] = this.px[from];
    this.py[to] = this.py[from];
    this.pz[to] = this.pz[from];
    this.vx[to] = this.vx[from];
    this.vy[to] = this.vy[from];
    this.vz[to] = this.vz[from];
    this.life[to] = this.life[from];
    this.max[to] = this.max[from];
    this.size[to] = this.size[from];
    this.grow[to] = this.grow[from];
    this.shade[to] = this.shade[from];
    this.alpha[to] = this.alpha[from];
  }

  shift(dx: number, dy: number, dz: number): void {
    for (let i = 0; i < this.count; i++) {
      this.px[i] -= dx;
      this.py[i] -= dy;
      this.pz[i] -= dz;
    }
  }

  setViewportHeight(h: number, fovDeg: number): void {
    this.material.uniforms.scale.value = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
    this.fx.reseed(0x9e3779b9);
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

/**
 * Tyre skid marks and body scrape marks painted on the road as flat quads. A ring buffer of
 * segments in one dynamic mesh; sources (wheels, sliding bodies) remember their last point so
 * consecutive samples join into continuous strokes.
 */
export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private geo: THREE.BufferGeometry;
  private n = 0;
  private cap: number;
  private last: Float32Array;
  private lastOk: Uint8Array;
  readonly material: THREE.MeshBasicMaterial;

  constructor(capacity = 700, sources = 12) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 4 * 3);
    this.col = new Float32Array(capacity * 4 * 4);
    this.last = new Float32Array(sources * 3);
    this.lastOk = new Uint8Array(sources);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint32Array(capacity * 6);
    for (let i = 0; i < capacity; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.geo.setDrawRange(0, 0);
  }

  /** Extend source `id`'s stroke to (x, y, z). `alpha` 0..1 darkness, `width` in metres. */
  stroke(id: number, x: number, y: number, z: number, width: number, alpha: number, grey = 0.03): void {
    const l = id * 3;
    if (this.lastOk[id]) {
      const dx = x - this.last[l];
      const dz = z - this.last[l + 2];
      const len = Math.hypot(dx, dz);
      if (len <= 0.12) return;
      if (len < 6) {
        const nx = (-dz / len) * width * 0.5;
        const nz = (dx / len) * width * 0.5;
        const i = this.n % this.cap;
        const o = i * 12;
        const y0 = this.last[l + 1] + 0.012;
        const y1 = y + 0.012;
        const p = this.pos;
        p[o] = this.last[l] - nx;
        p[o + 1] = y0;
        p[o + 2] = this.last[l + 2] - nz;
        p[o + 3] = this.last[l] + nx;
        p[o + 4] = y0;
        p[o + 5] = this.last[l + 2] + nz;
        p[o + 6] = x - nx;
        p[o + 7] = y1;
        p[o + 8] = z - nz;
        p[o + 9] = x + nx;
        p[o + 10] = y1;
        p[o + 11] = z + nz;
        const c = i * 16;
        for (let k = 0; k < 4; k++) {
          this.col[c + k * 4] = grey;
          this.col[c + k * 4 + 1] = grey;
          this.col[c + k * 4 + 2] = grey;
          this.col[c + k * 4 + 3] = alpha * (k < 2 ? 0.75 : 1);
        }
        this.n++;
        this.geo.setDrawRange(0, Math.min(this.n, this.cap) * 6);
        (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      }
    }
    this.last[l] = x;
    this.last[l + 1] = y;
    this.last[l + 2] = z;
    this.lastOk[id] = 1;
  }

  /** The source stopped touching the road: the next sample starts a new stroke. */
  lift(id: number): void {
    this.lastOk[id] = 0;
  }

  shift(dx: number, dy: number, dz: number): void {
    const m = Math.min(this.n, this.cap) * 4;
    for (let i = 0; i < m; i++) {
      this.pos[i * 3] -= dx;
      this.pos[i * 3 + 1] -= dy;
      this.pos[i * 3 + 2] -= dz;
    }
    for (let s = 0; s < this.lastOk.length; s++) {
      this.last[s * 3] -= dx;
      this.last[s * 3 + 1] -= dy;
      this.last[s * 3 + 2] -= dz;
    }
    if (m) (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.n = 0;
    this.lastOk.fill(0);
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

/** Camera-attached rain streaks whose slant follows the rider's speed. */
export class Rain {
  readonly lines: THREE.LineSegments;
  private drops: Float32Array;
  private pos: Float32Array;
  private geo: THREE.BufferGeometry;
  private readonly box = { x: 26, y: 16, z: 40 };

  constructor(private count = 2200) {
    this.drops = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * this.box.x;
      this.drops[i * 3 + 1] = Math.random() * this.box.y;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
    }
    this.pos = new Float32Array(count * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({ color: '#b8c4d0', transparent: true, opacity: 0.32, depthWrite: false });
    this.lines = new THREE.LineSegments(this.geo, mat);
    this.lines.frustumCulled = false;
  }

  /** `vel` is the rider's world velocity; rain is simulated relative to the camera. */
  update(dt: number, center: THREE.Vector3, vel: THREE.Vector3): void {
    const fall = 9.5;
    const bx = this.box.x / 2;
    const bz = this.box.z / 2;
    // Streak direction = rain velocity relative to the moving observer.
    const rx = -vel.x * 0.035;
    const ry = -fall * 0.035 - 0.25;
    const rz = -vel.z * 0.035;
    for (let i = 0; i < this.count; i++) {
      let x = this.drops[i * 3] - vel.x * dt;
      let y = this.drops[i * 3 + 1] - fall * dt;
      let z = this.drops[i * 3 + 2] - vel.z * dt;
      if (y < -2) y += this.box.y;
      if (x < -bx) x += this.box.x;
      else if (x > bx) x -= this.box.x;
      if (z < -bz) z += this.box.z;
      else if (z > bz) z -= this.box.z;
      this.drops[i * 3] = x;
      this.drops[i * 3 + 1] = y;
      this.drops[i * 3 + 2] = z;
      const o = i * 6;
      this.pos[o] = center.x + x;
      this.pos[o + 1] = center.y + y;
      this.pos[o + 2] = center.z + z;
      this.pos[o + 3] = center.x + x + rx;
      this.pos[o + 4] = center.y + y + ry;
      this.pos[o + 5] = center.z + z + rz;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
