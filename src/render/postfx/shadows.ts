import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import type { QualityProfile } from '../quality';
import type { SkySystem } from '../sky';

/**
 * Sun shadows. One cascade uses the plain directional light (cheap, phones);
 * two or more use three's CSM add-on: the view frustum is split into slices that
 * each get their own shadow map, so shadows are sharp next to the rider and still
 * reach several hundred metres. CSM patches the lit materials, so every material
 * that receives light must be registered before its first draw — `update()` sweeps
 * the scene once per frame for new ones (traffic spawning, crash debris).
 */

/** Chain `onBeforeCompile` hooks and keep the program cache key unique per chain. */
export function chainOnBeforeCompile(material: THREE.Material, extra: THREE.Material['onBeforeCompile'], tag: string): void {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (this: THREE.Material, shader, renderer) {
    prev.call(this, shader, renderer);
    extra.call(this, shader, renderer);
  };
  material.customProgramCacheKey = () => `${prevKey()}|${tag}`;
}

function isLitMaterial(m: THREE.Material): boolean {
  const mat = m as THREE.Material & { isMeshStandardMaterial?: boolean; isMeshPhysicalMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean };
  return !!(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial);
}

export class ShadowSystem {
  csm: CSM | null = null;
  readonly cascades: number;
  private seen = new WeakSet<THREE.Material>();
  private lastFov = 0;
  private lastAspect = 0;
  private lightDir = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private sky: SkySystem,
    private profile: QualityProfile,
  ) {
    const sun = sky.sun;
    const size = profile.shadowMapSize;
    this.cascades = profile.shadows ? profile.shadowCascades : 0;
    sun.castShadow = profile.shadows && this.cascades <= 1;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.radius = profile.shadowSoftness;
    sun.shadow.blurSamples = profile.shadowFilter === 'vsm' ? Math.round(6 + profile.shadowSoftness * 3) : 8;
    if (this.cascades <= 1) {
      // Single box around the rider: size follows the shadow distance setting.
      const span = THREE.MathUtils.clamp(profile.shadowDistance, 40, 220);
      sky.shadowSpan = span;
      const cam = sun.shadow.camera;
      cam.left = cam.bottom = -span / 2;
      cam.right = cam.top = span / 2;
      cam.near = 1;
      cam.far = 300 + span;
      cam.updateProjectionMatrix();
      const texel = span / size;
      sun.shadow.bias = -0.0002;
      sun.shadow.normalBias = Math.max(0.02, texel * 1.6);
    } else {
      sun.castShadow = false;
      this.csm = new CSM({
        camera,
        parent: scene,
        cascades: this.cascades,
        maxFar: profile.shadowDistance,
        mode: 'practical',
        shadowMapSize: size,
        shadowBias: -0.00005,
        lightDirection: sky.sunDir.clone().negate(),
        lightIntensity: sun.intensity,
        lightNear: 1,
        lightFar: 1500,
        lightMargin: 120,
      });
      this.csm.fade = true;
      for (const l of this.csm.lights) {
        l.color.copy(sun.color);
        l.shadow.radius = profile.shadowSoftness;
        l.shadow.blurSamples = sun.shadow.blurSamples;
      }
      // The CSM lights replace the sun for lighting; keep the original light out of the scene's light list.
      sun.visible = false;
      this.updateFrustums();
    }
    this.registerScene();
  }

  private updateFrustums(): void {
    if (!this.csm) return;
    this.csm.updateFrustums();
    // Each cascade has its own texel size: scale the normal offset with it so acne stays gone
    // without peter-panning the near cascade.
    for (const l of this.csm.lights) {
      const c = l.shadow.camera;
      const texel = (c.right - c.left) / this.profile.shadowMapSize;
      l.shadow.normalBias = Math.max(0.012, texel * 1.7);
    }
    this.lastFov = this.camera.fov;
    this.lastAspect = this.camera.aspect;
  }

  /** Register every lit material in the scene for CSM (idempotent). */
  registerScene(): void {
    if (!this.csm) return;
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh && !(o as THREE.Points).isPoints) return;
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      if (Array.isArray(mat)) for (const m of mat) this.register(m);
      else this.register(mat);
    });
  }

  private register(m: THREE.Material): void {
    if (this.seen.has(m)) return;
    this.seen.add(m);
    if (!this.csm || !isLitMaterial(m)) return;
    const prevHook = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey.bind(m);
    this.csm.setupMaterial(m);
    const csmHook = m.onBeforeCompile;
    m.onBeforeCompile = function (this: THREE.Material, shader, renderer) {
      prevHook.call(this, shader, renderer);
      csmHook.call(this, shader, renderer);
    };
    m.customProgramCacheKey = () => `${prevKey()}|csm`;
    m.needsUpdate = true;
  }

  /** Call right before the scene renders. */
  update(): void {
    const csm = this.csm;
    if (!csm) return;
    this.registerScene();
    this.camera.updateMatrixWorld();
    if (this.camera.fov !== this.lastFov || this.camera.aspect !== this.lastAspect) this.updateFrustums();
    this.lightDir.copy(this.sky.sunDir).negate();
    csm.lightDirection.copy(this.lightDir);
    csm.update();
    for (const l of csm.lights) l.intensity = this.sky.sun.intensity;
  }

  /** Headlight spot shadows (night): turn on casting for the rider's lamp(s). */
  enableHeadlightShadows(root: THREE.Object3D, on: boolean): void {
    root.traverse((o) => {
      const s = o as THREE.SpotLight;
      if (!s.isSpotLight) return;
      s.castShadow = on;
      if (on) {
        s.shadow.mapSize.set(1024, 1024);
        s.shadow.camera.near = 0.5;
        s.shadow.camera.far = 90;
        s.shadow.bias = -0.0004;
        s.shadow.normalBias = 0.03;
        s.shadow.radius = this.profile.shadowSoftness;
      }
    });
  }

  dispose(): void {
    if (this.csm) {
      this.csm.remove();
      for (const l of this.csm.lights) l.shadow.dispose();
      this.csm.dispose();
      this.csm = null;
    }
  }
}
