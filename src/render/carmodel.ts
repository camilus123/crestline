// Procedural car meshes: lofted smooth bodies + greenhouse + detail parts + 4 wheels.
// Vertex: pos3 f32, nrm3 f32, col4 u8 (fixed colour rgb, gloss), aux4 u8 (material, wheel, unused, unused)
// Materials: 0 paint, 1 accent paint, 2 glass, 3 chrome, 4 black trim, 5 tail light, 6 head light,
//            7 tyre, 8 rim, 9 carbon, 10 indicator/amber, 11 neon (concept), 12 exhaust tip glow

export const MAT = { PAINT: 0, ACCENT: 1, GLASS: 2, CHROME: 3, TRIM: 4, TAIL: 5, HEAD: 6, TYRE: 7, RIM: 8, CARBON: 9, AMBER: 10, NEON: 11 };

type P3 = [number, number, number];

class CarMB {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  aux: number[] = [];
  idx: number[] = [];
  vert(p: P3, n: P3, mat: number, wheel = 0, c: P3 = [1, 1, 1], gloss = 0.5): number {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.nrm.push(n[0] / l, n[1] / l, n[2] / l);
    this.col.push(c[0] * 255, c[1] * 255, c[2] * 255, gloss * 255);
    this.aux.push(mat, wheel, 0, 0);
    return i;
  }
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  /** flat-shaded triangle with outward orientation against `ctr` */
  ftri(a: P3, b: P3, c: P3, mat: number, ctr: P3, wheel = 0, col: P3 = [1, 1, 1], gloss = 0.5): void {
    let n = cross(sub(b, a), sub(c, a));
    const mid: P3 = [(a[0] + b[0] + c[0]) / 3 - ctr[0], (a[1] + b[1] + c[1]) / 3 - ctr[1], (a[2] + b[2] + c[2]) / 3 - ctr[2]];
    if (dot(n, mid) < 0) {
      const t = b; b = c; c = t;
      n = [-n[0], -n[1], -n[2]];
    }
    const i = this.vert(a, n, mat, wheel, col, gloss), j = this.vert(b, n, mat, wheel, col, gloss), k = this.vert(c, n, mat, wheel, col, gloss);
    this.tri(i, j, k);
  }
  box(c: P3, s: P3, mat: number, col: P3 = [1, 1, 1], gloss = 0.5, rotX = 0): void {
    const [cx, cy, cz] = c, [sx, sy, sz] = s;
    const P: P3[] = [];
    for (const z of [-1, 1]) for (const y of [-1, 1]) for (const x of [-1, 1]) {
      let yy = (y * sy) / 2, zz = (z * sz) / 2;
      if (rotX) { const ca = Math.cos(rotX), sa = Math.sin(rotX); const t = yy * ca - zz * sa; zz = yy * sa + zz * ca; yy = t; }
      P.push([cx + (x * sx) / 2, cy + yy, cz + zz]);
    }
    const F = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5], [2, 3, 7, 6], [0, 1, 5, 4]];
    for (const f of F) {
      this.ftri(P[f[0]], P[f[1]], P[f[2]], mat, c, 0, col, gloss);
      this.ftri(P[f[0]], P[f[2]], P[f[3]], mat, c, 0, col, gloss);
    }
  }
  /** cylinder along x (wheels, exhausts) */
  cylX(c: P3, r: number, w: number, segs: number, mat: number, wheel = 0, col: P3 = [1, 1, 1], gloss = 0.5, capMat = -1, capR = 0): void {
    const x0 = c[0] - w / 2, x1 = c[0] + w / 2;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const y0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, y1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
      const n0: P3 = [0, Math.cos(a0), Math.sin(a0)], n1: P3 = [0, Math.cos(a1), Math.sin(a1)];
      const a = this.vert([x0, c[1] + y0, c[2] + z0], n0, mat, wheel, col, gloss);
      const b = this.vert([x1, c[1] + y0, c[2] + z0], n0, mat, wheel, col, gloss);
      const cc = this.vert([x1, c[1] + y1, c[2] + z1], n1, mat, wheel, col, gloss);
      const d = this.vert([x0, c[1] + y1, c[2] + z1], n1, mat, wheel, col, gloss);
      this.orientQuad(a, b, cc, d, c);
    }
    if (capMat >= 0) {
      for (const sx of [-1, 1]) {
        const xc = c[0] + (sx * w) / 2;
        const rr = capR || r;
        for (let i = 0; i < segs; i++) {
          const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
          this.ftri([xc, c[1], c[2]], [xc, c[1] + Math.cos(a0) * rr, c[2] + Math.sin(a0) * rr], [xc, c[1] + Math.cos(a1) * rr, c[2] + Math.sin(a1) * rr], capMat, [c[0], c[1], c[2]], wheel, col, gloss);
        }
      }
    }
  }
  orientQuad(a: number, b: number, c: number, d: number, ctr: P3): void {
    const pa = this.p(a), pb = this.p(b), pc = this.p(c);
    const n = cross(sub(pb, pa), sub(pc, pa));
    const mid = sub(pa, ctr);
    if (dot(n, mid) < 0) {
      this.tri(a, c, b);
      this.tri(a, d, c);
    } else {
      this.tri(a, b, c);
      this.tri(a, c, d);
    }
  }
  p(i: number): P3 {
    return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
  }
  /**
   * Loft through cross sections. Each section: z, half-width, bottom y, top y, squareness exponents.
   * `matFn(ring, k)` lets parts of a section use another material (e.g. light strips).
   */
  loft(secs: { z: number; w: number; y0: number; y1: number; n?: number; m?: number; tuck?: number }[], ringN: number, matFn: (k: number, z: number, x: number, y: number) => number, cap = true): void {
    const grid: number[][] = [];
    const pts: P3[][] = [];
    for (const s of secs) {
      const row: P3[] = [];
      const yc = (s.y0 + s.y1) / 2, h = (s.y1 - s.y0) / 2;
      const n = s.n ?? 4, m = s.m ?? 3;
      for (let k = 0; k < ringN; k++) {
        const a = (k / ringN) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        let x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n) * s.w;
        const y = yc + Math.sign(sa) * Math.pow(Math.abs(sa), 2 / m) * h;
        // tumblehome: narrow towards the top
        if (sa > 0) x *= 1 - (s.tuck ?? 0.12) * sa * sa;
        row.push([x, y, s.z]);
      }
      pts.push(row);
    }
    // smooth normals by finite differences on the grid
    const S = secs.length;
    for (let i = 0; i < S; i++) {
      const row: number[] = [];
      for (let k = 0; k < ringN; k++) {
        const pk1 = pts[i][(k + 1) % ringN], pk0 = pts[i][(k - 1 + ringN) % ringN];
        const pi1 = pts[Math.min(S - 1, i + 1)][k], pi0 = pts[Math.max(0, i - 1)][k];
        const tk = sub(pk1, pk0), ti = sub(pi1, pi0);
        let n = cross(tk, ti);
        const p = pts[i][k];
        const out: P3 = [p[0], p[1] - (secs[i].y0 + secs[i].y1) / 2, 0];
        if (dot(n, out) < 0) n = [-n[0], -n[1], -n[2]];
        // end caps bias
        const mat = matFn(k, p[2], p[0], p[1]);
        row.push(this.vert(p, n, mat));
      }
      grid.push(row);
    }
    for (let i = 0; i < S - 1; i++)
      for (let k = 0; k < ringN; k++) {
        const a = grid[i][k], b = grid[i][(k + 1) % ringN], c = grid[i + 1][(k + 1) % ringN], d = grid[i + 1][k];
        const ctr: P3 = [0, (secs[i].y0 + secs[i].y1) / 2, (secs[i].z + secs[i + 1].z) / 2];
        this.orientQuad(a, b, c, d, ctr);
      }
    if (cap) {
      for (const i of [0, S - 1]) {
        const s = secs[i];
        const ctr: P3 = [0, (s.y0 + s.y1) / 2, s.z];
        const nrm: P3 = [0, 0, i === 0 ? -1 : 1];
        const c = this.vert(ctr, nrm, matFn(-1, s.z, 0, ctr[1]));
        const ring: number[] = [];
        for (let k = 0; k < ringN; k++) ring.push(this.vert(pts[i][k], nrm, matFn(-1, s.z, pts[i][k][0], pts[i][k][1])));
        const inner: P3 = [0, ctr[1], s.z - nrm[2]];
        for (let k = 0; k < ringN; k++) this.orientTri(c, ring[k], ring[(k + 1) % ringN], inner);
      }
    }
  }
  orientTri(a: number, b: number, c: number, inner: P3): void {
    const pa = this.p(a), pb = this.p(b), pc = this.p(c);
    const n = cross(sub(pb, pa), sub(pc, pa));
    if (dot(n, sub(pa, inner)) < 0) this.tri(a, c, b);
    else this.tri(a, b, c);
  }
  wheel(cx: number, cy: number, cz: number, r: number, w: number, id: number, style: number): void {
    const c: P3 = [cx, cy, cz];
    this.cylX(c, r, w, 24, MAT.TYRE, id, [0.06, 0.06, 0.065], 0.15, MAT.TYRE, r);
    // sidewall bulge ring
    this.cylX([cx, cy, cz], r * 0.98, w * 1.04, 24, MAT.TYRE, id, [0.08, 0.08, 0.085], 0.2);
    // rim face on the outside, spokes
    const sx = Math.sign(cx) || 1;
    const xf = cx + (sx * w) / 2 + sx * 0.005;
    const rr = r * 0.66;
    const spokes = style === 1 ? 6 : style === 2 ? 0 : 5;
    const rimC: P3 = style === 2 ? [0.12, 0.12, 0.14] : [0.75, 0.76, 0.8];
    // dish
    for (let i = 0; i < 20; i++) {
      const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2;
      this.ftri([xf - sx * 0.04, cy, cz], [xf, cy + Math.cos(a0) * rr, cz + Math.sin(a0) * rr], [xf, cy + Math.cos(a1) * rr, cz + Math.sin(a1) * rr], MAT.RIM, [cx - sx, cy, cz], id, [0.08, 0.08, 0.09], 0.4);
    }
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const ex = xf + sx * 0.012;
      const pa: P3 = [ex, cy + ca * 0.05 - sa * 0.04, cz + sa * 0.05 + ca * 0.04];
      const pb: P3 = [ex, cy + ca * 0.05 + sa * 0.04, cz + sa * 0.05 - ca * 0.04];
      const pc: P3 = [ex, cy + ca * rr + sa * 0.065, cz + sa * rr - ca * 0.065];
      const pd: P3 = [ex, cy + ca * rr - sa * 0.065, cz + sa * rr + ca * 0.065];
      const ctr: P3 = [cx - sx, cy, cz];
      this.ftri(pa, pb, pc, MAT.RIM, ctr, id, rimC, 0.85);
      this.ftri(pa, pc, pd, MAT.RIM, ctr, id, rimC, 0.85);
    }
    if (style === 2) {
      // concept: solid aero disc with glowing ring
      for (let i = 0; i < 20; i++) {
        const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2;
        const ex = xf + sx * 0.01;
        this.ftri([ex, cy, cz], [ex, cy + Math.cos(a0) * rr, cz + Math.sin(a0) * rr], [ex, cy + Math.cos(a1) * rr, cz + Math.sin(a1) * rr], MAT.RIM, [cx - sx, cy, cz], id, [0.85, 0.87, 0.9], 0.9);
        const r2 = rr * 1.02, r3 = rr * 1.1, e2 = ex + sx * 0.002;
        this.ftri([e2, cy + Math.cos(a0) * r2, cz + Math.sin(a0) * r2], [e2, cy + Math.cos(a1) * r2, cz + Math.sin(a1) * r2], [e2, cy + Math.cos(a1) * r3, cz + Math.sin(a1) * r3], MAT.NEON, [cx - sx, cy, cz], id);
        this.ftri([e2, cy + Math.cos(a0) * r2, cz + Math.sin(a0) * r2], [e2, cy + Math.cos(a1) * r3, cz + Math.sin(a1) * r3], [e2, cy + Math.cos(a0) * r3, cz + Math.sin(a0) * r3], MAT.NEON, [cx - sx, cy, cz], id);
      }
    }
    // centre cap
    this.cylX([xf + sx * 0.02, cy, cz], 0.06, 0.03, 10, MAT.CHROME, id, [0.9, 0.9, 0.9], 0.9, MAT.CHROME);
    // brake disc + calliper (do not spin: wheel 0, but positioned at the wheel)
    this.cylX([cx - sx * 0.02, cy, cz], r * 0.55, 0.03, 18, MAT.CHROME, 0, [0.45, 0.45, 0.48], 0.6, MAT.CHROME);
    this.box([cx - sx * 0.01, cy + r * 0.38, cz - r * 0.2], [0.07, 0.12, 0.2], MAT.ACCENT, [1, 1, 1], 0.7);
  }
  pack(): { data: ArrayBuffer; idx: Uint32Array; count: number } {
    const n = this.pos.length / 3;
    const buf = new ArrayBuffer(n * 32);
    const f = new Float32Array(buf);
    const u = new Uint8Array(buf);
    for (let i = 0; i < n; i++) {
      f.set([this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2], this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2]], i * 8);
      for (let k = 0; k < 4; k++) {
        u[i * 32 + 24 + k] = Math.max(0, Math.min(255, Math.round(this.col[i * 4 + k])));
        u[i * 32 + 28 + k] = this.aux[i * 4 + k];
      }
    }
    return { data: buf, idx: Uint32Array.from(this.idx), count: this.idx.length };
  }
}

