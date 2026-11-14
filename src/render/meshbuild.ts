// Flat-shaded procedural mesh builder with vertex colours and material flags.
// Vertex: pos3 f32, nrm3 f32, col4 u8 (rgb, spec), aux4 u8 (sway, emissive, hueMask, span) = 32 bytes.

import { Rng } from '../core/rng';

export type V3 = [number, number, number];
export interface Mat { c: V3; spec?: number; sway?: number; emis?: number; hue?: number; span?: number }

export class MB {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  aux: number[] = [];
  private stack: Float64Array[] = [];
  private m = ident();
  rng: Rng;
  /** build the distance version: blobs as plain icosahedra and cones without their undersides. The random
   *  numbers are drawn exactly as for the full model, so it is the same tree with fewer triangles. */
  lod = false;
  constructor(seed = 1) {
    this.rng = new Rng(seed);
  }
  push(): this { this.stack.push(this.m.slice()); return this; }
  pop(): this { this.m = this.stack.pop()!; return this; }
  t(x: number, y: number, z: number): this { this.m = mulM(this.m, trans(x, y, z)); return this; }
  ry(a: number): this { this.m = mulM(this.m, rotY(a)); return this; }
  rx(a: number): this { this.m = mulM(this.m, rotX(a)); return this; }
  rz(a: number): this { this.m = mulM(this.m, rotZ(a)); return this; }
  s(x: number, y = x, z = x): this { this.m = mulM(this.m, scl(x, y, z)); return this; }

  private xf(p: V3): V3 {
    const m = this.m;
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  }
  /** add a triangle in local coords; orient so the normal points away from `ctr` (local) if given */
  tri(a: V3, b: V3, c: V3, mat: Mat, ctr?: V3): this {
    let A = this.xf(a), B = this.xf(b), C = this.xf(c);
    let n = cross(sub(B, A), sub(C, A));
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return this;
    n = [n[0] / len, n[1] / len, n[2] / len];
    if (ctr) {
      const cw = this.xf(ctr);
      const mid: V3 = [(A[0] + B[0] + C[0]) / 3 - cw[0], (A[1] + B[1] + C[1]) / 3 - cw[1], (A[2] + B[2] + C[2]) / 3 - cw[2]];
      if (dot(n, mid) < 0) {
        const t = B; B = C; C = t;
        n = [-n[0], -n[1], -n[2]];
      }
    }
    for (const p of [A, B, C]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(to8(lin2srgbish(mat.c[0])), to8(lin2srgbish(mat.c[1])), to8(lin2srgbish(mat.c[2])), to8(mat.spec ?? 0.1));
      this.aux.push(to8(mat.sway ?? 0), to8(mat.emis ?? 0), to8(mat.hue ?? 1), to8(mat.span ?? 0));
    }
    return this;
  }
  quad(a: V3, b: V3, c: V3, d: V3, mat: Mat, ctr?: V3): this {
    this.tri(a, b, c, mat, ctr);
    this.tri(a, c, d, mat, ctr);
    return this;
  }
  /** double sided quad */
  card(a: V3, b: V3, c: V3, d: V3, mat: Mat): this {
    this.tri(a, b, c, mat).tri(a, c, d, mat).tri(a, c, b, mat).tri(a, d, c, mat);
    return this;
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, mat: Mat): this {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy, y1 = cy + sy, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const ctr: V3 = [cx, cy + sy / 2, cz];
    const P: V3[] = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const F = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
    for (const f of F) this.quad(P[f[0]], P[f[1]], P[f[2]], P[f[3]], mat, ctr);
    return this;
  }
  /** frustum / cylinder along +y */
  cyl(x: number, y: number, z: number, r0: number, r1: number, h: number, segs: number, mat: Mat, caps = true, jitter = 0): this {
    const ring = (r: number, yy: number, ph: number): V3[] => {
      const out: V3[] = [];
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2 + ph;
        const j = 1 + (jitter ? (this.rng.float() - 0.5) * jitter : 0);
        out.push([x + Math.cos(a) * r * j, yy, z + Math.sin(a) * r * j]);
      }
      return out;
    };
    const A = ring(r0, y, 0), B = ring(r1, y + h, 0);
    const ctr: V3 = [x, y + h / 2, z];
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      if (r1 > 1e-4) this.quad(A[i], A[j], B[j], B[i], mat, ctr);
      else this.tri(A[i], A[j], [x, y + h, z], mat, ctr);
    }
    if (caps && !(this.lod && (r1 < r0 * 0.25 || segs <= 6))) {
      for (let i = 1; i < segs - 1; i++) {
        this.tri(A[0], A[i], A[i + 1], mat, ctr);
        if (r1 > 1e-4) this.tri(B[0], B[i], B[i + 1], mat, ctr);
      }
    }
    return this;
  }
  /** low-poly blob (subdivided icosahedron) with jitter */
  blob(x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: Mat, jitter = 0.18, detail = 1): this {
    const full = ico(detail);
    // (an icosahedron's 12 corners are the first 12 points of every subdivision of it)
    const { v, f } = this.lod ? ico(0) : full;
    const js = full.v.map(() => 1 + (this.rng.float() - 0.5) * 2 * jitter);
    const pts = v.map((p, i) => [x + p[0] * sx * js[i], y + p[1] * sy * js[i], z + p[2] * sz * js[i]] as V3);
    const ctr: V3 = [x, y, z];
    for (const t of f) this.tri(pts[t[0]], pts[t[1]], pts[t[2]], mat, ctr);
    return this;
  }
  /** lathe a (r, y) profile around +y */
  lathe(prof: [number, number][], segs: number, mat: Mat | ((i: number) => Mat), x = 0, z = 0): this {
    for (let k = 0; k < prof.length - 1; k++) {
      const [r0, y0] = prof[k], [r1, y1] = prof[k + 1];
      const m = typeof mat === 'function' ? mat(k) : mat;
      const ctr: V3 = [x, (y0 + y1) / 2, z];
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
        const p00: V3 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0];
        const p01: V3 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0];
        const p10: V3 = [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1];
        const p11: V3 = [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1];
        if (r0 > 1e-4 && r1 > 1e-4) this.quad(p00, p01, p11, p10, m, ctr);
        else if (r0 > 1e-4) this.tri(p00, p01, p10, m, ctr);
        else if (r1 > 1e-4) this.tri(p00, p11, p10, m, ctr);
      }
    }
    return this;
  }
  /** prism: extrude a 2D polygon (x,y) along z */
  prism(poly: [number, number][], z0: number, z1: number, mat: Mat): this {
    let cx = 0, cy = 0;
    for (const p of poly) { cx += p[0]; cy += p[1]; }
    cx /= poly.length; cy /= poly.length;
    const ctr: V3 = [cx, cy, (z0 + z1) / 2];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      this.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], mat, ctr);
    }
    for (let i = 1; i < n - 1; i++) {
      this.tri([poly[0][0], poly[0][1], z0], [poly[i][0], poly[i][1], z0], [poly[i + 1][0], poly[i + 1][1], z0], mat, ctr);
      this.tri([poly[0][0], poly[0][1], z1], [poly[i][0], poly[i][1], z1], [poly[i + 1][0], poly[i + 1][1], z1], mat, ctr);
    }
    return this;
  }
  /** beam between two points with square cross-section */
  beam(a: V3, b: V3, w: number, mat: Mat): this {
    const d = sub(b, a);
    const len = Math.hypot(d[0], d[1], d[2]);
    const yaw = Math.atan2(d[0], d[2]);
    const pitch = Math.asin(d[1] / len);
    this.push().t(a[0], a[1], a[2]).ry(yaw).rx(-pitch);
    this.box(0, -w / 2, len / 2, w, w, len, mat);
    this.pop();
    return this;
  }
  get vertexCount(): number {
    return this.pos.length / 3;
  }
  pack(): ArrayBuffer {
    const n = this.vertexCount;
    const buf = new ArrayBuffer(n * 32);
    const f = new Float32Array(buf);
    const u = new Uint8Array(buf);
    for (let i = 0; i < n; i++) {
      f[i * 8] = this.pos[i * 3];
      f[i * 8 + 1] = this.pos[i * 3 + 1];
      f[i * 8 + 2] = this.pos[i * 3 + 2];
      f[i * 8 + 3] = this.nrm[i * 3];
      f[i * 8 + 4] = this.nrm[i * 3 + 1];
      f[i * 8 + 5] = this.nrm[i * 3 + 2];
      for (let k = 0; k < 4; k++) {
        u[i * 32 + 24 + k] = this.col[i * 4 + k];
        u[i * 32 + 28 + k] = this.aux[i * 4 + k];
      }
    }
    return buf;
  }
  bounds(): { min: V3; max: V3 } {
    const min: V3 = [1e9, 1e9, 1e9], max: V3 = [-1e9, -1e9, -1e9];
    for (let i = 0; i < this.pos.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], this.pos[i + k]);
        max[k] = Math.max(max[k], this.pos[i + k]);
      }
    return { min, max };
  }
}

