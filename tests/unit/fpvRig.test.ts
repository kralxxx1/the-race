import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { InputManager } from '../../src/input/input';
import { computeWake, MAX_WAKE_PUSH, type WakeCar } from '../../src/game/wake';
import { crashPhase, crashTimeScale, planCrash } from '../../src/render/fpv/crashPlan';
import { MirrorRig, type MirrorHost } from '../../src/render/fpv/mirrors';
import { DropletField, MAX_DROPS } from '../../src/render/fpv/visorDrops';

/** A bike-like host with two glass quads facing the rider (+Z), one on the steering group, one on the chassis. */
function host(): MirrorHost & { all: THREE.Mesh[] } {
  const steer = new THREE.Group();
  const chassis = new THREE.Group();
  chassis.add(steer);
  const glass = (x: number, parent: THREE.Object3D) => {
    const g = new THREE.PlaneGeometry(0.15, 0.075);
    g.translate(x, 1.0, -0.6);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
    parent.add(m);
    return m;
  };
  const left = glass(-0.4, steer);
  const right = glass(0.4, chassis);
  return { mirrors: { left, right }, steer, chassis, frame: { head: new THREE.Vector3(0, 0.9, -1.3), rake: 0.45 }, all: [left, right] };
}

/** Minimal renderer double that records what the rig does to it. */
function fakeRenderer() {
  const calls: string[] = [];
  let target: THREE.WebGLRenderTarget | null = null;
  const visibleDuring: boolean[][] = [];
  return {
    calls,
    visibleDuring,
    renderer: {
      shadowMap: { autoUpdate: true },
      getRenderTarget: () => target,
      setRenderTarget: (t: THREE.WebGLRenderTarget | null) => {
        target = t;
        calls.push(t ? `target:${t.width}x${t.height}` : 'target:null');
      },
      render: () => calls.push('render'),
    } as unknown as THREE.WebGLRenderer,
  };
}

describe('mirror render-to-texture', () => {
  it('creates sized render targets, renders them on schedule, and restores state', () => {
    const h = host();
    const rig = new MirrorRig(h);
    expect(rig.count).toBe(2);
    expect(rig.active).toBe(false);
    rig.configure('medium', 20);
    expect(rig.active).toBe(true);
    expect(rig.targetSize(0)).toEqual(MirrorRig.size('medium', 2));
    const fr = fakeRenderer();
    const scene = new THREE.Scene();
    const eye = new THREE.Vector3(0, 1.3, -0.2);
    // 20 Hz per mirror → one mirror pass every 25 ms.
    rig.render(fr.renderer, scene, eye, 0.02, null);
    expect(rig.passes).toBe(0);
    rig.render(fr.renderer, scene, eye, 0.02, null);
    expect(rig.passes).toBe(1);
    expect(fr.calls.filter((c) => c === 'render')).toHaveLength(1);
    // Targets restored, shadows back, mirror meshes visible again.
    expect(fr.calls[fr.calls.length - 1]).toBe('target:null');
    expect(fr.renderer.shadowMap.autoUpdate).toBe(true);
    for (const m of h.all) expect(m.visible).toBe(true);
    // The two mirrors alternate.
    rig.render(fr.renderer, scene, eye, 0.03, null);
    expect(rig.passes).toBe(2);
    rig.dispose();
  });

  it('hides the glass during its own pass (no feedback loop) and every-frame mode renders both', () => {
    const h = host();
    const rig = new MirrorRig(h);
    rig.configure('low', 60);
    const fr = fakeRenderer();
    const seen: boolean[] = [];
    (fr.renderer as unknown as { render: () => void }).render = () => seen.push(h.all.every((m) => !m.visible));
    rig.render(fr.renderer, new THREE.Scene(), new THREE.Vector3(0, 1.3, -0.2), 0.016, null);
    expect(seen).toEqual([true, true]);
    expect(rig.passes).toBe(2);
    rig.dispose();
  });

  it('skips work when asked (looking back) and when off', () => {
    const h = host();
    const rig = new MirrorRig(h);
    const fr = fakeRenderer();
    rig.render(fr.renderer, new THREE.Scene(), new THREE.Vector3(), 1, null);
    expect(fr.calls).toHaveLength(0);
    rig.configure('high', 60);
    rig.render(fr.renderer, new THREE.Scene(), new THREE.Vector3(), 1, null, true);
    expect(fr.calls).toHaveLength(0);
    rig.dispose();
  });

  it('disposes render targets, materials and cloned geometry, and restores the originals', () => {
    const h = host();
    const originals = h.all.map((m) => ({ mat: m.material, geo: m.geometry }));
    const disposed = { rt: 0, mat: 0, geo: 0 };
    const proto = THREE.WebGLRenderTarget.prototype;
    const realDispose = proto.dispose;
    proto.dispose = function (this: THREE.WebGLRenderTarget) {
      disposed.rt++;
      realDispose.call(this);
    };
    const rig = new MirrorRig(h);
    rig.configure('medium', 30);
    // Spy on whatever the rig created.
    for (const m of h.all) {
      expect(m.material).not.toBe(originals[h.all.indexOf(m)].mat);
      (m.material as THREE.Material).addEventListener('dispose', () => disposed.mat++);
      m.geometry.addEventListener('dispose', () => disposed.geo++);
    }
    try {
      rig.dispose();
    } finally {
      proto.dispose = realDispose;
    }
    expect(disposed.rt).toBe(2);
    expect(disposed.mat).toBe(2);
    expect(disposed.geo).toBe(2);
    h.all.forEach((m, i) => {
      expect(m.material).toBe(originals[i].mat);
      expect(m.geometry).toBe(originals[i].geo);
    });
    expect(rig.active).toBe(false);
    // Idempotent and inert afterwards.
    rig.dispose();
    rig.configure('high', 60);
    expect(rig.active).toBe(false);
  });

  it('switching the quality off frees the targets and restores the plain glass', () => {
    const h = host();
    const rig = new MirrorRig(h);
    const orig = h.all[0].material;
    rig.configure('ultra', 30);
    expect(rig.targetSize(0)).toEqual(MirrorRig.size('ultra', 2));
    rig.configure('off', 30);
    expect(rig.targetSize(0)).toBeNull();
    expect(h.all[0].material).toBe(orig);
    rig.dispose();
  });
});

