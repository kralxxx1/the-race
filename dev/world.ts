// World scenery bench: boots the real renderer and world for one map and renders camera shots on demand.
// Usage: /dev/world.html?env=highway:day:clear&preset=medium&s=900&seed=11&traffic=0
//   env      map:time:weather (resolveEnvironment)       preset  low|medium|high|ultra|extreme
//   s        road distance the rider is placed at         seed    road/world seed
//   traffic  0 removes traffic                            set     comma-separated settings overrides (key:value)
// Shots are driven from tools/worldshot.mjs through window.__renderShot(i); a shot is
//   [fs, fd, fh, yawDeg, pitchDeg, fov]: camera at road distance fs, lateral fd, fh metres above the road,
//   yaw/pitch relative to the road direction (+yaw to the right), vertical field of view.
// Sets window.__ready, window.__shots (count) and window.__world (draw calls, triangles, geometries).
import * as THREE from 'three';
import { getBike } from '../src/data/bikes';
import { resolveEnvironment, type MapId, type TimeOfDay, type Weather } from '../src/data/maps';
import { MODE_BY_ID } from '../src/data/modes';
import { GameSession } from '../src/game/session';
import { neutralInput } from '../src/physics/bike';
import { GameView } from '../src/render/gameView';
import { preloadWorld } from '../src/render/preload';
import { Renderer } from '../src/render/renderer';
import { SETTINGS, SettingsReader, type QualityPreset } from '../src/settings';

const q = new URLSearchParams(location.search);
const preset = (q.get('preset') ?? 'medium') as QualityPreset;
const [map, time, weather] = (q.get('env') ?? 'highway:day:clear').split(':') as [MapId, TimeOfDay, Weather];
const values: Record<string, string | number | boolean> = { ...SETTINGS.defaults(preset) };
for (const kv of (q.get('set') ?? '').split(',').filter(Boolean)) {
  const [k, ...rest] = kv.split(':');
  const raw = rest.join(':');
  const cur = values[k];
  values[k] = typeof cur === 'boolean' ? raw === 'true' || raw === '1' : typeof cur === 'number' ? Number(raw) : raw;
}
const settings = new SettingsReader(SETTINGS, SETTINGS.sanitize(values, preset));

const canvas = document.createElement('canvas');
document.body.append(canvas);
const w = Number(q.get('w') ?? innerWidth);
const h = Number(q.get('h') ?? innerHeight);
canvas.width = w;
canvas.height = h;
canvas.style.width = `${w}px`;
canvas.style.height = `${h}px`;

const win = window as unknown as Record<string, unknown>;

async function main(): Promise<void> {
  const renderer = new Renderer(canvas, settings);
  renderer.renderer.info.autoReset = false;
  const env = resolveEnvironment(map, time, weather);
  await preloadWorld(env, renderer.profile);
  const s0 = Number(q.get('s') ?? 900);
  const session = new GameSession({
    bike: getBike(q.get('bike') && q.get('bike') !== 'none' ? q.get('bike')! : 'yamaha-r1'),
    upgrades: { engine: 0, brakes: 0, handling: 0 },
    mode: MODE_BY_ID.get(q.get('mode') ?? 'endless')!,
    env,
    seed: Number(q.get('seed') ?? 11),
    autoShift: true,
  });
  session.bike.reset(s0, session.bike.d, 0);
  session.traffic.reset(s0);
  if (q.get('traffic') === '0') session.traffic.cars.length = 0;
  const t0 = performance.now();
  const view = new GameView(renderer, session, env, 0, settings);
  const constructMs = performance.now() - t0;
  const dt = 1 / 60;
  // Finish the intro shot, then settle.
  view.update(dt, 4);
  for (let i = 0; i < 3; i++) view.update(dt, dt);
  const input = neutralInput();
  session.update(dt, input);

  if (q.get('bike') === 'none') {
    view.bike.root.visible = false;
    view.rider.root.visible = false;
  }
  const probe = new Uint8Array(4);
  const shots = (q.get('shots') ?? '').split(';').filter(Boolean).map((sh) => sh.split(',').map(Number));
  const road = session.road;
  const v = view as unknown as { cam: { camera: THREE.PerspectiveCamera } };

  win.__renderShot = (i: number): Record<string, number> => {
    const sh = shots[i];
    if (sh) {
      const [fs, fd, fh, yawDeg, pitchDeg, fov] = sh;
      view.world.update(fs);
      const p = view.world.worldPos(fs, fd, fh, new THREE.Vector3());
      const cam = v.cam.camera;
      cam.position.copy(p);
      cam.rotation.set((pitchDeg * Math.PI) / 180, road.yaw(fs) - (yawDeg * Math.PI) / 180, 0, 'YXZ');
      if (fov) cam.fov = fov;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
    }
    // Debug: hide classes of objects to bisect rendering problems (hide=instanced,statics).
    const hide = (q.get('hide') ?? '').split(',');
    if (hide[0]) {
      view.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const inst = (m as unknown as THREE.InstancedMesh).isInstancedMesh === true;
        if ((hide.includes('instanced') && inst) || (hide.includes('plain') && !inst && m.parent?.name === 'scenery')) o.visible = false;
      });
    }
    renderer.renderer.info.reset();
    const t = performance.now();
    // A few frames so TAA / temporal passes converge.
    for (let k = 0; k < Number(q.get('frames') ?? 2); k++) view.render();
    const gl = renderer.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);
    const info = renderer.info();
    return { ms: performance.now() - t, calls: info.calls, triangles: info.triangles };
  };
  win.__shots = shots.length;
  win.__world = { layout: session.lanes.layout, counts: view.world.debugCounts(), constructMs, env: env.id, geometries: renderer.renderer.info.memory.geometries, textures: renderer.renderer.info.memory.textures };
  win.__ready = true;
}

main().catch((e) => {
  console.error(e);
  win.__error = String((e as Error)?.stack ?? e);
  win.__ready = true;
});
