/**
 * GLSL for the post-processing chain. Every pass is a full-screen triangle with
 * `VERT`; scene depth always comes from the HDR scene target's depth texture
 * (no extra geometry pass: normals are rebuilt from depth derivatives).
 *
 * Compile-time `defines` select the sample counts so a pass is compiled once per
 * quality choice (done when settings change, never while riding).
 */

export const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** Shared depth / view-space helpers. */
export const DEPTH_LIB = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform vec2 uNearFar;
uniform vec2 uSize;
#define PI 3.14159265359
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float viewZ(float d) {
  float zn = d * 2.0 - 1.0;
  return 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - zn * (uNearFar.y - uNearFar.x));
}
vec3 viewPosAt(vec2 uv, float d) {
  vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
vec3 viewPosUv(vec2 uv) { return viewPosAt(uv, texture2D(tDepth, uv).r); }
// View-space normal from depth: use the smaller-difference neighbour on each axis to keep edges clean.
vec3 viewNormalAt(vec2 uv, vec3 P) {
  vec2 e = 1.0 / uSize;
  vec3 pl = viewPosUv(uv - vec2(e.x, 0.0));
  vec3 pr = viewPosUv(uv + vec2(e.x, 0.0));
  vec3 pd = viewPosUv(uv - vec2(0.0, e.y));
  vec3 pu = viewPosUv(uv + vec2(0.0, e.y));
  vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
  vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
  return normalize(cross(dx, dy));
}
`;

// ───────────────────────────── ambient occlusion ─────────────────────────────

/** AO_MODE: 0 SAO, 1 SSAO, 2 GTAO. GTAO_SLICES x GTAO_STEPS or AO_SAMPLES taps. */
export const AO_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uRadius;
uniform float uIntensity;
uniform float uProjScale;   // pixels per metre at distance 1
uniform float uFrame;
${DEPTH_LIB}

#if AO_MODE == 2
float gtao(vec2 uv, vec3 P, vec3 N, float n1, float n2) {
  vec3 V = normalize(-P);
  float radiusPx = clamp(uRadius * uProjScale / max(-P.z, 0.05), 3.0, 160.0);
  float falloffRange = 0.615 * uRadius;
  float falloffMul = -1.0 / falloffRange;
  float falloffAdd = (uRadius * (1.0 - 0.615)) / falloffRange + 1.0;
  float vis = 0.0;
  vec2 texel = 1.0 / uSize;
  for (int s = 0; s < GTAO_SLICES; s++) {
    float phi = (float(s) + n1) * PI / float(GTAO_SLICES);
    vec2 omega = vec2(cos(phi), sin(phi));
    vec3 dirV = vec3(omega, 0.0);
    vec3 ortho = dirV - dot(dirV, V) * V;
    vec3 axis = normalize(cross(ortho, V));
    vec3 projN = N - axis * dot(N, axis);
    float projLen = length(projN);
    float signN = sign(dot(ortho, projN));
    float cosN = clamp(dot(projN, V) / max(projLen, 1e-4), 0.0, 1.0);
    float nAng = signN * acos(cosN);
    float low0 = cos(nAng + 1.5707963);
    float low1 = cos(nAng - 1.5707963);
    float hc0 = low0;
    float hc1 = low1;
    for (int j = 0; j < GTAO_STEPS; j++) {
      float t = (float(j) + n2) / float(GTAO_STEPS);
      t *= t;
      vec2 off = omega * (t * radiusPx + 1.5) * texel;
      vec3 S0 = viewPosUv(uv + off);
      vec3 S1 = viewPosUv(uv - off);
      vec3 d0 = S0 - P;
      vec3 d1 = S1 - P;
      float l0 = length(d0);
      float l1 = length(d1);
      float c0 = dot(d0, V) / max(l0, 1e-4);
      float c1 = dot(d1, V) / max(l1, 1e-4);
      float w0 = clamp(l0 * falloffMul + falloffAdd, 0.0, 1.0);
      float w1 = clamp(l1 * falloffMul + falloffAdd, 0.0, 1.0);
      c0 = mix(low0, c0, w0);
      c1 = mix(low1, c1, w1);
      hc0 = max(hc0, c0);
      hc1 = max(hc1, c1);
    }
    float h0 = -acos(clamp(hc1, -1.0, 1.0));
    float h1 = acos(clamp(hc0, -1.0, 1.0));
    h0 = nAng + clamp(h0 - nAng, -1.5707963, 1.5707963);
    h1 = nAng + clamp(h1 - nAng, -1.5707963, 1.5707963);
    float arc0 = (cosN + 2.0 * h0 * sin(nAng) - cos(2.0 * h0 - nAng)) * 0.25;
    float arc1 = (cosN + 2.0 * h1 * sin(nAng) - cos(2.0 * h1 - nAng)) * 0.25;
    vis += projLen * (arc0 + arc1);
  }
  return clamp(vis / float(GTAO_SLICES), 0.0, 1.0);
}
#elif AO_MODE == 1
float ssao(vec2 uv, vec3 P, vec3 N, float n1, float n2) {
  vec3 rv = normalize(vec3(hash12(gl_FragCoord.xy + uFrame) * 2.0 - 1.0, n2 * 2.0 - 1.0, 0.0));
  vec3 T = normalize(rv - N * dot(rv, N));
  vec3 B = cross(N, T);
  float occ = 0.0;
  for (int i = 0; i < AO_SAMPLES; i++) {
    float fi = float(i) + n1;
    float a = fi * 2.399963;
    float h = (fi + 0.5) / float(AO_SAMPLES);
    float r = sqrt(h);
    vec3 k = vec3(cos(a) * r, sin(a) * r, sqrt(1.0 - h));
    float sc = mix(0.1, 1.0, h * h);
    vec3 S = P + (T * k.x + B * k.y + N * k.z) * uRadius * sc;
    vec4 pr = uProj * vec4(S, 1.0);
    vec2 suv = pr.xy / pr.w * 0.5 + 0.5;
    float sceneZ = -viewPosUv(suv).z;
    float range = smoothstep(0.0, 1.0, uRadius / max(abs(-P.z - sceneZ), 1e-4));
    occ += (sceneZ < -S.z - 0.02 * uRadius ? 1.0 : 0.0) * range;
  }
  return 1.0 - occ / float(AO_SAMPLES);
}
#else
float sao(vec2 uv, vec3 P, vec3 N, float n1) {
  float radiusPx = clamp(uRadius * uProjScale / max(-P.z, 0.05), 3.0, 200.0);
  float ang0 = n1 * 6.2831853;
  float sum = 0.0;
  float r2 = uRadius * uRadius;
  vec2 texel = 1.0 / uSize;
  for (int i = 0; i < AO_SAMPLES; i++) {
    float alpha = (float(i) + 0.5) / float(AO_SAMPLES);
    float h = alpha * radiusPx;
    float ang = alpha * 7.0 * 6.2831853 + ang0;
    vec3 Q = viewPosUv(uv + vec2(cos(ang), sin(ang)) * h * texel);
    vec3 v = Q - P;
    float vv = dot(v, v);
    float vn = dot(v, N) - 0.015 * -P.z;
    float f = max(r2 - vv, 0.0);
    sum += f * f * f * max(vn / (0.01 + vv), 0.0);
  }
  float r6 = r2 * r2 * r2;
  return clamp(1.0 - 4.0 * sum / (r6 * float(AO_SAMPLES)), 0.0, 1.0);
}
#endif

void main() {
  float d = texture2D(tDepth, vUv).r;
  if (d >= 1.0) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPosAt(vUv, d);
  vec3 N = viewNormalAt(vUv, P);
  float n1 = ign(gl_FragCoord.xy + uFrame * 5.588238);
  float n2 = ign(gl_FragCoord.yx * 1.3 + uFrame * 3.113);
  float ao;
#if AO_MODE == 2
  ao = gtao(vUv, P, N, n1, n2);
#elif AO_MODE == 1
  ao = ssao(vUv, P, N, n1, n2);
#else
  ao = sao(vUv, P, N, n1);
#endif
  gl_FragColor = vec4(pow(ao, uIntensity), 0.0, 0.0, 1.0);
}`;

/** Depth-aware separable blur of the AO term. */
export const AO_BLUR_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tAo;
uniform vec2 uDir;
${DEPTH_LIB}
void main() {
  float d0 = viewZ(texture2D(tDepth, vUv).r);
  vec2 texel = uDir / vec2(textureSize(tAo, 0));
  float sum = texture2D(tAo, vUv).r;
  float wsum = 1.0;
  for (int i = 1; i <= 3; i++) {
    float fi = float(i);
    for (int s = -1; s <= 1; s += 2) {
      vec2 uv = vUv + texel * fi * float(s);
      float dz = abs(viewZ(texture2D(tDepth, uv).r) - d0) / max(d0, 0.1);
      float w = exp(-fi * fi * 0.12) * exp(-dz * 60.0);
      sum += texture2D(tAo, uv).r * w;
      wsum += w;
    }
  }
  gl_FragColor = vec4(sum / wsum, 0.0, 0.0, 1.0);
}`;

/** Multiplies the HDR colour by the AO term, sparing bright (directly lit) pixels. */
export const AO_APPLY_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tAo;
uniform float uStrength;
void main() {
  vec4 c = texture2D(tColor, vUv);
  float ao = texture2D(tAo, vUv).r;
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  // Direct sun light is not occluded by screen-space AO: fade it out for bright pixels.
  float k = uStrength * (1.0 - smoothstep(0.6, 4.0, l) * 0.75);
  gl_FragColor = vec4(c.rgb * mix(1.0, ao, k), c.a);
}`;

// ───────────────────────────── screen-space reflections ─────────────────────────────

export const SSR_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec3 uUpView;     // world up expressed in view space
uniform float uWet;       // 0 dry .. 1 soaked
uniform float uMaxDist;
uniform float uFrame;
uniform float uIntensity;
${DEPTH_LIB}

void main() {
  float d = texture2D(tDepth, vUv).r;
  gl_FragColor = vec4(0.0);
  if (d >= 1.0) return;
  vec3 P = viewPosAt(vUv, d);
  vec3 N = viewNormalAt(vUv, P);
  vec3 V = normalize(P);
  float NdotV = clamp(dot(N, -V), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - NdotV, 5.0);
  float up = dot(N, uUpView);
  // Horizontal surfaces (roads, puddles, bonnets) mirror the world; everything else only at grazing angles.
  float horiz = smoothstep(0.82, 0.96, up);
  float gloss = mix(0.12, 1.0, uWet);
  float strength = mix(0.18, 1.0, horiz) * gloss * fres * uIntensity;
  if (strength < 0.01) return;
  vec3 R = reflect(V, N);
  if (R.z > 0.15) return;
  float jitter = ign(gl_FragCoord.xy + uFrame * 7.13);
  float stepLen = uMaxDist / float(SSR_STEPS);
  vec3 ray = P + N * 0.02;
  vec3 prev = ray;
  vec2 hitUv = vec2(-1.0);
  float hit = 0.0;
  float travelled = 0.0;
  for (int i = 0; i < SSR_STEPS; i++) {
    float sl = stepLen * (0.35 + float(i) * 0.075) * (0.75 + jitter * 0.5);
    prev = ray;
    ray += R * sl;
    travelled += sl;
    vec4 pr = uProj * vec4(ray, 1.0);
    if (pr.w <= 0.0) break;
    vec2 ruv = pr.xy / pr.w * 0.5 + 0.5;
    if (ruv.x < 0.0 || ruv.x > 1.0 || ruv.y < 0.0 || ruv.y > 1.0) break;
    float sd = texture2D(tDepth, ruv).r;
    if (sd >= 1.0) continue;
    float diff = -ray.z - viewZ(sd);
    float thick = 0.12 + (-ray.z) * 0.035 + sl * 0.8;
    if (diff > 0.0 && diff < thick) {
      // Binary refinement between the last outside point and the first inside point.
      vec3 a = prev;
      vec3 b = ray;
      for (int k = 0; k < 6; k++) {
        vec3 m = (a + b) * 0.5;
        vec4 pm = uProj * vec4(m, 1.0);
        vec2 muv = pm.xy / pm.w * 0.5 + 0.5;
        float md = texture2D(tDepth, muv).r;
        if (-m.z > viewZ(md)) b = m; else a = m;
      }
      vec4 ph = uProj * vec4(b, 1.0);
      hitUv = ph.xy / ph.w * 0.5 + 0.5;
      hit = 1.0;
      break;
    }
  }
  if (hit < 0.5) return;
  vec2 e = abs(hitUv - 0.5) * 2.0;
  float edge = 1.0 - smoothstep(0.75, 1.0, max(e.x, e.y));
  float distFade = 1.0 - smoothstep(0.55, 1.0, travelled / uMaxDist);
  // Reflection blur grows with the distance travelled and with dryness (rough surfaces).
  float rough = mix(0.85, 0.06, uWet);
  float blurPx = clamp(travelled * rough * 1.6, 0.0, 14.0);
  vec2 texel = 1.0 / uSize;
  vec3 col = texture2D(tColor, hitUv).rgb * 0.36;
  for (int k = 0; k < 4; k++) {
    float a = (float(k) + jitter) * 1.5707963 + 0.7;
    col += texture2D(tColor, hitUv + vec2(cos(a), sin(a)) * blurPx * texel).rgb * 0.16;
  }
  col = min(col, vec3(24.0));
  gl_FragColor = vec4(col, clamp(strength * edge * distFade, 0.0, 1.0));
}`;

export const SSR_COMBINE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tSsr;
void main() {
  vec4 c = texture2D(tColor, vUv);
  vec4 r = texture2D(tSsr, vUv);
  gl_FragColor = vec4(mix(c.rgb, r.rgb, r.a), c.a);
}`;

// ───────────────────────────── volumetric fog & light shafts ─────────────────────────────

export const VOL_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec3 uSunDir;       // direction towards the sun (world)
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform vec2 uSunUv;
uniform float uSunFacing;   // 0..1 how much the camera looks towards the sun
uniform float uDensity;     // extinction per metre at ground level
uniform float uHeightFalloff;
uniform float uFogBase;     // world height of the dense layer
uniform float uMaxDist;
uniform float uTime;
uniform float uRays;        // god-ray intensity
uniform float uFogOn;
uniform float uFrame;
${DEPTH_LIB}

float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  float n000 = hash12(i.xy + i.z * 17.0);
  float n100 = hash12(i.xy + vec2(1.0, 0.0) + i.z * 17.0);
  float n010 = hash12(i.xy + vec2(0.0, 1.0) + i.z * 17.0);
  float n110 = hash12(i.xy + vec2(1.0, 1.0) + i.z * 17.0);
  float n001 = hash12(i.xy + (i.z + 1.0) * 17.0);
  float n101 = hash12(i.xy + vec2(1.0, 0.0) + (i.z + 1.0) * 17.0);
  float n011 = hash12(i.xy + vec2(0.0, 1.0) + (i.z + 1.0) * 17.0);
  float n111 = hash12(i.xy + vec2(1.0, 1.0) + (i.z + 1.0) * 17.0);
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

void main() {
  float d = texture2D(tDepth, vUv).r;
  vec4 w = uInvViewProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 wp = w.xyz / w.w;
  vec3 rd = wp - uCamPos;
  float dist = length(rd);
  rd /= max(dist, 1e-4);
  if (d >= 1.0) dist = uMaxDist;
  dist = min(dist, uMaxDist);
  float cosSun = dot(rd, uSunDir);
  vec3 scatter = vec3(0.0);
  float T = 1.0;
  if (uFogOn > 0.5) {
    float jitter = ign(gl_FragCoord.xy + uFrame * 3.7);
    float stepLen = dist / float(FOG_STEPS);
    float phase = mix(0.25 / PI, hg(cosSun, 0.62), 0.75);
    for (int i = 0; i < FOG_STEPS; i++) {
      float t = (float(i) + jitter) * stepLen;
      vec3 p = uCamPos + rd * t;
      float h = max(p.y - uFogBase, 0.0);
      float dens = uDensity * exp(-h * uHeightFalloff);
      dens *= 0.55 + 0.9 * vnoise(p * 0.035 + vec3(uTime * 0.6, 0.0, uTime * 0.35));
      float ext = dens * stepLen;
      float absorb = exp(-ext);
      vec3 inS = uSunColor * phase * 3.0 + uFogColor;
      scatter += T * inS * (1.0 - absorb);
      T *= absorb;
    }
  }
  // Radial light shafts: march from this pixel towards the sun through the sky mask.
  vec3 shafts = vec3(0.0);
  if (uRays > 0.0 && uSunFacing > 0.0) {
    vec2 delta = (uSunUv - vUv) / float(RAY_SAMPLES) * 0.92;
    vec2 uv = vUv + delta * ign(gl_FragCoord.xy);
    float decay = 1.0;
    float acc = 0.0;
    for (int i = 0; i < RAY_SAMPLES; i++) {
      uv += delta;
      float sd = texture2D(tDepth, uv).r;
      // Sky pixels are the light source; geometry blocks it.
      acc += (sd >= 1.0 ? 1.0 : 0.0) * decay;
      decay *= 0.985;
    }
    acc /= float(RAY_SAMPLES);
    float toSun = 1.0 - smoothstep(0.0, 1.1, length((vUv - uSunUv) * vec2(uSize.x / uSize.y, 1.0)));
    shafts = uSunColor * acc * uRays * uSunFacing * (0.25 + toSun * 0.75) * (d >= 1.0 ? 0.35 : 1.0);
  }
  gl_FragColor = vec4(scatter + shafts, T);
}`;

export const VOL_COMBINE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tVol;
void main() {
  vec4 c = texture2D(tColor, vUv);
  vec4 v = texture2D(tVol, vUv);
  gl_FragColor = vec4(c.rgb * v.a + v.rgb, c.a);
}`;

/** One-texel visibility of the sun disc: fraction of depth taps around it that show sky. */
export const SUNVIS_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDepth;
uniform vec2 uSunUv;
uniform float uOnScreen;
void main() {
  float vis = 0.0;
  for (int y = -3; y <= 3; y++) {
    for (int x = -3; x <= 3; x++) {
      vec2 uv = uSunUv + vec2(float(x), float(y)) * 0.006;
      float inside = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? 1.0 : 0.0;
      vis += (texture2D(tDepth, clamp(uv, 0.0, 1.0)).r >= 1.0 ? 1.0 : 0.0) * inside;
    }
  }
  gl_FragColor = vec4(vis / 49.0 * uOnScreen, 0.0, 0.0, 1.0);
}`;

// ───────────────────────────── temporal anti-aliasing ─────────────────────────────

export const TAA_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tHistory;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform float uFeedback;
uniform float uNearStatic;   // view distance below which pixels belong to the cockpit
uniform float uHistoryValid;
uniform vec2 uJitter;        // current sub-pixel jitter in pixels
${DEPTH_LIB}

vec3 toWork(vec3 c) { return c / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
vec3 fromWork(vec3 c) { return c / max(1.0 - dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.02); }

// Catmull-Rom history fetch (5 bilinear taps) keeps the image sharp across frames.
vec3 sampleHistory(vec2 uv) {
  vec2 size = uSize;
  vec2 pos = uv * size;
  vec2 c = floor(pos - 0.5) + 0.5;
  vec2 f = pos - c;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t12 = w2 / w12;
  vec2 p0 = (c - 1.0) / size;
  vec2 p3 = (c + 2.0) / size;
  vec2 p12 = (c + t12) / size;
  vec3 r = vec3(0.0);
  r += texture2D(tHistory, vec2(p12.x, p0.y)).rgb * (w12.x * w0.y);
  r += texture2D(tHistory, vec2(p0.x, p12.y)).rgb * (w0.x * w12.y);
  r += texture2D(tHistory, vec2(p12.x, p12.y)).rgb * (w12.x * w12.y);
  r += texture2D(tHistory, vec2(p3.x, p12.y)).rgb * (w3.x * w12.y);
  r += texture2D(tHistory, vec2(p12.x, p3.y)).rgb * (w12.x * w3.y);
  return max(r, vec3(0.0));
}

void main() {
  vec2 texel = 1.0 / uSize;
  vec3 cur = texture2D(tColor, vUv).rgb;
  // Nearest depth in the 3x3 neighbourhood: thin geometry then reprojects like its silhouette.
  float dMin = 1.0;
  vec2 dUv = vUv;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 uv = vUv + vec2(float(x), float(y)) * texel;
    float dd = texture2D(tDepth, uv).r;
    if (dd < dMin) { dMin = dd; dUv = uv; }
  }
  vec4 wp = uInvViewProj * vec4(vUv * 2.0 - 1.0, dMin * 2.0 - 1.0, 1.0);
  wp /= wp.w;
  vec4 pp = uPrevViewProj * wp;
  vec2 prevUv = pp.xy / pp.w * 0.5 + 0.5;
  // Cockpit geometry rides with the camera: it did not move relative to the view.
  if (dMin < 1.0 && viewZ(dMin) < uNearStatic) prevUv = vUv;
  // Moments of the current colour neighbourhood (variance clipping).
  vec3 m1 = vec3(0.0);
  vec3 m2 = vec3(0.0);
  vec3 cMin = vec3(1e5);
  vec3 cMax = vec3(-1e5);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 s = toWork(texture2D(tColor, vUv + vec2(float(x), float(y)) * texel).rgb);
    m1 += s; m2 += s * s;
    cMin = min(cMin, s); cMax = max(cMax, s);
  }
  m1 /= 9.0; m2 /= 9.0;
  vec3 sigma = sqrt(max(m2 - m1 * m1, vec3(0.0)));
  vec3 lo = max(m1 - sigma * 1.25, cMin);
  vec3 hi = min(m1 + sigma * 1.25, cMax);
  bool inside = prevUv.x > 0.0 && prevUv.x < 1.0 && prevUv.y > 0.0 && prevUv.y < 1.0;
  if (!inside || uHistoryValid < 0.5) {
    gl_FragColor = vec4(cur, 1.0);
    return;
  }
  vec3 hist = toWork(sampleHistory(prevUv));
  // Clip towards the neighbourhood centre rather than clamping per channel (less colour shift).
  vec3 centre = (lo + hi) * 0.5;
  vec3 ext = (hi - lo) * 0.5 + 1e-4;
  vec3 v = hist - centre;
  vec3 a = abs(v / ext);
  float mx = max(a.x, max(a.y, a.z));
  if (mx > 1.0) hist = centre + v / mx;
  vec3 curW = toWork(cur);
  // Faster reaction where the pixel moved a lot, or where history and current disagree.
  float vel = length((prevUv - vUv) * uSize);
  float diff = length(hist - curW) / (dot(curW, vec3(0.333)) + 0.2);
  float fb = uFeedback * (1.0 - smoothstep(0.5, 8.0, vel) * 0.55) * (1.0 - clamp(diff * 0.5, 0.0, 0.5));
  vec3 outW = mix(curW, hist, fb);
  gl_FragColor = vec4(fromWork(outW), 1.0);
}`;

// ───────────────────────────── bloom (dual filter) ─────────────────────────────

export const BLOOM_PREFILTER_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
vec3 prefilter(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  return c * contrib;
}
float kw(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
void main() {
  // 13-tap downsample with Karis averaging of the five groups to suppress fireflies.
  vec3 a = texture2D(tSrc, vUv + uTexel * vec2(-2.0, -2.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + uTexel * vec2(0.0, -2.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(2.0, -2.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 0.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 f = texture2D(tSrc, vUv + uTexel * vec2(2.0, 0.0)).rgb;
  vec3 g = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 2.0)).rgb;
  vec3 h = texture2D(tSrc, vUv + uTexel * vec2(0.0, 2.0)).rgb;
  vec3 i = texture2D(tSrc, vUv + uTexel * vec2(2.0, 2.0)).rgb;
  vec3 j = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 k = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  vec3 l = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  vec3 m = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  vec3 g0 = (a + b + d + e) * 0.25;
  vec3 g1 = (b + c + e + f) * 0.25;
  vec3 g2 = (d + e + g + h) * 0.25;
  vec3 g3 = (e + f + h + i) * 0.25;
  vec3 g4 = (j + k + l + m) * 0.25;
  float w0 = kw(g0) * 0.125;
  float w1 = kw(g1) * 0.125;
  float w2 = kw(g2) * 0.125;
  float w3 = kw(g3) * 0.125;
  float w4 = kw(g4) * 0.5;
  vec3 s = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  gl_FragColor = vec4(prefilter(s), 1.0);
}`;

export const BLOOM_DOWN_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
void main() {
  vec3 a = texture2D(tSrc, vUv + uTexel * vec2(-2.0, -2.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + uTexel * vec2(0.0, -2.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(2.0, -2.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 0.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 f = texture2D(tSrc, vUv + uTexel * vec2(2.0, 0.0)).rgb;
  vec3 g = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 2.0)).rgb;
  vec3 h = texture2D(tSrc, vUv + uTexel * vec2(0.0, 2.0)).rgb;
  vec3 i = texture2D(tSrc, vUv + uTexel * vec2(2.0, 2.0)).rgb;
  vec3 j = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 k = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  vec3 l = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  vec3 m = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  vec3 o = e * 0.125;
  o += (a + c + g + i) * 0.03125;
  o += (b + d + f + h) * 0.0625;
  o += (j + k + l + m) * 0.125;
  gl_FragColor = vec4(o, 1.0);
}`;

export const BLOOM_UP_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;     // lower (smaller) mip
uniform sampler2D tBase;    // this mip's own downsampled content
uniform vec2 uTexel;        // texel of the lower mip
uniform float uRadius;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb;
  s += texture2D(tSrc, vUv + vec2(0.0, -t.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb;
  s += texture2D(tSrc, vUv + vec2(-t.x, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb;
  s += texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(t.x, t.y)).rgb;
  gl_FragColor = vec4(s / 16.0 + texture2D(tBase, vUv).rgb, 1.0);
}`;

// ───────────────────────────── depth of field ─────────────────────────────

export const DOF_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform float uFocus;      // metres
uniform float uAperture;   // blur radius in pixels at one metre defocus per metre of range
uniform float uMaxBlur;    // px
${DEPTH_LIB}

float coc(float depth) {
  float z = depth >= 1.0 ? 4000.0 : viewZ(depth);
  return clamp((z - uFocus) / z * uAperture * uFocus, -uMaxBlur, uMaxBlur);
}

void main() {
  float c0 = coc(texture2D(tDepth, vUv).r);
  float r0 = abs(c0);
  if (r0 < 0.6) { gl_FragColor = texture2D(tColor, vUv); return; }
  vec2 texel = 1.0 / uSize;
  vec3 acc = texture2D(tColor, vUv).rgb;
  float wsum = 1.0;
  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  for (int i = 1; i < DOF_SAMPLES; i++) {
    float fi = float(i);
    float a = fi * 2.399963 + rot;
    float r = sqrt(fi / float(DOF_SAMPLES));
    vec2 off = vec2(cos(a), sin(a)) * r * r0;
    vec2 uv = vUv + off * texel;
    float cs = abs(coc(texture2D(tDepth, uv).r));
    // A neighbour only contributes if its own blur disc reaches this pixel (no sharp halos on blurred areas).
    float w = smoothstep(r * r0 - 1.0, r * r0 + 1.0, cs) ;
    // Foreground bleeds over the background; background does not bleed over a sharp foreground.
    vec3 s = texture2D(tColor, uv).rgb;
    float lum = dot(s, vec3(0.333));
    w *= 1.0 + lum * 0.15;
    acc += s * w;
    wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}`;

// ───────────────────────────── per-pixel camera motion blur ─────────────────────────────

export const MOTION_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform float uScale;        // fraction of the per-frame motion that is blurred (shutter / frame time)
uniform float uMaxPx;
uniform float uNearStatic;
${DEPTH_LIB}
void main() {
  float d = texture2D(tDepth, vUv).r;
  vec4 wp = uInvViewProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  wp /= wp.w;
  vec4 pp = uPrevViewProj * wp;
  vec2 prevUv = pp.xy / pp.w * 0.5 + 0.5;
  if (d < 1.0 && viewZ(d) < uNearStatic) prevUv = vUv;
  vec2 vel = (vUv - prevUv) * uScale;
  vec2 px = vel * uSize;
  float len = length(px);
  if (len < 0.75) { gl_FragColor = texture2D(tColor, vUv); return; }
  if (len > uMaxPx) vel *= uMaxPx / len;
  float jitter = ign(gl_FragCoord.xy) - 0.5;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < MB_SAMPLES; i++) {
    float t = (float(i) + 0.5 + jitter) / float(MB_SAMPLES) - 0.5;
    vec2 uv = vUv + vel * t;
    // Do not smear the near cockpit over the world or the other way round.
    float sd = texture2D(tDepth, uv).r;
    float w = (sd < 1.0 && viewZ(sd) < uNearStatic) != (d < 1.0 && viewZ(d) < uNearStatic) ? 0.0 : 1.0;
    acc += texture2D(tColor, uv).rgb * w;
    wsum += w;
  }
  vec3 outC = wsum > 0.0 ? acc / wsum : texture2D(tColor, vUv).rgb;
  gl_FragColor = vec4(outC, 1.0);
}`;

// ───────────────────────────── composite: tone map, grading, lens ─────────────────────────────

export const COMPOSITE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform sampler2D tDirt;
uniform sampler2D tSunVis;
uniform sampler3D tLut;
uniform vec2 uSize;
uniform float uTime;
uniform int uToneMap;
uniform float uBloom;
uniform float uDirt;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uLutStrength;
uniform float uSpeedBlur;
uniform float uAberration;
uniform float uVignette;
uniform float uGrain;
uniform float uDesat;
uniform float uFlash;
uniform vec3 uTint;
uniform float uHeat;
uniform float uRain;
uniform vec2 uSunUv;
uniform vec3 uSunColor;
uniform float uFlare;
uniform vec2 uFlareAspect;
uniform float uDither;
#include <tonemapping_pars_fragment>

vec3 linearToSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float vnoise(vec2 x) {
  vec2 i = floor(x); vec2 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}

vec3 toneMap(vec3 c) {
  if (uToneMap == 0) return ACESFilmicToneMapping(c);
  if (uToneMap == 1) return AgXToneMapping(c);
  if (uToneMap == 2) return NeutralToneMapping(c);
  if (uToneMap == 3) return ReinhardToneMapping(c);
  if (uToneMap == 4) return CineonToneMapping(c);
  return LinearToneMapping(c);
}

// Water drops on the helmet visor: refraction offset (xy) and mask (z).
vec3 visorDrops(vec2 uv, float t) {
  vec2 asp = vec2(uSize.x / uSize.y, 1.0);
  vec3 res = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float cells = 7.0 + float(layer) * 6.0;
    vec2 p = uv * asp * cells + vec2(float(layer) * 17.3, 0.0);
    // Wind drags drops slowly across the visor.
    p.y += t * (0.05 + 0.03 * float(layer));
    vec2 id = floor(p);
    vec2 f = fract(p) - 0.5;
    float h = hash12(id + float(layer) * 31.7);
    vec2 c = (vec2(hash12(id + 4.1), hash12(id + 9.7)) - 0.5) * 0.55;
    float life = fract(h * 7.0 + t * (0.03 + 0.02 * hash12(id)));
    float grow = smoothstep(0.0, 0.25, life) * (1.0 - smoothstep(0.82, 1.0, life));
    float r = (0.05 + 0.2 * hash12(id + 2.2)) * grow;
    float present = step(1.0 - uRain * 0.75, hash12(id + 11.1));
    vec2 dv = f - c;
    float dd = length(dv);
    float m = smoothstep(r, r * 0.55, dd) * present;
    // Lens-like offset: image is displaced opposite to the drop's local slope.
    res.xy += -dv / max(r, 1e-3) * m * 0.7;
    res.z = max(res.z, m);
  }
  return res;
}

vec3 flareColor(vec2 uv) {
  vec2 asp = uFlareAspect;
  vec2 axis = vec2(0.5) - uSunUv;
  vec3 acc = vec3(0.0);
  float ghostT[5] = float[5](0.35, 0.7, 1.15, 1.6, 2.1);
  float ghostR[5] = float[5](0.05, 0.09, 0.035, 0.12, 0.06);
  vec3 ghostC[5] = vec3[5](vec3(1.0, 0.7, 0.4), vec3(0.4, 0.8, 1.0), vec3(0.9, 0.5, 1.0), vec3(0.5, 1.0, 0.7), vec3(1.0, 0.6, 0.5));
  for (int i = 0; i < 5; i++) {
    vec2 gp = uSunUv + axis * ghostT[i];
    float dd = length((uv - gp) * asp);
    acc += ghostC[i] * smoothstep(ghostR[i], ghostR[i] * 0.15, dd) * 0.11;
  }
  // Halo ring on the sun-to-centre axis and a soft glare with an anamorphic streak.
  float ringR = length(axis * asp) * 0.55;
  float dRing = abs(length((uv - (uSunUv + axis * 0.55)) * asp) - ringR * 0.9);
  acc += vec3(0.7, 0.85, 1.0) * smoothstep(0.012, 0.0, dRing) * 0.05;
  vec2 sd = (uv - uSunUv) * asp;
  float glare = exp(-length(sd) * 14.0) * 0.5 + exp(-length(sd) * 4.0) * 0.12;
  float streak = exp(-abs(sd.y) * 90.0) * exp(-abs(sd.x) * 3.2) * 0.45;
  acc += vec3(1.0, 0.95, 0.85) * (glare + streak);
  return acc * uSunColor;
}

void main() {
  vec2 uv = vUv;
  vec2 dir = uv - vec2(0.5, 0.56);
  float dist = length(dir);
  // Heat shimmer rising from the asphalt towards the horizon.
  if (uHeat > 0.0) {
    float band = smoothstep(0.62, 0.42, abs(uv.y - 0.5) * 2.0 + 0.1) * smoothstep(0.2, 0.5, uv.y);
    float n = vnoise(vec2(uv.x * 55.0, uv.y * 36.0 - uTime * 1.8)) - 0.5;
    uv += vec2(n * 0.0035, n * 0.0015) * uHeat * band;
  }
  vec3 drop = vec3(0.0);
  if (uRain > 0.0) {
    drop = visorDrops(uv, uTime);
    uv += drop.xy * 0.03 * uRain;
  }
  // Radial speed blur (centred slightly below the horizon).
  vec3 col;
  float amt = uSpeedBlur * smoothstep(0.12, 0.8, dist);
  if (amt > 0.002) {
    col = vec3(0.0);
    float tw = 0.0;
    for (int i = 0; i < 10; i++) {
      float t = float(i) / 9.0;
      float w = 1.0 - t * 0.55;
      col += texture2D(tColor, uv - dir * amt * t * 0.085).rgb * w;
      tw += w;
    }
    col /= tw;
  } else {
    col = texture2D(tColor, uv).rgb;
  }
  if (uAberration > 0.0) {
    float a = uAberration * dist * 0.012;
    col.r = mix(col.r, texture2D(tColor, uv + dir * a).r, 0.65);
    col.b = mix(col.b, texture2D(tColor, uv - dir * a).b, 0.65);
  }
  // Bloom + dirt on the visor.
  vec3 bloom = texture2D(tBloom, uv).rgb * uBloom;
  if (uDirt > 0.0) {
    float dirt = texture2D(tDirt, uv).r;
    bloom *= 1.0 + dirt * uDirt * 5.0;
    col += bloom * (1.0 + 0.0) + texture2D(tBloom, uv).rgb * dirt * uDirt * 0.5;
  } else {
    col += bloom;
  }
  if (uFlare > 0.0) {
    float vis = texture2D(tSunVis, vec2(0.5)).r;
    if (vis > 0.001) col += flareColor(uv) * vis * uFlare;
  }
  // HDR → display. Exposure is baked into the tone mapper through toneMappingExposure.
  col = toneMap(col);
  col = linearToSrgb(col);
  // Grading in display space.
  if (uLutStrength > 0.0) {
    vec3 lc = texture(tLut, clamp(col, 0.0, 1.0) * (31.0 / 32.0) + 0.5 / 32.0).rgb;
    col = mix(col, lc, uLutStrength);
  }
  col = (col - 0.5) * uContrast + 0.5;
  col = pow(max(col, vec3(0.0)), vec3(1.0 / max(uBrightness, 0.05)));
  float g = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(g), col, uSaturation);
  col = mix(col, vec3(g), uDesat);
  // Visor water: slight darkening and a bright rim sells the lens effect.
  if (uRain > 0.0) col = mix(col, col * 0.88 + 0.03 * drop.z, drop.z * uRain * 0.6);
  float vig = smoothstep(1.05, 0.28, dist * (1.0 + uVignette * 0.5));
  col *= mix(1.0, vig, clamp(0.35 + uVignette * 0.5, 0.0, 1.0));
  col += uTint * dist * dist;
  col += vec3(uFlash);
  if (uGrain > 0.0) {
    float n = hash12(gl_FragCoord.xy + fract(uTime) * 413.0) - 0.5;
    col += n * uGrain * 0.3 * (0.3 + 0.7 * (1.0 - g));
  }
  // Triangular dither hides 8-bit banding in smooth gradients (dark skies, fog).
  float dn = hash12(gl_FragCoord.xy * 1.37 + uTime) + hash12(gl_FragCoord.yx * 0.73 - uTime) - 1.0;
  col += dn * uDither / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ───────────────────────────── final output ─────────────────────────────

export const OUTPUT_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 uSrcSize;
uniform float uSharpen;
uniform float uSuperSample;   // internal / output scale (>1 = downsampling)
uniform float uDither;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 fetch(vec2 uv) { return texture2D(tColor, uv).rgb; }
void main() {
  vec2 texel = 1.0 / uSrcSize;
  vec3 c;
  if (uSuperSample > 1.05) {
    // Wide tent over the output pixel's footprint in the supersampled image.
    float s = uSuperSample * 0.5;
    c = vec3(0.0);
    float ws = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      float w = (1.0 - abs(o.x) * 0.35) * (1.0 - abs(o.y) * 0.35);
      c += fetch(vUv + o * texel * s) * w;
      ws += w;
    }
    c /= ws;
  } else {
    c = fetch(vUv);
  }
  if (uSharpen > 0.0) {
    // Contrast adaptive sharpening (AMD CAS, cross pattern).
    vec3 a = fetch(vUv + vec2(0.0, -texel.y));
    vec3 b = fetch(vUv + vec2(-texel.x, 0.0));
    vec3 d = fetch(vUv + vec2(texel.x, 0.0));
    vec3 e = fetch(vUv + vec2(0.0, texel.y));
    vec3 mn = min(min(min(a, b), min(d, e)), c);
    vec3 mx = max(max(max(a, b), max(d, e)), c);
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
    float peak = -1.0 / mix(8.0, 5.0, uSharpen);
    vec3 wgt = amp * peak;
    c = clamp((c + (a + b + d + e) * wgt) / (1.0 + 4.0 * wgt), 0.0, 1.0);
  }
  float dn = hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.yx + 17.0) - 1.0;
  c += dn * uDither / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

export const COPY_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
void main() { gl_FragColor = vec4(texture2D(tColor, vUv).rgb, 1.0); }`;