describe('look-back input', () => {
  function pad() {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);
    const key = (type: 'keydown' | 'keyup', code: string) => target.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
    return { input, key };
  }

  it('is held with B and released with it', () => {
    const { input, key } = pad();
    expect(input.update(1 / 60).lookBack).toBe(false);
    key('keydown', 'KeyB');
    expect(input.update(1 / 60).lookBack).toBe(true);
    expect(input.update(1 / 60).lookBack).toBe(true);
    key('keyup', 'KeyB');
    expect(input.update(1 / 60).lookBack).toBe(false);
    input.dispose();
  });

  it('follows the on-screen hold button and does not leak into other controls', () => {
    const { input } = pad();
    input.setTouchLookBack(true);
    const f = input.update(1 / 60);
    expect(f.lookBack).toBe(true);
    expect(f.throttle).toBe(0);
    expect(f.pause).toBe(false);
    input.setTouchLookBack(false);
    expect(input.update(1 / 60).lookBack).toBe(false);
    input.setTouchLookBack(true);
    input.reset();
    expect(input.update(1 / 60).lookBack).toBe(false);
    input.dispose();
  });

  it('can be scripted through the test override', () => {
    const { input } = pad();
    input.override = { lookBack: true };
    expect(input.update(1 / 60).lookBack).toBe(true);
    input.dispose();
  });
});

describe('crash direction', () => {
  it('both = helmet tumble then a cinematic replay; respawn modes keep the helmet only', () => {
    const both = planCrash('both', false);
    expect(crashPhase(both, 0.5)).toBe('fpv');
    expect(crashPhase(both, both.firstEnd + 0.1)).toBe('replay');
    expect(both.total).toBeGreaterThan(both.firstEnd + 2);
    expect(planCrash('both', true).replay).toBe(false);
    expect(crashPhase(planCrash('cinematic', false), 0.2)).toBe('cine');
    expect(crashPhase(planCrash('fpv', false), 2)).toBe('fpv');
  });

  it('slow motion is strongest at the impact, returns to real time and can be switched off', () => {
    const plan = planCrash('both', false);
    expect(crashTimeScale(plan, 0, 1)).toBeLessThan(0.3);
    expect(crashTimeScale(plan, 0, 0)).toBe(1);
    expect(crashTimeScale(plan, 2.4, 1)).toBeCloseTo(1, 1);
    let prev = 0;
    for (let t = 0; t < 2.8; t += 0.05) {
      const k = crashTimeScale(plan, t, 0.8);
      expect(k).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = k;
    }
    // The replay slows down again, less strongly.
    const k = crashTimeScale(plan, plan.firstEnd + 0.2, 1);
    expect(k).toBeLessThan(0.7);
    expect(k).toBeGreaterThan(0.3);
  });
});

