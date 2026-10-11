import { describe, expect, it } from 'vitest';
import { DEFAULT_HEAD_SETTINGS, HEAD_LIMITS, HeadMotion, LOOK_BACK_YAW, makeHeadInput, makeHeadPose, type HeadInput, type HeadPose, type HeadSettings } from '../../src/render/fpv/headMotion';
import { SETTINGS } from '../../src/settings';
import { SettingsReader } from '../../src/settings';
import { makeFpvOptions, readFpvOptions } from '../../src/render/cameraSettings';

/** Scripted ride: accelerate, corner both ways, brake hard, pass a truck. */
function script(t: number, inp: HeadInput): void {
  inp.speed = Math.min(70, 8 + t * 9);
  inp.lean = 0.6 * Math.sin(t * 0.9) * Math.min(1, t / 3);
  inp.leanRate = 0.6 * 0.9 * Math.cos(t * 0.9);
  inp.yawRate = inp.lean * 0.7;
  inp.accel = t < 6 ? 5 : t < 8 ? -9 : 1;
  inp.rpmFrac = 0.35 + 0.5 * Math.abs(Math.sin(t * 0.7));
  inp.roughness = t > 4 ? 0.6 : 0.1;
  inp.rumble = t > 9 && t < 10 ? 1 : 0;
  inp.turbulence = t > 5 && t < 6.5 ? 0.9 : 0;
  inp.tuckStyle = 1;
}

function simulate(hz: number, seconds: number, s: HeadSettings = DEFAULT_HEAD_SETTINGS): { poses: HeadPose[]; last: HeadPose } {
  const hm = new HeadMotion();
  const inp = makeHeadInput();
  const pose = makeHeadPose();
  const poses: HeadPose[] = [];
  const dt = 1 / hz;
  const n = Math.round(seconds * hz);
  for (let i = 1; i <= n; i++) {
    script(i * dt, inp);
    hm.step(dt, inp, s, pose);
    poses.push({ ...pose });
  }
  return { poses, last: { ...pose } };
}

