import * as THREE from 'three';
import { VEHICLES, type VehicleKind } from '../data/vehicles';
import { PartBuilder, latheX, roundedBox, splitTriangles, superLoft, type LoftStation } from './geom';
import type { Materials } from './materials';

/** Material slots of a traffic vehicle; lights get swapped between on/off materials. */
export type VehicleSlot = 'paint' | 'trim' | 'glass' | 'chrome' | 'head' | 'tail' | 'indL' | 'indR' | 'beacon' | 'cargo' | 'sign';

export interface VehicleGeometrySet {
  kind: VehicleKind;
  parts: Partial<Record<VehicleSlot, THREE.BufferGeometry>>;
  /** Wheel centres in vehicle space (x, y, z) with radius. */
  wheels: { x: number; y: number; z: number; r: number }[];
  /** Headlight and taillight glow positions. */
  headGlow: THREE.Vector3[];
  tailGlow: THREE.Vector3[];
  indicatorGlowL: THREE.Vector3[];
  indicatorGlowR: THREE.Vector3[];
  beaconGlow: THREE.Vector3[];
}

const cache = new Map<VehicleKind, VehicleGeometrySet>();

type Builders = Record<VehicleSlot, PartBuilder>;

function builders(): Builders {
  return {
    paint: new PartBuilder(), trim: new PartBuilder(), glass: new PartBuilder(), chrome: new PartBuilder(), head: new PartBuilder(),
    tail: new PartBuilder(), indL: new PartBuilder(), indR: new PartBuilder(), beacon: new PartBuilder(), cargo: new PartBuilder(), sign: new PartBuilder(),
  };
}

const DUMMY = new THREE.MeshBasicMaterial();

/** Merge everything added to a builder into a single geometry. */
function bake(pb: PartBuilder): THREE.BufferGeometry | undefined {
  if (pb.empty) return undefined;
  const g = pb.build();
  const mesh = g.children[0] as THREE.Mesh | undefined;
  return mesh?.geometry;
}

function add(b: Builders, slot: VehicleSlot, g: THREE.BufferGeometry, pos?: [number, number, number], rot?: [number, number, number]): void {
  if (pos) b[slot].place(g, DUMMY, pos, rot ?? [0, 0, 0]);
  else b[slot].add(g, DUMMY);
}

