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
      const L = this.d.lapLen;
      d = ((d % L) + L) % L;
      if (d > L / 2) d -= L;
    }
    return d;
  }

  /** iterate hazards whose span overlaps [s0, s1] (track s). */
  hazardsIn(s0: number, s1: number, out: Hazard[]): Hazard[] {
    out.length = 0;
    const hz = this.d.hazards;
    const test = (a: number, b: number) => {
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
    };
    if (this.circuit) {
      const L = this.d.lapLen;
      const a = ((s0 % L) + L) % L;
      const b = a + (s1 - s0);
      test(a, Math.min(b, L));
      if (b > L) test(0, b - L);
    } else test(s0, s1);
    return out;
  }

  /** collidable object indices in [s0, s1] */
  objectsIn(s0: number, s1: number, out: number[]): number[] {
    out.length = 0;
    const cs = this.colS;
    const scan = (a: number, b: number) => {
      let lo = 0, hi = cs.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (cs[m] < a) lo = m + 1;
        else hi = m;
      }
      for (let k = lo; k < cs.length && cs[k] <= b; k++) out.push(this.colIdx[k]);
    };
    if (this.circuit) {
      const L = this.d.lapLen;
      const a = ((s0 % L) + L) % L;
      const b = a + (s1 - s0);
      scan(a, Math.min(b, L));
      if (b > L) scan(0, b - L);
      if (a < 0) scan(L + a, L);
    } else scan(s0, s1);
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