describe('head motion', () => {
  it('stays inside the pose limits for any input', () => {
    const hm = new HeadMotion();
    const inp = makeHeadInput();
    const pose = makeHeadPose();
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    for (let i = 0; i < 4000; i++) {
      inp.speed = Math.abs(rnd()) * 120;
      inp.lean = rnd() * 1.5;
      inp.leanRate = rnd() * 20;
      inp.accel = rnd() * 40;
      inp.pitch = Math.abs(rnd()) * 1.5;
      inp.yawRate = rnd() * 5;
      inp.rpmFrac = Math.abs(rnd()) * 1.4;
      inp.roughness = Math.abs(rnd());
      inp.rumble = Math.abs(rnd());
      inp.turbulence = Math.abs(rnd());
      inp.tuckStyle = Math.abs(rnd());
      inp.lookBack = rnd() > 0 ? 1 : 0;
      hm.step(1 / 60, inp, { ...DEFAULT_HEAD_SETTINGS, motion: 1.5, wind: 2, engineVib: 2, roadVib: 2 }, pose);
      for (const v of [pose.px, pose.py, pose.pz]) expect(Math.abs(v)).toBeLessThanOrEqual(HEAD_LIMITS.pos + 1e-9);
      expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(HEAD_LIMITS.pitch + 1e-9);
      expect(Math.abs(pose.roll)).toBeLessThanOrEqual(HEAD_LIMITS.roll + 1e-9);
      expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(HEAD_LIMITS.yaw + LOOK_BACK_YAW + 1e-9);
      expect(Math.abs(pose.fovAdd)).toBeLessThanOrEqual(HEAD_LIMITS.fov + 1e-9);
      expect(Number.isFinite(pose.px + pose.py + pose.pz + pose.yaw + pose.pitch + pose.roll + pose.fovAdd)).toBe(true);
    }
  });

  it('is smooth: no frame-to-frame jumps in the low-frequency channels', () => {
    // Vibration off so only the dynamic channels (spring driven) are measured.
    const { poses } = simulate(60, 12, { ...DEFAULT_HEAD_SETTINGS, shake: 0 });
    let maxAng = 0;
    let maxPos = 0;
    let maxFov = 0;
    for (let i = 1; i < poses.length; i++) {
      maxAng = Math.max(maxAng, Math.abs(poses[i].yaw - poses[i - 1].yaw), Math.abs(poses[i].pitch - poses[i - 1].pitch), Math.abs(poses[i].roll - poses[i - 1].roll));
      maxPos = Math.max(maxPos, Math.abs(poses[i].py - poses[i - 1].py), Math.abs(poses[i].pz - poses[i - 1].pz));
      maxFov = Math.max(maxFov, Math.abs(poses[i].fovAdd - poses[i - 1].fovAdd));
    }
    expect(maxAng).toBeLessThan(0.02);
    expect(maxPos).toBeLessThan(0.006);
    expect(maxFov).toBeLessThan(0.4);
  });

  it('does not depend on the frame rate', () => {
    const settings = { ...DEFAULT_HEAD_SETTINGS };
    const a = simulate(30, 11, settings).last;
    const b = simulate(60, 11, settings).last;
    const c = simulate(144, 11, settings).last;
    for (const k of ['yaw', 'pitch', 'roll', 'px', 'py', 'pz', 'fovAdd', 'tuck'] as const) {
      const tol = k === 'fovAdd' ? 0.35 : k === 'px' || k === 'py' || k === 'pz' ? 0.003 : 0.012;
      expect(Math.abs(a[k] - b[k])).toBeLessThan(tol);
      expect(Math.abs(c[k] - b[k])).toBeLessThan(tol);
    }
  });

  it('counter-tilts toward the horizon in a lean, in proportion to the setting', () => {
    const run = (horizon: number) => {
      const hm = new HeadMotion();
      const inp = makeHeadInput();
      const pose = makeHeadPose();
      inp.speed = 30;
      inp.lean = 0.6;
      for (let i = 0; i < 180; i++) hm.step(1 / 60, inp, { ...DEFAULT_HEAD_SETTINGS, horizon, shake: 0 }, pose);
      return pose.roll;
    };
    const none = run(0);
    const part = run(0.6);
    const full = run(1);
    expect(Math.abs(none)).toBeLessThan(0.01);
    expect(part).toBeGreaterThan(0.2);
    expect(full).toBeGreaterThan(part);
    // The head roll opposes the bike's lean (leaning right = negative roll about +Z on the bike).
    expect(full).toBeLessThan(0.7);
  });

  it('looks into the corner (yaw follows the lean) and tucks at speed on sport bikes only', () => {
    const hm = new HeadMotion();
    const inp = makeHeadInput();
    const pose = makeHeadPose();
    inp.speed = 25;
    inp.lean = 0.7;
    for (let i = 0; i < 120; i++) hm.step(1 / 60, inp, { ...DEFAULT_HEAD_SETTINGS, shake: 0 }, pose);
    expect(pose.yaw).toBeLessThan(-0.1);
    const tuckOf = (style: number, speed: number) => {
      const h = new HeadMotion();
      const i = makeHeadInput();
      const p = makeHeadPose();
      i.speed = speed;
      i.tuckStyle = style;
      for (let k = 0; k < 400; k++) h.step(1 / 60, i, { ...DEFAULT_HEAD_SETTINGS, shake: 0 }, p);
      return p;
    };
    expect(tuckOf(1, 65).tuck).toBeGreaterThan(0.9);
    expect(tuckOf(1, 65).py).toBeLessThan(-0.05);
    expect(tuckOf(0, 65).tuck).toBe(0);
    expect(tuckOf(1, 15).tuck).toBe(0);
  });

  it('look-back turns the head about 150° over the shoulder and returns', () => {
    const hm = new HeadMotion();
    const inp = makeHeadInput();
    const pose = makeHeadPose();
    inp.speed = 20;
    inp.lookBack = 1;
    inp.lookBackSide = 1;
    for (let i = 0; i < 60; i++) hm.step(1 / 60, inp, DEFAULT_HEAD_SETTINGS, pose);
    expect(pose.lookBack).toBeGreaterThan(0.97);
    expect((pose.yaw * 180) / Math.PI).toBeGreaterThan(140);
    expect((pose.yaw * 180) / Math.PI).toBeLessThan(170);
    // Takes roughly a third of a second, not instant.
    const h2 = new HeadMotion();
    const p2 = makeHeadPose();
    for (let i = 0; i < 5; i++) h2.step(1 / 60, inp, DEFAULT_HEAD_SETTINGS, p2);
    expect(p2.lookBack).toBeLessThan(0.6);
    inp.lookBack = 0;
    for (let i = 0; i < 90; i++) hm.step(1 / 60, inp, DEFAULT_HEAD_SETTINGS, pose);
    expect(pose.lookBack).toBeLessThan(0.01);
    expect(Math.abs(pose.yaw)).toBeLessThan(0.5);
    // Other shoulder.
    inp.lookBack = 1;
    inp.lookBackSide = -1;
    for (let i = 0; i < 60; i++) hm.step(1 / 60, inp, DEFAULT_HEAD_SETTINGS, pose);
    expect(pose.yaw).toBeLessThan(-2.4);
  });

  it('wind buffeting needs speed and fades when tucked; shake=0 removes every vibration', () => {
    const rms = (speed: number, tuckStyle: number, shake: number) => {
      const hm = new HeadMotion();
      const inp = makeHeadInput();
      const pose = makeHeadPose();
      inp.speed = speed;
      inp.tuckStyle = tuckStyle;
      inp.rpmFrac = 0.8;
      let sum = 0;
      for (let i = 0; i < 600; i++) {
        hm.step(1 / 60, inp, { ...DEFAULT_HEAD_SETTINGS, shake, tuck: tuckStyle }, pose);
        if (i > 300) sum += pose.roll * pose.roll + pose.yaw * pose.yaw;
      }
      return Math.sqrt(sum / 300);
    };
    expect(rms(60, 0, 1)).toBeGreaterThan(rms(20, 0, 1));
    expect(rms(60, 0, 1)).toBeGreaterThan(rms(60, 1, 1));
    expect(rms(60, 0, 0)).toBeLessThan(0.0005);
  });

  it('close passes punch the FOV and decay', () => {
    const hm = new HeadMotion();
    const inp = makeHeadInput();
    const pose = makeHeadPose();
    inp.speed = 30;
    for (let i = 0; i < 120; i++) hm.step(1 / 60, inp, DEFAULT_HEAD_SETTINGS, pose);
    const base = pose.fovAdd;
    hm.punch(1, 1);
    hm.step(1 / 60, inp, DEFAULT_HEAD_SETTINGS, pose);
    expect(pose.fovAdd).toBeGreaterThan(base + 3);
    for (let i = 0; i < 120; i++) hm.step(1 / 60, inp, DEFAULT_HEAD_SETTINGS, pose);
    expect(Math.abs(pose.fovAdd - base)).toBeLessThan(0.3);
  });
});