// colour is stored as sqrt (cheap gamma) to keep precision in 8 bits; shader squares it back
function lin2srgbish(x: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, x)));
}
function to8(x: number): number {
  return Math.max(0, Math.min(255, Math.round(x * 255)));
}

function ident(): Float64Array {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}
function mulM(a: Float64Array, b: Float64Array): Float64Array {
  const r = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let rI = 0; rI < 4; rI++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + rI] * b[c * 4 + k];
      r[c * 4 + rI] = s;
    }
  return r;
}
function trans(x: number, y: number, z: number): Float64Array { const m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
function scl(x: number, y: number, z: number): Float64Array { const m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
function rotY(a: number): Float64Array { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[8] = s; m[2] = -s; m[10] = c; return m; }
function rotX(a: number): Float64Array { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[9] = -s; m[6] = s; m[10] = c; return m; }
function rotZ(a: number): Float64Array { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[4] = -s; m[1] = s; m[5] = c; return m; }
export function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function dot(a: V3, b: V3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

let icoCache: { v: V3[]; f: number[][] }[] = [];
function ico(detail: number): { v: V3[]; f: number[][] } {
  if (icoCache[detail]) return icoCache[detail];
  const t = (1 + Math.sqrt(5)) / 2;
  let v: V3[] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const norm = (p: V3): V3 => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; };
  v = v.map(norm);
  for (let d = 0; d < detail; d++) {
    const mid = new Map<string, number>();
    const m = (a: number, b: number) => {
      const k = a < b ? a + '_' + b : b + '_' + a;
      let i = mid.get(k);
      if (i === undefined) {
        i = v.length;
        v.push(norm([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]));
        mid.set(k, i);
      }
      return i;
    };
    const nf: number[][] = [];
    for (const [a, b, c] of f) {
      const ab = m(a, b), bc = m(b, c), ca = m(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    f = nf;
  }
  icoCache[detail] = { v, f };
  return icoCache[detail];
}
