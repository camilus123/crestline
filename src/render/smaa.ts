// Anti-aliasing after the fact: SMAA 1x.
//
// The three shader passes below are a port to GLSL ES 3.00 of SMAA.hlsl from the SMAA project
// (https://github.com/iryoku/smaa), "SMAA: Enhanced Subpixel Morphological Antialiasing" by Jorge Jimenez,
// Jose I. Echevarria, Tiago Sousa and Diego Gutierrez, with its "high" settings, and they use that project's
// two precomputed lookup tables (smaatables.ts).
//   Copyright (C) 2013 Jorge Jimenez, Jose I. Echevarria, Belen Masia, Fernando Navarro, Diego Gutierrez.
//   MIT licence: third_party/smaa/LICENSE.txt (the upstream shader is kept beside it, for the comparison test).
//
// How it works: (1) find the edges in the picture, (2) for every edge pixel follow the edge both ways to see
// what shape of step it belongs to, and look up how much of the pixel the true edge would cover, (3) mix each
// edge pixel with its neighbour by that much. It runs once on the finished 3D picture, so unlike MSAA it also
// smooths the edges inside textures and of cut-out leaves, and its cost does not grow with the scene.
//
// What differs from the upstream shader, and why:
//  - Where it sits. The game's picture is still scene light with a wide range at this point (bloom, tone mapping
//    and the colour grade come after, in the composite). The edge pass therefore looks at each pixel as the
//    screen will show it (exposure, tone curve, a square root for gamma), and the last pass mixes the pixels
//    as the light the screen will give out (through the tone curve, mix, back through its inverse). Mixed in
//    plain scene light, a lamp fifty times brighter than the wall behind it stays a staircase, because half
//    of 50 is still far beyond white. Going back through the curve cannot give more than about 7 / exposure:
//    an edge pixel of something very bright comes out as plain white, which is what it shows as anyway, and the
//    bloom is taken from the picture before this pass, so the glow of bright things is untouched.
//  - The picture may fill only a corner of its texture (render resolution below 100 %): coordinates run in
//    texture space, and the two working textures are cleared whole, so nothing stale is read past the corner.
//  - Colour edge detection compares the left neighbour with ITS left neighbour for the local-contrast test, as
//    the luma variant and the paper do (upstream's colour variant compares the centre pixel instead).
//  - A pixel's own edges and the weights are read exactly (texelFetch, a nearest-filtered texture). Upstream
//    reads them through a bilinear sampler at the texel centre, and tests the result against zero; where a
//    GPU filters more finely than the usual 1/256 of a texel, the faintest trace of a neighbour's edge then
//    makes a pixel that has none do the whole look-up, and its weight spoils the blend of the pixel beside
//    it (seen on the software GPU the tests run on: one pixel in eight wrong along a shallow edge).
//  - `while` loops are `for` loops with the same conditions and one spare turn; texture offsets are added to
//    the coordinate by hand (textureLodOffset has a history of driver bugs on phones); every read names its
//    mip level (none of these textures has more than one, and a read that must work out its level may not
//    sit behind a branch on every graphics driver).
//  - Rows are not flipped. Upstream counts rows from the top and WebGL from the bottom; every texture here,
//    the tables included, is addressed the upstream way, so the passes see the picture upside down, which is
//    all the same to them. tests/smaaref.mjs checks passes 2 and 3 against the upstream shader, texel by texel.

import { createTexture, GL, Program, Target } from './gl';
import { PRELUDE } from './glsl';
import { unpackTable } from './inflate';
import { AREA, AREA_Z, SEARCH, SEARCH_Z } from './smaatables';

