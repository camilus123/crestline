// The bent path: every frame the track ahead of (and a little behind) the car is integrated into
// camera-relative "bent space" (x right, y up, z forward, origin at the road centre under the car).
// Relative heading is soft-clamped so the road never folds back towards the camera - exactly the
// classic behaviour where bends sweep away to the side and blind crests hide the road beyond.
// The renderer uploads this as a small float texture; all road, terrain and scenery vertices are
// placed from it in the vertex shaders.

import { DELTA } from '../track/defs';
import { Track } from '../track/track';

export const PATH_STEP = 2;
export const PATH_BACK = 128;
export const PATH_N = 1120;
const COARSE = 8;
const MAX_EXT = 700;

export class BentPath {
  readonly data = new Float32Array(PATH_N * 4 * 3);
  readonly px = new Float32Array(PATH_N);
  readonly pz = new Float32Array(PATH_N);
  readonly py = new Float32Array(PATH_N);
  readonly phi = new Float32Array(PATH_N);
  readonly extL = new Float32Array(PATH_N);
  readonly extR = new Float32Array(PATH_N);
  dFirst = -PATH_BACK; // d of sample 0
  sCar = 0;
  s0 = 0; // absolute (unwrapped) s of sample 0
  maxD = 2000;
  private raw = new Float64Array(PATH_N);
  private cx: number[] = [];
  private ix = new Int32Array(PATH_N);
  private sx = new Float32Array(0); private sz = new Float32Array(0); private sfx = new Float32Array(0); private sfz = new Float32Array(0);
  private seL = new Float32Array(0); private seR = new Float32Array(0);

  build(track: Track, sCar: number, maxD: number): void {
    this.sCar = sCar;
    this.maxD = maxD;
    const s0 = Math.floor(sCar / PATH_STEP) * PATH_STEP - PATH_BACK;
    this.s0 = s0;
    this.dFirst = s0 - sCar;
    const n = PATH_N;
    // relative heading
    const raw = this.raw;
    raw[0] = 0;
    // Path samples fall exactly on track samples (same spacing, s0 a whole number of steps), so the track arrays
    // can be read directly instead of through ten thousand interpolating calls a frame.
    const td = track.d, tn = track.n;
    const f0 = track.fi(s0);
    const i0 = Math.round(f0);
    const direct = DELTA === PATH_STEP && Math.abs(f0 - i0) < 1e-6;
    const ix = this.ix;
    if (direct) {
      for (let k = 0; k < n; k++) ix[k] = track.circuit ? (i0 + k) % tn : Math.min(i0 + k, tn - 1);
      // (a stage clamps at its ends exactly as Track.fi does: s below the start reads sample 0)
      if (!track.circuit && s0 + track.d.sOff < 0) for (let k = 0; k < n; k++) ix[k] = Math.max(0, Math.min(tn - 1, Math.round((s0 + k * PATH_STEP + td.sOff) / DELTA)));
      const cv = td.curv;
      for (let k = 0; k < n - 1; k++) raw[k + 1] = raw[k] + (cv[ix[k]] + cv[ix[k + 1]]) * 0.5 * PATH_STEP;
    } else for (let k = 0; k < n - 1; k++) raw[k + 1] = raw[k] + track.curv(s0 + k * PATH_STEP + PATH_STEP * 0.5) * PATH_STEP;
    const fCar = -this.dFirst / PATH_STEP;
    const kc = Math.floor(fCar);
    const phiCar = raw[kc] + (raw[kc + 1] - raw[kc]) * (fCar - kc);
    const phi = this.phi;
    for (let k = 0; k < n; k++) {
      const p = raw[k] - phiCar;
      const a = Math.abs(p);
      phi[k] = a < 0.95 ? p : Math.sign(p) * (0.95 + 0.5 * Math.tanh((a - 0.95) / 0.5));
    }
    // integrate positions
    const px = this.px, pz = this.pz, py = this.py;
    px[0] = 0;
    pz[0] = 0;
    for (let k = 0; k < n - 1; k++) {
      const m = (phi[k] + phi[k + 1]) * 0.5;
      px[k + 1] = px[k] + Math.sin(m) * PATH_STEP;
      pz[k + 1] = pz[k] + Math.cos(m) * PATH_STEP;
    }
    const t = fCar - kc;
    const ox = px[kc] + (px[kc + 1] - px[kc]) * t;
    const oz = pz[kc] + (pz[kc + 1] - pz[kc]) * t;
    const yCar = track.y(sCar);
    for (let k = 0; k < n; k++) {
      px[k] -= ox;
      pz[k] -= oz;
      py[k] = (direct ? td.Y[ix[k]] : track.y(s0 + k * PATH_STEP)) - yCar;
    }
    this.computeExtents(track);
    // never beyond the limit fixed to the ground (see Track.fold): keeps the shape of the land from shifting
    {
      const [fL, fR] = track.fold();
      for (let k = 0; k < n; k++) {
        const j = direct ? ix[k] : Math.round(track.fi(s0 + k * PATH_STEP)) % tn;
        if (fL[j] < this.extL[k]) this.extL[k] = fL[j];
        if (fR[j] < this.extR[k]) this.extR[k] = fR[j];
      }
    }
    // pack texture rows
    const D = this.data;
    const row = n * 4;
    const aux = track.tiltArr ?? td.sand;
    for (let k = 0; k < n; k++) {
      const s = s0 + k * PATH_STEP;
      const i = k * 4;
      D[i] = px[k];
      D[i + 1] = pz[k];
      D[i + 2] = phi[k];
      D[i + 3] = py[k];
      if (direct) {
        const j = ix[k];
        D[row + i] = td.hwL[j];
        D[row + i + 1] = td.hwR[j];
        D[row + i + 2] = this.extL[k];
        D[row + i + 3] = this.extR[k];
        D[2 * row + i] = s;
        D[2 * row + i + 1] = td.flags[j];
        D[2 * row + i + 2] = aux[j];
        D[2 * row + i + 3] = td.curv[j];
        continue;
      }
      D[row + i] = track.hwL(s);
      D[row + i + 1] = track.hwR(s);
      D[row + i + 2] = this.extL[k];
      D[row + i + 3] = this.extR[k];
      D[2 * row + i] = s;
      D[2 * row + i + 1] = track.flags(s);
      D[2 * row + i + 2] = track.aux(s);
      D[2 * row + i + 3] = track.curv(s);
    }
  }

