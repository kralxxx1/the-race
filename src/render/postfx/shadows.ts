import * as THREE from 'three';
import type { QualityProfile } from '../quality';
import type { SkySystem } from '../sky';

/**
 * Sun shadows. One cascade uses the plain directional light (cheap, phones); two
 * to four use cascaded shadow maps (CSM): the view frustum is cut into depth
 * slices that each get their own shadow map, so shadows are crisp next to the
 * rider and still reach several hundred metres.
 *
 * three's CSM add-on no longer matches the core light shader (r186 changed the
 * lighting chunks), so cascades are implemented here: N directional lights with
 * identical direction, one per slice. A small patch of the core shader chunks
 * weights each light by whether the pixel's view depth lies inside its slice
 * (with a short cross-fade), so exactly one map shades each pixel and the
 * weights always sum to one. Lit materials opt in with `USE_CASCADES`.
 */

const PARS = /* glsl */ `
#ifdef USE_CASCADES
	uniform vec3 uCascade[ CASCADE_COUNT ]; // view-depth begin, end, half fade width
	float cascadeWeight( const in int i, const in float z ) {
		vec3 c = uCascade[ i ];
		float w = 1.0;
		if ( i > 0 ) w *= smoothstep( c.x - c.z, c.x + c.z, z );
		if ( i < CASCADE_COUNT - 1 ) w *= 1.0 - smoothstep( c.y - c.z, c.y + c.z, z );
		return w;
	}
#endif
`;

const DIR_SHADOW_LINE =
  'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';

const DIR_SHADOW_PATCHED = /* glsl */ `
		#ifdef USE_CASCADES
		{
			float cascadeW = cascadeWeight( UNROLLED_LOOP_INDEX, vViewPosition.z );
			directLight.color *= cascadeW > 0.0 ? cascadeW * ( ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0 ) : 0.0;
		}
		#else
		${DIR_SHADOW_LINE}
		#endif`;

let chunksPatched = false;

/** Patch three's shader chunks once (safe to call repeatedly, a no-op for materials without USE_CASCADES). */
export function patchCascadeChunks(): boolean {
  if (chunksPatched) return true;
  const lfb = THREE.ShaderChunk.lights_fragment_begin;
  if (!lfb.includes(DIR_SHADOW_LINE)) {
    console.warn('cascaded shadows: three shader chunk layout changed, falling back to a single cascade');
    return false;
  }
  THREE.ShaderChunk.lights_fragment_begin = lfb.replace(DIR_SHADOW_LINE, DIR_SHADOW_PATCHED);
  THREE.ShaderChunk.shadowmap_pars_fragment += PARS;
  chunksPatched = true;
  return true;
}

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

const _corners: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());
const _centre = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/** Practical split scheme (blend of uniform and logarithmic) between near and far. */
export function cascadeSplits(count: number, near: number, far: number, lambda = 0.78): number[] {
  const out: number[] = [near];
  for (let i = 1; i <= count; i++) {
    const f = i / count;
    const log = near * Math.pow(far / near, f);
    const uni = near + (far - near) * f;
    out.push(lambda * log + (1 - lambda) * uni);
  }
  out[count] = far;
  return out;
}

