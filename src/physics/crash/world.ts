import {
  q4, qaddRot, qconj, qcopy, qmul, qnormalize, qrot, qrotInv, v3, vadd, vcopy, vcross, vdot, vlen, vlen2, vmad, vnorm, vscale, vset, vsub,
  type Q4, type V3,
} from './math';

/**
 * Small-step XPBD rigid-body world for crashes (Müller et al., "Detailed Rigid Body Simulation
 * with Extended Position Based Dynamics" + "Small Steps in Physics Simulation"): bodies are
 * integrated, positional/angular constraints (ball joints, swing and hinge limits, contacts) are
 * solved once per tiny sub-step directly on positions/orientations, velocities are recovered from
 * the position change, then friction and restitution are applied at velocity level. Stiff and
 * unconditionally stable for the stacks of ragdoll limbs, a bike and a car that a crash needs.
 *
 * Deterministic: fixed step, fixed iteration order, no Math.random, no allocation per step.
 */

export type BodyKind = 'bike' | 'rider' | 'car' | 'debris';
export type SurfaceMat = 'metal' | 'plastic' | 'leather' | 'helmet' | 'tyre' | 'glass';

export interface SphereShape {
  c: V3;
  r: number;
}
export interface BoxShape {
  c: V3;
  h: V3;
}

export class Body {
  readonly x = v3();
  readonly q = q4();
  readonly v = v3();
  readonly w = v3();
  readonly px = v3();
  readonly pq = q4();
  invMass = 0;
  readonly invI = v3();
  spheres: SphereShape[] = [];
  boxes: BoxShape[] = [];
  boundR = 0.5;
  mu = 0.5;
  restitution = 0.2;
  /** Wheeled bodies (cars) get separate rolling / sideways friction along `fwd` (body space). */
  muLong = -1;
  muLat = 0.9;
  readonly fwd = v3(0, 0, -1);
  linDamp = 0.02;
  angDamp = 0.05;
  mat: SurfaceMat = 'plastic';
  /** Counts bumps for the renderer (sparks / smoke / audio). */
  index = 0;
  /** Set while touching something this sub-step (resting damping). */
  touching = false;
  constructor(
    readonly name: string,
    readonly kind: BodyKind,
  ) {}

  setMass(m: number, ix: number, iy: number, iz: number): this {
    this.invMass = m > 0 ? 1 / m : 0;
    vset(this.invI, m > 0 ? 1 / ix : 0, m > 0 ? 1 / iy : 0, m > 0 ? 1 / iz : 0);
    return this;
  }
  /** Solid box inertia. */
  massBox(m: number, hx: number, hy: number, hz: number): this {
    return this.setMass(m, (m / 3) * (hy * hy + hz * hz), (m / 3) * (hx * hx + hz * hz), (m / 3) * (hx * hx + hy * hy));
  }
  /** Capsule along local Y: radius r, cylinder half length hl. */
  massCapsule(m: number, r: number, hl: number): this {
    const L = hl * 2 + r * 1.3;
    const ia = (m / 12) * (3 * r * r + L * L);
    return this.setMass(m, ia, 0.5 * m * r * r, ia);
  }
  massSphere(m: number, r: number): this {
    const i = 0.4 * m * r * r;
    return this.setMass(m, i, i, i);
  }
  place(x: V3, q: Q4, vel: V3, ang: V3): this {
    vcopy(this.x, x);
    qcopy(this.q, q);
    qnormalize(this.q);
    vcopy(this.v, vel);
    vcopy(this.w, ang);
    vcopy(this.px, this.x);
    qcopy(this.pq, this.q);
    return this;
  }
  updateBounds(): void {
    let r = 0.05;
    for (const s of this.spheres) r = Math.max(r, vlen(s.c) + s.r);
    for (const b of this.boxes) r = Math.max(r, vlen(b.c) + vlen(b.h));
    this.boundR = r;
  }
}

