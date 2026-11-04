// Procedural, tileable material textures rendered on the GPU at load time (then mipmapped).

import { GL, Program } from './gl';
import { PRELUDE } from './glsl';

const VS = PRELUDE + `
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0,1); }`;

const FS = PRELUDE + `
in vec2 vUv;
out vec4 o;
uniform int uKind; // 0 asphalt, 1 ground, 2 noise
uniform int uType; // ground type
uniform float uSeed;
// periodic value noise on a lattice of size P
float h(vec2 p, float P){ p = mod(p, P); return fract(sin(dot(p + uSeed, vec2(127.1, 311.7))) * 43758.5453); }
float pn(vec2 p, float P){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h(i,P), h(i+vec2(1,0),P), u.x), mix(h(i+vec2(0,1),P), h(i+vec2(1,1),P), u.x), u.y); }
float pfbm(vec2 uv, float P, int oct){ float s = 0.0, a = 0.5, tot = 0.0; for (int i = 0; i < 7; i++){ if (i >= oct) break; s += a*pn(uv*P, P); tot += a; P *= 2.0; a *= 0.5; } return s/tot; }
// cellular (worley) periodic
float cell(vec2 uv, float P){ vec2 p = uv*P; vec2 i = floor(p), f = fract(p); float d = 9.0;
  for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++){ vec2 g = vec2(x,y); vec2 r = vec2(h(i+g,P), h(i+g+17.0,P)); d = min(d, length(g + r - f)); } return d; }
void main(){
  vec2 uv = vUv;
  if (uKind == 0) {
    // asphalt: aggregate speckle + tar patches + fine cracks
    float agg = pn(uv*512.0, 512.0)*0.6 + pn(uv*256.0, 256.0)*0.4;
    float spk = step(0.82, h(floor(uv*700.0), 700.0)) * 0.35;
    float blot = pfbm(uv, 4.0, 5);
    float crack = smoothstep(0.035, 0.0, abs(cell(uv, 6.0) - 0.55)) * step(0.55, pfbm(uv+0.3, 3.0, 3));
    float lum = 0.75 + (agg - 0.5)*0.35 + spk - (blot - 0.5)*0.35;
    float rough = clamp(0.75 + (agg-0.5)*0.3 - (1.0-blot)*0.15, 0.0, 1.0);
    o = vec4(lum*0.8, rough, crack, blot);
  } else if (uKind == 1) {
    float a = pfbm(uv, 4.0, 6), b = pfbm(uv + 0.37, 16.0, 4), c = pfbm(uv + 0.71, 64.0, 3);
    float t = a, det = 0.5 + (b - 0.5) * 0.8 + (c - 0.5) * 0.4, m = 0.0, r = 0.85;
    if (uType == 0 || uType == 7) { // grass / forest floor: blades + clumps
      float blades = pn(vec2(uv.x*900.0, uv.y*300.0), 300.0);
      det = 0.45 + blades*0.35 + (b-0.5)*0.4;
      m = smoothstep(0.62, 0.75, pfbm(uv+0.11, 8.0, 4));
      if (uType == 7) { m = smoothstep(0.5, 0.7, pfbm(uv+0.2, 10.0, 4)); det = 0.4 + c*0.5; }
    } else if (uType == 1) { // sand ripples
      float rip = sin((uv.y + pfbm(uv, 4.0, 3)*0.15) * 6.2831 * 40.0) * 0.5 + 0.5;
      det = 0.6 + rip * 0.25 + (c - 0.5) * 0.25;
      m = smoothstep(0.6, 0.8, a);
      r = 0.95;
    } else if (uType == 2) { // snow
      det = 0.85 + (b - 0.5) * 0.15 + step(0.97, h(floor(uv*800.0), 800.0)) * 0.4;
      m = smoothstep(0.55, 0.75, a) * 0.6;
      r = 0.6;
    } else if (uType == 3) { // marsh: mud + grass mottling
      det = 0.5 + (b - 0.5) * 0.7;
      m = smoothstep(0.45, 0.6, pfbm(uv+0.5, 6.0, 5));
      r = 0.55;
    } else if (uType == 4) { // alpine grass + rock
      det = 0.5 + (c - 0.5) * 0.6;
      m = smoothstep(0.5, 0.65, pfbm(uv+0.9, 5.0, 5));
    } else if (uType == 5) { // city paving tiles
      vec2 g = fract(uv * 8.0);
      float joint = smoothstep(0.03, 0.0, min(min(g.x, 1.0-g.x), min(g.y, 1.0-g.y)));
      det = 0.6 + (b - 0.5) * 0.25 - joint * 0.4;
      m = joint;
      r = 0.4;
    } else if (uType == 6) { // dry dirt with cracks
      float cr = smoothstep(0.05, 0.0, abs(cell(uv, 12.0) - 0.6));
      det = 0.6 + (b - 0.5)*0.5 - cr*0.35;
      m = smoothstep(0.55, 0.7, a);
    }
    o = vec4(t, clamp(det, 0.0, 1.0), m, r);
  } else {
    o = vec4(pfbm(uv, 8.0, 5), pfbm(uv + 0.5, 16.0, 4), h(floor(uv*256.0), 256.0), pfbm(uv + 0.25, 4.0, 6));
  }
}`;

export class MaterialTextures {
  asphalt: WebGLTexture;
  ground: WebGLTexture;
  noise: WebGLTexture;
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  private fb: WebGLFramebuffer;
  private aniso: number;
  private groundType = -1;
  constructor(private gl: GL) {
    this.prog = new Program(gl, VS, FS, 'texgen');
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.fb = gl.createFramebuffer()!;
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    this.aniso = ext ? Math.min(16, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;
    this.asphalt = this.make(1024, 0, 0, 1.3);
    this.noise = this.make(256, 2, 0, 4.1);
    this.ground = this.make(1024, 1, 0, 2.7);
    this.groundType = 0;
  }
  setGround(type: number): void {
    if (type === this.groundType) return;
    this.gl.deleteTexture(this.ground);
    this.ground = this.make(1024, 1, type, 2.7 + type);
    this.groundType = type;
  }
  private make(size: number, kind: number, type: number, seed: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    const levels = Math.floor(Math.log2(size)) + 1;
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, size, size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.prog.use().i('uKind', kind).i('uType', type).f('uSeed', seed);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, 0x84fe /* TEXTURE_MAX_ANISOTROPY_EXT */, this.aniso);
    return t;
  }
}
