import * as THREE from 'three';
import type { EnvDef } from '../data/environments';
import { DEG } from '../core/math';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}`;

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
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  // Mie-like forward scattering halo and a crisp disc.
  col += sunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 64.0) * 0.35) * (0.4 + sunDisc * 0.6);
  col += sunColor * smoothstep(0.99955, 0.9998, sd) * 22.0 * sunDisc;
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

export class SkySystem {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sunDir = new THREE.Vector3();
  envMap: THREE.Texture | null = null;
  private flash = 0;
  private baseHemi = 1;
  private nextFlash = 8;

  constructor(private env: EnvDef) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      uniforms: {
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
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.mesh.scale.setScalar(4000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;

    const el = env.sky.sunElevation * DEG;
    const az = env.sky.sunAzimuth * DEG;
    // Azimuth measured from −Z (ahead) towards +X (right).
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    this.material.uniforms.sunDir.value.copy(this.sunDir);

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

  /** Bake the sky into a PMREM environment map used for reflections. */
  buildEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
    const pm = new THREE.PMREMGenerator(renderer);
    const scene = new THREE.Scene();
    const m = this.mesh.clone();
    m.material = this.material.clone();
    (m.material as THREE.ShaderMaterial).uniforms.sunDisc.value = Math.min(this.env.sky.sunDisc, 0.5);
    m.scale.setScalar(100);
    scene.add(m);
    // A few bright "light panels" so chrome and paint get crisp highlights.
    const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.env.sky.sunColor).multiplyScalar(this.env.id === 'night' ? 1.5 : 3) });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), panelMat);
    p1.position.copy(this.sunDir).multiplyScalar(60);
    p1.lookAt(0, 0, 0);
    scene.add(p1);
    if (this.env.id === 'night') {
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
    this.envMap = rt.texture;
    return rt.texture;
  }

  /** Keep the shadow frustum centred on the player, snapped to texels to avoid shimmering. */
  follow(target: THREE.Vector3): void {
    const size = 76 / this.sun.shadow.mapSize.x;
    const tx = Math.round(target.x / size) * size;
    const tz = Math.round(target.z / size) * size;
    this.sun.target.position.set(tx, target.y, tz);
    this.sun.position.set(tx + this.sunDir.x * 120, target.y + this.sunDir.y * 120, tz + this.sunDir.z * 120);
    this.sun.target.updateMatrixWorld();
    this.mesh.position.copy(target);
  }

  update(dt: number, time: number, onLightning?: (delay: number) => void): void {
    this.material.uniforms.time.value = time;
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
      this.material.uniforms.flash.value = f * 0.9;
      this.hemi.intensity = this.baseHemi + f * 3;
    }
  }
}
