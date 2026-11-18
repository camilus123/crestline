// Road, terrain, water and guard rails: all strips whose vertices are placed from the bent path.

import { F_CLIFF_L, F_CLIFF_R } from '../track/defs';
import { GL, Mesh, Program } from './gl';
import { LIGHT, NOISE, PATH, PRELUDE } from './glsl';

const BANDS = [
  { d0: -48, sp: 1 },
  { d0: 64, sp: 2 },
  { d0: 256, sp: 4 },
  { d0: 768, sp: 8 },
];
const BAND_ROWS = [116, 100, 132, 168];
export const ROWS = BAND_ROWS.reduce((a, b) => a + b, 0);
export const TERR_OFFS = [0, 0.5, 1.3, 2.6, 4.5, 7.5, 12, 19, 29, 44, 66, 98, 145, 210, 300, 410, 530, 660, 820];

const ROWS_GLSL = `
uniform vec4 uBand[4]; // dStart, spacing, rowStart, dEnd
float rowD(float r){
  for (int b = 3; b >= 0; b--) {
    if (r >= uBand[b].z) {
      float d = uBand[b].x + (r - uBand[b].z) * uBand[b].y;
      return min(d, uBand[b].w);
    }
  }
  return uBand[0].x;
}
`;

const COMMON_VS = PRELUDE + NOISE + PATH + ROWS_GLSL + `
uniform mat4 uViewProj;
`;

// ------------------------------------------------------------------ road
const ROAD_VS = COMMON_VS + `
layout(location=0) in vec2 aRC; // row, column (0 left edge, 1 right edge)
out vec3 vW; out vec2 vSU; out float vHw; out float vHwR; out float vFlags; out float vCurv; out float vD; out float vSand; out float vCloud;
void main(){
  float d = rowD(aRC.x);
  PathS p = pathAt(d);
  float u = aRC.y < 0.5 ? -p.hwL : p.hwR;
  vec3 w = bentPos(p, u, 0.0);
  vCloud = cloudShade(p.s, u);
  vW = w; vSU = vec2(p.s, u); vHw = p.hwL; vHwR = p.hwR; vFlags = p.flags; vCurv = p.curv; vD = d; vSand = int(uTerr.w + 0.5) == 4 ? 0.0 : p.sand;
  gl_Position = uViewProj * vec4(w, 1.0);
}`;

