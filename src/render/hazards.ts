// Hazard visuals. Props and decals are built once per track as "track-space meshes" whose vertex
// positions are (u, h, s); the shader bends them into place from the path texture.

import { Hz } from '../track/defs';
import { TrackData } from '../track/generator';
import { GL, Mesh, Program } from './gl';
import { LIGHT, NOISE, PATH, PRELUDE } from './glsl';
import { hex } from './looks';
import { MB, Mat } from './meshbuild';

const TS_VS = PRELUDE + NOISE + PATH + `
layout(location=0) in vec3 aPos; // u, h, s
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aCol;
layout(location=3) in vec4 aAux; // sway(unused), emissive, laserIdx/255, magnet flag
uniform mat4 uViewProj; uniform float uSCar; uniform float uTime;
uniform float uLaser[64];
out vec3 vW; out vec3 vN; out vec4 vCol; out float vEm; out float vHide;
void main(){
  float d = aPos.z - uSCar;
  if (uLoopLen > 0.0) d = mod(d + uLoopLen * 0.5, uLoopLen) - uLoopLen * 0.5;
  PathS p = pathAt(d);
  vHide = (d < uPathInfo.x + 3.0 || d > uPathInfo.w) ? 1.0 : 0.0;
  vec3 w = bentPos(p, aPos.x, aPos.y);
  vec3 right = vec3(cos(p.phi), 0.0, -sin(p.phi)), fwd = vec3(sin(p.phi), 0.0, cos(p.phi));
  vN = normalize(right * aNrm.x + vec3(0, 1, 0) * aNrm.y + fwd * aNrm.z);
  vW = w;
  vec3 c = aCol.rgb * aCol.rgb;
  float em = aAux.y;
  int li = int(aAux.z * 255.0 + 0.5) - 1;
  if (li >= 0) {
    float a = uLaser[li];
    em *= a;
    if (aAux.w > 0.5 && a < 0.05) vHide = 1.0; // beam geometry hidden while off
  }
  if (aAux.x > 0.5) em *= 0.6 + 0.4 * sin(uTime * 5.0 + aPos.z); // magnets pulse
  vCol = vec4(c, aCol.a); vEm = em;
  gl_Position = vHide > 0.5 ? vec4(2, 2, 2, 1) : uViewProj * vec4(w, 1.0);
}`;
const TS_FS = PRELUDE + NOISE + LIGHT + `
in vec3 vW; in vec3 vN; in vec4 vCol; in float vEm; in float vHide;
out vec4 o;
void main(){
  if (vHide > 0.5) discard;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 col = lightSurf(vCol.rgb, N, vW, 1.0 - vCol.a, vCol.a, 1.0, 1.0) + vCol.rgb * vEm * 5.0;
  o = vec4(fogApply(col, vW), 1.0);
}`;