/** Car-like body: lower shell + greenhouse, painted/glazed by height. */
function carBody(b: Builders, L: number, W: number, H: number, opts: { hood: number; trunk: number; belt: number; roofFront: number; roofRear: number; hatch?: boolean; pickup?: boolean; boxy?: number }): void {
  const hl = L / 2;
  const n = opts.boxy ?? 3.4;
  const belt = opts.belt;
  const lower: LoftStation[] = [
    { z: -hl, w: W * 0.8, yb: 0.3, yt: 0.62, n: 3 },
    { z: -hl + 0.12, w: W * 0.96, yb: 0.22, yt: opts.hood * 0.94, n },
    { z: -hl + 0.6, w: W, yb: 0.2, yt: opts.hood, n },
    { z: -hl + L * 0.32, w: W, yb: 0.2, yt: belt, n },
    { z: hl - L * 0.25, w: W, yb: 0.2, yt: belt, n },
    { z: hl - 0.45, w: W * 0.99, yb: 0.22, yt: opts.trunk, n },
    { z: hl - 0.06, w: W * 0.9, yb: 0.3, yt: opts.trunk * 0.95, n: 3 },
    { z: hl, w: W * 0.8, yb: 0.34, yt: opts.trunk * 0.85, n: 3 },
  ];
  const geo = superLoft(lower, 28, 4);
  // Black plastic cladding on the lower edge and bumpers.
  const [clad, painted] = splitTriangles(geo, (_x, y) => y < 0.34);
  add(b, 'trim', clad);
  add(b, 'paint', painted);

  if (!opts.pickup) {
    const zf = -hl + L * opts.roofFront;
    const zr = hl - L * opts.roofRear;
    const roof = H;
    const gh: LoftStation[] = [
      { z: zf - 0.55, w: W * 0.9, yb: belt - 0.04, yt: belt + 0.02, n: 3 },
      { z: zf, w: W * 0.82, yb: belt - 0.04, yt: roof - 0.02, n: 3.2 },
      { z: (zf + zr) / 2, w: W * 0.84, yb: belt - 0.04, yt: roof, n: 3.4 },
      { z: zr, w: W * 0.82, yb: belt - 0.04, yt: roof - 0.03, n: 3.2 },
      { z: zr + (opts.hatch ? 0.12 : 0.5), w: W * 0.9, yb: belt - 0.04, yt: opts.hatch ? roof - 0.25 : belt + 0.02, n: 3 },
    ];
    const g2 = superLoft(gh, 28, 4);
    const [roofPart, sides] = splitTriangles(g2, (_x, y) => y > roof - 0.06);
    add(b, 'paint', roofPart);
    add(b, 'glass', sides);
    // Pillars (A/B/C) as thin paint strips over the glass.
    for (const s of [-1, 1]) {
      const bz = (zf + zr) / 2;
      b.paint.place(new THREE.BoxGeometry(0.03, roof - belt - 0.04, 0.09), DUMMY, [s * W * 0.43, (belt + roof) / 2, bz]);
    }
  } else {
    // Pickup: cab + open bed.
    const zf = -hl + L * 0.3;
    const zr = -hl + L * 0.58;
    const gh: LoftStation[] = [
      { z: zf - 0.5, w: W * 0.9, yb: belt - 0.04, yt: belt + 0.02, n: 3 },
      { z: zf, w: W * 0.84, yb: belt - 0.04, yt: H - 0.02, n: 3.4 },
      { z: zr - 0.1, w: W * 0.86, yb: belt - 0.04, yt: H, n: 3.6 },
      { z: zr, w: W * 0.88, yb: belt - 0.04, yt: belt + 0.02, n: 3.6 },
    ];
    const g2 = superLoft(gh, 28, 4);
    const [roofPart, sides] = splitTriangles(g2, (_x, y) => y > H - 0.06);
    add(b, 'paint', roofPart);
    add(b, 'glass', sides);
    // Bed walls
    const bedL = hl - zr - 0.1;
    for (const s of [-1, 1]) add(b, 'paint', new THREE.BoxGeometry(0.06, 0.4, bedL), [s * (W / 2 - 0.05), belt + 0.15, zr + bedL / 2 + 0.05]);
    add(b, 'paint', new THREE.BoxGeometry(W - 0.1, 0.4, 0.06), [0, belt + 0.15, hl - 0.06]);
    add(b, 'trim', new THREE.BoxGeometry(W - 0.12, 0.04, bedL), [0, belt - 0.04, zr + bedL / 2 + 0.05]);
  }
  // Grille and mirrors
  add(b, 'trim', roundedBox(W * 0.5, 0.16, 0.06, 0.03), [0, 0.5, -hl + 0.02]);
  for (const s of [-1, 1]) add(b, 'paint', roundedBox(0.16, 0.1, 0.08, 0.03), [s * (W / 2 + 0.06), belt + 0.1, -hl + L * opts.roofFront - 0.05]);
}

function lights(b: Builders, set: VehicleGeometrySet, L: number, W: number, headY: number, tailY: number, wide = false): void {
  const hl = L / 2;
  for (const s of [-1, 1]) {
    add(b, 'head', roundedBox(wide ? 0.22 : 0.26, 0.09, 0.05, 0.02), [s * W * 0.36, headY, -hl + 0.02]);
    add(b, 'tail', roundedBox(wide ? 0.18 : 0.3, 0.1, 0.05, 0.02), [s * W * 0.38, tailY, hl - 0.01]);
    set.headGlow.push(new THREE.Vector3(s * W * 0.36, headY, -hl - 0.03));
    set.tailGlow.push(new THREE.Vector3(s * W * 0.38, tailY, hl + 0.03));
    const slot: VehicleSlot = s < 0 ? 'indL' : 'indR';
    add(b, slot, roundedBox(0.08, 0.05, 0.04, 0.015), [s * W * 0.46, headY - 0.02, -hl + 0.04]);
    add(b, slot, roundedBox(0.08, 0.05, 0.04, 0.015), [s * W * 0.46, tailY + 0.08, hl - 0.02]);
    const arr = s < 0 ? set.indicatorGlowL : set.indicatorGlowR;
    arr.push(new THREE.Vector3(s * W * 0.47, headY - 0.02, -hl - 0.02), new THREE.Vector3(s * W * 0.47, tailY + 0.08, hl + 0.02));
  }
}

function boxBody(b: Builders, slot: VehicleSlot, w: number, h: number, l: number, y0: number, z: number, r = 0.08): void {
  add(b, slot, roundedBox(w, h, l, r), [0, y0 + h / 2, z]);
}

