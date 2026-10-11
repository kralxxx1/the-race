import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BikeSpec } from '../data/bikes';
import { damp } from '../core/math';
import { bikeDetailFrom } from './bike/bikeSettings';
import { BikeModel } from './bikeModel';
import { Materials } from './materials';
import type { Renderer } from './renderer';

/** Garage / menu backdrop: the selected bike on a turntable in a studio. */
export class Showroom {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  private mats = new Materials();
  private bike: BikeModel | null = null;
  private turntable: THREE.Mesh;
  private holder = new THREE.Group();
  private angle = 0.6;
  private drag = false;
  private lastX = 0;
  private spin = 0.18;
  private envTex: THREE.Texture;
  private time = 0;
  private rev = 0;
  private wheelSpeed = 0;
  private lean = 0;
  /** Horizontal framing offset (bike shifted right when a side panel is open). */
  framing = 0;

  constructor(private renderer: Renderer) {
    const pm = new THREE.PMREMGenerator(renderer.renderer);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    const s = this.scene;
    s.environment = this.envTex;
    s.environmentIntensity = 0.7;
    s.background = new THREE.Color('#0b0d12');
    s.fog = new THREE.Fog('#0b0d12', 9, 26);
    // Floor with a glossy finish
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshPhysicalMaterial({ color: '#0e1014', roughness: 0.42, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    this.turntable = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.75, 0.06, 64),
      new THREE.MeshPhysicalMaterial({ color: '#23262d', roughness: 0.25, metalness: 0.8, clearcoat: 1 }),
    );
    this.turntable.position.y = 0.03;
    this.turntable.receiveShadow = true;
    s.add(this.turntable);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.74, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: '#ff5a1f' }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.061;
    s.add(ring);
    this.holder.position.y = 0.06;
    s.add(this.holder);

    const key = new THREE.SpotLight('#ffffff', 120, 30, 0.42, 0.7, 1.4);
    key.position.set(4, 7, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0002;
    s.add(key, key.target);
    const rim = new THREE.SpotLight('#7fb2ff', 95, 30, 0.5, 0.7, 1.4);
    rim.position.set(-5, 4, -4);
    s.add(rim, rim.target);
    const warm = new THREE.SpotLight('#ffb070', 55, 30, 0.5, 0.7, 1.4);
    warm.position.set(-3, 3, 5);
    s.add(warm, warm.target);
    s.add(new THREE.HemisphereLight('#9fb7d9', '#1a1c22', 0.35));
    // Light strips on the back wall for reflections
    for (let i = 0; i < 5; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 6), new THREE.MeshBasicMaterial({ color: '#c8d6ff' }));
      strip.position.set(-6 + i * 3, 3, -9);
      s.add(strip);
    }
    this.camera.position.set(0, 1.25, 5.6);
    this.camera.lookAt(0, 0.65, 0);
  }

  setBike(spec: BikeSpec, livery: number): void {
    if (this.bike) {
      this.holder.remove(this.bike.root);
      this.bike.dispose();
    }
    // Garage close-ups always use LOD0 at the player's chosen detail.
    this.bike = new BikeModel(spec, livery, this.mats, { detail: bikeDetailFrom(this.renderer.settings), lod: 0 });
    this.bike.root.position.z = this.bike.frame.L / 2;
    this.bike.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.holder.add(this.bike.root);
    this.bike.updateDash(0, 1, 0, false, 'kmh');
  }

  /** Visualise a free rev from the garage "listen" button (0..1). */
  setRev(r: number): void {
    this.rev = r;
  }

  attachPointer(el: HTMLElement): () => void {
    const down = (e: PointerEvent) => {
      this.drag = true;
      this.lastX = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (!this.drag) return;
      this.angle += (e.clientX - this.lastX) * 0.008;
      this.lastX = e.clientX;
    };
    const up = () => {
      this.drag = false;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.drag) this.angle += this.spin * dt;
    this.holder.rotation.y = this.angle;
    this.turntable.rotation.y = this.angle;
    if (this.bike) {
      this.wheelSpeed = damp(this.wheelSpeed, 0, 2, dt);
      this.lean = damp(this.lean, 0, 3, dt);
      this.bike.update({
        lean: this.lean,
        pitch: 0,
        steer: Math.sin(this.time * 0.4) * 0.15,
        wheelSpeed: this.wheelSpeed,
        frontComp: 0,
        rearComp: -this.rev * 0.006,
        brake: 0,
        headlight: false,
        dt,
      });
      // Engine shake while revving
      this.bike.chassis.position.x = Math.sin(this.time * 90) * 0.0012 * this.rev;
    }
    const aspect = this.renderer.aspect;
    this.camera.aspect = aspect;
    const narrow = aspect < 1;
    this.camera.fov = narrow ? 48 : 30;
    const dist = narrow ? 6.6 : 5.6;
    this.camera.position.set(-this.framing * 1.2, 1.25, dist);
    this.camera.lookAt(-this.framing * 1.2, narrow ? 0.85 : 0.62, 0);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.setBloom(0.22, 0.9, 0.4);
    this.renderer.renderer.toneMappingExposure = 1;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.bike?.dispose();
    this.envTex.dispose();
  }
}
