// Particles (spray, dust, snow, smoke, sparks, debris), light glows with wet-road reflections,
// and weather volumes (rain, snow, blowing debris) around the camera.

import { GL, Program } from './gl';
import { NOISE, PATH, PRELUDE } from './glsl';

export const enum PT { DUST, WATER, SNOW, MUD, SAND, SMOKE, GRASS, SPARK, LEAF, CONE }

const PCOL: number[][] = [
  [0.62, 0.48, 0.32, 0.34], // dust
  [0.85, 0.88, 0.92, 0.3], // water
  [0.95, 0.97, 1.0, 0.5], // snow
  [0.3, 0.22, 0.13, 0.75], // mud
  [0.85, 0.66, 0.42, 0.36], // sand
  [0.6, 0.6, 0.62, 0.35], // smoke
  [0.3, 0.5, 0.15, 0.9], // grass bits
  [1.0, 0.6, 0.2, 1.0], // spark (additive)
  [0.55, 0.4, 0.12, 0.95], // leaf
  [1.0, 0.4, 0.05, 1.0], // cone bits
];

const MAXP = 6000;

const P_VS = PRELUDE + NOISE + PATH + `
layout(location=0) in vec2 aQ;
layout(location=1) in vec4 iP; // d, u, h, size
layout(location=2) in vec4 iC; // rgb, alpha
layout(location=3) in vec2 iX; // rot, kind
uniform mat4 uViewProj; uniform vec3 uCamR; uniform vec3 uCamU;
out vec2 vQ; out vec4 vC; out vec3 vW; out float vK; out float vS;
void main(){
  PathS p = pathAt(iP.x);
  vec3 c = bentPos(p, iP.y, iP.z);
  float r = iX.x, cr = cos(r), sr = sin(r);
  vec2 q = vec2(aQ.x * cr - aQ.y * sr, aQ.x * sr + aQ.y * cr);
  vec3 w = c + (uCamR * q.x + uCamU * q.y) * iP.w;
  vQ = aQ; vC = iC; vW = w; vK = iX.y; vS = iP.w;
  gl_Position = uViewProj * vec4(w, 1.0);
}`;
const P_FS = PRELUDE + NOISE + `
in vec2 vQ; in vec4 vC; in vec3 vW; in float vK; in float vS;
out vec4 o;
uniform vec3 uAmb; uniform vec3 uSunC; uniform vec3 uFogC; uniform vec4 uFog; uniform vec3 uCamPos;
void main(){
  float r = length(vQ);
  if (r > 1.0) discard;
  int k = int(vK + 0.5);
  float a;
  if (k == 6 || k == 8 || k == 9) a = step(r, 0.7); // solid bits
  else a = (1.0 - r * r) * (0.75 + 0.25 * vnoise(vQ * 3.0 + vW.xz));
  float dist = length(vW - uCamPos);
  a *= smoothstep(1.2, 5.0, dist); // particles brushing the lens fade instead of filling the view
  // soft puffs that would cover a big part of the screen thin out, so a cloud just ahead stays see-through
  if (k != 6 && k != 8 && k != 9 && k != 7) a *= smoothstep(1.2, 6.0, dist / max(vS, 0.05));
  vec3 lit = vC.rgb * (uAmb * 1.2 + uSunC * 0.35);
  if (k == 7) { o = vec4(vC.rgb * 6.0 * a, 0.0); return; }
  float f = 1.0 - exp(-dist * uFog.x);
  lit = mix(lit, uFogC, min(f, uFog.w));
  o = vec4(lit * a * vC.a, a * vC.a);
}`;

const G_VS = PRELUDE + `
layout(location=0) in vec2 aQ;
layout(location=1) in vec4 iP; // world xyz, size
layout(location=2) in vec4 iC; // rgb intensity, stretch
uniform mat4 uViewProj; uniform vec3 uCamR; uniform vec3 uCamU;
out vec2 vQ; out vec3 vC;
void main(){
  // stretch > 0 elongates vertically (wet-road streaks), < 0 horizontally (light bars)
  vec2 sc = iC.w >= 0.0 ? vec2(1.0, iC.w) : vec2(-iC.w, 1.0);
  vec3 w = iP.xyz + (uCamR * aQ.x * sc.x + uCamU * aQ.y * sc.y) * iP.w;
  vQ = aQ; vC = iC.rgb;
  gl_Position = uViewProj * vec4(w, 1.0);
}`;
const G_FS = PRELUDE + `
in vec2 vQ; in vec3 vC; out vec4 o;
void main(){ float r = length(vQ); float a = exp(-r * r * 5.0) + exp(-r * 18.0) * 0.6; o = vec4(vC * a, 0.0); }`;

