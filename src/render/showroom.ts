import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BikeSpec } from '../data/bikes';
import type { RiderGear } from '../data/riderGear';
import { clamp, damp, wrapAngle } from '../core/math';
import { bikeDetailFrom } from './bike/bikeSettings';
import { BikeModel } from './bikeModel';
import { Materials } from './materials';
import type { Renderer } from './renderer';
import { RiderModel } from './riderModel';

/**
 * The studio behind the menus: the selected bike on a turntable with key / rim / fill lights, a
 * graded backdrop, floor glow and drifting dust. The camera orbits (drag, wheel, pinch) and
 * eases between named views; with a rider attached it also previews the gear on the rider screen.
 */

export type ShowroomMode = 'menu' | 'garage' | 'rider';
export type ViewId = 'free' | 'side' | 'front' | 'rear' | 'cockpit' | 'engine' | 'rider' | 'helmet' | 'gloves';
export type LightLook = 'studio' | 'warm' | 'cool' | 'neon';
export type SpinSpeed = 'off' | 'slow' | 'normal';

export const VIEW_LABELS: Record<ViewId, string> = {
  free: 'Serbest',
  side: 'Yan',
  front: 'Ön',
  rear: 'Arka',
  cockpit: 'Kokpit',
  engine: 'Motor',
  rider: 'Sürücü',
  helmet: 'Kask',
  gloves: 'Eldiven',
};

interface Look {
  key: string;
  rim: string;
  fill: string;
  ring: string;
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  glow: string;
  floor: string;
}

const LOOKS: Record<LightLook, Look> = {
  studio: { key: '#ffffff', rim: '#7fb2ff', fill: '#ffb070', ring: '#ff5a1f', bgTop: '#06080d', bgMid: '#141a26', bgBottom: '#07090d', glow: '#3a5a9a', floor: '#0e1014' },
  warm: { key: '#ffe2c0', rim: '#ff9a5a', fill: '#ffcf90', ring: '#ffb020', bgTop: '#0d0806', bgMid: '#2a1a12', bgBottom: '#0a0705', glow: '#a2562a', floor: '#14100d' },
  cool: { key: '#eaf2ff', rim: '#4aa8ff', fill: '#9fd0ff', ring: '#3aa0ff', bgTop: '#04070d', bgMid: '#0f1e33', bgBottom: '#05080d', glow: '#2a6aa8', floor: '#0b1016' },
  neon: { key: '#ffe0ff', rim: '#19e0ff', fill: '#ff3fd0', ring: '#ff2fd0', bgTop: '#07040d', bgMid: '#24103a', bgBottom: '#07040a', glow: '#8a2ad0', floor: '#0e0b14' },
};

interface Cam {
  angle: number;
  pitch: number;
  dist: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
  /** 0 = orbit camera, 1 = rider's-eye cockpit camera. */
  cockpit: number;
  /** Target is expressed in the turntable's frame (follows its rotation). */
  local: number;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const SPIN: Record<SpinSpeed, number> = { off: 0, slow: 0.16, normal: 0.42 };

export class Showroom {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  private mats = new Materials();
  private bike: BikeModel | null = null;
  private rider: RiderModel | null = null;
  private riderGear: RiderGear | null = null;
  private showRider = false;
  private turntable: THREE.Mesh;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private glow: THREE.Mesh;
  private holder = new THREE.Group();
  private lights: { key: THREE.SpotLight; rim: THREE.SpotLight; fill: THREE.SpotLight; hemi: THREE.HemisphereLight };
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private floorMat: THREE.MeshPhysicalMaterial;
  private dust: THREE.Points;
  private dustSeed: Float32Array;
  private envTex: THREE.Texture;
  private time = 0;
  private rev = 0;
  private wheelSpeed = 0;
  private lean = 0;
  private look: LightLook = 'studio';

  private mode: ShowroomMode = 'menu';
  private viewId: ViewId = 'free';
  private cur: Cam;
  private tgt: Cam;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private idle = 0;
  private dragging = false;
  private spin: SpinSpeed = 'slow';
  /** Lens shift as a fraction of the viewport: where the bike sits in the free space beside the panels. */
  private layout = { x: 0, y: 0 };
  private layoutCur = { x: 0, y: 0 };
  private onView: ((v: ViewId) => void) | null = null;

