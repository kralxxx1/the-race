import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Quality } from '../storage/save';
import { QUALITY, type QualityProfile } from './quality';

const SpeedShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    blur: { value: 0 },
    vignette: { value: 0.3 },
    aberration: { value: 0 },
    desat: { value: 0 },
    flash: { value: 0 },
    tint: { value: new THREE.Vector3(0, 0, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float blur;
    uniform float vignette;
    uniform float aberration;
    uniform float desat;
    uniform float flash;
    uniform vec3 tint;
    varying vec2 vUv;
    void main() {
      vec2 c = vec2(0.5, 0.56);
      vec2 dir = vUv - c;
      float d = length(dir);
      float amt = blur * smoothstep(0.12, 0.8, d);
      vec3 col = vec3(0.0);
      float tw = 0.0;
      for (int i = 0; i < 10; i++) {
        float t = float(i) / 9.0;
        float w = 1.0 - t * 0.55;
        col += texture2D(tDiffuse, vUv - dir * amt * t * 0.085).rgb * w;
        tw += w;
      }
      col /= tw;
      if (aberration > 0.0) {
        float a = aberration * d * 0.012;
        col.r = mix(col.r, texture2D(tDiffuse, vUv + dir * a).r, 0.65);
        col.b = mix(col.b, texture2D(tDiffuse, vUv - dir * a).b, 0.65);
      }
      float vig = smoothstep(1.05, 0.28, d * (1.0 + vignette * 0.5));
      col *= mix(1.0, vig, 0.45 + vignette * 0.4);
      float g = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(g), desat);
      col += tint * d * d;
      col += vec3(flash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export interface FxState {
  /** 0..1 radial speed blur. */
  blur: number;
  vignette: number;
  aberration: number;
  desat: number;
  flash: number;
  /** Additive edge tint (e.g. red pulse). */
  tint: THREE.Vector3;
}

export function defaultFx(): FxState {
  return { blur: 0, vignette: 0.3, aberration: 0, desat: 0, flash: 0, tint: new THREE.Vector3() };
}

/** WebGL renderer + post-processing stack with quality presets. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private speed: ShaderPass | null = null;
  profile: QualityProfile;
  quality: Quality;
  private width = 1;
  private height = 1;
  speedBlurEnabled = true;

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.profile = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.applyQuality(quality);
  }

  applyQuality(q: Quality): void {
    this.quality = q;
    this.profile = QUALITY[q];
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.profile.pixelRatio));
    this.buildComposer();
    this.resize();
  }

  private buildComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.speed = null;
    if (!this.profile.postFx) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType,
      samples: this.profile.msaa,
    });
    const composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    composer.addPass(this.renderPass);
    if (this.profile.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.5, 0.85);
      composer.addPass(this.bloom);
    }
    this.speed = new ShaderPass(SpeedShader);
    composer.addPass(this.speed);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  setBloom(strength: number, threshold: number, radius: number): void {
    if (!this.bloom) return;
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
    this.bloom.radius = radius;
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }

  get viewportHeight(): number {
    return this.height * this.renderer.getPixelRatio();
  }

  render(scene: THREE.Scene, camera: THREE.Camera, fx?: FxState): void {
    if (this.composer && this.renderPass && this.speed) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      const u = this.speed.uniforms;
      u.blur.value = this.speedBlurEnabled ? (fx?.blur ?? 0) : 0;
      u.vignette.value = fx?.vignette ?? 0.3;
      u.aberration.value = fx?.aberration ?? 0;
      u.desat.value = fx?.desat ?? 0;
      u.flash.value = fx?.flash ?? 0;
      u.tint.value.copy(fx?.tint ?? new THREE.Vector3());
      this.composer.render();
    } else {
      this.renderer.render(scene, camera);
    }
  }

  info(): { calls: number; triangles: number; geometries: number; textures: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }

  dispose(): void {
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
