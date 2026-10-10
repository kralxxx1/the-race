// Developer tool: renders a single bike (+ rider) for visual inspection and screenshots.
// Usage: /dev/preview.html?bike=yamaha-r1&livery=0&view=front34&lod=0&detail=high&lean=0&steer=0&rider=0&env=studio
// Views: front34 | side | left | rear34 | front | rear | top | cockpit | detail-engine | detail-wheel | detail-cockpit | detail-rear
// Free camera: yaw (rad), h (m), dist (m), fov, tx/ty/tz (target offset).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BIKES, getBike } from '../src/data/bikes';
import { ENV_BY_ID } from '../src/data/environments';
import type { BikeDetail } from '../src/render/bike/quality';
import { BikeModel } from '../src/render/bikeModel';
import { Materials } from '../src/render/materials';
import { RiderModel } from '../src/render/riderModel';
import { SkySystem } from '../src/render/sky';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const spec = getBike(q.get('bike') ?? BIKES[0].id);
const view = q.get('view') ?? 'front34';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(num('dpr', 1));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = num('exposure', 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const envName = q.get('env') ?? 'studio';
if (envName === 'studio') {
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  scene.background = new THREE.Color('#2a2d33');
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(3, 6, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -2.5;
  key.shadow.camera.right = key.shadow.camera.top = 2.5;
  key.shadow.bias = -0.0003;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#9fb7ff', 0.6);
  fill.position.set(-4, 2, -3);
  scene.add(fill, new THREE.HemisphereLight('#c8d4e8', '#202226', 0.35));
} else {
  const env = ENV_BY_ID.get(envName as 'day') ?? ENV_BY_ID.get('day')!;
  const sky = new SkySystem(env);
  scene.add(sky.mesh, sky.sun, sky.sun.target, sky.hemi);
  scene.environment = sky.buildEnvMap(renderer);
  sky.follow(new THREE.Vector3());
}
const mats = new Materials();
const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.8 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const t0 = performance.now();
const bike = new BikeModel(spec, num('livery', 0), mats, { detail: (q.get('detail') as BikeDetail) ?? 'high', lod: num('lod', 0) === 1 ? 1 : 0 });
const buildMs = performance.now() - t0;
scene.add(bike.root);
const rider = new RiderModel(mats, bike.livery, spec.style);
const showRider = q.get('rider') === '1' || (view === 'cockpit' && q.get('rider') !== '0');
if (showRider) bike.riderMount.add(rider.root);
const lean = num('lean', 0);
const steer = num('steer', 0);
bike.update({ lean, pitch: 0, steer, wheelSpeed: 0, frontComp: 0, rearComp: 0, brake: num('brake', 0), headlight: q.get('lights') !== '0', dt: 0.016 });
bike.updateDash(num('rpm', 0.35), num('gear', 3), num('speed', 87), false, 'kmh');
bike.root.updateMatrixWorld(true);
for (let i = 0; i < 60; i++) rider.ride(bike, { speedKmh: num('kmh', 60), lean, accel: 0, brake: 0, pitch: 0, steer: 0, shift: 0, dt: 0.05 });
bike.root.updateMatrixWorld(true);

const cam = new THREE.PerspectiveCamera(num('fov', 30), innerWidth / innerHeight, 0.02, 500);
const L = bike.frame.L;
const target = new THREE.Vector3(num('tx', 0), num('ty', 0.62), -L / 2 + num('tz', 0));
const place = (yaw: number, h: number, dist: number, fov: number, tgt = target) => {
  cam.fov = num('fov', fov);
  cam.position.set(tgt.x + Math.sin(yaw) * dist, h, tgt.z + Math.cos(yaw) * dist);
  cam.lookAt(tgt);
};
switch (view) {
  case 'side':
    place(Math.PI / 2, 0.72, 6.4, 22);
    break;
  case 'left':
    place(-Math.PI / 2, 0.72, 6.4, 22);
    break;
  case 'front':
    place(Math.PI, 0.85, 6.2, 22);
    break;
  case 'rear':
    place(0, 0.85, 6.2, 22);
    break;
  case 'rear34':
    place(0.75, 1.15, 4.6, 30);
    break;
  case 'top':
    cam.fov = num('fov', 28);
    cam.position.set(0.001, 5.4, target.z);
    cam.up.set(0, 0, -1);
    cam.lookAt(target.x, 0, target.z);
    break;
  case 'detail-engine':
    place(Math.PI / 2 + 0.25, 0.55, 1.9, 30, new THREE.Vector3(0.1, 0.45, (bike.frame.head.z + bike.frame.pivot.z) / 2));
    break;
  case 'detail-wheel':
    place(Math.PI / 2 + 0.55, 0.42, 1.25, 32, new THREE.Vector3(0.06, bike.frame.Rf, -L));
    break;
  case 'detail-rear':
    place(Math.PI / 2 - 0.5, 0.5, 1.5, 32, new THREE.Vector3(0.1, bike.frame.Rr + 0.05, -0.15));
    break;
  case 'detail-cockpit':
    place(Math.PI + 0.6, bike.frame.head.y + 0.45, 1.2, 34, new THREE.Vector3(0, bike.frame.head.y + 0.02, bike.frame.head.z + 0.05));
    break;
  case 'cockpit': {
    // Same construction as the in-game helmet camera.
    rider.setHeadVisible(false);
    rider.root.updateMatrixWorld(true);
    const eye = rider.eye.clone().applyMatrix4(rider.root.matrixWorld);
    const eq = new THREE.Quaternion();
    rider.root.getWorldQuaternion(eq);
    eq.multiply(rider.eyeQuat);
    const e = new THREE.Euler().setFromQuaternion(eq, 'YXZ');
    e.z *= 0.75;
    e.x -= 0.16 + num('look', 0);
    cam.position.copy(eye);
    cam.quaternion.setFromEuler(e);
    cam.fov = num('fov', 74);
    break;
  }
  default:
    place(num('yaw', -0.85) + (view === 'front34' ? Math.PI : 0), num('h', 1.15), num('dist', 4.6), 30);
}
if (q.has('yaw') && view === 'free') place(num('yaw', 0), num('h', 1.1), num('dist', 4.4), 30);
cam.updateProjectionMatrix();
renderer.render(scene, cam);
const info = renderer.info.render;
const stats = { bike: spec.id, view, tris: bike.stats.triangles, drawCalls: bike.stats.drawCalls, buildMs: Math.round(buildMs), kitMs: Math.round(bike.stats.buildMs), frameTris: info.triangles, frameCalls: info.calls };
document.title = `${spec.id} ${view} tris=${stats.tris} calls=${stats.drawCalls} build=${stats.buildMs}ms`;
console.log('[preview]', JSON.stringify(stats));
(window as unknown as { __stats: unknown }).__stats = stats;
(window as unknown as { __ready: boolean }).__ready = true;
