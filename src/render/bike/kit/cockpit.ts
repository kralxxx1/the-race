import * as THREE from 'three';
import { T, mul, type KitContext } from '../context';
import { MeshData, alongY, bolt, catmull, flat, lathe, rod, roundBox, roundRect, smooth2, sweep, circle, type P2, type P3 } from '../mesh';
import { F, hard, Micro, tint, vary, type Finish, type GroupName } from '../sink';
import { lever, masterCylinder } from './brakes';
import type { ForkLayout } from './front';

export interface CockpitResult {
  /** Front brake master-cylinder hose port (bike space). */
  frontMcPort: P3 | null;
}

const V3 = (p: P3) => new THREE.Vector3(p[0], p[1], p[2]);
const P = (v: THREE.Vector3): P3 => [v.x, v.y, v.z];

/** Handlebars / clip-ons, grips, switchgear, levers, master cylinders, mirrors, dash. */
export function buildCockpit(ctx: KitContext, L: ForkLayout): CockpitResult {
  const c = ctx.bp.cockpit;
  const res: CockpitResult = { frontMcPort: null };
  const barR = c.barDia / 2;
  const barFin: Finish = c.bars === 'clipon' ? vary(F.castAlu, { color: tint(F.castAlu, '#1d1e21').color, micro: Micro.anodised }) : c.bars === 'cruiser' ? F.chrome : vary(F.castAlu, { color: tint(F.castAlu, '#202124').color, micro: Micro.anodised });
  for (const s of [-1, 1]) {
    const G = V3([s * Math.abs(c.grip[0]), c.grip[1], c.grip[2]]);
    let start: THREE.Vector3;
    let dir: THREE.Vector3;
    if (c.bars === 'clipon') {
      // Clamp ring on the fork tube under the top clamp, bar tube out to the grip.
      const clipY = L.topClampY - L.topClampT - 0.024;
      const C = V3(ctx.fromSteer([s * L.half, clipY, L.z]));
      dir = G.clone().sub(C).normalize();
      const ring = lathe(
        [
          [L.outerR + 0.0005, -0.017],
          [L.outerR + 0.009, -0.017],
          [L.outerR + 0.0105, -0.014],
          [L.outerR + 0.0105, 0.014],
          [L.outerR + 0.009, 0.017],
          [L.outerR + 0.0005, 0.017],
        ],
        { segs: ctx.seg(28, 10), axis: 'y', sharp: [1, 4] },
      );
      ctx.addSteer('steer', ring, barFin, T(s * L.half, clipY, L.z));
      // Boss joining the clamp ring to the bar
      const bossA = C.clone().addScaledVector(dir, L.outerR * 0.6);
      const bossB = C.clone().addScaledVector(dir, L.outerR + 0.028);
      ctx.add('steer', rod(P(bossA), P(bossB), barR + 0.006, barR + 0.004, ctx.seg(16, 8)), barFin);
      if (ctx.micro) {
        // Pinch bolts at the back of the clamp
        const back = V3(ctx.fromSteer([s * L.half, clipY, L.z + L.outerR + 0.011]));
        for (const dy of [-0.008, 0.008]) {
          const b0 = back.clone().add(new THREE.Vector3(0, dy, 0));
          ctx.add('steer', bolt(0.0042, 0.0055, false, 8), F.steel, mul(T(b0.x, b0.y, b0.z), new THREE.Matrix4().makeRotationX(Math.PI / 2)));
        }
      }
      start = bossB;
      const end = G.clone().addScaledVector(dir, 0.072);
      ctx.add('steer', rod(P(start), P(end), barR, barR, ctx.seg(18, 8)), barFin);
    } else {
      // One-piece tubular bar through riser clamps on the top clamp.
      if (s < 0) continue;
      const tall = c.bars === 'tall' ? 0.06 : c.bars === 'cruiser' ? 0.09 : 0.035;
      const risers: THREE.Vector3[] = [];
      for (const k of [-1, 1]) {
        const base = V3(ctx.fromSteer([k * 0.036, L.topClampY, 0.012]));
        const top = V3(ctx.fromSteer([k * 0.036, L.topClampY + tall, 0.016]));
        ctx.add('steer', rod(P(base), P(top), 0.013, 0.012, ctx.seg(16, 8)), c.bars === 'cruiser' ? F.chrome : F.castAlu);
        ctx.add('steer', roundBox(0.03, 0.026, 0.034, 0.008), c.bars === 'cruiser' ? F.chrome : F.castAlu, T(top.x, top.y + 0.004, top.z));
        risers.push(top.clone().add(new THREE.Vector3(0, 0.006, 0)));
      }
      const GL = V3([-G.x, G.y, G.z]);
      const GR = G;
      const dR = new THREE.Vector3(1, -0.08, 0.15).normalize();
      const dL = new THREE.Vector3(-1, -0.08, 0.15).normalize();
      const bendR = risers[1].clone().lerp(GR, 0.55).add(new THREE.Vector3(0, 0.02, -0.01));
      const bendL = risers[0].clone().lerp(GL, 0.55).add(new THREE.Vector3(0, 0.02, -0.01));
      const pts = [
        GL.clone().addScaledVector(dL, 0.07),
        GL,
        GL.clone().addScaledVector(dL, -0.08),
        bendL,
        risers[0],
        risers[1],
        bendR,
        GR.clone().addScaledVector(dR, -0.08),
        GR,
        GR.clone().addScaledVector(dR, 0.07),
      ].map(P);
      const path = catmull(pts, ctx.seg(8, 4)).map((q) => [q[0], q[1], q[2]] as P3);
      ctx.add('steer', sweep(path, circle(barR, ctx.seg(16, 8)), { capStart: true, capEnd: true }), barFin);
      if (c.bars !== 'scooter' && ctx.micro) {
        // Bar pad / cross brace on tall bars
        if (c.bars === 'tall') {
          const a = risers[0].clone().lerp(GL, 0.3).add(new THREE.Vector3(0, 0.03, 0));
          const b = risers[1].clone().lerp(GR, 0.3).add(new THREE.Vector3(0, 0.03, 0));
          ctx.add('steer', rod(P(a), P(b), 0.009, 0.009, 10), barFin);
        }
      }
      dir = dR;
      start = risers[1];
      void start;
    }
  }
  // Grips, switchgear, levers, master cylinders, bar ends (both sides).
  for (const s of [-1, 1]) {
    const G = V3([s * Math.abs(c.grip[0]), c.grip[1], c.grip[2]]);
    let dir: THREE.Vector3;
    if (c.bars === 'clipon') {
      const C = V3(ctx.fromSteer([s * L.half, L.topClampY - L.topClampT - 0.024, L.z]));
      dir = G.clone().sub(C).normalize();
    } else dir = new THREE.Vector3(s, -0.08, 0.15).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).addScaledVector(dir, dir.z).normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).addScaledVector(fwd, -fwd.y).normalize();
    // Grip with moulded ridges
    const g0 = G.clone().addScaledVector(dir, -0.068);
    const g1 = G.clone().addScaledVector(dir, 0.058);
    const gripProf: P2[] = [[barR, -0.002]];
    const ridges = ctx.micro ? 22 : 6;
    for (let i = 0; i <= ridges; i++) {
      const t = i / ridges;
      gripProf.push([barR + 0.0055 + (i % 2 === 0 ? 0.0012 : 0) + Math.sin(t * Math.PI) * 0.0022, 0.004 + t * 0.118]);
    }
    gripProf.push([barR + 0.006, 0.124], [barR + 0.003, 0.126]);
    const gripFin = tint(F.rubber, c.gripColor ?? '#111111');
    ctx.add('steer', lathe(gripProf, { segs: ctx.seg(20, 8), axis: 'y' }), gripFin, alongY(P(g0), P(g1)));
    // Bar-end weight
    const be = G.clone().addScaledVector(dir, 0.064);
    const beEnd = G.clone().addScaledVector(dir, 0.092);
    const beFin = vary(tint(F.brushedAlu, c.barEndColor ?? '#1c1d20'), { micro: Micro.brushed });
    ctx.add('steer', lathe([[0, 0], [0.0145, 0], [0.0155, 0.004], [0.0155, 0.022], [0.012, 0.028], [0, 0.028]], { segs: ctx.seg(20, 10), axis: 'y', sharp: [1] }), beFin, alongY(P(be), P(beEnd)));
    // Switch housing at the inner end of the grip
    const sw = G.clone().addScaledVector(dir, s > 0 ? -0.09 : -0.098);
    const swM = new THREE.Matrix4().makeBasis(dir, up, fwd.clone().negate());
    swM.setPosition(sw);
    const swFin = tint(F.texturedBlack, c.switchColor ?? '#161719');
    const housing = new MeshData();
    housing.append(roundBox(s > 0 ? 0.036 : 0.044, 0.05, 0.058, 0.014, ctx.micro ? 3 : 1).transform(T(0, 0.002, 0.004)));
    ctx.add('steer', housing, swFin, swM);
    if (ctx.micro) {
      // Buttons: start/kill on the right; mode, horn, indicators, high-beam on the left.
      const btn = (x: number, y: number, z: number, w: number, h: number, colorHex: string, face: 'back' | 'front' | 'top' = 'back') => {
        const b = roundBox(w, h, 0.008, Math.min(w, h) * 0.3, 2);
        const m = face === 'back' ? T(x, y, z + 0.033) : face === 'front' ? T(x, y, z - 0.03) : mul(T(x, y + 0.027, z), new THREE.Matrix4().makeRotationX(Math.PI / 2));
        ctx.add('steer', b, hard(colorHex, 0.05, 0.4, 0.5, Micro.grain), mul(swM, m));
      };
      if (s > 0) {
        btn(0, 0.012, 0, 0.018, 0.014, '#b3121b', 'back');
        btn(0, -0.012, 0, 0.02, 0.012, '#1d1e21', 'back');
        btn(0, 0.0, 0, 0.016, 0.02, '#232427', 'top');
      } else {
        btn(0.004, 0.016, 0, 0.016, 0.01, '#2a2b2e', 'back');
        btn(0.004, 0.0, 0, 0.022, 0.012, '#2a2b2e', 'back');
        btn(0.004, -0.016, 0, 0.016, 0.01, '#2a2b2e', 'back');
        btn(0.0, 0.006, 0, 0.018, 0.012, '#2a2b2e', 'front');
        btn(0.0, 0.0, 0, 0.018, 0.018, '#38393d', 'top');
      }
    }
    // Lever + master cylinder / perch inboard of the switch
    const mcAt = G.clone().addScaledVector(dir, -0.125).addScaledVector(up, 0.002);
    const levFin = vary(tint(F.brushedAlu, c.leverColor), { micro: Micro.brushed, rough: 0.28 });
    if (s > 0) {
      const port = masterCylinder(ctx, 'steer', P(mcAt), dir, fwd, up, c.bars === 'clipon' || c.reservoirs, vary(F.castAlu, { color: tint(F.castAlu, '#1d1e21').color }), c.reservoirs);
      res.frontMcPort = port;
      const pivot = mcAt.clone().addScaledVector(fwd, 0.03).addScaledVector(up, -0.008);
      ctx.leverFrame('leverBrake', pivot, dir, up, fwd);
      lever(ctx, 'leverBrake', P(pivot), dir, fwd, up, 0.165, levFin);
    } else {
      if (c.clutch === 'hydraulic') {
        masterCylinder(ctx, 'steer', P(mcAt), dir, fwd, up, true, vary(F.castAlu, { color: tint(F.castAlu, '#1d1e21').color }), c.reservoirs);
      } else {
        // Cable perch + adjuster + cable loop forward
        const perch = new THREE.Matrix4().makeBasis(dir, up, fwd.clone().negate());
        perch.setPosition(mcAt);
        ctx.add('steer', roundBox(0.03, 0.032, 0.04, 0.009), F.castAlu, perch);
        ctx.add('steer', rod([0.005, 0.005, -0.022], [0.005, 0.005, -0.045], 0.0055, 0.0055, 10), F.knurled, perch);
        const cableEnd = mcAt.clone().addScaledVector(fwd, 0.045).addScaledVector(dir, 0.005);
        const cableMid = cableEnd.clone().addScaledVector(fwd, 0.06).add(new THREE.Vector3(-s * 0.06, -0.1, 0));
        const cableLow = V3(ctx.fromSteer([s * L.half * 0.6, L.bottomClampY - 0.05, 0.06]));
        ctx.add('steer', rodPath([P(cableEnd), P(cableMid), P(cableLow)], 0.0035, ctx), F.hose);
      }
      const pivot = mcAt.clone().addScaledVector(fwd, 0.03).addScaledVector(up, -0.008);
      ctx.leverFrame('leverClutch', pivot, dir, up, fwd);
      lever(ctx, 'leverClutch', P(pivot), dir, fwd, up, 0.16, levFin);
    }
    // Throttle cables (right) and switch looms (both) running down to the headstock.
    if (ctx.micro) {
      const from = sw.clone().addScaledVector(fwd, 0.03).addScaledVector(up, -0.015);
      const to = V3(ctx.fromSteer([s * 0.03, L.bottomClampY + 0.02, 0.07]));
      const mid = from.clone().lerp(to, 0.5).addScaledVector(fwd, 0.05).add(new THREE.Vector3(0, -0.02, 0));
      ctx.add('steer', rodPath([P(from), P(mid), P(to)], 0.0032, ctx), F.hose);
    }
  }
  buildMirrors(ctx);
  buildDash(ctx);
  if (c.steeringDamper === 'top' || c.steeringDamper === 'side') {
    const a = ctx.fromSteer([-0.07, L.topClampY + 0.014, L.z - 0.012]);
    const b = ctx.fromSteer([0.06, L.topClampY + 0.014, L.z - 0.012]);
    ctx.add('steer', rod(a, b, 0.012, 0.012, ctx.seg(16, 8)), F.goldAnod);
    ctx.add('steer', rod(b, [b[0] + 0.07, b[1], b[2] + 0.02], 0.004, 0.004, 8), F.chrome);
  }
  if (c.ignition === 'clamp') {
    const k = ctx.fromSteer([0, L.topClampY + 0.004, 0.045]);
    ctx.add('steer', lathe([[0, 0], [0.018, 0], [0.018, 0.012], [0.014, 0.016], [0, 0.016]], { segs: ctx.seg(20, 8), axis: 'y', sharp: [1, 2] }), F.texturedBlack, T(...k));
    ctx.add('steer', roundBox(0.004, 0.012, 0.016, 0.001), F.steel, T(k[0], k[1] + 0.022, k[2]));
  }
  return res;
}

