import * as THREE from 'three';
import { Rng } from '../../core/math';

/**
 * Falling snow: a fixed cloud of point sprites that lives in a box around the camera. Flakes are
 * world-fixed except for their own fall and flutter; the box wraps around the camera in the vertex
 * shader, so riding at speed streams the flakes past the helmet with no CPU work per frame beyond
 * three uniforms. Sizes follow perspective and the sprites are soft discs.
 */

const VERT = /* glsl */ `
attribute vec4 aRand;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec3 uWind;
uniform float uScale;
uniform float uSize;
varying float vAlpha;
void main() {
  float fall = uTime * (0.9 + aRand.w * 1.1);
  vec3 p = aRand.xyz * uBox;
  p.y -= fall;
  p += uWind * uTime * (0.4 + aRand.w);
  // Gentle flutter: flakes drift in small loops instead of falling straight down.
  p.x += sin(uTime * (0.7 + aRand.w * 1.6) + aRand.x * 40.0) * 0.45;
  p.z += cos(uTime * (0.6 + aRand.w * 1.3) + aRand.z * 40.0) * 0.45;
  vec3 rel = mod(p - uCam, uBox) - uBox * 0.5;
  vec4 mv = viewMatrix * vec4(uCam + rel, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.1);
  gl_PointSize = clamp(uSize * (0.6 + aRand.w) * uScale / dist, 1.0, 14.0);
  // Fade at the box boundary and very close to the lens.
  vec3 q = abs(rel) / (uBox * 0.5);
  vAlpha = (1.0 - smoothstep(0.78, 1.0, max(q.x, max(q.y, q.z)))) * smoothstep(0.15, 0.9, dist) * (0.55 + 0.45 * aRand.w);
}
`;

const FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vec3(0.96, 0.98, 1.0), a);
}
`;

export class Snowfall {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private t = 0;

  /** `density` multiplies the flake count (the world.scenery setting). */
  constructor(density: number, wind = 0.5) {
    const n = Math.round(1400 + 2200 * Math.min(2, density));
    const rng = new Rng(4242);
    const rand = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) rand[i] = rng.float();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(46, 22, 90) },
        uWind: { value: new THREE.Vector3(wind * 1.5, 0, wind * 0.6) },
        uScale: { value: 700 },
        uSize: { value: 0.1 },
      },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** Per-frame: advance time and re-centre the box on the camera. `fovDeg` is the vertical field of view. */
  update(dt: number, cam: THREE.Vector3, viewportHeight: number, fovDeg: number): void {
    this.t += dt;
    const u = this.mat.uniforms;
    u.uTime.value = this.t;
    (u.uCam.value as THREE.Vector3).copy(cam);
    u.uScale.value = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
    this.points.removeFromParent();
  }
}
