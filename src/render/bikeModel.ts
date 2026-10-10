import * as THREE from 'three';
import type { BikeLook, BikeSpec, Livery } from '../data/bikes';
import { clamp, smoothstep } from '../core/math';
import { acquireBike, buildMaterial, INSTANCE_SLOTS, releaseBike, type BikeBuild } from './bike/assemble';
import { DashRenderer } from './bike/dash';
import type { BikeDetail, BikeLod } from './bike/quality';
import { GROUPS, type GroupName, type Slot } from './bike/sink';
import type { BikeBlueprint } from './bike/types';
import { bikeEmitterMaterial, bikeMirrorMaterial, type Materials } from './materials';

/** Animation inputs for the visual bike. */
export interface BikeVisualState {
  lean: number;
  pitch: number;
  steer: number;
  /** Wheel angular velocity (rad/s). */
  wheelSpeed: number;
  /** Front/rear suspension compression (m, + = compressed). */
  frontComp: number;
  rearComp: number;
  brake: number;
  headlight: boolean;
  dt: number;
}

/** Chassis geometry exposed to the rider, camera and effects (bike space, rest pose). */
export interface BikeFrame {
  L: number;
  Rf: number;
  Rr: number;
  rake: number;
  forkLen: number;
  /** Fork offset (steering axis → fork tubes). */
  offset: number;
  /** Steering axis point level with the top of the fork tubes. */
  head: THREE.Vector3;
  pivot: THREE.Vector3;
  seatY: number;
  seatFront: number;
  seatBack: number;
  hip: THREE.Vector3;
  /** Right grip relative to `head`. */
  gripOffset: THREE.Vector3;
  peg: THREE.Vector3;
  torsoPitch: number;
}

export interface BikeModelOptions {
  headlightSpot?: boolean;
  /** Geometry/texture detail (gfx.bikeDetail). */
  detail?: BikeDetail;
  /** 0 = close-ups / cockpit, 1 = distance / crash cinematics. */
  lod?: BikeLod;
}

export interface BikeStats {
  triangles: number;
  drawCalls: number;
  buildMs: number;
}

/** No shadows from see-through / emissive / overlay slots. */
const NO_SHADOW: ReadonlySet<Slot> = new Set<Slot>(['lens', 'screen', 'decal', 'dash', 'blur', 'head', 'drl', 'tail', 'indicator', 'mirrorL', 'mirrorR']);

/**
 * Procedurally built, animatable 3D motorcycle (facade over the bike kit in
 * render/bike/: blueprint → hardpoints → part generators → merged geometry).
 */
export class BikeModel {
  readonly root = new THREE.Group();
  readonly leanPivot = new THREE.Group();
  private leanInner = new THREE.Group();
  readonly pitchGroup = new THREE.Group();
  readonly chassis = new THREE.Group();
  private steerAxis = new THREE.Group();
  readonly steer = new THREE.Group();
  private forkLower = new THREE.Group();
  private frontWheel = new THREE.Group();
  private frontSpokes = new THREE.Group();
  private rearWheel = new THREE.Group();
  private rearSpokes = new THREE.Group();
  private swingarm = new THREE.Group();
  private groups: Record<GroupName, THREE.Group>;
  private meshes: THREE.Mesh[] = [];
  private blurMats: THREE.MeshStandardMaterial[] = [];
  /** Hand targets (children of the steering group). */
  readonly gripL = new THREE.Object3D();
  readonly gripR = new THREE.Object3D();
  /** Foot peg targets (children of the chassis). */
  readonly pegL = new THREE.Object3D();
  readonly pegR = new THREE.Object3D();
  readonly hipAnchor = new THREE.Object3D();
  /** Rider mount point. */
  readonly riderMount = new THREE.Group();
  readonly frame: BikeFrame;
  readonly tailLight: THREE.MeshStandardMaterial;
  readonly headLight: THREE.MeshStandardMaterial;
  readonly drl: THREE.MeshStandardMaterial;
  readonly indicatorLight: THREE.MeshStandardMaterial;
  readonly dashCanvas: HTMLCanvasElement;
  readonly dashTexture: THREE.Texture;
  /** Mirror glass meshes (own material slots) for later render-to-texture reflections. */
  readonly mirrors: { left: THREE.Mesh | null; right: THREE.Mesh | null } = { left: null, right: null };
  readonly look: BikeLook;
  readonly livery: Livery;
  readonly blueprint: BikeBlueprint;
  readonly stats: BikeStats = { triangles: 0, drawCalls: 0, buildMs: 0 };
  private build: BikeBuild;
  private dash: DashRenderer;
  private dashMat: THREE.MeshBasicMaterial;
  private mirrorMat: THREE.MeshStandardMaterial;
  private swingRest: number;
  private spin = 0;
  private headSpot: THREE.SpotLight | null = null;
  private detail: BikeDetail;
  private lodLevel: BikeLod;
  private disposed = false;

