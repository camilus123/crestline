// Procedural sky with parallax horizon layers that scroll sideways through bends and dip over crests.

import { GL, Program } from './gl';
import { NOISE, PRELUDE } from './glsl';
import { Look } from './looks';

const VS = PRELUDE + `
layout(location=0) in vec2 aPos;
out vec2 vNdc;
void main(){ vNdc = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;

const FS = PRELUDE + NOISE + `
in vec2 vNdc;
out vec4 o;
uniform mat4 uInvVP;
uniform vec3 uCamPos;
uniform float uHeading;   // true track heading (radians)
uniform float uAlt;       // camera altitude relative to track mean (m)
uniform float uTime;
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uGround;
uniform vec3 uSunW; uniform vec3 uSunC; uniform float uSunSize;
uniform vec4 uCloud; // cover, speed, high, unused
uniform vec3 uCloudC; uniform vec3 uCloudS;
uniform vec4 uLayerC[3]; // rgb + height(deg)
uniform vec4 uLayerP[3]; // rough, kind, parallax, seed
uniform vec4 uExtra; // stars, moon, planet, cityGlow
uniform float uSnowCaps;
uniform float uFlash;
uniform vec4 uBolt; // azimuth, intensity, seed, unused
uniform vec3 uFogC;
uniform float uMist;
const float PI = 3.14159265;

float ridge(float x, float seed){
  float s = 0.0, a = 0.55, f = 1.0;
  for (int i = 0; i < 5; i++) { float n = vnoise(vec2(x * f + seed * 13.1, seed)); n = 1.0 - abs(n * 2.0 - 1.0); s += a * n * n; f *= 2.13; a *= 0.48; }
  return s;
}
float smoothHills(float x, float seed){ return fbm(vec2(x, seed * 7.7)); }
float skyline(float x, float seed, out float win){
  float cell = floor(x * 1.0);
  float hgt = 0.25 + 0.75 * pow(hash2(vec2(cell, seed)), 1.6);
  float f = fract(x);
  float gap = step(0.08, f) * step(f, 0.92);
  float spire = step(0.93, hash2(vec2(cell, seed + 3.0))) * smoothstep(0.1, 0.0, abs(f - 0.5)) * 0.6;
  win = hash2(vec2(floor(x * 9.0), floor(seed * 40.0)));
  return hgt * gap + spire * gap;
}

