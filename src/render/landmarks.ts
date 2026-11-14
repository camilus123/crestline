// Where to draw a big rigid landmark (mesa, peak, mast, lighthouse...) in bent space this frame.
//
// A landmark is placed beside one stretch of road, but the road may curve back towards it further on, and the
// bent space (which straightens the road ahead) moves stretches around relative to each other. So every frame each
// landmark in view is pushed outwards, along its own stretch's normal, until its footprint clears EVERY stretch of
// road in the bent path; if it still cannot (squeezed between two stretches) it is left out for that frame.
//
// This used to run in the vertex shader, which could only afford to check a few hundred metres either side of
// the landmark's own stretch: a mesa 2.5x its base size placed 1.5 km ahead could then cover the road right at the
// camera and the player drove inside it. On the CPU the whole visible path is checked (a handful of landmarks are
// in view at once, so it costs next to nothing), and the vertex shader just reads the result.

import { BentPath, PATH_N, PATH_STEP } from './path';

export class LandmarkPlacer {
  /**
   * d: distance of the landmark's stretch from the car; u0: its placed lateral offset; foot: footprint radius
   * (already scaled). Writes the lateral offset to draw it at, and whether to leave it out this frame.
   */
  place(bp: BentPath, d: number, u0: number, foot: number, out: { u: number; hide: boolean }): void {
    out.u = u0;
    out.hide = false;
    if (u0 === 0) return;
    const D = bp.data, row = PATH_N * 4;
    let f = (d - bp.dFirst) / PATH_STEP;
    f = Math.max(0, Math.min(PATH_N - 1.001, f));
    const k0 = Math.floor(f), ft = f - k0;
    const lerp = (a: number) => D[k0 * 4 + a] + (D[(k0 + 1) * 4 + a] - D[k0 * 4 + a]) * ft;
    const px = lerp(0), pz = lerp(1), phi = lerp(2);
    const hwL = lerp(row), hwR = lerp(row + 1), extL = lerp(row + 2), extR = lerp(row + 3);
    const side = u0 < 0 ? -1 : 1;
    const edge = side < 0 ? hwL : hwR, ext = side < 0 ? extL : extR;
    let u = u0;
    // squeeze far landmarks inside the folding limit, but never closer to the road than they were placed
    if (Math.abs(u) > ext) u = side * Math.max(ext + (Math.abs(u) - ext) * 0.85, Math.min(Math.abs(u0), edge + foot + 1));
    const R = foot + 8;
    const rx = Math.cos(phi) * side, rz = -Math.sin(phi) * side;
    const c0x = px + Math.cos(phi) * u, c0z = pz - Math.sin(phi) * u;
    // samples of the whole visible path, at places fixed on the track (so the result does not jitter as the car moves)
    const stride = Math.round(10 / PATH_STEP); // every 10 m: the road can bend towards a landmark between samples
    const base = Math.round(bp.s0 / PATH_STEP);
    const first = ((stride - (base % stride)) % stride + stride) % stride;
    const kMax = Math.min(PATH_N - 1, Math.ceil((bp.maxD - bp.dFirst) / PATH_STEP));
    // plus both ends of the visible path (the stretch just behind the camera, and the far end), so no tail of
    // road up to one sample spacing long goes unchecked
    const next = (k: number) => (k < first ? first : k >= kMax ? kMax + 1 : Math.min(kMax, k + stride));
    // between two samples the road can bulge towards the landmark by up to this much
    const sag = 1 + (stride * PATH_STEP) ** 2 / (8 * 30); // a 30 m radius bend at worst
    let t = 0;
    for (let pass = 0; pass < 8; pass++) {
      const t0 = t;
      for (let k = 0; k <= kMax; k = next(k)) {
        const L = R + Math.max(D[row + k * 4], D[row + k * 4 + 1]) + 4 + sag;
        const ax = c0x + rx * t - D[k * 4], az = c0z + rz * t - D[k * 4 + 1];
        const aa = ax * ax + az * az;
        if (aa < L * L) {
          const b = ax * rx + az * rz;
          t += Math.sqrt(b * b - aa + L * L) - b; // out to the far edge of this stretch's keep-out circle
        }
      }
      if (t - t0 < 0.01) break;
    }
    // still overlapping some stretch: leave it out rather than show the road inside it
    for (let k = 0; k <= kMax; k = next(k)) {
      const L = R + Math.max(D[row + k * 4], D[row + k * 4 + 1]) + 2 + sag;
      const ax = c0x + rx * t - D[k * 4], az = c0z + rz * t - D[k * 4 + 1];
      if (ax * ax + az * az < L * L) { out.hide = true; break; }
    }
    out.u = u + side * t;
  }
}