const VS = PRELUDE + `
layout(location=0) in vec2 aPos;
uniform vec2 uSub; // the part of the texture the picture fills
out vec2 vT;       // texture coordinate
void main(){ vT = (aPos * 0.5 + 0.5) * uSub; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// uM = 1/width, 1/height, width, height of the textures (upstream: SMAA_RT_METRICS)

/** pass 1: edges to the left of (red) and above (green) each pixel */
export const SMAA_EDGE_FS = PRELUDE + `
in vec2 vT; out vec4 o;
uniform sampler2D uScene; uniform vec4 uM; uniform vec2 uMax; uniform float uExposure;
const float THRESHOLD = 0.1;
const float ADAPT = 2.0; // an edge is dropped when a neighbouring one is more than this many times stronger
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// the pixel about as the screen will show it
vec3 seen(vec2 t){ return sqrt(aces(max(textureLod(uScene, min(t, uMax), 0.0).rgb, 0.0) * uExposure)); }
float diff(vec3 a, vec3 b){ vec3 t = abs(a - b); return max(max(t.r, t.g), t.b); }
void main(){
  vec3 C = seen(vT);
  vec3 Cleft = seen(vT + uM.xy * vec2(-1.0, 0.0));
  vec3 Ctop = seen(vT + uM.xy * vec2(0.0, -1.0));
  vec4 delta;
  delta.x = diff(C, Cleft);
  delta.y = diff(C, Ctop);
  vec2 edges = step(vec2(THRESHOLD), delta.xy);
  if (edges.x + edges.y == 0.0) discard;
  delta.z = diff(C, seen(vT + uM.xy * vec2(1.0, 0.0)));
  delta.w = diff(C, seen(vT + uM.xy * vec2(0.0, 1.0)));
  vec2 maxDelta = max(delta.xy, delta.zw);
  delta.z = diff(Cleft, seen(vT + uM.xy * vec2(-2.0, 0.0)));
  delta.w = diff(Ctop, seen(vT + uM.xy * vec2(0.0, -2.0)));
  maxDelta = max(maxDelta, delta.zw);
  float finalDelta = max(maxDelta.x, maxDelta.y);
  edges *= step(finalDelta, ADAPT * delta.xy);
  o = vec4(edges, 0.0, 1.0);
}`;

/** pass 2: how much of each edge pixel the true edge covers (upstream: SMAABlendingWeightCalculationPS) */
export const SMAA_WEIGHT_FS = PRELUDE + `
in vec2 vT; out vec4 o;
uniform sampler2D uEdges; uniform sampler2D uArea; uniform sampler2D uSearch; uniform vec4 uM;
#define STEPS 16
#define STEPS_DIAG 8
const float CORNER = 0.25;        // SMAA_CORNER_ROUNDING 25
const float AREA_MAX = 16.0;      // SMAA_AREATEX_MAX_DISTANCE
const float AREA_MAX_DIAG = 20.0; // SMAA_AREATEX_MAX_DISTANCE_DIAG
const vec2 AREA_PX = 1.0 / vec2(160.0, 560.0);
const float AREA_SUB = 1.0 / 7.0;
const vec2 SEARCH_SIZE = vec2(66.0, 33.0);
const vec2 SEARCH_PACKED = vec2(64.0, 16.0);
vec4 E(vec2 t){ return textureLod(uEdges, t, 0.0); }
vec4 EO(vec2 t, float x, float y){ return textureLod(uEdges, t + vec2(x, y) * uM.xy, 0.0); }

