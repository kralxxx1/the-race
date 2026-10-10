import * as THREE from 'three';
import { RY, RZ, T, mul, type KitContext } from '../context';
import { MeshData, bolt, circle, extrude, lathe, rod, roundRect, sweep, torusX, type P2, type P3 } from '../mesh';
import { F, hard, Micro, tint, vary, type Finish } from '../sink';
import { tyreProfile, type TyreSize } from '../tyre';
import type { BrakeSpec, WheelDesign, WheelEnd } from '../types';
import { rearLayout } from './layout';

const INCH = 0.0254;

export interface WheelGeom {
  tyre: TyreSize;
  /** Rim width (m). */
  rimW: number;
  /** Inner barrel radius (where spokes meet the rim). */
  barrelR: number;
  /** Hub half-width (disc / sprocket mounting faces). */
  hubHalf: number;
  hubR: number;
}

export function wheelGeom(t: TyreSize, end: WheelEnd, front: boolean): WheelGeom {
  const rimW = end.rimWidthIn * INCH;
  return {
    tyre: t,
    rimW,
    barrelR: t.rimR - 0.024,
    hubHalf: front ? 0.062 : 0.078,
    hubR: front ? 0.05 : 0.068,
  };
}

/**
 * Builds one complete wheel (tyre, rim, spokes, hub, discs, sprocket, valve) into
 * the wheel's groups. Wheel-local frame: axle along X, origin at the axle centre.
 */