const ROAD_FS = PRELUDE + NOISE + LIGHT + `
in vec3 vW; in vec2 vSU; in float vHw; in float vHwR; in float vFlags; in float vCurv; in float vD; in float vSand; in float vCloud;
out vec4 o;
uniform vec3 uSandC;
uniform sampler2D uAsphalt;
uniform sampler2D uNoiseT;
uniform vec3 uRoadBase; uniform vec3 uLine; uniform vec3 uRumA; uniform vec3 uRumB;
uniform vec4 uRoadStyle; // edge, center type, dirt, snow
uniform vec4 uRoadStyle2; // patch, gloss, halfwidthBase(pit), neon
uniform vec4 uLines[3]; // up to 12 start/checkpoint line positions (track s)
uniform vec3 uSkyRef; uniform vec3 uSkyRef2;
uniform float uLoopLen2;
bool fl(int b){ return (int(vFlags + 0.5) & b) != 0; }
float lineAA(float x, float w){ float fw = fwidth(x) * 1.2; return 1.0 - smoothstep(w - fw, w + fw, abs(x)); }
void main(){
  float s = vSU.x, u = vSU.y;
  float sm = mod(s, 512.0);
  vec4 tA = texture(uAsphalt, vec2(u, sm) * 0.25);
  vec4 tB = texture(uAsphalt, vec2(u * 0.27 + 0.3, sm * 0.27));
  float macro = texture(uNoiseT, vec2(u * 0.01, sm * 0.004)).r;
  float lum = tA.r * (0.75 + 0.5 * tB.r) * (0.85 + 0.3 * macro);
  vec3 alb = uRoadBase * lum * 1.7;
  float rough = tA.g;
  float hwL = vHw, hwR = vHwR;
  float dl = u + hwL, dr = hwR - u; // distance to edges
  float edgeD = min(dl, dr);
  float dirt = uRoadStyle.z, snow = uRoadStyle.w;
  // patches / poor surface
  float patchN = texture(uNoiseT, vec2(u * 0.05 + 0.13, sm * 0.012)).a;
  float patchM = smoothstep(0.62, 0.66, patchN) * uRoadStyle2.x;
  alb *= 1.0 - patchM * 0.28;
  alb *= 1.0 - tA.b * 0.5 * (0.4 + uRoadStyle2.x);
  // wheel wear lanes and tyre marks in bends
  float wearC = clamp(-vCurv * 1100.0, -1.0, 1.0) * max(0.0, min(hwL, hwR) - 1.6);
  float tracks = 0.0;
  for (int k = -1; k <= 1; k += 2) {
    float x = u - (wearC + float(k) * 0.82);
    tracks += exp(-x * x * 9.0);
  }
  float bendMarks = smoothstep(1.0/700.0, 1.0/140.0, abs(vCurv)) * (0.5 + 0.5 * texture(uNoiseT, vec2(u * 0.3, sm * 0.05)).g);
  alb *= 1.0 - tracks * (0.12 + 0.25 * bendMarks) * (1.0 - dirt) * (1.0 - snow);
  // dirt road: ruts, gravel and loose edges
  if (dirt > 0.5) {
    float g = texture(uNoiseT, vec2(u * 0.9, sm * 0.9)).b;
    alb = uRoadBase * (0.7 + 0.5 * tA.r) * (0.9 + 0.2 * g);
    alb *= 1.0 - tracks * 0.18;
    alb = mix(alb, alb * vec3(1.15, 1.08, 0.95), smoothstep(1.2, 0.0, edgeD));
    rough = 0.95;
  }
  if (snow > 0.5) {
    float sp = step(0.985, texture(uNoiseT, vec2(u * 3.0, sm * 3.0)).b);
    alb = mix(vec3(0.78, 0.82, 0.88), vec3(0.42, 0.46, 0.52), tracks * 0.6) * (0.9 + 0.2 * tA.r) + sp * 0.5;
    rough = 0.55 - tracks * 0.3;
  }
  // markings
  vec3 emis = vec3(0.0);
  float neon = uRoadStyle2.w;
  if (dirt < 0.5 && snow < 0.5) {
    float m = 0.0;
    if (uRoadStyle.x > 0.5) {
      m = max(m, lineAA(dl - 0.38, 0.11));
      m = max(m, lineAA(dr - 0.38, 0.11) * (fl(4) ? 0.0 : 1.0));
    }
    int ct = int(uRoadStyle.y + 0.5);
    float dash = step(fract(s / 12.0), 0.45);
    if (ct == 1) m = max(m, lineAA(u, 0.075) * dash);
    if (ct == 2) m = max(m, max(lineAA(u - 0.17, 0.065), lineAA(u + 0.17, 0.065)));
    if (ct == 3) {
      m = max(m, max(lineAA(u - 0.15, 0.08), lineAA(u + 0.15, 0.08)));
      float lane = (hwL - 0.4) * 0.5;
      m = max(m, lineAA(u - lane, 0.08) * step(fract(s / 15.0), 0.35));
      m = max(m, lineAA(u + lane, 0.08) * step(fract(s / 15.0), 0.35));
    }
    if (ct == 4) { // neon: glowing edges + dashed centre
      float e = max(lineAA(dl - 0.3, 0.09), lineAA(dr - 0.3, 0.09) * (fl(4) ? 0.0 : 1.0));
      float c = lineAA(u, 0.07) * step(fract(s / 8.0), 0.5);
      emis += uLine * e + uRumA * c * 0.6;
      m = 0.0;
    }
    // pit strip: dashed boundary along the original edge
    // (z < 0: no pit stops in this race, so the strip is a hard shoulder behind a solid edge line)
    if (fl(4)) {
      float pb = u - abs(uRoadStyle2.z);
      m = max(m, lineAA(pb, 0.1) * (uRoadStyle2.z > 0.0 ? step(fract(s / 4.0), 0.5) : 1.0));
      // hatching inside the strip
      float hz = step(0.0, pb) * lineAA(fract((s + u) / 3.0) - 0.5, 0.06) * 0.0;
      m = max(m, hz);
    }
    m *= 0.85 + 0.15 * tA.r;
    alb = mix(alb, uLine * 0.9, m * (neon > 0.5 ? 0.0 : 1.0));
    rough = mix(rough, 0.5, m);
  }
  // start / checkpoint lines (checkered)
  for (int i = 0; i < 3; i++) {
    for (int c = 0; c < 4; c++) {
      float ls = uLines[i][c];
      if (ls < -1e5) continue;
      float ds = s - ls;
      if (uLoopLen2 > 0.0) ds = mod(ds + uLoopLen2 * 0.5, uLoopLen2) - uLoopLen2 * 0.5;
      if (abs(ds) < 1.2) {
        float chk = mod(floor(u / 0.6) + floor((ds + 1.2) / 0.6), 2.0);
        alb = mix(vec3(0.03), vec3(0.85), chk);
        rough = 0.6;
      }
    }
  }
  // rumble strips on bends
  float rum = 0.0;
  if ((fl(1) && dl < 0.95) || (fl(2) && dr < 0.95 && !fl(4))) {
    float blk = step(0.5, fract(s / 1.6));
    vec3 rc = mix(uRumA, uRumB, blk);
    if (neon > 0.5) { emis += uRumA * 0.4 * blk; rc = uRumB; }
    alb = rc * (0.8 + 0.2 * tA.r);
    rough = 0.5;
    rum = 1.0;
  }
  // desert: sand blown in from the verges
  if (vSand > 0.01) {
    float sn = texture(uNoiseT, vec2(u * 0.35, sm * 0.08)).r;
    float m = 1.0 - smoothstep(vSand * (0.5 + sn * 0.7), vSand * (0.9 + sn * 0.9), edgeD);
    vec3 sc = uSandC * (0.85 + 0.3 * texture(uNoiseT, vec2(u * 2.0, sm * 2.0)).g);
    alb = mix(alb, sc, m * 0.95);
    rough = mix(rough, 0.95, m);
  }
  // wetness: darker, glossier, reflective
  float wet = uWet * (1.0 - snow) * (1.0 - dirt * 0.5);
  float puddleN = smoothstep(0.55, 0.75, texture(uNoiseT, vec2(u * 0.12, sm * 0.03)).r) * wet;
  alb *= 1.0 - wet * 0.45;
  rough = mix(rough, 0.08, max(wet * 0.8, puddleN));
  float gloss = max(uRoadStyle2.y, wet);
  vec3 N = vec3(0.0, 1.0, 0.0);
  // rumble bump normal
  if (rum > 0.5) N = normalize(vec3(0.0, 1.0, sin(s / 1.6 * 6.2831) * 0.15));
  // tiny normal perturbation from the texture (anisotropy kills shimmer)
  N = normalize(N + vec3(tB.g - 0.5, 0.0, tA.a - 0.5) * 0.06 * (1.0 - wet));
  vec3 col = lightSurf(alb, N, vW, rough, 0.35 + gloss * 0.8, 1.0, vCloud);
  // sky reflection
  vec3 V = normalize(vW - uCamPos);
  vec3 R = reflect(V, N);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
  vec3 skyR = mix(uSkyRef2, uSkyRef, smoothstep(-0.05, 0.4, R.y));
  float sunR = pow(max(dot(R, uSunDir), 0.0), mix(40.0, 900.0, 1.0 - rough));
  col += (skyR * fres * gloss * (1.0 - rough) * 0.9 + uSunCol * sunR * gloss * 0.5 * (1.0 - rough));
  col += emis;
  o = vec4(fogApply(col, vW), blurW(vW));
}`;