// weather: streaks/flakes in a box around the camera, animated entirely in the shader
const W_VS = PRELUDE + NOISE + `
layout(location=0) in vec3 aSeed; // random 0..1 x3
layout(location=1) in float aEnd; // 0 tail, 1 head
uniform mat4 uViewProj; uniform vec3 uCamPos; uniform float uTime; uniform vec3 uVel; uniform int uKind; uniform float uBox; uniform vec3 uWindV; uniform float uPtScale;
out float vA; out float vEnd;
void main(){
  vec3 box = vec3(uBox, uBox * 0.6, uBox);
  vec3 fall = uKind == 0 ? vec3(0.0, -22.0, 0.0) : uKind == 1 ? vec3(0.0, -2.2, 0.0) : vec3(0.0, -0.6, 0.0);
  fall += uWindV * (uKind == 0 ? 0.25 : 1.0);
  vec3 drift = -uVel;
  vec3 pos = aSeed * box * 2.0 + (fall + drift) * uTime;
  if (uKind == 1) pos.x += sin(uTime * 1.3 + aSeed.y * 30.0) * 0.6;
  if (uKind == 2) pos.y += sin(uTime * 4.0 + aSeed.x * 50.0) * 0.4;
  pos = mod(pos - uCamPos + box, box * 2.0) - box + uCamPos;
  vec3 v = fall + drift;
  float len = uKind == 0 ? 0.03 : uKind == 1 ? 0.02 : 0.03;
  vec3 tail = pos - v * len * (uKind == 0 ? 1.0 : 0.6);
  vec3 p = mix(tail, pos, aEnd);
  float dist = length(pos - uCamPos);
  vA = smoothstep(uBox, uBox * 0.3, dist) * smoothstep(0.5, 2.0, dist);
  vEnd = aEnd;
  gl_Position = uViewProj * vec4(p, 1.0);
  gl_PointSize = clamp(uPtScale / max(dist, 0.5), 1.0, 14.0);
}`;
const W_FS = PRELUDE + `
in float vA; in float vEnd; out vec4 o;
uniform vec4 uCol; uniform int uPts;
void main(){
  if (uPts == 1) { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard; o = vec4(uCol.rgb * vA * uCol.a * (1.0 - r) * 0.55, 0.0); return; }
  o = vec4(uCol.rgb * vA * uCol.a * (0.15 + 0.35 * vEnd), 0.0);
}`;

export interface Particle {
  d: number; // track s (absolute)
  u: number;
  h: number;
  vs: number;
  vu: number;
  vh: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  kind: number;
  rot: number;
  vr: number;
  grav: number;
}