export function buildWheel(ctx: KitContext, front: boolean): WheelGeom {
  const bp = ctx.bp;
  const hp = ctx.hp;
  const end = front ? bp.front : bp.rear;
  const design = front ? bp.frontWheel : bp.rearWheel;
  const t = front ? hp.front : hp.rear;
  const g = wheelGeom(t, end, front);
  const axle: P3 = front ? hp.frontAxle : hp.rearAxle;
  const group = front ? 'frontWheel' : 'rearWheel';
  const spokeGroup = front ? 'frontSpokes' : 'rearSpokes';
  const place = T(axle[0], axle[1], axle[2]);
  const add = (m: MeshData, f: Finish, local?: THREE.Matrix4, grp: 'frontWheel' | 'rearWheel' | 'frontSpokes' | 'rearSpokes' = group) =>
    ctx.add(grp, m, f, local ? mul(place, local) : place);

  // ── tyre ──
  const around = ctx.seg(front ? 120 : 132, 24);
  const prof = tyreProfile(t, g.rimW, end.crown ?? (front ? 0.9 : 1), ctx.seg(12, 6));
  const tyre = lathe(prof, { segs: around, axis: 'x' });
  add(tyre, F.tyre);

  // ── rim ──
  const wheelFin: Finish =
    design.type === 'wire'
      ? design.rimColor
        ? hard(design.rimColor, 0.9, 0.28, 0.4, Micro.anodised)
        : F.polishedAlu
      : hard(design.color, design.type === 'forged' ? 0.55 : 0.4, 0.3, 1, Micro.plain);
  buildRim(ctx, g, design, wheelFin, (m, f) => add(m, f));

  // ── hub, spokes ──
  const singleSided = !front && (bp.swingarm.type === 'singleSided' || bp.swingarm.type === 'shaft');
  const ssSide = bp.swingarm.side === 'right' ? 1 : -1;
  if (design.type === 'wire') {
    buildWireWheel(ctx, g, design, front, (m, f) => add(m, f, undefined, spokeGroup), (m, f) => add(m, f));
  } else if (design.type === 'disc') {
    // Solid custom disc wheel (cruisers): dished alloy faces.
    const r1 = g.barrelR + 0.004;
    const face = lathe(
      [[0.0, -0.06], [0.07, -0.058], [r1 * 0.6, -0.045], [r1, -g.rimW * 0.3], [r1, g.rimW * 0.3], [r1 * 0.6, 0.045], [0.07, 0.058], [0.0, 0.06]],
      { segs: ctx.seg(72, 16), axis: 'x' },
    );
    add(face, vary(F.chrome, { rough: 0.08 }), undefined, spokeGroup);
  } else {
    buildCastSpokes(ctx, g, design, front, wheelFin, (m, f) => add(m, f, undefined, spokeGroup));
  }
  const RL = rearLayout(ctx);
  const axleHalf = front ? bp.fork.spacing / 2 + 0.032 : RL.armX + 0.028;
  buildHub(ctx, g, design, front, singleSided, ssSide, axleHalf, wheelFin, (m, f, l) => add(m, f, l));

  // ── brakes on the wheel ──
  const brake = front ? bp.frontBrake : bp.rearBrake;
  if (brake.caliper !== 'drum' && brake.discs > 0) {
    const discSide = front ? 1 : singleSided ? ssSide : bp.drive.side === 'left' ? 1 : -1;
    const offsets = brake.discs === 2 ? [-1, 1] : [front ? -1 : discSide];
    for (const s of offsets) {
      const x = front ? s * (g.hubHalf + 0.008) : s * RL.discX;
      if (!front && Math.abs(x) > g.hubHalf + 0.004) {
        // Disc carrier spacer from the hub flange out to the disc.
        add(lathe([[0.028, 0], [0.05, 0], [0.05, Math.abs(x) - g.hubHalf], [0.028, Math.abs(x) - g.hubHalf]], { segs: ctx.seg(28, 10), axis: 'x', sharp: true }), F.castAlu, mul(T(Math.sign(x) * g.hubHalf, 0, 0), x < 0 ? new THREE.Matrix4().makeScale(-1, 1, 1) : new THREE.Matrix4()));
      }
      const disc = buildDisc(ctx, brake, front);
      for (const [m, f] of disc) add(m, f, T(x, 0, 0));
      ctx.anchor(`${front ? 'f' : 'r'}Disc${s > 0 ? 'R' : 'L'}`, [axle[0] + x, axle[1], axle[2]]);
    }
  } else if (brake.caliper === 'drum') {
    const drum = lathe([[0.0, -0.04], [0.09, -0.04], [0.095, -0.03], [0.095, 0.03], [0.09, 0.04], [0, 0.04]], { segs: ctx.seg(40, 12), axis: 'x', sharp: [1, 4] });
    add(drum, F.castAlu, T(front ? -0.035 : 0.035, 0, 0));
  }

  // ── rear sprocket / belt pulley ──
  if (!front && (bp.drive.type === 'chain' || bp.drive.type === 'belt')) {
    const side = bp.drive.side === 'left' ? -1 : 1;
    const x = side * RL.chainX;
    // Cush-drive sprocket carrier out to the chain line.
    const span = RL.chainX - g.hubHalf;
    add(
      lathe([[0.03, 0], [0.072, 0], [0.075, 0.006], [0.062, span * 0.6], [0.05, span], [0.03, span]], { segs: ctx.seg(32, 10), axis: 'x', sharp: [1, 4] }),
      F.castAlu,
      mul(T(side * g.hubHalf, 0, 0), side < 0 ? new THREE.Matrix4().makeScale(-1, 1, 1) : new THREE.Matrix4()),
    );
    const pitch = bp.drive.pitch ?? 0.015875;
    const sp = bp.drive.type === 'belt' ? buildPulley(ctx, bp.drive.rearTeeth) : buildSprocket(ctx, bp.drive.rearTeeth, pitch, true);
    for (const [m, f] of sp(tint(F.castAlu, bp.drive.sprocketColor))) add(m, f, mul(T(x, 0, 0), RZ(side > 0 ? 0 : Math.PI)));
    ctx.anchor('rearSprocket', [x, hp.Rr, 0]);
    ctx.anchors.set('rearSprocketR', [sprocketPitchR(bp.drive.rearTeeth, pitch), 0, 0]);
  }

  // ── valve stem & balance weights ──
  if (ctx.micro) {
    const vr = t.rimR - 0.006;
    const valve = rod([0, vr, 0], [0, vr - 0.035, 0.012], 0.0035, 0.003, 8);
    add(valve, F.steel, T(-g.rimW * 0.12, 0, 0));
    add(lathe([[0, 0], [0.0045, 0], [0.0045, 0.012], [0, 0.012]], { segs: 8, axis: 'y', sharp: true }), F.black, mul(T(-g.rimW * 0.12, vr - 0.045, 0.016), new THREE.Matrix4().makeRotationX(0.33)));
    for (let i = 0; i < 2; i++) {
      const a = Math.PI * 0.7 + i * 0.12;
      const w = new MeshData().append(roundBoxLocal(0.012, 0.004, 0.02));
      add(w, F.steel, mul(new THREE.Matrix4().makeRotationX(a), T(g.rimW * 0.3, g.barrelR - 0.001, 0)));
    }
  }

  // ── motion blur disc (shown at speed instead of the spokes) ──
  const blur = lathe([[0.03, -g.rimW * 0.22], [g.barrelR, -g.rimW * 0.22], [g.barrelR, g.rimW * 0.22], [0.03, g.rimW * 0.22]], { segs: ctx.seg(48, 16), axis: 'x' });
  add(blur, { ...wheelFin, slot: 'blur' });
  return g;
}

