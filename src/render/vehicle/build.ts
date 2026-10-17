import * as THREE from 'three';
import { VEHICLES, type VehicleArchetype, type VehicleKind } from '../../data/vehicles';
import { LAMP, Mesher, mat, type PartOpts } from './kit';

/** One wheel position of a vehicle (vehicle space: +Y up, −Z forward, origin at the centre of length on the ground). */
export interface WheelDef {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Tyre width (m). */
  w: number;
  /** Front axle of a steered pair. */
  steer: boolean;
  type: 'car' | 'truck';
}

export interface LodGeometry {
  paint?: THREE.BufferGeometry;
  detail?: THREE.BufferGeometry;
  glass?: THREE.BufferGeometry;
  lamp?: THREE.BufferGeometry;
  tris: number;
}

export interface PlateDef {
  x: number;
  y: number;
  z: number;
  /** Facing: −1 looks forward (front plate), +1 looks backwards (rear plate). */
  face: -1 | 1;
  w: number;
  h: number;
  /** Plate tilt about x (rad). */
  tilt: number;
}

/** Everything the renderer needs to draw one vehicle model. */
export interface VehicleGeometrySet {
  kind: VehicleKind;
  /** LOD0 = full detail, LOD1 = far impostor (no interior, glass as dark panels). */
  lod: [LodGeometry, LodGeometry];
  wheels: WheelDef[];
  plates: PlateDef[];
  /** Light positions (vehicle space) for glow sprites and projected beams. */
  headGlow: THREE.Vector3[];
  tailGlow: THREE.Vector3[];
  indicatorGlowL: THREE.Vector3[];
  indicatorGlowR: THREE.Vector3[];
  beaconGlow: THREE.Vector3[];
  /** Does the model carry a beacon light bar (police, ambulance, work truck)? */
  hasBeacon: boolean;
}

/** Build context: collects each slot's triangles and the light anchor points. */
export class Build {
  readonly paint = new Mesher({ color: false, pbr: false, ch: false });
  readonly detail = new Mesher({ color: true, pbr: true, ch: false });
  readonly glassM = new Mesher({ color: false, pbr: false, ch: false });
  readonly lamp = new Mesher({ color: true, pbr: false, ch: true });
  readonly arch: VehicleArchetype;
  readonly L: number;
  readonly W: number;
  readonly H: number;
  readonly hl: number;
  readonly set: VehicleGeometrySet;
  /** Tessellation scale (1 at LOD0). */
  readonly q: number;

  constructor(
    readonly kind: VehicleKind,
    readonly lod: 0 | 1,
    set?: VehicleGeometrySet,
  ) {
    this.arch = VEHICLES[kind];
    this.L = this.arch.length;
    this.W = this.arch.width;
    this.H = this.arch.height;
    this.hl = this.L / 2;
    this.q = lod === 0 ? 1 : 0.4;
    this.set =
      set ??
      ({
        kind,
        lod: [{ tris: 0 }, { tris: 0 }],
        wheels: [],
        plates: [],
        headGlow: [],
        tailGlow: [],
        indicatorGlowL: [],
        indicatorGlowR: [],
        beaconGlow: [],
        hasBeacon: false,
      } satisfies VehicleGeometrySet);
  }

  /** Segment count scaled for the LOD (never below `min`). */
  seg(n: number, min = 6): number {
    return Math.max(min, Math.round(n * this.q));
  }

  private mir = false;
  private static readonly MM = new THREE.Matrix4().makeScale(-1, 1, 1);

  /** Is the symmetric pass currently building the left (mirrored) side? */
  get mirrored(): boolean {
    return this.mir;
  }

  private tf(m?: THREE.Matrix4): THREE.Matrix4 | undefined {
    if (!this.mir) return m;
    const out = new THREE.Matrix4().copy(Build.MM);
    return m ? out.multiply(m) : out;
  }

  /**
   * Build a part for the right (+x) side and get its mirror image on the left: `fn` runs twice, the
   * second time with every geometry, lamp channel and light anchor mirrored across x.
   */
  sym(fn: () => void): void {
    this.mir = false;
    fn();
    this.mir = true;
    fn();
    this.mir = false;
  }

  /** Light anchor point (right side coordinates inside `sym`). */
  anchor(kind: 'head' | 'tail' | 'ind' | 'beacon', v: THREE.Vector3): void {
    const p = this.mir ? new THREE.Vector3(-v.x, v.y, v.z) : v;
    const set = this.set;
    if (kind === 'head') set.headGlow.push(p);
    else if (kind === 'tail') set.tailGlow.push(p);
    else if (kind === 'beacon') set.beaconGlow.push(p);
    else (this.mir ? set.indicatorGlowL : set.indicatorGlowR).push(p);
  }

  /** Body-coloured surface. */
  P(g: THREE.BufferGeometry, m?: THREE.Matrix4): void {
    this.paint.add(g, this.tf(m));
  }

  /** Coloured trim / metal / rubber / interior. */
  D(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4, metal = 0, rough = 0.6, flip = false): void {
    const o: PartOpts = { color, metal, rough, flip };
    this.detail.add(g, this.tf(m), o);
  }

  /** Glass (see-through at LOD0, dark reflective panel at LOD1). */
  G(g: THREE.BufferGeometry, m?: THREE.Matrix4): void {
    if (this.lod === 0) this.glassM.add(g, this.tf(m));
    else this.detail.add(g, this.tf(m), { color: '#0b1118', metal: 0.5, rough: 0.08 });
  }

  /** Emissive lens on lamp channel `ch` (indicator sides swap in the mirrored pass). */
  L2(g: THREE.BufferGeometry, ch: number, color: THREE.ColorRepresentation, m?: THREE.Matrix4): void {
    const c = this.mir ? (ch === LAMP.indR ? LAMP.indL : ch === LAMP.indL ? LAMP.indR : ch) : ch;
    this.lamp.add(g, this.tf(m), { color, ch: c });
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, metal = 0, rough = 0.6, ry = 0, rx = 0, rz = 0): void {
    this.D(new THREE.BoxGeometry(w, h, d), color, mat(x, y, z, rx, ry, rz), metal, rough);
  }

  finish(): LodGeometry {
    const out: LodGeometry = { paint: this.paint.build(), detail: this.detail.build(), glass: this.glassM.build(), lamp: this.lamp.build(), tris: 0 };
    out.tris = this.paint.tris + this.detail.tris + this.glassM.tris + this.lamp.tris;
    return out;
  }
}
