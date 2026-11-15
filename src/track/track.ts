// Runtime track access: interpolated sampling with circuit wrap-around.

import { DELTA, F_CLIFF_L, F_CLIFF_R, F_PIT, F_WALL_L, F_WALL_R, Hz } from './defs';
import { Hazard, TrackData } from './generator';

export class Track {
  readonly d: TrackData;
  readonly n: number;
  readonly circuit: boolean;
  readonly len: number; // lap length for circuits, geometry span for stages
  /** collidable roadside object indices, sorted by s */
  readonly colS: Float32Array;
  readonly colIdx: Uint32Array;
  /** Mountains: which side the mountain is on, +1 right (valley left) .. -1 left, changing over smoothly where
   *  the generator swaps sides (the wall / cliff flags themselves flip from one sample to the next) */
  readonly tiltArr: Float32Array | null = null;
  constructor(d: TrackData) {
    this.d = d;
    this.n = d.n;
    this.circuit = d.circuit;
    this.len = d.circuit ? d.lapLen : d.geoLen;
    const idx: number[] = [];
    for (let i = 0; i < d.objects.count; i++) if (d.objects.radius[i] > 0) idx.push(i);
    this.colIdx = Uint32Array.from(idx);
    this.colS = Float32Array.from(idx.map((i) => d.objects.s[i]));
    if (d.scen.walls === 'mountain') {
      const n = d.n;
      let a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = d.flags[i] & F_WALL_R ? 1 : d.flags[i] & F_WALL_L ? -1 : 0;
      // two box filters (a triangle 280 m wide at the base): a changeover takes about 200 m of road
      const R = Math.round(70 / DELTA);
      for (let pass = 0; pass < 2; pass++) {
        const b = new Float32Array(n);
        let sum = 0;
        const at = (i: number) => a[d.circuit ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
        for (let k = -R; k <= R; k++) sum += at(k);
        for (let i = 0; i < n; i++) {
          b[i] = sum / (2 * R + 1);
          sum += at(i + R + 1) - at(i - R);
        }
        a = b;
      }
      this.tiltArr = a;
    }
  }
  /**
   * How far the ground can extend to each side before it would run into the inside of the bend or another
   * stretch of road, from the track's true geometry: fixed for each place on the track. The renderer also
   * works this out every frame for the bent view, but that value shifts as the car moves (the view straightens
   * the road ahead), and ground shaped by it visibly moved as you drove round a bend (dunes sliding and
   * deflating beside the car). The renderer now uses the smaller of the two, which is almost always this one.
   */
  private foldL: Float32Array | null = null;
  private foldR: Float32Array | null = null;
  fold(): [Float32Array, Float32Array] {
    if (this.foldL && this.foldR) return [this.foldL, this.foldR];
    const d = this.d, n = d.n, C = 8, MAXE = 700;
    const nc = Math.ceil(n / C);
    const eL = new Float32Array(nc).fill(MAXE), eR = new Float32Array(nc).fill(MAXE);
    const X = d.X, Z = d.Z, H = d.heading;
    // Only the road within 500 m along the track counts (a hairpin doubling back on itself). The track's map
    // geometry is not a real place: circuits do not close and distant stretches can cross on the map, though the
    // bent view never shows them together. Distant stretches are left to the per-frame limit.
    const span = Math.ceil(500 / (C * DELTA));
    for (let i = 0; i < nc; i++) {
      const ki = Math.min(n - 1, i * C);
      // heading as the bent path has it: x += sin, z += cos
      const fx = Math.sin(H[ki]), fz = Math.cos(H[ki]);
      const nx = fz, nz = -fx;
      const xi = X[ki], zi = Z[ki];
      let r = MAXE, l = MAXE;
      for (let o = -span; o <= span; o++) {
        if (o > -4 && o < 4) continue;
        const j = i + o;
        if (j < 0 || j >= nc) continue; // (never across a circuit's seam: the map does not join up there)
        const kj = Math.min(n - 1, j * C);
        const vx = X[kj] - xi, vz = Z[kj] - zi;
        const a = vx * nx + vz * nz, b = vx * fx + vz * fz;
        if (Math.abs(b) > Math.abs(a) * 1.1) continue;
        if (a > 0) r = Math.min(r, a * 0.5 - 14);
        else l = Math.min(l, -a * 0.5 - 14);
      }
      eR[i] = Math.max(6, r);
      eL[i] = Math.max(6, l);
      const c = d.curv[ki];
      if (Math.abs(c) > 1e-5) {
        const R = Math.max(6, (1 / Math.abs(c)) * 0.85);
        if (c > 0) eR[i] = Math.min(eR[i], R);
        else eL[i] = Math.min(eL[i], R);
      }
    }
    const spread = (e: Float32Array) => {
      const o = new Float32Array(n);
      const m = new Float32Array(nc);
      for (let i = 0; i < nc; i++) {
        let v = e[i];
        for (let k = -2; k <= 2; k++) {
          let j = i + k;
          if (d.circuit) j = ((j % nc) + nc) % nc;
          else if (j < 0 || j >= nc) continue;
          v = Math.min(v, e[j] + Math.abs(k) * 6);
        }
        m[i] = v;
      }
      for (let k = 0; k < n; k++) {
        const f = k / C, i = Math.min(nc - 1, Math.floor(f));
        const j = d.circuit ? (i + 1) % nc : Math.min(nc - 1, i + 1);
        o[k] = m[i] + (m[j] - m[i]) * (f - Math.floor(f));
      }
      return o;
    };
    this.foldL = spread(eL);
    this.foldR = spread(eR);
    return [this.foldL, this.foldR];
  }
  tilt(s: number): number { return this.tiltArr ? this.lerpArr(this.tiltArr, s) : 0; }
  /** race distance -> track s */
  trackS(dist: number): number {
    if (this.circuit) {
      const L = this.d.lapLen;
      return ((dist % L) + L) % L;
    }
    return dist;
  }
  /** fractional sample index, wrapped/clamped */
  fi(s: number): number {
    let f = (s + this.d.sOff) / DELTA;
    if (this.circuit) {
      f = f % this.n;
      if (f < 0) f += this.n;
    } else {
      if (f < 0) f = 0;
      if (f > this.n - 1.001) f = this.n - 1.001;
    }
    return f;
  }
  private lerpArr(a: Float32Array, s: number): number {
    const f = this.fi(s);
    const i = Math.floor(f);
    const t = f - i;
    const j = this.circuit ? (i + 1) % this.n : Math.min(i + 1, this.n - 1);
    return a[i] + (a[j] - a[i]) * t;
  }
  curv(s: number): number { return this.lerpArr(this.d.curv, s); }
  grade(s: number): number { return this.lerpArr(this.d.grade, s); }
  y(s: number): number { return this.lerpArr(this.d.Y, s); }
  hwL(s: number): number { return this.lerpArr(this.d.hwL, s); }
  hwR(s: number): number { return this.lerpArr(this.d.hwR, s); }
  sand(s: number): number { return this.lerpArr(this.d.sand, s); }
  /** the path texture's spare channel: sand cover (Desert) or the mountain tilt (Mountains) */
  aux(s: number): number { return this.tiltArr ? this.lerpArr(this.tiltArr, s) : this.lerpArr(this.d.sand, s); }
  flags(s: number): number { return this.d.flags[Math.round(this.fi(s)) % this.n]; }
  /** vertical curvature d2y/ds2 (negative on crests) */
  vcurv(s: number): number { return (this.grade(s + 3) - this.grade(s - 3)) / 6; }
  isPit(s: number): boolean { return (this.flags(s) & F_PIT) !== 0; }
  wallL(s: number): boolean { return (this.flags(s) & F_WALL_L) !== 0; }
  wallR(s: number): boolean { return (this.flags(s) & F_WALL_R) !== 0; }
  cliffL(s: number): boolean { return (this.flags(s) & F_CLIFF_L) !== 0; }
  cliffR(s: number): boolean { return (this.flags(s) & F_CLIFF_R) !== 0; }

  /** signed distance a->b along the track (shortest way round on circuits) */
  delta(a: number, b: number): number {
    let d = b - a;
    if (this.circuit) {
      const L = this.d.lapLen, H = L / 2;
      // Nearly every call is for two positions within a lap of each other: one comparison and at most one
      // addition settle those. (This is called thousands of times per simulation step; the two floating-point
      // remainders it used to take were two thirds of the whole simulation's time on circuits.)
      if (d > H) { d -= L; if (d <= H) return d; }
      else if (d <= -H) { d += L; if (d > -H) return d; }
      else return d;
      d = ((d % L) + L) % L;
      if (d > H) d -= L;
    }
    return d;
  }

  /** iterate hazards whose span overlaps [s0, s1] (track s). */
  hazardsIn(s0: number, s1: number, out: Hazard[]): Hazard[] {
    out.length = 0;
    if (this.circuit) {
      const L = this.d.lapLen;
      const a = ((s0 % L) + L) % L;
      const b = a + (s1 - s0);
      this.hazScan(a, Math.min(b, L), out);
      if (b > L) this.hazScan(0, b - L, out);
    } else this.hazScan(s0, s1, out);
    return out;
  }
  // (methods, not closures made on every call: these two run for every car on every simulation step)
  private hazScan(a: number, b: number, out: Hazard[]): void {
    const hz = this.d.hazards;
    // binary search first hazard with s > a - 500 (max length)
    let lo = 0, hi = hz.length;
    const key = a - 450;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (hz[m].s < key) lo = m + 1;
      else hi = m;
    }
    for (let k = lo; k < hz.length && hz[k].s <= b; k++) {
      const h = hz[k];
      if (h.s + h.len >= a) out.push(h);
    }
  }
  private objScan(a: number, b: number, out: number[]): void {
    const cs = this.colS;
    let lo = 0, hi = cs.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cs[m] < a) lo = m + 1;
      else hi = m;
    }
    for (let k = lo; k < cs.length && cs[k] <= b; k++) out.push(this.colIdx[k]);
  }

  /** collidable object indices in [s0, s1] */
  objectsIn(s0: number, s1: number, out: number[]): number[] {
    out.length = 0;
    if (this.circuit) {
      const L = this.d.lapLen;
      const a = ((s0 % L) + L) % L;
      const b = a + (s1 - s0);
      this.objScan(a, Math.min(b, L), out);
      if (b > L) this.objScan(0, b - L, out);
      if (a < 0) this.objScan(L + a, L, out);
    } else this.objScan(s0, s1, out);
    return out;
  }
}