function roundBoxLocal(w: number, h: number, d: number): MeshData {
  return extrude(roundRect(w, h, Math.min(w, h) * 0.3, 2), d, { bevel: Math.min(w, h) * 0.2, plane: 'xy' });
}

/** Rim cross-section revolved: bead seats, drop well, rolled flanges and inner barrel. */
function buildRim(ctx: KitContext, g: WheelGeom, design: WheelDesign, fin: Finish, add: (m: MeshData, f: Finish) => void): void {
  const R = g.tyre.rimR;
  const hw = g.rimW / 2;
  const segsN = ctx.seg(128, 24);
  // Closed profile, travelling so that the outside of the section is on the right (see lathe()).
  const prof: P2[] = [
    [R + 0.0165, -hw - 0.001],
    [R + 0.012, -hw + 0.005],
    [R + 0.002, -hw + 0.009],
    [R, -hw + 0.014],
    [R, -hw * 0.5],
    [R - 0.017, -hw * 0.36],
    [R - 0.017, hw * 0.08],
    [R, hw * 0.25],
    [R, hw - 0.014],
    [R + 0.002, hw - 0.009],
    [R + 0.012, hw - 0.005],
    [R + 0.0165, hw + 0.001],
    [R + 0.0175, hw + 0.004],
    [R + 0.012, hw + 0.006],
    [R - 0.004, hw + 0.004],
    [R - 0.012, hw - 0.002],
    [g.barrelR, hw * 0.5],
    [g.barrelR - 0.002, 0],
    [g.barrelR, -hw * 0.5],
    [R - 0.012, -hw + 0.002],
    [R - 0.004, -hw - 0.004],
    [R + 0.012, -hw - 0.006],
    [R + 0.0175, -hw - 0.004],
  ];
  prof.push(prof[0]);
  add(lathe(prof, { segs: segsN, axis: 'x', sharp: [3, 8, 16, 18] }), fin);
  if (design.machinedLip) {
    // Bright machined band on the outer flange faces.
    for (const s of [-1, 1]) {
      const band = lathe(
        s > 0
          ? [[R - 0.0035, hw + 0.0047], [R + 0.012, hw + 0.0067], [R + 0.0175, hw + 0.0047]]
          : [[R + 0.0175, -hw - 0.0047], [R + 0.012, -hw - 0.0067], [R - 0.0035, -hw - 0.0047]],
        { segs: segsN, axis: 'x' },
      );
      add(band, F.polishedAlu);
    }
  }
  if (design.stripe) {
    for (const s of [-1, 1]) {
      const st = lathe(
        s > 0 ? [[R - 0.006, hw + 0.0052], [R + 0.006, hw + 0.0068]] : [[R + 0.006, -hw - 0.0068], [R - 0.006, -hw - 0.0052]],
        { segs: segsN, axis: 'x' },
      );
      add(st, hard(design.stripe, 0.2, 0.3, 1));
    }
  }
}