  private computeExtents(track: Track): void {
    const n = PATH_N;
    const px = this.px, pz = this.pz, phi = this.phi;
    const nc = Math.floor(n / COARSE);
    const cx = this.cx;
    cx.length = 0;
    // only consider the visible window
    const kMax = Math.min(n, Math.ceil((this.maxD - this.dFirst) / PATH_STEP) + COARSE);
    const ncv = Math.min(nc, Math.ceil(kMax / COARSE));
    // coarse samples sit at fixed places on the track (not fixed distances from the car), so the limits do not
    // jitter as the car moves and the sampling slides along the road
    const phase = (((Math.round(this.s0 / PATH_STEP) % COARSE) + COARSE) % COARSE);
    const kAt = (i: number) => Math.max(0, Math.min(n - 1, i * COARSE - phase + COARSE));
    // (typed scratch arrays and no calls in the inner loop: this runs every frame for every view, and at
    // 240 fps the whole frame has 4 ms)
    if (this.sx.length < ncv) { this.sx = new Float32Array(nc + 2); this.sz = new Float32Array(nc + 2); this.sfx = new Float32Array(nc + 2); this.sfz = new Float32Array(nc + 2); this.seL = new Float32Array(nc + 2); this.seR = new Float32Array(nc + 2); }
    const sx = this.sx, sz = this.sz, sfx = this.sfx, sfz = this.sfz;
    const eL = this.seL.subarray(0, ncv).fill(MAX_EXT), eR = this.seR.subarray(0, ncv).fill(MAX_EXT);
    for (let i = 0; i < ncv; i++) {
      const ki = kAt(i);
      sx[i] = px[ki]; sz[i] = pz[ki]; sfx[i] = Math.sin(phi[ki]); sfz[i] = Math.cos(phi[ki]);
    }
    for (let i = 0; i < ncv; i++) {
      const fx = sfx[i], fz = sfz[i];
      const nx = fz, nz = -fx; // right normal
      const xi = sx[i], zi = sz[i];
      let r = MAX_EXT, l = MAX_EXT;
      for (let j = 0; j < ncv; j++) {
        if (j > i - 4 && j < i + 4) continue;
        const vx = sx[j] - xi, vz = sz[j] - zi;
        const a = vx * nx + vz * nz;
        const b = vx * fx + vz * fz;
        if ((b < 0 ? -b : b) > (a < 0 ? -a : a) * 1.1) continue;
        // (hw = 14)
        if (a > 0) { const e = a * 0.5 - 14; if (e < r) r = e; }
        else { const e = -a * 0.5 - 14; if (e < l) l = e; }
      }
      eR[i] = r < 6 ? 6 : r;
      eL[i] = l < 6 ? 6 : l;
      // inside of a bend: never extend past ~85% of the local radius (prevents folding)
      const ki = kAt(i);
      const k0 = Math.max(0, ki - COARSE), k1 = Math.min(n - 1, ki + COARSE);
      const dphi = (phi[k1] - phi[k0]) / ((k1 - k0) * PATH_STEP);
      if (Math.abs(dphi) > 1e-5) {
        const R = (1 / Math.abs(dphi)) * 0.85;
        if (dphi > 0) eR[i] = Math.min(eR[i], Math.max(6, R));
        else eL[i] = Math.min(eL[i], Math.max(6, R));
      }
    }
    // min-filter then interpolate to full resolution
    const mf = (e: Float32Array) => {
      const o = new Float32Array(e.length);
      for (let i = 0; i < e.length; i++) {
        let m = e[i];
        for (let k = -2; k <= 2; k++) {
          const j = i + k;
          if (j >= 0 && j < e.length) m = Math.min(m, e[j] + Math.abs(k) * 6);
        }
        o[i] = m;
      }
      return o;
    };
    const L = mf(eL), R = mf(eR);
    for (let k = 0; k < n; k++) {
      const f = Math.max(0, (k + phase) / COARSE - 1);
      const i = Math.min(ncv - 1, Math.floor(f));
      const j = Math.min(ncv - 1, i + 1);
      const t = f - Math.floor(f);
      this.extL[k] = L[i] + (L[j] - L[i]) * t;
      this.extR[k] = R[i] + (R[j] - R[i]) * t;
    }
  }