function buildSet(kind: VehicleKind): VehicleGeometrySet {
  const a = VEHICLES[kind];
  const L = a.length;
  const W = a.width;
  const H = a.height;
  const set: VehicleGeometrySet = { kind, parts: {}, wheels: [], headGlow: [], tailGlow: [], indicatorGlowL: [], indicatorGlowR: [], beaconGlow: [] };
  const b = builders();
  const hl = L / 2;
  switch (kind) {
    case 'sedan':
    case 'taxi':
    case 'police':
      carBody(b, L, W, H, { hood: 0.84, trunk: 0.9, belt: 0.95, roofFront: 0.36, roofRear: 0.3 });
      lights(b, set, L, W, 0.72, 0.84);
      set.wheels = wheels4(L, W, 0.32, 0.36, 0.33);
      if (kind === 'taxi') {
        add(b, 'sign', roundedBox(0.5, 0.14, 0.2, 0.04), [0, H + 0.08, 0.05]);
      }
      if (kind === 'police') {
        add(b, 'trim', roundedBox(1.1, 0.06, 0.24, 0.02), [0, H + 0.03, 0.0]);
        add(b, 'beacon', roundedBox(0.48, 0.09, 0.2, 0.03), [-0.28, H + 0.1, 0.0]);
        add(b, 'beacon', roundedBox(0.48, 0.09, 0.2, 0.03), [0.28, H + 0.1, 0.0]);
        set.beaconGlow.push(new THREE.Vector3(-0.3, H + 0.12, 0), new THREE.Vector3(0.3, H + 0.12, 0));
      }
      break;
    case 'hatch':
      carBody(b, L, W, H, { hood: 0.86, trunk: 1.0, belt: 0.98, roofFront: 0.36, roofRear: 0.08, hatch: true });
      lights(b, set, L, W, 0.74, 0.95);
      set.wheels = wheels4(L, W, 0.3, 0.3, 0.32);
      break;
    case 'suv':
      carBody(b, L, W, H, { hood: 1.04, trunk: 1.14, belt: 1.14, roofFront: 0.34, roofRear: 0.07, hatch: true, boxy: 3.8 });
      lights(b, set, L, W, 0.92, 1.05);
      set.wheels = wheels4(L, W, 0.36, 0.38, 0.38);
      add(b, 'chrome', new THREE.BoxGeometry(0.04, 0.04, L * 0.5), [-W * 0.38, H + 0.02, 0.1]);
      add(b, 'chrome', new THREE.BoxGeometry(0.04, 0.04, L * 0.5), [W * 0.38, H + 0.02, 0.1]);
      break;
    case 'pickup':
      carBody(b, L, W, H, { hood: 1.1, trunk: 1.1, belt: 1.14, roofFront: 0.3, roofRear: 0.4, pickup: true, boxy: 4 });
      lights(b, set, L, W, 0.95, 1.0);
      set.wheels = wheels4(L, W, 0.38, 0.45, 0.4);
      add(b, 'chrome', roundedBox(W * 0.6, 0.22, 0.05, 0.03), [0, 0.86, -hl + 0.02]);
      break;
    case 'van': {
      const st: LoftStation[] = [
        { z: -hl, w: W * 0.85, yb: 0.32, yt: 0.8, n: 3 },
        { z: -hl + 0.25, w: W, yb: 0.26, yt: 1.15, n: 4 },
        { z: -hl + 0.9, w: W, yb: 0.26, yt: H - 0.04, n: 4.5 },
        { z: hl - 0.1, w: W, yb: 0.26, yt: H, n: 5 },
        { z: hl, w: W * 0.96, yb: 0.3, yt: H - 0.05, n: 4.5 },
      ];
      const g = superLoft(st, 28, 4);
      const [clad, rest] = splitTriangles(g, (_x, y) => y < 0.36);
      add(b, 'trim', clad);
      // Windscreen band at the front, painted cargo sides.
      const [front, body] = splitTriangles(rest, (_x, y, z) => z < -hl + 0.95 && y > 1.15 && y < H - 0.15);
      add(b, 'glass', front);
      const [sideWin, body2] = splitTriangles(body, (x, y, z) => z < -hl + 1.5 && y > 1.2 && y < H - 0.25 && Math.abs(x) > W * 0.45);
      add(b, 'glass', sideWin);
      add(b, 'paint', body2);
      lights(b, set, L, W, 0.8, 1.0);
      set.wheels = wheels4(L, W, 0.36, 0.55, 0.36);
      break;
    }
    case 'truck': {
      const cabL = 2.0;
      // Cab
      const cab: LoftStation[] = [
        { z: -hl, w: W * 0.9, yb: 0.45, yt: 2.2, n: 5 },
        { z: -hl + 0.15, w: W, yb: 0.42, yt: 2.75, n: 6 },
        { z: -hl + cabL, w: W, yb: 0.42, yt: 2.8, n: 6 },
      ];
      const g = superLoft(cab, 24, 3);
      const [ws, cabBody] = splitTriangles(g, (_x, y, z) => z < -hl + 0.3 && y > 1.65 && y < 2.55);
      add(b, 'glass', ws);
      add(b, 'paint', cabBody);
      // Cargo box
      boxBody(b, 'cargo', W, H - 1.1, L - cabL - 0.2, 1.05, -hl + cabL + 0.15 + (L - cabL - 0.2) / 2, 0.05);
      add(b, 'trim', new THREE.BoxGeometry(W * 0.9, 0.25, L - 0.4), [0, 0.75, 0.1]);
      add(b, 'trim', roundedBox(W * 0.7, 0.4, 0.06, 0.03), [0, 0.95, -hl + 0.01]);
      // Rear doors: frame, hinges and the under-run bar.
      add(b, 'trim', new THREE.BoxGeometry(0.05, H - 1.2, 0.03), [0, 1.05 + (H - 1.1) / 2, hl + 0.06]);
      for (const sx of [-1, 1]) add(b, 'chrome', new THREE.BoxGeometry(0.04, H - 1.3, 0.04), [sx * (W / 2 - 0.08), 1.05 + (H - 1.1) / 2, hl + 0.07]);
      add(b, 'trim', new THREE.BoxGeometry(W * 0.92, 0.12, 0.12), [0, 0.55, hl + 0.02]);
      lights(b, set, L, W, 0.8, 1.0, true);
      set.wheels = [
        ...pair(-hl + 1.2, W, 0.5, 0.5),
        ...pair(hl - 1.6, W, 0.5, 0.5),
        ...pair(hl - 0.5, W, 0.5, 0.5),
      ];
      break;
    }
    case 'semi': {
      const cabL = 2.4;
      const cab: LoftStation[] = [
        { z: -hl, w: W * 0.9, yb: 0.55, yt: 2.4, n: 5 },
        { z: -hl + 0.2, w: W, yb: 0.5, yt: 3.2, n: 6 },
        { z: -hl + cabL, w: W, yb: 0.5, yt: 3.3, n: 6 },
      ];
      const g = superLoft(cab, 24, 3);
      const [ws, cabBody] = splitTriangles(g, (_x, y, z) => z < -hl + 0.35 && y > 1.9 && y < 2.8);
      add(b, 'glass', ws);
      add(b, 'paint', cabBody);
      // Trailer
      const tl = L - cabL - 0.6;
      boxBody(b, 'cargo', W, H - 1.25, tl, 1.2, hl - tl / 2, 0.04);
      add(b, 'trim', new THREE.BoxGeometry(W * 0.86, 0.3, L - 0.5), [0, 0.95, 0.2]);
      add(b, 'chrome', roundedBox(W * 0.72, 0.6, 0.06, 0.04), [0, 1.2, -hl + 0.01]);
      add(b, 'trim', new THREE.BoxGeometry(0.05, H - 1.35, 0.03), [0, 1.2 + (H - 1.25) / 2, hl + 0.05]);
      for (const sx of [-1, 1]) add(b, 'chrome', new THREE.BoxGeometry(0.04, H - 1.4, 0.04), [sx * (W / 2 - 0.08), 1.2 + (H - 1.25) / 2, hl + 0.06]);
      add(b, 'trim', new THREE.BoxGeometry(W * 0.92, 0.12, 0.12), [0, 0.6, hl + 0.02]);
      for (const s of [-1, 1]) add(b, 'chrome', new THREE.CylinderGeometry(0.08, 0.08, 1.4, 12), [s * (W / 2 - 0.05), 2.6, -hl + cabL + 0.1]);
      lights(b, set, L, W, 0.85, 1.05, true);
      set.wheels = [
        ...pair(-hl + 1.3, W, 0.52, 0.52),
        ...pair(-hl + 3.0, W, 0.52, 0.52),
        ...pair(-hl + 4.3, W, 0.52, 0.52),
        ...pair(hl - 2.6, W, 0.52, 0.52),
        ...pair(hl - 1.4, W, 0.52, 0.52),
      ];
      break;
    }
    case 'bus': {
      const st: LoftStation[] = [
        { z: -hl, w: W * 0.94, yb: 0.35, yt: H - 0.15, n: 5 },
        { z: -hl + 0.2, w: W, yb: 0.3, yt: H, n: 6 },
        { z: hl - 0.2, w: W, yb: 0.3, yt: H, n: 6 },
        { z: hl, w: W * 0.94, yb: 0.35, yt: H - 0.1, n: 5 },
      ];
      const g = superLoft(st, 28, 3);
      const [win, body] = splitTriangles(
        g,
        (x, y, z) =>
          (y > 1.25 && y < H - 0.35 && Math.abs(x) > W * 0.4) ||
          (z < -hl + 0.15 && y > 0.95 && y < H - 0.25) ||
          (z > hl - 0.12 && y > 1.6 && y < H - 0.4 && Math.abs(x) < W * 0.42),
      );
      add(b, 'glass', win);
      const [clad, paint] = splitTriangles(body, (_x, y) => y < 0.45);
      add(b, 'trim', clad);
      add(b, 'paint', paint);
      lights(b, set, L, W, 0.75, 1.0, true);
      add(b, 'sign', roundedBox(W * 0.7, 0.22, 0.04, 0.02), [0, H - 0.22, -hl - 0.01]);
      add(b, 'trim', roundedBox(W * 0.8, 0.5, 0.05, 0.03), [0, 0.85, hl + 0.005]);
      add(b, 'chrome', new THREE.BoxGeometry(W * 0.86, 0.06, 0.06), [0, 0.42, hl + 0.01]);
      set.wheels = [...pair(-hl + 2.6, W, 0.5, 0.5), ...pair(hl - 3.2, W, 0.5, 0.5)];
      break;
    }
  }
  for (const slot of Object.keys(b) as VehicleSlot[]) {
    const g = bake(b[slot]);
    if (g) {
      // Cached across runs: never disposed with a scene.
      g.userData.shared = true;
      set.parts[slot] = g;
    }
  }
  return set;
}