const _a = v3();
const _b = v3();
const _c = v3();
const _d = v3();
const _e = v3();
const _f = v3();
const _g = v3();
const _p1 = v3(), _p2 = v3(), _p3 = v3(), _p4 = v3();
const _r1 = v3(), _r2 = v3();
const _i1 = v3(), _i2 = v3(), _i3 = v3(), _i4 = v3();
const _v1 = v3(), _v2 = v3();
const _lc = v3(), _ln = v3();
const _o1 = v3(), _o2 = v3();

/** o = R · diag(invI) · Rᵀ · v */
function applyInvI(b: Body, v: V3, o: V3): V3 {
  qrotInv(o, b.q, v);
  o.x *= b.invI.x;
  o.y *= b.invI.y;
  o.z *= b.invI.z;
  return qrot(o, b.q, o);
}

export interface Contact {
  a: Body;
  /** null = static world (ground / barrier). */
  b: Body | null;
  /** Unit normal pointing from b to a. */
  n: V3;
  p: V3;
  ra: V3;
  rb: V3;
  /** Normal correction applied this sub-step (m): bounds the friction impulse. */
  pen: number;
  vnPre: number;
  mu: number;
  muLong: number;
  muLat: number;
  restitution: number;
  /** 0 ground, 1 barrier, 2 body. */
  kind: number;
  /** Which sphere/box produced it (stable render ordering). */
  shape: number;
}

function makeContact(): Contact {
  return { a: null as unknown as Body, b: null, n: v3(), p: v3(), ra: v3(), rb: v3(), pen: 0, vnPre: 0, mu: 0.5, muLong: -1, muLat: 0.5, restitution: 0.2, kind: 0, shape: 0 };
}

/** Positional correction along `n` by `c` metres at the contact points (a moves +n, b moves −n). */
function correctPosition(a: Body, b: Body | null, ra: V3, rb: V3, n: V3, c: number): void {
  vcross(_p1, ra, n);
  applyInvI(a, _p1, _p2);
  let w = a.invMass + vdot(_p1, _p2);
  if (b) {
    vcross(_p3, rb, n);
    applyInvI(b, _p3, _p4);
    w += b.invMass + vdot(_p3, _p4);
  }
  if (w < 1e-12) return;
  const lam = c / w;
  vmad(a.x, n, lam * a.invMass);
  qaddRot(a.q, _p2.x * lam, _p2.y * lam, _p2.z * lam);
  if (b) {
    vmad(b.x, n, -lam * b.invMass);
    qaddRot(b.q, -_p4.x * lam, -_p4.y * lam, -_p4.z * lam);
  }
}

/** Rotate `a` by +θ and `b` by −θ (θ = axis·angle) distributed by inverse inertia. */
function correctRotation(a: Body, b: Body, axis: V3, angle: number): void {
  applyInvI(a, axis, _r1);
  applyInvI(b, axis, _r2);
  const w = vdot(axis, _r1) + vdot(axis, _r2);
  if (w < 1e-12) return;
  const lam = angle / w;
  qaddRot(a.q, _r1.x * lam, _r1.y * lam, _r1.z * lam);
  qaddRot(b.q, -_r2.x * lam, -_r2.y * lam, -_r2.z * lam);
}

export interface JointOpts {
  cone?: { axisA: V3; axisB: V3; max: number };
  hinge?: { axisA: V3; axisB: V3; refA: V3; refB: V3; lo: number; hi: number };
  /** Relative angular damping (1/s). */
  damping?: number;
}

export class Joint {
  readonly la = v3();
  readonly lb = v3();
  constructor(
    readonly a: Body,
    readonly b: Body,
    /** World anchor at creation time (both bodies must be placed already). */
    anchor: V3,
    readonly opts: JointOpts = {},
  ) {
    vsub(_a, anchor, a.x);
    qrotInv(this.la, a.q, _a);
    vsub(_a, anchor, b.x);
    qrotInv(this.lb, b.q, _a);
  }
}

/** A vertical wall (guard-rail): contact below `height` on the side the normal faces. */
export interface Barrier {
  p: V3;
  n: V3;
  height: number;
  mu: number;
}

export interface ImpactEvent {
  /** Closing speed along the normal (m/s). */
  speed: number;
  p: V3;
  n: V3;
  a: Body;
  b: Body | null;
  /** 0 ground, 1 barrier, 2 body. */
  kind: number;
}

