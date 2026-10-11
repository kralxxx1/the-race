// Graphics test bench: boots the real renderer, world, bike and traffic and renders a frame sequence.
// Usage: /dev/gfx.html?preset=extreme&env=highway:day:clear&cam=helmet&speed=60&frames=6&set=gfx.aa:taa,fx.bloom:false
//   preset  low|medium|high|ultra|extreme       env   map:time:weather (resolveEnvironment)
//   cam     helmet|chase|far|low                bike  bike id           speed   target km/h before the shot
//   frames  frames rendered before __ready (TAA/probe warm-up)           still=1  freeze the simulation while rendering
//   set     comma-separated key:value overrides of any setting           dof=<0..1>  garage-style depth of field
// Sets window.__ready and window.__gfx (timings, passes, plan, draw calls).
import { getBike } from '../src/data/bikes';
import { resolveEnvironment, type MapId, type TimeOfDay, type Weather } from '../src/data/maps';
import { MODE_BY_ID } from '../src/data/modes';
import { GameSession } from '../src/game/session';
import { neutralInput } from '../src/physics/bike';
import type { CameraMode } from '../src/render/camera';
import { GameView } from '../src/render/gameView';
import { preloadWorld } from '../src/render/preload';
import { Renderer } from '../src/render/renderer';
import { SETTINGS, SettingsReader, type QualityPreset } from '../src/settings';

const q = new URLSearchParams(location.search);
const preset = (q.get('preset') ?? 'high') as QualityPreset;
const [map, time, weather] = (q.get('env') ?? 'highway:day:clear').split(':') as [MapId, TimeOfDay, Weather];
const frames = Number(q.get('frames') ?? 4);
const speedKmh = Number(q.get('speed') ?? 60);
const camMode = (q.get('cam') ?? 'helmet') as CameraMode;
const still = q.get('still') === '1';

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

async function main(): Promise<void> {
  const renderer = new Renderer(canvas, settings);
  renderer.renderer.info.autoReset = false;
  const env = resolveEnvironment(map, time, weather);
  await preloadWorld(env, renderer.profile);
  const session = new GameSession({
    bike: getBike(q.get('bike') ?? 'yamaha-r1'),
    upgrades: { engine: 0, brakes: 0, handling: 0 },
    mode: MODE_BY_ID.get('endless')!,
    env,
    seed: Number(q.get('seed') ?? 11),
    autoShift: true,
  });
  const view = new GameView(renderer, session, env, 0, settings);
  view.setCameraMode(camMode);
  // Ride up to the requested speed so traffic, camera and suspension are in a believable state.
  const dt = 1 / 60;
  const input = { ...neutralInput(), throttle: 1 };
  for (let i = 0; i < 60 * 40 && session.bike.speedKmh < speedKmh; i++) {
    session.update(dt, input);
    session.drainEvents();
  }
  const cruise = { ...neutralInput(), throttle: 0.35 };
  view.update(dt, 4); // let the intro camera shot finish
  const dofAmount = Number(q.get('dof') ?? 0);
  const times: number[] = [];
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    if (!still) {
      session.update(dt, session.bike.speedKmh < speedKmh ? input : cruise);
      session.drainEvents();
    }
    view.update(dt, dt);
    renderer.renderer.info.reset();
    const t = performance.now();
    view.render();
    if (dofAmount > 0) renderer.setDepthOfField(Number(q.get('focus') ?? 6), dofAmount);
    // Wait for the GPU so the timing includes the work, not just command submission.
    renderer.renderer.getContext().finish();
    times.push(performance.now() - t);
  }
  const info = renderer.info();
  (window as unknown as { __gfx: unknown }).__gfx = {
    preset,
    env: env.id,
    plan: renderer.pipeline.plan ?? null,
    passes: [...renderer.pipeline.lastPasses],
    drawCalls: info.calls,
    triangles: info.triangles,
    frameMs: times,
    totalMs: performance.now() - t0,
    gpu: renderer.gpuName,
    scale: renderer.resolutionScale,
    photographic: true,
    speedKmh: session.bike.speedKmh,
  };
  (window as unknown as { __ready: boolean }).__ready = true;
}

main().catch((e) => {
  console.error(e);
  (window as unknown as { __error: string }).__error = String(e?.stack ?? e);
  (window as unknown as { __ready: boolean }).__ready = true;
});
