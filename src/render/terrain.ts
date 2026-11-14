// The terrain height function on the CPU: a line-for-line mirror of terrainH() in glsl.ts.
// The GPU draws the ground with the GLSL version; this one tells the scenery where the ground is, so that
//  - every roadside object carries its ground height (the vertex shader no longer evaluates terrain noise for
//    every vertex of every tree, which was the single largest vertex cost in the game), and
//  - woodland can be planted where it makes sense (not on rock faces, under water or above the tree line).
// Keep the two in step: change one, change the other.

import { Track } from '../track/track';

const imul = Math.imul;
function hashU(x: number, y: number): number {
  x = (imul(x, 1664525) + 1013904223) >>> 0;
  y = (imul(y, 1664525) + 1013904223) >>> 0;
  x = (x + imul(y, 1664525)) >>> 0;
  y = (y + imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  x = (x + imul(y, 1664525)) >>> 0;
  y = (y + imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  return (x ^ y) >>> 0;
}
const hash2 = (px: number, py: number) => hashU((Math.floor(px) + 32768) >>> 0, (Math.floor(py) + 32768) >>> 0) / 4294967296;
function vnoise(px: number, py: number): number {
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}
function fbm(px: number, py: number): number {
  let s = 0, a = 0.5;
  for (let i = 0; i < 4; i++) {
    s += a * vnoise(px, py);
    px = px * 2.03 + 17.1;
    py = py * 2.03 + 9.3;
    a *= 0.5;
  }
  return s;
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export class Terrain {
  private loop: number;
  constructor(private track: Track, private terr: number[], private terr2: number[]) {
    this.loop = track.circuit ? track.d.lapLen : 0;
  }

  private noise(s: number, u: number, fr: number): number {
    const L = this.loop;
    if (L > 0) {
      const sm = ((s % L) + L) % L;
      const w = sstep(L - 300, L, sm);
      const a = fbm(sm * fr, u * fr);
      if (w <= 0) return a;
      return mix(a, fbm((sm - L) * fr, u * fr), w);
    }
    return fbm(s * fr, u * fr);
  }

  /** half width of the road on the side of u */
  edge(s: number, u: number): number { return u < 0 ? this.track.hwL(s) : this.track.hwR(s); }

  /** ground height relative to the road centre at track position s, lateral position u (signed) */
  h(s: number, u: number): number {
    const T = this.terr, T2 = this.terr2;
    const side = u < 0 ? -1 : 1;
    const off = Math.max(Math.abs(u) - this.edge(s, u), 0);
    const fr = T[1];
    const n = this.noise(s, u, fr) - 0.45;
    const n2 = this.noise(s + 913, u * 1.7, fr * 4) - 0.5;
    const far = sstep(3, 45, off);
    let h = -0.12 * sstep(0.3, 1.5, off) * (1 - sstep(2.5, 6, off));
    h += n * T[0] * far + n2 * T[0] * 0.12 * sstep(1, 8, off);
    h += T[2] * sstep(8, 160, off) * off * 0.08;
    const ty = Math.round(T[3]);
    if (ty === 2) {
      const dn = Math.sin(s * 0.021 + u * 0.034 + n * 3) * 0.5 + 0.5;
      h += dn * dn * T2[2] * sstep(4, 40, off);
    }
    if (ty === 4) {
      const w = this.track.tilt(s) * side;
      const big = this.noise(s + 311, u * 0.7, 0.0022);
      const up = sstep(0, 0.7, w), dn = sstep(0, 0.7, -w);
      const cutH = 6 + 9 * Math.max(0, Math.min(1, n + 0.45));
      const face = cutH * sstep(0.4, 0.4 + cutH * 0.55, off);
      const x = Math.max(off - 3, 0);
      const M = T2[0] * (0.55 + 0.9 * big);
      const mount = face + M * (1 - Math.exp(-x / (M * 1.15)))
        + (big - 0.47) * 150 * sstep(40, 320, x) + n * 22 * sstep(6, 90, x) + n2 * 3 * sstep(2, 12, x);
      const xv = Math.max(off - 1.4, 0);
      const Dv = T2[1] * (0.65 + 0.7 * big);
      const valley = -0.1 * sstep(1, 1.4, off) - Dv * (1 - Math.exp(-xv / (Dv * 0.5))) * sstep(0, 2.5, xv)
        + n * 14 * sstep(4, 60, xv) + n2 * 2 * sstep(3, 12, xv)
        + sstep(280, 700, off) * (Dv + T2[0] * 0.55);
      h = mix(h, mount, up);
      h = mix(h, valley, dn);
    }
    if (ty === 6) h = -0.1 - sstep(3.8, 9, off) * 2.2 + n * T[0] * far;
    return h;
  }

  /** steepness at (s, u): 0 flat .. 1 vertical (1 - the up component of the surface normal) */
  slope(s: number, u: number): number {
    const e = 1.5;
    const h0 = this.h(s, u);
    const ds = (this.h(s + e, u) - h0) / e, du = (this.h(s, u + e) - h0) / e;
    return 1 - 1 / Math.sqrt(1 + ds * ds + du * du);
  }
}