// decals: grid with (fraction u, fraction s) + per-decal (s0, len, u0, u1) + kind
const DC_VS = PRELUDE + NOISE + PATH + `
layout(location=0) in vec2 aQ;   // 0..1, 0..1
layout(location=1) in vec4 aD;   // s0, len, u0, u1
layout(location=2) in float aK;  // kind
uniform mat4 uViewProj; uniform float uSCar;
out vec3 vW; out vec2 vQ; out float vK; out vec2 vSU; out float vHide;
void main(){
  float s = aD.x + aQ.y * aD.y;
  float u = mix(aD.z, aD.w, aQ.x);
  float d = s - uSCar;
  if (uLoopLen > 0.0) d = mod(d + uLoopLen * 0.5, uLoopLen) - uLoopLen * 0.5;
  PathS p = pathAt(d);
  vHide = (d < uPathInfo.x + 3.0 || d > uPathInfo.w) ? 1.0 : 0.0;
  int k = int(aK + 0.5);
  float h = 0.025;
  float mound = sin(aQ.x * 3.14159) * sin(aQ.y * 3.14159);
  if (k == ${Hz.SNOWBANK} || k == ${Hz.DRIFT}) h += mound * 0.35;
  if (k == ${Hz.FLOOD} || k == ${Hz.STREAM}) h = 0.06;
  vec3 w = bentPos(p, u, h);
  vW = w; vQ = aQ; vK = aK; vSU = vec2(s, u);
  gl_Position = vHide > 0.5 ? vec4(2, 2, 2, 1) : uViewProj * vec4(w, 1.0);
}`;
const DC_FS = PRELUDE + NOISE + LIGHT + `
in vec3 vW; in vec2 vQ; in float vK; in vec2 vSU; in float vHide;
out vec4 o;
uniform vec3 uSkyRef; uniform vec3 uSkyRef2; uniform sampler2D uNoiseT;
void main(){
  if (vHide > 0.5) discard;
  int k = int(vK + 0.5);
  vec2 c = vQ * 2.0 - 1.0;
  float edgeN = vnoise(vSU * vec2(0.9, 0.45)) * 0.5 + vnoise(vSU * 2.3) * 0.25;
  float shape = 1.0 - length(c * vec2(1.0, 1.0)) + edgeN * 0.55 - 0.15;
  bool full = k == ${Hz.FLOOD} || k == ${Hz.STREAM};
  if (full) shape = min(1.0 - abs(c.y), 1.0) * 1.4 + edgeN * 0.3 - 0.1;
  if (k == ${Hz.POTHOLE}) shape = 1.0 - length(c) + edgeN * 0.25;
  if (shape < 0.0) discard;
  float a = smoothstep(0.0, 0.15, shape);
  vec3 V = normalize(vW - uCamPos);
  vec3 N = vec3(0, 1, 0);
  vec3 col; float alpha = a;
  if (k == ${Hz.PUDDLE} || full) {
    float rip = texture(uNoiseT, vSU * 0.12 + uTime * 0.05).r;
    N = normalize(vec3((rip - 0.5) * 0.15, 1.0, (texture(uNoiseT, vSU * 0.1 - uTime * 0.04).g - 0.5) * 0.15));
    vec3 R = reflect(V, N);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
    vec3 sky = mix(uSkyRef2, uSkyRef, smoothstep(-0.05, 0.4, R.y));
    vec3 water = full ? vec3(0.06, 0.08, 0.06) : vec3(0.03, 0.035, 0.04);
    col = lightSurf(water, N, vW, 0.05, 1.5, 1.0, 1.0) + sky * fres * 0.95 + uSunCol * pow(max(dot(R, uSunDir), 0.0), 500.0) * 2.0;
    if (full) col = mix(col, vec3(0.5, 0.45, 0.35) * (uAmbTop * 0.5 + uSunCol * 0.1), 0.25);
    alpha = a * 0.92;
  } else if (k == ${Hz.MUD}) {
    float n = texture(uNoiseT, vSU * 0.3).r;
    col = lightSurf(vec3(0.16, 0.11, 0.06) * (0.8 + 0.5 * n), N, vW, 0.35, 0.6, 1.0, 1.0);
  } else if (k == ${Hz.OIL}) {
    float t = vnoise(vSU * 1.7) * 6.0 + dot(V, vec3(1.0, 2.0, 3.0));
    vec3 rainbow = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + t);
    col = lightSurf(vec3(0.01), N, vW, 0.05, 2.0, 1.0, 1.0) + rainbow * 0.12 * (uAmbTop + uSunCol * 0.2);
  } else if (k == ${Hz.ICE}) {
    vec3 R = reflect(V, N);
    col = lightSurf(vec3(0.55, 0.65, 0.8), N, vW, 0.05, 1.5, 1.0, 1.0) + mix(uSkyRef2, uSkyRef, 0.5) * 0.4;
    alpha = a * 0.75;
  } else if (k == ${Hz.SNOWBANK}) {
    col = lightSurf(vec3(0.85, 0.88, 0.95), normalize(vec3(c.x * 0.3, 1.0, c.y * 0.2)), vW, 0.6, 0.4, 1.0, 1.0);
  } else if (k == ${Hz.DRIFT}) {
    col = lightSurf(vec3(0.78, 0.55, 0.3), normalize(vec3(c.x * 0.3, 1.0, c.y * 0.2)), vW, 0.9, 0.1, 1.0, 1.0);
  } else {
    col = lightSurf(vec3(0.015), N, vW, 0.9, 0.1, 0.6, 1.0);
  }
  o = vec4(fogApply(col, vW) * alpha, alpha);
}`;