function rodPath(pts: P3[], r: number, ctx: KitContext): MeshData {
  const path = catmull(pts, ctx.seg(8, 3)).map((q) => [q[0], q[1], q[2]] as P3);
  return sweep(path, circle(r, ctx.micro ? 6 : 4), {});
}

/** Mirror glass outline (right mirror, x outward), centred on the glass. */
function mirrorOutline(kind: 'oval' | 'sport' | 'rect' | 'round', w: number, h: number, n: number): P2[] {
  const hw = w / 2, hh = h / 2;
  switch (kind) {
    case 'sport':
      // Tapered wedge: tall inner end, the outer tip swept up (R1 / Panigale style).
      return smooth2([[-hw, -hh * 0.75], [hw * 0.55, -hh], [hw, -hh * 0.35], [hw * 0.98, hh * 0.8], [hw * 0.35, hh], [-hw, hh * 0.85]], Math.max(2, Math.round(n / 6)), true).map(([x, y]: number[]) => [x, y] as P2);
    case 'rect':
      return roundRect(w, h, Math.min(w, h) * 0.3, Math.max(2, Math.round(n / 8))).map(([x, y]: number[]) => [x, y] as P2);
    case 'round':
      return circle(Math.min(hw, hh) * 1.0, n).map(([x, y]) => [x, y] as P2);
    default:
      return circle(1, n).map(([x, y]) => [x * hw, y * hh] as P2);
  }
}