function sub(a: P3, b: P3): P3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: P3, b: P3): P3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a: P3, b: P3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

export interface CarGeo {
  data: ArrayBuffer;
  idx: Uint32Array;
  count: number;
  wheels: number[]; // x,y,z,r per wheel (4)
  tailLights: [number, number, number][]; // glow sprite positions
  headLights: [number, number, number][];
  length: number;
  width: number;
}

/** 0 Stiletto (wedge supercar), 1 Sprite (roadster), 2 Halo (concept) */
export function buildCar(id: number): CarGeo {
  const b = new CarMB();
  const R = 24;
  let wheels: number[] = [];
  let tail: [number, number, number][] = [];
  let head: [number, number, number][] = [];
  let length = 4.5, width = 1.98;
  if (id === 0) {
    // ---------- Vantor Stiletto: sharp wedge ----------
    const secs = [
      { z: -2.25, w: 0.9, y0: 0.34, y1: 0.93, n: 6, m: 5 },
      { z: -2.12, w: 0.97, y0: 0.3, y1: 0.98, n: 6, m: 5 },
      { z: -1.75, w: 1.0, y0: 0.28, y1: 1.0, n: 6, m: 4 },
      { z: -1.1, w: 1.0, y0: 0.27, y1: 0.97, n: 6, m: 4 },
      { z: -0.3, w: 0.98, y0: 0.27, y1: 0.9, n: 6, m: 4 },
      { z: 0.6, w: 0.97, y0: 0.27, y1: 0.8, n: 6, m: 4 },
      { z: 1.45, w: 0.95, y0: 0.28, y1: 0.66, n: 6, m: 4 },
      { z: 1.95, w: 0.9, y0: 0.29, y1: 0.54, n: 5, m: 4 },
      { z: 2.2, w: 0.82, y0: 0.31, y1: 0.44, n: 4, m: 3 },
      { z: 2.28, w: 0.7, y0: 0.33, y1: 0.4, n: 3, m: 3 },
    ];
    b.loft(secs, R, (k, z, x, y) => {
      if (k === -1 && z < 0) return MAT.TRIM; // rear cap: black panel
      if (z < -2.18 && y > 0.74 && y < 0.88 && Math.abs(x) > 0.1) return MAT.TAIL;
      if (z > 2.1 && y > 0.36 && y < 0.42 && Math.abs(x) > 0.35) return MAT.HEAD;
      if (y < 0.42 && z > -1.6 && z < 1.6) return MAT.TRIM; // sills
      return MAT.PAINT;
    });
    // greenhouse (wedge canopy)
    const gh = [
      { z: -1.42, w: 0.62, y0: 0.9, y1: 0.99, n: 3, m: 2, tuck: 0.3 },
      { z: -1.0, w: 0.68, y0: 0.88, y1: 1.1, n: 3, m: 2, tuck: 0.35 },
      { z: -0.3, w: 0.72, y0: 0.86, y1: 1.14, n: 3, m: 2, tuck: 0.35 },
      { z: 0.35, w: 0.74, y0: 0.8, y1: 1.07, n: 3, m: 2, tuck: 0.35 },
      { z: 0.95, w: 0.76, y0: 0.74, y1: 0.86, n: 3, m: 2, tuck: 0.3 },
      { z: 1.2, w: 0.74, y0: 0.7, y1: 0.73, n: 3, m: 2, tuck: 0.3 },
    ];
    b.loft(gh, R, (k, z, x, y) => (y > 1.08 && z > -0.9 && z < 0.2 ? MAT.PAINT : y < 0.9 && z < -0.9 ? MAT.PAINT : MAT.GLASS));
    // rear louvres over the engine
    for (let i = 0; i < 6; i++) b.box([0, 0.99 - i * 0.004, -1.55 - i * 0.1], [1.15, 0.025, 0.05], MAT.TRIM, [0.02, 0.02, 0.02], 0.3);
    // rear wing
    b.box([0, 1.12, -2.02], [1.9, 0.05, 0.36], MAT.PAINT);
    b.box([0, 1.16, -2.14], [1.9, 0.03, 0.12], MAT.ACCENT);
    for (const sx of [-1, 1]) {
      b.box([sx * 0.95, 1.06, -2.02], [0.03, 0.22, 0.42], MAT.PAINT);
      b.box([sx * 0.55, 1.0, -1.98], [0.05, 0.16, 0.12], MAT.TRIM, [0.05, 0.05, 0.05]);
    }
    // tail light bar + diffuser + exhausts
    b.box([0, 0.81, -2.235], [1.6, 0.08, 0.03], MAT.TAIL);
    b.box([0, 0.66, -2.24], [1.1, 0.07, 0.02], MAT.TRIM, [0.03, 0.03, 0.03]);
    for (let i = 0; i < 7; i++) b.box([-0.6 + i * 0.2, 0.31, -2.1], [0.025, 0.12, 0.35], MAT.CARBON, [0.04, 0.04, 0.05], 0.6);
    for (const sx of [-0.32, -0.18, 0.18, 0.32]) b.cylZ(b, [sx, 0.42, -2.25], 0.05, 0.12);
    // side intakes
    for (const sx of [-1, 1]) b.box([sx * 0.99, 0.62, -0.75], [0.04, 0.24, 0.7], MAT.TRIM, [0.02, 0.02, 0.02]);
    // mirrors
    for (const sx of [-1, 1]) b.box([sx * 0.86, 0.9, 0.6], [0.16, 0.07, 0.14], MAT.PAINT);
    // accent stripe along the sides
    for (const sx of [-1, 1]) b.box([sx * 0.995, 0.5, 0.2], [0.012, 0.035, 3.6], MAT.ACCENT);
    wheels = [0.84, 0.35, 1.38, 0.35, -0.84, 0.35, 1.38, 0.35, 0.86, 0.37, -1.36, 0.37, -0.86, 0.37, -1.36, 0.37];
    tail = [[-0.62, 0.81, -2.26], [-0.25, 0.81, -2.26], [0.25, 0.81, -2.26], [0.62, 0.81, -2.26]];
    head = [[-0.55, 0.39, 2.25], [0.55, 0.39, 2.25]];
  } else if (id === 1) {
    // ---------- Kestrel Sprite: compact roadster ----------
    length = 3.95;
    width = 1.76;
    const secs = [
      { z: -1.95, w: 0.78, y0: 0.36, y1: 0.86, n: 3, m: 3 },
      { z: -1.85, w: 0.86, y0: 0.32, y1: 0.92, n: 3.5, m: 3 },
      { z: -1.4, w: 0.88, y0: 0.29, y1: 0.95, n: 3.5, m: 3 },
      { z: -0.7, w: 0.86, y0: 0.29, y1: 0.86, n: 3.5, m: 3 },
      { z: 0.1, w: 0.85, y0: 0.29, y1: 0.84, n: 3.5, m: 3 },
      { z: 0.9, w: 0.86, y0: 0.29, y1: 0.8, n: 3.5, m: 3 },
      { z: 1.5, w: 0.84, y0: 0.3, y1: 0.72, n: 3.5, m: 3 },
      { z: 1.9, w: 0.74, y0: 0.32, y1: 0.6, n: 3, m: 3 },
      { z: 2.0, w: 0.6, y0: 0.36, y1: 0.52, n: 2.5, m: 2.5 },
    ];
    b.loft(secs, R, (k, z, x, y) => {
      if (k === -1 && z < 0) return MAT.PAINT;
      if (y < 0.4 && z > -1.3 && z < 1.4) return MAT.TRIM;
      return MAT.PAINT;
    });
    // open cockpit tub (dark interior) + windscreen + roll hoops
    b.box([0, 0.83, -0.25], [1.25, 0.06, 1.3], MAT.TRIM, [0.05, 0.04, 0.04], 0.2);
    for (const sx of [-0.33, 0.33]) {
      b.box([sx, 0.87, -0.55], [0.42, 0.42, 0.12], MAT.TRIM, [0.12, 0.05, 0.04], 0.3);
      b.box([sx, 1.06, -0.82], [0.36, 0.28, 0.2], MAT.ACCENT); // headrest fairings
      b.cylZ(b, [sx, 1.12, -0.86], 0.03, 0.12, MAT.CHROME);
    }
    b.box([0, 1.0, 0.55], [1.3, 0.3, 0.03], MAT.GLASS, [1, 1, 1], 0.9, -0.55);
    b.box([0, 0.98, -1.15], [1.3, 0.16, 0.6], MAT.PAINT, [1, 1, 1], 0.5, 0.15);
    // round twin tail lights
    for (const sx of [-0.55, -0.3, 0.3, 0.55]) b.cylZ(b, [sx, 0.74, -1.96], 0.075, 0.04, MAT.TAIL);
    b.box([0, 0.5, -1.97], [0.9, 0.12, 0.02], MAT.TRIM, [0.04, 0.04, 0.04]);
    b.cylZ(b, [0.35, 0.38, -1.95], 0.05, 0.14);
    b.cylZ(b, [0.47, 0.38, -1.95], 0.05, 0.14);
    // front: round headlamps
    for (const sx of [-0.55, 0.55]) b.cylZ(b, [sx, 0.62, 1.86], 0.09, 0.06, MAT.HEAD);
    // stripes
    for (const sx of [-0.18, 0.18]) b.box([sx, 0.955, -1.4], [0.12, 0.012, 1.0], MAT.ACCENT);
    for (const sx of [-0.18, 0.18]) b.box([sx, 0.85, 1.2], [0.12, 0.012, 1.4], MAT.ACCENT);
    wheels = [0.75, 0.33, 1.2, 0.33, -0.75, 0.33, 1.2, 0.33, 0.76, 0.34, -1.22, 0.34, -0.76, 0.34, -1.22, 0.34];
    tail = [[-0.55, 0.74, -1.99], [-0.3, 0.74, -1.99], [0.3, 0.74, -1.99], [0.55, 0.74, -1.99]];
    head = [[-0.55, 0.62, 1.9], [0.55, 0.62, 1.9]];
  } else {
    // ---------- Axiom Halo: futuristic concept ----------
    length = 4.65;
    width = 2.02;
    const secs = [
      { z: -2.3, w: 0.84, y0: 0.4, y1: 0.86, n: 5, m: 3 },
      { z: -2.15, w: 0.98, y0: 0.32, y1: 0.92, n: 5, m: 3 },
      { z: -1.7, w: 1.01, y0: 0.27, y1: 0.9, n: 5, m: 3 },
      { z: -0.9, w: 0.96, y0: 0.26, y1: 0.82, n: 5, m: 3 },
      { z: 0.0, w: 0.9, y0: 0.26, y1: 0.76, n: 5, m: 3 },
      { z: 0.9, w: 0.96, y0: 0.26, y1: 0.7, n: 5, m: 3 },
      { z: 1.6, w: 1.0, y0: 0.27, y1: 0.6, n: 5, m: 3 },
      { z: 2.1, w: 0.94, y0: 0.28, y1: 0.48, n: 4, m: 3 },
      { z: 2.33, w: 0.7, y0: 0.3, y1: 0.4, n: 3, m: 3 },
    ];
    b.loft(secs, R, (k, z, x, y) => {
      if (k === -1 && z < 0) return MAT.TRIM;
      if (y < 0.4) return MAT.CARBON;
      return MAT.PAINT;
    });
    // bubble canopy
    const gh = [
      { z: -1.5, w: 0.4, y0: 0.82, y1: 0.86, n: 2, m: 2, tuck: 0.1 },
      { z: -1.0, w: 0.62, y0: 0.78, y1: 1.06, n: 2.2, m: 2, tuck: 0.2 },
      { z: -0.2, w: 0.7, y0: 0.74, y1: 1.15, n: 2.2, m: 2, tuck: 0.2 },
      { z: 0.6, w: 0.7, y0: 0.7, y1: 1.06, n: 2.2, m: 2, tuck: 0.2 },
      { z: 1.3, w: 0.56, y0: 0.64, y1: 0.8, n: 2.2, m: 2, tuck: 0.2 },
      { z: 1.7, w: 0.3, y0: 0.6, y1: 0.63, n: 2, m: 2, tuck: 0.1 },
    ];
    b.loft(gh, R, () => MAT.GLASS);
    // light bars (neon) front and rear + twin fins
    b.box([0, 0.78, -2.31], [1.55, 0.04, 0.03], MAT.TAIL);
    b.box([0, 0.72, -2.3], [1.2, 0.02, 0.03], MAT.NEON);
    b.box([0, 0.45, 2.32], [1.3, 0.035, 0.03], MAT.HEAD);
    for (const sx of [-1, 1]) {
      b.box([sx * 0.62, 1.02, -1.9], [0.04, 0.32, 0.7], MAT.PAINT, [1, 1, 1], 0.5, 0.35);
      b.box([sx * 0.62, 1.12, -2.05], [0.05, 0.05, 0.4], MAT.NEON, [1, 1, 1], 0.5, 0.35);
      b.box([sx * 1.0, 0.45, 0.0], [0.03, 0.03, 3.4], MAT.NEON);
    }
    b.box([0, 0.36, -2.2], [1.4, 0.1, 0.3], MAT.CARBON, [0.04, 0.04, 0.05], 0.6);
    b.cylZ(b, [0, 0.55, -2.3], 0.13, 0.06, MAT.NEON);
    wheels = [0.86, 0.35, 1.42, 0.35, -0.86, 0.35, 1.42, 0.35, 0.88, 0.36, -1.42, 0.36, -0.88, 0.36, -1.42, 0.36];
    tail = [[-0.7, 0.78, -2.33], [-0.25, 0.78, -2.33], [0.25, 0.78, -2.33], [0.7, 0.78, -2.33]];
    head = [[-0.5, 0.45, 2.34], [0.5, 0.45, 2.34]];
  }
  const style = id === 0 ? 0 : id === 1 ? 1 : 2;
  for (let i = 0; i < 4; i++) {
    const x = wheels[i * 4], r = wheels[i * 4 + 1], z = wheels[i * 4 + 2];
    b.wheel(x, r, z, r, i < 2 ? 0.25 : 0.31, i + 1, style);
  }
  const p = b.pack();
  return { ...p, wheels, tailLights: tail, headLights: head, length, width };
}

