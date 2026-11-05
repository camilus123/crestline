// Instanced roadside scenery. Each object type is one mesh + one instance buffer sorted by s;
// per frame we draw only the s-range in view (two ranges across the loop seam on circuits).

import { O } from '../track/defs';
import { TrackData } from '../track/generator';
import { GL, Mesh, Program } from './gl';
import { LIGHT, NOISE, PATH, PRELUDE } from './glsl';
import { buildModel, LAMPS, LANDMARK, SPANNING } from './models';

export const OBJ_VS = PRELUDE + NOISE + PATH + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aCol;
layout(location=3) in vec4 aAux;
layout(location=4) in vec3 iSUR;
layout(location=5) in vec3 iSHX;
uniform mat4 uViewProj;
uniform float uSCar;
uniform int uLandmark;
uniform int uSpan;
uniform int uRotor;
uniform float uTime;
uniform vec3 uWind; // dirX (lateral), strength, gust
out vec3 vW; out vec3 vN; out vec4 vCol; out vec2 vAux; out float vHide;
void main(){
  float d = iSUR.x - uSCar;
  if (uLoopLen > 0.0) d = mod(d + uLoopLen * 0.5, uLoopLen) - uLoopLen * 0.5;
  PathS p = pathAt(d);
  float hide = (d < uPathInfo.x + 4.0 || d > uPathInfo.w) ? 1.0 : 0.0;
  float u = iSUR.y;
  float side = u < 0.0 ? -1.0 : 1.0;
  float edge = side < 0.0 ? p.hwL : p.hwR;
  float ext = side < 0.0 ? p.extL : p.extR;
  if (uLandmark == 0 && abs(u) > ext + 1.0 && uSpan == 0) hide = 1.0;
  if (uLandmark == 1 && abs(u) > ext) u = side * mix(ext, abs(u), 0.85);
  float off = max(abs(u) - edge, 0.0);
  float base = uSpan == 1 ? 0.0 : terrainH(p, u, off);
  if (uLandmark == 1 && abs(iSUR.y) > ext) base -= 6.0;
  vec3 lp = aPos;
  vec3 ln = aNrm;
  float hue = iSHX.y;
  if (uSpan == 1) {
    float hw = (p.hwL + p.hwR) * 0.5;
    float ctr = (p.hwR - p.hwL) * 0.5;
    if (aAux.w > 0.75) lp.x = lp.x * hw + ctr;
    else if (aAux.w > 0.25) { float sg = sign(lp.x); lp.x = (lp.x - sg) + sg * hw + ctr; }
  } else {
    lp *= iSHX.x;
    if (uRotor == 1 && aAux.x > 0.95) {
      // rotor: spin around the hub
      vec3 hub = vec3(0.0, 62.3, -4.6) * iSHX.x;
      vec3 r = lp - hub;
      float a = uTime * (0.9 + iSHX.z * 0.6) + iSHX.z * 6.28;
      float ca = cos(a), sa = sin(a);
      lp = hub + vec3(r.x * ca - r.y * sa, r.x * sa + r.y * ca, r.z);
      ln = vec3(ln.x * ca - ln.y * sa, ln.x * sa + ln.y * ca, ln.z);
    } else if (aAux.x > 0.0) {
      // wind sway: stronger higher up
      float ph = iSHX.z * 6.28 + p.s * 0.05;
      float w = (0.25 + uWind.y) * aAux.x * (0.02 + 0.012 * lp.y);
      float g = sin(uTime * (1.6 + uWind.y) + ph) * 0.6 + sin(uTime * 3.7 + ph * 1.7) * 0.25 + uWind.z;
      lp.x += g * w * lp.y * 0.6 * (uWind.x != 0.0 ? 1.0 : 0.3) + uWind.x * uWind.y * aAux.x * 0.03 * lp.y;
      lp.z += sin(uTime * 2.3 + ph) * w * lp.y * 0.25;
    }
    float r = iSUR.z, c = cos(r), s = sin(r);
    lp = vec3(lp.x * c + lp.z * s, lp.y, -lp.x * s + lp.z * c);
    ln = vec3(ln.x * c + ln.z * s, ln.y, -ln.x * s + ln.z * c);
  }
  vec3 o = bentPos(p, u, base);
  vec3 right = vec3(cos(p.phi), 0.0, -sin(p.phi));
  vec3 fwd = vec3(sin(p.phi), 0.0, cos(p.phi));
  vec3 w = o + right * lp.x + vec3(0, 1, 0) * lp.y + fwd * lp.z;
  vW = w;
  vN = normalize(right * ln.x + vec3(0, 1, 0) * ln.y + fwd * ln.z);
  vec3 col = aCol.rgb * aCol.rgb;
  col *= 1.0 + hue * 0.16 * aAux.z;
  col += vec3(0.05, 0.035, -0.03) * hue * aAux.z;
  vCol = vec4(max(col, 0.0), aCol.a);
  vAux = vec2(aAux.y, aAux.z);
  vHide = hide;
  gl_Position = hide > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : uViewProj * vec4(w, 1.0);
}`;

export const OBJ_FS = PRELUDE + NOISE + LIGHT + `
in vec3 vW; in vec3 vN; in vec4 vCol; in vec2 vAux; in float vHide;
out vec4 o;
uniform float uEmisMul;
void main(){
  if (vHide > 0.5) discard;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float ao = clamp(0.55 + vW.y * 0.0 + 0.45, 0.0, 1.0);
  vec3 col = lightSurf(vCol.rgb, N, vW, 1.0 - vCol.a, vCol.a, ao, 1.0);
  col += vCol.rgb * vAux.x * uEmisMul * 4.0;
  o = vec4(fogApply(col, vW), 1.0);
}`;

const SHADOW_VS = PRELUDE + NOISE + PATH + `
layout(location=0) in vec2 aQ;
layout(location=4) in vec3 iSUR;
layout(location=5) in vec3 iSHX;
uniform mat4 uViewProj; uniform float uSCar; uniform float uRadius; uniform vec2 uSunOff;
out vec2 vQ; out float vHide; out vec3 vW;
void main(){
  float d = iSUR.x - uSCar;
  if (uLoopLen > 0.0) d = mod(d + uLoopLen * 0.5, uLoopLen) - uLoopLen * 0.5;
  PathS p = pathAt(d);
  float u = iSUR.y;
  float side = u < 0.0 ? -1.0 : 1.0;
  float edge = side < 0.0 ? p.hwL : p.hwR;
  float ext = side < 0.0 ? p.extL : p.extR;
  float hide = (d < uPathInfo.x + 4.0 || d > min(uPathInfo.w, 260.0) || abs(u) > ext) ? 1.0 : 0.0;
  float r = uRadius * iSHX.x;
  float uu = u + aQ.x * r + uSunOff.x * r;
  float dd = d + aQ.y * r + uSunOff.y * r;
  PathS q = pathAt(dd);
  float e2 = uu < 0.0 ? q.hwL : q.hwR;
  float off = max(abs(uu) - e2, 0.0);
  vec3 w = bentPos(q, uu, terrainH(q, uu, off) + 0.06);
  vQ = aQ; vHide = hide; vW = w;
  gl_Position = hide > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : uViewProj * vec4(w, 1.0);
}`;
const SHADOW_FS = PRELUDE + `
in vec2 vQ; in float vHide; in vec3 vW;
out vec4 o;
uniform float uStrength;
void main(){ if (vHide > 0.5) discard; float r = length(vQ); float a = smoothstep(1.0, 0.2, r) * uStrength; o = vec4(vec3(1.0 - a), 1.0); }`;

const VARIANTS = new Set<number>([O.PINE, O.FIR, O.OAK, O.BENT_OAK, O.BIRCH, O.POPLAR, O.WILLOW, O.DEAD_TREE, O.BUSH, O.DRYBUSH, O.FERN, O.GRASS, O.REEDS, O.ROCK, O.SNOW_ROCK, O.SNOW_PINE, O.CACTUS_ARM, O.CACTUS, O.TOWER, O.CROWD, O.BILLBOARD, O.STUMP, O.HOUSE]);

interface TypeSet {
  type: number;
  mesh: Mesh;
  shadow: Mesh | null;
  s: Float32Array; // sorted s
  data: Float32Array;
  count: number;
  landmark: boolean;
  span: boolean;
  rotor: boolean;
  radius: number;
}

const SHADOW_R: Partial<Record<number, number>> = {
  [O.PINE]: 2.6, [O.FIR]: 3, [O.SNOW_PINE]: 2.6, [O.OAK]: 3.8, [O.BENT_OAK]: 3.4, [O.BIRCH]: 2.2, [O.POPLAR]: 1.8,
  [O.WILLOW]: 4.2, [O.HOUSE]: 6, [O.COTTAGE]: 5, [O.BARN]: 9, [O.CHALET]: 7, [O.HUT]: 4, [O.ADOBE]: 5.5, [O.CACTUS_ARM]: 1.4,
  [O.TOWER]: 11, [O.DIGGER]: 3, [O.CABIN]: 3.5, [O.BUSH]: 1.6, [O.HAYBALE]: 1.0, [O.ROCK]: 1.3, [O.SNOW_ROCK]: 1.3, [O.DEAD_TREE]: 1.6,
};

export class Scenery {
  sets: TypeSet[] = [];
  prog: Program;
  shProg: Program;
  quad: WebGLBuffer;
  lamps: { s: number; u: number; h: number; type: number }[] = [];
  constructor(private gl: GL, track: TrackData) {
    this.prog = new Program(gl, OBJ_VS, OBJ_FS, 'objects');
    this.shProg = new Program(gl, SHADOW_VS, SHADOW_FS, 'blobshadow');
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    const o = track.objects;
    const byType = new Map<number, number[]>();
    for (let i = 0; i < o.count; i++) {
      const t = o.type[i];
      let a = byType.get(t);
      if (!a) byType.set(t, (a = []));
      a.push(i);
    }
    for (const [type, all] of byType) {
      const V = VARIANTS.has(type) ? 3 : 1;
      for (let v = 0; v < V; v++) {
        const idx = V === 1 ? all : all.filter((i) => ((Math.imul(i + 7, 2654435761) >>> 0) % V) === v);
        if (!idx.length) continue;
        const mb = buildModel(type, v);
        const vbuf = mb.pack();
        const mesh = new Mesh(gl, vbuf, 32, [
          { loc: 0, size: 3, type: gl.FLOAT, offset: 0 },
          { loc: 1, size: 3, type: gl.FLOAT, offset: 12 },
          { loc: 2, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 24 },
          { loc: 3, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 28 },
        ], mb.vertexCount);
        const data = new Float32Array(idx.length * 6);
        const ss = new Float32Array(idx.length);
        idx.forEach((i, k) => {
          data.set([o.s[i], o.u[i], o.rot[i], o.scale[i], o.hue[i], ((i * 2654435761) >>> 0) / 4294967296], k * 6);
          ss[k] = o.s[i];
          if (v === 0 && LAMPS.has(type)) this.lamps.push({ s: o.s[i], u: o.u[i], h: type === O.LAMP_DOUBLE ? 10 : 7, type });
        });
        const inst = [
          { loc: 4, size: 3, type: gl.FLOAT, offset: 0 },
          { loc: 5, size: 3, type: gl.FLOAT, offset: 12 },
        ];
        mesh.setInstances(data, 24, inst);
        let shadow: Mesh | null = null;
        const r = SHADOW_R[type];
        if (r) {
          shadow = new Mesh(gl, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), 8, [{ loc: 0, size: 2, type: gl.FLOAT, offset: 0 }], 6);
          shadow.setInstances(data, 24, inst);
        }
        this.sets.push({ type, mesh, shadow, s: ss, data, count: idx.length, landmark: LANDMARK.has(type), span: SPANNING.has(type), rotor: type === O.TURBINE, radius: r ?? 0 });
      }
    }
    this.lamps.sort((a, b) => a.s - b.s);
  }

  /** visible instance ranges for one type */
  private ranges(set: TypeSet, sCar: number, back: number, ahead: number, loop: number, out: number[]): number[] {
    out.length = 0;
    const lower = (key: number) => {
      let lo = 0, hi = set.count;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (set.s[m] < key) lo = m + 1;
        else hi = m;
      }
      return lo;
    };
    const add = (a: number, b: number) => {
      const i0 = lower(a), i1 = lower(b);
      if (i1 > i0) out.push(i0, i1 - i0);
    };
    const a = sCar - back, b = sCar + ahead;
    if (loop > 0) {
      const A = ((a % loop) + loop) % loop;
      const B = A + (b - a);
      if (B <= loop) add(A, B);
      else {
        add(A, loop + 1);
        add(-1, B - loop);
      }
    } else add(a, b);
    return out;
  }

  draw(prep: (p: Program) => void, sCar: number, maxD: number, loop: number, time: number, wind: number[], emis: number): void {
    const gl = this.gl;
    const p = this.prog.use();
    prep(p);
    p.f('uSCar', sCar).f('uTime', time).v3('uWind', wind).f('uEmisMul', emis);
    const r: number[] = [];
    gl.disable(gl.CULL_FACE);
    for (const set of this.sets) {
      p.i('uLandmark', set.landmark ? 1 : 0).i('uSpan', set.span ? 1 : 0).i('uRotor', set.rotor ? 1 : 0);
      this.ranges(set, sCar, 60, set.landmark ? maxD + 400 : maxD, loop, r);
      for (let k = 0; k < r.length; k += 2) set.mesh.drawInstances(r[k], r[k + 1]);
    }
  }

  drawShadows(prep: (p: Program) => void, sCar: number, loop: number, sunOff: number[], strength: number): void {
    const gl = this.gl;
    const p = this.shProg.use();
    prep(p);
    p.f('uSCar', sCar).v2('uSunOff', sunOff[0], sunOff[1]).f('uStrength', strength);
    const r: number[] = [];
    for (const set of this.sets) {
      if (!set.shadow) continue;
      p.f('uRadius', set.radius);
      this.ranges(set, sCar, 30, 260, loop, r);
      for (let k = 0; k < r.length; k += 2) set.shadow.drawInstances(r[k], r[k + 1]);
    }
  }

  /** nearest lamps ahead (for point lights at night) */
  nearLamps(sCar: number, loop: number, n: number, out: { s: number; u: number; h: number; d: number }[]): void {
    out.length = 0;
    const L = this.lamps;
    if (!L.length) return;
    let lo = 0, hi = L.length;
    const key = loop > 0 ? (((sCar - 20) % loop) + loop) % loop : sCar - 20;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (L[m].s < key) lo = m + 1;
      else hi = m;
    }
    for (let k = 0; k < L.length && out.length < n; k++) {
      const i = (lo + k) % L.length;
      if (loop <= 0 && lo + k >= L.length) break;
      let d = L[i].s - sCar;
      if (loop > 0) d = ((d + loop * 0.5) % loop + loop) % loop - loop * 0.5;
      if (d > 260) break;
      if (d < -20) continue;
      out.push({ s: L[i].s, u: L[i].u, h: L[i].h, d });
    }
  }
}