  constructor(private renderer: Renderer) {
    const pm = new THREE.PMREMGenerator(renderer.renderer);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    const s = this.scene;
    s.environment = this.envTex;
    s.environmentIntensity = 0.7;
    s.background = new THREE.Color('#0b0d12');
    s.fog = new THREE.Fog('#0b0d12', 12, 34);

    // Graded backdrop dome.
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color() },
        mid: { value: new THREE.Color() },
        bottom: { value: new THREE.Color() },
        glow: { value: new THREE.Color() },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 glow; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 c = mix(bottom, mid, smoothstep(-0.15, 0.2, h));
          c = mix(c, top, smoothstep(0.15, 0.85, h));
          float back = pow(max(dot(normalize(vec3(vDir.x, vDir.y * 0.6, vDir.z)), vec3(0.0, 0.08, -1.0)), 0.0), 5.0);
          c += glow * back * 0.55;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 16), this.domeMat);
    this.dome.renderOrder = -10;
    s.add(this.dome);

    // Glossy floor, turntable, ring and accent glow.
    this.floorMat = new THREE.MeshPhysicalMaterial({ color: '#0e1014', roughness: 0.42, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.25 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(34, 64), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    this.turntable = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.75, 0.06, 64),
      new THREE.MeshPhysicalMaterial({ color: '#23262d', roughness: 0.25, metalness: 0.8, clearcoat: 1 }),
    );
    this.turntable.position.y = 0.03;
    this.turntable.receiveShadow = true;
    s.add(this.turntable);
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ff5a1f' });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.74, 0.012, 8, 96), this.ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.061;
    s.add(this.ring);
    const gc = document.createElement('canvas');
    gc.width = gc.height = 128;
    const gg = gc.getContext('2d');
    if (gg) {
      const grad = gg.createRadialGradient(64, 64, 20, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.18)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = grad;
      gg.fillRect(0, 0, 128, 128);
    }
    const glowTex = new THREE.CanvasTexture(gc);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    this.glow = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 48),
      new THREE.MeshBasicMaterial({ map: glowTex, color: '#ff5a1f', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.004;
    s.add(this.glow);
    this.holder.position.y = 0.06;
    s.add(this.holder);

    const key = new THREE.SpotLight('#ffffff', 120, 30, 0.42, 0.7, 1.4);
    key.position.set(4, 7, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0002;
    s.add(key, key.target);
    const rim = new THREE.SpotLight('#7fb2ff', 95, 30, 0.5, 0.7, 1.4);
    rim.position.set(-5, 4, -4);
    s.add(rim, rim.target);
    const fill = new THREE.SpotLight('#ffb070', 55, 30, 0.5, 0.7, 1.4);
    fill.position.set(-3, 3, 5);
    s.add(fill, fill.target);
    const hemi = new THREE.HemisphereLight('#9fb7d9', '#1a1c22', 0.35);
    s.add(hemi);
    this.lights = { key, rim, fill, hemi };
    // Light strips on the back wall for reflections.
    for (let i = 0; i < 5; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 6), new THREE.MeshBasicMaterial({ color: '#c8d6ff', fog: false }));
      strip.position.set(-6 + i * 3, 3, -9);
      s.add(strip);
    }

    // Dust motes catching the key light.
    const n = 140;
    this.dustSeed = new Float32Array(n * 4);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.dustSeed[i * 4] = Math.random() * 6.28;
      this.dustSeed[i * 4 + 1] = 1.2 + Math.random() * 5.5;
      this.dustSeed[i * 4 + 2] = Math.random() * 4;
      this.dustSeed[i * 4 + 3] = 0.02 + Math.random() * 0.05;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#dfe8ff', size: 0.028, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.dust.frustumCulled = false;
    s.add(this.dust);

    this.cur = this.viewTarget('free');
    this.tgt = { ...this.cur };
    this.cur.angle = this.tgt.angle = 0.6;
    this.applyLook('studio');
    this.updateDust(0);
  }

  // ───────────────────────────── public API ─────────────────────────────

  get view(): ViewId {
    return this.viewId;
  }

  /** Called whenever the player's drag/zoom drops the current preset (UI highlights "Serbest"). */
  onViewChange(cb: (v: ViewId) => void): void {
    this.onView = cb;
  }

  setBike(spec: BikeSpec, livery: number): void {
    if (this.bike) {
      this.rider?.root.removeFromParent();
      this.holder.remove(this.bike.root);
      this.bike.dispose();
    }
    // Garage close-ups always use LOD0 at the player's chosen detail.
    this.bike = new BikeModel(spec, livery, this.mats, { detail: bikeDetailFrom(this.renderer.settings), lod: 0 });
    this.bike.root.position.z = this.bike.frame.L / 2;
    this.bike.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.holder.add(this.bike.root);
    this.bike.updateDash(0, 1, 0, false, 'kmh');
    this.rebuildRider();
    // Views that depend on the bike's dimensions re-target.
    this.setView(this.viewId, true);
  }

  /** The gear shown on the rider (null / follow = the bike's livery colours). */
  setGear(gear: RiderGear | null): void {
    this.riderGear = gear;
    this.rebuildRider();
  }

  /** Show the rider seated on the bike (rider screen); hidden elsewhere so the bike stays unobstructed. */
  setRiderVisible(on: boolean): void {
    this.showRider = on;
    if (on && !this.rider) this.rebuildRider();
    if (this.rider) this.rider.root.visible = on;
  }

  private rebuildRider(): void {
    if (!this.bike) return;
    if (this.rider) {
      this.rider.root.removeFromParent();
      this.rider.dispose();
      this.rider = null;
    }
    if (!this.showRider) return;
    this.rider = new RiderModel(this.mats, this.bike.livery, this.bike.spec.style, this.riderGear);
    this.bike.riderMount.add(this.rider.root);
    this.rider.showBody(true);
    this.rider.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  /** Visualise a free rev from the garage "listen" button (0..1). */
  setRev(r: number): void {
    this.rev = r;
  }

  setMode(mode: ShowroomMode): void {
    this.mode = mode;
    this.setRiderVisible(mode === 'rider');
    this.setView(mode === 'rider' ? 'rider' : 'free');
    this.idle = 0;
  }

  /** Lens shift (fractions of the viewport) placing the bike in the area the panels leave free. */
  setLayout(x: number, y = 0): void {
    this.layout.x = x;
    this.layout.y = y;
  }

  setSpin(s: SpinSpeed): void {
    this.spin = s;
  }

  setLook(l: LightLook): void {
    if (l !== this.look) this.applyLook(l);
  }

  zoom(factor: number): void {
    this.tgt.dist = clamp(this.tgt.dist * factor, this.minDist(), this.maxDist());
    this.markFree();
  }

  setView(id: ViewId, silent = false): void {
    const prevAngle = this.tgt.angle;
    const t = this.viewTarget(id);
    // Free keeps the current orbit; presets pick their own angle by the shortest turn.
    if (id === 'free') {
      t.angle = prevAngle;
      t.pitch = clamp(this.tgt.pitch, 0.05, 0.9);
      t.dist = this.tgt.cockpit > 0.5 || this.tgt.dist < 3.6 ? t.dist : this.tgt.dist;
    } else t.angle = this.cur.angle + wrapAngle(t.angle - this.cur.angle);
    this.tgt = t;
    this.viewId = id;
    this.idle = 0;
    if (!silent) this.onView?.(id);
  }

  attachPointer(el: HTMLElement): () => void {
    const down = (e: PointerEvent) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragging = true;
      this.idle = 0;
      this.pinch = this.pointers.size === 2 ? this.pinchDistance() : 0;
    };
    const move = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      this.idle = 0;
      if (this.pointers.size >= 2) {
        const d = this.pinchDistance();
        if (this.pinch > 0 && d > 0) this.zoom(this.pinch / d);
        this.pinch = d;
        return;
      }
      if (this.tgt.cockpit > 0.5) return;
      this.tgt.angle += dx * 0.009;
      this.cur.angle += dx * 0.009 * 0.6;
      this.tgt.pitch = clamp(this.tgt.pitch + dy * 0.004, 0.0, 1.0);
      this.markFree();
    };
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      if (this.pointers.size === 0) this.dragging = false;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoom(Math.exp(e.deltaY * 0.0012));
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }

  // ───────────────────────────── internals ─────────────────────────────

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private markFree(): void {
    if (this.viewId === 'free') return;
    this.viewId = 'free';
    this.tgt.cockpit = 0;
    this.onView?.('free');
  }

  private minDist(): number {
    return this.tgt.local > 0.5 ? 0.55 : 2.2;
  }

  private maxDist(): number {
    return 11;
  }

  private get portrait(): boolean {
    return this.renderer.aspect < 1;
  }

  private applyLook(l: LightLook): void {
    this.look = l;
    const d = LOOKS[l];
    this.lights.key.color.set(d.key);
    this.lights.rim.color.set(d.rim);
    this.lights.fill.color.set(d.fill);
    this.ringMat.color.set(d.ring);
    (this.glow.material as THREE.MeshBasicMaterial).color.set(d.ring);
    this.domeMat.uniforms.top.value.set(d.bgTop);
    this.domeMat.uniforms.mid.value.set(d.bgMid);
    this.domeMat.uniforms.bottom.value.set(d.bgBottom);
    this.domeMat.uniforms.glow.value.set(d.glow);
    this.floorMat.color.set(d.floor);
    (this.scene.fog as THREE.Fog).color.set(d.bgBottom);
    (this.scene.background as THREE.Color).set(d.bgBottom);
  }

  /** Camera goal for a named view (bike dimensions come from the loaded model). */
  private viewTarget(id: ViewId): Cam {
    const f = this.bike?.frame;
    const L = f?.L ?? 1.45;
    // Menus frame the bike a little wider so panels beside it never cover wheels or tail.
    const k = (this.portrait ? 1.32 : 1) * (this.mode === 'menu' ? 1.14 : this.mode === 'garage' ? 1.08 : 1);
    const base: Cam = { angle: 0.6, pitch: 0.2, dist: 5.4 * k, tx: 0, ty: 0.62, tz: 0, fov: 30, cockpit: 0, local: 0 };
    switch (id) {
      case 'free':
        return base;
      case 'side':
        return { ...base, angle: -Math.PI / 2, pitch: 0.05, dist: 5.2 * k };
      case 'front':
        return { ...base, angle: Math.PI, pitch: 0.1, dist: 5.1 * k };
      case 'rear':
        return { ...base, angle: 0, pitch: 0.12, dist: 5.1 * k };
      case 'cockpit':
        return { ...base, angle: 0, cockpit: 1, fov: 74 };
      case 'engine':
        return { ...base, angle: -0.8, pitch: 0.06, dist: 2.3 * k, ty: 0.46, local: 1 };
      case 'rider':
        return { ...base, angle: 0.7, pitch: 0.08, dist: 3.6 * k, ty: 1.02, local: 1 };
      case 'helmet': {
        const e = f?.eye;
        return { ...base, angle: Math.PI * 0.82, pitch: 0.04, dist: 1.5 * k, tx: e?.x ?? 0, ty: (e?.y ?? 1.25) + 0.02, tz: (e?.z ?? 0) + L / 2 + 0.08, local: 1 };
      }
      case 'gloves': {
        const hd = f ? f.head.clone().add(f.gripOffset) : new THREE.Vector3(0.3, 0.95, -0.6);
        return { ...base, angle: Math.PI * 0.86, pitch: 0.36, dist: 1.25 * k, tx: Math.abs(hd.x) * 0.5, ty: hd.y, tz: hd.z + L / 2, local: 1 };
      }
    }
  }

  private updateDust(dt: number): void {
    const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const a = this.dustSeed[i * 4];
      const r = 1 + this.dustSeed[i * 4 + 2] * 1.6;
      this.dustSeed[i * 4 + 1] += this.dustSeed[i * 4 + 3] * dt;
      if (this.dustSeed[i * 4 + 1] > 6.5) this.dustSeed[i * 4 + 1] = 0.2;
      const aa = a + this.time * 0.03 * (1 + i * 0.002);
      p.setXYZ(i, Math.cos(aa) * r * 1.6, this.dustSeed[i * 4 + 1], Math.sin(aa) * r * 1.6 - 0.5);
    }
    p.needsUpdate = true;
  }

  update(dt: number): void {
    this.time += dt;
    this.idle += dt;
    const c = this.cur;
    const t = this.tgt;
    // Gentle auto-spin: the menu always, the garage only while the player is not interacting.
    const spin = SPIN[this.spin];
    const spinning = spin > 0 && !this.dragging && this.viewId === 'free' && (this.mode === 'menu' || this.idle > 2.5);
    if (spinning) t.angle += spin * (this.mode === 'garage' ? 0.8 : 1) * dt;
    if (this.mode === 'menu' && this.viewId === 'free') t.pitch = 0.2 + Math.sin(this.time * 0.25) * 0.025;
    const rate = this.dragging ? 16 : 5.2;
    c.angle = damp(c.angle, t.angle, rate, dt);
    c.pitch = damp(c.pitch, t.pitch, rate, dt);
    c.dist = damp(c.dist, t.dist, 6, dt);
    c.tx = damp(c.tx, t.tx, 6, dt);
    c.ty = damp(c.ty, t.ty, 6, dt);
    c.tz = damp(c.tz, t.tz, 6, dt);
    c.fov = damp(c.fov, t.fov, 6, dt);
    c.cockpit = damp(c.cockpit, t.cockpit, 5, dt);
    c.local = damp(c.local, t.local, 8, dt);
    this.layoutCur.x = damp(this.layoutCur.x, this.layout.x, 5, dt);
    this.layoutCur.y = damp(this.layoutCur.y, this.layout.y, 5, dt);

    this.holder.rotation.y = c.angle;
    this.turntable.rotation.y = c.angle;
    this.scene.environmentRotation.y = Math.sin(this.time * 0.15) * 0.35 - c.angle * 0.25;

    if (this.bike) {
      this.wheelSpeed = damp(this.wheelSpeed, 0, 2, dt);
      this.lean = damp(this.lean, 0, 3, dt);
      this.bike.update({
        lean: this.lean,
        pitch: 0,
        steer: Math.sin(this.time * 0.4) * 0.12,
        wheelSpeed: this.wheelSpeed,
        frontComp: 0,
        rearComp: -this.rev * 0.006,
        brake: 0,
        headlight: false,
        dt,
      });
      // Engine shake while revving
      this.bike.chassis.position.x = Math.sin(this.time * 90) * 0.0012 * this.rev;
      if (this.rider && this.showRider) {
        this.bike.root.updateMatrixWorld(true);
        this.rider.ride(this.bike, { speedKmh: 0, lean: 0, accel: 0, brake: 0, pitch: 0, steer: 0, shift: 0, throttle: this.rev * 0.8, dt });
      }
    }
    this.updateDust(dt);
    this.place();
  }

  /** Position the camera from the smoothed orbit parameters. */
  private place(): void {
    const c = this.cur;
    const cam = this.camera;
    const aspect = this.renderer.aspect;
    cam.aspect = aspect;
    cam.fov = c.fov;
    // Orbit target: in the turntable frame for close-ups so the camera follows the spinning bike.
    _v.set(c.tx, c.ty, c.tz);
    if (c.local > 0.001) {
      _w.copy(_v).applyAxisAngle(UP, c.angle).add(this.holder.position);
      _v.lerp(_w, c.local);
    }
    const cp = Math.cos(c.pitch);
    const orbitX = _v.x;
    const orbitY = _v.y + Math.sin(c.pitch) * c.dist;
    const orbitZ = _v.z + cp * c.dist;
    let px = orbitX;
    let py = orbitY;
    let pz = orbitZ;
    let lx = _v.x;
    let ly = _v.y;
    let lz = _v.z;
    if (c.cockpit > 0.001 && this.bike) {
      const e = this.bike.frame.eye;
      const ex = e.x;
      const ey = e.y + this.holder.position.y + 0.03;
      const ez = e.z + this.bike.frame.L / 2;
      const k = c.cockpit;
      px += (ex - px) * k;
      py += (ey - py) * k;
      pz += (ez - pz) * k;
      lx += (ex - lx) * k;
      ly += (ey - 0.28 - ly) * k;
      lz += (ez - 1.2 - lz) * k;
    }
    cam.position.set(px, py, pz);
    cam.lookAt(lx, ly, lz);
    // Lens shift: move the bike into the free part of the screen without changing perspective.
    const W = 1000;
    const Hh = Math.round(W / Math.max(0.2, aspect));
    cam.setViewOffset(W, Hh, -this.layoutCur.x * W, -this.layoutCur.y * Hh, W, Hh);
    cam.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.setBloom(0.22, 0.9, 0.4);
    this.renderer.renderer.toneMappingExposure = 1;
    // Garage bokeh: focus on the bike, blur the backdrop (strength 0 when the setting is off or in close-ups).
    const close = this.cur.local > 0.5 || this.cur.cockpit > 0.5 ? 0.35 : 1;
    this.renderer.setDepthOfField(this.camera.position.distanceTo(_v.set(this.cur.tx, this.cur.ty, this.cur.tz)), this.renderer.profile.dof === 'off' ? 0 : close);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.rider?.dispose();
    this.bike?.dispose();
    this.envTex.dispose();
    this.domeMat.dispose();
  }
}