export function hazardActive(h: Hazard, time: number): number {
  // returns 0..1 activity for timed hazards (lasers, gusts); 1 for static
  if (h.kind === Hz.LASER) {
    const ph = ((time / h.a + h.c) % 1 + 1) % 1;
    return ph < h.b ? 1 : 0;
  }
  if (h.kind === Hz.GUST) {
    const ph = ((time / h.d + h.c) % 1 + 1) % 1;
    // 0..0.25 telegraph, 0.25..0.5 gust
    if (ph < 0.25) return 0;
    if (ph < 0.5) return Math.sin(((ph - 0.25) / 0.25) * Math.PI);
    return 0;
  }
  return 1;
}

/** 0..1 how strongly the gust is being telegraphed (debris ahead of it) */
export function gustWarning(h: Hazard, time: number): number {
  const ph = ((time / h.d + h.c) % 1 + 1) % 1;
  if (ph < 0.3) return Math.min(1, ph / 0.1);
  if (ph < 0.5) return 1;
  return 0;
}

export function laserWarning(h: Hazard, time: number): number {
  const ph = ((time / h.a + h.c) % 1 + 1) % 1;
  // warm-up glow during the last 30% before switching on
  if (ph < h.b) return 1;
  if (ph > 0.7) return (ph - 0.7) / 0.3;
  return 0;
}