function pair(z: number, W: number, r: number, y: number): { x: number; y: number; z: number; r: number }[] {
  return [
    { x: -(W / 2 - 0.22), y, z, r },
    { x: W / 2 - 0.22, y, z, r },
  ];
}

function wheels4(L: number, W: number, r: number, overhangF: number, y: number): { x: number; y: number; z: number; r: number }[] {
  const hl = L / 2;
  const zf = -hl + overhangF + 0.55;
  const zr = hl - overhangF - 0.5;
  return [...pair(zf, W, r, y), ...pair(zr, W, r, y)];
}

export function vehicleGeometry(kind: VehicleKind): VehicleGeometrySet {
  let s = cache.get(kind);
  if (!s) {
    s = buildSet(kind);
    cache.set(kind, s);
  }
  return s;
}

/** Unit wheel (radius 1, width 1) with vertex colours: dark tyre, silver rim. */
export function wheelGeometry(): THREE.BufferGeometry {
  const tyre = latheX([[0.62, -0.5], [0.8, -0.5], [0.97, -0.42], [1, -0.25], [1, 0.25], [0.97, 0.42], [0.8, 0.5], [0.62, 0.5]], 20);
  // Rim faces on both sides so the same wheel works left and right.
  const rimA = latheX([[0.0, 0.42], [0.62, 0.46], [0.64, 0.5], [0.0, 0.5]], 20).toNonIndexed();
  const rimB = latheX([[0.0, -0.5], [0.64, -0.5], [0.62, -0.46], [0.0, -0.42]], 20).toNonIndexed();
  const r2 = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const a = rimA.attributes[name].array as Float32Array;
    const b = rimB.attributes[name].array as Float32Array;
    const c = new Float32Array(a.length + b.length);
    c.set(a);
    c.set(b, a.length);
    r2.setAttribute(name, new THREE.BufferAttribute(c, 3));
  }
  r2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((r2.attributes.position.count) * 2), 2));
  const t2 = tyre.toNonIndexed();
  const paint = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
  };
  paint(t2, new THREE.Color('#151515'));
  paint(r2, new THREE.Color('#9da3aa'));
  const out = new THREE.BufferGeometry();
  const merge = (name: string, size: number) => {
    const a = t2.attributes[name].array as Float32Array;
    const b = r2.attributes[name].array as Float32Array;
    const c = new Float32Array(a.length + b.length);
    c.set(a);
    c.set(b, a.length);
    out.setAttribute(name, new THREE.BufferAttribute(c, size));
  };
  merge('position', 3);
  merge('normal', 3);
  merge('color', 3);
  return out;
}