describe('camera settings', () => {
  it('every camera option has a definition and a resolved value', () => {
    const reader = new SettingsReader(SETTINGS, SETTINGS.defaults('high'));
    const o = readFpvOptions(reader, makeFpvOptions());
    expect(o.fov).toBe(74);
    expect(o.crashCamera).toBe('both');
    expect(o.mirrors).toBe('medium');
    for (const key of ['cam.fov', 'cam.speedFov', 'cam.headMotion', 'cam.horizonTilt', 'cam.lookIntoTurn', 'cam.tuck', 'cam.shake', 'cam.engineVibration', 'cam.roadVibration', 'cam.windBuffet', 'cam.nearMissFx', 'cam.mirrors', 'cam.mirrorRate', 'cam.visorRain', 'cam.visorFrame', 'cam.crashCamera', 'cam.crashSlowmo', 'cam.motionComfort']) {
      expect(SETTINGS.has(key), key).toBe(true);
    }
  });

  it('presets: mirrors are off on low and scale up; refresh rate too', () => {
    const at = (p: 'low' | 'medium' | 'high' | 'ultra' | 'extreme') => readFpvOptions(new SettingsReader(SETTINGS, SETTINGS.defaults(p)), makeFpvOptions());
    expect(at('low').mirrors).toBe('off');
    expect(at('medium').mirrors).not.toBe('off');
    expect(at('extreme').mirrors).toBe('ultra');
    expect(at('low').mirrorHz).toBeLessThan(at('extreme').mirrorHz);
  });

  it('the motion-comfort preset damps motion, shake, wind and FOV change and levels the horizon', () => {
    const base = SETTINGS.defaults('high');
    const read = (c: string) => readFpvOptions(new SettingsReader(SETTINGS, { ...base, 'cam.motionComfort': c }), makeFpvOptions());
    const off = read('off');
    const strong = read('strong');
    expect(strong.motion).toBeLessThan(off.motion * 0.3);
    expect(strong.shake).toBeLessThan(off.shake);
    expect(strong.wind).toBeLessThan(off.wind * 0.3);
    expect(strong.speedFov).toBeLessThan(off.speedFov * 0.3);
    expect(strong.horizon).toBe(1);
  });
});