export interface SlideSample {
  p: V3;
  /** Tangential speed (m/s) and direction. */
  speed: number;
  dir: V3;
  a: Body;
  b: Body | null;
  kind: number;
}

export const FIXED_STEP = 1 / 120;
const SUBSTEPS = 6;
const MAX_EVENTS = 48;
const MAX_SLIDES = 48;
const MAX_CONTACTS = 512;

export class CrashWorld {
  readonly bodies: Body[] = [];
  readonly joints: Joint[] = [];
  barrier: Barrier | null = null;
  gravity = 9.81;
  groundMu = 0.8;
  time = 0;
  settled = false;
  /** Events collected during the last `step` (preallocated; read `eventCount`). */
  readonly events: ImpactEvent[] = [];
  eventCount = 0;
  readonly slides: SlideSample[] = [];
  slideCount = 0;
  private acc = 0;
  private contacts: Contact[] = [];
  private nContacts = 0;
  private calm = 0;
  /** bike↔rider collision is switched on per pair once they have separated. */
  private pairActive = new Map<number, boolean>();

  constructor(public ground: (x: number, z: number) => number) {
    for (let i = 0; i < MAX_CONTACTS; i++) this.contacts.push(makeContact());
    for (let i = 0; i < MAX_EVENTS; i++) this.events.push({ speed: 0, p: v3(), n: v3(), a: null as unknown as Body, b: null, kind: 0 });
    for (let i = 0; i < MAX_SLIDES; i++) this.slides.push({ p: v3(), speed: 0, dir: v3(), a: null as unknown as Body, b: null, kind: 0 });
  }

  add(b: Body): Body {
    b.index = this.bodies.length;
    b.updateBounds();
    this.bodies.push(b);
    return b;
  }