export class HazardRenderer {
  props: Mesh | null = null;
  decals: Mesh | null = null;
  cones: Mesh | null = null;
  coneData: Float32Array = new Float32Array(0);
  coneS: Float32Array = new Float32Array(0);
  coneCount = 0;
  tsProg: Program;
  dcProg: Program;
  lasers: { s: number; idx: number; h: import('../track/generator').Hazard }[] = [];
  laserAct = new Float32Array(64);
  constructor(private gl: GL, private track: TrackData) {
    this.tsProg = new Program(gl, TS_VS, TS_FS, 'hazprops');
    this.dcProg = new Program(gl, DC_VS, DC_FS, 'decals');
    const props = new MB(9);
    const dec: number[] = [];
    const cones: number[] = [];
    const add = (mb: MB, u: number, s: number) => {
      // move local model (x,y,z) into track space (u+x, y, s+z)
      const n = mb.pos.length / 3;
      for (let i = 0; i < n; i++) {
        props.pos.push(mb.pos[i * 3] + u, mb.pos[i * 3 + 1], mb.pos[i * 3 + 2] + s);
        props.nrm.push(mb.nrm[i * 3], mb.nrm[i * 3 + 1], mb.nrm[i * 3 + 2]);
        for (let k = 0; k < 4; k++) {
          props.col.push(mb.col[i * 4 + k]);
          props.aux.push(mb.aux[i * 4 + k]);
        }
      }
    };
    const M = (h: string, o: Partial<Mat> = {}): Mat => ({ c: hex(h), spec: 0.15, ...o });
    let laserN = 0;
    for (const h of track.hazards) {
      const w = h.u1 - h.u0, uc = (h.u0 + h.u1) / 2;
      switch (h.kind) {
        case Hz.PUDDLE: case Hz.MUD: case Hz.OIL: case Hz.FLOOD: case Hz.STREAM: case Hz.ICE: case Hz.SNOWBANK: case Hz.DRIFT: case Hz.POTHOLE:
          dec.push(h.s, h.len, h.u0, h.u1, h.kind);
          break;
        case Hz.BARRIER: {
          const mb = new MB(3);
          const segs = Math.max(1, Math.round(w / 1.2));
          for (let i = 0; i < segs; i++) mb.box(-w / 2 + (i + 0.5) * (w / segs), 0.55, 0, w / segs - 0.04, 0.32, 0.1, M(i % 2 ? '#f4f4f0' : '#e01a1a', { emis: 0.05 }));
          for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) { mb.box(x, 0, 0, 0.08, 0.9, 0.08, M('#555')); mb.box(x, 0, 0, 0.5, 0.06, 0.6, M('#e0a010')); }
          mb.box(-w / 2 + 0.2, 0.95, 0, 0.18, 0.18, 0.06, M('#ffa020', { emis: 2 }));
          add(mb, uc, h.s);
          break;
        }
        case Hz.ROCK: {
          const mb = new MB(Math.floor(h.s));
          mb.blob(0, w * 0.32, 0, w * 0.52, w * 0.42, w * 0.5, M('#6e6a64', { hue: 0 }), 0.3, 1);
          mb.blob(w * 0.35, 0.15, w * 0.3, w * 0.22, w * 0.18, w * 0.22, M('#5e5a54'), 0.3, 0);
          add(mb, uc, h.s);
          break;
        }
        case Hz.FALLEN_TREE: {
          const mb = new MB(Math.floor(h.s));
          const fromLeft = h.u0 < -track.hwL[0] + 0.1 || h.u0 < uc - w / 2 + 0.01;
          void fromLeft;
          mb.push().t(-w / 2 - 1.5, 0.45, 0).rz(-Math.PI / 2 + 0.03);
          mb.cyl(0, 0, 0, 0.45, 0.3, w + 1.5, 9, M('#5a3e28'), true, 0.1);
          mb.pop();
          for (let i = 0; i < 5; i++) {
            const x = -w / 2 + (i / 4) * w;
            mb.beam([x, 0.5, 0], [x + 0.6, 1.2 + Math.random() * 0.4, (i % 2 ? 1 : -1) * 0.9], 0.1, M('#5a3e28'));
            mb.blob(x + 0.5, 1.3, (i % 2 ? 1 : -1) * 0.9, 0.7, 0.5, 0.6, M('#3a6a26'), 0.25, 0);
          }
          mb.blob(w / 2 + 0.3, 0.4, 0, 0.7, 0.6, 0.7, M('#5a3e28'), 0.3, 0);
          add(mb, uc, h.s);
          break;
        }
        case Hz.LOG: {
          const mb = new MB(Math.floor(h.s));
          mb.push().t(-w / 2, 0.24, 0.45).rz(-Math.PI / 2);
          mb.cyl(0, 0, 0, 0.26, 0.26, w, 10, M('#7a5232'), true, 0.05);
          mb.pop();
          // ramp wedge so it reads as a launch point
          mb.prism([[-0.0, 0], [0, 0.0], [0, 0.0]], 0, 0, M('#7a5232'));
          add(mb, uc, h.s);
          break;
        }
        case Hz.LASER: {
          const idx = ++laserN;
          if (idx > 63) break;
          const mb = new MB(5);
          const lw = w;
          for (const x of [-lw / 2, lw / 2]) {
            mb.box(x, 0, 0, 0.5, 2.6, 0.5, M('#2a2a3a', { spec: 0.6 }));
            mb.box(x - Math.sign(x) * 0.26, 0.6, 0, 0.04, 1.6, 0.3, M('#ff2050', { emis: 1 }));
          }
          // beams (hidden while off)
          for (const y of [0.55, 0.95, 1.35]) mb.box(0, y, 0, lw - 0.5, 0.05, 0.05, { c: hex('#ff2a40'), emis: 3, span: 0 });
          const before = props.pos.length / 3;
          add(mb, uc, h.s);
          const after = props.pos.length / 3;
          // tag: aux.z = laser index (+1); beams get aux.w = 1
          const beamStart = before + (after - before) - 3 * 36;
          for (let v = before; v < after; v++) {
            props.aux[v * 4 + 2] = idx + 1;
            if (v >= beamStart) props.aux[v * 4 + 3] = 255;
            else if (props.aux[v * 4 + 1] === 0) props.aux[v * 4 + 2] = 0;
          }
          this.lasers.push({ s: h.s, idx, h });
          break;
        }
        case Hz.MAGNET: {
          const mb = new MB(7);
          const pole = h.a < 0 ? h.u0 - 0.6 : h.u1 + 0.6;
          mb.cyl(0, 0, 0, 1.0, 0.8, 1.0, 10, M('#3a3e48', { spec: 0.5 }));
          mb.cyl(0, 1.0, 0, 0.6, 0.6, 3.4, 12, M('#c89040', { spec: 0.8 }));
          for (let i = 0; i < 7; i++) mb.cyl(0, 1.15 + i * 0.47, 0, 0.66, 0.66, 0.16, 12, M('#ff6a20', { emis: 1.2, sway: 1 }));
          mb.cyl(0, 4.4, 0, 1.0, 1.0, 0.35, 12, M('#3a3e48', { spec: 0.5 }));
          mb.blob(0, 5.1, 0, 0.5, 0.5, 0.5, M('#40a8ff', { emis: 3, sway: 1 }), 0, 1);
          // field rings on the road surface
          for (let k = 0; k < 3; k++) mb.box(-Math.sign(h.a) * (2 + k * 1.6), 0.02, 0, 0.12, 0.01, 8 - k * 2, M('#40a8ff', { emis: 0.8, sway: 1 }));
          add(mb, pole, h.s + h.len / 2);
          break;
        }
        case Hz.CONE: {
          // a taper then a straight line of cones along the closure boundary
          const inner = h.a < 0 ? h.u1 : h.u0;
          const outer = h.a < 0 ? h.u0 : h.u1;
          for (let ds = 0; ds <= h.len; ds += 3) {
            const t = Math.min(1, ds / 15);
            cones.push(h.s + ds, outer + (inner - outer) * t);
          }
          // arrow board at the start of the closure
          const mb = new MB(2);
          mb.box(0, 0, 0, 1.6, 0.5, 0.8, M('#e8e8e8'));
          mb.box(0, 0.5, 0, 0.1, 1.2, 0.1, M('#555'));
          mb.box(0, 1.6, 0, 1.4, 1.0, 0.1, M('#151515'));
          for (let i = 0; i < 5; i++) mb.box(-0.5 + i * 0.25, 2.0 - Math.abs(i - 2) * 0.12, -0.06, 0.12, 0.12, 0.02, M('#ffb020', { emis: 3 }));
          add(mb, (outer + (h.a < 0 ? -1 : 1) * -1.0 + outer) / 2 - (h.a < 0 ? 0 : 0), h.s - 6);
          break;
        }
      }
    }
    if (props.pos.length) {
      this.props = new Mesh(gl, props.pack(), 32, [
        { loc: 0, size: 3, type: gl.FLOAT, offset: 0 },
        { loc: 1, size: 3, type: gl.FLOAT, offset: 12 },
        { loc: 2, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 24 },
        { loc: 3, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 28 },
      ], props.pos.length / 3);
    }
    if (dec.length) {
      // grid 4 x 12 per decal
      const GU = 4, GS = 12;
      const v: number[] = [];
      for (let k = 0; k < dec.length; k += 5) {
        for (let j = 0; j < GS; j++)
          for (let i = 0; i < GU; i++) {
            const q = [[i / GU, j / GS], [(i + 1) / GU, j / GS], [(i + 1) / GU, (j + 1) / GS], [i / GU, j / GS], [(i + 1) / GU, (j + 1) / GS], [i / GU, (j + 1) / GS]];
            for (const [a, b] of q) v.push(a, b, dec[k], dec[k + 1], dec[k + 2], dec[k + 3], dec[k + 4]);
          }
      }
      this.decals = new Mesh(gl, new Float32Array(v), 28, [
        { loc: 0, size: 2, type: gl.FLOAT, offset: 0 },
        { loc: 1, size: 4, type: gl.FLOAT, offset: 8 },
        { loc: 2, size: 1, type: gl.FLOAT, offset: 24 },
      ], v.length / 7);
    }
    this.coneCount = cones.length / 2;
    if (this.coneCount) {
      const cd = new Float32Array(this.coneCount * 6);
      this.coneS = new Float32Array(this.coneCount);
      for (let i = 0; i < this.coneCount; i++) {
        cd.set([cones[i * 2], cones[i * 2 + 1], 0, 1, 0, i * 0.37], i * 6);
        this.coneS[i] = cones[i * 2];
      }
      this.coneData = cd;
      const mb = new MB(4);
      mb.box(0, 0, 0, 0.42, 0.04, 0.42, M('#202020'));
      mb.cyl(0, 0.04, 0, 0.2, 0.03, 0.72, 10, M('#ff5a0a', { emis: 0.08 }));
      mb.cyl(0, 0.3, 0, 0.13, 0.1, 0.16, 10, M('#f8f8f8', { emis: 0.25 }), false);
      this.cones = new Mesh(gl, mb.pack(), 32, [
        { loc: 0, size: 3, type: gl.FLOAT, offset: 0 },
        { loc: 1, size: 3, type: gl.FLOAT, offset: 12 },
        { loc: 2, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 24 },
        { loc: 3, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 28 },
      ], mb.vertexCount);
      this.cones.setInstances(cd, 24, [
        { loc: 4, size: 3, type: gl.FLOAT, offset: 0 },
        { loc: 5, size: 3, type: gl.FLOAT, offset: 12 },
      ], gl.DYNAMIC_DRAW);
    }
  }

  /** knock cones near (s,u); returns knocked cone positions for debris */
  knock(s: number, u: number, out: { s: number; u: number }[]): void {
    for (let i = 0; i < this.coneCount; i++) {
      const cs = this.coneData[i * 6], cu = this.coneData[i * 6 + 1];
      if (this.coneData[i * 6 + 3] === 0) continue;
      if (Math.abs(cs - s) < 3.2 && Math.abs(cu - u) < 1.6) {
        this.coneData[i * 6 + 3] = 0;
        out.push({ s: cs, u: cu });
      }
    }
    if (out.length && this.cones) this.cones.updateInstances(this.coneData);
  }
  resetCones(): void {
    for (let i = 0; i < this.coneCount; i++) this.coneData[i * 6 + 3] = 1;
    if (this.cones) this.cones.updateInstances(this.coneData);
  }

  updateLasers(time: number, act: (h: import('../track/generator').Hazard, t: number) => number, warn: (h: import('../track/generator').Hazard, t: number) => number): void {
    for (const l of this.lasers) {
      const a = act(l.h, time);
      const w = warn(l.h, time);
      this.laserAct[l.idx] = a > 0 ? 1 + 0.3 * Math.sin(time * 60) : w * 0.35 * (0.5 + 0.5 * Math.sin(time * 30));
    }
  }

  drawProps(prep: (p: Program) => void, sCar: number, time: number): void {
    if (!this.props) return;
    const p = this.tsProg.use();
    prep(p);
    p.f('uSCar', sCar).f('uTime', time);
    const l = p.u('uLaser[0]');
    if (l) this.gl.uniform1fv(l, this.laserAct);
    this.props.draw();
  }
  drawDecals(prep: (p: Program) => void, sCar: number): void {
    if (!this.decals) return;
    const gl = this.gl;
    const p = this.dcProg.use();
    prep(p);
    p.f('uSCar', sCar);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-2, -4);
    this.decals.draw();
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
