import * as THREE from 'three';
import { clamp } from '../../core/math';

/**
 * Lighting response to tunnels. The scenery reports how enclosed the rider is (0 open .. 1 deep inside
 * a tunnel); this dims the sun, sky light and image-based reflections, tints the fog, and models
 * eye adaptation with the exposure: entering a tunnel is dark for a moment then the exposure opens up,
 * leaving is a bright flash that settles. Nothing is touched while the rider is outdoors.
 */

export interface EnclosureTargets {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  renderer: THREE.WebGLRenderer;
  /** Exposure of the environment (the renderer's own exposure is restored when outdoors). */
  exposure: number;
}

const DARK_FOG = new THREE.Color('#0d0e11');

export class EnclosureFx {
  /** Smoothed enclosure 0..1 (what the lights follow). */
  amount = 0;
  /** Eye adaptation 0 (outdoor) .. 1 (tunnel). */
  private adapt = 0;
  private sunBase: number;
  private hemiBase: number;
  private envBase: number;
  private fogBase = new THREE.Color();
  private fogNear: number;
  private fogFar: number;
  private touched = false;

  constructor(private t: EnclosureTargets) {
    this.sunBase = t.sun.intensity;
    this.hemiBase = t.hemi.intensity;
    this.envBase = t.scene.environmentIntensity;
    const fog = t.scene.fog as THREE.Fog | null;
    if (fog) this.fogBase.copy(fog.color);
    this.fogNear = fog?.near ?? 0;
    this.fogFar = fog?.far ?? 1000;
  }

  /** Per-frame update. `target` is the scenery's enclosure at the rider (0..1). */
  update(dt: number, target: number): void {
    // Lights react at once (the roof really blocks the sun); the eye adapts slowly.
    this.amount += (target - this.amount) * Math.min(1, dt * 14);
    if (Math.abs(target - this.amount) < 1e-3) this.amount = target;
    this.adapt += (this.amount - this.adapt) * Math.min(1, dt * (this.amount > this.adapt ? 0.75 : 1.1));
    const k = this.amount;
    if (k < 0.002 && this.adapt < 0.002) {
      if (this.touched) this.restore();
      return;
    }
    this.touched = true;
    const t = this.t;
    const dark = clamp(k, 0, 1);
    t.sun.intensity = this.sunBase * (1 - 0.97 * dark);
    t.hemi.intensity = this.hemiBase * (1 - 0.86 * dark);
    t.scene.environmentIntensity = this.envBase * (1 - 0.9 * dark);
    const fog = t.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(this.fogBase).lerp(DARK_FOG, dark);
      fog.near = this.fogNear + (4 - this.fogNear) * dark;
      fog.far = this.fogFar + (260 - this.fogFar) * dark;
    }
    // Eye adaptation: open the exposure while adapted to the dark, close it again after the exit glare.
    t.renderer.toneMappingExposure = t.exposure * Math.pow(2, 1.5 * this.adapt);
  }

  private restore(): void {
    const t = this.t;
    t.sun.intensity = this.sunBase;
    t.hemi.intensity = this.hemiBase;
    t.scene.environmentIntensity = this.envBase;
    const fog = t.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(this.fogBase);
      fog.near = this.fogNear;
      fog.far = this.fogFar;
    }
    t.renderer.toneMappingExposure = t.exposure;
    this.touched = false;
  }

  dispose(): void {
    if (this.touched) this.restore();
  }
}