  /** bent-space position of (d along road, u lateral, h height above road centre) */
  pos(d: number, u: number, h: number, out: number[]): number[] {
    let f = (d - this.dFirst) / PATH_STEP;
    if (f < 0) f = 0;
    if (f > PATH_N - 1.001) f = PATH_N - 1.001;
    const k = Math.floor(f), t = f - k;
    const x = this.px[k] + (this.px[k + 1] - this.px[k]) * t;
    const z = this.pz[k] + (this.pz[k + 1] - this.pz[k]) * t;
    const y = this.py[k] + (this.py[k + 1] - this.py[k]) * t;
    const p = this.phi[k] + (this.phi[k + 1] - this.phi[k]) * t;
    out[0] = x + Math.cos(p) * u;
    out[1] = y + h;
    out[2] = z - Math.sin(p) * u;
    out[3] = p;
    return out;
  }
  /** relative heading at d */
  heading(d: number): number {
    let f = (d - this.dFirst) / PATH_STEP;
    f = Math.max(0, Math.min(PATH_N - 1.001, f));
    const k = Math.floor(f);
    return this.phi[k] + (this.phi[k + 1] - this.phi[k]) * (f - k);
  }
  /** road grade (dy/dz) at d */
  slope(d: number): number {
    let f = (d - this.dFirst) / PATH_STEP;
    f = Math.max(0, Math.min(PATH_N - 2, f));
    const k = Math.floor(f);
    return (this.py[k + 1] - this.py[k]) / PATH_STEP;
  }
}