// ---- diagonal patterns
vec2 decodeDiag(vec2 e){ e.r = e.r * abs(5.0 * e.r - 5.0 * 0.75); return round(e); }
vec4 decodeDiag(vec4 e){ e.rb = e.rb * abs(5.0 * e.rb - 5.0 * 0.75); return round(e); }
vec2 searchDiag1(vec2 tc, vec2 dir, out vec2 e){
  vec4 coord = vec4(tc, -1.0, 1.0);
  vec3 t = vec3(uM.xy, 1.0);
  e = vec2(0.0);
  for (int i = 0; i < STEPS_DIAG + 1; i++) {
    if (!(coord.z < float(STEPS_DIAG - 1) && coord.w > 0.9)) break;
    coord.xyz = t * vec3(dir, 1.0) + coord.xyz;
    e = E(coord.xy).rg;
    coord.w = dot(e, vec2(0.5));
  }
  return coord.zw;
}
vec2 searchDiag2(vec2 tc, vec2 dir, out vec2 e){
  vec4 coord = vec4(tc, -1.0, 1.0);
  coord.x += 0.25 * uM.x;
  vec3 t = vec3(uM.xy, 1.0);
  e = vec2(0.0);
  for (int i = 0; i < STEPS_DIAG + 1; i++) {
    if (!(coord.z < float(STEPS_DIAG - 1) && coord.w > 0.9)) break;
    coord.xyz = t * vec3(dir, 1.0) + coord.xyz;
    e = decodeDiag(E(coord.xy).rg);
    coord.w = dot(e, vec2(0.5));
  }
  return coord.zw;
}
vec2 areaDiag(vec2 dist, vec2 e, float offset){
  vec2 tc = vec2(AREA_MAX_DIAG) * e + dist;
  tc = AREA_PX * tc + 0.5 * AREA_PX;
  tc.x += 0.5;
  tc.y += AREA_SUB * offset;
  return textureLod(uArea, tc, 0.0).rg;
}
vec2 diagWeights(vec2 tc, vec2 e){
  vec2 weights = vec2(0.0);
  vec4 d;
  vec2 end;
  if (e.r > 0.0) {
    d.xz = searchDiag1(tc, vec2(-1.0, 1.0), end);
    d.x += float(end.y > 0.9);
  } else d.xz = vec2(0.0);
  d.yw = searchDiag1(tc, vec2(1.0, -1.0), end);
  if (d.x + d.y > 2.0) {
    vec4 coords = vec4(-d.x + 0.25, d.x, d.y, -d.y - 0.25) * uM.xyxy + tc.xyxy;
    vec4 c;
    c.xy = EO(coords.xy, -1.0, 0.0).rg;
    c.zw = EO(coords.zw, 1.0, 0.0).rg;
    c = decodeDiag(c).yxwz;
    vec2 cc = vec2(2.0) * c.xz + c.yw;
    cc *= 1.0 - step(vec2(0.9), d.zw);
    weights += areaDiag(d.xy, cc, 0.0);
  }
  d.xz = searchDiag2(tc, vec2(-1.0, -1.0), end);
  if (EO(tc, 1.0, 0.0).r > 0.0) {
    d.yw = searchDiag2(tc, vec2(1.0, 1.0), end);
    d.y += float(end.y > 0.9);
  } else d.yw = vec2(0.0);
  if (d.x + d.y > 2.0) {
    vec4 coords = vec4(-d.x, -d.x, d.y, d.y) * uM.xyxy + tc.xyxy;
    vec4 c;
    c.x = EO(coords.xy, -1.0, 0.0).g;
    c.y = EO(coords.xy, 0.0, -1.0).r;
    c.zw = EO(coords.zw, 1.0, 0.0).gr;
    vec2 cc = vec2(2.0) * c.xz + c.yw;
    cc *= 1.0 - step(vec2(0.9), d.zw);
    weights += areaDiag(d.xy, cc, 0.0).gr;
  }
  return weights;
}