/** Spoke arms of cast / forged wheels. */
function buildCastSpokes(ctx: KitContext, g: WheelGeom, d: WheelDesign, front: boolean, fin: Finish, add: (m: MeshData, f: Finish) => void): void {
  const n = Math.max(2, d.spokes);
  const r0 = g.hubR - 0.006;
  const r1 = g.barrelR + 0.006;
  const forged = d.type === 'forged';
  const scooter = d.type === 'scooter';
  const thick = scooter ? 0.03 : forged ? 0.022 : 0.026;
  const wHub = d.shape === 'blade' ? 0.05 : n <= 3 ? 0.05 : n <= 5 ? 0.034 : n <= 7 ? 0.026 : 0.02;
  const wRim = d.shape === 'blade' ? 0.035 : n <= 3 ? 0.026 : 0.018;
  const along = ctx.seg(14, 5);
  const radial = ctx.seg(12, 6);
  // Rounded lens section: [axial, tangential].
  const section = (w: number, h: number): P2[] => {
    const out: P2[] = [];
    for (let i = 0; i < radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      // superellipse: flatter faces for forged wheels
      const e = forged ? 0.45 : 0.6;
      out.push([Math.sign(c) * Math.pow(Math.abs(c), e) * h / 2, Math.sign(s) * Math.pow(Math.abs(s), e) * w / 2]);
    }
    return out;
  };
  const sec = section(1, 1);
  const spokeArm = (a0: number, a1: number, ra: number, rb: number, wa: number, wb: number, bow: number, dish = 0): MeshData => {
    const pts: P3[] = [];
    const scale: P2[] = [];
    for (let i = 0; i <= along; i++) {
      const t = i / along;
      const r = ra + (rb - ra) * t;
      const a = a0 + (a1 - a0) * t + Math.sin(t * Math.PI) * bow;
      // Slight concave dish towards the outer face (cast wheels are not flat).
      const x = dish * Math.sin(t * Math.PI);
      pts.push([x, Math.cos(a) * r, Math.sin(a) * r]);
      const flare = t > 0.82 ? 1 + ((t - 0.82) / 0.18) ** 2 * 0.9 : t < 0.12 ? 1 + ((0.12 - t) / 0.12) ** 2 * 0.6 : 1;
      scale.push([thick * flare * (1 - t * 0.25), (wa + (wb - wa) * t) * flare]);
    }
    return sweep(pts, sec, { scale, up: [1, 0, 0], capStart: true, capEnd: true });
  };
  const out = new MeshData();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (front ? 0 : 0.21);
    switch (d.shape) {
      case 'y': {
        // Few-spoke wheels split late so they still read as n spokes (Marchesini 3-spoke "Y").
        const rs = r0 + (r1 - r0) * (n <= 3 ? 0.66 : 0.52);
        out.append(spokeArm(a, a, r0, rs + 0.01, wHub * (n <= 3 ? 1.15 : 1), wHub * 0.85, 0, 0.004));
        const spread = (n <= 3 ? 0.28 : n <= 5 ? 0.21 : 0.13) * (0.3 / g.tyre.rimR);
        out.append(spokeArm(a, a - spread, rs, r1, wHub * 0.6, wRim * 0.85, 0, 0.002));
        out.append(spokeArm(a, a + spread, rs, r1, wHub * 0.6, wRim * 0.85, 0, 0.002));
        break;
      }
      case 'split':
      case 'twin': {
        const off = d.shape === 'split' ? 0.022 / ((r0 + r1) / 2) : 0;
        const conv = d.shape === 'twin' ? 0.1 : 0;
        out.append(spokeArm(a - off + conv * 0.0, a - off - conv, r0, r1, wHub * 0.55, wRim * 0.7, 0, 0.003));
        out.append(spokeArm(a + off - conv * 0.0, a + off + conv, r0, r1, wHub * 0.55, wRim * 0.7, 0, 0.003));
        break;
      }
      case 'curved':
        out.append(spokeArm(a, a + 0.35, r0, r1, wHub, wRim, 0.08, 0.005));
        break;
      default:
        out.append(spokeArm(a, a, r0, r1, wHub, wRim, 0, scooter ? 0.006 : 0.004));
    }
  }
  add(out, fin);
}