// ------------------------------------------------------------------ terrain
const TERR_VS = COMMON_VS + `
layout(location=0) in vec3 aRCS; // row, offset beyond edge, side
out vec3 vW; out vec3 vN; out vec2 vSU; out float vOff; out float vSlope; out float vFlags; out float vEdge; out vec2 vAlt; out float vCloud;
uniform float uYCar; // true height of the road under the car (bent space is relative to it)
// Terrain beyond the fold limit (ext, the inside of tight bends) is squeezed smoothly towards it instead of
// being collapsed onto it, and its height tapers back to road level there (foldTaper), so the columns that pile
// up at the limit all sit at the same point: no curtain, nothing to sink.
vec3 terrPoint(float d, float off, float side, bool sink, out PathS p, out float uuOut){
  p = pathAt(d);
  float edge = side < 0.0 ? p.hwL : p.hwR;
  float ext = side < 0.0 ? p.extL : p.extR;
  float uu = edge + off;
  float dip = 0.0;
  float es = max(edge + 1.0, ext - max(8.0, (ext - edge) * 0.35));
  if (uu > es) {
    float span = max(ext - es, 1.0);
    float t = uu - es;
    uu = es + span * (1.0 - exp(-t / span));
  }
  float u = side * uu;
  uuOut = uu;
  float h = off <= 0.0 ? 0.0 : terrainH(p, u, uu - edge) * foldTaper(uu, edge, ext) * farTaper(d) - dip;
  return bentPos(p, u, h);
}
void main(){
  float d = rowD(aRCS.x);
  float off = aRCS.y, side = aRCS.z;
  PathS p, q;
  float uu, tmp;
  // The point itself and two neighbours for the normal (finite differences). One call site in a loop rather
  // than three calls: the terrain function is large and shader compilers inline every call, which made this
  // shader several times bigger and slower to compile than it needs to be.
  float e = max(0.8, off * 0.08);
  vec3 pt[3];
  for (int i = 0; i < 3; i++) {
    pt[i] = terrPoint(d + (i == 1 ? 1.5 : 0.0), off + (i == 2 ? e : 0.0), side, false, q, tmp);
    if (i == 0) { p = q; uu = tmp; }
  }
  vec3 w = pt[0];
  vec3 tA = pt[1] - w, tB = (pt[2] - w) * side;
  // where the squeeze has collapsed the ground sideways all samples land on the same point (flat, at road level,
  // see foldTaper): the cross product is zero or rounding noise and normalize() of it would be NaN, so use 'up'
  vec3 cr = cross(tA, tB);
  float lc = length(cr);
  vec3 n = lc > 1e-3 * length(tA) * max(e, 1.0) ? cr / lc : vec3(0.0, 1.0, 0.0);
  if (n.y < 0.0) n = -n;
  // texture and ground-type lookups use where the vertex ends up (squeezed), not where it would have been
  vW = w; vN = n; vSU = vec2(p.s, side * uu); vOff = max(0.0, uu - (side < 0.0 ? p.hwL : p.hwR)); vSlope = 1.0 - n.y; vFlags = p.flags;
  vEdge = side < 0.0 ? p.hwL : p.hwR;
  vCloud = cloudShade(p.s, side * uu);
  // true altitude, and height above the road here: both fixed to the ground (w.y is relative to the car, so anything
  // keyed on it slides up and down the hillsides as the road climbs)
  vAlt = vec2(w.y + uYCar, w.y - p.y);
  gl_Position = uViewProj * vec4(w, 1.0);
}`;