// ---- horizontal and vertical patterns
float searchLength(vec2 e, float offset){
  vec2 scale = SEARCH_SIZE * vec2(0.5, -1.0);
  vec2 bias = SEARCH_SIZE * vec2(offset, 1.0);
  scale += vec2(-1.0, 1.0);
  bias += vec2(0.5, -0.5);
  scale *= 1.0 / SEARCH_PACKED;
  bias *= 1.0 / SEARCH_PACKED;
  return textureLod(uSearch, scale * e + bias, 0.0).r;
}
float searchXLeft(vec2 tc, float end){
  vec2 e = vec2(0.0, 1.0);
  for (int i = 0; i < STEPS + 1; i++) {
    if (!(tc.x > end && e.g > 0.8281 && e.r == 0.0)) break;
    e = E(tc).rg;
    tc = -vec2(2.0, 0.0) * uM.xy + tc;
  }
  float offset = -(255.0 / 127.0) * searchLength(e, 0.0) + 3.25;
  return uM.x * offset + tc.x;
}
float searchXRight(vec2 tc, float end){
  vec2 e = vec2(0.0, 1.0);
  for (int i = 0; i < STEPS + 1; i++) {
    if (!(tc.x < end && e.g > 0.8281 && e.r == 0.0)) break;
    e = E(tc).rg;
    tc = vec2(2.0, 0.0) * uM.xy + tc;
  }
  float offset = -(255.0 / 127.0) * searchLength(e, 0.5) + 3.25;
  return -uM.x * offset + tc.x;
}
float searchYUp(vec2 tc, float end){
  vec2 e = vec2(1.0, 0.0);
  for (int i = 0; i < STEPS + 1; i++) {
    if (!(tc.y > end && e.r > 0.8281 && e.g == 0.0)) break;
    e = E(tc).rg;
    tc = -vec2(0.0, 2.0) * uM.xy + tc;
  }
  float offset = -(255.0 / 127.0) * searchLength(e.gr, 0.0) + 3.25;
  return uM.y * offset + tc.y;
}
float searchYDown(vec2 tc, float end){
  vec2 e = vec2(1.0, 0.0);
  for (int i = 0; i < STEPS + 1; i++) {
    if (!(tc.y < end && e.r > 0.8281 && e.g == 0.0)) break;
    e = E(tc).rg;
    tc = vec2(0.0, 2.0) * uM.xy + tc;
  }
  float offset = -(255.0 / 127.0) * searchLength(e.gr, 0.5) + 3.25;
  return -uM.y * offset + tc.y;
}
vec2 area(vec2 dist, float e1, float e2){
  vec2 tc = vec2(AREA_MAX) * round(4.0 * vec2(e1, e2)) + dist;
  tc = AREA_PX * tc + 0.5 * AREA_PX;
  return textureLod(uArea, tc, 0.0).rg;
}
vec2 cornerH(vec2 weights, vec4 tc, vec2 d){
  vec2 leftRight = step(d.xy, d.yx);
  vec2 rounding = (1.0 - CORNER) * leftRight;
  rounding /= leftRight.x + leftRight.y;
  vec2 factor = vec2(1.0);
  factor.x -= rounding.x * EO(tc.xy, 0.0, 1.0).r;
  factor.x -= rounding.y * EO(tc.zw, 1.0, 1.0).r;
  factor.y -= rounding.x * EO(tc.xy, 0.0, -2.0).r;
  factor.y -= rounding.y * EO(tc.zw, 1.0, -2.0).r;
  return weights * clamp(factor, 0.0, 1.0);
}
vec2 cornerV(vec2 weights, vec4 tc, vec2 d){
  vec2 leftRight = step(d.xy, d.yx);
  vec2 rounding = (1.0 - CORNER) * leftRight;
  rounding /= leftRight.x + leftRight.y;
  vec2 factor = vec2(1.0);
  factor.x -= rounding.x * EO(tc.xy, 1.0, 0.0).g;
  factor.x -= rounding.y * EO(tc.zw, 1.0, 1.0).g;
  factor.y -= rounding.x * EO(tc.xy, -2.0, 0.0).g;
  factor.y -= rounding.y * EO(tc.zw, -2.0, 1.0).g;
  return weights * clamp(factor, 0.0, 1.0);
}

