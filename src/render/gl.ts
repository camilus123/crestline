import { glStats } from './prof';
// Thin WebGL2 helpers: programs, meshes, textures, framebuffers.

export type GL = WebGL2RenderingContext;

export class Program {
  readonly p!: WebGLProgram;
  private loc = new Map<string, WebGLUniformLocation | null>();
  private units = new Map<string, number>();
  private checked = false;
  private sh: { s: WebGLShader; type: number; src: string }[] = [];
  /**
   * Compiling and linking only START here; nothing asks for the result until the program is first used.
   * Asking (COMPILE_STATUS, LINK_STATUS, uniform locations) makes the browser wait for that one shader, so
   * checking each program as it is created compiles them strictly one after another, which on Windows (where
   * every shader goes through the Direct3D compiler) made the game take a long time to start. Created like this,
   * the browser compiles all of them at once on its worker threads.
   */
  constructor(private gl: GL, vs: string, fs: string, private name: string) {
    // One program per source, however often it is asked for. The scenery and the hazards make their programs
    // anew for every race; without this each race compiled them again (a pause on browsers that keep no shader
    // cache) and the old ones were never freed.
    let made = Program.made.get(gl);
    if (!made) Program.made.set(gl, (made = new Map()));
    const key = vs + '\u0000' + fs;
    const hit = made.get(key);
    if (hit) return hit;
    made.set(key, this);
    const mk = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      this.sh.push({ s: sh, type, src });
      return sh;
    };
    Program.sources.push({ name, vs, fs });
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    this.p = p;
  }
  private static made = new WeakMap<GL, Map<string, Program>>();
  /** every program made so far (for the compile-time measurement below) */
  static sources: { name: string; vs: string; fs: string }[] = [];
  /**
   * How long the graphics driver takes to compile and link each program, measured by building it again with a
   * changed comment (so that no cache can answer) and waiting for the result. One program per call of `step`,
   * so the page stays alive. Then all of them at once, which is what start-up does.
   */
  static async timeCompiles(gl: GL, step: (done: number, of: number) => Promise<void>, drain: () => void,
    probes: { name: string; vs: string; fs: string }[] = []): Promise<{ each: { name: string; ms: number }[]; together: number; probes: { name: string; ms: number; ok: boolean }[] }> {
    const list = Program.sources.slice();
    const nonce = () => `\n// ${Math.random().toString(36).slice(2)} ${performance.now()}\n`;
    const start = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      const sh = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, i) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, (i ? fs : vs) + nonce());
        gl.compileShader(s);
        gl.attachShader(p, s);
        return s;
      });
      gl.linkProgram(p);
      return { p, sh };
    };
    const wait = (x: { p: WebGLProgram; sh: WebGLShader[] }) => {
      const ok = !!gl.getProgramParameter(x.p, gl.LINK_STATUS); // (blocks until the program is ready)
      for (const s of x.sh) gl.deleteShader(s);
      gl.deleteProgram(x.p);
      return ok;
    };
    const each: { name: string; ms: number }[] = [];
    for (let i = 0; i < list.length; i++) {
      await step(i, list.length + 1 + probes.length);
      drain(); // (whatever the game has queued for the GPU must not be counted)
      const t0 = performance.now();
      wait(start(list[i].vs, list[i].fs));
      each.push({ name: list[i].name, ms: performance.now() - t0 });
    }
    const n = list.length + 1 + probes.length;
    await step(list.length, n);
    drain();
    const t0 = performance.now();
    const all = list.map((x) => start(x.vs, x.fs));
    for (const x of all) wait(x);
    const together = performance.now() - t0;
    Program.sources = list; // (the copies above are not programs of the game)
    const pr: { name: string; ms: number; ok: boolean }[] = [];
    for (let i = 0; i < probes.length; i++) {
      await step(list.length + 1 + i, n);
      drain();
      const t1 = performance.now();
      const ok = wait(start(probes[i].vs, probes[i].fs));
      pr.push({ name: probes[i].name, ms: performance.now() - t1, ok });
    }
    return { each, together, probes: pr };
  }
  /** first use: report compile / link errors, set the fixed sampler units */
  private check(): void {
    this.checked = true;
    const gl = this.gl, p = this.p;
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      for (const { s, type, src } of this.sh) {
        if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) continue;
        const log = gl.getShaderInfoLog(s) || '';
        const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`);
        const m = /0:(\d+)/.exec(log);
        const ln = m ? +m[1] : 0;
        throw new Error(`Shader ${this.name} (${type === gl.VERTEX_SHADER ? 'vs' : 'fs'}) error: ${log}\n${lines.slice(Math.max(0, ln - 4), ln + 2).join('\n')}`);
      }
      throw new Error(`Link ${this.name}: ${gl.getProgramInfoLog(p)}`);
    }
    for (const { s } of this.sh) gl.deleteShader(s);
    this.sh.length = 0;
    // the sun shadow maps always live on fixed texture units (a 1x1 'fully lit' depth texture when shadows are off)
    const sl = gl.getUniformLocation(p, 'uShadowMap');
    if (sl) {
      const cur = gl.getParameter(gl.CURRENT_PROGRAM);
      gl.useProgram(p);
      gl.uniform1i(sl, SHADOW_UNIT);
      const sl2 = gl.getUniformLocation(p, 'uShadowMap2');
      if (sl2) gl.uniform1i(sl2, SHADOW_UNIT2);
      gl.useProgram(cur);
    }
  }
  use(): this {
    if (!this.checked) this.check();
    this.gl.useProgram(this.p);
    return this;
  }
  u(name: string): WebGLUniformLocation | null {
    let l = this.loc.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.p, name);
      this.loc.set(name, l);
    }
    return l;
  }
  f(name: string, x: number): this { const l = this.u(name); if (l) this.gl.uniform1f(l, x); return this; }
  i(name: string, x: number): this { const l = this.u(name); if (l) this.gl.uniform1i(l, x); return this; }
  v2(name: string, x: number, y: number): this { const l = this.u(name); if (l) this.gl.uniform2f(l, x, y); return this; }
  v3(name: string, x: number | ArrayLike<number>, y?: number, z?: number): this {
    const l = this.u(name);
    if (l) {
      if (typeof x === 'number') this.gl.uniform3f(l, x, y!, z!);
      else this.gl.uniform3f(l, x[0], x[1], x[2]);
    }
    return this;
  }
  v4(name: string, x: number | ArrayLike<number>, y?: number, z?: number, w?: number): this {
    const l = this.u(name);
    if (l) {
      if (typeof x === 'number') this.gl.uniform4f(l, x, y!, z!, w!);
      else this.gl.uniform4f(l, x[0], x[1], x[2], x[3]);
    }
    return this;
  }
  v4a(name: string, a: Float32Array): this { const l = this.u(name); if (l) this.gl.uniform4fv(l, a); return this; }
  v3a(name: string, a: Float32Array): this { const l = this.u(name); if (l) this.gl.uniform3fv(l, a); return this; }
  m4(name: string, m: Float32Array): this { const l = this.u(name); if (l) this.gl.uniformMatrix4fv(l, false, m); return this; }
  tex(name: string, t: WebGLTexture | null, unit: number, target: number = WebGL2RenderingContext.TEXTURE_2D): this {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, t);
    if (this.units.get(name) !== unit) {
      const l = this.u(name);
      if (l) gl.uniform1i(l, unit);
      this.units.set(name, unit);
    }
    return this;
  }
}

export interface AttribSpec {
  loc: number;
  size: number;
  type: number;
  normalized?: boolean;
  offset: number;
  divisor?: number;
  integer?: boolean;
}

/** A VAO with one interleaved vertex buffer, optional index buffer and optional instance buffer. */
export class Mesh {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer | null = null;
  count: number;
  indexType = 0;
  inst: WebGLBuffer | null = null;
  instSpec: AttribSpec[] = [];
  instStride = 0;
  constructor(private gl: GL, data: ArrayBuffer | ArrayBufferView, stride: number, attribs: AttribSpec[], count: number, indices?: Uint16Array | Uint32Array) {
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data as BufferSource, gl.STATIC_DRAW);
    for (const a of attribs) {
      gl.enableVertexAttribArray(a.loc);
      if (a.integer) gl.vertexAttribIPointer(a.loc, a.size, a.type, stride, a.offset);
      else gl.vertexAttribPointer(a.loc, a.size, a.type, !!a.normalized, stride, a.offset);
    }
    if (indices) {
      this.ibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      this.indexType = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      this.count = indices.length;
    } else this.count = count;
    gl.bindVertexArray(null);
  }
  /** attach a per-instance buffer */
  setInstances(data: ArrayBufferView, stride: number, spec: AttribSpec[], usage: number = WebGL2RenderingContext.STATIC_DRAW): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    if (!this.inst) this.inst = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, data as BufferSource, usage);
    for (const a of spec) {
      gl.enableVertexAttribArray(a.loc);
      gl.vertexAttribPointer(a.loc, a.size, a.type, !!a.normalized, stride, a.offset);
      gl.vertexAttribDivisor(a.loc, 1);
    }
    this.instSpec = spec;
    this.instStride = stride;
    gl.bindVertexArray(null);
  }
  /** use another mesh's per-instance buffer (a stand-in model for the same objects; follows its updates) */
  shareInstances(from: Mesh): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    this.inst = from.inst;
    gl.bindBuffer(gl.ARRAY_BUFFER, from.inst);
    for (const a of from.instSpec) {
      gl.enableVertexAttribArray(a.loc);
      gl.vertexAttribPointer(a.loc, a.size, a.type, !!a.normalized, from.instStride, a.offset);
      gl.vertexAttribDivisor(a.loc, 1);
    }
    this.instSpec = from.instSpec;
    this.instStride = from.instStride;
    gl.bindVertexArray(null);
  }
  updateInstances(data: ArrayBufferView, byteLen?: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    if (byteLen !== undefined) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data as ArrayBufferView, 0, byteLen / ((data as Float32Array).BYTES_PER_ELEMENT || 1));
    else gl.bufferSubData(gl.ARRAY_BUFFER, 0, data as BufferSource);
  }
  draw(mode: number = WebGL2RenderingContext.TRIANGLES): void {
    const gl = this.gl;
    glStats.calls++;
    glStats.verts += this.count;
    gl.bindVertexArray(this.vao);
    if (this.ibo) gl.drawElements(mode, this.count, this.indexType, 0);
    else gl.drawArrays(mode, 0, this.count);
  }
  /** draw instances [first, first+n) by rebinding instance attribute offsets (no baseInstance in WebGL2) */
  drawInstances(first: number, n: number, mode: number = WebGL2RenderingContext.TRIANGLES): void {
    if (n <= 0) return;
    const gl = this.gl;
    glStats.calls++;
    glStats.instances += n;
    glStats.verts += this.count * n;
    gl.bindVertexArray(this.vao);
    if (first !== 0 || (this as any)._lastFirst !== 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
      for (const a of this.instSpec) gl.vertexAttribPointer(a.loc, a.size, a.type, !!a.normalized, this.instStride, a.offset + first * this.instStride);
      (this as any)._lastFirst = first;
    }
    if (this.ibo) gl.drawElementsInstanced(mode, this.count, this.indexType, 0, n);
    else gl.drawArraysInstanced(mode, 0, this.count, n);
  }
}

export function createTexture(gl: GL, w: number, h: number, internal: number, format: number, type: number, data: ArrayBufferView | null, filter: number = WebGL2RenderingContext.LINEAR, wrap: number = WebGL2RenderingContext.CLAMP_TO_EDGE): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}

export class Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  depth: WebGLRenderbuffer | null = null;
  w = 0;
  h = 0;
  constructor(private gl: GL, private internal: number, private format: number, private type: number, private withDepth: boolean) {
    this.fb = gl.createFramebuffer()!;
    this.tex = gl.createTexture()!;
  }
  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.internal, w, h, 0, this.format, this.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    if (this.withDepth) {
      if (!this.depth) this.depth = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  bind(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.w, this.h);
  }
}

/** Multisampled colour+depth target that resolves into a Target texture. */
export class MSTarget {
  fb: WebGLFramebuffer;
  color: WebGLRenderbuffer;
  depth: WebGLRenderbuffer;
  w = 0;
  h = 0;
  samples = 0;
  constructor(private gl: GL, private internal: number) {
    this.fb = gl.createFramebuffer()!;
    this.color = gl.createRenderbuffer()!;
    this.depth = gl.createRenderbuffer()!;
  }
  private maxSamples: number | undefined;
  resize(w: number, h: number, samples: number): void {
    const gl = this.gl;
    // (asked once: every getParameter makes the page wait for the GPU process, and this runs each frame)
    this.maxSamples ??= gl.getParameter(gl.MAX_SAMPLES) as number;
    samples = Math.min(samples, this.maxSamples);
    if (w === this.w && h === this.h && samples === this.samples) return;
    this.w = w;
    this.h = h;
    this.samples = samples;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.color);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, this.internal, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.color);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  bind(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.w, this.h);
  }
  resolve(dst: Target): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.fb);
    gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, dst.w, dst.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }
}

export const SHADOW_UNIT = 6;
/** the far shadow cascade */
export const SHADOW_UNIT2 = 5;

// --- tiny matrix helpers (column-major) ---
export function ortho(out: Float32Array, l: number, r: number, b: number, t: number, n: number, f: number): Float32Array {
  out.fill(0);
  out[0] = 2 / (r - l);
  out[5] = 2 / (t - b);
  out[10] = -2 / (f - n);
  out[12] = -(r + l) / (r - l);
  out[13] = -(t + b) / (t - b);
  out[14] = -(f + n) / (f - n);
  out[15] = 1;
  return out;
}
export function perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function mul4(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let rI = 0; rI < 4; rI++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + rI] * b[c * 4 + k];
      r[c * 4 + rI] = s;
    }
  out.set(r);
  return out;
}

/** View matrix for bent space (x right, y up, z forward) -> GL eye space (z towards viewer). */
export function viewFromBasis(out: Float32Array, eye: number[], right: number[], up: number[], fwd: number[]): Float32Array {
  out[0] = right[0]; out[4] = right[1]; out[8] = right[2];
  out[1] = up[0]; out[5] = up[1]; out[9] = up[2];
  out[2] = -fwd[0]; out[6] = -fwd[1]; out[10] = -fwd[2];
  out[3] = 0; out[7] = 0; out[11] = 0;
  out[12] = -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]);
  out[13] = -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]);
  out[14] = fwd[0] * eye[0] + fwd[1] * eye[1] + fwd[2] * eye[2];
  out[15] = 1;
  return out;
}

export function invert4(out: Float32Array, m: Float32Array): Float32Array {
  const a = m;
  const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
  const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
  const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return out;
  det = 1 / det;
  out[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det;
  out[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
  out[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det;
  out[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
  out[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det;
  out[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
  out[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det;
  out[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
  out[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det;
  out[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
  out[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det;
  out[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
  out[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det;
  out[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
  out[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det;
  out[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
  return out;
}
