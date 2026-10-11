import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { EnvDef } from '../data/environments';
import { DEG } from '../core/math';
import { assets as defaultAssets, HDRIS, type AssetLibrary, type HdriKey } from './assets';
import type { SkyMode } from './quality';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}`;

/** Shared tail: sun halo/disc, lightning flash and the final colour management. */
const sunBlock = /* glsl */ `
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  // Mie-like forward scattering halo and a crisp disc.
  col += sunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 64.0) * 0.35) * (0.4 + sunDisc * 0.6) * haloScale;
  col += sunColor * smoothstep(0.99955, 0.9998, sd) * 22.0 * sunDisc;
`;

/** Procedural gradient sky (the "basic" mode, also used for night with stars and moon). */
const frag = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunDisc;
uniform float stars;
uniform float clouds;
uniform float time;
uniform float flash;
varying vec3 vDir;
const float haloScale = 1.0;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h >= 0.0) {
    col = mix(horizon, zenith, pow(h, 0.42));
  } else {
    col = mix(horizon, ground, clamp(pow(-h, 0.35) * 1.4, 0.0, 1.0));
  }
  ${sunBlock}
  // Horizon haze band.
  col = mix(col, horizon * 1.05, exp(-abs(h) * 18.0) * 0.35);
  if (clouds > 0.0 && h > -0.02) {
    vec2 uv = d.xz / (h + 0.12);
    float c = fbm(vec3(uv * 1.35, time * 0.01));
    float cov = smoothstep(1.0 - clouds * 0.75, 1.05, c + clouds * 0.25);
    vec3 cloudCol = mix(horizon * 1.15, sunColor * 1.1 + zenith * 0.2, pow(sd, 3.0) * 0.6 + 0.25);
    cloudCol = mix(cloudCol, vec3(dot(cloudCol, vec3(0.333))), clouds * 0.5);
    col = mix(col, cloudCol, cov * smoothstep(-0.02, 0.15, h) * 0.85);
  }
  if (stars > 0.0 && h > 0.0) {
    vec3 q = floor(d * 380.0);
    float r = hash(q);
    float tw = 0.6 + 0.4 * sin(time * 3.0 + r * 50.0);
    col += vec3(smoothstep(0.9965, 1.0, r) * 2.2 * tw) * smoothstep(0.0, 0.25, h) * stars;
    // Moon
    col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99935, 0.99965, sd) * 3.0 * stars;
  }
  col += vec3(0.75, 0.8, 1.0) * flash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Photographic sky: the upper hemisphere of a Poly Haven HDRI stored as an 8-bit
 * strip (see tools/build-assets.py) with a linear scale that restores its radiance.
 * The sun disc was clamped in the strip and is drawn procedurally.
 */
const fragHdri = /* glsl */ `
uniform sampler2D skyTex;
uniform float skyScale;
uniform float skyRot;
uniform float skyGain;
uniform float skySat;
uniform vec3 horizonFog;
uniform float fogAmount;
uniform vec3 ground;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunDisc;
uniform float flash;
varying vec3 vDir;
const float haloScale = 0.0;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float u = atan(d.z, d.x) / 6.2831853 + 0.5 + skyRot / 6.2831853;
  // Pick the wrap of u without a derivative jump so the texture seam does not show as a mip line.
  float u0 = fract(u);
  float u1 = fract(u + 0.5) - 0.5;
  float uu = fwidth(u0) <= fwidth(u1) ? u0 : u1;
  float e = asin(clamp(h, -1.0, 1.0));
  float v = clamp(1.0 - (0.5 - e / 3.14159265) / 0.5625, 0.0, 1.0);
  vec3 col = texture2D(skyTex, vec2(uu, v)).rgb * skyScale * skyGain;
  // Photographic skies are pale near the horizon once tone mapped; lift the colour a little.
  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, skySat);
  // Below the strip (and the horizon) fade into the fog/ground colour.
  col = mix(col, ground, smoothstep(-0.02, -0.18, h) * 0.9);
  ${sunBlock}
  // Distance haze: tie the horizon to the scene fog colour (thick in fog/rain, thin in clear air).
  col = mix(col, horizonFog, exp(-abs(h) * 9.0) * fogAmount);
  col += vec3(0.75, 0.8, 1.0) * flash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export type HdriChoice = { sky: HdriKey; light: HdriKey };