/** Hub barrel, bearings, spacers, axle nut, disc / sprocket mounting flanges. */
function buildHub(
  ctx: KitContext,
  g: WheelGeom,
  design: WheelDesign,
  front: boolean,
  singleSided: boolean,
  ssSide: number,
  axleHalf: number,
  fin: Finish,
  add: (m: MeshData, f: Finish, local?: THREE.Matrix4) => void,
): void {
  const hh = g.hubHalf;
  const hr = g.hubR;
  const segN = ctx.seg(48, 12);
  const wire = design.type === 'wire';
  const hubFin = wire ? F.castAlu : fin;
  const body = lathe(
    [
      [0.0, -hh - 0.002],
      [0.03, -hh - 0.002],
      [hr * 0.92, -hh],
      [hr, -hh + 0.008],
      [hr * 0.9, -hh * 0.4],
      [hr * 0.86, 0],
      [hr * 0.9, hh * 0.4],
      [hr, hh - 0.008],
      [hr * 0.92, hh],
      [0.03, hh + 0.002],
      [0.0, hh + 0.002],
    ],
    { segs: segN, axis: 'x', sharp: [2, 8] },
  );
  add(body, hubFin);
  // Bearing seals + axle spacers + axle
  for (const s of [-1, 1]) {
    if (singleSided && s === ssSide) continue;
    add(lathe([[0.012, 0], [0.024, 0], [0.024, 0.006], [0.012, 0.006]], { segs: 24, axis: 'x', sharp: true }), F.black, T(s * (hh + 0.002) - (s < 0 ? 0.006 : 0), 0, 0));
    const sp = Math.max(0.022, axleHalf - hh - 0.03);
    add(lathe([[0.0105, 0], [0.019, 0], [0.019, sp], [0.0105, sp]], { segs: 20, axis: 'x', sharp: true }), F.brushedAlu, T(s * (hh + 0.008) - (s < 0 ? sp : 0), 0, 0));
  }
  if (singleSided) {
    // Centre-lock: big hub flange on the arm side, castellated nut on the open side.
    const o = -ssSide;
    add(lathe([[0.0, 0], [0.045, 0], [0.05, 0.006], [0.05, 0.03], [0.04, 0.034], [0.0, 0.034]], { segs: segN, axis: 'x', sharp: [1, 3] }), F.castAlu, mul(T(o * (hh + 0.002), 0, 0), o > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)));
    const nut = lathe([[0.016, 0], [0.04, 0], [0.04, 0.026], [0.036, 0.03], [0.016, 0.03]], { segs: 12, axis: 'x', sharp: true });
    add(nut, F.steel, mul(T(o * (hh + 0.034), 0, 0), o > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)));
    add(lathe([[0.0, 0.0], [0.016, 0.0], [0.016, 0.024], [0, 0.024]], { segs: 16, axis: 'x', sharp: true }), F.polishedAlu, mul(T(o * (hh + 0.04), 0, 0), o > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)));
    // Wheel studs
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(bolt(0.007, 0.012), F.steel, mul(T(o * (hh + 0.034), Math.cos(a) * 0.032, Math.sin(a) * 0.032), RZ(o > 0 ? -Math.PI / 2 : Math.PI / 2)));
    }
  } else {
    const axleR = front ? 0.0125 : 0.0125;
    add(rod([-axleHalf, 0, 0], [axleHalf, 0, 0], axleR, axleR, 16), F.steel);
    // Axle nut (right on front wheels, chain side on rear) and axle head.
    for (const s of [-1, 1]) {
      const head = lathe([[0.0, 0], [0.019, 0], [0.019, 0.012], [0.016, 0.016], [0.0, 0.016]], { segs: s > 0 ? 6 : 24, axis: 'x', sharp: true });
      add(head, s > 0 ? F.steel : F.brushedAlu, mul(T(s * (axleHalf + 0.002), 0, 0), s > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(-1, 1, 1)));
    }
  }
  // Disc bolts on the hub flanges.
  if (ctx.micro && !wire) {
    const n = front ? 6 : 5;
    for (const s of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.3;
        add(bolt(0.0042, 0.006, false, 10), F.steel, mul(T(s * (hh + 0.013), Math.cos(a) * hr * 0.76, Math.sin(a) * hr * 0.76), RZ(s > 0 ? -Math.PI / 2 : Math.PI / 2)));
      }
    }
  }
}

