import * as THREE from 'three';

/**
 * Dynamic reflection probe: a cube camera that sits on the bike, captures the
 * surrounding world (sky, road, cars, lamps) into a half-float cube map and
 * pre-filters it with PMREM, so paint, chrome and visors reflect what is really
 * around the rider. The result replaces `scene.environment` while it runs.
 *
 * Cost: six scene renders plus the PMREM convolution per update, which is why
 * the update interval is a setting (every frame is the 'extreme' preset).
 */
export class EnvProbe {
  private cubeRT: THREE.WebGLCubeRenderTarget;
  private cam: THREE.CubeCamera;
  private pmrem: THREE.PMREMGenerator;
  private target: THREE.WebGLRenderTarget | null = null;
  private counter = 0;
  /** Texture to assign to `scene.environment` (valid after the first update). */
  texture: THREE.Texture | null = null;

  constructor(
    private gl: THREE.WebGLRenderer,
    resolution: number,
    private interval: number,
  ) {
    this.cubeRT = new THREE.WebGLCubeRenderTarget(resolution, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.cam = new THREE.CubeCamera(0.3, 2500, this.cubeRT);
    this.pmrem = new THREE.PMREMGenerator(gl);
  }

  /**
   * Advance one frame; captures when the interval elapses (always on the first call).
   * `hide` objects (the bike itself) are made invisible during the capture so the
   * probe does not reflect the thing it is attached to.
   */
  tick(scene: THREE.Scene, position: THREE.Vector3, hide: readonly THREE.Object3D[]): boolean {
    if (this.texture && this.counter++ % Math.max(1, this.interval) !== 0) return false;
    if (!this.texture) this.counter = 1;
    this.cam.position.copy(position);
    const shadow = this.gl.shadowMap;
    const auto = shadow.autoUpdate;
    // Reuse the shadow maps rendered for the main view instead of re-rendering them six times
    // (the very first capture lets them be created: unbound shadow samplers are a GL error).
    if (this.texture) shadow.autoUpdate = false;
    const states = hide.map((o) => o.visible);
    for (const o of hide) o.visible = false;
    const prevEnv = scene.environment;
    this.cam.update(this.gl, scene);
    for (let i = 0; i < hide.length; i++) hide[i].visible = states[i];
    shadow.autoUpdate = auto;
    scene.environment = prevEnv;
    this.target = this.pmrem.fromCubemap(this.cubeRT.texture, this.target);
    this.texture = this.target.texture;
    return true;
  }

  dispose(): void {
    this.cubeRT.dispose();
    this.target?.dispose();
    this.pmrem.dispose();
    this.texture = null;
  }
}
