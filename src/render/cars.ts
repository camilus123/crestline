// Car rendering: three lofted models, paint shader with clear-coat reflections, spinning/steering
// wheels, brake lights and headlights, plus soft contact shadows.

import { GL, Mesh, Program } from './gl';
import { LIGHT, NOISE, PRELUDE } from './glsl';
import { buildCar, CarGeo } from './carmodel';

const VS = PRELUDE + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aCol;
layout(location=3) in vec4 aAux;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec4 uWheel[4];
uniform float uSpin;
uniform float uSteer;
out vec3 vW; out vec3 vN; out vec4 vCol; out float vMat; out vec3 vL; out vec3 vNL;
void main(){
  vec3 p = aPos, n = aNrm;
  int wid = int(aAux.y * 255.0 + 0.5);
  if (wid > 0) {
    vec4 wc = uWheel[wid - 1];
    vec3 r = p - wc.xyz;
    float ca = cos(uSpin), sa = sin(uSpin);
    r = vec3(r.x, r.y * ca - r.z * sa, r.y * sa + r.z * ca);
    n = vec3(n.x, n.y * ca - n.z * sa, n.y * sa + n.z * ca);
    if (wid <= 2) {
      float cs = cos(uSteer), ss = sin(uSteer);
      r = vec3(r.x * cs + r.z * ss, r.y, -r.x * ss + r.z * cs);
      n = vec3(n.x * cs + n.z * ss, n.y, -n.x * ss + n.z * cs);
    }
    p = wc.xyz + r;
  }
  vec4 w = uModel * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(uModel) * n);
  vCol = aCol;
  vMat = aAux.x * 255.0;
  vL = p;
  vNL = n;
  gl_Position = uViewProj * w;
}`;

const FS = PRELUDE + NOISE + LIGHT + `
in vec3 vW; in vec3 vN; in vec4 vCol; in float vMat; in vec3 vL; in vec3 vNL;
out vec4 o;
uniform vec3 uPaint; uniform vec3 uAccent; uniform vec3 uNeonC;
uniform float uBrake; uniform float uLights; uniform float uTail;
uniform vec2 uRear; // tail-lamp height, rear-panel z
// red light from the lamps washing over the rear panel around them
vec3 lampSpill(vec3 albedo){
  float facing = max(-normalize(vNL).z, 0.0);
  float near = exp(-pow((vL.y - uRear.x) / 0.16, 2.0)) * smoothstep(uRear.y + 0.45, uRear.y + 0.02, vL.z);
  return albedo * vec3(1.0, 0.07, 0.04) * facing * near * (0.25 * uTail + 1.1 * uBrake);
}
uniform vec3 uSkyRef; uniform vec3 uSkyRef2; uniform vec3 uGroundRef;
vec3 env(vec3 R){
  vec3 sky = mix(uSkyRef2, uSkyRef, smoothstep(-0.02, 0.5, R.y));
  vec3 gnd = uGroundRef * 0.6;
  vec3 c = mix(gnd, sky, smoothstep(-0.12, 0.02, R.y));
  // a soft horizon highlight band, reads as a studio-like reflection on the paint
  c += uSkyRef2 * 0.6 * exp(-abs(R.y - 0.05) * 30.0);
  c += uSunCol * pow(max(dot(R, uSunDir), 0.0), 400.0) * 3.0;
  c += vec3(0.6, 0.65, 0.8) * uFlash * 0.8;
  return c;
}
void main(){
  // cars right next to the lens dissolve (screen-door) instead of filling the view
  float camD = length(vW - uCamPos);
  if (camD < 3.6) {
    float th = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (th > smoothstep(1.6, 3.6, camD)) discard;
  }
  int m = int(vMat + 0.5);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vW);
  vec3 R = reflect(-V, N);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 base = vCol.rgb * vCol.rgb;
  vec3 col;
  vec3 emis = vec3(0.0);
  if (m == 0 || m == 1) {
    vec3 paint = m == 0 ? uPaint : uAccent;
    float flake = (hash2(floor(vL.xz * 900.0) + floor(vL.y * 900.0)) - 0.5) * 0.08;
    vec3 diff = lightSurf(paint * (1.0 + flake), N, vW, 0.38, 0.45, 1.0, 1.0);
    float coat = 0.04 + 0.96 * fres;
    col = diff + env(R) * coat * 0.38 + lampSpill(paint);
  } else if (m == 2) {
    col = vec3(0.01, 0.012, 0.016) + env(R) * (0.12 + 0.88 * fres) * 0.9;
    col += lightSurf(vec3(0.02), N, vW, 0.05, 1.5, 1.0, 1.0) * 0.5;
  } else if (m == 3) {
    col = env(R) * 0.85 * vec3(0.95, 0.96, 1.0) + lightSurf(vec3(0.3), N, vW, 0.1, 1.2, 1.0, 1.0) * 0.3;
  } else if (m == 4 || m == 9) {
    float weave = m == 9 ? 0.5 + 0.5 * step(0.5, fract((vL.x + vL.z) * 40.0)) : 1.0;
    col = lightSurf(base * (0.7 + 0.3 * weave), N, vW, 0.5, 0.5, 1.0, 1.0) + env(R) * fres * 0.15 + lampSpill(vec3(0.12));
  } else if (m == 5) {
    // red lens: reads as red even when unlit; tail lights glow, brake lights flare
    col = lightSurf(vec3(0.42, 0.02, 0.02), N, vW, 0.15, 1.2, 1.0, 1.0) + env(R) * (0.06 + 0.5 * fres) * vec3(1.0, 0.35, 0.35);
    float inner = 0.75 + 0.25 * smoothstep(0.02, 0.0, abs(fract(vL.x * 9.0) - 0.5) - 0.42); // lamp segments
    emis = vec3(1.0, 0.05, 0.025) * (0.9 * uTail + 3.2 * uBrake) * inner;
  } else if (m == 6) {
    col = vec3(0.6) * 0.1 + env(R) * (0.2 + fres) * 0.6;
    emis = vec3(1.0, 0.95, 0.85) * (0.15 + uLights * 7.0);
  } else if (m == 7) {
    col = lightSurf(base, N, vW, 0.9, 0.1, 0.9, 1.0);
  } else if (m == 8) {
    col = lightSurf(base, N, vW, 0.25, 1.0, 1.0, 1.0) + env(R) * 0.35 * (base.r + 0.2);
  } else if (m == 10) {
    col = lightSurf(vec3(0.5, 0.22, 0.02), N, vW, 0.15, 1.2, 1.0, 1.0) + env(R) * (0.06 + 0.5 * fres) * vec3(1.0, 0.6, 0.3);
    emis = vec3(1.0, 0.45, 0.05) * 0.06;
  } else if (m == 11) {
    col = vec3(0.0); emis = uNeonC * 2.0;
  } else col = base;
  o = vec4(fogApply(col + emis, vW), 1.0);
}`;

const SH_VS = PRELUDE + `
layout(location=0) in vec2 aQ;
uniform mat4 uViewProj; uniform mat4 uModel; uniform vec2 uSize;
out vec2 vQ;
void main(){ vQ = aQ; vec4 w = uModel * vec4(aQ.x * uSize.x, 0.03, aQ.y * uSize.y, 1.0); gl_Position = uViewProj * w; }`;
const SH_FS = PRELUDE + `
in vec2 vQ; out vec4 o; uniform float uStrength;
void main(){ vec2 q = abs(vQ); float a = (1.0 - smoothstep(0.55, 1.0, q.x)) * (1.0 - smoothstep(0.7, 1.0, q.y)); o = vec4(vec3(1.0 - a * uStrength), 1.0); }`;

export interface CarDraw {
  model: Float32Array;
  geo: number;
  paint: number[];
  accent: number[];
  spin: number;
  steer: number;
  brake: number;
  lights: number;
  tail: number;
  shadowModel: Float32Array;
}

export class CarRenderer {
  meshes: Mesh[] = [];
  geos: CarGeo[] = [];
  prog: Program;
  sh: Program;
  quad: Mesh;
  constructor(private gl: GL) {
    for (let i = 0; i < 3; i++) {
      const g = buildCar(i);
      this.geos.push(g);
      this.meshes.push(new Mesh(gl, g.data, 32, [
        { loc: 0, size: 3, type: gl.FLOAT, offset: 0 },
        { loc: 1, size: 3, type: gl.FLOAT, offset: 12 },
        { loc: 2, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 24 },
        { loc: 3, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 28 },
      ], 0, g.idx));
    }
    this.prog = new Program(gl, VS, FS, 'car');
    this.sh = new Program(gl, SH_VS, SH_FS, 'carshadow');
    this.quad = new Mesh(gl, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), 8, [{ loc: 0, size: 2, type: gl.FLOAT, offset: 0 }], 6);
  }
  drawShadows(prep: (p: Program) => void, cars: CarDraw[], strength: number): void {
    const p = this.sh.use();
    prep(p);
    p.f('uStrength', strength);
    for (const c of cars) {
      const g = this.geos[c.geo];
      p.m4('uModel', c.shadowModel).v2('uSize', g.width * 0.62, g.length * 0.56);
      this.quad.draw();
    }
  }
  draw(prep: (p: Program) => void, cars: CarDraw[], neon: number[]): void {
    const p = this.prog.use();
    prep(p);
    p.v3('uNeonC', neon);
    const w = new Float32Array(16);
    for (const c of cars) {
      const g = this.geos[c.geo];
      for (let i = 0; i < 16; i++) w[i] = g.wheels[i];
      p.m4('uModel', c.model).v4a('uWheel', w).f('uSpin', c.spin).f('uSteer', c.steer);
      p.v3('uPaint', c.paint).v3('uAccent', c.accent).f('uBrake', c.brake).f('uLights', c.lights).f('uTail', c.tail).v2('uRear', g.tailY, -g.length * 0.5);
      this.meshes[c.geo].draw();
    }
  }
}