void main(){
  vec4 p = uInvVP * vec4(vNdc, 1.0, 1.0);
  vec3 dir = normalize(p.xyz / p.w - uCamPos);
  // rotate into world azimuth
  float ch = cos(uHeading), sh = sin(uHeading);
  vec3 wd = vec3(dir.x * ch + dir.z * sh, dir.y, -dir.x * sh + dir.z * ch);
  float az = atan(wd.x, wd.z);
  float el = asin(clamp(wd.y, -1.0, 1.0));
  float elD = el * 180.0 / PI;
  // base gradient
  float t = clamp(wd.y, 0.0, 1.0);
  vec3 col = mix(uHor, uZen, pow(t, 0.55));
  float sunD = max(dot(wd, uSunW), 0.0);
  col += uGlow * pow(sunD, 6.0) * 0.55 + uGlow * pow(sunD, 64.0) * 0.6;
  // stars
  if (uExtra.x > 0.0 && wd.y > 0.0) {
    vec2 sp = vec2(az * 120.0, el * 120.0);
    float st = step(0.996, hash2(floor(sp))) * hash2(floor(sp) + 7.0);
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + hash2(floor(sp)) * 40.0);
    col += vec3(0.8, 0.85, 1.0) * st * tw * uExtra.x * 2.0 * smoothstep(0.0, 0.2, wd.y);
    // milky band
    float band = exp(-pow((wd.y - 0.55 + 0.3 * sin(az)), 2.0) * 18.0) * fbm(vec2(az * 6.0, el * 6.0));
    col += vec3(0.12, 0.14, 0.22) * band * uExtra.x;
  }
  // sun disc
  if (uSunSize > 0.0) col += uSunC * smoothstep(0.9994 - 0.0006 * uSunSize, 0.9998 - 0.0002 * uSunSize, sunD) * 6.0;
  // moon
  if (uExtra.y > 0.0) {
    vec3 md = normalize(vec3(-0.5, 0.42, 0.7));
    float m = dot(wd, md);
    float disc = smoothstep(0.9988, 0.9992, m);
    float crater = fbm(vec2(wd.x, wd.y) * 300.0);
    col += vec3(1.0, 0.97, 0.9) * disc * (2.2 - crater * 0.9) * uExtra.y;
    col += vec3(0.25, 0.3, 0.45) * pow(max(m, 0.0), 200.0) * uExtra.y;
  }
  // ringed planet (futuristic)
  if (uExtra.z > 0.0) {
    vec3 pd = normalize(vec3(0.6, 0.35, 0.72));
    float m = dot(wd, pd);
    float r = acos(clamp(m, -1.0, 1.0));
    float disc = smoothstep(0.205, 0.2, r);
    vec3 pc = mix(vec3(1.0, 0.5, 0.75), vec3(0.4, 0.2, 0.9), smoothstep(-0.2, 0.2, dot(wd - pd, vec3(0.3, 1.0, 0.0)) * 5.0));
    pc *= 0.6 + 0.4 * fbm(vec2(dot(wd, vec3(0, 1, 0)) * 40.0, 1.0));
    // rings: project onto tilted plane
    vec3 rel = wd - pd * m;
    vec3 rn = normalize(vec3(0.15, 1.0, -0.35));
    float rp = dot(rel, rn);
    float rr = length(rel - rn * rp);
    float ring = smoothstep(0.012, 0.0, abs(rp)) * smoothstep(0.24, 0.26, rr) * smoothstep(0.42, 0.38, rr) * (0.5 + 0.5 * sin(rr * 220.0));
    col = mix(col, pc * 1.4, disc * uExtra.z);
    col += vec3(1.0, 0.75, 0.9) * ring * uExtra.z * (1.0 - disc * step(0.0, rp)) * 0.9;
  }
  // clouds on a dome plane
  if (uCloud.x > 0.0 && wd.y > 0.0) {
    vec2 cp = wd.xz / (wd.y + 0.12) * 1.6 + vec2(uTime * uCloud.y, uTime * uCloud.y * 0.3);
    float n = fbm(cp * 0.9) * 0.65 + fbm(cp * 2.6 + 3.0) * 0.35;
    float cov = smoothstep(1.0 - uCloud.x * 0.75, 1.15 - uCloud.x * 0.6, n);
    float shade = smoothstep(0.2, 0.9, fbm(cp * 0.9 + uSunW.xz * 0.3));
    vec3 cc = mix(uCloudC, uCloudS, shade * 0.75);
    cc += uGlow * pow(sunD, 8.0) * 0.8 * (1.0 - shade);
    cc += vec3(0.7, 0.75, 0.9) * uFlash * 2.5;
    float fade = smoothstep(0.0, 0.18, wd.y);
    col = mix(col, cc, cov * fade);
    // cirrus streaks
    float ci = fbm(vec2(cp.x * 0.4, cp.y * 3.0) + 5.0);
    col += uCloudC * smoothstep(0.55, 0.85, ci) * uCloud.z * 0.25 * fade;
  }
  // lightning bolt
  if (uBolt.y > 0.0) {
    float da = az - uBolt.x;
    da = mod(da + PI, 2.0 * PI) - PI;
    float y = el;
    float jag = (fbm(vec2(y * 18.0, uBolt.z)) - 0.5) * 0.12 + (fbm(vec2(y * 60.0, uBolt.z + 3.0)) - 0.5) * 0.03;
    float w = abs(da - jag);
    float bolt = smoothstep(0.004, 0.0, w) * step(0.0, y) * step(y, 0.5);
    col += vec3(0.85, 0.9, 1.0) * (bolt * 25.0 + exp(-w * 60.0) * 0.8) * uBolt.y;
  }
  // horizon layers (far -> near), parallax and altitude response
  for (int i = 0; i < 3; i++) {
    float hgt = uLayerC[i].w;
    if (hgt <= 0.0) continue;
    float kind = uLayerP[i].y;
    float par = uLayerP[i].z;
    float a = az + uHeading * (par - 1.0);
    float x = a / (2.0 * PI) * (kind > 1.5 && kind < 2.5 ? 140.0 : 9.0 + float(i) * 5.0);
    float prof;
    float win = 0.0;
    if (kind < 0.5) prof = ridge(x, uLayerP[i].w) * 1.25;
    else if (kind < 1.5) prof = smoothHills(x * 0.8, uLayerP[i].w) * 1.1;
    else if (kind < 2.5) prof = skyline(x, uLayerP[i].w, win);
    else if (kind < 3.5) { float m = fbm(vec2(x * 0.5, uLayerP[i].w)); prof = smoothstep(0.42, 0.5, m) * (0.85 + 0.15 * fbm(vec2(x * 4.0, 2.0))); }
    else if (kind < 4.5) prof = 0.55 + 0.45 * fbm(vec2(x * 12.0, uLayerP[i].w)) + 0.15 * vnoise(vec2(x * 60.0, 1.0));
    else prof = 0.25;
    float horizon = hgt * prof - uAlt * (0.012 + float(i) * 0.02);
    if (elD < horizon) {
      vec3 lc = uLayerC[i].rgb;
      float shadeT = clamp((horizon - elD) / max(0.5, hgt), 0.0, 1.0);
      lc *= 0.85 + 0.3 * (1.0 - shadeT);
      if (kind < 0.5 && uSnowCaps > 0.0) {
        float cap = smoothstep(horizon * 0.62, horizon * 0.8, elD + (fbm(vec2(x * 8.0, 4.0)) - 0.5) * hgt * 0.2) * smoothstep(hgt * 0.35, hgt * 0.6, horizon);
        lc = mix(lc, vec3(0.9, 0.93, 1.0) * (0.7 + 0.5 * max(0.0, uSunW.y + 0.3)), cap * uSnowCaps);
      }
      if (kind > 1.5 && kind < 2.5) {
        // lit windows in the skyline
        float wx = fract(a / (2.0 * PI) * 1400.0), wy = fract(elD * 3.0);
        float lit = step(0.55, hash2(vec2(floor(a / (2.0 * PI) * 1400.0), floor(elD * 3.0)))) * step(0.3, wx) * step(0.35, wy);
        lc += vec3(1.0, 0.7, 0.9) * lit * 0.6 * (0.3 + uExtra.w + (uExtra.z > 0.0 ? 1.5 : 0.0));
      }
      if (kind > 4.5) {
        lc = mix(uLayerC[i].rgb, uHor, 0.25) + uSunC * pow(sunD, 30.0) * 0.4;
      }
      // atmospheric perspective: far layers fade into the horizon colour
      float haze = 0.55 - float(i) * 0.22;
      col = mix(lc, mix(uHor, uFogC, 0.5), haze);
    }
  }
  // city glow on the horizon
  if (uExtra.w > 0.0) {
    float g = exp(-max(elD, 0.0) * 0.35) * smoothstep(0.6, 1.0, cos(az - 2.2));
    col += vec3(0.55, 0.32, 0.12) * g * uExtra.w * 0.35;
  }
  // below the horizon: distant ground in fog
  if (wd.y < 0.0) col = mix(mix(uHor, uFogC, 0.5) * 0.9, uGround * 0.8, smoothstep(-0.005, -0.12, wd.y) * 0.85);
  // mist band
  col = mix(col, uFogC, uMist * exp(-abs(elD) * 0.25) * 0.7);
  col += vec3(0.5, 0.55, 0.7) * uFlash * 0.35;
  o = vec4(col, 1.0);
}`;

export class Sky {
  prog: Program;
  vao: WebGLVertexArrayObject;
  constructor(private gl: GL) {
    this.prog = new Program(gl, VS, FS, 'sky');
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }
  setLook(look: Look, sunW: number[]): void {
    const p = this.prog.use();
    p.v3('uZen', look.skyZenith).v3('uHor', look.skyHorizon).v3('uGlow', look.skyGlow).v3('uGround', look.ground[0]);
    p.v3('uSunW', sunW).v3('uSunC', look.sunColor).f('uSunSize', look.sunSize);
    p.v4('uCloud', look.cloudCover, look.cloudSpeed, look.cloudHigh, 0).v3('uCloudC', look.cloudColor).v3('uCloudS', look.cloudShade);
    const lc = new Float32Array(12), lp = new Float32Array(12);
    for (let i = 0; i < 3; i++) {
      const L = look.layers[i];
      if (L) {
        lc.set([L.color[0], L.color[1], L.color[2], L.height], i * 4);
        lp.set([L.rough, L.kind, [1.0, 1.05, 1.13][i], 1.7 + i * 3.3], i * 4);
      } else lc.set([0, 0, 0, 0], i * 4);
    }
    p.v4a('uLayerC', lc).v4a('uLayerP', lp);
    p.v4('uExtra', look.stars, look.moon, look.planet, look.cityGlow).f('uSnowCaps', look.snowCaps);
    p.v3('uFogC', look.fogColor).f('uMist', look.mist);
  }
  draw(invVP: Float32Array, cam: number[], heading: number, alt: number, time: number, flash: number, bolt: number[]): void {
    const gl = this.gl;
    const p = this.prog.use();
    p.m4('uInvVP', invVP).v3('uCamPos', cam).f('uHeading', heading).f('uAlt', alt).f('uTime', time).f('uFlash', flash);
    p.v4('uBolt', bolt[0], bolt[1], bolt[2], 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