/** Time of day / weather of an environment (resolved ids are `map:time:weather`). */
export function parseEnv(env: EnvDef): { time: 'dawn' | 'day' | 'sunset' | 'night'; weather: 'clear' | 'cloudy' | 'rain' | 'fog' | 'snow'; map: string } {
  const parts = env.id.split(':');
  if (parts.length === 3) return { map: parts[0], time: parts[1] as 'day', weather: parts[2] as 'clear' };
  // Template environments.
  if (env.id === 'sunset') return { map: '', time: 'sunset', weather: 'clear' };
  if (env.id === 'night') return { map: '', time: 'night', weather: 'clear' };
  if (env.id === 'rain') return { map: '', time: 'day', weather: 'rain' };
  return { map: '', time: 'day', weather: 'clear' };
}

/** Which photographic HDRI draws the sky and which one lights the scene. */
export function hdriFor(env: EnvDef): HdriChoice {
  const { time, weather } = parseEnv(env);
  if (time === 'night') return { sky: 'night', light: env.terrain === 'city' ? 'city_night' : 'night' };
  let key: HdriKey = time === 'sunset' ? 'sunset' : time === 'dawn' ? 'dawn' : 'day';
  if (weather === 'rain' || weather === 'snow') key = 'overcast';
  else if (weather === 'fog') key = 'fog';
  else if (weather === 'cloudy' && time === 'day') key = 'cloudy';
  else if (weather === 'cloudy') key = time === 'sunset' ? 'sunset' : 'overcast';
  return { sky: key, light: key };
}

/**
 * Image-based-lighting gain per HDRI so that the PMREM matches the exposure the
 * environment definitions were tuned for (night maps are metered for artificial light).
 */
const IBL_GAIN: Record<HdriKey, number> = { dawn: 0.9, day: 1.0, cloudy: 0.95, overcast: 0.5, fog: 0.5, sunset: 0.55, night: 0.3, city_night: 0.45 };

/** Brightness of the visible sky strip per HDRI (the photographs are exposure-normalised: night would look like dusk). */
const SKY_GAIN: Record<HdriKey, number> = { dawn: 0.9, day: 0.85, cloudy: 0.85, overcast: 0.7, fog: 0.7, sunset: 0.8, night: 0.16, city_night: 1 };

export interface SkyOptions {
  mode: SkyMode;
  ibl: 'sky' | 'hdri';
  skyRes: '2k' | '4k';
  iblIntensity: number;
  library?: AssetLibrary;
}

const DEFAULT_OPTS: SkyOptions = { mode: 'basic', ibl: 'sky', skyRes: '2k', iblIntensity: 1 };

export class SkySystem {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sunDir = new THREE.Vector3();
  envMap: THREE.Texture | null = null;
  /** Rotation to apply as `scene.environmentRotation.y` so the lit sky lines up with the visible one. */
  envRotationY = 0;
  /** Intensity to apply as `scene.environmentIntensity`. */
  envIntensity = 1;
  /** Which sky renderer is active ('basic' falls back automatically when assets are missing). */
  readonly activeMode: SkyMode;
  readonly hdriKeys: HdriChoice;
  /** Width in metres of the single-cascade shadow box (see ShadowSystem). */
  shadowSpan = 76;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private flash = 0;
  private baseHemi = 1;
  private nextFlash = 8;
  private usesHdriIbl = false;
  private physicalGain: THREE.IUniform<number> | null = null;