// helper: cylinder along z (lights, exhausts) – attached as a method for convenience
(CarMB.prototype as any).cylZ = function (this: CarMB, _b: CarMB, c: P3, r: number, len: number, mat = MAT.CHROME): void {
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const p0: P3 = [c[0] + Math.cos(a0) * r, c[1] + Math.sin(a0) * r, c[2] - len / 2];
    const p1: P3 = [c[0] + Math.cos(a1) * r, c[1] + Math.sin(a1) * r, c[2] - len / 2];
    const p2: P3 = [p1[0], p1[1], c[2] + len / 2];
    const p3: P3 = [p0[0], p0[1], c[2] + len / 2];
    this.ftri(p0, p1, p2, mat, c, 0, [0.85, 0.85, 0.88], 0.9);
    this.ftri(p0, p2, p3, mat, c, 0, [0.85, 0.85, 0.88], 0.9);
    // end cap (back = dark pipe interior for exhausts)
    const capMat = mat === MAT.CHROME ? MAT.TRIM : mat;
    this.ftri([c[0], c[1], c[2] - len / 2], p0, p1, capMat, [c[0], c[1], c[2] + 1], 0, [0.02, 0.02, 0.02], 0.2);
  }
};
interface CarMB { cylZ(b: CarMB, c: P3, r: number, len: number, mat?: number): void }
