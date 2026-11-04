// Thin WebGL2 helpers: programs, meshes, textures, framebuffers.

export type GL = WebGL2RenderingContext;

export class Program {
  readonly p: WebGLProgram;
  private loc = new Map<string, WebGLUniformLocation | null>();
  private units = new Map<string, number>();
  constructor(private gl: GL, vs: string, fs: string, name: string) {
    const mk = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh) || '';
        const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`);
        const m = /0:(\d+)/.exec(log);
        const ln = m ? +m[1] : 0;
        throw new Error(`Shader ${name} (${type === gl.VERTEX_SHADER ? 'vs' : 'fs'}) error: ${log}\n${lines.slice(Math.max(0, ln - 4), ln + 2).join('\n')}`);
      }
      return sh;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Link ${name}: ${gl.getProgramInfoLog(p)}`);
    this.p = p;
  }
  use(): this {
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
  updateInstances(data: ArrayBufferView, byteLen?: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    if (byteLen !== undefined) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data as ArrayBufferView, 0, byteLen / ((data as Float32Array).BYTES_PER_ELEMENT || 1));
    else gl.bufferSubData(gl.ARRAY_BUFFER, 0, data as BufferSource);
  }
  draw(mode: number = WebGL2RenderingContext.TRIANGLES): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    if (this.ibo) gl.drawElements(mode, this.count, this.indexType, 0);
    else gl.drawArrays(mode, 0, this.count);
  }
  /** draw instances [first, first+n) by rebinding instance attribute offsets (no baseInstance in WebGL2) */
  drawInstances(first: number, n: number, mode: number = WebGL2RenderingContext.TRIANGLES): void {
    if (n <= 0) return;
    const gl = this.gl;
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
  resize(w: number, h: number, samples: number): void {
    const gl = this.gl;
    const max = gl.getParameter(gl.MAX_SAMPLES) as number;
    samples = Math.min(samples, max);
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

// --- tiny matrix helpers (column-major) ---
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