/** Materials shared by all traffic vehicles. Lights have on/off variants that get swapped. */
export class VehicleMaterials {
  readonly trim: THREE.Material;
  readonly glass: THREE.Material;
  readonly chrome: THREE.Material;
  readonly headOff: THREE.MeshStandardMaterial;
  readonly headOn: THREE.MeshStandardMaterial;
  readonly tailOff: THREE.MeshStandardMaterial;
  readonly tailNight: THREE.MeshStandardMaterial;
  readonly tailBrake: THREE.MeshStandardMaterial;
  readonly indOff: THREE.MeshStandardMaterial;
  readonly indOn: THREE.MeshStandardMaterial;
  readonly beaconBlue: THREE.MeshStandardMaterial;
  readonly beaconRed: THREE.MeshStandardMaterial;
  readonly beaconOff: THREE.MeshStandardMaterial;
  readonly sign: THREE.Material;
  readonly wheel: THREE.MeshStandardMaterial;

  constructor(private mats: Materials) {
    this.trim = mats.plastic('#1a1b1d');
    this.glass = new THREE.MeshPhysicalMaterial({ color: '#1a222b', roughness: 0.05, metalness: 0.3, clearcoat: 1, envMapIntensity: 1.5 });
    this.chrome = mats.chrome();
    this.headOff = mats.makeLight('#dfe6ee', 0.25);
    this.headOff.color.set('#c8ced6');
    this.headOff.metalness = 0.6;
    this.headOff.roughness = 0.1;
    this.headOn = mats.makeLight('#fff4e0', 9);
    this.tailOff = mats.makeLight('#ff1a12', 0.25);
    this.tailOff.color.set('#5a0a0a');
    this.tailNight = mats.makeLight('#ff1a12', 2.5);
    this.tailBrake = mats.makeLight('#ff2010', 9);
    this.indOff = mats.makeLight('#ff9a00', 0.15);
    this.indOff.color.set('#6b4a10');
    this.indOn = mats.makeLight('#ff9a00', 8);
    this.beaconBlue = mats.makeLight('#2a5bff', 12);
    this.beaconRed = mats.makeLight('#ff2020', 12);
    this.beaconOff = mats.makeLight('#3a3a50', 0.3);
    this.sign = mats.makeLight('#ffe680', 1.5);
    (this.sign as THREE.MeshStandardMaterial).color.set('#f2c200');
    this.wheel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.35 });
  }

  paint(color: string): THREE.Material {
    return this.mats.paint(color, 0.35);
  }

  cargo(color: string): THREE.Material {
    return this.mats.matte(color === '#e9eaec' ? '#dfe1e4' : color, 0.6);
  }
}

