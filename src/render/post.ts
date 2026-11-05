// Post-processing: bloom (dual-filter chain), speed-based radial motion blur, ACES tonemap,
// grading, vignette, heat haze, lightning flash, raindrops on the lens, upscale sharpening.

import { GL, Program, Target } from './gl';
import { NOISE, PRELUDE } from './glsl';

const VS = PRELUDE + `
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const DOWN = PRELUDE + `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThreshold; uniform int uFirst; uniform vec2 uUvScale;
vec3 S(vec2 uv){ return texture(uTex, min(uv, vec2(1.0)) * uUvScale).rgb; }
void main(){
  vec2 t = uTexel;
  vec3 c = S(vUv) * 4.0 + S(vUv + vec2(-t.x, -t.y)) + S(vUv + vec2(t.x, -t.y)) + S(vUv + vec2(-t.x, t.y)) + S(vUv + vec2(t.x, t.y));
  c /= 8.0;
  if (uFirst == 1) {
    float l = max(max(c.r, c.g), c.b);
    float k = max(0.0, l - uThreshold) / max(l, 1e-4);
    c *= k;
    c = min(c, vec3(60.0));
  }
  o = vec4(c, 1.0);
}`;

const UP = PRELUDE + `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec2 t = uTexel * 0.5;
  vec3 c = texture(uTex, vUv + vec2(-t.x * 2.0, 0.0)).rgb + texture(uTex, vUv + vec2(t.x * 2.0, 0.0)).rgb
    + texture(uTex, vUv + vec2(0.0, -t.y * 2.0)).rgb + texture(uTex, vUv + vec2(0.0, t.y * 2.0)).rgb
    + (texture(uTex, vUv + vec2(-t.x, t.y)).rgb + texture(uTex, vUv + vec2(t.x, t.y)).rgb
    + texture(uTex, vUv + vec2(-t.x, -t.y)).rgb + texture(uTex, vUv + vec2(t.x, -t.y)).rgb) * 2.0;
  o = vec4(c / 12.0, 1.0);
}`;

const COMP = PRELUDE + NOISE + `
in vec2 vUv; out vec4 o;
uniform sampler2D uScene; uniform sampler2D uBloom;
uniform vec2 uScale; // render-scale uv multiplier
uniform vec2 uTexel;
uniform float uBloomK; uniform float uExposure; uniform float uSat; uniform float uContrast;
uniform vec3 uTint; uniform vec3 uLift; uniform float uVignette;
uniform vec4 uBlur[2]; // per viewport: centre.xy, amount, y-split
uniform vec4 uVp[2];   // viewport rects in uv (x,y,w,h)
uniform int uVpN;
uniform float uFlash; uniform float uHaze; uniform float uTime; uniform float uRainLens;
uniform float uSharpen; uniform float uFade; uniform vec3 uFadeC; uniform float uHit;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUv;
  int vi = 0;
  if (uVpN > 1 && uv.y < uVp[1].y + uVp[1].w) vi = 1;
  vec4 vp = uVp[vi];
  vec2 local = (uv - vp.xy) / vp.zw;
  // heat haze near the horizon
  if (uHaze > 0.0) {
    float band = smoothstep(0.35, 0.5, local.y) * smoothstep(0.62, 0.5, local.y);
    uv.x += (vnoise(vec2(uv.y * 80.0, uTime * 3.0)) - 0.5) * 0.004 * uHaze * band;
  }
  // raindrops on the lens
  if (uRainLens > 0.0) {
    vec2 g = uv * vec2(28.0, 16.0);
    vec2 cell = floor(g);
    float h = hash2(cell + floor(uTime * 0.7 + hash2(cell) * 10.0));
    vec2 c = fract(g) - vec2(0.5);
    float drop = smoothstep(0.32, 0.18, length(c * vec2(1.0, 1.3))) * step(0.9, h);
    uv += c * drop * 0.012 * uRainLens;
  }
  vec4 B = uBlur[vi];
  vec2 suv = uv * uScale;
  vec4 sc = texture(uScene, suv);
  vec3 col = sc.rgb;
  if (B.z > 0.001 && sc.a > 0.01) {
    vec2 ctr = (vp.xy + B.xy * vp.zw);
    vec2 dir = (uv - ctr);
    // per-pixel weight from the scene alpha: near surfaces streak, distant scenery and the sky stay sharp
    float m = smoothstep(0.08, 0.5, length(dir * vec2(1.6, 1.0))) * B.z * sc.a;
    vec3 acc = col; float wsum = 1.0;
    for (int i = 1; i < 9; i++) {
      float t = float(i) / 8.0;
      vec2 su = clamp(uv - dir * t * m * 0.095, vp.xy + uTexel, vp.xy + vp.zw - uTexel);
      acc += texture(uScene, su * uScale).rgb * (1.0 - t * 0.5);
      wsum += 1.0 - t * 0.5;
    }
    col = acc / wsum;
  }
  // light sharpen for upscaled frames
  if (uSharpen > 0.0) {
    vec2 t = uTexel * uScale;
    vec3 n = texture(uScene, suv + vec2(t.x, 0)).rgb + texture(uScene, suv - vec2(t.x, 0)).rgb + texture(uScene, suv + vec2(0, t.y)).rgb + texture(uScene, suv - vec2(0, t.y)).rgb;
    col = max(col + (col * 4.0 - n) * 0.12 * uSharpen, 0.0);
  }
  col += texture(uBloom, uv).rgb * uBloomK;
  col += vec3(0.7, 0.75, 0.9) * uFlash * 0.25;
  col *= uExposure;
  col = aces(col);
  // grading
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  col = col * uTint + uLift;
  // vignette per viewport
  vec2 q = local - 0.5;
  col *= 1.0 - uVignette * dot(q * vec2(1.0, 1.3), q * vec2(1.0, 1.3)) * 1.4;
  col = mix(col, vec3(1.0, 0.2, 0.1), uHit * 0.25 * smoothstep(0.2, 0.7, length(q)));
  col = clamp(col, 0.0, 1.0);
  col = pow(col, vec3(1.0 / 2.2));
  // dither
  col += (hash2(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) / 255.0;
  col = mix(col, uFadeC, uFade);
  o = vec4(col, 1.0);
}`;

export interface PostParams {
  bloom: number;
  exposure: number;
  sat: number;
  contrast: number;
  tint: number[];
  lift: number[];
  vignette: number;
  blur: number[][]; // [cx, cy, amount, 0] per viewport
  vps: number[][]; // [x,y,w,h] uv per viewport
  flash: number;
  haze: number;
  time: number;
  rainLens: number;
  sharpen: number;
  fade: number;
  fadeC: number[];
  hit: number;
  threshold: number;
}

export class Post {
  down: Program;
  up: Program;
  comp: Program;
  vao: WebGLVertexArrayObject;
  chain: Target[] = [];
  private gl: GL;
  constructor(gl: GL, private fmt: { internal: number; format: number; type: number }) {
    this.gl = gl;
    this.down = new Program(gl, VS, DOWN, 'bloomdown');
    this.up = new Program(gl, VS, UP, 'bloomup');
    this.comp = new Program(gl, VS, COMP, 'composite');
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    for (let i = 0; i < 6; i++) this.chain.push(new Target(gl, fmt.internal, fmt.format, fmt.type, false));
  }
  private tri(): void {
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }
  run(scene: Target, rw: number, rh: number, outW: number, outH: number, P: PostParams, levels: number): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    // bloom chain from the (possibly scaled) scene
    let w = Math.max(2, rw >> 1), h = Math.max(2, rh >> 1);
    let src: Target = scene;
    let srcW = scene.w, srcH = scene.h;
    const n = Math.max(1, Math.min(levels, this.chain.length));
    for (let i = 0; i < n; i++) {
      const t = this.chain[i];
      t.resize(w, h);
      t.bind();
      const p = this.down.use();
      p.tex('uTex', src.tex, 0).v2('uTexel', 1 / (i === 0 ? rw : srcW), 1 / (i === 0 ? rh : srcH)).f('uThreshold', P.threshold).i('uFirst', i === 0 ? 1 : 0);
      p.v2('uUvScale', i === 0 ? rw / scene.w : 1, i === 0 ? rh / scene.h : 1);
      this.tri();
      src = t;
      srcW = w;
      srcH = h;
      w = Math.max(2, w >> 1);
      h = Math.max(2, h >> 1);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = n - 1; i > 0; i--) {
      const dst = this.chain[i - 1];
      dst.bind();
      const p = this.up.use();
      p.tex('uTex', this.chain[i].tex, 0).v2('uTexel', 1 / this.chain[i].w, 1 / this.chain[i].h);
      this.tri();
    }
    gl.disable(gl.BLEND);
    // composite to the canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, outW, outH);
    const c = this.comp.use();
    c.tex('uScene', scene.tex, 0).tex('uBloom', this.chain[0].tex, 1);
    c.v2('uScale', rw / scene.w, rh / scene.h).v2('uTexel', 1 / outW, 1 / outH);
    c.f('uBloomK', P.bloom).f('uExposure', P.exposure).f('uSat', P.sat).f('uContrast', P.contrast).v3('uTint', P.tint).v3('uLift', P.lift).f('uVignette', P.vignette);
    const bl = new Float32Array(8), vp = new Float32Array(8);
    for (let i = 0; i < 2; i++) {
      const b = P.blur[i] || [0.5, 0.5, 0, 0];
      bl.set(b, i * 4);
      vp.set(P.vps[i] || [0, 0, 1, 1], i * 4);
    }
    c.v4a('uBlur', bl).v4a('uVp', vp).i('uVpN', P.vps.length);
    c.f('uFlash', P.flash).f('uHaze', P.haze).f('uTime', P.time).f('uRainLens', P.rainLens).f('uSharpen', P.sharpen);
    c.f('uFade', P.fade).v3('uFadeC', P.fadeC).f('uHit', P.hit);
    this.tri();
  }
}