  /** Advance by `dt` seconds (fixed internal steps). Returns the number of fixed steps taken. */
  step(dt: number, maxSteps = 16): number {
    this.eventCount = 0;
    this.slideCount = 0;
    if (this.settled) return 0;
    this.acc += Math.max(0, dt);
    let n = 0;
    while (this.acc >= FIXED_STEP && n < maxSteps) {
      this.acc -= FIXED_STEP;
      n++;
      const h = FIXED_STEP / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) this.substep(h, s === SUBSTEPS - 1);
      this.time += FIXED_STEP;
      this.updateSleep();
    }
    if (n === maxSteps) this.acc = 0;
    return n;
  }

  private updateSleep(): void {
    if (this.time < 1.5) return;
    let moving = false;
    for (const b of this.bodies) {
      if (b.kind === 'debris') continue;
      if (vlen2(b.v) > 0.0225 || vlen2(b.w) > 4) {
        moving = true;
        break;
      }
    }
    this.calm = moving ? 0 : this.calm + FIXED_STEP;
    if (this.calm > 0.5) this.settled = true;
  }

  private substep(h: number, last: boolean): void {
    const bodies = this.bodies;
    for (const b of bodies) {
      if (b.invMass === 0) continue;
      vcopy(b.px, b.x);
      qcopy(b.pq, b.q);
      b.v.y -= this.gravity * h;
      const ld = Math.exp(-b.linDamp * h);
      b.v.x *= ld;
      b.v.y *= ld;
      b.v.z *= ld;
      const ad = Math.exp(-b.angDamp * h);
      b.w.x *= ad;
      b.w.y *= ad;
      b.w.z *= ad;
      vmad(b.x, b.v, h);
      qaddRot(b.q, b.w.x * h, b.w.y * h, b.w.z * h);
      qnormalize(b.q);
    }
    this.collect();
    // Joints, then contacts (single pass each: the steps are tiny).
    for (let it = 0; it < 2; it++) {
      for (const j of this.joints) this.solveJoint(j);
      for (const b of bodies) qnormalize(b.q);
    }
    this.solveContacts();
    for (const b of bodies) qnormalize(b.q);
    // Velocities from the position change.
    const inv = 1 / h;
    for (const b of bodies) {
      if (b.invMass === 0) continue;
      b.v.x = (b.x.x - b.px.x) * inv;
      b.v.y = (b.x.y - b.px.y) * inv;
      b.v.z = (b.x.z - b.px.z) * inv;
      qconj(_g4, b.pq);
      qmul(_g4, b.q, _g4);
      const s = _g4.w < 0 ? -2 * inv : 2 * inv;
      b.w.x = _g4.x * s;
      b.w.y = _g4.y * s;
      b.w.z = _g4.z * s;
      limit(b.v, 140);
      limit(b.w, 70);
    }
    for (const b of bodies) b.touching = false;
    this.solveContactVelocities(h, last);
    for (const j of this.joints) this.dampJoint(j, h);
    // Resting contact: bleed off the last bit of jitter so piles of limbs actually settle.
    for (const b of bodies) {
      if (!b.touching || b.invMass === 0 || vlen2(b.v) > 2.25) continue;
      // Mild while still moving, strong once the body is almost at rest (kills solver noise).
      const slow = vlen2(b.v) < 0.16 && vlen2(b.w) < 9;
      const kv = Math.exp((slow ? -14 : -3) * h);
      const kw = Math.exp((slow ? -45 : -6) * h);
      vscale(b.v, b.v, kv);
      vscale(b.w, b.w, kw);
    }
  }

  // ───────────────────────────── joints ─────────────────────────────

  private solveJoint(j: Joint): void {
    const { a, b } = j;
    // Ball: world anchors must coincide.
    qrot(_c, a.q, j.la);
    qrot(_d, b.q, j.lb);
    vsub(_e, a.x, b.x);
    vadd(_e, _e, _c);
    vsub(_e, _e, _d);
    // _e = anchorA - anchorB; move a along −e (towards B's anchor) and b along +e.
    const dist = vnorm(_f, _e);
    if (dist > 1e-9) {
      vscale(_f, _f, -1);
      correctPosition(a, b, _c, _d, _f, dist);
    }
    const o = j.opts;
    if (o.cone) {
      qrot(_a, a.q, o.cone.axisA);
      qrot(_b, b.q, o.cone.axisB);
      const cosA = Math.min(1, Math.max(-1, vdot(_a, _b)));
      const ang = Math.acos(cosA);
      if (ang > o.cone.max) {
        vcross(_c, _a, _b);
        if (vnorm(_c, _c) < 1e-6) perpendicular(_c, _a);
        correctRotation(a, b, _c, ang - o.cone.max);
      }
    }
    if (o.hinge) {
      const hg = o.hinge;
      qrot(_a, a.q, hg.axisA);
      qrot(_b, b.q, hg.axisB);
      // Keep both hinge axes parallel.
      vcross(_c, _a, _b);
      const s = vnorm(_c, _c);
      if (s > 1e-6) correctRotation(a, b, _c, Math.asin(Math.min(1, s)));
      // Angle limits about the (re-read) shared axis.
      qrot(_a, a.q, hg.axisA);
      qrot(_d, a.q, hg.refA);
      qrot(_e, b.q, hg.refB);
      vcross(_f, _d, _e);
      const phi = Math.atan2(vdot(_f, _a), vdot(_d, _e));
      if (phi > hg.hi) correctRotation(a, b, _a, phi - hg.hi);
      else if (phi < hg.lo) correctRotation(a, b, _a, phi - hg.lo);
    }
  }

  private dampJoint(j: Joint, h: number): void {
    const k = j.opts.damping;
    if (!k) return;
    const { a, b } = j;
    const ia = a.invI.x + a.invI.y + a.invI.z;
    const ib = b.invI.x + b.invI.y + b.invI.z;
    if (ia + ib <= 0) return;
    const f = Math.min(0.5, k * h);
    const sa = ib > 0 ? ia / (ia + ib) : 1;
    const dx = (a.w.x - b.w.x) * f;
    const dy = (a.w.y - b.w.y) * f;
    const dz = (a.w.z - b.w.z) * f;
    a.w.x -= dx * sa;
    a.w.y -= dy * sa;
    a.w.z -= dz * sa;
    b.w.x += dx * (1 - sa);
    b.w.y += dy * (1 - sa);
    b.w.z += dz * (1 - sa);
  }

  // ───────────────────────────── contacts ─────────────────────────────

  private nextContact(): Contact | null {
    return this.nContacts < MAX_CONTACTS ? this.contacts[this.nContacts++] : null;
  }

  private collect(): void {
    this.nContacts = 0;
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      if (A.invMass === 0) continue;
      const sp = A.spheres;
      for (let si = 0; si < sp.length; si++) {
        const s = sp[si];
        qrot(_a, A.q, s.c);
        const cx = A.x.x + _a.x;
        const cy = A.x.y + _a.y;
        const cz = A.x.z + _a.z;
        // Ground
        const g = this.ground(cx, cz);
        const d = g + s.r - cy;
        if (d > 0) {
          const c = this.nextContact();
          if (c) {
            c.a = A;
            c.b = null;
            vset(c.n, 0, 1, 0);
            vset(c.p, cx, cy - s.r, cz);
            vset(c.ra, c.p.x - A.x.x, c.p.y - A.x.y, c.p.z - A.x.z);
            c.pen = d;
            c.kind = 0;
            c.shape = si;
            this.setFriction(c, A, null, this.groundMu);
            this.preVelocity(c);
          }
        }
        // Barrier
        const wall = this.barrier;
        if (wall && cy - s.r < wall.height) {
          const dist = (cx - wall.p.x) * wall.n.x + (cy - wall.p.y) * wall.n.y + (cz - wall.p.z) * wall.n.z - s.r;
          if (dist < 0) {
            const c = this.nextContact();
            if (c) {
              c.a = A;
              c.b = null;
              vcopy(c.n, wall.n);
              vset(c.p, cx - wall.n.x * s.r, cy - wall.n.y * s.r, cz - wall.n.z * s.r);
              vset(c.ra, c.p.x - A.x.x, c.p.y - A.x.y, c.p.z - A.x.z);
              c.pen = -dist;
              c.kind = 1;
              c.shape = si;
              this.setFriction(c, A, null, wall.mu);
              this.preVelocity(c);
            }
          }
        }
        // Bodies
        for (let j = 0; j < bodies.length; j++) {
          if (j === i) continue;
          const B = bodies[j];
          if (!this.pairs(A, B)) continue;
          const dx = cx - B.x.x;
          const dy = cy - B.x.y;
          const dz = cz - B.x.z;
          const rr = s.r + B.boundR;
          if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
          if (B.boxes.length) this.sphereVsBoxes(A, B, si, cx, cy, cz, s.r);
          else if (i < j && !A.boxes.length) this.sphereVsSpheres(A, B, si, cx, cy, cz, s.r);
        }
      }
    }
  }

  /** Which body pairs collide at all. */
  private pairs(A: Body, B: Body): boolean {
    if (A.kind === 'rider' && B.kind === 'rider') return false;
    if (A.kind === 'car' && B.kind === 'car') return false;
    if (A.kind === 'debris' || B.kind === 'debris') return false;
    if ((A.kind === 'rider' && B.kind === 'bike') || (A.kind === 'bike' && B.kind === 'rider')) {
      const key = A.kind === 'rider' ? A.index * 1024 + B.index : B.index * 1024 + A.index;
      if (this.pairActive.get(key)) return true;
      // Switch on once the two have separated (a seated rider overlaps the bike at the start).
      if (!this.overlapping(A, B)) {
        this.pairActive.set(key, true);
        return true;
      }
      return false;
    }
    // Only dynamic-vs-box and sphere-vs-sphere pairs are handled; box bodies only act as B.
    if (A.boxes.length && !A.spheres.length) return false;
    return true;
  }

  private overlapping(A: Body, B: Body): boolean {
    for (const sa of A.spheres) {
      qrot(_o1, A.q, sa.c);
      for (const sb of B.spheres) {
        qrot(_o2, B.q, sb.c);
        const dx = A.x.x + _o1.x - (B.x.x + _o2.x);
        const dy = A.x.y + _o1.y - (B.x.y + _o2.y);
        const dz = A.x.z + _o1.z - (B.x.z + _o2.z);
        const r = sa.r + sb.r + 0.02;
        if (dx * dx + dy * dy + dz * dz < r * r) return true;
      }
    }
    return false;
  }

  private sphereVsSpheres(A: Body, B: Body, si: number, cx: number, cy: number, cz: number, r: number): void {
    // Only bike↔rider pairs reach here (rider-rider / car-car are filtered).
    for (let k = 0; k < B.spheres.length; k++) {
      const sb = B.spheres[k];
      qrot(_v1, B.q, sb.c);
      const dx = cx - (B.x.x + _v1.x);
      const dy = cy - (B.x.y + _v1.y);
      const dz = cz - (B.x.z + _v1.z);
      const rr = r + sb.r;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rr * rr) continue;
      const c = this.nextContact();
      if (!c) return;
      const dist = Math.sqrt(d2);
      if (dist > 1e-6) vset(c.n, dx / dist, dy / dist, dz / dist);
      else vset(c.n, 0, 1, 0);
      c.a = A;
      c.b = B;
      c.pen = rr - dist;
      vset(c.p, cx - c.n.x * r, cy - c.n.y * r, cz - c.n.z * r);
      vset(c.ra, c.p.x - A.x.x, c.p.y - A.x.y, c.p.z - A.x.z);
      vset(c.rb, c.p.x - B.x.x, c.p.y - B.x.y, c.p.z - B.x.z);
      c.kind = 2;
      c.shape = si;
      this.setFriction(c, A, B, 0);
      this.preVelocity(c);
    }
  }

  private sphereVsBoxes(A: Body, B: Body, si: number, cx: number, cy: number, cz: number, r: number): void {
    vset(_lc, cx - B.x.x, cy - B.x.y, cz - B.x.z);
    qrotInv(_lc, B.q, _lc); // sphere centre in B's frame
    for (let k = 0; k < B.boxes.length; k++) {
      const bx = B.boxes[k];
      const lx = _lc.x - bx.c.x;
      const ly = _lc.y - bx.c.y;
      const lz = _lc.z - bx.c.z;
      const qx = Math.max(-bx.h.x, Math.min(bx.h.x, lx));
      const qy = Math.max(-bx.h.y, Math.min(bx.h.y, ly));
      const qz = Math.max(-bx.h.z, Math.min(bx.h.z, lz));
      let nx = lx - qx;
      let ny = ly - qy;
      let nz = lz - qz;
      const d2 = nx * nx + ny * ny + nz * nz;
      let pen: number;
      if (d2 > 1e-10) {
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        nx /= d;
        ny /= d;
        nz /= d;
        pen = r - d;
      } else {
        // Centre inside: leave through the nearest face.
        const px = bx.h.x - Math.abs(lx);
        const py = bx.h.y - Math.abs(ly);
        const pz = bx.h.z - Math.abs(lz);
        nx = ny = nz = 0;
        if (px <= py && px <= pz) {
          nx = lx >= 0 ? 1 : -1;
          pen = px + r;
        } else if (py <= pz) {
          ny = ly >= 0 ? 1 : -1;
          pen = py + r;
        } else {
          nz = lz >= 0 ? 1 : -1;
          pen = pz + r;
        }
      }
      const c = this.nextContact();
      if (!c) return;
      vset(_ln, nx, ny, nz);
      qrot(c.n, B.q, _ln);
      c.a = A;
      c.b = B;
      c.pen = pen;
      vset(c.p, cx - c.n.x * r, cy - c.n.y * r, cz - c.n.z * r);
      vset(c.ra, c.p.x - A.x.x, c.p.y - A.x.y, c.p.z - A.x.z);
      vset(c.rb, c.p.x - B.x.x, c.p.y - B.x.y, c.p.z - B.x.z);
      c.kind = 2;
      c.shape = si;
      this.setFriction(c, A, B, 0);
      this.preVelocity(c);
    }
  }

  private setFriction(c: Contact, A: Body, B: Body | null, surface: number): void {
    // Surface contact: the surface friction scales the body's own grip (metal slides, leather grabs).
    c.mu = B ? Math.sqrt(A.mu * B.mu) : A.mu * (surface > 0 ? surface : 1);
    c.restitution = B ? Math.min(A.restitution, B.restitution) : A.restitution;
    if (A.muLong >= 0 && !B) {
      c.muLong = A.muLong * (surface > 0 ? surface : 1);
      c.muLat = A.muLat * (surface > 0 ? surface : 1);
    } else if (B && B.muLong >= 0) {
      c.muLong = -1;
      c.muLat = c.mu;
    } else {
      c.muLong = -1;
      c.muLat = c.mu;
    }
  }

  /** Normal approach speed before the position solve (for restitution and impact events). */
  private preVelocity(c: Contact): void {
    pointVelocity(_v1, c.a, c.ra);
    if (c.b) {
      pointVelocity(_v2, c.b, c.rb);
      vsub(_v1, _v1, _v2);
    }
    c.vnPre = vdot(_v1, c.n);
  }

  private solveContacts(): void {
    for (let i = 0; i < this.nContacts; i++) {
      const c = this.contacts[i];
      if (c.pen <= 0) continue;
      correctPosition(c.a, c.b, c.ra, c.rb, c.n, c.pen);
    }
  }

  private solveContactVelocities(h: number, last: boolean): void {
    for (let i = 0; i < this.nContacts; i++) {
      const c = this.contacts[i];
      if (c.pen <= 0) continue;
      const A = c.a;
      const B = c.b;
      A.touching = true;
      if (B) B.touching = true;
      pointVelocity(_a, A, c.ra);
      if (B) {
        pointVelocity(_b, B, c.rb);
        vsub(_a, _a, _b);
      }
      const vn = vdot(_a, c.n);
      // Tangential relative velocity.
      vmad(_a, c.n, -vn);
      const vt = vlen(_a);
      // Restitution (only for real impacts, not resting contact jitter).
      let dvn = 0;
      if (c.vnPre < -1.8) dvn = Math.max(0, -c.restitution * c.vnPre) - vn;
      if (dvn > 0) applyImpulse(A, B, c.ra, c.rb, c.n, dvn);
      // Friction: Coulomb bound from the normal correction of this sub-step.
      if (vt > 1e-4) {
        const maxDv = (c.mu * c.pen) / h;
        if (c.muLong >= 0) {
          this.wheeledFriction(c, _a, h);
        } else {
          const dv = Math.min(vt, maxDv);
          vscale(_c, _a, -1 / vt);
          applyImpulse(A, B, c.ra, c.rb, _c, dv);
        }
      }
      if (last) this.record(c, vn, vt);
    }
  }

  /** Rolling friction along the wheels, grip across them. */
  private wheeledFriction(c: Contact, vt: V3, h: number): void {
    const A = c.a;
    qrot(_d, A.q, A.fwd);
    vmad(_d, c.n, -vdot(_d, c.n));
    if (vnorm(_d, _d) < 1e-6) return;
    const along = vdot(vt, _d);
    vcross(_e, c.n, _d);
    const across = vdot(vt, _e);
    const dvL = Math.min(Math.abs(along), (c.muLong * c.pen) / h) * Math.sign(-along);
    const dvT = Math.min(Math.abs(across), (c.muLat * c.pen) / h) * Math.sign(-across);
    if (dvL !== 0) applyImpulse(A, c.b, c.ra, c.rb, _d, dvL);
    if (dvT !== 0) applyImpulse(A, c.b, c.ra, c.rb, _e, dvT);
  }

  private record(c: Contact, vn: number, vt: number): void {
    const approach = -c.vnPre;
    if (approach > 1.5 && this.eventCount < MAX_EVENTS) {
      const e = this.events[this.eventCount++];
      e.speed = approach;
      vcopy(e.p, c.p);
      vcopy(e.n, c.n);
      e.a = c.a;
      e.b = c.b;
      e.kind = c.kind;
    }
    if (vt > 2 && vn < 4 && this.slideCount < MAX_SLIDES) {
      const s = this.slides[this.slideCount++];
      s.speed = vt;
      vcopy(s.p, c.p);
      pointVelocity(_g, c.a, c.ra);
      vmad(_g, c.n, -vdot(_g, c.n));
      vnorm(s.dir, _g);
      s.a = c.a;
      s.b = c.b;
      s.kind = c.kind;
    }
  }

  /** Deepest overlap between two bodies at their current pose (m). */
  maxPenetration(a: Body, b: Body): number {
    this.collect();
    let m = 0;
    for (let i = 0; i < this.nContacts; i++) {
      const c = this.contacts[i];
      if (c.b && ((c.a === a && c.b === b) || (c.a === b && c.b === a))) m = Math.max(m, c.pen);
    }
    return m;
  }

  /** Deepest overlap between any rider segment and `b`. */
  maxPenetrationRider(b: Body): number {
    this.collect();
    let m = 0;
    for (let i = 0; i < this.nContacts; i++) {
      const c = this.contacts[i];
      if (c.b === b && c.a.kind === 'rider') m = Math.max(m, c.pen);
    }
    return m;
  }

  /** Move everything (floating-origin rebase). */
  shift(dx: number, dy: number, dz: number): void {
    for (const b of this.bodies) {
      b.x.x -= dx;
      b.x.y -= dy;
      b.x.z -= dz;
      b.px.x -= dx;
      b.px.y -= dy;
      b.px.z -= dz;
    }
    if (this.barrier) {
      this.barrier.p.x -= dx;
      this.barrier.p.y -= dy;
      this.barrier.p.z -= dz;
    }
  }

  /** Total linear momentum of the non-debris bodies. */
  momentum(out: V3): V3 {
    vset(out, 0, 0, 0);
    for (const b of this.bodies) if (b.invMass > 0) vmad(out, b.v, 1 / b.invMass);
    return out;
  }

  /** Kinetic + potential energy (J), for sanity checks. */
  energy(): number {
    let e = 0;
    for (const b of this.bodies) {
      if (b.invMass <= 0) continue;
      const m = 1 / b.invMass;
      e += 0.5 * m * vlen2(b.v) + m * this.gravity * b.x.y;
      // Rotational (principal axes).
      qrotInv(_a, b.q, b.w);
      e += 0.5 * (_a.x * _a.x / b.invI.x + _a.y * _a.y / b.invI.y + _a.z * _a.z / b.invI.z);
    }
    return e;
  }

  /** True when every body state is finite and within sane bounds. */
  sane(maxSpeed = 160): boolean {
    for (const b of this.bodies) {
      const s = b.x.x + b.x.y + b.x.z + b.v.x + b.v.y + b.v.z + b.q.x + b.q.y + b.q.z + b.q.w + b.w.x + b.w.y + b.w.z;
      if (!Number.isFinite(s) || vlen(b.v) > maxSpeed) return false;
    }
    return true;
  }
}

