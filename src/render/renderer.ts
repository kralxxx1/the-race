import * as THREE from 'three';
import type { SettingsReader } from '../settings';
import { assets } from './assets';
import { AdaptiveResolution, FrameLimiter, FrameStats } from './postfx/frameControl';
import { PostPipeline, type PostFrame } from './postfx/pipeline';
import { profileFromSettings, type QualityProfile, type ToneMap } from './quality';
import { setTextureAnisotropy } from './textures';

export interface FxState {
  /** 0..1 radial speed blur. */
  blur: number;
  vignette: number;
  aberration: number;
  desat: number;
  flash: number;
  /** Additive edge tint (e.g. red pulse). */
  tint: THREE.Vector3;
  /** 0..1 heat shimmer over the asphalt. */
  heat: number;
  /** 0..1 water on the visor. */
  rain: number;
  /** Metres from the camera that count as cockpit (excluded from TAA / motion-blur reprojection). */
  nearStatic: number;
}

export function defaultFx(): FxState {
  return { blur: 0, vignette: 0.3, aberration: 0, desat: 0, flash: 0, tint: new THREE.Vector3(), heat: 0, rain: 0, nearStatic: 0 };
}

/** Lighting/atmosphere description the post chain needs (set by whoever owns the sky). */
export interface Atmosphere {
  /** Direction towards the sun or moon, world space. */
  sunDir: THREE.Vector3 | null;
  /** Radiance colour used for flare and light shafts. */
  sunColor: THREE.Color;
  fogColor: THREE.Color;
  /** Extinction per metre of the volumetric fog layer at its base (0 = none). */
  fogDensity: number;
  fogBase: number;
  /** Height falloff of the fog layer per metre (larger = thinner layer hugging the ground). */
  fogFalloff: number;
  /** 0 dry .. 1 soaked (screen-space reflection strength). */
  wet: number;
  bloom: { strength: number; threshold: number; radius: number };
  /** Depth of field (garage / photo): focus distance in metres and strength; 0 = off. */
  dofFocus: number;
  dofAmount: number;
}

const TONE_CONST: Record<ToneMap, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  linear: THREE.LinearToneMapping,
};

