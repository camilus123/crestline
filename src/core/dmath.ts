// Deterministic maths for track generation.
// Only + - * / and Math.floor/round/sqrt/abs are used: these are exactly specified by IEEE 754,
// so results are bit-identical in every JavaScript engine. Math.sin/cos/exp are NOT (they may
// differ in the last ulp between V8 and SpiderMonkey), so the generator must never call them.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

function sinPoly(r: number): number {
  const r2 = r * r;
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800 + r2 * (1 / 6227020800)))))));
}
function cosPoly(r: number): number {
  const r2 = r * r;
  return 1 + r2 * (-0.5 + r2 * (1 / 24 + r2 * (-1 / 720 + r2 * (1 / 40320 + r2 * (-1 / 3628800 + r2 * (1 / 479001600))))));
}

export function dsin(x: number): number {
  const k = Math.round(x / HALF_PI);
  const r = x - k * HALF_PI;
  const q = ((k % 4) + 4) % 4;
  if (q === 0) return sinPoly(r);
  if (q === 1) return cosPoly(r);
  if (q === 2) return -sinPoly(r);
  return -cosPoly(r);
}

export function dcos(x: number): number {
  const k = Math.round(x / HALF_PI);
  const r = x - k * HALF_PI;
  const q = ((k % 4) + 4) % 4;
  if (q === 0) return cosPoly(r);
  if (q === 1) return -sinPoly(r);
  if (q === 2) return -cosPoly(r);
  return sinPoly(r);
}

/** Smooth 0..1 raised-cosine window, deterministic. */
export function dhann(t: number): number {
  if (t <= -1 || t >= 1) return 0;
  return 0.5 + 0.5 * dcos(t * PI);
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