const TERR_FS = PRELUDE + NOISE + LIGHT + `
in vec3 vW; in vec3 vN; in vec2 vSU; in float vOff; in float vSlope; in float vFlags; in float vEdge; in vec2 vAlt; in float vCloud;
out vec4 o;
uniform sampler2D uGround; uniform sampler2D uNoiseT;
uniform float uTerrVar; // 1: mix in the second copy of the coarse texture (0 only in the picture cost test)
uniform vec3 uG0; uniform vec3 uG1; uniform vec3 uG2;
uniform int uGType;
uniform vec3 uShoulder;
uniform float uSandEdge;
void main(){
  float s = mod(vSU.x, 600.0), u = vSU.y;
  vec2 uv = vec2(u, s) / 6.0;
  vec4 g = texture(uGround, uv);
  float dist = length(vW - uCamPos);
  float big = texture(uNoiseT, vec2(u, s) * 0.0025).a;
  vec4 nz = texture(uNoiseT, vec2(u, s) * 0.011 + 0.37); // (r: patchiness, below; g: which copy of the coarse texture)
  // The coarse copy of the ground texture repeats every 32 m, which shows as a regular pattern across a big
  // slope or meadow. A second copy at another size, with its axes swapped, is mixed in patch by patch (the
  // patches come from noise that does not repeat), so no single period is left to see. Both sizes fit the 600 m
  // wrap of s a whole number of times.
  vec4 g2 = texture(uGround, uv * 0.19 + 0.31);
  if (uTerrVar > 0.5) g2 = mix(g2, texture(uGround, uv.yx * 0.13 + 0.7), smoothstep(0.35, 0.65, nz.g));
  float t = mix(g.r, g2.r, smoothstep(30.0, 200.0, dist)) * 0.6 + big * 0.6 - 0.1;
  vec3 c = mix(uG0, uG1, clamp(t, 0.0, 1.0));
  c = mix(c, uG2, clamp(g.b * 0.8 + (big - 0.6) * 0.8, 0.0, 1.0) * 0.6);
  // large-scale patchiness so meadows are not a flat colour
  float patchy = nz.r;
  c *= 0.72 + 0.5 * patchy;
  if (uGType == 0 || uGType == 7) c = mix(c, vec3(dot(c, vec3(0.3, 0.55, 0.15))), 0.18);
  float det = mix(g.g, g2.g, smoothstep(20.0, 120.0, dist));
  c *= 0.55 + det * 0.75;
  float rough = g.a;
  // steep slopes become rock
  float rock = smoothstep(0.25, 0.5, vSlope);
  float alt = vAlt.x;
  // the rock colour takes three more texture lookups: only where there is rock (most ground pixels have none)
  float detR = det;
  vec3 rockC = vec3(0.0);
  if (rock > 0.0 || uGType == 4) {
    float strata = 0.82 + 0.18 * sin(alt * 1.3 + texture(uNoiseT, vec2(u * 0.02, s * 0.02)).r * 6.0);
    // on steep faces the flat (u, s) mapping stretches into vertical streaks: map rock by (s, altitude) there
    if (rock > 0.0) { vec4 gr = texture(uGround, vec2(s + u * 0.35, alt) / 6.0); detR = mix(det, gr.g, smoothstep(0.3, 0.6, vSlope)); }
    rockC = vec3(0.23, 0.215, 0.2) * strata * (0.6 + 0.8 * texture(uNoiseT, vec2(u * 0.05, s * 0.05 + alt * 0.05)).r) * (0.8 + 0.4 * detR);
  }
  float snowM = 0.0;
  if (uGType == 4) {
    // alpine: meadow and scree low down, bare rock higher up and on anything steep, snow above the snow line
    float rel = vAlt.y + (big - 0.5) * 60.0;
    rock = max(smoothstep(0.2, 0.4, vSlope), smoothstep(90.0, 170.0, rel) * 0.85);
    // broad colour variation across the face so a mountainside is not one flat grey
    rockC *= 1.25 + 0.6 * patchy;
    rockC = mix(rockC, rockC * vec3(1.12, 1.0, 0.86), smoothstep(0.4, 0.7, big));
    snowM = smoothstep(200.0, 250.0, rel) * (1.0 - smoothstep(0.42, 0.6, vSlope));
  }
  if (uGType == 2) rockC = mix(rockC, vec3(0.8, 0.85, 0.9), 0.35);
  if (uGType == 4) rockC *= vec3(1.25, 1.12, 0.95);
  if (uGType == 1) rockC = vec3(0.55, 0.3, 0.18) * (0.8 + 0.4 * det);
  c = mix(c, rockC, rock);
  c = mix(c, vec3(0.86, 0.9, 0.96) * (0.85 + 0.2 * det), snowM);
  // shoulder / verge
  float sh = 1.0 - smoothstep(0.35, 1.2, vOff);
  c = mix(c, uShoulder * (0.7 + 0.6 * det), sh);
  // desert sand creeping across the verge
  if (uGType == 1) c = mix(c, uG1 * 1.1, (1.0 - smoothstep(0.0, 3.0, vOff)) * 0.6);
  // snow sparkle
  float spec = 0.08;
  if (uGType == 2) { spec = 0.5; c += step(0.993, texture(uNoiseT, uv * 7.0).b) * 0.6 * (1.0 - smoothstep(10.0, 60.0, dist)); }
  if (uGType == 5) { spec = 0.6; float grid = smoothstep(0.02, 0.0, abs(fract(u / 8.0) - 0.5) - 0.48) + smoothstep(0.02, 0.0, abs(fract(s / 8.0) - 0.5) - 0.48);
    c += uG2 * grid * 0.8 * smoothstep(3.0, 6.0, vOff); }
  vec3 N = normalize(vN + vec3(g.g - 0.5, 0.0, g2.g - 0.5) * 0.25 * (1.0 - rock));
  float ao = 0.75 + 0.25 * smoothstep(0.0, 2.0, vOff);
  float shade = 1.0;
  if (uGType == 7) {
    // forest floor under the trees: needles, moss and leaf litter in dappled canopy shade
    float deep = smoothstep(5.0, 16.0, vOff) * (1.0 - rock);
    float moss = texture(uNoiseT, vec2(u, s) * 0.04 + 0.13).g;
    vec3 floorC = mix(vec3(0.15, 0.08, 0.035), vec3(0.085, 0.1, 0.035), smoothstep(0.55, 0.85, moss)) * (0.65 + 0.5 * det);
    c = mix(c, floorC, deep * 0.95);
    float dapple = smoothstep(0.42, 0.62, texture(uNoiseT, vec2(u, s) * 0.06 + 0.71).r);
    shade = 1.0 - deep * (0.85 - 0.6 * dapple);
    ao *= 1.0 - deep * 0.4;
  }
  vec3 col = lightSurf(c, N, vW, rough, spec, ao, shade * vCloud);
  if (uGType == 5) col += uG2 * smoothstep(0.02, 0.0, abs(fract(u / 8.0) - 0.5) - 0.485) * 0.6 * smoothstep(3.0, 6.0, vOff);
  o = vec4(fogApply(col, vW), blurW(vW));
}`;