/**
 * WebGL renderer with two paths. Low-end devices (profile.postFx = false) draw
 * the scene straight to the canvas with the context's native MSAA, tone mapping
 * and sRGB output. Everything else renders into an HDR target and runs the
 * `PostPipeline` (see postfx/pipeline.ts) before presenting.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly pipeline: PostPipeline;
  profile: QualityProfile;
  readonly limiter = new FrameLimiter(0);
  readonly stats = new FrameStats(120);
  readonly atmosphere: Atmosphere = {
    sunDir: null,
    sunColor: new THREE.Color(1, 0.95, 0.85),
    fogColor: new THREE.Color(0.7, 0.78, 0.86),
    fogDensity: 0,
    fogBase: 0,
    fogFalloff: 0.03,
    wet: 0,
    bloom: { strength: 0.2, threshold: 0.9, radius: 0.4 },
    dofFocus: 5,
    dofAmount: 0,
  };
  /** Callbacks run right before the scene is drawn (cascaded shadows, reflection probe, …). */
  readonly beforeRender = new Set<(scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void>();
  private adaptive: AdaptiveResolution;
  private width = 1;
  private height = 1;
  private applied = '';
  private dynScale = 1;
  private lastRender = 0;
  private frameMs = 16.7;
  private time = 0;
  private gpu = '';
  /** HDR render targets need half-float colour buffers; without them the forward path is used. */
  private readonly postSupported: boolean;
  private readonly frame: PostFrame = {
    time: 0,
    dt: 1 / 60,
    speedBlur: 0,
    vignette: 0,
    aberration: 0,
    desat: 0,
    flash: 0,
    tint: new THREE.Vector3(),
    heat: 0,
    rain: 0,
    nearStatic: 0,
    exposure: 1,
    bloomStrength: 0,
    bloomThreshold: 1,
    bloomRadius: 0.5,
    sunDir: null,
    sunColor: new THREE.Color(),
    fogColor: new THREE.Color(),
    fogDensity: 0,
    fogBase: 0,
    fogFalloff: 0.03,
    wet: 0,
    dofFocus: 5,
    dofAmount: 0,
  };
  private unjittered = new THREE.Matrix4();

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly settings: SettingsReader,
  ) {
    this.profile = profileFromSettings(settings);
    // Native MSAA stays on for the forward path; the HDR chain brings its own samples.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.pipeline = new PostPipeline(this.renderer);
    const ext = this.renderer.extensions;
    this.postSupported = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.adaptive = new AdaptiveResolution({ targetFps: this.profile.targetFps, minScale: this.profile.minScale, maxScale: 1 });
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      this.gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    } catch {
      this.gpu = 'bilinmiyor';
    }
    this.applySettings();
  }

  get gpuName(): string {
    return this.gpu;
  }

  /** Re-read graphics settings; rebuilds the post-processing chain only when needed. */
  applySettings(): void {
    const wanted = profileFromSettings(this.settings);
    const p = this.postSupported || !wanted.postFx ? wanted : { ...wanted, postFx: false };
    const key = JSON.stringify(p);
    if (key === this.applied) return;
    this.applied = key;
    this.profile = p;
    this.renderer.shadowMap.enabled = p.shadows;
    this.renderer.shadowMap.type = p.shadowFilter === 'vsm' ? THREE.VSMShadowMap : p.shadowFilter === 'basic' ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = p.postFx ? THREE.NoToneMapping : TONE_CONST[p.toneMapping];
    this.limiter.setCap(p.fpsCap);
    assets.setAnisotropy(p.anisotropy);
    setTextureAnisotropy(p.anisotropy);
    this.adaptive.configure({ targetFps: p.targetFps, minScale: p.minScale });
    if (!p.adaptiveResolution) this.adaptive.reset(1);
    this.dynScale = p.adaptiveResolution ? this.adaptive.scale : 1;
    this.pipeline.resetHistory();
    this.resize();
  }

  get speedBlurEnabled(): boolean {
    return this.profile.speedBlur;
  }

  /** Canvas pixel ratio (output resolution); render scale is applied on top inside the HDR chain. */
  private get pixelRatio(): number {
    const base = Math.max(0.5, Math.min(window.devicePixelRatio || 1, this.profile.pixelRatio));
    // The forward path has no internal target: render scale and adaptive scale shrink the canvas itself.
    return this.profile.postFx ? base : Math.max(0.35, base * Math.min(this.profile.renderScale, 1) * this.dynScale);
  }

  /** Resolution scale currently in effect (render scale × adaptive scale) for the overlay. */
  get resolutionScale(): number {
    return this.profile.postFx ? this.profile.renderScale * this.dynScale : Math.min(this.profile.renderScale, 1) * this.dynScale;
  }

  /** Adaptive resolution: feed the last frame's duration (seconds) once per frame. */
  adapt(_fps: number, dt: number): void {
    if (!this.profile.adaptiveResolution) {
      if (this.dynScale !== 1) {
        this.dynScale = 1;
        this.resize();
      }
      return;
    }
    const next = this.adaptive.update(dt * 1000);
    if (Math.abs(next - this.dynScale) > 1e-4) {
      this.dynScale = next;
      this.resize();
    }
  }

  setBloom(strength: number, threshold: number, radius: number): void {
    const b = this.atmosphere.bloom;
    b.strength = strength;
    b.threshold = threshold;
    b.radius = radius;
  }

  /** Depth of field for menus, the garage and photo shots (amount 0 disables it). */
  setDepthOfField(focusDistance: number, amount: number): void {
    this.atmosphere.dofFocus = focusDistance;
    this.atmosphere.dofAmount = amount;
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.rebuild();
  }

  private rebuild(): void {
    if (!this.profile.postFx) {
      this.pipeline.dispose();
      return;
    }
    const size = this.renderer.getDrawingBufferSize(_size);
    this.pipeline.build(this.profile, Math.max(1, size.x), Math.max(1, size.y), this.dynScale);
  }

  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }

  get viewportHeight(): number {
    return this.postActive ? this.pipeline.plan.height : this.height * this.renderer.getPixelRatio();
  }

  /** True when the HDR chain is the active path. */
  get postActive(): boolean {
    return this.profile.postFx && this.pipeline.plan?.mode === 'post';
  }

  /** Measured interval between the last two rendered frames, ms. */
  get lastFrameMs(): number {
    return this.frameMs;
  }

  render(scene: THREE.Scene, camera: THREE.Camera, fx?: FxState): void {
    const now = performance.now();
    if (this.lastRender > 0) {
      this.frameMs = now - this.lastRender;
      this.stats.push(this.frameMs);
    }
    this.lastRender = now;
    const dt = Math.min(0.1, this.frameMs / 1000);
    this.time += dt;
    const cam = camera as THREE.PerspectiveCamera;
    const gl = this.renderer;
    const p = this.profile;
    const envExposure = gl.toneMappingExposure;
    const expo = envExposure * Math.pow(2, p.exposureEV);
    for (const cb of this.beforeRender) cb(scene, cam);

    if (!this.postActive) {
      gl.setRenderTarget(null);
      gl.toneMappingExposure = expo;
      gl.render(scene, camera);
      gl.toneMappingExposure = envExposure;
      return;
    }

    const pipe = this.pipeline;
    camera.updateMatrixWorld();
    this.unjittered.copy(camera.projectionMatrix);
    pipe.beginFrame();
    const j = pipe.jitter;
    const e = camera.projectionMatrix.elements;
    const w = pipe.plan.width;
    const h = pipe.plan.height;
    if (j.x !== 0 || j.y !== 0) {
      e[8] += (j.x * 2) / w;
      e[9] += (j.y * 2) / h;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
    gl.setRenderTarget(pipe.sceneTarget);
    gl.toneMappingExposure = 1;
    gl.render(scene, camera);
    gl.toneMappingExposure = envExposure;
    // Hand the post chain the clean projection (it reprojects with unjittered matrices).
    const f = this.frame;
    const a = this.atmosphere;
    f.time = this.time;
    f.dt = dt;
    f.speedBlur = fx?.blur ?? 0;
    f.vignette = fx?.vignette ?? 0.3;
    f.aberration = fx?.aberration ?? 0;
    f.desat = fx?.desat ?? 0;
    f.flash = fx?.flash ?? 0;
    if (fx) f.tint.copy(fx.tint);
    else f.tint.set(0, 0, 0);
    f.heat = fx?.heat ?? 0;
    f.rain = fx?.rain ?? 0;
    f.nearStatic = fx?.nearStatic ?? 0;
    f.exposure = expo;
    f.bloomStrength = a.bloom.strength;
    f.bloomThreshold = a.bloom.threshold;
    f.bloomRadius = a.bloom.radius;
    f.sunDir = a.sunDir;
    f.sunColor.copy(a.sunColor);
    f.fogColor.copy(a.fogColor);
    f.fogDensity = a.fogDensity * p.fogDensity;
    f.fogBase = a.fogBase;
    f.fogFalloff = a.fogFalloff;
    f.wet = a.wet;
    f.dofFocus = a.dofFocus;
    f.dofAmount = a.dofAmount;
    // process() needs the jittered matrices for depth reconstruction.
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    pipe.process(cam, this.unjittered, f, pipe.plan.outputWidth, pipe.plan.outputHeight);
    // Restore the clean projection for the next consumer (HUD projection, audio…).
    e[8] = this.unjittered.elements[8];
    e[9] = this.unjittered.elements[9];
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  /** Compile every shader of a scene and of the post chain so the first frames do not stutter. */
  warmup(scene: THREE.Scene, camera: THREE.Camera): void {
    try {
      this.renderer.compile(scene, camera);
      this.render(scene, camera);
      this.pipeline.resetHistory();
      this.lastRender = 0;
    } catch (err) {
      console.warn('warmup failed', err);
    }
  }

  info(): { calls: number; triangles: number; geometries: number; textures: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }

  dispose(): void {
    this.pipeline.dispose();
    this.renderer.dispose();
  }
}

const _size = new THREE.Vector2();