/** Cup-shaped housing from a glass outline (z = 0) to a rounded nose at z = −depth. */
function mirrorPod(outline: readonly P2[], depth: number, lip: number, rings: number): MeshData {
  const m = new MeshData();
  const n = outline.length;
  let cx = 0, cy = 0;
  for (const [x, y] of outline) (cx += x / n), (cy += y / n);
  // Grow the outline by `lip` so the housing frames the glass.
  const grown = outline.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const l = Math.hypot(dx, dy) || 1;
    return [x + (dx / l) * lip, y + (dy / l) * lip] as P2;
  });
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const k = Math.pow(Math.max(0, 1 - t * t), 0.6);
    for (const [x, y] of grown) m.v(cx + (x - cx) * k, cy + (y - cy) * k, -t * depth);
  }
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + ((i + 1) % n);
      m.quad(a, b, b + n, a + n);
    }
  }
  m.computeNormals();
  // Outward = away from the glass centre on the first ring.
  const i0 = n;
  if ((m.pos[i0 * 3] - cx) * m.nrm[i0 * 3] + (m.pos[i0 * 3 + 1] - cy) * m.nrm[i0 * 3 + 1] < 0) m.flip();
  return m;
}

function mirrorRim(outline: readonly P2[], lip: number, d: number): MeshData {
  const m = new MeshData();
  const n = outline.length;
  let cx = 0, cy = 0;
  for (const [x, y] of outline) (cx += x / n), (cy += y / n);
  for (const [x, y] of outline) {
    const dx = x - cx, dy = y - cy;
    const l = Math.hypot(dx, dy) || 1;
    m.v(x + (dx / l) * lip, y + (dy / l) * lip, 0, 0, 0, 1);
    m.v(x + (dx / l) * lip, y + (dy / l) * lip, d, 0, 0, 1);
    m.v(x, y, d, 0, 0, 1);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 3, b = ((i + 1) % n) * 3;
    m.quad(a, b, b + 1, a + 1);
    m.quad(a + 1, b + 1, b + 2, a + 2);
  }
  return m.computeNormals();
}