export class ShadowSystem {
  readonly cascades: number;
  readonly lights: THREE.DirectionalLight[] = [];
  private uniform: THREE.IUniform<THREE.Vector3[]>;
  private seen = new WeakSet<THREE.Material>();
  private splits: number[] = [];
  private active = false;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private sky: SkySystem,
    private profile: QualityProfile,
  ) {
    const sun = sky.sun;
    const size = profile.shadowMapSize;
    let cascades = profile.shadows ? Math.max(1, Math.min(4, profile.shadowCascades)) : 0;
    if (cascades > 1 && !patchCascadeChunks()) cascades = 1;
    this.cascades = cascades;
    sun.castShadow = profile.shadows && cascades <= 1;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.radius = profile.shadowSoftness;
    sun.shadow.blurSamples = profile.shadowFilter === 'vsm' ? Math.round(6 + profile.shadowSoftness * 3) : 8;
    this.uniform = { value: Array.from({ length: Math.max(cascades, 1) }, () => new THREE.Vector3()) };
    if (cascades <= 1) {
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
      const t = sky.sunDir.y / Math.sqrt(Math.max(1e-4, 1 - sky.sunDir.y * sky.sunDir.y));
      sun.shadow.normalBias = Math.max(0.02, texel * (1.4 + 1.1 / Math.max(0.2, t)));
    } else {
      // The sun light keeps its colour/intensity but stops lighting by itself: the cascade lights take over.
      sun.visible = false;
      this.active = true;
      for (let i = 0; i < cascades; i++) {
        const l = new THREE.DirectionalLight(sun.color, sun.intensity);
        l.castShadow = true;
        l.shadow.mapSize.set(size, size);
        l.shadow.radius = profile.shadowSoftness;
        l.shadow.blurSamples = sun.shadow.blurSamples;
        l.shadow.bias = -0.00008;
        l.shadow.camera.near = 0.5;
        scene.add(l, l.target);
        this.lights.push(l);
      }
      this.splits = cascadeSplits(cascades, Math.max(camera.near, 0.3), Math.min(profile.shadowDistance, camera.far));
    }
    this.registerScene();
  }

  /** Register every lit material in the scene for cascades (idempotent; new materials are caught each frame). */
  registerScene(): void {
    if (!this.active) return;
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      if (Array.isArray(mat)) for (const m of mat) this.register(m);
      else this.register(mat);
    });
  }

  private register(m: THREE.Material): void {
    if (this.seen.has(m)) return;
    this.seen.add(m);
    if (!isLitMaterial(m)) return;
    m.defines = m.defines || {};
    m.defines.USE_CASCADES = 1;
    m.defines.CASCADE_COUNT = this.cascades;
    const uniform = this.uniform;
    chainOnBeforeCompile(
      m,
      (shader) => {
        shader.uniforms.uCascade = uniform;
      },
      `csm${this.cascades}`,
    );
    m.needsUpdate = true;
  }

  /** Fit every cascade to its slice of the view frustum; call right before the scene renders. */
  update(): void {
    if (!this.active) return;
    this.registerScene();
    const cam = this.camera;
    cam.updateMatrixWorld();
    const sun = this.sky.sun;
    const dir = this.sky.sunDir; // towards the sun
    const size = this.profile.shadowMapSize;
    const tanY = Math.tan((cam.fov * Math.PI) / 360);
    const tanX = tanY * cam.aspect;
    _right.setFromMatrixColumn(cam.matrixWorld, 0);
    _up.setFromMatrixColumn(cam.matrixWorld, 1);
    _fwd.setFromMatrixColumn(cam.matrixWorld, 2).negate();
    // Orthonormal light basis (stable: depends only on the sun direction).
    const lx = _lightX.crossVectors(dir.y > 0.99 ? _axisZ : _axisY, dir).normalize();
    const ly = _lightY.crossVectors(dir, lx).normalize();
    // Grazing sun needs a bigger offset along the normal to keep flat ground free of acne stripes.
    const slopeBias = 1.4 + 1.1 / Math.max(0.2, dir.y / Math.sqrt(Math.max(1e-4, 1 - dir.y * dir.y)));
    // Depth margin towards the sun so tall buildings and trees outside the slice still cast into it.
    const margin = 260;
    for (let i = 0; i < this.cascades; i++) {
      const near = this.splits[i];
      const far = this.splits[i + 1];
      // Slice corners in world space.
      let k = 0;
      for (const d of [near, far]) {
        const hy = d * tanY;
        const hx = d * tanX;
        for (const sy of [-1, 1])
          for (const sx of [-1, 1]) {
            _corners[k++].copy(cam.position).addScaledVector(_fwd, d).addScaledVector(_right, sx * hx).addScaledVector(_up, sy * hy);
          }
      }
      _centre.set(0, 0, 0);
      for (const c of _corners) _centre.add(c);
      _centre.multiplyScalar(1 / 8);
      // Bounding sphere radius: rotation-invariant so the map does not swim while turning.
      let r = 0;
      for (const c of _corners) r = Math.max(r, c.distanceTo(_centre));
      r = Math.ceil(r * 4) / 4;
      // Snap the centre to the shadow texel grid in light space (kills shimmering when moving).
      const texel = (2 * r) / size;
      const cx = Math.round(_centre.dot(lx) / texel) * texel;
      const cy = Math.round(_centre.dot(ly) / texel) * texel;
      const cz = _centre.dot(dir);
      _centre.copy(lx).multiplyScalar(cx).addScaledVector(ly, cy).addScaledVector(dir, cz);
      const l = this.lights[i];
      l.color.copy(sun.color);
      l.intensity = sun.intensity;
      l.target.position.copy(_centre);
      l.position.copy(_centre).addScaledVector(dir, r + margin);
      l.target.updateMatrixWorld();
      l.updateMatrixWorld();
      const sc = l.shadow.camera;
      sc.left = sc.bottom = -r;
      sc.right = sc.top = r;
      sc.near = 0.5;
      sc.far = 2 * r + margin + 10;
      sc.updateProjectionMatrix();
      // Normal offset scales with the slice's texel size: no acne without peter-panning the near cascade.
      l.shadow.normalBias = Math.max(0.012, texel * slopeBias);
      const fade = Math.min(far - near, near * 0.5 + 2) * 0.12;
      this.uniform.value[i].set(near, far, Math.max(0.5, fade));
    }
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
    for (const l of this.lights) {
      this.scene.remove(l, l.target);
      l.dispose();
    }
    this.lights.length = 0;
    this.active = false;
  }
}

const _lightX = new THREE.Vector3();
const _lightY = new THREE.Vector3();
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);
