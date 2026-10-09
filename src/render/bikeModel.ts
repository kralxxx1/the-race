import * as THREE from 'three';
import type { BikeLook, BikeSpec, Livery } from '../data/bikes';
import { FIRING_ANGLES } from '../data/bikes';
import { clamp, lerp, smoothstep } from '../core/math';
import { PartBuilder, V, fenderArc, latheX, profileExtrude, rod, roundedBox, splitTriangles, superLoft, tube, type LoftStation } from './geom';
import type { Materials } from './materials';
import { decalTexture, plateTexture } from './textures';

type Pt = readonly [number, number];

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

interface Frame {
  L: number;
  Rf: number;
  Rr: number;
  rake: number;
  forkLen: number;
  head: THREE.Vector3;
  pivot: THREE.Vector3;
  seatY: number;
  seatFront: number;
  seatBack: number;
  hip: THREE.Vector3;
  gripOffset: THREE.Vector3;
  peg: THREE.Vector3;
  torsoPitch: number;
}

const FORK_LEN: Record<string, number> = {
  sport: 0.72, hyper: 0.73, naked: 0.74, adventure: 0.9, touring: 0.78, cruiser: 0.84, classic: 0.7, scooter: 0.6,
};
const SWING_LEN: Record<string, number> = {
  sport: 0.58, hyper: 0.6, naked: 0.58, adventure: 0.62, touring: 0.6, cruiser: 0.64, classic: 0.5, scooter: 0.42,
};