  constructor(
    readonly spec: BikeSpec,
    liveryIndex: number,
    _mats: Materials,
    opts: BikeModelOptions = {},
  ) {
    this.look = spec.look;
    this.detail = opts.detail ?? 'high';
    this.lodLevel = opts.lod ?? 0;
    const idx = clamp(Math.floor(liveryIndex) || 0, 0, spec.liveries.length - 1);
    this.livery = spec.liveries[idx];
    this.build = acquireBike(spec, idx, this.detail, this.lodLevel);
    this.blueprint = this.build.bp;
    const hp = this.build.hp;
    this.frame = {
      L: hp.L,
      Rf: hp.Rf,
      Rr: hp.Rr,
      rake: hp.rake,
      forkLen: hp.forkLen,
      offset: hp.offset,
      head: new THREE.Vector3(...hp.head),
      pivot: new THREE.Vector3(...hp.pivot),
      seatY: hp.seatY,
      seatFront: hp.seatFront,
      seatBack: hp.seatBack,
      hip: new THREE.Vector3(...hp.hip),
      gripOffset: new THREE.Vector3(...hp.grip).sub(new THREE.Vector3(...hp.head)),
      peg: new THREE.Vector3(...hp.peg),
      torsoPitch: hp.torsoPitch,
    };
    this.tailLight = bikeEmitterMaterial('#ff1a12', 1.2);
    this.headLight = bikeEmitterMaterial('#fff6e8', 2.2);
    this.drl = bikeEmitterMaterial('#e8f2ff', 3);
    this.indicatorLight = bikeEmitterMaterial('#ff9a1a', 0.35);
    this.mirrorMat = bikeMirrorMaterial();
    const c = this.blueprint.cockpit;
    const px = this.build.q.tex >= 1024 ? 512 : this.build.q.tex >= 512 ? 384 : 256;
    this.dash = new DashRenderer(c.dash, px, c.dashSize[0] / c.dashSize[1], spec.brand);
    this.dashCanvas = this.dash.canvas;
    this.dashTexture = this.dash.texture;
    this.dashMat = new THREE.MeshBasicMaterial({ map: this.dash.texture, toneMapped: false });

    // Hierarchy: root → leanPivot (tyre crown) → leanInner → pitch (rear contact) → chassis / rear wheel.
    const crown = hp.rear.width / 2;
    this.leanPivot.position.y = crown;
    this.leanInner.position.y = -crown;
    this.root.add(this.leanPivot);
    this.leanPivot.add(this.leanInner);
    this.leanInner.add(this.pitchGroup);
    this.pitchGroup.add(this.chassis, this.rearWheel);
    const f = this.frame;
    this.steerAxis.position.copy(f.head);
    this.steerAxis.rotation.x = f.rake;
    this.chassis.add(this.steerAxis);
    this.steerAxis.add(this.steer);
    this.steer.add(this.forkLower);
    this.forkLower.position.y = -f.forkLen;
    this.forkLower.add(this.frontWheel);
    this.frontWheel.position.z = -f.offset;
    this.frontWheel.add(this.frontSpokes);
    this.rearWheel.position.set(0, f.Rr, 0);
    this.rearWheel.add(this.rearSpokes);
    this.swingarm.position.copy(f.pivot);
    this.chassis.add(this.swingarm);
    this.swingRest = Math.atan2(f.Rr - f.pivot.y, 0 - f.pivot.z);
    this.groups = {
      chassis: this.chassis,
      steer: this.steer,
      forkLower: this.forkLower,
      frontWheel: this.frontWheel,
      frontSpokes: this.frontSpokes,
      rearWheel: this.rearWheel,
      rearSpokes: this.rearSpokes,
      swingarm: this.swingarm,
    };
    this.attachMeshes();

    // Anchors for the rider.
    this.hipAnchor.position.copy(f.hip);
    this.chassis.add(this.hipAnchor, this.riderMount, this.pegL, this.pegR);
    this.pegL.position.set(-Math.abs(f.peg.x), f.peg.y, f.peg.z);
    this.pegR.position.set(Math.abs(f.peg.x), f.peg.y, f.peg.z);
    const g = new THREE.Vector3(...hp.grip);
    this.gripR.position.copy(this.toSteerLocal(new THREE.Vector3(Math.abs(g.x), g.y, g.z)));
    this.gripL.position.copy(this.toSteerLocal(new THREE.Vector3(-Math.abs(g.x), g.y, g.z)));
    this.steer.add(this.gripL, this.gripR);

    if (opts.headlightSpot) {
      const spot = new THREE.SpotLight('#fff1dc', 60, 120, 0.42, 0.55, 1.6);
      spot.position.set(0, 0.9, -f.L - 0.1);
      spot.target.position.set(0, 0, -f.L - 30);
      spot.castShadow = false;
      this.chassis.add(spot, spot.target);
      this.headSpot = spot;
      spot.visible = false;
    }
    this.updateDash(0, 1, 0, false, 'kmh');
  }