/** Cross-laced wire wheel: steel spokes, nipples, flanged hub. */
function buildWireWheel(
  ctx: KitContext,
  g: WheelGeom,
  d: WheelDesign,
  front: boolean,
  addSpokes: (m: MeshData, f: Finish) => void,
  addWheel: (m: MeshData, f: Finish) => void,
): void {
  const n = Math.max(24, d.spokes || 36);
  const half = n / 2;
  const flangeR = front ? 0.052 : 0.068;
  const flangeX = g.hubHalf * 0.8;
  const rimR = g.tyre.rimR - (d.crossSpoke ? 0.002 : 0.01);
  const spokes = new MeshData();
  const nipples = new MeshData();
  const cross = 3;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < half; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const a = (i / half) * Math.PI * 2 + (side > 0 ? Math.PI / half : 0);
      const aRim = a + dir * ((cross * 2 * Math.PI) / half) * 0.5;
      const hub: P3 = [side * flangeX, Math.cos(a) * flangeR, Math.sin(a) * flangeR];
      const rimX = d.crossSpoke ? side * g.rimW * 0.42 : side * 0.008;
      const rim: P3 = [rimX, Math.cos(aRim) * rimR, Math.sin(aRim) * rimR];
      spokes.append(rod(hub, rim, 0.0019, 0.0019, 5, false));
      if (ctx.micro) {
        const dv = new THREE.Vector3(rim[0] - hub[0], rim[1] - hub[1], rim[2] - hub[2]).normalize();
        const p0: P3 = [rim[0] - dv.x * 0.016, rim[1] - dv.y * 0.016, rim[2] - dv.z * 0.016];
        nipples.append(rod(p0, rim, 0.0032, 0.0034, 6));
      }
    }
  }
  addSpokes(spokes, vary(F.steel, { rough: 0.22 }));
  if (ctx.micro) addSpokes(nipples, F.chrome);
  // Hub flanges
  for (const s of [-1, 1]) {
    const fl = lathe([[0.03, -0.004], [flangeR + 0.008, -0.003], [flangeR + 0.008, 0.003], [0.03, 0.004]], { segs: ctx.seg(36, 12), axis: 'x', sharp: [1, 2] });
    addWheel(fl.translate(s * flangeX, 0, 0), F.castAlu);
  }
}