/** Mirror pods with glass in their own slot (so the game can render reflections into them later). */
function buildMirrors(ctx: KitContext): void {
  const c = ctx.bp.cockpit;
  if (c.mirrors === 'none' || !c.mirrorPos) return;
  const [w, h] = c.mirrorSize ?? [0.15, 0.075];
  const group: GroupName = c.mirrors === 'fairing' ? 'chassis' : 'steer';
  for (const s of [-1, 1]) {
    const M = V3([s * Math.abs(c.mirrorPos[0]), c.mirrorPos[1], c.mirrorPos[2]]);
    // Glass faces back, toed out a little so the rider sees past the shoulder.
    const yaw = -s * 0.14;
    const basis = new THREE.Matrix4().makeRotationY(yaw);
    basis.setPosition(M);
    const depth = 0.05;
    // Glass outline in the glass plane (x outward on the right mirror), then a cup from it to the nose.
    const shape = mirrorOutline(c.mirrorShape ?? 'oval', w, h, ctx.seg(32, 12)).map(([x, y]) => [x * s, y] as P2);
    const pod = mirrorPod(shape, depth, 0.006, ctx.seg(8, 4));
    // Back rim (glass bezel)
    const rim = mirrorRim(shape, 0.006, 0.005);
    const paint: Finish = c.mirrorColor ? hard(c.mirrorColor, 0.1, 0.22, 1) : c.mirrors === 'fairing' ? F.paint : F.glossBlack;
    ctx.add(group, pod, paint, basis);
    ctx.add(group, rim, F.texturedBlack, basis);
    // Glass
    const glass: P2[] = s < 0 ? shape.slice().reverse() : shape;
    ctx.add(group, flat(glass, 'xy', 0.003, 1), { ...F.mirrorL, slot: s < 0 ? 'mirrorL' : 'mirrorR' }, basis);
    ctx.anchor(s < 0 ? 'mirrorL' : 'mirrorR', P(M));
    // Integrated LED indicator along the outer front edge
    if (c.mirrorIndicators) {
      const ind: P3[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = (s > 0 ? -0.5 : Math.PI + 0.5) + (s > 0 ? 1 : -1) * (i / 10) * 1.1;
        ind.push([Math.cos(a) * (w / 2 + 0.004), Math.sin(a) * (h / 2 + 0.002), -depth * 0.35]);
      }
      ctx.add(group, sweep(ind, circle(0.0045, 6), { capStart: true, capEnd: true }), F.indicator, basis);
    }
    // Stalk
    const base = c.mirrors === 'fairing'
      ? M.clone().add(new THREE.Vector3(-s * 0.075, -0.065, 0.02))
      : M.clone().add(new THREE.Vector3(-s * 0.09, -0.2, 0.08));
    const mid = M.clone().lerp(base, 0.5).add(new THREE.Vector3(0, 0.01, -0.02));
    const stalk = catmull([P(M.clone().add(new THREE.Vector3(-s * w * 0.25, -h * 0.25, -depth * 0.6))), P(mid), P(base)], 6).map((q) => [q[0], q[1], q[2]] as P3);
    const chromeStalk = ctx.bp.cockpit.bars === 'cruiser' || ctx.spec.style === 'classic';
    ctx.add(group, sweep(stalk, circle(c.mirrors === 'fairing' ? 0.008 : 0.006, 8), { capStart: true, capEnd: true }), c.mirrors === 'fairing' || !chromeStalk ? F.texturedBlack : F.chrome);
    ctx.add(group, roundBox(0.03, 0.02, 0.03, 0.008), F.texturedBlack, T(base.x, base.y, base.z));
  }
}

