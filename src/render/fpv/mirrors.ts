import * as THREE from 'three';
import { MIRROR_PIXELS, type MirrorQuality } from '../cameraSettings';

/** The slice of the bike model the mirror rig needs (kept narrow so it can be tested without a GL context). */
export interface MirrorHost {
  mirrors: { left: THREE.Mesh | null; right: THREE.Mesh | null };
  steer: THREE.Object3D;
  chassis: THREE.Object3D;
  frame: { head: THREE.Vector3; rake: number };
}

/** What the game has to adapt around a mirror pass (point-sprite scales follow the target height). */
export interface MirrorHooks {
  before(targetHeightPx: number, fovDeg: number): void;
  after(): void;
}

interface Side {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  geometry: THREE.BufferGeometry;
  originalMaterial: THREE.Material | THREE.Material[];
  originalGeometry: THREE.BufferGeometry;
  /** Glass centre / normal in the mesh's local space. */
  center: THREE.Vector3;
  normal: THREE.Vector3;
  aspect: number;
  rt: THREE.WebGLRenderTarget | null;
}

const MIRROR_FOV = 34;
/** Upward adjustment of the reflected ray (≈ 17°): mirrors are set to show the traffic behind, not the tarmac. */
const MIRROR_TILT = 0.3;
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _v = new THREE.Vector3();
const _r = new THREE.Vector3();
const _up = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _rest = new THREE.Matrix4();
const _a = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

/**
 * Real rear view in the bike's mirrors: a small camera at each glass renders the scene backwards into a
 * render target which is sampled by the glass mesh. Cheap by design: tiny targets, one mirror per update,
 * shadow map frozen, bike mirrors hidden during the pass (no feedback loop).
 */
export class MirrorRig {
  private sides: Side[] = [];
  private readonly camera = new THREE.PerspectiveCamera(MIRROR_FOV, 2, 0.25, 320);
  private quality: MirrorQuality = 'off';
  private interval = 1 / 60;
  private timer = 0;
  private turn = 0;
  private disposed = false;
  /** Number of mirror passes rendered so far (debug / tests). */
  passes = 0;

  constructor(private host: MirrorHost) {
    for (const mesh of [host.mirrors.left, host.mirrors.right]) {
      if (mesh) this.sides.push(this.prepare(mesh));
    }
  }

  get count(): number {
    return this.sides.length;
  }

  get active(): boolean {
    return this.quality !== 'off' && this.sides.length > 0 && !this.disposed;
  }

  /** Per-mirror render target dimensions (px) for a quality level. */
  static size(quality: MirrorQuality, aspect: number): { w: number; h: number } {
    const w = MIRROR_PIXELS[quality];
    return { w, h: Math.max(8, Math.round(w / Math.max(0.5, aspect))) };
  }