const _g4 = q4();

function limit(v: V3, max: number): void {
  const l2 = vlen2(v);
  if (l2 > max * max) vscale(v, v, max / Math.sqrt(l2));
}

function perpendicular(o: V3, a: V3): void {
  if (Math.abs(a.x) < 0.9) vset(_g, 1, 0, 0);
  else vset(_g, 0, 1, 0);
  vcross(o, a, _g);
  vnorm(o, o);
}

/** Velocity of the point at offset `r` from the body's centre. */
export function pointVelocity(o: V3, b: Body, r: V3): V3 {
  vcross(o, b.w, r);
  o.x += b.v.x;
  o.y += b.v.y;
  o.z += b.v.z;
  return o;
}

/** Velocity change `dv` along unit `dir` at the contact (distributed by effective mass). */
function applyImpulse(a: Body, b: Body | null, ra: V3, rb: V3, dir: V3, dv: number): void {
  vcross(_i1, ra, dir);
  applyInvI(a, _i1, _i2);
  let w = a.invMass + vdot(_i1, _i2);
  if (b) {
    vcross(_i3, rb, dir);
    applyInvI(b, _i3, _i4);
    w += b.invMass + vdot(_i3, _i4);
  }
  if (w < 1e-12) return;
  const lam = dv / w;
  vmad(a.v, dir, lam * a.invMass);
  vmad(a.w, _i2, lam);
  if (b) {
    vmad(b.v, dir, -lam * b.invMass);
    vmad(b.w, _i4, -lam);
  }
}