void main(){
  vec2 pix = vT * uM.zw;
  vec4 off0 = uM.xyxy * vec4(-0.25, -0.125, 1.25, -0.125) + vT.xyxy;
  vec4 off1 = uM.xyxy * vec4(-0.125, -0.25, -0.125, 1.25) + vT.xyxy;
  vec4 off2 = uM.xxyy * (vec4(-2.0, 2.0, -2.0, 2.0) * float(STEPS)) + vec4(off0.xz, off1.yw);
  vec4 weights = vec4(0.0);
  vec2 e = texelFetch(uEdges, ivec2(gl_FragCoord.xy), 0).rg; // (exactly this pixel's: see the notes at the top)
  if (e.g > 0.0) { // an edge above
    // (a diagonal has an edge above and one to the left: looking for it from the one above is enough, and a
    // diagonal that is found takes the place of the horizontal and vertical look-ups)
    weights.rg = diagWeights(vT, e);
    if (weights.r == -weights.g) {
      vec2 d;
      vec3 coords;
      coords.x = searchXLeft(off0.xy, off2.x);
      coords.y = off1.y;
      d.x = coords.x;
      float e1 = E(coords.xy).r;
      coords.z = searchXRight(off0.zw, off2.y);
      d.y = coords.z;
      d = abs(round(uM.zz * d - pix.xx));
      vec2 sqrtD = sqrt(d);
      float e2 = EO(coords.zy, 1.0, 0.0).r;
      weights.rg = area(sqrtD, e1, e2);
      coords.y = vT.y;
      weights.rg = cornerH(weights.rg, coords.xyzy, d);
    } else e.r = 0.0;
  }
  if (e.r > 0.0) { // an edge to the left
    vec2 d;
    vec3 coords;
    coords.y = searchYUp(off1.xy, off2.z);
    coords.x = off0.x;
    d.x = coords.y;
    float e1 = E(coords.xy).g;
    coords.z = searchYDown(off1.zw, off2.w);
    d.y = coords.z;
    d = abs(round(uM.ww * d - pix.yy));
    vec2 sqrtD = sqrt(d);
    float e2 = EO(coords.xz, 0.0, 1.0).g;
    weights.ba = area(sqrtD, e1, e2);
    coords.x = vT.x;
    weights.ba = cornerV(weights.ba, coords.xyxz, d);
  }
  o = weights;
}`;

/** pass 3: each edge pixel mixed with the neighbour across its edge (upstream: SMAANeighborhoodBlendingPS) */
export const SMAA_BLEND_FS = PRELUDE + `
in vec2 vT; out vec4 o;
uniform sampler2D uScene; uniform sampler2D uBlend; uniform vec4 uM;
uniform float uK; // the exposure the composite will apply; 0 mixes in plain linear light as upstream does
// to the light the screen will give out (the composite's tone curve), and back
vec4 shown(vec4 c){
  if (uK <= 0.0) return c;
  vec3 x = max(c.rgb, 0.0) * uK;
  return vec4(clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0), c.a);
}
vec4 unshown(vec4 c){
  if (uK <= 0.0) return c;
  vec3 y = min(c.rgb, 0.999);
  vec3 a = 2.51 - 2.43 * y, b = 0.03 - 0.59 * y;
  return vec4((sqrt(b * b + 0.56 * a * y) - b) / (2.0 * a) / uK, c.a);
}
void main(){
  vec4 a;
  a.x = textureLod(uBlend, vT + uM.xy * vec2(1.0, 0.0), 0.0).a;
  a.y = textureLod(uBlend, vT + uM.xy * vec2(0.0, 1.0), 0.0).g;
  a.wz = textureLod(uBlend, vT, 0.0).xz;
  vec4 c = textureLod(uScene, vT, 0.0);
  if (dot(a, vec4(1.0)) < 1e-5) { o = c; return; }
  bool h = max(a.x, a.z) > max(a.y, a.w);
  vec2 w = h ? a.xz : a.yw;
  vec2 dir = h ? vec2(uM.x, 0.0) : vec2(0.0, uM.y);
  vec2 share = w / (w.x + w.y);
  // (upstream reads two bilinear samples moved towards each neighbour by its weight: the same mix, but it could
  // not be done in screen light)
  vec4 sc = shown(c);
  o = unshown(share.x * mix(sc, shown(textureLod(uScene, vT + dir, 0.0)), w.x) + share.y * mix(sc, shown(textureLod(uScene, vT - dir, 0.0)), w.y));
}`;

export { VS as SMAA_VS };

export class Smaa {
  private edgeP: Program;
  private weightP: Program;
  private blendP: Program;
  /** edges found (kept public for tests) */
  edges: Target;
  weights: Target;
  private out: Target;
  private area: WebGLTexture;
  private search: WebGLTexture;

  /** `tri` draws a triangle that covers the viewport (attribute 0 = clip-space position) */
  constructor(private gl: GL, fmt: { internal: number; format: number; type: number }, private tri: () => void) {
    // (compiling starts here and runs in the background until the first frame that uses it)
    this.edgeP = new Program(gl, VS, SMAA_EDGE_FS, 'smaa-edges');
    this.weightP = new Program(gl, VS, SMAA_WEIGHT_FS, 'smaa-weights');
    this.blendP = new Program(gl, VS, SMAA_BLEND_FS, 'smaa-blend');
    this.edges = new Target(gl, gl.RG8, gl.RG, gl.UNSIGNED_BYTE, false);
    this.weights = new Target(gl, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, false, gl.NEAREST);
    this.out = new Target(gl, fmt.internal, fmt.format, fmt.type, false);
    gl.activeTexture(gl.TEXTURE0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.area = createTexture(gl, AREA.w, AREA.h, gl.RG8, gl.RG, gl.UNSIGNED_BYTE, unpackTable(AREA_Z, AREA.w, AREA.h, AREA.bpp), gl.LINEAR);
    this.search = createTexture(gl, SEARCH.w, SEARCH.h, gl.R8, gl.RED, gl.UNSIGNED_BYTE, unpackTable(SEARCH_Z, SEARCH.w, SEARCH.h, SEARCH.bpp), gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  /**
   * Smooths the picture in the lower-left rw x rh texels of `scene` (linear light, as the composite expects it)
   * and returns the target holding the result, laid out the same way.
   * exposure: what the composite will multiply the picture by before its tone curve.
   */
  run(scene: Target, rw: number, rh: number, exposure: number, screenLight = true): Target {
    const gl = this.gl;
    const W = scene.w, H = scene.h;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    const begin = (t: Target) => {
      t.resize(W, H);
      t.bind();
      gl.clear(gl.COLOR_BUFFER_BIT); // the whole texture, not only the part in use (nothing stale beside it)
      gl.viewport(0, 0, rw, rh);
    };
    const common = (p: Program) => p.v2('uSub', rw / W, rh / H).v4('uM', 1 / W, 1 / H, W, H);
    begin(this.edges);
    common(this.edgeP.use()).tex('uScene', scene.tex, 0).v2('uMax', (rw - 0.5) / W, (rh - 0.5) / H).f('uExposure', exposure);
    this.tri();
    begin(this.weights);
    common(this.weightP.use()).tex('uEdges', this.edges.tex, 0).tex('uArea', this.area, 1).tex('uSearch', this.search, 2);
    this.tri();
    begin(this.out);
    common(this.blendP.use()).tex('uScene', scene.tex, 0).tex('uBlend', this.weights.tex, 1).f('uK', screenLight ? exposure : 0);
    this.tri();
    return this.out;
  }

  /** frees the three working textures and the tables (the shader programs are kept: they are made once per page) */
  dispose(): void {
    const gl = this.gl;
    this.edges.dispose();
    this.weights.dispose();
    this.out.dispose();
    gl.deleteTexture(this.area);
    gl.deleteTexture(this.search);
  }
}