/** Dash housing + screen quad (the screen texture is redrawn by BikeModel.updateDash). */
function buildDash(ctx: KitContext): void {
  const c = ctx.bp.cockpit;
  const [w, h] = c.dashSize;
  const tilt = (c.dashTiltDeg * Math.PI) / 180;
  const group: GroupName = c.dashMount === 'fairing' ? 'chassis' : 'steer';
  const m = mul(T(...c.dashPos), new THREE.Matrix4().makeRotationX(-tilt));
  const round = c.dash === 'tftRound' || c.dash === 'analog' || c.dash === 'harley';
  const housing = new MeshData();
  if (round) {
    housing.append(lathe([[0, -0.045], [w / 2 + 0.012, -0.04], [w / 2 + 0.016, -0.01], [w / 2 + 0.014, 0.004], [w / 2 + 0.004, 0.006]], { segs: ctx.seg(40, 12), axis: 'z' }));
  } else {
    housing.append(roundBox(w + 0.024, h + 0.024, 0.032, 0.012, ctx.micro ? 3 : 1).transform(T(0, 0, -0.018)));
    // Sun visor brow over the screen
    housing.append(roundBox(w + 0.02, 0.008, 0.03, 0.003, 1).transform(T(0, h / 2 + 0.012, 0.01)));
  }
  ctx.add(group, housing, F.texturedBlack, m);
  // Screen (UV 0..1 across the face)
  const scr = new MeshData();
  const pts: P2[] = round ? circle(w / 2, 40) : [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const base = scr.vcount;
  for (const [x, y] of pts) scr.v(x, y, 0.0005, 0, 0, 1, x / w + 0.5, y / (round ? w : h) + 0.5);
  if (round) {
    const ci = scr.v(0, 0, 0.0005, 0, 0, 1, 0.5, 0.5);
    for (let i = 0; i < pts.length; i++) scr.t(ci, base + i, base + ((i + 1) % pts.length));
  } else {
    scr.t(base, base + 1, base + 2);
    scr.t(base, base + 2, base + 3);
  }
  ctx.add(group, scr.orient(), F.dash, m);
  // Glass cover with a hint of reflection
  ctx.add(group, flat(pts.map(([x, y]) => [x * 1.02, y * 1.02] as P2), 'xy', 0.003, 1), F.lens, m);
  ctx.anchor('dash', c.dashPos);
}
