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

interface Spark {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
}

/** Glowing spark streaks (barrier scrapes, sliding crashes). */
export class Sparks {
  readonly lines: THREE.LineSegments;
  private sparks: Spark[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private geo: THREE.BufferGeometry;

  constructor(private capacity = 500) {
    this.pos = new Float32Array(capacity * 6);
    this.col = new Float32Array(capacity * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.lines = new THREE.LineSegments(this.geo, mat);
    this.lines.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, n: number, spread = 3): void {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= this.capacity) this.sparks.shift();
      const life = 0.25 + Math.random() * 0.55;
      this.sparks.push({
        x, y, z,
        vx: vx + (Math.random() - 0.5) * spread * 2,
        vy: vy + Math.random() * spread * 1.2,
        vz: vz + (Math.random() - 0.5) * spread * 2,
        life, max: life,
      });
    }
  }

  update(dt: number): void {
    let k = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy -= 9.81 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.02 && s.vy < 0) {
        s.vy *= -0.35;
        s.vx *= 0.7;
        s.vz *= 0.7;
      }
    }
    for (const s of this.sparks) {
      const t = s.life / s.max;
      const o = k * 6;
      this.pos[o] = s.x;
      this.pos[o + 1] = s.y;
      this.pos[o + 2] = s.z;
      this.pos[o + 3] = s.x - s.vx * 0.025;
      this.pos[o + 4] = s.y - s.vy * 0.025;
      this.pos[o + 5] = s.z - s.vz * 0.025;
      const r = 3.0 * t + 0.6;
      const g = 1.6 * t * t + 0.2;
      const b = 0.4 * t * t * t;
      this.col.set([r, g, b, r * 0.3, g * 0.2, b * 0.1], o);
      k++;
    }
    this.geo.setDrawRange(0, k * 2);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Shift all particles (origin rebasing). */
  shift(dx: number, dy: number, dz: number): void {
    for (const s of this.sparks) {
      s.x -= dx;
      s.y -= dy;
      s.z -= dz;
    }
  }

  clear(): void {
    this.sparks.length = 0;
    this.geo.setDrawRange(0, 0);
  }
}

interface Puff {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; size: number; grow: number; shade: number; alpha: number;
}

/** Soft billboard puffs: tyre smoke, road spray, crash dust. */
export class Smoke {
  readonly points: THREE.Points;
  private puffs: Puff[] = [];
  private pos: Float32Array;
  private data: Float32Array;
  private geo: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;

  constructor(private capacity = 300) {
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
    for (let i = 0; i < n; i++) {
      if (this.puffs.length >= this.capacity) this.puffs.shift();
      const life = (opts.life ?? 1.6) * (0.7 + Math.random() * 0.6);
      const sp = opts.spread ?? 0.6;
      this.puffs.push({
        x: x + (Math.random() - 0.5) * 0.2,
        y,
        z: z + (Math.random() - 0.5) * 0.2,
        vx: vx + (Math.random() - 0.5) * sp,
        vy: vy + Math.random() * sp * 0.6,
        vz: vz + (Math.random() - 0.5) * sp,
        life,
        max: life,
        size: (opts.size ?? 0.8) * (0.7 + Math.random() * 0.6),
        grow: opts.grow ?? 1.4,
        shade: opts.shade ?? 1,
        alpha: opts.alpha ?? 0.45,
      });
    }
  }

  update(dt: number): void {
    let k = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.puffs.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-2.2 * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag + 0.25 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += p.grow * dt;
    }
    for (const p of this.puffs) {
      const t = p.life / p.max;
      this.pos.set([p.x, p.y, p.z], k * 3);
      this.data.set([p.size, p.alpha * Math.min(1, t * 2) * Math.min(1, (1 - t) * 8), p.shade], k * 3);
      k++;
    }
    this.geo.setDrawRange(0, k);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.pdata as THREE.BufferAttribute).needsUpdate = true;
  }

  shift(dx: number, dy: number, dz: number): void {
    for (const p of this.puffs) {
      p.x -= dx;
      p.y -= dy;
      p.z -= dz;
    }
  }

  setViewportHeight(h: number, fovDeg: number): void {
    this.material.uniforms.scale.value = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  clear(): void {
    this.puffs.length = 0;
    this.geo.setDrawRange(0, 0);
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