// ------------------------------------------------------------------ water
const WATER_VS = COMMON_VS + `
layout(location=0) in vec2 aRC; // row, lateral fraction -1..1
out vec3 vW; out vec2 vSU;
uniform float uWaterY;
void main(){
  float d = rowD(aRC.x);
  PathS p = pathAt(d);
  float ext = aRC.y < 0.0 ? p.extL : p.extR;
  float u = aRC.y * ext;
  vec3 w = bentPos(p, u, uWaterY);
  vW = w; vSU = vec2(p.s, u);
  gl_Position = uViewProj * vec4(w, 1.0);
}`;
const WATER_FS = PRELUDE + NOISE + LIGHT + `
in vec3 vW; in vec2 vSU;
out vec4 o;
uniform vec3 uWaterC; uniform vec3 uSkyRef; uniform vec3 uSkyRef2;
uniform sampler2D uNoiseT;
void main(){
  float s = mod(vSU.x, 400.0), u = vSU.y;
  vec2 q = vec2(u, s);
  float n1 = texture(uNoiseT, q * 0.05 + vec2(uTime * 0.02, 0.0)).r;
  float n2 = texture(uNoiseT, q * 0.11 - vec2(0.0, uTime * 0.03)).g;
  vec3 N = normalize(vec3((n1 - 0.5) * 0.25, 1.0, (n2 - 0.5) * 0.25));
  vec3 V = normalize(vW - uCamPos);
  vec3 R = reflect(V, N);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
  vec3 sky = mix(uSkyRef2, uSkyRef, smoothstep(-0.05, 0.5, R.y));
  float sun = pow(max(dot(R, uSunDir), 0.0), 300.0) * 4.0;
  vec3 col = uWaterC * (uAmbTop * 0.6 + uSunCol * 0.1) + sky * fres + uSunCol * sun;
  o = vec4(fogApply(col, vW), blurW(vW));
}`;

