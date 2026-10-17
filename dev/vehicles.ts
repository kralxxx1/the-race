// Developer tool: renders traffic vehicles through the same instanced fleet the game uses.
// Usage: /dev/vehicles.html?kind=sedan&view=rear34&color=%23c9ccd1&dist=7&h=1.4&lamps=brake,ind&night=0&lineup=0
// Views: rear34 | front34 | side | rear | front | top | eye (rider eye behind the car, set gap=8) | free (yaw/h/dist).
// lineup=1 lays out every model in a row (view=rear/front/side look along it).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { VEHICLES, VEHICLE_KINDS, type VehicleKind } from '../src/data/vehicles';
import { Fleet, newLampState, type LampState } from '../src/render/vehicle/fleet';
import { vehicleGeometry } from '../src/render/vehicle/models';
import { platesMaterial } from '../src/render/vehicle/plates';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const kinds: VehicleKind[] = q.get('lineup') === '1' ? [...VEHICLE_KINDS] : [(q.get('kind') as VehicleKind) ?? 'sedan'];
const view = q.get('view') ?? 'rear34';
const night = q.get('night') === '1';
const lod = num('lod', 0) === 1 ? 1 : 0;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(num('dpr', 1));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = num('exposure', night ? 0.9 : 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = night ? 0.08 : num('env', 0.9);
scene.background = new THREE.Color(night ? '#05070b' : '#9db4cc');
scene.fog = new THREE.Fog(night ? '#05070b' : '#b9cbdc', 60, 500);
const sun = new THREE.DirectionalLight('#fff3df', night ? 0.0 : 2.6);
sun.position.set(-12, 22, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const span = 8 + kinds.length * 5;
sun.shadow.camera.left = -span;
sun.shadow.camera.right = span;
sun.shadow.camera.top = span;
sun.shadow.camera.bottom = -span;
sun.shadow.bias = -0.0004;
scene.add(sun, new THREE.HemisphereLight('#c8d4e8', '#202226', night ? 0.05 : 0.4));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#3b3d41', roughness: 0.85 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// Lane markings every 3.6 m so lateral position reads at a glance.
for (let i = -3; i <= 3; i++) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 400), new THREE.MeshBasicMaterial({ color: '#d7d7d0' }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(i * 3.6 + 1.8, 0.01, 0);
  scene.add(line);
}

const fleet = new Fleet();
scene.add(fleet.group);
const plates = platesMaterial();
scene.add(plates.mesh);

const lampTags = (q.get('lamps') ?? '').split(',');
const lamps: LampState = newLampState();
if (lampTags.includes('brake')) lamps.tail = 9;
else if (night || lampTags.includes('tail')) lamps.tail = 0.55;
if (night || lampTags.includes('head')) lamps.head = 8;
if (lampTags.includes('drl')) lamps.aux = 3;
if (lampTags.includes('ind') || lampTags.includes('hazard')) {
  lamps.indL = 7;
  if (lampTags.includes('hazard')) lamps.indR = 7;
}
if (lampTags.includes('rev')) lamps.reverse = 6;
if (lampTags.includes('beacon')) {
  lamps.beaconA = 12;
  lamps.beaconB = 0;
}

const color = new THREE.Color(q.get('color') ?? '#c9ccd1');
const m = new THREE.Matrix4();
const wm = new THREE.Matrix4();
const e = new THREE.Euler();
const qn = new THREE.Quaternion();
const pos = new THREE.Vector3();
const sc = new THREE.Vector3();
fleet.begin();
const gapX = 5.2;
let maxLen = 0;
kinds.forEach((k, i) => {
  const x = (i - (kinds.length - 1) / 2) * gapX;
  maxLen = Math.max(maxLen, VEHICLES[k].length);
  const set = vehicleGeometry(k);
  m.makeTranslation(x, 0, 0);
  const c = k === 'taxi' ? new THREE.Color('#f2c200') : k === 'police' || k === 'ambulance' ? new THREE.Color('#f4f5f7') : color;
  fleet.bucket(k, lod).push(m, c, num('metal', 0.5), num('dirt', 0.25), i % 8, lamps);
  for (const w of set.wheels) {
    e.set(0.3 * i, 0, 0);
    qn.setFromEuler(e);
    wm.compose(pos.set(x + w.x, w.y, w.z), qn, sc.set(w.w, w.r, w.r));
    fleet.addWheel(lod === 1 ? 'far' : w.type, wm);
  }
  for (const p of set.plates) plates.add(x + p.x, p.y, p.z, p.face, p.w, p.h, p.tilt, (i * 3 + (p.face === 1 ? 1 : 0)) % 8);
});
fleet.end();
plates.commit();

const L = maxLen;
const wide = kinds.length > 1;
const tgt = new THREE.Vector3(0, num('ty', 0.8), 0);

function makeCam(v: string, aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(num('fov', 32), aspect, 0.05, 800);
  const place = (yaw: number, h: number, dist: number) => {
    cam.position.set(tgt.x + Math.sin(yaw) * dist, h, tgt.z + Math.cos(yaw) * dist);
    cam.lookAt(tgt);
  };
  switch (v) {
    case 'side':
      place(Math.PI / 2, num('h', 1.1), num('dist', wide ? 40 : L * 2.1));
      break;
    case 'front':
      place(Math.PI, num('h', 1.3), num('dist', wide ? 40 : L * 2.1));
      break;
    case 'rear':
      place(0, num('h', 1.3), num('dist', wide ? 40 : L * 2.1));
      break;
    case 'top':
      cam.position.set(0.01, num('dist', 12), 0.01);
      cam.lookAt(0, 0, 0);
      break;
    case 'eye': {
      // The rider's eye: 1.3 m up, `gap` metres behind the rear bumper, looking slightly down the road.
      cam.fov = num('efov', 62);
      cam.position.set(num('ex', 0.6), num('eh', 1.3), L / 2 + num('gap', 8));
      cam.lookAt(num('lx', 0), num('ly', 0.9), 0);
      break;
    }
    case 'front34':
      place(Math.PI + num('yaw', 0.7), num('h', 1.3), num('dist', L * 1.9));
      break;
    case 'free':
      place(num('yaw', 0), num('h', 1.3), num('dist', L * 1.9));
      break;
    default:
      place(num('yaw', -0.7), num('h', 1.4), num('dist', L * 1.8));
  }
  cam.updateProjectionMatrix();
  return cam;
}

if (view === 'sheet') {
  // 2x2 contact sheet: rear 3/4, front 3/4, side, rider eye.
  const w = innerWidth / 2;
  const h = innerHeight / 2;
  renderer.setScissorTest(true);
  const tiles: [string, number, number][] = [['rear34', 0, 1], ['front34', 1, 1], ['side', 0, 0], ['eye', 1, 0]];
  for (const [v, cx, cy] of tiles) {
    renderer.setViewport(cx * w, cy * h, w, h);
    renderer.setScissor(cx * w, cy * h, w, h);
    renderer.render(scene, makeCam(v, w / h));
  }
} else {
  renderer.render(scene, makeCam(view, innerWidth / innerHeight));
}
const set0 = vehicleGeometry(kinds[0]);
const info = renderer.info.render;
const stats = { kinds: kinds.join(','), lod, tris0: set0.lod[0].tris, tris1: set0.lod[1].tris, frameTris: info.triangles, frameCalls: info.calls };
document.title = `${kinds[0]} ${view} tris=${stats.tris0}/${stats.tris1} calls=${stats.frameCalls}`;
console.log('[vehicles]', JSON.stringify(stats));
(window as unknown as { __stats: unknown; __ready: boolean }).__stats = stats;
(window as unknown as { __ready: boolean }).__ready = true;
