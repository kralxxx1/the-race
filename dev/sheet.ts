// Developer tool: contact sheet of the catalogue. For every bike two tiles: a front three-quarter view and the
// rider's cockpit view, so broken models (missing parts, NaN geometry, wrong scale, rider off the bike) show up at a glance.
// Usage: /dev/sheet.html?from=0&count=15&cols=6&tw=240&th=180&livery=0&lean=0
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BIKES } from '../src/data/bikes';
import { BikeModel } from '../src/render/bikeModel';
import { Materials } from '../src/render/materials';
import { RiderModel } from '../src/render/riderModel';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const from = num('from', 0);
const count = num('count', 15);
const cols = num('cols', 6);
const tw = num('tw', 240);
const th = num('th', 180);
const lean = num('lean', 0);
const livery = num('livery', 0);
const list = BIKES.slice(from, from + count);
const rows = Math.ceil((list.length * 2) / cols);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(cols * tw, rows * th);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;
scene.background = new THREE.Color('#2a2d33');
const key = new THREE.DirectionalLight('#ffffff', 2.2);
key.position.set(3, 6, 2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = key.shadow.camera.bottom = -2.5;
key.shadow.camera.right = key.shadow.camera.top = 2.5;
key.shadow.bias = -0.0003;
scene.add(key, new THREE.HemisphereLight('#c8d4e8', '#202226', 0.35));
const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.8 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const mats = new Materials();
const cam = new THREE.PerspectiveCamera(30, tw / th, 0.02, 200);
const report: { id: string; ms: number; tris: number; calls: number; err?: string }[] = [];
const label = document.createElement('canvas');
label.width = cols * tw;
label.height = rows * th;
label.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none';
document.body.appendChild(label);
const g2 = label.getContext('2d')!;
g2.font = '11px monospace';

let tile = 0;
const tileRect = () => {
  const c = tile % cols;
  const r = Math.floor(tile / cols);
  tile++;
  return { x: c * tw, y: (rows - 1 - r) * th, top: r * th, left: c * tw };
};
const draw = (rect: { x: number; y: number }) => {
  renderer.setViewport(rect.x, rect.y, tw, th);
  renderer.setScissor(rect.x, rect.y, tw, th);
  renderer.render(scene, cam);
};

for (const spec of list) {
  const t0 = performance.now();
  let bike: BikeModel | null = null;
  try {
    bike = new BikeModel(spec, livery, mats, { detail: 'high', lod: 0 });
    scene.add(bike.root);
    const rider = new RiderModel(mats, bike.livery, spec.style);
    bike.riderMount.add(rider.root);
    bike.update({ lean, pitch: 0, steer: 0, wheelSpeed: 0, frontComp: 0, rearComp: 0, brake: 0, headlight: true, dt: 0.016 });
    bike.updateDash(0.35, 3, 87, false, 'kmh');
    bike.root.updateMatrixWorld(true);
    for (let i = 0; i < 60; i++) rider.ride(bike, { speedKmh: 60, lean, accel: 0, brake: 0, pitch: 0, steer: 0, shift: 0, dt: 0.05 });
    bike.root.updateMatrixWorld(true);
    const L = bike.frame.L;
    const target = new THREE.Vector3(0, 0.62, -L / 2);
    // Tile 1: front three-quarter, rider on.
    rider.setHeadVisible(true);
    cam.fov = 30;
    cam.aspect = tw / th;
    cam.position.set(target.x + Math.sin(-0.85 + Math.PI) * 3.7, 1.15, target.z + Math.cos(-0.85 + Math.PI) * 3.7);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    const a = tileRect();
    draw(a);
    g2.fillStyle = 'rgba(255,220,80,0.95)';
    g2.fillText(spec.id, a.left + 4, a.top + 12);
    // Tile 2: the rider's own eye (as the game camera does).
    rider.setHeadVisible(false);
    rider.root.updateMatrixWorld(true);
    const eye = rider.eye.clone().applyMatrix4(rider.root.matrixWorld);
    const eq = new THREE.Quaternion();
    rider.root.getWorldQuaternion(eq);
    eq.multiply(rider.eyeQuat);
    const e = new THREE.Euler().setFromQuaternion(eq, 'YXZ');
    e.z *= 0.75;
    e.x -= 0.16;
    cam.position.copy(eye);
    cam.quaternion.setFromEuler(e);
    cam.fov = 74;
    cam.updateProjectionMatrix();
    const b = tileRect();
    draw(b);
    report.push({ id: spec.id, ms: Math.round(performance.now() - t0), tris: bike.stats.triangles, calls: bike.stats.drawCalls });
    scene.remove(bike.root);
    rider.dispose();
  } catch (err) {
    report.push({ id: spec.id, ms: 0, tris: 0, calls: 0, err: String(err) });
    tileRect();
    tileRect();
  } finally {
    bike?.dispose();
  }
}
(window as unknown as { __report: unknown }).__report = report;
(window as unknown as { __ready: boolean }).__ready = true;