  constructor(
    private env: EnvDef,
    private opts: SkyOptions = DEFAULT_OPTS,
  ) {
    const lib = opts.library ?? defaultAssets;
    this.hdriKeys = hdriFor(env);
    const night = env.sky.stars;
    const stripTex = opts.mode === 'hdri' ? lib.sky(this.hdriKeys.sky, opts.skyRes) : null;
    const stripDef = HDRIS[this.hdriKeys.sky];
    const uniforms = {
      zenith: { value: new THREE.Color(env.sky.zenith) },
      horizon: { value: new THREE.Color(env.sky.horizon) },
      ground: { value: new THREE.Color(env.sky.ground) },
      sunDir: { value: new THREE.Vector3() },
      sunColor: { value: new THREE.Color(env.sky.sunColor) },
      sunDisc: { value: env.sky.sunDisc },
      stars: { value: env.sky.stars ? 1 : 0 },
      clouds: { value: env.sky.clouds },
      time: { value: 0 },
      flash: { value: 0 },
    };
    let mesh: THREE.Mesh;
    let mat: THREE.ShaderMaterial;
    let active: SkyMode = 'basic';
    const hdriSun = stripTex && stripDef.skyScale !== undefined;
    if (hdriSun) {
      active = 'hdri';
      mat = new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: fragHdri,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        fog: false,
        uniforms: {
          skyTex: { value: stripTex },
          skyScale: { value: stripDef.skyScale },
          skyRot: { value: 0 },
          skyGain: { value: SKY_GAIN[this.hdriKeys.sky] },
          skySat: { value: night ? 1.0 : 1.45 },
          horizonFog: { value: new THREE.Color(env.fog.color) },
          fogAmount: { value: THREE.MathUtils.clamp(1.0 - env.fog.far / 1500, 0.05, 0.7) },
          ground: uniforms.ground,
          sunDir: uniforms.sunDir,
          sunColor: uniforms.sunColor,
          sunDisc: uniforms.sunDisc,
          flash: uniforms.flash,
        },
      });
      mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
    } else if (opts.mode === 'physical' && !night) {
      active = 'physical';
      const sky = new Sky();
      mat = sky.material as THREE.ShaderMaterial;
      this.physicalGain = { value: 7 };
      mat.uniforms.uGain = this.physicalGain;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uGain = this.physicalGain!;
        shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uGain, 1.0 );').replace('void main()', 'uniform float uGain;\nvoid main()');
      };
      mat.fog = false;
      const turb = env.sky.clouds > 0.8 ? 8 : 3 + env.sky.clouds * 3;
      mat.uniforms.turbidity.value = turb;
      mat.uniforms.rayleigh.value = env.sky.sunElevation < 12 ? 2.4 : 1.2;
      mat.uniforms.mieCoefficient.value = 0.005 + env.sky.clouds * 0.01;
      mat.uniforms.mieDirectionalG.value = 0.8;
      mat.uniforms.cloudCoverage.value = Math.min(0.9, env.sky.clouds);
      mat.uniforms.cloudDensity.value = 0.35 + env.sky.clouds * 0.4;
      mat.uniforms.showSunDisc.value = env.sky.sunDisc > 0.1 ? 1 : 0;
      mesh = sky;
    } else {
      mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, uniforms });
      mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    }
    this.activeMode = active;
    this.material = mat;
    this.mesh = mesh;
    this.mesh.scale.setScalar(active === 'physical' ? 3800 : 4000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;

    const el = env.sky.sunElevation * DEG;
    const az = env.sky.sunAzimuth * DEG;
    // Azimuth measured from −Z (ahead) towards +X (right).
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    if (active === 'hdri') {
      // Keep the game's azimuth, but take the elevation the photograph was taken at, so the
      // visible sun, the clouds' lit sides and the shadow direction agree.
      const def = HDRIS[this.hdriKeys.sky];
      const elev = Math.max(def.sunElevation, 2.5) * DEG;
      this.sunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).normalize();
      // u-shift that moves the photo's sun azimuth onto the game's.
      (mat.uniforms.skyRot as THREE.IUniform<number>).value = (env.sky.sunAzimuth - def.sunAzimuth) * DEG;
    }
    if (mat.uniforms.sunDir) (mat.uniforms.sunDir.value as THREE.Vector3).copy(this.sunDir);
    if (active === 'physical') (mat.uniforms.sunPosition.value as THREE.Vector3).copy(this.sunDir);
    this.envRotationY = 0;

    this.sun = new THREE.DirectionalLight(env.sky.sunColor, env.sky.sunIntensity);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -38;
    sc.right = 38;
    sc.top = 38;
    sc.bottom = -38;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    this.hemi = new THREE.HemisphereLight(env.hemi.sky, env.hemi.ground, env.hemi.intensity);
    this.baseHemi = env.hemi.intensity;
  }

  /**
   * Bake the lighting environment into a PMREM map: the photographic HDRI when the
   * IBL setting asks for it (and the file loaded), the procedural sky otherwise.
   */
  buildEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
    const lib = this.opts.library ?? defaultAssets;
    const pm = new THREE.PMREMGenerator(renderer);
    const hdri = this.opts.ibl === 'hdri' ? lib.hdri(this.hdriKeys.light) : null;
    if (hdri) {
      const rt = pm.fromEquirectangular(hdri.texture);
      pm.dispose();
      this.usesHdriIbl = true;
      const def = HDRIS[this.hdriKeys.light];
      // Match the environment's sun azimuth: rotate the lighting HDRI the same way as the visible sky.
      const lightIsSky = this.hdriKeys.light === this.hdriKeys.sky;
      this.envRotationY = lightIsSky ? -(this.env.sky.sunAzimuth - def.sunAzimuth) * DEG : 0;
      this.envIntensity = this.opts.iblIntensity * IBL_GAIN[this.hdriKeys.light];
      // The photographic ambient already carries the sky colour; the flat hemisphere term would double it.
      this.hemi.intensity = this.baseHemi = this.env.hemi.intensity * 0.3;
      this.envTarget = rt;
      this.envMap = rt.texture;
      return rt.texture;
    }
    const scene = new THREE.Scene();
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.proceduralEnvMaterial());
    m.scale.setScalar(100);
    scene.add(m);
    // A few bright "light panels" so chrome and paint get crisp highlights.
    const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.env.sky.sunColor).multiplyScalar(this.env.id === 'night' || this.env.sky.stars ? 1.5 : 3) });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), panelMat);
    p1.position.copy(this.sunDir).multiplyScalar(60);
    p1.lookAt(0, 0, 0);
    scene.add(p1);
    if (this.env.sky.stars) {
      const sodium = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffae5a').multiplyScalar(2.5) });
      for (let i = 0; i < 6; i++) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), sodium);
        const a = (i / 6) * Math.PI * 2;
        p.position.set(Math.cos(a) * 40, 25, Math.sin(a) * 40);
        p.lookAt(0, 0, 0);
        scene.add(p);
      }
    }
    const rt = pm.fromScene(scene, 0.02);
    pm.dispose();
    // Free the temporary capture scene.
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.envIntensity = this.opts.iblIntensity * (this.env.sky.stars ? 0.55 : 1);
    this.envTarget = rt;
    this.envMap = rt.texture;
    return rt.texture;
  }

  /** Material for the procedural environment capture (always the gradient sky, sun disc softened). */
  private proceduralEnvMaterial(): THREE.ShaderMaterial {
    const u = this.env.sky;
    return new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new THREE.Color(u.zenith) },
        horizon: { value: new THREE.Color(u.horizon) },
        ground: { value: new THREE.Color(u.ground) },
        sunDir: { value: this.sunDir.clone() },
        sunColor: { value: new THREE.Color(u.sunColor) },
        sunDisc: { value: Math.min(u.sunDisc, 0.5) },
        stars: { value: u.stars ? 1 : 0 },
        clouds: { value: u.clouds },
        time: { value: 0 },
        flash: { value: 0 },
      },
    });
  }

  /** Apply environment map, intensity and rotation to a scene. */
  applyTo(scene: THREE.Scene): void {
    if (this.envMap) scene.environment = this.envMap;
    scene.environmentIntensity = this.envIntensity;
    scene.environmentRotation.set(0, this.envRotationY, 0);
  }

  get iblIsPhotographic(): boolean {
    return this.usesHdriIbl;
  }

  dispose(): void {
    this.envTarget?.dispose();
    this.envTarget = null;
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  /** Keep the shadow frustum centred on the player, snapped to texels to avoid shimmering. */
  follow(target: THREE.Vector3): void {
    const size = this.shadowSpan / this.sun.shadow.mapSize.x;
    const tx = Math.round(target.x / size) * size;
    const tz = Math.round(target.z / size) * size;
    this.sun.target.position.set(tx, target.y, tz);
    this.sun.position.set(tx + this.sunDir.x * 120, target.y + this.sunDir.y * 120, tz + this.sunDir.z * 120);
    this.sun.target.updateMatrixWorld();
    this.mesh.position.copy(target);
  }

  update(dt: number, time: number, onLightning?: (delay: number) => void): void {
    const u = this.material.uniforms;
    if (u.time) u.time.value = time;
    if (this.activeMode === 'physical') u.time.value = time;
    if (this.env.lightning) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.flash = 1;
        this.nextFlash = 10 + Math.random() * 18;
        onLightning?.(0.4 + Math.random() * 2.2);
      }
    }
    if (this.flash > 0) {
      // Double-strobe decay like real lightning.
      this.flash = Math.max(0, this.flash - dt * 3.2);
      const f = this.flash * (0.6 + 0.4 * Math.sin(this.flash * 40));
      if (u.flash) u.flash.value = f * 0.9;
      this.hemi.intensity = this.baseHemi + f * 3;
    }
  }
}