/** Procedurally built, animatable 3D motorcycle. */
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
  private rearWheel = new THREE.Group();
  private swingarm = new THREE.Group();
  private wheelBlur: THREE.Mesh[] = [];
  private spokes: THREE.Object3D[] = [];
  /** Hand targets (children of the steering group). */
  readonly gripL = new THREE.Object3D();
  readonly gripR = new THREE.Object3D();
  /** Foot peg targets (children of the chassis). */
  readonly pegL = new THREE.Object3D();
  readonly pegR = new THREE.Object3D();
  readonly hipAnchor = new THREE.Object3D();
  /** Rider mount point. */
  readonly riderMount = new THREE.Group();
  readonly frame: Frame;
  readonly tailLight: THREE.MeshStandardMaterial;
  readonly headLight: THREE.MeshStandardMaterial;
  readonly drl: THREE.MeshStandardMaterial;
  readonly dashCanvas: HTMLCanvasElement;
  readonly dashTexture: THREE.CanvasTexture;
  private dashCtx: CanvasRenderingContext2D;
  private swingRest: number;
  private spin = 0;
  private headSpot: THREE.SpotLight | null = null;
  readonly look: BikeLook;
  readonly livery: Livery;

  constructor(
    readonly spec: BikeSpec,
    liveryIndex: number,
    private mats: Materials,
    opts: { headlightSpot?: boolean } = {},
  ) {
    this.look = spec.look;
    this.livery = spec.liveries[clamp(liveryIndex, 0, spec.liveries.length - 1)];
    this.frame = this.computeFrame();
    this.tailLight = mats.makeLight('#ff1a12', 1.2);
    this.headLight = mats.makeLight('#fff6e8', 2.2);
    this.drl = mats.makeLight('#e8f2ff', 3);
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 256;
    this.dashCanvas.height = 128;
    this.dashCtx = this.dashCanvas.getContext('2d')!;
    this.dashTexture = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTexture.colorSpace = THREE.SRGBColorSpace;

    // Hierarchy: root → leanPivot (tyre crown) → leanInner → pitch (rear contact) → chassis / wheels.
    const tyreR = this.look.rearTireW / 2;
    this.leanPivot.position.y = tyreR;
    this.leanInner.position.y = -tyreR;
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
    this.rearWheel.position.set(0, f.Rr, 0);
    this.swingarm.position.copy(f.pivot);
    this.chassis.add(this.swingarm);
    const toAxle = new THREE.Vector3(0, f.Rr, 0).sub(f.pivot);
    this.swingRest = Math.atan2(toAxle.y, toAxle.z);

    this.build();

    // Anchors for the rider.
    this.hipAnchor.position.copy(f.hip);
    this.chassis.add(this.hipAnchor, this.riderMount, this.pegL, this.pegR);
    this.pegL.position.set(-f.peg.x, f.peg.y, f.peg.z);
    this.pegR.position.set(f.peg.x, f.peg.y, f.peg.z);
    const gl = this.toSteerLocal(f.head.clone().add(new THREE.Vector3(-f.gripOffset.x, f.gripOffset.y, f.gripOffset.z)));
    const gr = this.toSteerLocal(f.head.clone().add(f.gripOffset));
    this.gripL.position.copy(gl);
    this.gripR.position.copy(gr);
    this.steer.add(this.gripL, this.gripR);

    if (opts.headlightSpot) {
      const spot = new THREE.SpotLight('#fff1dc', 60, 120, 0.42, 0.55, 1.6);
      spot.position.set(0, 0.9, -L_FRONT(f));
      spot.target.position.set(0, 0, -L_FRONT(f) - 30);
      spot.castShadow = false;
      this.chassis.add(spot, spot.target);
      this.headSpot = spot;
      spot.visible = false;
    }

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
      }
    });
    this.updateDash(0, 1, 0, false, 'kmh');
  }

  /** Bike-space point → steering-group local coordinates. */
  private toSteerLocal(p: THREE.Vector3): THREE.Vector3 {
    const f = this.frame;
    const local = p.clone().sub(f.head);
    local.applyAxisAngle(new THREE.Vector3(1, 0, 0), -f.rake);
    return local;
  }

  private computeFrame(): Frame {
    const k = this.look;
    const style = this.spec.style;
    const L = k.wheelbase;
    const Rf = k.frontWheelR;
    const Rr = k.rearWheelR;
    const forkLen = FORK_LEN[style];
    const head = new THREE.Vector3(0, Rf + Math.cos(k.rake) * forkLen, -L + Math.sin(k.rake) * forkLen);
    const pivot = new THREE.Vector3(0, Rr + 0.1, -SWING_LEN[style]);
    const seatY = k.seatH;
    const seatFront = head.z + (style === 'cruiser' ? 0.62 : style === 'scooter' ? 0.62 : 0.5);
    const seatBack = seatFront + (style === 'touring' || style === 'cruiser' ? 0.55 : style === 'scooter' ? 0.62 : 0.45);
    const hipZ = seatFront + (style === 'sport' || style === 'hyper' ? 0.2 : 0.17);
    const hip = new THREE.Vector3(0, seatY + 0.09, hipZ);
    const grip: Record<string, [number, number, number]> = {
      sport: [0.34, -0.04, 0.12],
      hyper: [0.34, -0.03, 0.13],
      naked: [0.38, 0.11, 0.14],
      adventure: [0.42, 0.14, 0.12],
      touring: [0.38, 0.08, 0.26],
      cruiser: [0.42, 0.2, 0.3],
      classic: [0.38, 0.1, 0.16],
      scooter: [0.35, 0.1, 0.14],
    };
    let g = grip[style];
    if (k.handlebar === 'clipon') g = [0.34, -0.04, 0.12];
    if (k.handlebar === 'wide' && (style === 'touring' || style === 'cruiser')) g = [0.4, 0.12, 0.24];
    const peg: Record<string, [number, number, number]> = {
      sport: [0.19, 0.4, hipZ + 0.02],
      hyper: [0.19, 0.39, hipZ + 0.02],
      naked: [0.19, 0.36, hipZ - 0.02],
      adventure: [0.2, 0.36, hipZ - 0.06],
      touring: [0.24, 0.32, hipZ - 0.14],
      cruiser: [0.3, 0.32, head.z + 0.18],
      classic: [0.2, 0.32, hipZ - 0.12],
      scooter: [0.16, 0.28, hipZ - 0.42],
    };
    const torso: Record<string, number> = {
      sport: 0.82, hyper: 0.78, naked: 0.42, adventure: 0.26, touring: 0.18, cruiser: -0.06, classic: 0.3, scooter: 0.12,
    };
    return {
      L, Rf, Rr, rake: k.rake, forkLen, head, pivot, seatY, seatFront, seatBack, hip,
      gripOffset: new THREE.Vector3(...g),
      peg: new THREE.Vector3(...peg[style]),
      torsoPitch: torso[style],
    };
  }

  // ───────────────────────────── construction ─────────────────────────────

  private build(): void {
    const chassis = new PartBuilder();
    const steer = new PartBuilder();
    const lower = new PartBuilder();
    const swing = new PartBuilder();
    const m = this.mats;
    const lv = this.livery;
    const f = this.frame;
    const k = this.look;
    const style = this.spec.style;
    const ex = new Set(k.extras);
    const paint = lv.pattern === 'chrome' ? m.mirrorPaint(lv.primary) : m.paint(lv.primary);
    const paint2 = m.paint(lv.secondary);
    const accent = m.paint(lv.accent, 0.2);
    const frameMat = ex.has('trellis') ? m.paint(lv.frame, 0.6) : m.metal(lv.frame === '#1b1c1f' ? '#8d939b' : lv.frame, 0.35);
    const black = m.plastic('#111214');
    const engineMat = ex.has('chromeEngine') ? m.chrome() : m.metal('#2a2c30', 0.5);
    const engineFin = ex.has('chromeEngine') ? m.metal('#cfd3d8', 0.2) : m.metal('#4a4d52', 0.45);

    this.buildEngine(chassis, engineMat, engineFin, black);
    this.buildFrame(chassis, frameMat, black, ex);
    this.buildBodywork(chassis, steer, paint, paint2, accent, black, ex);
    this.buildSeatAndTail(chassis, paint, paint2, accent, black);
    this.buildExhaust(chassis);
    this.buildFront(steer, lower, black, paint, accent);
    this.buildSwingarm(swing, black, ex);
    this.buildLights(chassis, steer, black);
    this.buildDash(chassis, steer);

    const wheelColor = m.paint(lv.wheel, 0.5);
    this.frontWheel.add(this.buildWheel(f.Rf, k.frontTireW, k.wheel, wheelColor, true));
    this.rearWheel.add(this.buildWheel(f.Rr, k.rearTireW, k.wheel === 'spoke' && style === 'adventure' ? 'spoke' : k.wheel, wheelColor, false));

    // Rear caliper (non-spinning) attached to the pitch frame near the axle.
    const rc = new PartBuilder();
    rc.place(roundedBox(0.05, 0.07, 0.035, 0.01), m.paint('#b3121b', 0.3), [0.1, f.Rr + 0.09, 0.06]);
    this.pitchGroup.add(rc.build());

    this.chassis.add(chassis.build());
    this.steer.add(steer.build());
    this.forkLower.add(lower.build());
    this.swingarm.add(swing.build());
  }

  private buildEngine(b: PartBuilder, mat: THREE.Material, fin: THREE.Material, black: THREE.Material): void {
    const layout = this.spec.engine.layout;
    const style = this.spec.style;
    const f = this.frame;
    const ex = new Set(this.look.extras);
    const cx = (f.pivot.z + f.head.z) / 2 - 0.02;
    const base = style === 'cruiser' ? 0.28 : style === 'scooter' ? 0.22 : 0.3;
    const cyl = FIRING_ANGLES[layout].length;
    if (style === 'scooter') {
      // Swinging engine unit beside the rear wheel.
      b.place(roundedBox(0.16, 0.18, 0.46, 0.05), mat, [-0.12, 0.25, -0.25]);
      return;
    }
    if (layout === 'ELECTRIC') {
      b.place(roundedBox(0.3, 0.32, 0.5, 0.04), this.mats.metal('#3a3d42', 0.4), [0, 0.5, cx]);
      b.place(latheX([[0.11, -0.13], [0.12, -0.12], [0.12, 0.12], [0.11, 0.13]], 28), fin, [0, 0.32, cx + 0.1]);
      for (let i = 0; i < 8; i++) b.place(new THREE.BoxGeometry(0.31, 0.01, 0.4), fin, [0, 0.36 + i * 0.035, cx]);
      return;
    }
    // Crankcase
    const wide = layout === 'I6' || layout === 'F6' ? 0.56 : cyl >= 4 && layout !== 'V4' && layout !== 'V4A' ? 0.42 : layout === 'I3' ? 0.36 : 0.3;
    b.place(roundedBox(wide, 0.24, 0.44, 0.06), mat, [0, base + 0.1, cx + 0.04]);
    // Sump / gearbox case
    b.place(roundedBox(wide * 0.8, 0.12, 0.36, 0.04), mat, [0, base - 0.02, cx + 0.06]);
    // Side covers (clutch/alternator) with polished rims
    b.place(latheX([[0.0, -0.02], [0.1, -0.02], [0.11, 0.0], [0.1, 0.02], [0.0, 0.02]], 24), fin, [wide / 2 + 0.01, base + 0.1, cx + 0.12]);
    b.place(latheX([[0.0, -0.02], [0.085, -0.02], [0.09, 0.0], [0.085, 0.02], [0.0, 0.02]], 24), fin, [-wide / 2 - 0.01, base + 0.1, cx - 0.04]);

    const finned = style === 'classic' || style === 'cruiser';
    const cylinder = (pos: THREE.Vector3, dir: THREE.Vector3, len: number, r: number) => {
      const end = pos.clone().add(dir.clone().multiplyScalar(len));
      b.add(rod(pos, end, r, r * 0.95, 16), mat);
      if (finned) {
        for (let i = 1; i < 7; i++) {
          const p = pos.clone().add(dir.clone().multiplyScalar((len * i) / 7));
          const g = new THREE.CylinderGeometry(r * 1.32, r * 1.32, 0.008, 18);
          g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
          g.translate(p.x, p.y, p.z);
          b.add(g, fin);
        }
      }
      // Head / valve cover
      const head = end.clone().add(dir.clone().multiplyScalar(0.045));
      b.add(rod(end, head, r * 1.15, r * 1.05, 16), fin);
    };
    if (layout === 'BOXER') {
      // Signature horizontally opposed cylinders sticking out of both sides.
      const r = this.spec.engine.cc > 1500 ? 0.072 : 0.06;
      const z = cx - 0.02;
      for (const s of [-1, 1]) {
        const p0 = V(s * 0.12, base + 0.2, z);
        const d = V(s, 0.12, -0.05).normalize();
        cylinder(p0, d, 0.2, r);
        // Valve cover with BMW-style finish
        const end = p0.clone().add(d.clone().multiplyScalar(0.26));
        b.place(roundedBox(0.06, 0.13, 0.16, 0.03), fin, [end.x, end.y, end.z]);
      }
      b.place(roundedBox(0.24, 0.22, 0.3, 0.06), mat, [0, base + 0.26, cx + 0.04]);
    } else if (layout === 'V2_45' || layout === 'V2_60' || layout === 'V2_75' || layout === 'L2' || layout === 'V4' || layout === 'V4A') {
      const angle =
        layout === 'V2_45' ? 0.785 : layout === 'V2_60' ? 1.05 : layout === 'V2_75' ? 1.31 : layout === 'V4A' ? 1.13 : 1.57;
      const r = layout === 'V2_45' ? 0.065 : layout.startsWith('V4') ? 0.05 : 0.058;
      const lean = layout === 'L2' || layout === 'V4' ? 0.35 : 0;
      const front = V(0, Math.cos(angle / 2 + lean), -Math.sin(angle / 2 + lean));
      const rear = V(0, Math.cos(-angle / 2 + lean), -Math.sin(-angle / 2 + lean));
      const p = V(0, base + 0.2, cx + 0.04);
      if (layout.startsWith('V4')) {
        for (const s of [-1, 1]) {
          cylinder(p.clone().add(V(s * 0.07, 0, 0)), front, 0.17, r);
          cylinder(p.clone().add(V(s * 0.07, 0, 0)), rear, 0.17, r);
        }
      } else {
        cylinder(p.clone(), front, layout === 'V2_45' ? 0.26 : 0.2, r);
        cylinder(p.clone(), rear, layout === 'V2_45' ? 0.26 : 0.2, r);
      }
      if (layout === 'V2_45') {
        // Air cleaner on the right side (Harley look).
        b.place(latheX([[0.0, -0.03], [0.1, -0.03], [0.11, 0.0], [0.1, 0.03], [0.0, 0.03]], 28), this.mats.chrome(), [0.15, base + 0.38, cx + 0.02]);
      }
    } else {
      // Inline engines: cylinder block leaning forward.
      const n = layout === 'SINGLE' ? 1 : layout === 'I6' || layout === 'F6' ? 6 : cyl;
      const blockW = Math.min(wide * 0.92, n * 0.085 + 0.05);
      const tilt = layout === 'SINGLE' && style === 'classic' ? 0.1 : 0.45;
      const geo = roundedBox(blockW, 0.22, 0.2, 0.03);
      b.place(geo, mat, [0, base + 0.32, cx - 0.08], [-tilt, 0, 0]);
      b.place(roundedBox(blockW * 0.96, 0.07, 0.19, 0.03), fin, [0, base + 0.46, cx - 0.15], [-tilt, 0, 0]);
      if (finned) {
        for (let i = 0; i < 6; i++) b.place(new THREE.BoxGeometry(blockW + 0.05, 0.008, 0.24), fin, [0, base + 0.24 + i * 0.03, cx - 0.06 - i * 0.012], [-tilt, 0, 0]);
      }
      if (layout === 'F6') {
        for (const s of [-1, 1]) b.place(roundedBox(0.12, 0.14, 0.4, 0.04), mat, [s * 0.27, base + 0.18, cx]);
      }
      if (ex.has('supercharger')) {
        // H2 supercharger on the left with its intake duct.
        b.place(latheX([[0.0, -0.04], [0.085, -0.05], [0.09, 0.0], [0.085, 0.04], [0.0, 0.05]], 28), this.mats.metal('#9aa1a9', 0.25), [-0.16, base + 0.38, cx + 0.12]);
        b.add(tube([V(-0.18, base + 0.4, cx + 0.1), V(-0.22, base + 0.55, cx - 0.2), V(-0.2, 0.72, f.head.z - 0.15)], 0.045, 12), black);
      }
    }
    // Radiator for liquid-cooled engines.
    if (!finned) {
      const rz = f.head.z + 0.18;
      b.place(roundedBox(0.4, 0.3, 0.05, 0.015), black, [0, base + 0.36, rz], [-0.25, 0, 0]);
      b.place(new THREE.BoxGeometry(0.36, 0.26, 0.052), this.mats.metal('#3a3c40', 0.6), [0, base + 0.36, rz], [-0.25, 0, 0]);
    }
  }

  private buildFrame(b: PartBuilder, mat: THREE.Material, black: THREE.Material, ex: Set<string>): void {
    const f = this.frame;
    const style = this.spec.style;
    const head = f.head;
    if (style === 'scooter') {
      b.add(tube([head.clone().add(V(0, -0.1, 0.02)), V(0, 0.22, head.z + 0.3), V(0, 0.2, -0.5), V(0, 0.42, f.pivot.z - 0.05)], 0.035, 10), mat);
      return;
    }
    // Steering head
    b.add(rod(head.clone().add(V(0, -0.14, 0.06)), head.clone().add(V(0, 0.02, 0)), 0.035, 0.035, 14), mat);
    if (ex.has('trellis') || style === 'classic' || style === 'cruiser' || style === 'adventure') {
      // Tubular trellis / cradle frame.
      const r = style === 'cruiser' || style === 'classic' ? 0.018 : 0.014;
      for (const s of [-1, 1]) {
        const x = s * (style === 'cruiser' ? 0.09 : 0.12);
        const top = [head.clone().add(V(x * 0.6, -0.02, 0.04)), V(x, f.seatY - 0.06, f.seatFront - 0.02), V(x, f.seatY - 0.04, f.seatBack - 0.05)];
        b.add(tube(top, r, 8), mat);
        b.add(rod(head.clone().add(V(x * 0.6, -0.12, 0.05)), f.pivot.clone().add(V(x, 0.04, -0.05)), r), mat);
        b.add(rod(V(x, f.seatY - 0.06, f.seatFront - 0.02), f.pivot.clone().add(V(x, 0.0, 0)), r), mat);
        if (ex.has('trellis')) {
          // Triangulation
          const a = head.clone().add(V(x * 0.6, -0.02, 0.04));
          const c = f.pivot.clone().add(V(x, 0.04, -0.05));
          for (let i = 1; i < 4; i++) {
            const pTop = a.clone().lerp(V(x, f.seatY - 0.06, f.seatFront - 0.02), i / 4);
            const pBot = head.clone().add(V(x * 0.6, -0.12, 0.05)).lerp(c, (i + 0.5) / 4);
            b.add(rod(pTop, pBot, r * 0.8), mat);
          }
        }
        if (style === 'cruiser' || style === 'classic') {
          // Down tubes cradling the engine.
          b.add(tube([head.clone().add(V(x * 0.5, -0.1, 0.02)), V(x, 0.22, head.z + 0.28), V(x, 0.16, f.pivot.z - 0.25), f.pivot.clone().add(V(x, -0.04, 0))], r, 8), mat);
        }
      }
    } else {
      // Aluminium twin-spar beam frame.
      for (const s of [-1, 1]) {
        const x = s * 0.15;
        const prof: Pt[] = [
          [head.z + 0.03, head.y - 0.02],
          [head.z + 0.08, head.y + 0.02],
          [f.pivot.z + 0.08, f.pivot.y + 0.16],
          [f.pivot.z - 0.02, f.pivot.y + 0.08],
          [f.pivot.z - 0.03, f.pivot.y - 0.06],
          [f.pivot.z - 0.1, f.pivot.y - 0.02],
          [head.z + 0.06, head.y - 0.16],
        ];
        b.add(profileExtrude(prof, 0.05, { bevel: 0.012, centerX: x }), mat);
      }
      // Subframe
      for (const s of [-1, 1]) b.add(rod(V(s * 0.12, f.pivot.y + 0.16, f.pivot.z + 0.05), V(s * 0.08, f.seatY - 0.02, f.seatBack + 0.05), 0.012), black);
    }
    // Swingarm pivot boss
    b.place(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 14), mat, [0, f.pivot.y, f.pivot.z], [0, 0, Math.PI / 2]);
  }

  /** Add a lofted panel, painting it according to the livery pattern. */
  private shell(
    b: PartBuilder,
    stations: LoftStation[],
    mats: { main: THREE.Material; lower: THREE.Material; stripe: THREE.Material },
    opts: { splitY?: number; stripeY?: number; stripeW?: number } = {},
  ): void {
    let geo = superLoft(stations, 32, 4);
    if (opts.stripeY !== undefined) {
      const sy = opts.stripeY;
      const sw = opts.stripeW ?? 0.05;
      const [stripe, rest] = splitTriangles(geo, (x, y) => Math.abs(x) < sw && y > sy);
      b.add(stripe, mats.stripe);
      geo = rest;
    }
    if (opts.splitY !== undefined) {
      const cut = opts.splitY;
      const [low, high] = splitTriangles(geo, (_x, y) => y < cut);
      b.add(low, mats.lower);
      b.add(high, mats.main);
    } else b.add(geo, mats.main);
  }

  private buildBodywork(
    b: PartBuilder,
    steer: PartBuilder,
    paint: THREE.Material,
    paint2: THREE.Material,
    accent: THREE.Material,
    black: THREE.Material,
    ex: Set<string>,
  ): void {
    const f = this.frame;
    const k = this.look;
    const lv = this.livery;
    const m = this.mats;
    const style = this.spec.style;
    const hz = f.head.z;
    const hy = f.head.y;
    const sy = f.seatY;
    const sf = f.seatFront;
    const glass = m.glass('#2a3138', 0.45);
    const pat = lv.pattern;
    const two = pat === 'split' || pat === 'racing' || pat === 'tricolor';
    const striped = pat === 'stripes' || pat === 'racing' || pat === 'tricolor';
    const M = { main: paint, lower: two ? paint2 : paint, stripe: striped ? accent : paint };
    const tankOnly = { main: paint, lower: paint, stripe: striped ? accent : paint };
    const tankTop = Math.max(sy + 0.17, hy + (style === 'cruiser' ? 0.0 : 0.07));
    const bulk = style === 'hyper' ? 1.08 : 1;

    // ── fuel tank ──
    if (style !== 'scooter' && k.fairing !== 'touring') {
      let st: LoftStation[];
      if (k.tank === 'teardrop' || k.tank === 'round') {
        const w = k.tank === 'round' ? 0.36 : 0.42;
        st = [
          { z: hz + 0.0, w: w * 0.5, yb: hy - 0.1, yt: hy - 0.02, n: 2.2 },
          { z: hz + 0.12, w: w * 0.92, yb: hy - 0.17, yt: tankTop, n: 2.3 },
          { z: (hz + sf) / 2, w, yb: hy - 0.18, yt: tankTop + 0.02, n: 2.3 },
          { z: sf - 0.05, w: w * 0.7, yb: sy - 0.03, yt: sy + 0.08, n: 2.2 },
          { z: sf + 0.02, w: w * 0.4, yb: sy - 0.01, yt: sy + 0.03, n: 2 },
        ];
      } else if (k.tank === 'adventure') {
        st = [
          { z: hz + 0.02, w: 0.36, yb: hy - 0.18, yt: hy + 0.04, n: 2.6 },
          { z: hz + 0.14, w: 0.56, yb: hy - 0.32, yt: tankTop + 0.02, n: 3 },
          { z: (hz + sf) / 2 + 0.02, w: 0.56, yb: hy - 0.34, yt: tankTop + 0.03, n: 3 },
          { z: sf - 0.03, w: 0.36, yb: sy - 0.08, yt: sy + 0.06, n: 2.6 },
          { z: sf + 0.03, w: 0.26, yb: sy - 0.05, yt: sy + 0.01, n: 2 },
        ];
      } else if (k.tank === 'muscle' || k.tank === 'boxy') {
        st = [
          { z: hz + 0.0, w: 0.3, yb: hy - 0.1, yt: hy + 0.04, n: 2.6 },
          { z: hz + 0.1, w: 0.5, yb: hy - 0.19, yt: tankTop + 0.02, n: 3.2 },
          { z: (hz + sf) / 2, w: 0.52, yb: hy - 0.21, yt: tankTop + 0.03, n: 3.2 },
          { z: sf - 0.03, w: 0.34, yb: sy - 0.05, yt: sy + 0.08, n: 2.6 },
          { z: sf + 0.03, w: 0.24, yb: sy - 0.04, yt: sy + 0.02, n: 2 },
        ];
      } else {
        st = [
          { z: hz + 0.02, w: 0.28 * bulk, yb: hy - 0.1, yt: hy + 0.02, n: 2.4 },
          { z: hz + 0.12, w: 0.44 * bulk, yb: hy - 0.15, yt: tankTop, n: 2.7 },
          { z: (hz + sf) / 2 + 0.04, w: 0.46 * bulk, yb: hy - 0.17, yt: tankTop + 0.01, n: 2.7 },
          { z: sf - 0.02, w: 0.32, yb: sy - 0.05, yt: sy + 0.08, n: 2.4 },
          { z: sf + 0.04, w: 0.22, yb: sy - 0.04, yt: sy + 0.02, n: 2 },
        ];
      }
      this.shell(b, st, tankOnly, { stripeY: tankTop - 0.05, stripeW: 0.045 });
      // Fuel cap
      b.place(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 18), m.metal('#9aa1a9', 0.3), [0, tankTop + 0.025, (hz + sf) / 2 - 0.02]);
      if (k.fairing === 'none' || k.fairing === 'half' || k.fairing === 'batwing') {
        const w = st[2].w / 2 + 0.005;
        this.addDecal(b, this.spec.brand.toUpperCase(), (hz + sf) / 2 + 0.02, (st[2].yb + st[2].yt) / 2, w * 0.96, 0.28, 0.07, lv);
      }
      if (style === 'naked' || style === 'adventure') {
        // Radiator shrouds / tank scoops
        for (const s of [-1, 1]) {
          const x = s * (style === 'adventure' ? 0.29 : 0.25);
          this.shell(b, [
            { z: hz + 0.02, w: 0.03, yb: hy - 0.25, yt: hy - 0.06, x, n: 2.5 },
            { z: hz + 0.16, w: 0.07, yb: hy - (style === 'adventure' ? 0.42 : 0.32), yt: hy - 0.06, x, n: 3 },
            { z: hz + 0.34, w: 0.03, yb: hy - (style === 'adventure' ? 0.38 : 0.28), yt: hy - 0.14, x, n: 2.5 },
          ], { main: paint2, lower: paint2, stripe: paint2 });
        }
      }
    }

    // ── fairings ──
    if (k.fairing === 'full') {
      const nose = -f.L - 0.1;
      this.shell(b, [
        { z: nose, w: 0.06, yb: hy - 0.21, yt: hy - 0.16, n: 2 },
        { z: nose + 0.06, w: 0.3 * bulk, yb: hy - 0.29, yt: hy - 0.09, n: 2.4 },
        { z: nose + 0.18, w: 0.5 * bulk, yb: hy - 0.35, yt: hy - 0.03, n: 2.6 },
        { z: hz - 0.1, w: 0.58 * bulk, yb: hy - 0.39, yt: hy + 0.0, n: 2.9 },
        { z: hz + 0.05, w: 0.6 * bulk, yb: hy - 0.41, yt: hy - 0.03, n: 3.1 },
        { z: hz + 0.15, w: 0.5, yb: hy - 0.37, yt: hy - 0.11, n: 2.8 },
      ], M, { splitY: hy - 0.31, stripeY: hy - 0.05, stripeW: 0.07 });
      // Side panels down to the belly
      this.shell(b, [
        { z: hz - 0.1, w: 0.36, yb: 0.52, yt: hy - 0.3, n: 3 },
        { z: hz + 0.05, w: 0.54 * bulk, yb: 0.3, yt: hy - 0.32, n: 4 },
        { z: hz + 0.3, w: 0.56 * bulk, yb: 0.2, yt: hy - 0.36, n: 4.5, flatBottom: 0.6 },
        { z: hz + 0.5, w: 0.46, yb: 0.18, yt: 0.56, n: 4 },
        { z: hz + 0.62, w: 0.24, yb: 0.22, yt: 0.42, n: 3 },
      ], { main: M.lower, lower: ex.has('bellypan') ? M.lower : black, stripe: M.lower }, { splitY: 0.27 });
      if (pat === 'tricolor' || pat === 'racing') {
        // Accent flash along the flank.
        b.add(profileExtrude([[hz - 0.06, hy - 0.31], [hz + 0.42, hy - 0.37], [hz + 0.46, hy - 0.42], [hz - 0.02, hy - 0.36]], 0.58 * bulk, { bevel: 0.004 }), accent);
      }
      // Windscreen bubble
      this.shell(b, [
        { z: nose + 0.14, w: 0.22, yb: hy - 0.07, yt: hy - 0.03, n: 2.2 },
        { z: hz - 0.12, w: 0.34, yb: hy - 0.03, yt: hy + 0.09, n: 2.4 },
        { z: hz - 0.0, w: 0.3, yb: hy - 0.01, yt: hy + 0.13, n: 2.4 },
        { z: hz + 0.03, w: 0.24, yb: hy + 0.0, yt: hy + 0.1, n: 2 },
      ], { main: glass, lower: glass, stripe: glass });
      // Ram-air intake below the headlights
      b.place(roundedBox(0.09, 0.06, 0.08, 0.02), black, [0, hy - 0.2, nose + 0.06]);
      this.addDecal(b, this.spec.brand.toUpperCase(), hz + 0.32, 0.46, 0.285 * bulk, 0.34, 0.075, lv);
      // Mirrors on the fairing
      for (const s of [-1, 1]) {
        b.add(rod(V(s * 0.22, hy - 0.02, hz - 0.12), V(s * 0.3, hy + 0.04, hz - 0.1), 0.01), black);
        b.place(roundedBox(0.13, 0.055, 0.05, 0.02), style === 'hyper' ? paint : black, [s * 0.33, hy + 0.05, hz - 0.1], [0, s * 0.15, 0]);
      }
      if (ex.has('winglets')) {
        for (const s of [-1, 1]) {
          const wing: Pt[] = [[nose + 0.16, hy - 0.2], [nose + 0.36, hy - 0.17], [nose + 0.38, hy - 0.23], [nose + 0.18, hy - 0.25]];
          b.add(profileExtrude(wing, 0.12, { bevel: 0.006, centerX: s * 0.29 * bulk }), style === 'hyper' ? m.carbon() : paint2);
        }
      }
    } else if (k.fairing === 'half') {
      this.shell(b, [
        { z: hz - 0.24, w: 0.16, yb: hy - 0.14, yt: hy - 0.06, n: 2.2 },
        { z: hz - 0.16, w: 0.42, yb: hy - 0.26, yt: hy + 0.04, n: 2.8 },
        { z: hz - 0.02, w: 0.54, yb: hy - 0.3, yt: hy + 0.06, n: 3.2 },
        { z: hz + 0.08, w: 0.46, yb: hy - 0.26, yt: hy + 0.0, n: 3 },
      ], M, { splitY: hy - 0.22 });
      this.shell(b, [
        { z: hz - 0.16, w: 0.24, yb: hy + 0.02, yt: hy + 0.05, n: 2 },
        { z: hz - 0.06, w: 0.3, yb: hy + 0.03, yt: hy + 0.12, n: 2.4 },
        { z: hz - 0.0, w: 0.24, yb: hy + 0.04, yt: hy + 0.1, n: 2 },
      ], { main: glass, lower: glass, stripe: glass });
      if (ex.has('winglets')) {
        for (const s of [-1, 1]) {
          const wing: Pt[] = [[hz - 0.12, hy - 0.22], [hz + 0.04, hy - 0.21], [hz + 0.04, hy - 0.26], [hz - 0.1, hy - 0.26]];
          b.add(profileExtrude(wing, 0.12, { bevel: 0.006, centerX: s * 0.3 }), paint2);
        }
      }
    } else if (k.fairing === 'adventure') {
      this.shell(b, [
        { z: hz - 0.28, w: 0.14, yb: hy - 0.06, yt: hy + 0.04, n: 2.4 },
        { z: hz - 0.16, w: 0.36, yb: hy - 0.18, yt: hy + 0.12, n: 2.8 },
        { z: hz + 0.0, w: 0.46, yb: hy - 0.24, yt: hy + 0.16, n: 3 },
        { z: hz + 0.12, w: 0.42, yb: hy - 0.22, yt: hy + 0.12, n: 3 },
      ], M, { splitY: hy - 0.1 });
      if (k.headlight === 'beak') {
        this.shell(b, [
          { z: hz - 0.56, w: 0.04, yb: hy - 0.2, yt: hy - 0.18, n: 2 },
          { z: hz - 0.4, w: 0.16, yb: hy - 0.22, yt: hy - 0.14, n: 2.4 },
          { z: hz - 0.2, w: 0.24, yb: hy - 0.24, yt: hy - 0.06, n: 2.6 },
          { z: hz - 0.08, w: 0.2, yb: hy - 0.22, yt: hy - 0.08, n: 2.4 },
        ], { main: M.lower, lower: M.lower, stripe: M.lower });
      }
      const screenH = ex.has('windscreenTall') ? 0.34 : 0.22;
      const ws: Pt[] = [[hz - 0.2, hy + 0.1], [hz - 0.06, hy + 0.1 + screenH], [hz - 0.03, hy + 0.1 + screenH - 0.01], [hz - 0.15, hy + 0.09]];
      b.add(profileExtrude(ws, 0.4, { bevel: 0.008, taper: (_z, y) => lerp(1, 0.75, smoothstep(hy + 0.1, hy + 0.1 + screenH, y)) }), glass);
      this.addDecal(b, this.spec.brand.toUpperCase(), hz + 0.26, hy - 0.2, 0.29, 0.28, 0.065, lv);
      for (const s of [-1, 1]) {
        b.add(rod(V(s * 0.2, hy + 0.08, hz - 0.04), V(s * 0.3, hy + 0.22, hz - 0.02), 0.009), black);
        b.place(roundedBox(0.12, 0.07, 0.04, 0.02), black, [s * 0.32, hy + 0.24, hz - 0.02]);
      }
      if (ex.has('crashbars')) {
        for (const s of [-1, 1]) b.add(tube([V(s * 0.2, hy - 0.3, hz + 0.12), V(s * 0.33, 0.45, hz + 0.25), V(s * 0.32, 0.28, hz + 0.45), V(s * 0.18, 0.24, hz + 0.6)], 0.014, 8), m.metal('#2a2c30', 0.4));
      }
    } else if (k.fairing === 'touring') {
      const nose = -f.L - 0.02;
      this.shell(b, [
        { z: nose, w: 0.2, yb: hy - 0.22, yt: hy - 0.1, n: 2.4 },
        { z: nose + 0.1, w: 0.66, yb: hy - 0.44, yt: hy + 0.06, n: 3 },
        { z: hz + 0.0, w: 0.9, yb: hy - 0.5, yt: hy + 0.12, n: 3.6 },
        { z: hz + 0.3, w: 0.88, yb: hy - 0.52, yt: hy + 0.08, n: 3.6 },
        { z: hz + 0.46, w: 0.62, yb: hy - 0.36, yt: hy + 0.0, n: 3 },
        { z: sf + 0.02, w: 0.4, yb: sy - 0.04, yt: sy + 0.06, n: 2.4 },
      ], M, { splitY: hy - 0.36 });
      this.shell(b, [
        { z: hz + 0.16, w: 0.5, yb: 0.32, yt: hy - 0.42, n: 4 },
        { z: hz + 0.46, w: 0.7, yb: 0.26, yt: hy - 0.46, n: 4 },
        { z: hz + 0.66, w: 0.44, yb: 0.3, yt: 0.52, n: 3 },
      ], { main: M.lower, lower: M.lower, stripe: M.lower });
      const ws: Pt[] = [[nose + 0.24, hy + 0.06], [hz + 0.06, hy + 0.42], [hz + 0.1, hy + 0.41], [nose + 0.34, hy + 0.06]];
      b.add(profileExtrude(ws, 0.6, { bevel: 0.01, taper: (_z, y) => lerp(1, 0.8, smoothstep(hy, hy + 0.42, y)) }), glass);
      this.addDecal(b, this.spec.brand.toUpperCase(), hz + 0.22, hy - 0.3, 0.44, 0.4, 0.085, lv);
      for (const s of [-1, 1]) b.place(roundedBox(0.14, 0.08, 0.06, 0.02), paint, [s * 0.47, hy - 0.06, hz + 0.08]);
    } else if (k.fairing === 'batwing') {
      // Fork-mounted batwing fairing (moves with the bars).
      const top = hy + 0.12;
      const st: LoftStation[] = [
        { z: hz - 0.26, w: 0.3, yb: top - 0.34, yt: top - 0.12, n: 2.4 },
        { z: hz - 0.18, w: 0.76, yb: top - 0.4, yt: top + 0.02, n: 2.6 },
        { z: hz - 0.04, w: 0.82, yb: top - 0.44, yt: top + 0.04, n: 3 },
        { z: hz + 0.02, w: 0.7, yb: top - 0.4, yt: top - 0.02, n: 3 },
      ];
      const g = superLoft(st, 32, 4);
      steer.add(this.steerTransform(g, V(0, -f.head.y, 0)), paint);
      const ws = profileExtrude([[hz - 0.16, top], [hz - 0.04, top + 0.16], [hz - 0.01, top + 0.15], [hz - 0.1, top - 0.01]], 0.66, { bevel: 0.008 });
      steer.add(this.steerTransform(ws, V(0, -f.head.y, 0)), m.glass('#1b2026', 0.6));
    } else if (k.fairing === 'scooter') {
      this.buildScooterBody(b, steer, paint, paint2, black, glass);
    }

    // Handlebar mirrors for unfaired bikes
    if (k.fairing === 'none' || k.fairing === 'half' || k.fairing === 'batwing' || k.fairing === 'scooter') {
      for (const s of [-1, 1]) {
        const base = this.toSteerLocal(f.head.clone().add(V(s * (f.gripOffset.x - 0.08), f.gripOffset.y + 0.02, f.gripOffset.z - 0.02)));
        const top = base.clone().add(V(s * 0.07, 0.13, -0.03));
        steer.add(rod(base, top, 0.008), style === 'cruiser' || style === 'classic' ? m.chrome() : black);
        const head = new THREE.CylinderGeometry(0.055, 0.055, 0.025, 20);
        head.rotateX(Math.PI / 2);
        head.translate(top.x, top.y + 0.02, top.z);
        steer.add(head, black);
      }
    }
    if (ex.has('flyscreen')) {
      const fs = profileExtrude([[-0.08, 0.0], [0.0, 0.16], [0.03, 0.15], [0.0, 0.0]], 0.22, { bevel: 0.006 });
      steer.add(this.steerTransform(fs, V(0, -f.head.y + hy + 0.0, hz - 0.12)), m.glass('#1b2026', 0.6));
    }
  }

  /** Bike-space geometry → steer local (for parts built in bike space). */
  private steerTransform(geom: THREE.BufferGeometry, offset: THREE.Vector3): THREE.BufferGeometry {
    const f = this.frame;
    geom.translate(offset.x, offset.y + f.head.y, offset.z);
    geom.translate(-f.head.x, -f.head.y, -f.head.z);
    geom.applyMatrix4(new THREE.Matrix4().makeRotationX(-f.rake));
    return geom;
  }

  private buildScooterBody(b: PartBuilder, steer: PartBuilder, paint: THREE.Material, paint2: THREE.Material, black: THREE.Material, glass: THREE.Material): void {
    const f = this.frame;
    const hz = f.head.z;
    const hy = f.head.y;
    const sy = f.seatY;
    const sf = f.seatFront;
    const L = f.L;
    const one = { main: paint, lower: paint, stripe: paint };
    // Front leg shield (apron)
    this.shell(b, [
      { z: -L + 0.2, w: 0.26, yb: 0.34, yt: 0.5, n: 2.4 },
      { z: hz - 0.08, w: 0.44, yb: 0.3, yt: hy + 0.06, n: 3 },
      { z: hz + 0.06, w: 0.5, yb: 0.27, yt: hy + 0.04, n: 3.2 },
      { z: hz + 0.16, w: 0.42, yb: 0.26, yt: hy - 0.06, n: 3 },
    ], one);
    // Floorboard
    b.place(roundedBox(0.36, 0.06, sf - hz - 0.12, 0.025), black, [0, 0.27, (hz + sf) / 2 + 0.04]);
    // Rear body (monocoque)
    this.shell(b, [
      { z: sf - 0.08, w: 0.3, yb: 0.3, yt: sy - 0.08, n: 2.4 },
      { z: sf + 0.1, w: 0.44, yb: 0.26, yt: sy - 0.04, n: 2.6 },
      { z: -0.1, w: 0.5, yb: 0.24, yt: sy - 0.04, n: 2.6, flatBottom: 0.5 },
      { z: 0.14, w: 0.38, yb: 0.32, yt: sy - 0.08, n: 2.4 },
      { z: 0.25, w: 0.14, yb: 0.44, yt: sy - 0.14, n: 2 },
    ], { main: paint, lower: paint2, stripe: paint }, { splitY: 0.33 });
    // Front fender on the wheel
    this.shell(b, [
      { z: -L - 0.12, w: 0.06, yb: f.Rf + 0.04, yt: f.Rf + 0.08, n: 2 },
      { z: -L - 0.02, w: 0.16, yb: f.Rf + 0.06, yt: f.Rf * 2 + 0.06, n: 2.4 },
      { z: -L + 0.14, w: 0.14, yb: f.Rf + 0.04, yt: f.Rf * 2 + 0.02, n: 2.4 },
    ], one);
    // Handlebar cover with the headlight (steer space)
    const gy = hy + f.gripOffset.y;
    const gz = hz + f.gripOffset.z;
    const cover = superLoft([
      { z: gz - 0.22, w: 0.12, yb: gy - 0.06, yt: gy - 0.01, n: 2.2 },
      { z: gz - 0.14, w: 0.5, yb: gy - 0.08, yt: gy + 0.04, n: 3 },
      { z: gz + 0.04, w: 0.56, yb: gy - 0.07, yt: gy + 0.05, n: 3.2 },
      { z: gz + 0.1, w: 0.4, yb: gy - 0.05, yt: gy + 0.03, n: 2.6 },
    ], 28, 4);
    steer.add(this.steerTransform(cover, V(0, -f.head.y, 0)), paint);
    const ws = profileExtrude([[gz - 0.16, gy + 0.04], [gz - 0.08, gy + 0.24], [gz - 0.05, gy + 0.23], [gz - 0.12, gy + 0.03]], 0.4, { bevel: 0.006 });
    steer.add(this.steerTransform(ws, V(0, -f.head.y, 0)), glass);
  }

  private addDecal(b: PartBuilder, text: string, z: number, y: number, x: number, w: number, h: number, lv: Livery): void {
    const dark = new THREE.Color(lv.primary).getHSL({ h: 0, s: 0, l: 0 }).l > 0.55;
    const tex = decalTexture(text, dark ? '#16171a' : '#f4f4f4');
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.3, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(w, h);
      g.rotateY(s * Math.PI / 2);
      g.translate(s * x, y, z);
      b.add(g, mat);
    }
  }

  private buildSeatAndTail(b: PartBuilder, paint: THREE.Material, paint2: THREE.Material, accent: THREE.Material, black: THREE.Material): void {
    const f = this.frame;
    const k = this.look;
    const m = this.mats;
    const lv = this.livery;
    const style = this.spec.style;
    const seat = m.leather(lv.seat);
    const sy = f.seatY;
    const sf = f.seatFront;
    const sb = f.seatBack;
    const pat = lv.pattern;
    const striped = pat === 'stripes' || pat === 'racing' || pat === 'tricolor';
    const two = pat === 'split' || pat === 'racing' || pat === 'tricolor';
    const S = { main: seat, lower: seat, stripe: seat };
    if (style === 'scooter') {
      this.shell(b, [
        { z: sf - 0.02, w: 0.26, yb: sy - 0.06, yt: sy + 0.0, n: 3 },
        { z: sf + 0.08, w: 0.34, yb: sy - 0.06, yt: sy + 0.04, n: 3.4 },
        { z: sb - 0.12, w: 0.34, yb: sy - 0.06, yt: sy + 0.08, n: 3.4 },
        { z: sb, w: 0.26, yb: sy - 0.08, yt: sy + 0.06, n: 3 },
      ], S);
      this.addPlate(b, 0.3, 0.42, black);
      return;
    }
    if (style === 'sport' || style === 'hyper') {
      this.shell(b, [
        { z: sf, w: 0.2, yb: sy - 0.04, yt: sy + 0.01, n: 4 },
        { z: sf + 0.08, w: 0.27, yb: sy - 0.04, yt: sy + 0.025, n: 4 },
        { z: sb - 0.12, w: 0.27, yb: sy - 0.03, yt: sy + 0.03, n: 4 },
        { z: sb - 0.06, w: 0.2, yb: sy - 0.02, yt: sy + 0.04, n: 3 },
      ], S);
      this.shell(b, [
        { z: sf + 0.04, w: 0.28, yb: sy - 0.14, yt: sy - 0.03, n: 3 },
        { z: sb - 0.12, w: 0.27, yb: sy - 0.1, yt: sy + 0.04, n: 3 },
        { z: -0.06, w: 0.2, yb: sy - 0.02, yt: sy + 0.12, n: 2.8 },
        { z: 0.06, w: 0.1, yb: sy + 0.05, yt: sy + 0.13, n: 2.2 },
        { z: 0.09, w: 0.03, yb: sy + 0.08, yt: sy + 0.12, n: 2 },
      ], { main: paint, lower: two ? paint2 : paint, stripe: striped ? accent : paint }, { splitY: sy - 0.05, stripeY: sy + 0.06, stripeW: 0.035 });
      this.addPlate(b, 0.22, 0.64, black);
      return;
    }
    if (style === 'cruiser') {
      this.shell(b, [
        { z: sf - 0.03, w: 0.2, yb: sy - 0.04, yt: sy + 0.04, n: 2.6 },
        { z: sf + 0.12, w: 0.38, yb: sy - 0.06, yt: sy + 0.06, n: 3.4 },
        { z: sf + 0.3, w: 0.36, yb: sy - 0.05, yt: sy + 0.08, n: 3.4 },
        { z: sb - 0.08, w: 0.26, yb: sy - 0.03, yt: sy + 0.14, n: 3 },
        { z: sb, w: 0.18, yb: sy - 0.02, yt: sy + 0.12, n: 2.6 },
      ], S);
      // Valanced rear fender wrapping the fat tyre.
      const fender = fenderArc(f.Rr + 0.02, k.rearTireW + 0.04, -Math.PI * 0.12, Math.PI * 0.72, 0.09);
      fender.translate(0, f.Rr, 0);
      b.add(fender, paint);
      // Side covers
      for (const s of [-1, 1]) this.shell(b, [{ z: sf + 0.02, w: 0.04, yb: sy - 0.28, yt: sy - 0.1, x: s * 0.16, n: 2.4 }, { z: sf + 0.18, w: 0.06, yb: sy - 0.32, yt: sy - 0.08, x: s * 0.17, n: 2.6 }, { z: sf + 0.32, w: 0.04, yb: sy - 0.28, yt: sy - 0.12, x: s * 0.16, n: 2.4 }], { main: paint, lower: paint, stripe: paint });
      if (k.extras.includes('panniers')) for (const s of [-1, 1]) b.place(roundedBox(0.2, 0.32, 0.56, 0.08), paint, [s * 0.3, sy - 0.08, -0.05]);
      this.addPlate(b, f.Rr + 0.1, f.Rr * 1.05, black, true, false);
      return;
    }
    // Standard / naked / adventure / classic / touring
    const flat = style === 'classic';
    const touring = style === 'touring';
    this.shell(b, [
      { z: sf - 0.02, w: 0.22, yb: sy - 0.05, yt: sy + 0.02, n: 3 },
      { z: sf + 0.1, w: touring ? 0.38 : 0.29, yb: sy - 0.05, yt: sy + 0.04, n: 3.6 },
      { z: (sf + sb) / 2, w: touring ? 0.36 : 0.28, yb: sy - 0.05, yt: sy + (flat ? 0.04 : 0.05), n: 3.6 },
      { z: sb - 0.06, w: touring ? 0.32 : 0.26, yb: sy - 0.04, yt: sy + (flat ? 0.04 : touring ? 0.16 : 0.08), n: 3.2 },
      { z: sb + 0.02, w: 0.2, yb: sy - 0.04, yt: sy + (flat ? 0.03 : touring ? 0.14 : 0.06), n: 2.6 },
    ], S);
    if (!flat) {
      const tailTop = style === 'naked' ? sy + 0.08 : sy + 0.02;
      this.shell(b, [
        { z: sf + 0.08, w: 0.26, yb: sy - 0.13, yt: sy - 0.03, n: 3 },
        { z: sb - 0.06, w: 0.22, yb: sy - 0.08, yt: tailTop - 0.02, n: 3 },
        { z: 0.05, w: 0.13, yb: sy - 0.02, yt: tailTop + 0.02, n: 2.4 },
        { z: 0.1, w: 0.04, yb: sy + 0.0, yt: tailTop, n: 2 },
      ], { main: style === 'naked' ? paint2 : paint, lower: style === 'naked' ? paint2 : paint, stripe: paint });
      if (style === 'adventure') b.place(roundedBox(0.3, 0.02, 0.32, 0.01), m.metal('#2a2c30', 0.5), [0, sy + 0.06, 0.02]);
    } else {
      // Classic chrome rear fender, grab rail and side covers.
      const fender = fenderArc(f.Rr + 0.02, k.rearTireW + 0.02, -Math.PI * 0.1, Math.PI * 0.7, 0.06);
      fender.translate(0, f.Rr, 0.0);
      b.add(fender, paint);
      b.add(tube([V(-0.14, sy - 0.02, sb - 0.1), V(-0.15, sy + 0.02, 0.05), V(0, sy + 0.02, 0.12), V(0.15, sy + 0.02, 0.05), V(0.14, sy - 0.02, sb - 0.1)], 0.012, 8), m.chrome());
      for (const s of [-1, 1]) this.shell(b, [{ z: sf + 0.04, w: 0.03, yb: sy - 0.26, yt: sy - 0.1, x: s * 0.15, n: 2.2 }, { z: sf + 0.17, w: 0.05, yb: sy - 0.3, yt: sy - 0.07, x: s * 0.16, n: 2.2 }, { z: sf + 0.3, w: 0.03, yb: sy - 0.26, yt: sy - 0.1, x: s * 0.15, n: 2.2 }], { main: paint2, lower: paint2, stripe: paint2 });
    }
    if (k.extras.includes('panniers')) {
      const pcol = touring ? paint : m.metal('#8b9097', 0.5);
      for (const s of [-1, 1]) b.place(roundedBox(0.2, 0.36, 0.52, 0.06), pcol, [s * 0.31, sy - 0.18, sb - 0.12]);
    }
    if (k.extras.includes('topcase')) b.place(roundedBox(0.44, 0.3, 0.38, 0.08), paint, [0, sy + 0.2, 0.1]);
    this.addPlate(b, flat ? 0.18 : 0.2, flat ? f.Rr + 0.28 : 0.6, black);
  }

  private addPlate(b: PartBuilder, z: number, y: number, black: THREE.Material, upright = false, hugger = true): void {
    const plate = new THREE.MeshStandardMaterial({ map: plateTexture(plateText(this.spec.id)), roughness: 0.4, metalness: 0.1 });
    const g = new THREE.PlaneGeometry(0.21, 0.052);
    if (!upright) g.rotateX(-0.25);
    g.translate(0, y, z + 0.004);
    b.add(g, plate);
    b.place(new THREE.BoxGeometry(0.23, 0.07, 0.008), black, [0, y, z - 0.002], [upright ? 0 : -0.25, 0, 0]);
    // Hugger arm to the plate.
    if (hugger) b.add(rod(V(0, y + 0.05, z - 0.04), V(0, y + 0.25, z - 0.35), 0.016), black);
    // Turn signals
    for (const s of [-1, 1]) {
      b.add(rod(V(s * 0.06, y + 0.06, z - 0.03), V(s * 0.13, y + 0.07, z - 0.03), 0.006), black);
      b.place(roundedBox(0.035, 0.018, 0.03, 0.006), this.mats.light('#ff8a00', 0.4), [s * 0.14, y + 0.07, z - 0.03]);
    }
  }

  private buildExhaust(b: PartBuilder): void {
    const f = this.frame;
    const k = this.look;
    const m = this.mats;
    const style = this.spec.style;
    const layout = this.spec.engine.layout;
    if (k.exhaust === 'none') return;
    const cx = (f.pivot.z + f.head.z) / 2;
    const base = style === 'cruiser' ? 0.28 : 0.3;
    const pipeMat = style === 'cruiser' || style === 'classic' || style === 'touring' ? m.chrome() : m.titanium();
    const canMat = style === 'sport' || style === 'hyper' || style === 'naked' ? (this.look.extras.includes('winglets') ? m.carbon() : m.titanium()) : m.chrome();
    const cyl = Math.max(1, FIRING_ANGLES[layout].length);
    const ports = Math.min(cyl, 4);
    // Headers from the cylinder head down under the engine.
    const collector = V(0.04, 0.16, cx + 0.12);
    if (style !== 'scooter' && layout !== 'BOXER') {
      for (let i = 0; i < ports; i++) {
        const x = (i - (ports - 1) / 2) * 0.07;
        b.add(tube([V(x, base + 0.38, cx - 0.22), V(x * 1.1, base + 0.12, cx - 0.3), V(x * 0.7, 0.16, cx - 0.12), collector.clone().add(V(x * 0.3, 0, 0))], 0.02, 8), pipeMat);
      }
    } else if (layout === 'BOXER') {
      for (const s of [-1, 1]) b.add(tube([V(s * 0.3, base + 0.18, cx - 0.06), V(s * 0.24, 0.2, cx - 0.2), V(s * 0.1, 0.16, cx + 0.1), collector], 0.022, 8), pipeMat);
    }
    const muffler = (a: THREE.Vector3, c: THREE.Vector3, r: number, mat: THREE.Material) => {
      b.add(rod(a, c, r, r * 0.92, 18), mat);
      const capDir = c.clone().sub(a).normalize();
      b.add(rod(c, c.clone().add(capDir.clone().multiplyScalar(0.02)), r * 0.7, r * 0.5, 18), m.metal('#2a2b2e', 0.4));
    };
    switch (k.exhaust) {
      case 'side': {
        const a = V(0.16, 0.3, f.pivot.z + 0.14);
        const c = V(0.19, 0.42, f.pivot.z + 0.4);
        b.add(tube([collector, V(0.12, 0.2, f.pivot.z - 0.05), a], 0.028, 8), pipeMat);
        muffler(a, c, 0.065, canMat);
        break;
      }
      case 'under': {
        b.place(roundedBox(0.3, 0.14, 0.34, 0.05), canMat, [0, 0.14, cx + 0.12]);
        break;
      }
      case 'twinUnderseat': {
        b.add(tube([collector, V(0.05, 0.3, f.pivot.z + 0.05), V(0.05, f.seatY - 0.12, -0.25)], 0.03, 8), pipeMat);
        for (const s of [-1, 1]) muffler(V(s * 0.08, f.seatY - 0.12, -0.25), V(s * 0.09, f.seatY - 0.06, 0.02), 0.045, canMat);
        break;
      }
      case 'high': {
        const a = V(0.16, 0.5, f.pivot.z + 0.15);
        b.add(tube([collector, V(0.14, 0.3, f.pivot.z), a], 0.03, 8), pipeMat);
        muffler(a, V(0.19, f.seatY - 0.06, -0.05), 0.07, canMat);
        break;
      }
      case 'dualChrome': {
        for (let i = 0; i < 2; i++) {
          const y0 = 0.22 + i * 0.12;
          const a = V(0.2, y0, f.pivot.z + 0.1);
          b.add(tube([V(0.1, base + 0.3, cx - 0.15 + i * 0.12), V(0.18, y0 + 0.02, cx + 0.1), a], 0.028, 8), m.chrome());
          muffler(a, V(0.22, y0 + 0.06, 0.3), 0.055, m.chrome());
        }
        break;
      }
      case 'peashooter': {
        for (const s of style === 'classic' && cyl >= 2 ? [-1, 1] : [1]) {
          const a = V(s * 0.17, 0.26, f.pivot.z + 0.05);
          b.add(tube([V(s * 0.05, base + 0.36, cx - 0.2), V(s * 0.14, 0.22, cx), a], 0.024, 8), m.chrome());
          muffler(a, V(s * 0.19, 0.36, 0.28), 0.045, m.chrome());
        }
        break;
      }
      case 'organ': {
        b.add(tube([collector, V(0.12, 0.26, f.pivot.z + 0.05), V(0.16, 0.4, -0.3)], 0.03, 8), pipeMat);
        const n = Math.min(4, Math.max(3, cyl));
        for (let i = 0; i < n; i++) {
          const y0 = 0.4 + i * 0.05;
          b.add(rod(V(0.16, y0, -0.32 + i * 0.01), V(0.19, y0 + 0.06, -0.02 + i * 0.03), 0.022, 0.022, 14), m.chrome());
        }
        break;
      }
      case 'scooter': {
        b.add(tube([V(0.0, 0.2, -0.5), V(0.1, 0.18, -0.25), V(0.18, 0.26, -0.15)], 0.022, 8), pipeMat);
        muffler(V(0.18, 0.26, -0.15), V(0.2, 0.32, 0.15), 0.06, m.metal('#2a2b2e', 0.4));
        break;
      }
      default:
        break;
    }
  }

  private buildFront(steer: PartBuilder, lower: PartBuilder, black: THREE.Material, paint: THREE.Material, accent: THREE.Material): void {
    const f = this.frame;
    const k = this.look;
    const m = this.mats;
    const style = this.spec.style;
    const usd = style === 'sport' || style === 'hyper' || style === 'naked' || style === 'adventure';
    const forkX = style === 'cruiser' ? 0.12 : style === 'scooter' ? 0.0 : 0.1;
    const outer = usd ? (this.livery.wheel === '#c9a227' || style !== 'adventure' ? m.gold() : m.metal('#2a2b2e', 0.3)) : m.metal('#25272b', 0.4);
    const stanchion = usd ? m.metal('#2a2b2e', 0.2) : m.chrome();
    const L = f.forkLen;
    const xs = style === 'scooter' ? [-0.07] : [-forkX, forkX];
    for (const x of xs) {
      if (usd) {
        steer.add(rod(V(x, 0.06, 0), V(x, -0.44, 0), 0.03, 0.028, 16), outer);
        lower.add(rod(V(x, 0.0, 0), V(x, L - 0.42, 0), 0.022, 0.022, 14), stanchion);
        lower.place(roundedBox(0.05, 0.08, 0.06, 0.012), m.metal('#2a2b2e', 0.4), [x, 0.02, 0.0]);
      } else {
        steer.add(rod(V(x, 0.06, 0), V(x, -0.32, 0), 0.02, 0.02, 14), stanchion);
        lower.add(rod(V(x, 0.0, 0), V(x, L - 0.36, 0), 0.028, 0.025, 14), style === 'cruiser' || style === 'classic' ? m.chrome() : m.metal('#3a3c40', 0.4));
      }
    }
    // Triple clamps
    steer.place(roundedBox(forkX * 2 + 0.08, 0.035, 0.08, 0.015), m.metal('#7e848b', 0.3), [0, 0.03, 0.01]);
    steer.place(roundedBox(forkX * 2 + 0.08, 0.035, 0.07, 0.015), m.metal('#7e848b', 0.3), [0, -0.14, 0.01]);

    // Handlebars → grips (positions computed in bike space, converted to steer local).
    const gripL = this.toSteerLocal(f.head.clone().add(V(-f.gripOffset.x, f.gripOffset.y, f.gripOffset.z)));
    const gripR = this.toSteerLocal(f.head.clone().add(f.gripOffset));
    const barMat = k.handlebar === 'cruiser' || style === 'classic' ? m.chrome() : black;
    if (k.handlebar === 'clipon') {
      for (const g of [gripL, gripR]) {
        const root = V(Math.sign(g.x) * forkX, 0.0, 0.0);
        steer.add(rod(root, g.clone().add(V(-Math.sign(g.x) * 0.06, 0, 0)), 0.012), barMat);
      }
    } else {
      const mid = V(0, Math.max(gripL.y, 0.06) + (k.handlebar === 'cruiser' ? -0.04 : 0.0), (gripL.z + 0.04) * 0.6);
      steer.add(tube([gripL.clone().add(V(0.05, 0, 0)), V(gripL.x * 0.55, mid.y + 0.01, (gripL.z + mid.z) / 2), mid, V(gripR.x * 0.55, mid.y + 0.01, (gripR.z + mid.z) / 2), gripR.clone().add(V(-0.05, 0, 0))], 0.012, 8), barMat);
      // Risers
      for (const s of [-1, 1]) steer.add(rod(V(s * 0.04, 0.04, 0.0), V(s * 0.04, mid.y, mid.z), 0.014), m.metal('#7e848b', 0.3));
    }
    for (const g of [gripL, gripR]) {
      const s = Math.sign(g.x);
      steer.add(rod(g.clone().add(V(-s * 0.06, 0, 0)), g.clone().add(V(s * 0.06, 0, 0)), 0.017, 0.017, 12), m.rubber());
      // Levers
      steer.add(rod(g.clone().add(V(-s * 0.07, 0.01, -0.02)), g.clone().add(V(s * 0.08, -0.0, -0.08)), 0.006, 0.006, 6), m.metal('#9aa1a9', 0.3));
      // Switch gear / brake reservoir
      steer.place(roundedBox(0.045, 0.04, 0.05, 0.01), black, [g.x - s * 0.085, g.y + 0.01, g.z]);
    }
    if (style !== 'scooter') steer.place(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 12), black, [gripR.x - 0.12, gripR.y + 0.04, gripR.z]);

    // Front fender over the wheel (lower group, wheel axle at local origin).
    const fw = k.frontTireW + 0.05;
    if (style !== 'scooter') {
      // Angles measured from the rear (+Z) over the top (+Y) to the front (−Z).
      const long = style === 'cruiser' || style === 'classic';
      const from = style === 'adventure' ? Math.PI * 0.45 : long ? Math.PI * 0.12 : Math.PI * 0.3;
      const to = style === 'adventure' ? Math.PI * 0.75 : long ? Math.PI * 0.86 : Math.PI * 0.78;
      const fender = fenderArc(f.Rf + 0.012, fw, from, to, long ? 0.07 : 0.05);
      // Convert from bike orientation into the steer-local frame (wheel axle frame).
      fender.applyMatrix4(new THREE.Matrix4().makeRotationX(-f.rake));
      lower.add(fender, long ? paint : style === 'adventure' ? accent : black);
    }
    // Brake calipers (radial, red) on the fork legs, discs live on the wheel.
    const discR = f.Rf * 0.52;
    for (const x of style === 'scooter' || style === 'classic' ? [-0.07] : [-0.075, 0.075]) {
      const cal = roundedBox(0.03, 0.11, 0.05, 0.01);
      cal.translate(x * 1.1, discR * 0.7, discR * 0.55);
      cal.applyMatrix4(new THREE.Matrix4().makeRotationX(-f.rake));
      lower.add(cal, style === 'sport' || style === 'hyper' || style === 'naked' ? m.paint('#b3121b', 0.3) : m.metal('#3a3c40', 0.4));
    }
  }

  private buildSwingarm(b: PartBuilder, black: THREE.Material, ex: Set<string>): void {
    const f = this.frame;
    const m = this.mats;
    const style = this.spec.style;
    // Local frame: origin at pivot, arm points towards the rear axle at rest angle.
    const axle = V(0, f.Rr, 0).sub(f.pivot);
    const len = axle.length();
    const dir = axle.clone().normalize();
    const mat = style === 'cruiser' || style === 'classic' ? m.metal('#1e1f22', 0.4) : m.metal('#8d939b', 0.3);
    const sides = ex.has('singleSided') ? [-1] : [-1, 1];
    for (const s of sides) {
      const x = s * (this.look.rearTireW / 2 + 0.04);
      const prof: Pt[] = [[0.02, 0.06], [len * 0.6, 0.05], [len + 0.04, 0.035], [len + 0.04, -0.035], [len * 0.6, -0.05], [0.02, -0.07]];
      const g = profileExtrude(prof.map(([z, y]) => [z, y] as Pt), ex.has('singleSided') ? 0.09 : 0.05, { bevel: 0.015, centerX: x });
      // Profile was built along +z; rotate to the axle direction.
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.atan2(dir.y, dir.z) + 0));
      b.add(g, mat);
    }
    // Chain on the left, guarded.
    if (style !== 'scooter' && this.spec.engine.layout !== 'BOXER' && this.spec.engine.layout !== 'ELECTRIC') {
      const x = -(this.look.rearTireW / 2 + 0.02);
      const a = V(x, 0.05, 0.08);
      const c = axle.clone().add(V(x, 0.0, 0.0));
      const off = V(0, 0.07, 0);
      b.add(rod(a.clone().add(V(0, 0.04, 0)), c.clone().add(off), 0.008, 0.008, 6), m.metal('#4a4d52', 0.5));
      b.add(rod(a.clone().add(V(0, -0.04, 0)), c.clone().sub(off), 0.008, 0.008, 6), m.metal('#4a4d52', 0.5));
      const sprocket = latheX([[0.0, -0.004], [0.09, -0.004], [0.095, 0], [0.09, 0.004], [0.0, 0.004]], 28);
      sprocket.translate(c.x, c.y, c.z);
      b.add(sprocket, m.metal('#c9cdd2', 0.3));
    }
    // Rear shock
    b.add(rod(V(0, 0.06, 0.12), V(0, 0.32, -0.02), 0.025, 0.025, 12), black);
    b.add(tube([V(0, 0.08, 0.13), V(0, 0.2, 0.06), V(0, 0.3, 0.0)], 0.032, 10, 12), m.paint(style === 'sport' || style === 'hyper' ? '#f2c400' : '#2a2c30', 0.2));
  }

  private buildLights(chassis: PartBuilder, steer: PartBuilder, black: THREE.Material): void {
    const f = this.frame;
    const k = this.look;
    const m = this.mats;
    const hz = f.head.z;
    const hy = f.head.y;
    switch (k.headlight) {
      case 'sportTwin': {
        const nose = -f.L - 0.08;
        for (const s of [-1, 1]) {
          const g = roundedBox(0.12, 0.035, 0.02, 0.01);
          g.rotateZ(s * 0.25);
          g.rotateY(s * 0.35);
          g.translate(s * 0.1, hy - 0.08, nose + 0.08);
          chassis.add(g, this.headLight);
          const d = roundedBox(0.1, 0.012, 0.02, 0.005);
          d.rotateZ(s * 0.25);
          d.rotateY(s * 0.35);
          d.translate(s * 0.11, hy - 0.04, nose + 0.1);
          chassis.add(d, this.drl);
        }
        break;
      }
      case 'touring': {
        for (const s of [-1, 1]) chassis.place(roundedBox(0.16, 0.07, 0.04, 0.02), this.headLight, [s * 0.14, hy - 0.04, -f.L + 0.05]);
        chassis.place(roundedBox(0.4, 0.015, 0.03, 0.006), this.drl, [0, hy + 0.02, -f.L + 0.07]);
        break;
      }
      case 'beak': {
        chassis.place(roundedBox(0.14, 0.1, 0.05, 0.03), this.headLight, [0, hy + 0.02, hz - 0.14]);
        chassis.place(roundedBox(0.2, 0.012, 0.03, 0.006), this.drl, [0, hy + 0.09, hz - 0.13]);
        break;
      }
      case 'round':
      case 'batwing': {
        const r = k.headlight === 'batwing' ? 0.1 : 0.09;
        const pos = this.toSteerLocal(V(0, hy - 0.04 + (k.headlight === 'batwing' ? 0.06 : 0), hz - 0.16));
        const housing = latheX([[0.0, -0.1], [r * 0.8, -0.1], [r, -0.02], [r * 1.02, 0.0], [0.0, 0.0]], 28);
        housing.rotateY(Math.PI / 2);
        housing.translate(pos.x, pos.y, pos.z + 0.06);
        steer.add(housing, this.spec.style === 'cruiser' || this.spec.style === 'classic' ? m.chrome() : black);
        const lens = new THREE.CircleGeometry(r * 0.9, 28);
        lens.translate(pos.x, pos.y, pos.z - 0.045);
        lens.rotateY(0);
        steer.add(lens, this.headLight);
        const ring = new THREE.TorusGeometry(r * 0.75, 0.006, 6, 28);
        ring.translate(pos.x, pos.y, pos.z - 0.05);
        steer.add(ring, this.drl);
        break;
      }
      case 'angular':
      case 'ledBar': {
        const pos = this.toSteerLocal(V(0, hy - 0.06, hz - 0.15));
        const housing = profileExtrude([[-0.08, -0.08], [-0.06, 0.06], [0.08, 0.08], [0.1, -0.06]], 0.22, { bevel: 0.025, taper: (z) => lerp(0.75, 1, smoothstep(-0.08, 0.06, z)) });
        housing.translate(pos.x, pos.y, pos.z + 0.04);
        steer.add(housing, black);
        if (k.headlight === 'ledBar') {
          steer.place(roundedBox(0.2, 0.025, 0.02, 0.008), this.drl, [pos.x, pos.y + 0.03, pos.z - 0.045]);
          steer.place(roundedBox(0.14, 0.05, 0.02, 0.01), this.headLight, [pos.x, pos.y - 0.02, pos.z - 0.045]);
        } else {
          for (const s of [-1, 1]) steer.place(roundedBox(0.07, 0.05, 0.02, 0.012), this.headLight, [pos.x + s * 0.045, pos.y, pos.z - 0.045]);
          steer.place(roundedBox(0.16, 0.012, 0.02, 0.005), this.drl, [pos.x, pos.y + 0.045, pos.z - 0.04]);
        }
        break;
      }
      case 'scooter': {
        const pos = this.toSteerLocal(V(0, f.head.y + f.gripOffset.y - 0.03, hz + f.gripOffset.z - 0.15));
        steer.place(roundedBox(0.14, 0.07, 0.03, 0.02), this.headLight, [pos.x, pos.y, pos.z]);
        break;
      }
      default:
        break;
    }
    // Tail light
    const style = this.spec.style;
    if (style === 'sport' || style === 'hyper') {
      chassis.place(roundedBox(0.14, 0.03, 0.03, 0.01), this.tailLight, [0, f.seatY + 0.1, 0.09]);
    } else if (style === 'scooter') {
      chassis.place(roundedBox(0.16, 0.05, 0.03, 0.015), this.tailLight, [0, f.seatY - 0.08, 0.24]);
    } else if (style === 'cruiser') {
      chassis.place(roundedBox(0.1, 0.04, 0.04, 0.015), this.tailLight, [0, f.Rr * 1.55, f.Rr * 0.7]);
    } else {
      chassis.place(roundedBox(0.12, 0.04, 0.03, 0.012), this.tailLight, [0, f.seatY - 0.02, 0.1]);
    }
  }

  private buildDash(chassis: PartBuilder, steer: PartBuilder): void {
    const f = this.frame;
    const mat = new THREE.MeshBasicMaterial({ map: this.dashTexture, toneMapped: false });
    const faired = this.look.fairing === 'full' || this.look.fairing === 'touring' || this.look.fairing === 'adventure';
    const g = new THREE.PlaneGeometry(0.15, 0.075);
    const housing = roundedBox(0.17, 0.095, 0.03, 0.012);
    if (faired) {
      // Frame-mounted cockpit behind the screen, angled towards the rider.
      const q = new THREE.Matrix4().makeRotationX(-0.95);
      const pos = V(0, f.head.y + 0.08, f.head.z - 0.02);
      g.applyMatrix4(q);
      g.translate(pos.x, pos.y, pos.z + 0.001);
      housing.applyMatrix4(q);
      housing.translate(pos.x, pos.y - 0.012, pos.z + 0.012);
      chassis.add(housing, this.mats.plastic('#0d0e10'));
      chassis.add(g, mat);
    } else {
      const local = this.toSteerLocal(V(0, f.head.y + 0.12, f.head.z + 0.0));
      const q = new THREE.Matrix4().makeRotationX(-0.95 - f.rake);
      g.applyMatrix4(q);
      g.translate(local.x, local.y, local.z + 0.001);
      housing.applyMatrix4(q);
      housing.translate(local.x, local.y - 0.012, local.z + 0.012);
      steer.add(housing, this.mats.plastic('#0d0e10'));
      steer.add(g, mat);
    }
  }

  private buildWheel(R: number, w: number, type: BikeLook['wheel'], wheelMat: THREE.Material, front: boolean): THREE.Group {
    const m = this.mats;
    const grp = new THREE.Group();
    const pb = new PartBuilder();
    const rimR = type === 'scooter' ? R - w * 0.5 : type === 'spoke' && front && R > 0.34 ? R - 0.09 : R - Math.min(0.11, w * 0.58);
    const hw = w / 2;
    // Tyre with a rounded motorcycle profile.
    const tyre: [number, number][] = [
      [rimR - 0.004, -hw * 0.7], [rimR + 0.015, -hw * 0.95], [rimR + (R - rimR) * 0.45, -hw],
      [R - (R - rimR) * 0.25, -hw * 0.92], [R - 0.012, -hw * 0.6], [R, -hw * 0.25], [R, hw * 0.25], [R - 0.012, hw * 0.6],
      [R - (R - rimR) * 0.25, hw * 0.92], [rimR + (R - rimR) * 0.45, hw], [rimR + 0.015, hw * 0.95], [rimR - 0.004, hw * 0.7],
    ];
    pb.add(latheX(tyre, 40), m.rubber());
    // Rim
    const rim: [number, number][] = [[rimR + 0.012, -hw * 0.72], [rimR - 0.006, -hw * 0.7], [rimR - 0.018, -hw * 0.55], [rimR - 0.018, hw * 0.55], [rimR - 0.006, hw * 0.7], [rimR + 0.012, hw * 0.72]];
    pb.add(latheX(rim, 40), type === 'spoke' ? m.metal('#b8bdc4', 0.25) : wheelMat);
    // Hub
    pb.add(latheX([[0.0, -hw * 0.6], [0.05, -hw * 0.6], [0.06, -hw * 0.3], [0.06, hw * 0.3], [0.05, hw * 0.6], [0.0, hw * 0.6]], 20), type === 'spoke' ? m.metal('#8d939b', 0.3) : wheelMat);
    // Brake discs
    const twin = front && this.spec.style !== 'scooter' && this.spec.style !== 'classic';
    const discR = front ? R * 0.52 : R * 0.36;
    const disc = (x: number) => {
      const g = latheX([[discR * 0.62, -0.003], [discR, -0.003], [discR, 0.003], [discR * 0.62, 0.003]], 36);
      g.translate(x, 0, 0);
      pb.add(g, m.metal('#c4c8cd', 0.28));
      const carrier = latheX([[0.06, -0.004], [discR * 0.64, -0.004], [discR * 0.64, 0.004], [0.06, 0.004]], 10);
      carrier.translate(x, 0, 0);
      pb.add(carrier, this.spec.style === 'sport' || this.spec.style === 'hyper' ? m.gold() : m.metal('#3a3c40', 0.3));
    };
    if (type !== 'disc' || front) {
      if (twin) {
        disc(-hw * 0.75 - 0.012);
        disc(hw * 0.75 + 0.012);
      } else disc(front ? -hw * 0.75 - 0.012 : hw * 0.75 + 0.012);
    }
    grp.add(pb.build());

    // Spokes (separate so they can be swapped for a motion blur disc at speed).
    const sp = new PartBuilder();
    const spokeMat = type === 'spoke' ? m.metal('#d0d4d9', 0.2) : wheelMat;
    const addSpoke = (a: number, width: number, offset = 0) => {
      const inner = 0.055;
      const g = new THREE.BoxGeometry(0.018, rimR - inner - 0.01, width);
      g.translate(0, inner + (rimR - inner) / 2, offset);
      g.rotateX(a);
      sp.add(g, spokeMat);
    };
    if (type === 'spoke') {
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const side = i % 2 === 0 ? -1 : 1;
        const hubP = V(side * hw * 0.5, Math.sin(a + side * 0.25) * 0.055, Math.cos(a + side * 0.25) * 0.055);
        const rimP = V(side * hw * 0.2, Math.sin(a) * (rimR - 0.015), Math.cos(a) * (rimR - 0.015));
        sp.add(rod(hubP, rimP, 0.0025, 0.0025, 4), spokeMat);
      }
    } else if (type === 'disc') {
      const g = latheX([[0.05, -hw * 0.45], [rimR - 0.01, -hw * 0.3], [rimR - 0.01, hw * 0.3], [0.05, hw * 0.45]], 36);
      sp.add(g, m.chrome());
    } else {
      const n = type === 'cast3' ? 3 : type === 'cast5' ? 5 : type === 'cast7' ? 7 : type === 'scooter' ? 5 : 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        if (type === 'cast3') {
          addSpoke(a - 0.12, 0.012);
          addSpoke(a + 0.12, 0.012);
        } else if (type === 'cast5') {
          addSpoke(a - 0.06, 0.012);
          addSpoke(a + 0.06, 0.012);
        } else addSpoke(a, 0.014);
      }
    }
    const spokes = sp.build();
    grp.add(spokes);
    this.spokes.push(spokes);
    // Motion-blurred disc for high wheel speeds (avoids wagon-wheel aliasing).
    const blurMat = new THREE.MeshStandardMaterial({
      color: (wheelMat as THREE.MeshStandardMaterial).color ?? new THREE.Color('#222'),
      transparent: true,
      opacity: 0,
      roughness: 0.4,
      metalness: 0.6,
      depthWrite: false,
    });
    const blur = new THREE.Mesh(latheX([[0.05, -hw * 0.3], [rimR - 0.012, -hw * 0.3], [rimR - 0.012, hw * 0.3], [0.05, hw * 0.3]], 32), blurMat);
    blur.visible = false;
    grp.add(blur);
    this.wheelBlur.push(blur);
    return grp;
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
    const inv = new THREE.Matrix4().copy(this.chassis.matrix).invert();
    const frontAxle = V(0, f.Rf, -f.L).applyMatrix4(inv);
    const u = V(0, Math.cos(f.rake), Math.sin(f.rake));
    const ell = f.head.clone().sub(frontAxle).dot(u);
    this.forkLower.position.y = -clamp(ell, f.forkLen - 0.14, f.forkLen + 0.02);
    // Swingarm points at the rear axle.
    const rearAxle = V(0, f.Rr, 0).applyMatrix4(inv).sub(f.pivot);
    this.swingarm.rotation.x = -(Math.atan2(rearAxle.y, rearAxle.z) - this.swingRest);
    this.steer.rotation.y = -s.steer;
    // Wheel spin & motion blur.
    this.spin -= s.wheelSpeed * s.dt;
    this.spin %= Math.PI * 2;
    this.frontWheel.rotation.x = this.spin * (f.Rr / f.Rf);
    this.rearWheel.rotation.x = this.spin;
    const blur = smoothstep(25, 60, Math.abs(s.wheelSpeed));
    for (const b of this.wheelBlur) {
      b.visible = blur > 0.01;
      (b.material as THREE.MeshStandardMaterial).opacity = blur * 0.85;
    }
    for (const sp of this.spokes) sp.visible = blur < 0.97;
    // Lights
    this.tailLight.emissiveIntensity = 1.2 + s.brake * 7;
    this.headLight.emissiveIntensity = s.headlight ? 6 : 1.6;
    if (this.headSpot) this.headSpot.visible = s.headlight;
  }

  /** Redraw the TFT dashboard (rpm bar, speed, gear). */
  updateDash(rpmFrac: number, gear: number, speed: number, shiftLight: boolean, units: 'kmh' | 'mph'): void {
    const g = this.dashCtx;
    const W = 256;
    const H = 128;
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, W, H);
    // rpm bar
    const segs = 24;
    for (let i = 0; i < segs; i++) {
      const on = i / segs < rpmFrac;
      const red = i / segs > 0.82;
      g.fillStyle = on ? (red ? '#ff3030' : i / segs > 0.65 ? '#ffb020' : '#36d1ff') : '#16202a';
      const h = 10 + (i / segs) * 22;
      g.fillRect(10 + i * 9.6, 44 - h, 7, h);
    }
    if (shiftLight) {
      g.fillStyle = '#ff2a2a';
      g.fillRect(0, 0, W, 6);
    }
    g.fillStyle = '#e8f6ff';
    g.font = 'bold 54px Arial, sans-serif';
    g.textAlign = 'right';
    g.fillText(String(Math.round(speed)), 170, 112);
    g.font = 'bold 16px Arial, sans-serif';
    g.fillStyle = '#7fa8c4';
    g.fillText(units === 'kmh' ? 'km/h' : 'mph', 214, 112);
    g.textAlign = 'center';
    g.font = 'bold 44px Arial, sans-serif';
    g.fillStyle = '#ffd24a';
    g.fillText(gear <= 0 ? 'N' : String(gear), 226, 84);
    this.dashTexture.needsUpdate = true;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.dashTexture.dispose();
    this.tailLight.dispose();
    this.headLight.dispose();
    this.drl.dispose();
  }
}

function L_FRONT(f: Frame): number {
  return f.L + 0.1;
}

function plateText(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const city = String(1 + (h % 81)).padStart(2, '0');
  const letters = 'ABCDEFGHJKLMNPRSTUVYZ';
  const l = letters[h % letters.length] + letters[(h >>> 5) % letters.length];
  return `${city} ${l} ${100 + (h % 899)}`;
}