// ------------------------------------------------------------------ guard rail / barrier strip
const RAIL_VS = COMMON_VS + `
layout(location=0) in vec3 aRP; // row, profile u-offset, profile height
layout(location=1) in float aSide;
out vec3 vW; out vec3 vN; out float vSide;
uniform float uRailOff; // offset beyond edge
uniform int uRailMode;  // 0 cliff-side only (mountains), 1 both sides (motorway)
void main(){
  float d = rowD(aRP.x);
  PathS p = pathAt(d);
  float side = aSide;
  bool on = uRailMode == 1 || (side < 0.0 ? flag(p.flags, ${F_CLIFF_L}) : flag(p.flags, ${F_CLIFF_R}));
  float edge = side < 0.0 ? p.hwL : p.hwR;
  float u = side * (edge + uRailOff + aRP.y);
  float h = aRP.z - (on ? 0.0 : 3.0);
  vec3 w = bentPos(p, u, h);
  vW = w; vN = normalize(vec3(-cos(p.phi) * side, 0.25, sin(p.phi) * side)); vSide = side;
  gl_Position = uViewProj * vec4(w, 1.0);
}`;
const RAIL_FS = PRELUDE + NOISE + LIGHT + `
in vec3 vW; in vec3 vN; in float vSide;
out vec4 o;
uniform vec3 uRailC;
void main(){
  vec3 col = lightSurf(uRailC, normalize(vN), vW, 0.45, 0.5, 0.8, 1.0);
  o = vec4(fogApply(col, vW), blurW(vW));
}`;

