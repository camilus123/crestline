// The bent path: every frame the track ahead of (and a little behind) the car is integrated into
// camera-relative "bent space" (x right, y up, z forward, origin at the road centre under the car).
// Relative heading is soft-clamped so the road never folds back towards the camera - exactly the
// classic behaviour where bends sweep away to the side and blind crests hide the road beyond.
// The renderer uploads this as a small float texture; all road, terrain and scenery vertices are
// placed from it in the vertex shaders.

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
    for (let k = 0; k < n - 1; k++) raw[k + 1] = raw[k] + track.curv(s0 + k * PATH_STEP + PATH_STEP * 0.5) * PATH_STEP;
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
      py[k] = track.y(s0 + k * PATH_STEP) - yCar;
    }
    this.computeExtents(track);
    // pack texture rows
    const D = this.data;
    const row = n * 4;
    for (let k = 0; k < n; k++) {
      const s = s0 + k * PATH_STEP;
      const i = k * 4;
      D[i] = px[k];
      D[i + 1] = pz[k];
      D[i + 2] = phi[k];
      D[i + 3] = py[k];
      D[row + i] = track.hwL(s);
      D[row + i + 1] = track.hwR(s);
      D[row + i + 2] = this.extL[k];
      D[row + i + 3] = this.extR[k];
      D[2 * row + i] = s;
      D[2 * row + i + 1] = track.flags(s);
      D[2 * row + i + 2] = track.sand(s);
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
    const eL = new Float32Array(ncv).fill(MAX_EXT), eR = new Float32Array(ncv).fill(MAX_EXT);
    for (let i = 0; i < ncv; i++) {
      const ki = i * COARSE;
      const fx = Math.sin(phi[ki]), fz = Math.cos(phi[ki]);
      const nx = fz, nz = -fx; // right normal
      const xi = px[ki], zi = pz[ki];
      for (let j = 0; j < ncv; j++) {
        if (Math.abs(i - j) < 4) continue;
        const kj = j * COARSE;
        const vx = px[kj] - xi, vz = pz[kj] - zi;
        const a = vx * nx + vz * nz;
        const b = vx * fx + vz * fz;
        if (Math.abs(b) > Math.abs(a) * 1.1) continue;
        const hw = 14;
        if (a > 0) eR[i] = Math.min(eR[i], Math.max(6, a * 0.5 - hw));
        else eL[i] = Math.min(eL[i], Math.max(6, -a * 0.5 - hw));
      }
      // inside of a bend: never extend past ~85% of the local radius (prevents folding)
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
      const f = k / COARSE;
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
