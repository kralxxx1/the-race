import * as THREE from 'three';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { QualityProfile, ToneMap } from '../quality';
import { lutTexture } from './lut';
import {
  AO_APPLY_FRAG,
  AO_BLUR_FRAG,
  AO_FRAG,
  BLOOM_DOWN_FRAG,
  BLOOM_PREFILTER_FRAG,
  BLOOM_UP_FRAG,
  COMPOSITE_FRAG,
  DOF_FRAG,
  MOTION_FRAG,
  OUTPUT_FRAG,
  SSR_COMBINE_FRAG,
  SSR_FRAG,
  SUNVIS_FRAG,
  TAA_FRAG,
  VERT,
  VOL_COMBINE_FRAG,
  VOL_FRAG,
} from './shaders';
import { GTAO_LAYOUT, hasPass, passSpec, planPipeline, type PipelinePlan } from './plan';

/** Per-frame inputs of the post chain (everything that is not a quality setting). */
export interface PostFrame {
  time: number;
  dt: number;
  speedBlur: number;
  vignette: number;
  aberration: number;
  desat: number;
  flash: number;
  tint: THREE.Vector3;
  heat: number;
  rain: number;
  /** Distance below which pixels are glued to the camera (cockpit) and excluded from reprojection. */
  nearStatic: number;
  /** Linear exposure multiplier (environment exposure × 2^EV). */
  exposure: number;
  bloomStrength: number;
  bloomThreshold: number;
  bloomRadius: number;
  /** Direction towards the sun/moon in world space (null = none). */
  sunDir: THREE.Vector3 | null;
  sunColor: THREE.Color;
  fogColor: THREE.Color;
  /** Extinction per metre of the volumetric layer at its base. */
  fogDensity: number;
  fogBase: number;
  /** 0 dry .. 1 soaked: drives screen-space reflection strength on roads. */
  wet: number;
  /** Depth of field: focus distance in metres and strength (0 = off). */
  dofFocus: number;
  dofAmount: number;
}

const TONE_INDEX: Record<ToneMap, number> = { aces: 0, agx: 1, neutral: 2, reinhard: 3, cineon: 4, linear: 5 };