export class FX {
  parts: Particle[] = [];
  private pBuf: WebGLBuffer;
  private pData = new Float32Array(MAXP * 10);
  private pVao: WebGLVertexArrayObject;
  private gBuf: WebGLBuffer;
  gData = new Float32Array(512 * 8);
  gCount = 0;
  private gVao: WebGLVertexArrayObject;
  private wVao: WebGLVertexArrayObject;
  private wCount: number;
  pProg: Program;
  gProg: Program;
  wProg: Program;
  constructor(private gl: GL) {
    this.pProg = new Program(gl, P_VS, P_FS, 'particles');
    this.gProg = new Program(gl, G_VS, G_FS, 'glow');
    this.wProg = new Program(gl, W_VS, W_FS, 'weather');
    const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
    const mk = (buf: WebGLBuffer, stride: number, attrs: [number, number, number][]) => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const qb = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      for (const [loc, size, off] of attrs) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
        gl.vertexAttribDivisor(loc, 1);
      }
      gl.bindVertexArray(null);
      return vao;
    };
    this.pBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.pData.byteLength, gl.DYNAMIC_DRAW);
    this.pVao = mk(this.pBuf, 40, [[1, 4, 0], [2, 4, 16], [3, 2, 32]]);
    this.gBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.gData.byteLength, gl.DYNAMIC_DRAW);
    this.gVao = mk(this.gBuf, 32, [[1, 4, 0], [2, 4, 16]]);
    // weather lines
    const N = 6000;
    const wd = new Float32Array(N * 2 * 4);
    let r = 12345;
    const rnd = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < N; i++) {
      const a = rnd(), b = rnd(), c = rnd();
      wd.set([a, b, c, 0, a, b, c, 1], i * 8);
    }
    this.wVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.wVao);
    const wb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, wb);
    gl.bufferData(gl.ARRAY_BUFFER, wd, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);
    this.wCount = N * 2;
  }

  spawn(kind: number, s: number, u: number, h: number, vs: number, vu: number, vh: number, life: number, size: number, grow = 1.5, grav = 0): void {
    if (this.parts.length >= MAXP) this.parts.shift();
    this.parts.push({ d: s, u, h, vs, vu, vh, life, max: life, size, grow, kind, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 3, grav });
  }

  update(dt: number): void {
    const P = this.parts;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.d += p.vs * dt;
      p.u += p.vu * dt;
      p.h += p.vh * dt;
      p.vh -= p.grav * dt;
      const drag = p.kind === PT.SPARK ? 0.4 : 2.2;
      p.vs *= Math.exp(-drag * dt);
      p.vu *= Math.exp(-drag * dt);
      if (p.h < 0.02 && p.grav > 0) { p.h = 0.02; p.vh = Math.abs(p.vh) * 0.25; p.vs *= 0.6; p.vu *= 0.6; }
      p.rot += p.vr * dt;
      P[w++] = p;
    }
    P.length = w;
  }

  drawParticles(prep: (p: Program) => void, sCar: number, loop: number, camR: number[], camU: number[], amb: number[], sun: number[], fogC: number[], fog: number[], cam: number[]): void {
    const gl = this.gl;
    const P = this.parts;
    const n = Math.min(P.length, MAXP);
    if (!n) return;
    const D = this.pData;
    let k = 0, a = 0;
    // visibility budget: when many soft puffs hang in the view ahead (dust or spray from a pack of cars),
    // each one is drawn fainter so the total haze stays see-through
    let soft = 0;
    for (let i = 0; i < n; i++) {
      const p = P[i];
      if (p.kind !== PT.DUST && p.kind !== PT.WATER && p.kind !== PT.SAND && p.kind !== PT.SNOW && p.kind !== PT.SMOKE) continue;
      let d = p.d - sCar;
      if (loop > 0) d = (((d + loop / 2) % loop) + loop) % loop - loop / 2;
      if (d > -8 && d < 70) soft++;
    }
    const softK = Math.min(1, 80 / Math.max(1, soft));
    // additive particles (sparks) go last by sorting kind
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const p = P[i];
        const add = p.kind === PT.SPARK;
        if ((pass === 0) === add) continue;
        let d = p.d - sCar;
        if (loop > 0) d = (((d + loop / 2) % loop) + loop) % loop - loop / 2;
        const t = 1 - p.life / p.max;
        const c = PCOL[p.kind];
        let fade = Math.min(1, p.life / (p.max * 0.4)) * Math.min(1, t * 8 + 0.2);
        if (p.kind === PT.DUST || p.kind === PT.WATER || p.kind === PT.SAND || p.kind === PT.SNOW || p.kind === PT.SMOKE) fade *= softK;
        D.set([d, p.u, p.h, p.size * (1 + t * p.grow), c[0], c[1], c[2], c[3] * fade, p.rot, p.kind], k * 10);
        k++;
      }
      if (pass === 0) a = k;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, D, 0, k * 10);
    const pr = this.pProg.use();
    prep(pr);
    pr.v3('uCamR', camR).v3('uCamU', camU).v3('uAmb', amb).v3('uSunC', sun).v3('uFogC', fogC).v4('uFog', fog).v3('uCamPos', cam);
    gl.bindVertexArray(this.pVao);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, a);
    if (k > a) {
      gl.blendFunc(gl.ONE, gl.ONE);
      // draw the additive tail: rebind offsets
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 40, a * 40);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, a * 40 + 16);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 40, a * 40 + 32);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, k - a);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 40, 0);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 16);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 40, 32);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  // ---- glows ----
  beginGlows(): void {
    this.gCount = 0;
  }
  glow(x: number, y: number, z: number, size: number, r: number, g: number, b: number, stretch = 1): void {
    if (this.gCount >= 512) return;
    this.gData.set([x, y, z, size, r, g, b, stretch], this.gCount * 8);
    this.gCount++;
  }
  drawGlows(vp: Float32Array, camR: number[], camU: number[]): void {
    if (!this.gCount) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.gData, 0, this.gCount * 8);
    const p = this.gProg.use();
    p.m4('uViewProj', vp).v3('uCamR', camR).v3('uCamU', camU);
    gl.bindVertexArray(this.gVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.gCount);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  drawWeather(vp: Float32Array, cam: number[], time: number, vel: number[], kind: number, amount: number, col: number[], wind: number[]): void {
    if (amount <= 0) return;
    const gl = this.gl;
    const p = this.wProg.use();
    p.m4('uViewProj', vp).v3('uCamPos', cam).f('uTime', time).v3('uVel', vel).i('uKind', kind).f('uBox', kind === 0 ? 28 : 34);
    p.v4('uCol', col[0], col[1], col[2], amount).v3('uWindV', wind);
    gl.bindVertexArray(this.wVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    const n = Math.floor(this.wCount * Math.min(1, amount) / 2) * 2;
    const pts = kind === 1;
    p.i('uPts', pts ? 1 : 0).f('uPtScale', (gl.drawingBufferHeight / 1080) * 9);
    gl.drawArrays(pts ? gl.POINTS : gl.LINES, 0, n);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