export class Ground {
  road: Mesh;
  terr: Mesh;
  /** the terrain with half the rows and fewer columns (light presets): about 40 % of the vertices */
  terrLite: Mesh;
  water: Mesh;
  rail: Mesh;
  roadP: Program;
  terrP: Program;
  private gl0!: GL;
  private terrDepth: Program | null = null;
  /** the terrain with no shading at all, for the sun shadow maps (made when shadows are first used) */
  get terrDepthP(): Program { return this.terrDepth ??= new Program(this.gl0, TERR_VS, '#version 300 es\nprecision highp float;\nvoid main(){}', 'terrain-depth'); }
  waterP: Program;
  railP: Program;
  bandU = new Float32Array(16);
  constructor(private gl: GL) {
    // road: rows x 2
    {
      const v: number[] = [];
      for (let r = 0; r < ROWS; r++) v.push(r, 0, r, 1);
      const idx: number[] = [];
      for (let r = 0; r < ROWS - 1; r++) {
        const a = r * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
      this.road = new Mesh(gl, new Float32Array(v), 8, [{ loc: 0, size: 2, type: gl.FLOAT, offset: 0 }], 0, new Uint32Array(idx));
    }
    // terrain: rows x cols per side
    {
      const v: number[] = [];
      const C = TERR_OFFS.length;
      for (const side of [-1, 1]) for (let r = 0; r < ROWS; r++) for (let c = 0; c < C; c++) v.push(r, TERR_OFFS[c], side);
      const idx: number[] = [];
      for (let sI = 0; sI < 2; sI++) {
        const base = sI * ROWS * C;
        for (let r = 0; r < ROWS - 1; r++)
          for (let c = 0; c < C - 1; c++) {
            const a = base + r * C + c, b = a + 1, cc = a + C, d = cc + 1;
            if (sI === 0) idx.push(a, b, cc, b, d, cc);
            else idx.push(a, cc, b, b, cc, d);
          }
      }
      this.terr = new Mesh(gl, new Float32Array(v), 12, [{ loc: 0, size: 3, type: gl.FLOAT, offset: 0 }], 0, new Uint32Array(idx));
    }
    {
      const rows: number[] = [];
      for (let r = 0; r < ROWS; r += 2) rows.push(r);
      if (rows[rows.length - 1] !== ROWS - 1) rows.push(ROWS - 1);
      const offs = [0, 0.5, 1.3, 2.6, 4.5, 7.5, 12, 22, 40, 70, 120, 200, 320, 480, 680, 820];
      const v: number[] = [];
      const C = offs.length, Rn = rows.length;
      for (const side of [-1, 1]) for (const r of rows) for (let c = 0; c < C; c++) v.push(r, offs[c], side);
      const idx: number[] = [];
      for (let sI = 0; sI < 2; sI++) {
        const base = sI * Rn * C;
        for (let r = 0; r < Rn - 1; r++)
          for (let c = 0; c < C - 1; c++) {
            const a = base + r * C + c, b = a + 1, cc = a + C, d = cc + 1;
            if (sI === 0) idx.push(a, b, cc, b, d, cc);
            else idx.push(a, cc, b, b, cc, d);
          }
      }
      this.terrLite = new Mesh(gl, new Float32Array(v), 12, [{ loc: 0, size: 3, type: gl.FLOAT, offset: 0 }], 0, new Uint32Array(idx));
    }
    // water: rows x 9 lateral
    {
      const v: number[] = [];
      const cols = [-1, -0.6, -0.3, -0.1, 0, 0.1, 0.3, 0.6, 1];
      for (let r = 0; r < ROWS; r++) for (const c of cols) v.push(r, c);
      const idx: number[] = [];
      const C = cols.length;
      for (let r = 0; r < ROWS - 1; r++)
        for (let c = 0; c < C - 1; c++) {
          const a = r * C + c, b = a + 1, cc = a + C, d = cc + 1;
          idx.push(a, cc, b, b, cc, d);
        }
      this.water = new Mesh(gl, new Float32Array(v), 8, [{ loc: 0, size: 2, type: gl.FLOAT, offset: 0 }], 0, new Uint32Array(idx));
    }
    // rail: W-beam profile (both sides)
    {
      const prof = [[0, 0.55], [0.08, 0.6], [0.0, 0.68], [0.08, 0.76], [0.0, 0.82], [-0.02, 0.82], [-0.02, 0.55]];
      const v: number[] = [];
      const P = prof.length;
      for (const side of [-1, 1]) for (let r = 0; r < ROWS; r++) for (const [pu, ph] of prof) v.push(r, -pu, ph, side);
      const idx: number[] = [];
      for (let sI = 0; sI < 2; sI++) {
        const base = sI * ROWS * P;
        for (let r = 0; r < ROWS - 1; r++)
          for (let c = 0; c < P - 1; c++) {
            const a = base + r * P + c, b = a + 1, cc = a + P, d = cc + 1;
            idx.push(a, cc, b, b, cc, d);
          }
      }
      this.rail = new Mesh(gl, new Float32Array(v), 16, [
        { loc: 0, size: 3, type: gl.FLOAT, offset: 0 },
        { loc: 1, size: 1, type: gl.FLOAT, offset: 12 },
      ], 0, new Uint32Array(idx));
    }
    this.roadP = new Program(gl, ROAD_VS, ROAD_FS, 'road');
    this.terrP = new Program(gl, TERR_VS, TERR_FS, 'terrain');
    this.gl0 = gl;
    this.waterP = new Program(gl, WATER_VS, WATER_FS, 'water');
    this.railP = new Program(gl, RAIL_VS, RAIL_FS, 'rail');
  }

  /** compute row bands snapped to absolute s so vertices never swim */
  bands(sCar: number, maxD: number): Float32Array {
    const B = this.bandU;
    let rowStart = 0;
    const bounds: number[] = [];
    for (let b = 0; b < 4; b++) {
      const sp = BANDS[b].sp;
      const coarse = b < 3 ? BANDS[b + 1].sp : sp;
      void coarse;
      const start = b === 0 ? Math.floor((sCar + BANDS[0].d0) / sp) * sp : bounds[b];
      bounds[b] = start;
      let end: number;
      if (b < 3) {
        const nsp = BANDS[b + 1].sp;
        end = Math.ceil((sCar + BANDS[b + 1].d0) / nsp) * nsp;
      } else end = Math.ceil((sCar + Math.max(maxD, 100)) / sp) * sp;
      end = Math.min(end, start + (BAND_ROWS[b] - 1) * sp);
      bounds[b + 1] = end;
      B[b * 4] = start - sCar;
      B[b * 4 + 1] = sp;
      B[b * 4 + 2] = rowStart;
      B[b * 4 + 3] = end - sCar;
      rowStart += BAND_ROWS[b];
    }
    return B;
  }
}

export { BANDS, BAND_ROWS };