  /** Bike-space point → steering-group local coordinates. */
  private toSteerLocal(p: THREE.Vector3): THREE.Vector3 {
    const f = this.frame;
    const local = p.clone().sub(f.head);
    local.applyAxisAngle(new THREE.Vector3(1, 0, 0), -f.rake);
    return local;
  }

  private instanceMaterial(group: GroupName, slot: Slot): THREE.Material {
    switch (slot) {
      case 'head':
        return this.headLight;
      case 'drl':
        return this.drl;
      case 'tail':
        return this.tailLight;
      case 'indicator':
        return this.indicatorLight;
      case 'dash':
        return this.dashMat;
      case 'mirrorL':
      case 'mirrorR':
        return this.mirrorMat;
      default: {
        // Motion-blur disc per wheel (opacity animated with wheel speed).
        const m = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0, roughness: 0.4, metalness: 0.6, depthWrite: false });
        m.userData.wheel = group;
        this.blurMats.push(m);
        return m;
      }
    }
  }

  private attachMeshes(): void {
    const b = this.build;
    let tris = 0;
    let calls = 0;
    for (const g of GROUPS) {
      const slots = b.geoms.get(g);
      if (!slots) continue;
      for (const [slot, geo] of slots) {
        const mat = INSTANCE_SLOTS.has(slot) ? this.instanceMaterial(g, slot) : buildMaterial(b, g, slot);
        if (!mat) continue;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `${g}:${slot}`;
        mesh.castShadow = !NO_SHADOW.has(slot);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        if (slot === 'blur') mesh.visible = false;
        if (slot === 'screen' || slot === 'lens') mesh.renderOrder = 2;
        if (slot === 'mirrorL') this.mirrors.left = mesh;
        if (slot === 'mirrorR') this.mirrors.right = mesh;
        this.groups[g].add(mesh);
        this.meshes.push(mesh);
        tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
        calls++;
      }
    }
    this.stats.triangles = tris;
    this.stats.drawCalls = calls;
    this.stats.buildMs = b.stats.buildMs;
  }

  private detachMeshes(): void {
    for (const m of this.meshes) m.removeFromParent();
    this.meshes = [];
    for (const m of this.blurMats) m.dispose();
    this.blurMats = [];
    this.mirrors.left = this.mirrors.right = null;
  }

  get lod(): BikeLod {
    return this.lodLevel;
  }

  /** Swap to another level of detail (geometry comes from the shared cache). */
  setLod(lod: BikeLod): void {
    if (lod === this.lodLevel || this.disposed) return;
    const next = acquireBike(this.spec, this.build.liveryIndex, this.detail, lod);
    this.detachMeshes();
    releaseBike(this.build);
    this.build = next;
    this.lodLevel = lod;
    this.attachMeshes();
  }

  // ───────────────────────────── animation ─────────────────────────────

  update(s: BikeVisualState): void {
    const f = this.frame;
    this.leanPivot.rotation.z = -s.lean;
    this.pitchGroup.rotation.x = s.pitch;
    // Sprung mass: sag + dive from the suspension compressions.
    const dive = Math.atan2(s.frontComp - s.rearComp, f.L);
    this.chassis.position.y = -s.rearComp;
    this.chassis.rotation.x = -dive;
    this.chassis.updateMatrix();
    // Front: keep the axle on the ground by sliding the fork lowers along the steering axis.
    const inv = _m.copy(this.chassis.matrix).invert();
    const frontAxle = _a.set(0, f.Rf, -f.L).applyMatrix4(inv);
    _u.set(0, Math.cos(f.rake), Math.sin(f.rake));
    const ell = _b.copy(f.head).sub(frontAxle).dot(_u);
    this.forkLower.position.y = -clamp(ell, f.forkLen - 0.14, f.forkLen + 0.02);
    // Swingarm points at the rear axle.
    const rearAxle = _a.set(0, f.Rr, 0).applyMatrix4(inv).sub(f.pivot);
    this.swingarm.rotation.x = Math.atan2(rearAxle.y, rearAxle.z) - this.swingRest;
    this.steer.rotation.y = -s.steer;
    // Wheel spin & motion blur.
    this.spin -= s.wheelSpeed * s.dt;
    this.spin %= Math.PI * 2;
    this.frontWheel.rotation.x = this.spin * (f.Rr / f.Rf);
    this.rearWheel.rotation.x = this.spin;
    const blur = smoothstep(25, 60, Math.abs(s.wheelSpeed));
    for (const m of this.meshes) if (m.name.endsWith(':blur')) m.visible = blur > 0.01;
    for (const m of this.blurMats) m.opacity = blur * 0.85;
    this.frontSpokes.visible = this.rearSpokes.visible = blur < 0.97;
    // Lights
    this.tailLight.emissiveIntensity = 1.2 + s.brake * 7;
    this.headLight.emissiveIntensity = s.headlight ? 6 : 1.6;
    if (this.headSpot) this.headSpot.visible = s.headlight;
  }

  /** Redraw the instrument panel. */
  updateDash(rpmFrac: number, gear: number, speed: number, shiftLight: boolean, units: 'kmh' | 'mph'): void {
    this.dash.draw({ rpmFrac, gear, speed, shift: shiftLight, units });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachMeshes();
    releaseBike(this.build);
    this.dash.dispose();
    this.dashMat.dispose();
    this.mirrorMat.dispose();
    this.tailLight.dispose();
    this.headLight.dispose();
    this.drl.dispose();
    this.indicatorLight.dispose();
  }
}

const _m = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _u = new THREE.Vector3();