/** Per-car mesh bundle. */
export class VehicleObject {
  readonly group = new THREE.Group();
  readonly meshes: Partial<Record<VehicleSlot, THREE.Mesh>> = {};
  constructor(
    readonly set: VehicleGeometrySet,
    color: string,
    vm: VehicleMaterials,
  ) {
    const mat: Record<VehicleSlot, THREE.Material> = {
      paint: vm.paint(color),
      trim: vm.trim,
      glass: vm.glass,
      chrome: vm.chrome,
      head: vm.headOff,
      tail: vm.tailOff,
      indL: vm.indOff,
      indR: vm.indOff,
      beacon: vm.beaconOff,
      cargo: vm.cargo(color),
      sign: vm.sign,
    };
    for (const [slot, g] of Object.entries(set.parts) as [VehicleSlot, THREE.BufferGeometry][]) {
      const m = new THREE.Mesh(g, mat[slot]);
      m.castShadow = slot === 'paint' || slot === 'cargo' || slot === 'trim';
      m.receiveShadow = false;
      this.meshes[slot] = m;
      this.group.add(m);
    }
  }

  setColor(color: string, vm: VehicleMaterials): void {
    if (this.meshes.paint) this.meshes.paint.material = vm.paint(color);
    if (this.meshes.cargo) this.meshes.cargo.material = vm.cargo(color);
  }
}