function halton(i: number, b: number): number {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
}
const JITTER: readonly [number, number][] = Array.from({ length: 16 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

class FullScreen {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly mesh: THREE.Mesh;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.mesh = new THREE.Mesh(g);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  draw(gl: THREE.WebGLRenderer, mat: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.mesh.material = mat;
    gl.setRenderTarget(target);
    gl.render(this.scene, this.camera);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

type Uniforms = Record<string, THREE.IUniform>;

function makeRT(w: number, h: number, opts: { depth?: boolean; samples?: number; type?: THREE.TextureDataType; linear?: boolean } = {}): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: opts.type ?? THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: opts.linear === false ? THREE.NearestFilter : THREE.LinearFilter,
    magFilter: opts.linear === false ? THREE.NearestFilter : THREE.LinearFilter,
    depthBuffer: !!opts.depth,
    stencilBuffer: false,
    samples: opts.samples ?? 0,
  });
  rt.texture.generateMipmaps = false;
  if (opts.depth) {
    const dt = new THREE.DepthTexture(Math.max(1, w), Math.max(1, h));
    dt.minFilter = THREE.NearestFilter;
    dt.magFilter = THREE.NearestFilter;
    rt.depthTexture = dt;
  }
  return rt;
}

/** Procedural smudge/dust map for the visor dirt effect (tileable-free, one channel). */
function makeDirtTexture(): THREE.DataTexture {
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const f = new Float32Array(n * n);
  // Soft blotches + specks.
  for (let k = 0; k < 90; k++) {
    const cx = rnd() * n;
    const cy = rnd() * n;
    const r = 6 + rnd() * 34;
    const a = 0.15 + rnd() * 0.5;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(n, cy + r); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(n, cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d < 1) f[y * n + x] += a * (1 - d) * (1 - d);
      }
  }
  for (let k = 0; k < 90; k++) {
    const x = Math.floor(rnd() * n);
    const y = Math.floor(rnd() * n);
    f[y * n + x] += 0.35 + rnd() * 0.3;
  }
  for (let i = 0; i < n * n; i++) {
    const v = Math.min(1, f[i]) * 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const _vp = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v4 = new THREE.Vector4();
const _invVP = new THREE.Matrix4();
const _cam = new THREE.Vector3();

/**
 * The HDR post-processing chain. Plans which passes run from the quality profile
 * (see plan.ts), owns every render target and shader, and renders a frame:
 *
 *   scene (HDR, MSAA, depth) → AO → SSR → volumetrics → TAA → bloom → DOF →
 *   motion blur → composite (tone map, grading, lens) → FXAA/SMAA → output (CAS)
 *
 * Normals are reconstructed from depth, so there is no geometry pre-pass. All
 * shader variants are compiled in `build` (when settings change) — never while riding.
 */
export class PostPipeline {
  plan!: PipelinePlan;
  profile!: QualityProfile;
  private fs = new FullScreen();
  private shared = {
    tDepth: { value: null as THREE.Texture | null },
    uProj: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uNearFar: { value: new THREE.Vector2(0.1, 1000) },
    uSize: { value: new THREE.Vector2(1, 1) },
  };
  private mats: Record<string, THREE.ShaderMaterial> = {};
  private rts: THREE.WebGLRenderTarget[] = [];
  private scene!: THREE.WebGLRenderTarget;
  private ping!: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private hist: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null;
  private ao: THREE.WebGLRenderTarget | null = null;
  private ao2: THREE.WebGLRenderTarget | null = null;
  private ssr: THREE.WebGLRenderTarget | null = null;
  private vol: THREE.WebGLRenderTarget | null = null;
  private bloomDown: THREE.WebGLRenderTarget[] = [];
  private bloomUp: THREE.WebGLRenderTarget[] = [];
  private ldr: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget | null] | null = null;
  private sunVis: THREE.WebGLRenderTarget | null = null;
  private smaa: SMAAPass | null = null;
  private dirt: THREE.DataTexture | null = null;
  private blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  private frame = 0;
  private histIndex = 0;
  private historyValid = false;
  private prevVP = new THREE.Matrix4();
  private havePrev = false;
  private prevCamPos = new THREE.Vector3();
  /** Sub-pixel jitter of the frame being rendered, in pixels (0 when TAA is off). */
  readonly jitter = new THREE.Vector2();
  private builtKey = '';
  /** Names of the passes that ran last frame (debug / tests). */
  readonly lastPasses: string[] = [];

  constructor(private gl: THREE.WebGLRenderer) {
    this.blackTex.needsUpdate = true;
  }

  /** Allocate (or resize) everything for a profile and drawing-buffer size. */
  build(profile: QualityProfile, outW: number, outH: number, dynScale: number): PipelinePlan {
    this.profile = profile;
    const maxTex = this.gl.capabilities.maxTextureSize;
    const maxSamples = this.gl.capabilities.maxSamples;
    // Guard rails: the extreme preset asks for a lot; never ask the GPU for more than it can address.
    const clampedProfile = { ...profile, msaa: Math.min(profile.msaa, maxSamples) };
    let plan = planPipeline(clampedProfile, outW, outH, dynScale);
    const maxPixels = 36e6;
    let s = dynScale;
    while ((plan.width > maxTex || plan.height > maxTex || plan.width * plan.height > maxPixels) && s > 0.2) {
      s *= 0.9;
      plan = planPipeline(clampedProfile, outW, outH, s);
    }
    this.plan = plan;
    const key = plan.key + `|${plan.width}x${plan.height}|${profile.toneMapping}|${profile.lut}`;
    if (key === this.builtKey) return plan;
    this.builtKey = key;
    this.freeGpu();
    this.historyValid = false;
    this.allocate(plan, clampedProfile);
    return plan;
  }

  private mat(frag: string, uniforms: Uniforms, defines: Record<string, string | number> = {}, withShared = true): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: frag,
      uniforms: { ...(withShared ? this.shared : {}), ...uniforms },
      defines,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending,
    });
  }

  private rt(w: number, h: number, opts?: Parameters<typeof makeRT>[2]): THREE.WebGLRenderTarget {
    const r = makeRT(w, h, opts);
    this.rts.push(r);
    return r;
  }

  private allocate(plan: PipelinePlan, p: QualityProfile): void {
    const { width: w, height: h } = plan;
    this.scene = this.rt(w, h, { depth: true, samples: plan.msaa });
    this.ping = [this.rt(w, h), this.rt(w, h)];
    const m = this.mats;
    const ao = passSpec(plan, 'ao');
    if (ao && p.ao !== 'off') {
      this.ao = this.rt(ao.width, ao.height);
      this.ao2 = this.rt(ao.width, ao.height);
      const [slices, steps] = GTAO_LAYOUT[p.aoQuality];
      m.ao = this.mat(
        AO_FRAG,
        { uRadius: { value: p.aoRadius }, uIntensity: { value: 1 }, uProjScale: { value: 1 }, uFrame: { value: 0 } },
        { AO_MODE: p.ao === 'gtao' ? 2 : p.ao === 'ssao' ? 1 : 0, AO_SAMPLES: ao.samples, GTAO_SLICES: slices, GTAO_STEPS: steps },
      );
      m.aoBlur = this.mat(AO_BLUR_FRAG, { tAo: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } });
      m.aoApply = this.mat(AO_APPLY_FRAG, { tColor: { value: null }, tAo: { value: null }, uStrength: { value: 1 } }, {}, false);
    }
    const ssr = passSpec(plan, 'ssr');
    if (ssr) {
      this.ssr = this.rt(ssr.width, ssr.height);
      m.ssr = this.mat(
        SSR_FRAG,
        { tColor: { value: null }, uUpView: { value: new THREE.Vector3(0, 1, 0) }, uWet: { value: 0 }, uMaxDist: { value: 90 }, uFrame: { value: 0 }, uIntensity: { value: 1 } },
        { SSR_STEPS: ssr.samples },
      );
      m.ssrCombine = this.mat(SSR_COMBINE_FRAG, { tColor: { value: null }, tSsr: { value: null } }, {}, false);
    }
    const vol = passSpec(plan, 'volumetrics');
    if (vol) {
      this.vol = this.rt(vol.width, vol.height);
      m.vol = this.mat(
        VOL_FRAG,
        {
          tColor: { value: null },
          uInvViewProj: { value: new THREE.Matrix4() },
          uCamPos: { value: new THREE.Vector3() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color() },
          uFogColor: { value: new THREE.Color() },
          uSunUv: { value: new THREE.Vector2() },
          uSunFacing: { value: 0 },
          uDensity: { value: 0.002 },
          uHeightFalloff: { value: 0.012 },
          uFogBase: { value: 0 },
          uMaxDist: { value: 700 },
          uTime: { value: 0 },
          uRays: { value: 0 },
          uFogOn: { value: p.volumetricFog === 'off' ? 0 : 1 },
          uFrame: { value: 0 },
        },
        { FOG_STEPS: Math.max(1, vol.samples), RAY_SAMPLES: Math.max(1, vol.extra ?? 1) },
      );
      m.volCombine = this.mat(VOL_COMBINE_FRAG, { tColor: { value: null }, tVol: { value: null } }, {}, false);
    }
    if (p.aa === 'taa') {
      this.hist = [this.rt(w, h), this.rt(w, h)];
      m.taa = this.mat(TAA_FRAG, {
        tColor: { value: null },
        tHistory: { value: null },
        uInvViewProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uFeedback: { value: 0.9 },
        uNearStatic: { value: 0 },
        uHistoryValid: { value: 0 },
        uJitter: { value: new THREE.Vector2() },
      });
    }
    if (hasPass(plan, 'bloom')) {
      const b = passSpec(plan, 'bloom')!;
      const mips = Math.max(1, Math.min(b.samples, Math.floor(Math.log2(Math.max(2, Math.min(b.width, b.height))))));
      let bw = b.width;
      let bh = b.height;
      for (let i = 0; i < mips; i++) {
        this.bloomDown.push(this.rt(bw, bh));
        if (i < mips - 1) this.bloomUp.push(this.rt(bw, bh));
        bw = Math.max(1, bw >> 1);
        bh = Math.max(1, bh >> 1);
      }
      m.bloomPre = this.mat(BLOOM_PREFILTER_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 }, uKnee: { value: 0.4 } }, {}, false);
      m.bloomDown = this.mat(BLOOM_DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, {}, false);
      m.bloomUp = this.mat(BLOOM_UP_FRAG, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } }, {}, false);
    }
    const dof = passSpec(plan, 'dof');
    if (dof) m.dof = this.mat(DOF_FRAG, { tColor: { value: null }, uFocus: { value: 5 }, uAperture: { value: 1 }, uMaxBlur: { value: 18 } }, { DOF_SAMPLES: dof.samples });
    const mb = passSpec(plan, 'motionBlur');
    if (mb) {
      m.motion = this.mat(
        MOTION_FRAG,
        { tColor: { value: null }, uInvViewProj: { value: new THREE.Matrix4() }, uPrevViewProj: { value: new THREE.Matrix4() }, uScale: { value: 0.5 }, uMaxPx: { value: 48 }, uNearStatic: { value: 0 } },
        { MB_SAMPLES: mb.samples },
      );
    }
    if (p.lensDirt) this.dirt ??= makeDirtTexture();
    m.sunVis = this.mat(SUNVIS_FRAG, { tDepth: { value: null }, uSunUv: { value: new THREE.Vector2() }, uOnScreen: { value: 0 } }, {}, false);
    if (p.lensFlare) this.sunVis = this.rt(1, 1, { type: THREE.UnsignedByteType, linear: false });
    m.composite = this.mat(
      COMPOSITE_FRAG,
      {
        tColor: { value: null },
        tBloom: { value: this.blackTex },
        tDirt: { value: this.dirt ?? this.blackTex },
        tSunVis: { value: this.sunVis?.texture ?? this.blackTex },
        tLut: { value: lutTexture(p.lut === 'off' ? 'neutral' : p.lut) },
        uSize: { value: new THREE.Vector2(w, h) },
        uTime: { value: 0 },
        uToneMap: { value: TONE_INDEX[p.toneMapping] },
        toneMappingExposure: { value: 1 },
        uBloom: { value: 0 },
        uDirt: { value: 0 },
        uBrightness: { value: 1 },
        uContrast: { value: 1 },
        uSaturation: { value: 1 },
        uLutStrength: { value: 0 },
        uSpeedBlur: { value: 0 },
        uAberration: { value: 0 },
        uVignette: { value: 0.3 },
        uGrain: { value: 0 },
        uDesat: { value: 0 },
        uFlash: { value: 0 },
        uTint: { value: new THREE.Vector3() },
        uHeat: { value: 0 },
        uRain: { value: 0 },
        uSunUv: { value: new THREE.Vector2() },
        uSunColor: { value: new THREE.Color() },
        uFlare: { value: 0 },
        uFlareAspect: { value: new THREE.Vector2(w / h, 1) },
        uDither: { value: 1 },
      },
      {},
      false,
    );
    const needLdrB = p.aa === 'fxaa' || p.aa === 'smaa';
    this.ldr = [this.rt(w, h), needLdrB ? this.rt(w, h) : null];
    if (p.aa === 'fxaa') {
      m.fxaa = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FXAAShader.fragmentShader,
        uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1 / w, 1 / h) } },
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
    }
    if (p.aa === 'smaa') {
      this.smaa = new SMAAPass();
      this.smaa.setSize(w, h);
    }
    m.output = this.mat(OUTPUT_FRAG, { tColor: { value: null }, uSrcSize: { value: new THREE.Vector2(w, h) }, uSharpen: { value: p.sharpen }, uSuperSample: { value: 1 }, uDither: { value: 1 } }, {}, false);
    this.shared.uSize.value.set(w, h);
  }

  private freeGpu(): void {
    for (const r of this.rts) r.dispose();
    this.rts = [];
    this.bloomDown = [];
    this.bloomUp = [];
    this.hist = null;
    this.ao = this.ao2 = this.ssr = this.vol = this.sunVis = null;
    this.ldr = null;
    for (const k of Object.keys(this.mats)) this.mats[k].dispose();
    this.mats = {};
    this.smaa?.dispose();
    this.smaa = null;
  }

  /** Forget temporal history (cuts, teleports, world re-basing, resolution changes). */
  resetHistory(): void {
    this.historyValid = false;
    this.havePrev = false;
  }

  /** Compute the TAA jitter for the next frame; call before rendering the scene. */
  beginFrame(): void {
    if (this.profile.aa === 'taa' && this.plan.mode === 'post') {
      const j = JITTER[this.frame % JITTER.length];
      this.jitter.set(j[0], j[1]);
    } else this.jitter.set(0, 0);
  }

  /** The scene is drawn into this target (colour + depth). */
  get sceneTarget(): THREE.WebGLRenderTarget {
    return this.scene;
  }

  /**
   * Run the chain on an already rendered HDR scene target. `camera` must carry the
   * jittered projection used for the scene render; `unjittered` is the same
   * camera's clean projection.
   */
  process(camera: THREE.PerspectiveCamera, unjitteredProj: THREE.Matrix4, f: PostFrame, outW: number, outH: number): void {
    const gl = this.gl;
    const p = this.profile;
    const m = this.mats;
    const fs = this.fs;
    const w = this.plan.width;
    const h = this.plan.height;
    this.lastPasses.length = 0;

    // Camera matrices.
    const sh = this.shared;
    sh.tDepth.value = this.scene.depthTexture;
    sh.uProj.value.copy(camera.projectionMatrix);
    sh.uProjInv.value.copy(camera.projectionMatrixInverse);
    sh.uNearFar.value.set(camera.near, camera.far);
    sh.uSize.value.set(w, h);
    _vp.multiplyMatrices(unjitteredProj, camera.matrixWorldInverse);
    const invVP = _invVP.copy(_vp).invert();
    camera.getWorldPosition(_v);
    // A big jump (world re-basing, respawn, camera cut) invalidates reprojection.
    if (this.havePrev && _v.distanceToSquared(this.prevCamPos) > 40 * 40) this.resetHistory();
    this.prevCamPos.copy(_v);
    const camPos = _cam.copy(_v);
    const havePrev = this.havePrev;
    const prevVP = havePrev ? this.prevVP : _vp;

    let read: THREE.Texture = this.scene.texture;
    let wi = 0;
    const out = (): THREE.WebGLRenderTarget => this.ping[wi];
    const commit = () => {
      read = this.ping[wi].texture;
      wi = 1 - wi;
    };

    // ── ambient occlusion ──
    if (this.ao && this.ao2 && m.ao) {
      const u = m.ao.uniforms;
      u.uRadius.value = p.aoRadius;
      u.uIntensity.value = 0.6 + p.aoIntensity * 0.9;
      u.uProjScale.value = (h * 0.5) * unjitteredProj.elements[5];
      u.uFrame.value = p.aa === 'taa' ? this.frame % 16 : 0;
      fs.draw(gl, m.ao, this.ao);
      m.aoBlur.uniforms.tAo.value = this.ao.texture;
      m.aoBlur.uniforms.uDir.value.set(1, 0);
      fs.draw(gl, m.aoBlur, this.ao2);
      m.aoBlur.uniforms.tAo.value = this.ao2.texture;
      m.aoBlur.uniforms.uDir.value.set(0, 1);
      fs.draw(gl, m.aoBlur, this.ao);
      m.aoApply.uniforms.tColor.value = read;
      m.aoApply.uniforms.tAo.value = this.ao.texture;
      m.aoApply.uniforms.uStrength.value = Math.min(1, p.aoIntensity);
      fs.draw(gl, m.aoApply, out());
      commit();
      this.lastPasses.push('ao');
    }

    // ── screen-space reflections ──
    if (this.ssr && m.ssr) {
      const u = m.ssr.uniforms;
      u.tColor.value = read;
      u.uUpView.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
      u.uWet.value = f.wet;
      u.uFrame.value = this.frame % 16;
      u.uMaxDist.value = p.ssr === 'ultra' ? 140 : p.ssr === 'high' ? 110 : 80;
      u.uIntensity.value = 0.55 + f.wet * 0.55;
      fs.draw(gl, m.ssr, this.ssr);
      m.ssrCombine.uniforms.tColor.value = read;
      m.ssrCombine.uniforms.tSsr.value = this.ssr.texture;
      fs.draw(gl, m.ssrCombine, out());
      commit();
      this.lastPasses.push('ssr');
    }

    // Sun on screen (shared by shafts, flare).
    let sunUvX = 0.5;
    let sunUvY = 0.5;
    let sunFacing = 0;
    if (f.sunDir) {
      _v4.set(camPos.x + f.sunDir.x * 1000, camPos.y + f.sunDir.y * 1000, camPos.z + f.sunDir.z * 1000, 1).applyMatrix4(_vp);
      if (_v4.w > 0) {
        sunUvX = (_v4.x / _v4.w) * 0.5 + 0.5;
        sunUvY = (_v4.y / _v4.w) * 0.5 + 0.5;
        camera.getWorldDirection(_v);
        sunFacing = Math.max(0, _v.dot(f.sunDir));
      }
    }

    // ── volumetric fog + light shafts ──
    if (this.vol && m.vol) {
      const u = m.vol.uniforms;
      const rays = p.godRays === 'off' ? 0 : p.godRays === 'low' ? 0.35 : p.godRays === 'medium' ? 0.5 : p.godRays === 'high' ? 0.7 : 0.9;
      u.tColor.value = read;
      u.uInvViewProj.value.copy(invVP);
      u.uCamPos.value.copy(camPos);
      if (f.sunDir) u.uSunDir.value.copy(f.sunDir);
      u.uSunColor.value.copy(f.sunColor);
      u.uFogColor.value.copy(f.fogColor);
      u.uSunUv.value.set(sunUvX, sunUvY);
      u.uSunFacing.value = f.sunDir ? Math.pow(sunFacing, 2) : 0;
      u.uDensity.value = f.fogDensity;
      u.uFogBase.value = f.fogBase;
      u.uTime.value = f.time;
      u.uRays.value = rays;
      u.uFrame.value = this.frame % 16;
      fs.draw(gl, m.vol, this.vol);
      m.volCombine.uniforms.tColor.value = read;
      m.volCombine.uniforms.tVol.value = this.vol.texture;
      fs.draw(gl, m.volCombine, out());
      commit();
      this.lastPasses.push('volumetrics');
    }

    // ── temporal anti-aliasing ──
    if (this.hist && m.taa) {
      const u = m.taa.uniforms;
      const cur = this.hist[this.histIndex];
      const prev = this.hist[1 - this.histIndex];
      u.tColor.value = read;
      u.tHistory.value = prev.texture;
      u.uInvViewProj.value.copy(invVP);
      u.uPrevViewProj.value.copy(prevVP);
      u.uFeedback.value = p.taaFeedback;
      u.uNearStatic.value = f.nearStatic;
      u.uHistoryValid.value = this.historyValid && havePrev ? 1 : 0;
      fs.draw(gl, m.taa, cur);
      read = cur.texture;
      this.histIndex = 1 - this.histIndex;
      this.historyValid = true;
      this.lastPasses.push('taa');
    }

    // ── bloom ──
    let bloomTex: THREE.Texture | null = null;
    if (this.bloomDown.length && m.bloomPre) {
      const down = this.bloomDown;
      const up = this.bloomUp;
      const pre = m.bloomPre.uniforms;
      pre.tSrc.value = read;
      pre.uTexel.value.set(1 / w, 1 / h);
      pre.uThreshold.value = f.bloomThreshold;
      pre.uKnee.value = 0.5;
      fs.draw(gl, m.bloomPre, down[0]);
      for (let i = 1; i < down.length; i++) {
        m.bloomDown.uniforms.tSrc.value = down[i - 1].texture;
        m.bloomDown.uniforms.uTexel.value.set(1 / down[i - 1].width, 1 / down[i - 1].height);
        fs.draw(gl, m.bloomDown, down[i]);
      }
      let lower = down[down.length - 1].texture;
      for (let i = up.length - 1; i >= 0; i--) {
        const u = m.bloomUp.uniforms;
        u.tSrc.value = lower;
        u.tBase.value = down[i].texture;
        const src = i === up.length - 1 ? down[i + 1] : up[i + 1];
        u.uTexel.value.set(1 / src.width, 1 / src.height);
        u.uRadius.value = 0.6 + f.bloomRadius * 1.2;
        fs.draw(gl, m.bloomUp, up[i]);
        lower = up[i].texture;
      }
      bloomTex = lower;
      this.lastPasses.push('bloom');
    }

    // ── depth of field ──
    if (m.dof && f.dofAmount > 0.001) {
      const u = m.dof.uniforms;
      u.tColor.value = read;
      u.uFocus.value = f.dofFocus;
      u.uAperture.value = f.dofAmount * (h / 1080) * 0.55;
      u.uMaxBlur.value = (p.dof === 'ultra' ? 26 : p.dof === 'high' ? 20 : 14) * (h / 1080);
      fs.draw(gl, m.dof, out());
      commit();
      this.lastPasses.push('dof');
    }

    // ── per-pixel camera motion blur ──
    if (m.motion && havePrev && p.motionBlurStrength > 0) {
      const u = m.motion.uniforms;
      u.tColor.value = read;
      u.uInvViewProj.value.copy(invVP);
      u.uPrevViewProj.value.copy(prevVP);
      // Shutter of 1/120 s regardless of frame rate: blur the fraction of this frame's motion that fits.
      u.uScale.value = Math.min(0.8, ((1 / 120) / Math.max(f.dt, 1 / 240)) * p.motionBlurStrength * 0.6);
      u.uMaxPx.value = 56 * (h / 1080);
      u.uNearStatic.value = f.nearStatic;
      fs.draw(gl, m.motion, out());
      commit();
      this.lastPasses.push('motionBlur');
    }

    // ── sun visibility for the lens flare ──
    if (this.sunVis && f.sunDir) {
      const u = m.sunVis.uniforms;
      u.tDepth.value = this.scene.depthTexture;
      u.uSunUv.value.set(sunUvX, sunUvY);
      u.uOnScreen.value = sunFacing > 0.02 ? 1 : 0;
      fs.draw(gl, m.sunVis, this.sunVis);
    }

    // ── composite: tone map, grading, lens effects ──
    const c = m.composite.uniforms;
    c.tColor.value = read;
    c.tBloom.value = bloomTex ?? this.blackTex;
    c.uTime.value = f.time;
    c.toneMappingExposure.value = f.exposure;
    c.uBloom.value = bloomTex ? f.bloomStrength * p.bloomIntensity : 0;
    c.uDirt.value = p.lensDirt && bloomTex ? 1 : 0;
    c.uBrightness.value = p.brightness;
    c.uContrast.value = p.contrast;
    c.uSaturation.value = p.saturation;
    c.uLutStrength.value = p.lut === 'off' ? 0 : p.lutStrength;
    c.uSpeedBlur.value = p.speedBlur ? f.speedBlur : 0;
    c.uAberration.value = Math.max(f.aberration, 0) * (0.35 + p.chromatic * 1.4) * (p.chromatic > 0 || f.aberration > 0.4 ? 1 : 0);
    c.uVignette.value = f.vignette * 0.5 + p.vignette;
    c.uGrain.value = p.filmGrain;
    c.uDesat.value = f.desat;
    c.uFlash.value = f.flash;
    c.uTint.value.copy(f.tint);
    c.uHeat.value = p.heatHaze ? f.heat : 0;
    c.uRain.value = p.visorRain ? f.rain : 0;
    c.uSunUv.value.set(sunUvX, sunUvY);
    c.uSunColor.value.copy(f.sunColor);
    c.uFlare.value = p.lensFlare && f.sunDir && this.sunVis ? 1 : 0;
    c.uDither.value = 1;
    const ldrA = this.ldr![0];
    fs.draw(gl, m.composite, ldrA);
    this.lastPasses.push('composite');
    let final = ldrA;

    // ── final anti-aliasing ──
    const ldrB = this.ldr![1];
    if (m.fxaa && ldrB) {
      m.fxaa.uniforms.tDiffuse.value = ldrA.texture;
      fs.draw(gl, m.fxaa, ldrB);
      final = ldrB;
      this.lastPasses.push('fxaa');
    } else if (this.smaa && ldrB) {
      this.smaa.renderToScreen = false;
      this.smaa.render(gl, ldrB, ldrA, 0, false);
      final = ldrB;
      this.lastPasses.push('smaa');
    }

    // ── output: supersample resolve + CAS sharpen + dither → canvas ──
    const o = m.output.uniforms;
    o.tColor.value = final.texture;
    o.uSrcSize.value.set(w, h);
    o.uSharpen.value = p.sharpen;
    o.uSuperSample.value = Math.max(1, w / Math.max(1, outW));
    fs.draw(gl, m.output, null);
    this.lastPasses.push('output');
    void outH;

    // History for the next frame.
    this.prevVP.copy(_vp);
    this.havePrev = true;
    this.frame++;
  }

  dispose(): void {
    this.freeGpu();
    this.fs.dispose();
    this.dirt?.dispose();
    this.blackTex.dispose();
    this.builtKey = '';
  }
}