describe('visor droplets', () => {
  it('stay bounded, run up the visor at speed and sit still when parked', () => {
    const f = new DropletField(3);
    const p = { rain: 1, speed: 35, side: 0, buffet: 0.3 };
    for (let i = 0; i < 1200; i++) {
      f.update(1 / 60, p);
      expect(f.count).toBeLessThanOrEqual(MAX_DROPS);
    }
    expect(f.count).toBeGreaterThan(10);
    for (let i = 0; i < f.count; i++) {
      expect(Number.isFinite(f.x[i] + f.y[i] + f.r[i])).toBe(true);
      expect(f.y[i]).toBeGreaterThan(-0.1);
      expect(f.y[i]).toBeLessThan(1.1);
    }
    // At speed, drops that move go up (negative y velocity).
    let up = 0;
    let down = 0;
    for (let i = 0; i < f.count; i++) {
      if (f.vy[i] < -0.01) up++;
      if (f.vy[i] > 0.01) down++;
    }
    expect(up).toBeGreaterThan(down);
    // Rain stops: the visor clears as drops are blown off.
    for (let i = 0; i < 1500; i++) f.update(1 / 60, { rain: 0, speed: 35, side: 0, buffet: 0 });
    expect(f.count).toBeLessThan(5);
    // Standing still: small drops stay where they landed.
    const g = new DropletField(5);
    for (let i = 0; i < 300; i++) g.update(1 / 60, { rain: 0.3, speed: 0, side: 0, buffet: 0 });
    const x0 = Array.from(g.x.slice(0, g.count));
    const y0 = Array.from(g.y.slice(0, g.count));
    for (let i = 0; i < 30; i++) g.update(1 / 60, { rain: 0, speed: 0, side: 0, buffet: 0 });
    let moved = 0;
    for (let i = 0; i < Math.min(x0.length, g.count); i++) if (Math.abs(g.x[i] - x0[i]) + Math.abs(g.y[i] - y0[i]) > 0.02 && g.r[i] < 5) moved++;
    expect(moved).toBe(0);
  });
});

describe('traffic wake', () => {
  const truck = (over: Partial<WakeCar> = {}): WakeCar => ({ s: 100, d: 0, v: 22, dir: 1, length: 12, width: 2.5, arch: { heavy: true }, ...over });

  it('shoves the rider away from a truck beside its nose, pulls in behind it, and is deterministic', () => {
    const out = { push: 0, turbulence: 0 };
    // Bike to the right of the truck (+d), level with its front.
    computeWake(106, 2.6, 36, [truck()], out);
    expect(out.push).toBeGreaterThan(0.05);
    const nose = out.push;
    // Mirror image: bike on the left → the push flips sign.
    computeWake(106, -2.6, 36, [truck()], out);
    expect(out.push).toBeCloseTo(-nose, 6);
    // In the lee behind the trailer the bike is sucked towards the truck.
    computeWake(88, 2.6, 36, [truck()], out);
    expect(out.push).toBeLessThan(0);
    expect(out.turbulence).toBeGreaterThan(0.02);
    // Same input, same output.
    const a = computeWake(106, 2.6, 36, [truck()], { push: 0, turbulence: 0 });
    const b = computeWake(106, 2.6, 36, [truck()], { push: 0, turbulence: 0 });
    expect(a).toEqual(b);
  });

  it('is zero away from traffic, weak for cars, bounded for any pile-up', () => {
    const out = { push: 0, turbulence: 0 };
    computeWake(0, 0, 30, [truck({ s: 500 })], out);
    expect(out.push).toBe(0);
    computeWake(0, 6, 30, [truck({ s: 0, d: 0 })], out);
    expect(out.push).toBe(0);
    const car = truck({ arch: { heavy: false }, length: 4.5, width: 1.8 });
    computeWake(104, 2.2, 36, [car], out);
    const carPush = Math.abs(out.push);
    computeWake(104, 2.2, 36, [truck({ length: 4.5, width: 1.8 })], out);
    expect(carPush).toBeLessThan(Math.abs(out.push));
    const many = Array.from({ length: 12 }, (_, i) => truck({ s: 100 + i, d: i % 2 ? 0.3 : -0.3, dir: i % 3 === 0 ? -1 : 1 }));
    computeWake(106, 1.8, 60, many, out);
    expect(Math.abs(out.push)).toBeLessThanOrEqual(MAX_WAKE_PUSH + 1e-9);
    expect(out.turbulence).toBeLessThanOrEqual(1);
  });

  it('oncoming traffic gives one sharp shove as it passes', () => {
    const out = { push: 0, turbulence: 0 };
    const onc = truck({ dir: -1, d: -3.5, v: 25 });
    computeWake(100, -0.3, 30, [onc], out);
    expect(out.push).toBeGreaterThan(0.1);
    expect(out.turbulence).toBeGreaterThan(0.1);
  });
});