/** Floating / wave brake disc: rotor with drilled holes, carrier, bobbins. Disc-local: axle along X. */
export function buildDisc(ctx: KitContext, b: BrakeSpec, front: boolean): [MeshData, Finish][] {
  const out: [MeshData, Finish][] = [];
  const Ro = b.discDia / 2;
  const band = front ? 0.034 : 0.026;
  const Ri = Ro - band;
  const thick = front ? 0.0055 : 0.005;
  const floating = b.disc === 'floating' || b.disc === 'semiFloating';
  const nb = front ? (Ro > 0.155 ? 10 : 8) : 6;
  const Rb = Ri - 0.004;
  const around = ctx.seg(96, 24);
  // Outer contour
  const outer: P2[] = [];
  for (let i = 0; i < around; i++) {
    const a = (i / around) * Math.PI * 2;
    const r = b.disc === 'wave' ? Ro - 0.0055 * (0.5 + 0.5 * Math.cos(a * (front ? 13 : 11))) : Ro;
    outer.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  // Inner contour with bobbin tabs (floating) or carrier arms (fixed)
  const inner: P2[] = [];
  const innerN = ctx.seg(120, 30);
  for (let i = 0; i < innerN; i++) {
    const a = (i / innerN) * Math.PI * 2;
    let r = Ri;
    // tabs around bobbin centres
    const k = (a / (Math.PI * 2)) * nb;
    const f = k - Math.round(k);
    const ang = (f * Math.PI * 2) / nb;
    const tabW = 0.012 / Rb;
    if (Math.abs(ang) < tabW) r = Rb - 0.009 * Math.sqrt(1 - (ang / tabW) ** 2);
    inner.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  inner.reverse();
  const holes: P2[][] = [inner];
  // Drilled pattern: staggered rows of holes in the braking band.
  if (ctx.micro) {
    const rows = front ? 3 : 2;
    const groups = front ? 24 : 18;
    for (let gI = 0; gI < groups; gI++) {
      for (let r = 0; r < rows; r++) {
        const rr = Ri + band * ((r + 0.8) / (rows + 0.6));
        const a = ((gI + r * 0.33) / groups) * Math.PI * 2;
        const hr = front ? 0.0028 : 0.0025;
        const c = circle(hr, 8).map(([x, y]) => [Math.cos(a) * rr + x, Math.sin(a) * rr + y] as P2);
        c.reverse();
        holes.push(c);
      }
    }
  }
  const rotor = extrude(outer, thick, { holes, plane: 'xy', bevel: 0.0006, bevelSegs: 1, curveSegs: 1 });
  rotor.transform(RY(Math.PI / 2));
  out.push([rotor, F.discSteel]);
  // Carrier (inner spider)
  const carrierFin = tint(vary(F.castAlu, { micro: Micro.anodised, rough: 0.35 }), b.carrierColor);
  const cOuter: P2[] = [];
  const cn = ctx.seg(90, 24);
  const arms = front ? 6 : 5;
  for (let i = 0; i < cn; i++) {
    const a = (i / cn) * Math.PI * 2;
    // follow the bobbin ring with scallops between bobbins
    const k = (a / (Math.PI * 2)) * nb;
    const f = k - Math.round(k);
    const r = floating ? Rb + 0.007 - (1 - Math.cos(f * Math.PI * 2)) * 0.0045 : Ri + 0.006;
    cOuter.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const cHoles: P2[][] = [];
  const hubHole = circle(0.032, 24);
  hubHole.reverse();
  cHoles.push(hubHole);
  // Lightening windows between the arms
  for (let i = 0; i < arms; i++) {
    const a0 = (i / arms) * Math.PI * 2 + Math.PI / arms;
    const w: P2[] = [];
    const ri = 0.058, ro = Rb - 0.012;
    const span = (Math.PI / arms) * 0.62;
    for (let j = 0; j <= 6; j++) {
      const a = a0 - span + (j / 6) * span * 2;
      w.push([Math.cos(a) * ro, Math.sin(a) * ro]);
    }
    for (let j = 6; j >= 0; j--) {
      const a = a0 - span * 0.7 + (j / 6) * span * 1.4;
      w.push([Math.cos(a) * ri, Math.sin(a) * ri]);
    }
    w.reverse();
    if (ro > ri + 0.01) cHoles.push(w);
  }
  const carrier = extrude(cOuter, thick * 0.9, { holes: cHoles, plane: 'xy', bevel: 0.0008, bevelSegs: 1, curveSegs: 1 });
  carrier.transform(RY(Math.PI / 2));
  out.push([carrier, carrierFin]);
  // Bobbins
  if (floating) {
    const bob = new MeshData();
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2;
      const y = Math.cos(a) * Rb, z = Math.sin(a) * Rb;
      const m = lathe([[0, -thick * 0.9], [0.0058, -thick * 0.9], [0.0058, -thick * 0.5], [0.0048, -thick * 0.5], [0.0048, thick * 0.5], [0.0062, thick * 0.55], [0.0062, thick * 0.95], [0, thick * 0.95]], { segs: ctx.micro ? 12 : 6, axis: 'x', sharp: true });
      bob.append(m.translate(0, y, z));
    }
    out.push([bob, tint(F.polishedAlu, b.carrierColor === '#1b1c1f' ? '#c9ccd0' : b.carrierColor)]);
  }
  return out;
}

export function sprocketPitchR(teeth: number, pitch: number): number {
  return pitch / (2 * Math.sin(Math.PI / teeth));
}

/** Toothed chain sprocket (axis X). */
export function buildSprocket(ctx: KitContext, teeth: number, pitch: number, lightened: boolean): (f: Finish) => [MeshData, Finish][] {
  const Rp = sprocketPitchR(teeth, pitch);
  const roller = 0.0102 / 2;
  const pts: P2[] = [];
  const per = ctx.micro ? 8 : 4;
  for (let i = 0; i < teeth; i++) {
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const a = ((i + t) / teeth) * Math.PI * 2;
      // root between teeth at t = 0, tip at t = 0.5
      const prof = Math.cos(t * Math.PI * 2);
      const r = Rp + 0.0035 - (prof > 0 ? prof ** 0.7 * (roller + 0.0045) : prof * 0.0005);
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  const holes: P2[][] = [];
  const centre = circle(0.03, 24);
  centre.reverse();
  holes.push(centre);
  if (lightened && Rp > 0.07) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + 0.3;
      const w: P2[] = [];
      const ri = 0.05, ro = Rp - 0.022;
      const span = (Math.PI / n) * 0.6;
      for (let j = 0; j <= 6; j++) w.push([Math.cos(a0 - span + (j / 6) * span * 2) * ro, Math.sin(a0 - span + (j / 6) * span * 2) * ro]);
      for (let j = 6; j >= 0; j--) w.push([Math.cos(a0 - span * 0.6 + (j / 6) * span * 1.2) * ri, Math.sin(a0 - span * 0.6 + (j / 6) * span * 1.2) * ri]);
      w.reverse();
      holes.push(w);
    }
  }
  return (f) => {
    const m = extrude(pts, 0.006, { holes, plane: 'xy', bevel: 0.0007, bevelSegs: 1, curveSegs: 1 });
    m.transform(RY(Math.PI / 2));
    const out: [MeshData, Finish][] = [[m, f]];
    if (ctx.micro) {
      const bolts = new MeshData();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        bolts.append(bolt(0.0045, 0.006).transform(mul(T(0.003, Math.cos(a) * 0.04, Math.sin(a) * 0.04), RZ(-Math.PI / 2))));
      }
      out.push([bolts, F.steel]);
    }
    return out;
  };
}

/** Toothed belt pulley (Harley-Davidson). */
function buildPulley(ctx: KitContext, teeth: number): (f: Finish) => [MeshData, Finish][] {
  const R = (teeth * 0.014) / (Math.PI * 2);
  return (f) => {
    const m = lathe([[0.03, -0.016], [R, -0.016], [R + 0.004, -0.014], [R + 0.004, 0.014], [R, 0.016], [0.03, 0.016]], { segs: ctx.seg(teeth, 24), axis: 'x', sharp: [1, 4] });
    const face = lathe([[0.03, 0.016], [R - 0.004, 0.016], [R - 0.004, 0.018], [0.03, 0.018]], { segs: ctx.seg(48, 16), axis: 'x' });
    return [
      [m, f],
      [face, vary(F.chrome, { rough: 0.1 })],
    ];
  };
}

/** Thin tube ring (rim tape, fork seals…). */
export function ring(R: number, r: number, segs: number): MeshData {
  return torusX(R, r, segs, 6);
}