  private prepare(mesh: THREE.Mesh): Side {
    const src = mesh.geometry;
    const geometry = src.clone();
    geometry.userData.shared = false;
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute;
    // Work in the bike's rest frame so "up" and "right" are the rider's.
    this.restMatrix(mesh, _rest);
    const n = new THREE.Vector3();
    for (let i = 0; i < nrm.count; i++) n.add(_a.fromBufferAttribute(nrm, i));
    n.transformDirection(_rest);
    const right = new THREE.Vector3().crossVectors(n.clone().negate(), UP);
    if (right.lengthSq() < 1e-6) right.copy(X);
    right.normalize();
    // The viewer looks along −n: right = (−n) × up_hint, up = right × (−n).
    const up = new THREE.Vector3().crossVectors(right, n.clone().negate()).normalize();
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    const center = new THREE.Vector3();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      const p = _a.fromBufferAttribute(pos, i).clone();
      center.add(p);
      const b = p.clone().applyMatrix4(_rest);
      pts.push(b);
      const u = b.dot(right);
      const v = b.dot(up);
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    center.divideScalar(Math.max(1, pos.count));
    const uv = new Float32Array(pos.count * 2);
    const du = Math.max(1e-5, u1 - u0);
    const dv = Math.max(1e-5, v1 - v0);
    for (let i = 0; i < pts.length; i++) {
      uv[i * 2] = (pts[i].dot(right) - u0) / du;
      uv[i * 2 + 1] = (pts[i].dot(up) - v0) / dv;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const normalLocal = new THREE.Vector3();
    for (let i = 0; i < nrm.count; i++) normalLocal.add(_a.fromBufferAttribute(nrm, i));
    normalLocal.normalize();
    // Slightly cool, slightly dark: real mirror glass is never a perfect reflector.
    const material = new THREE.MeshBasicMaterial({ color: '#dfe7ee', side: THREE.DoubleSide });
    return {
      mesh,
      material,
      geometry,
      originalMaterial: mesh.material,
      originalGeometry: src,
      center,
      normal: normalLocal,
      aspect: du / dv,
      rt: null,
    };
  }

  /** Group-local → bike rest frame for the mesh's parent (steer group has the rake). */
  private restMatrix(mesh: THREE.Mesh, out: THREE.Matrix4): void {
    if (mesh.parent === this.host.steer) out.compose(this.host.frame.head, _q.setFromAxisAngle(X, this.host.frame.rake), _a.set(1, 1, 1));
    else out.identity();
  }

  /** Apply quality / refresh settings: (re)creates or frees the render targets. */
  configure(quality: MirrorQuality, hz: number): void {
    if (this.disposed) return;
    this.interval = hz >= 60 ? 0 : 1 / (2 * Math.max(1, hz));
    if (quality === this.quality) return;
    this.quality = quality;
    for (const s of this.sides) {
      s.rt?.dispose();
      s.rt = null;
      if (quality === 'off') {
        s.mesh.material = s.originalMaterial;
        s.mesh.geometry = s.originalGeometry;
        continue;
      }
      const { w, h } = MirrorRig.size(quality, s.aspect);
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
      rt.texture.wrapS = THREE.RepeatWrapping;
      // A mirror shows the reverse of what a camera looking back would record.
      rt.texture.repeat.x = -1;
      rt.texture.offset.x = 1;
      s.rt = rt;
      s.material.map = rt.texture;
      s.material.needsUpdate = true;
      s.mesh.geometry = s.geometry;
      s.mesh.material = s.material;
    }
  }

  /**
   * Render the mirrors that are due. Call once per frame before the main pass, with the rider's eye in
   * world space. `dt` in real seconds; `skip` suppresses the work (looking back, crash cameras).
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, eye: THREE.Vector3, dt: number, hooks: MirrorHooks | null, skip = false): void {
    if (!this.active || skip) return;
    this.timer += dt;
    let n: number;
    if (this.interval === 0) n = this.sides.length;
    else if (this.timer >= this.interval) {
      this.timer = Math.min(this.timer - this.interval, this.interval);
      n = 1;
    } else return;
    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    for (const s of this.sides) s.mesh.visible = false;
    for (let k = 0; k < n; k++) {
      const s = this.sides[this.turn % this.sides.length];
      this.turn++;
      if (!s.rt) continue;
      this.point(s, eye);
      hooks?.before(s.rt.height, MIRROR_FOV);
      renderer.setRenderTarget(s.rt);
      renderer.render(scene, this.camera);
      hooks?.after();
      this.passes++;
    }
    for (const s of this.sides) s.mesh.visible = true;
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.setRenderTarget(prevTarget);
  }

  /** Aim the mirror camera: the eye → glass ray reflected about the glass normal. */
  private point(s: Side, eye: THREE.Vector3): void {
    const mesh = s.mesh;
    mesh.updateWorldMatrix(true, false);
    _p.copy(s.center).applyMatrix4(mesh.matrixWorld);
    _n.copy(s.normal).transformDirection(mesh.matrixWorld);
    _v.copy(_p).sub(eye).normalize();
    // Reflect (keeping a minimum back-facing component so a badly aimed glass still shows the road behind).
    _r.copy(_v).addScaledVector(_n, -2 * _v.dot(_n));
    if (!Number.isFinite(_r.x + _r.y + _r.z)) _r.set(0, 0, 1);
    // A rider tilts the glass up until the horizon sits in it; the raw reflection from a high eye points at the road.
    _r.y += MIRROR_TILT;
    _r.normalize();
    this.camera.aspect = s.aspect;
    this.camera.position.copy(_p).addScaledVector(_n, 0.015);
    // The mirror's up follows the bike's roll (the image tilts with the glass).
    this.host.chassis.updateWorldMatrix(true, false);
    _up.copy(UP).transformDirection(this.host.chassis.matrixWorld);
    _m.lookAt(_a.set(0, 0, 0), _r, _up);
    this.camera.quaternion.setFromRotationMatrix(_m);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  /** Resolution actually in use for a side (debug). */
  targetSize(i: number): { w: number; h: number } | null {
    const rt = this.sides[i]?.rt;
    return rt ? { w: rt.width, h: rt.height } : null;
  }

  dispose(): void {
    if (this.disposed) return;
    for (const s of this.sides) {
      s.rt?.dispose();
      s.rt = null;
      s.mesh.material = s.originalMaterial;
      s.mesh.geometry = s.originalGeometry;
      s.mesh.visible = true;
      s.material.dispose();
      s.geometry.dispose();
    }
    this.disposed = true;
  }
}
