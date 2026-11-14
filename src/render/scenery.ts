// Instanced roadside scenery. Each object type is one mesh + one instance buffer sorted by s;
// per frame we draw only the s-range in view (two ranges across the loop seam on circuits).

import { O, Scn } from '../track/defs';
import { hashString, Rng } from '../core/rng';
import { TrackData } from '../track/generator';
import { GL, Mesh, Program } from './gl';
import { LIGHT, NOISE, PATH, PRELUDE } from './glsl';
import { buildFarTree, buildModel, LAMPS, LANDMARK, SPANNING } from './models';
import { LandmarkPlacer } from './landmarks';
import { BentPath } from './path';
import { Terrain } from './terrain';

export const OBJ_VS = PRELUDE + NOISE + PATH + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aCol;
layout(location=3) in vec4 aAux;
layout(location=4) in vec3 iSUR;
layout(location=5) in vec3 iSHX;
layout(location=6) in vec3 iAdj; // z: ground height under the object (worked out on the CPU, see terrain.ts);
                                  // rigid landmarks also x: lateral offset to draw at this frame, y: 'leave out'
uniform mat4 uViewProj;
uniform float uSCar;
uniform int uLandmark;
uniform int uSpan;
uniform int uRotor;
uniform int uBend;     // follow the road's curve along the object's length (keeps long buildings off the road)
uniform float uFoot;   // model footprint radius (unscaled)
uniform float uTime;
uniform vec3 uWind; // dirX (lateral), strength, gust
out vec3 vW; out vec3 vN; out vec4 vCol; out vec2 vAux; out float vHide;
void main(){
  float d = iSUR.x - uSCar;
  if (uLoopLen > 0.0) d = mod(d + uLoopLen * 0.5, uLoopLen) - uLoopLen * 0.5;
  PathS p = pathAt(d);
  float hide = (d < uPathInfo.x + 4.0 || d > uPathInfo.w) ? 1.0 : 0.0;
  float u = iSUR.y;
  float side = u < 0.0 ? -1.0 : 1.0;
  float edge = side < 0.0 ? p.hwL : p.hwR;
  float ext = side < 0.0 ? p.extL : p.extR;
  if (uLandmark == 0 && abs(u) > ext + 1.0 && uSpan == 0) hide = 1.0;
  if (uLandmark == 1 && uBend == 0 && uSpan == 0) {
    // pushed clear of every stretch of road in view (see landmarks.ts)
    u = iAdj.x;
    if (iAdj.y > 0.5) hide = 1.0;
  } else if (uLandmark == 1 && abs(u) > ext) {
    // squeeze far landmarks inside the folding limit, but never closer to the road than they were placed
    float keep = min(abs(iSUR.y), edge + uFoot * iSHX.x + 1.0);
    u = side * max(mix(ext, abs(u), 0.85), keep);
  }
  float off = max(abs(u) - edge, 0.0);
  float base = uSpan == 1 ? 0.0 : iAdj.z * foldTaper(abs(u), edge, ext);
  if (uLandmark == 1 && abs(iSUR.y) > ext) base -= 6.0;
  vec3 lp = aPos;
  vec3 ln = aNrm;
  float hue = iSHX.y;
  if (uSpan == 1) {
    float hw = (p.hwL + p.hwR) * 0.5;
    float ctr = (p.hwR - p.hwL) * 0.5;
    if (aAux.w > 0.75) lp.x = lp.x * hw + ctr;
    else if (aAux.w > 0.25) { float sg = sign(lp.x); lp.x = (lp.x - sg) + sg * hw + ctr; }
  } else {
    lp *= iSHX.x;
    if (uRotor == 1 && aAux.x > 0.95) {
      // rotor: spin around the hub
      vec3 hub = vec3(0.0, 62.3, -4.6) * iSHX.x;
      vec3 r = lp - hub;
      float a = uTime * (0.9 + iSHX.z * 0.6) + iSHX.z * 6.28;
      float ca = cos(a), sa = sin(a);
      lp = hub + vec3(r.x * ca - r.y * sa, r.x * sa + r.y * ca, r.z);
      ln = vec3(ln.x * ca - ln.y * sa, ln.x * sa + ln.y * ca, ln.z);
    } else if (aAux.x > 0.0) {
      // wind sway: stronger higher up
      float ph = iSHX.z * 6.28 + p.s * 0.05;
      float w = (0.25 + uWind.y) * aAux.x * (0.02 + 0.012 * lp.y);
      float g = sin(uTime * (1.6 + uWind.y) + ph) * 0.6 + sin(uTime * 3.7 + ph * 1.7) * 0.25 + uWind.z;
      lp.x += g * w * lp.y * 0.6 * (uWind.x != 0.0 ? 1.0 : 0.3) + uWind.x * uWind.y * aAux.x * 0.03 * lp.y;
      lp.z += sin(uTime * 2.3 + ph) * w * lp.y * 0.25;
    }
    float r = iSUR.z, c = cos(r), s = sin(r);
    lp = vec3(lp.x * c + lp.z * s, lp.y, -lp.x * s + lp.z * c);
    ln = vec3(ln.x * c + ln.z * s, ln.y, -ln.x * s + ln.z * c);
  }
  vec3 o = bentPos(p, u, base);
  vec3 right = vec3(cos(p.phi), 0.0, -sin(p.phi));
  vec3 fwd = vec3(sin(p.phi), 0.0, cos(p.phi));
  vec3 w = o + right * lp.x + vec3(0, 1, 0) * lp.y + fwd * lp.z;
  vec3 nrm = right * ln.x + vec3(0, 1, 0) * ln.y + fwd * ln.z;
  if (uBend == 1 && uSpan == 0) {
    // place each vertex against the road at its own distance, so a long object bends with the road
    // instead of cutting across the inside of a curve; blend back to rigid where the bent space folds
    float kb = 1.0 - smoothstep(ext * 0.75, ext, abs(u) + uFoot * iSHX.x);
    PathS q = pathAt(d + lp.z);
    vec3 rq = vec3(cos(q.phi), 0.0, -sin(q.phi));
    vec3 fq = vec3(sin(q.phi), 0.0, cos(q.phi));
    vec2 xz = q.xz + rq.xz * (u + lp.x);
    vec3 wb = vec3(xz.x, o.y + lp.y, xz.y);
    w = mix(w, wb, kb);
    nrm = mix(nrm, rq * ln.x + vec3(0, 1, 0) * ln.y + fq * ln.z, kb);
  }
  vW = w;
  vN = normalize(nrm);
  vec3 col = aCol.rgb * aCol.rgb;
  col *= 1.0 + hue * 0.16 * aAux.z;
  col += vec3(0.05, 0.035, -0.03) * hue * aAux.z;
  vCol = vec4(max(col, 0.0), aCol.a);
  vAux = vec2(aAux.y, aAux.z);
  vHide = hide;
  gl_Position = hide > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : uViewProj * vec4(w, 1.0);
}`;

export const OBJ_FS = PRELUDE + NOISE + LIGHT + `
in vec3 vW; in vec3 vN; in vec4 vCol; in vec2 vAux; in float vHide;
out vec4 o;
uniform float uEmisMul;
void main(){
  if (vHide > 0.5) discard;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float ao = clamp(0.55 + vW.y * 0.0 + 0.45, 0.0, 1.0);
  vec3 col = lightSurf(vCol.rgb, N, vW, 1.0 - vCol.a, vCol.a, ao, 1.0);
  col += vCol.rgb * vAux.x * uEmisMul * 4.0;
  o = vec4(fogApply(col, vW), blurW(vW));
}`;

const SHADOW_VS = PRELUDE + NOISE + PATH + `
layout(location=0) in vec2 aQ;
layout(location=4) in vec3 iSUR;
layout(location=5) in vec3 iSHX;
uniform mat4 uViewProj; uniform float uSCar; uniform float uRadius; uniform vec2 uSunOff;
out vec2 vQ; out float vHide; out vec3 vW;
void main(){
  float d = iSUR.x - uSCar;
  if (uLoopLen > 0.0) d = mod(d + uLoopLen * 0.5, uLoopLen) - uLoopLen * 0.5;
  PathS p = pathAt(d);
  float u = iSUR.y;
  float side = u < 0.0 ? -1.0 : 1.0;
  float edge = side < 0.0 ? p.hwL : p.hwR;
  float ext = side < 0.0 ? p.extL : p.extR;
  float hide = (d < uPathInfo.x + 4.0 || d > min(uPathInfo.w, 260.0) || abs(u) > ext) ? 1.0 : 0.0;
  float r = uRadius * iSHX.x;
  float uu = u + aQ.x * r + uSunOff.x * r;
  float dd = d + aQ.y * r + uSunOff.y * r;
  PathS q = pathAt(dd);
  float e2 = uu < 0.0 ? q.hwL : q.hwR;
  float off = max(abs(uu) - e2, 0.0);
  vec3 w = bentPos(q, uu, terrainH(q, uu, off) * foldTaper(abs(uu), e2, uu < 0.0 ? q.extL : q.extR) + 0.06);
  vQ = aQ; vHide = hide; vW = w;
  gl_Position = hide > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : uViewProj * vec4(w, 1.0);
}`;
const SHADOW_FS = PRELUDE + `
in vec2 vQ; in float vHide; in vec3 vW;
out vec4 o;
uniform float uStrength;
void main(){ if (vHide > 0.5) discard; float r = length(vQ); float a = smoothstep(1.0, 0.2, r) * uStrength; o = vec4(vec3(1.0 - a), 1.0); }`;

const VARIANTS = new Set<number>([O.PINE, O.FIR, O.OAK, O.BENT_OAK, O.BIRCH, O.POPLAR, O.WILLOW, O.DEAD_TREE, O.BUSH, O.DRYBUSH, O.FERN, O.GRASS, O.REEDS, O.ROCK, O.SNOW_ROCK, O.SNOW_PINE, O.CACTUS_ARM, O.CACTUS, O.TOWER, O.CROWD, O.BILLBOARD, O.STUMP, O.HOUSE]);

interface TypeSet {
  type: number;
  mesh: Mesh;
  /** the same model with fewer triangles, drawn beyond Scenery.lodDist (null where it would save little) */
  far: Mesh | null;
  /** trees only: the simple distance tree, drawn beyond 2.2 x lodDist */
  far2: Mesh | null;
  shadow: Mesh | null;
  s: Float32Array; // sorted s
  data: Float32Array;
  count: number;
  landmark: boolean;
  span: boolean;
  rotor: boolean;
  radius: number;
  foot: number;
  bend: boolean;
  backdrop: boolean; // deep woodland behind the roadside: visual only, shorter draw distance
  adj: boolean; // rigid landmark placed on the CPU every frame (instance data has 2 extra floats)
}

interface FarTree { s: number; u: number; h: number; type: number; scale: number; rot: number; hue: number }

/**
 * Woodland beyond the roadside, for every scenario that has trees. Purely visual: it starts beyond the reach of
 * the cars, lives only in the renderer (track data and track codes are unchanged) and is generated from the
 * track code, so it is the same every time.
 *  - band: how far from the road edge it runs; cover: how much of that band is wooded (1 = solid forest; lower
 *    values give separate woods and copses with open ground between, from a ground-fixed noise field)
 *  - trees only stand where it makes sense: clear of every other stretch of road, not on rock faces or slopes
 *    too steep to hold soil, not in water, and on Mountains not above the tree line or down the valley cliff
 */
interface WoodRule { types: number[]; near: number; far: number; cover: number; perKm: number; maxSlope: number; minH: number; maxH: number; size: [number, number] }
const WOODS: Partial<Record<number, WoodRule>> = {
  [Scn.FOREST]: { types: [O.FIR, O.FIR, O.FIR, O.OAK, O.OAK, O.BIRCH, O.PINE], near: 13, far: 150, cover: 1, perKm: 3600, maxSlope: 0.5, minH: -1e9, maxH: 1e9, size: [0.85, 1.75] },
  [Scn.RALLY]: { types: [O.PINE, O.PINE, O.PINE, O.BIRCH, O.BIRCH], near: 42, far: 230, cover: 0.5, perKm: 1500, maxSlope: 0.45, minH: -1e9, maxH: 1e9, size: [0.9, 1.7] },
  [Scn.NIGHT]: { types: [O.OAK], near: 45, far: 200, cover: 0.42, perKm: 1000, maxSlope: 0.45, minH: -1e9, maxH: 1e9, size: [0.9, 1.6] },
  [Scn.MARSH]: { types: [O.WILLOW, O.WILLOW, O.DEAD_TREE], near: 48, far: 190, cover: 0.38, perKm: 800, maxSlope: 0.4, minH: -0.15, maxH: 1e9, size: [0.85, 1.5] },
  [Scn.MOUNTAINS]: { types: [O.PINE], near: 16, far: 330, cover: 0.62, perKm: 2600, maxSlope: 0.36, minH: -1e9, maxH: 135, size: [0.9, 1.9] },
  [Scn.SNOW]: { types: [O.SNOW_PINE], near: 42, far: 210, cover: 0.55, perKm: 1500, maxSlope: 0.45, minH: -1e9, maxH: 1e9, size: [0.9, 1.7] },
  [Scn.STORM]: { types: [O.BENT_OAK], near: 42, far: 200, cover: 0.42, perKm: 1000, maxSlope: 0.45, minH: -1e9, maxH: 1e9, size: [0.9, 1.6] },
  [Scn.FOG]: { types: [O.OAK, O.OAK, O.POPLAR], near: 45, far: 170, cover: 0.42, perKm: 900, maxSlope: 0.45, minH: -1e9, maxH: 1e9, size: [0.9, 1.6] },
};

function woodland(track: TrackData, terrain: Terrain, waterY: number): FarTree[] {
  const out: FarTree[] = [];
  const rule = WOODS[track.params.scenario];
  if (!rule) return out;
  const rng = new Rng(hashString(track.code + '/woods'));
  const n = track.n, D = 2, X = track.X, Z = track.Z, H = track.heading;
  // spatial hash of road samples, to keep trees off other parts of the road
  const CELL = 24;
  const grid = new Map<number, number[]>();
  const key = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);
  for (let i = 0; i < n; i += 2) {
    const k = key(Math.floor(X[i] / CELL), Math.floor(Z[i] / CELL));
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(i);
  }
  const clearOfRoad = (x: number, z: number, own: number) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const a = grid.get(key(cx + dx, cz + dz));
      if (!a) continue;
      for (const i of a) {
        let di = Math.abs(i - own);
        if (track.circuit) di = Math.min(di, n - di);
        if (di * D < 70) continue; // the stretch this tree belongs to
        const ex = X[i] - x, ez = Z[i] - z;
        const lim = Math.max(track.hwL[i], track.hwR[i]) + 12;
        if (ex * ex + ez * ez < lim * lim) return false;
      }
    }
    return true;
  };
  // which patches of ground are wooded: smooth value noise fixed to the ground, about 90 m across
  const hsh = (a: number, b: number) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const patch = (s: number, u: number) => {
    const px = s / 90, py = u / 90, ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hsh(ix, iy), b = hsh(ix + 1, iy), c = hsh(ix, iy + 1), d = hsh(ix + 1, iy + 1);
    return a + (b - a) * ux + (c + (d - c) * ux - a - (b - a) * ux) * uy;
  };
  const STEP = 4;
  const perStep = (rule.perKm / 1000) * STEP / 2; // candidates per side per step, before the rules thin them
  for (let i0 = 0; i0 < n - 1; i0 += STEP / D) {
    for (const side of [-1, 1]) {
      let k = Math.floor(perStep / Math.max(rule.cover, 0.3));
      if (rng.float() < perStep / Math.max(rule.cover, 0.3) - k) k++;
      for (let c = 0; c < k; c++) {
        const i = Math.min(n - 1, i0 + Math.floor(rng.float() * (STEP / D)));
        const f = rng.float();
        const type = rule.types[Math.floor(rng.float() * rule.types.length)];
        const scale = rule.size[0] + rng.float() * (rule.size[1] - rule.size[0]), rot = rng.float() * Math.PI * 2, hue = rng.float() * 2 - 1;
        const keep = rng.float();
        const edge = side < 0 ? track.hwL[i] : track.hwR[i];
        // denser near the road, thinning with distance
        const off = edge + rule.near + (rule.far - rule.near) * (f * 0.45 + f * f * 0.55);
        const u = side * off;
        const s = i * D - track.sOff;
        if (rule.cover < 1) {
          // wooded patches, with ragged edges
          const m = patch(s, u);
          if (m < 1 - rule.cover - 0.06 + keep * 0.12) continue;
        }
        const th = H[i];
        if (!clearOfRoad(X[i] + Math.cos(th) * u, Z[i] - Math.sin(th) * u, i)) continue;
        const h = terrain.h(s, u);
        if (h < rule.minH || h > rule.maxH - keep * 30 || h < waterY + 0.3) continue;
        if (terrain.slope(s, u) > rule.maxSlope) continue;
        out.push({ s, u, h, type, scale, rot, hue });
      }
    }
  }
  return out;
}

const SHADOW_R: Partial<Record<number, number>> = {
  [O.PINE]: 2.6, [O.FIR]: 3, [O.SNOW_PINE]: 2.6, [O.OAK]: 3.8, [O.BENT_OAK]: 3.4, [O.BIRCH]: 2.2, [O.POPLAR]: 1.8,
  [O.WILLOW]: 4.2, [O.HOUSE]: 6, [O.COTTAGE]: 5, [O.BARN]: 9, [O.CHALET]: 7, [O.HUT]: 4, [O.ADOBE]: 5.5, [O.CACTUS_ARM]: 1.4,
  [O.TOWER]: 11, [O.DIGGER]: 3, [O.CABIN]: 3.5, [O.BUSH]: 1.6, [O.HAYBALE]: 1.0, [O.ROCK]: 1.3, [O.SNOW_ROCK]: 1.3, [O.DEAD_TREE]: 1.6,
};

export class Scenery {
  sets: TypeSet[] = [];
  prog: Program;
  shProg: Program;
  quad: WebGLBuffer;
  lamps: { s: number; u: number; h: number; type: number }[] = [];
  /** draw distance of the deep woodland as a fraction of the scenery distance (lower on low quality) */
  backdropDist = 0.8;
  /** beyond this distance ahead, models with a lighter version are drawn with it */
  lodDist = 160;
  /** density: fraction of purely decorative roadside objects kept (collidable ones always stay);
   *  woods: deep Forest woodland draw distance factor (0 = not built) */
  constructor(private gl: GL, track: TrackData, private terrain: Terrain, waterY: number, pits = true, density = 1, woods = 0.8) {
    this.prog = new Program(gl, OBJ_VS, OBJ_FS, 'objects');
    this.shProg = new Program(gl, SHADOW_VS, SHADOW_FS, 'blobshadow');
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    const o = track.objects;
    const byType = new Map<number, number[]>();
    for (let i = 0; i < o.count; i++) {
      const t = o.type[i];
      if (!pits && t === O.PITSIGN) continue;
      // thin decorative clutter on light presets; anything a car can hit stays, so nothing solid is invisible
      if (density < 1 && o.radius[i] <= 0 && !LANDMARK.has(t) && !SPANNING.has(t) && ((i * 2654435761) >>> 0) / 4294967296 > density) continue;
      let a = byType.get(t);
      if (!a) byType.set(t, (a = []));
      a.push(i);
    }
    for (const [type, all] of byType) {
      const V = VARIANTS.has(type) ? 3 : 1;
      for (let v = 0; v < V; v++) {
        const idx = V === 1 ? all : all.filter((i) => ((Math.imul(i + 7, 2654435761) >>> 0) % V) === v);
        if (!idx.length) continue;
        const mb = buildModel(type, v);
        const vbuf = mb.pack();
        const mesh = new Mesh(gl, vbuf, 32, [
          { loc: 0, size: 3, type: gl.FLOAT, offset: 0 },
          { loc: 1, size: 3, type: gl.FLOAT, offset: 12 },
          { loc: 2, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 24 },
          { loc: 3, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 28 },
        ], mb.vertexCount);
        const lb = buildModel(type, v, true);
        const landmark = LANDMARK.has(type);
        const bend = !landmark || type === O.TOWER;
        const adj = landmark && !bend && !SPANNING.has(type);
        const F = 9;
        const span = SPANNING.has(type);
        const data = new Float32Array(idx.length * F);
        const ss = new Float32Array(idx.length);
        idx.forEach((i, k) => {
          // Peaks are backdrop: the terrain itself forms the mountains beside the road now. The track places them
          // 500-1200 m out, but they are 800-1800 m across, so they ended up pushed only just clear of the road,
          // looming over it with their base in mid-air above the valley. Stand them 1.7-2.8 km away instead
          // (drawing only: the track data is unchanged).
          const u = type === O.PEAK ? Math.sign(o.u[i]) * (Math.abs(o.u[i]) * 1.6 + 900) : o.u[i];
          data.set([o.s[i], u, o.rot[i], o.scale[i], o.hue[i], ((i * 2654435761) >>> 0) / 4294967296], k * F);
          data[k * F + 6] = u;
          data[k * F + 8] = span ? 0 : this.terrain.h(o.s[i], u);
          ss[k] = o.s[i];
          if (v === 0 && LAMPS.has(type)) this.lamps.push({ s: o.s[i], u: o.u[i], h: type === O.LAMP_DOUBLE ? 10 : 7, type });
        });
        const inst = [
          { loc: 4, size: 3, type: gl.FLOAT, offset: 0 },
          { loc: 5, size: 3, type: gl.FLOAT, offset: 12 },
        ];
        inst.push({ loc: 6, size: 3, type: gl.FLOAT, offset: 24 });
        mesh.setInstances(data, F * 4, inst, adj ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
        let far: Mesh | null = null;
        if (!landmark && lb.vertexCount < mb.vertexCount * 0.8) {
          far = new Mesh(gl, lb.pack(), 32, [
            { loc: 0, size: 3, type: gl.FLOAT, offset: 0 },
            { loc: 1, size: 3, type: gl.FLOAT, offset: 12 },
            { loc: 2, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 24 },
            { loc: 3, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 28 },
          ], lb.vertexCount);
          far.setInstances(data, F * 4, inst);
        }
        let far2: Mesh | null = null;
        const tb = buildFarTree(type, v);
        if (!landmark && tb.vertexCount < lb.vertexCount * 0.7) {
          far2 = new Mesh(gl, tb.pack(), 32, [
            { loc: 0, size: 3, type: gl.FLOAT, offset: 0 },
            { loc: 1, size: 3, type: gl.FLOAT, offset: 12 },
            { loc: 2, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 24 },
            { loc: 3, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 28 },
          ], tb.vertexCount);
          far2.setInstances(data, F * 4, inst);
        }
        let shadow: Mesh | null = null;
        const r = SHADOW_R[type];
        if (r) {
          shadow = new Mesh(gl, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), 8, [{ loc: 0, size: 2, type: gl.FLOAT, offset: 0 }], 6);
          shadow.setInstances(data, F * 4, inst.slice(0, 2));
        }
        let foot = 0;
        for (let k = 0; k < mb.pos.length; k += 3) foot = Math.max(foot, Math.hypot(mb.pos[k], mb.pos[k + 2]));
        this.sets.push({ type, mesh, far, far2, shadow, s: ss, data, count: idx.length, landmark, span, rotor: type === O.TURBINE, radius: r ?? 0, foot, bend, backdrop: false, adj });
      }
    }
    this.lamps.sort((a, b) => a.s - b.s);
    this.backdropDist = woods;
    if (woods > 0) this.addBackdrop(woodland(track, this.terrain, waterY));
  }

  private addBackdrop(trees: FarTree[]): void {
    const gl = this.gl;
    // lighter presets keep fewer of the trees (as well as drawing them less far)
    const keep = Math.min(1, this.backdropDist * 1.25);
    trees = trees.filter((_, i) => ((Math.imul(i + 11, 2654435761) >>> 0) / 4294967296) < keep);
    trees.sort((a, b) => a.s - b.s);
    const byKey = new Map<string, typeof trees>();
    trees.forEach((t, i) => {
      const k = t.type + ':' + (i % 3);
      let a = byKey.get(k);
      if (!a) byKey.set(k, (a = []));
      a.push(t);
    });
    for (const [k, list] of byKey) {
      const [type, v] = k.split(':').map(Number);
      const mb = buildFarTree(type, v);
      const mesh = new Mesh(gl, mb.pack(), 32, [
        { loc: 0, size: 3, type: gl.FLOAT, offset: 0 },
        { loc: 1, size: 3, type: gl.FLOAT, offset: 12 },
        { loc: 2, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 24 },
        { loc: 3, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 28 },
      ], mb.vertexCount);
      const data = new Float32Array(list.length * 9), ss = new Float32Array(list.length);
      list.forEach((t, j) => { data.set([t.s, t.u, t.rot, t.scale, t.hue, (j * 0.618034) % 1, t.u, 0, t.h], j * 9); ss[j] = t.s; });
      mesh.setInstances(data, 36, [{ loc: 4, size: 3, type: gl.FLOAT, offset: 0 }, { loc: 5, size: 3, type: gl.FLOAT, offset: 12 }, { loc: 6, size: 3, type: gl.FLOAT, offset: 24 }]);
      let foot = 0;
      for (let q = 0; q < mb.pos.length; q += 3) foot = Math.max(foot, Math.hypot(mb.pos[q], mb.pos[q + 2]));
      this.sets.push({ type, mesh, far: null, far2: null, shadow: null, s: ss, data, count: list.length, landmark: false, span: false, rotor: false, radius: 0, foot, bend: true, backdrop: true, adj: false });
    }
  }

  /** visible instance ranges for one type */
  private ranges(set: TypeSet, sCar: number, back: number, ahead: number, loop: number, out: number[]): number[] {
    out.length = 0;
    const lower = (key: number) => {
      let lo = 0, hi = set.count;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (set.s[m] < key) lo = m + 1;
        else hi = m;
      }
      return lo;
    };
    const add = (a: number, b: number) => {
      const i0 = lower(a), i1 = lower(b);
      if (i1 > i0) out.push(i0, i1 - i0);
    };
    const a = sCar - back, b = sCar + ahead;
    if (loop > 0) {
      const A = ((a % loop) + loop) % loop;
      const B = A + (b - a);
      if (B <= loop) add(A, B);
      else {
        add(A, loop + 1);
        add(-1, B - loop);
      }
    } else add(a, b);
    return out;
  }

  private placer = new LandmarkPlacer();
  private placed = { u: 0, hide: false };

  /** place the rigid landmarks in view against the current bent path (see landmarks.ts) */
  private placeLandmarks(set: TypeSet, path: BentPath, sCar: number, loop: number, r: number[]): void {
    const D = set.data, o = this.placed;
    for (let k = 0; k < r.length; k += 2) {
      for (let j = r[k]; j < r[k] + r[k + 1]; j++) {
        const b = j * 9;
        let d = D[b] - sCar;
        if (loop > 0) d = ((d + loop * 0.5) % loop + loop) % loop - loop * 0.5;
        if (d < path.dFirst + 4 || d > path.maxD) { D[b + 7] = 1; continue; }
        this.placer.place(path, d, D[b + 1], set.foot * D[b + 3], o);
        if (o.u !== D[b + 6]) D[b + 8] = this.terrain.h(D[b], o.u);
        D[b + 6] = o.u;
        D[b + 7] = o.hide ? 1 : 0;

      }
    }
    set.mesh.updateInstances(D);
  }

  draw(prep: (p: Program) => void, sCar: number, maxD: number, loop: number, time: number, wind: number[], emis: number, path: BentPath, landmarksOnly = false): void {
    const gl = this.gl;
    const p = this.prog.use();
    prep(p);
    p.f('uSCar', sCar).f('uTime', time).v3('uWind', wind).f('uEmisMul', emis);
    const r: number[] = [];
    gl.disable(gl.CULL_FACE);
    for (const set of this.sets) {
      if (landmarksOnly && !set.landmark) continue;
      p.i('uLandmark', set.landmark ? 1 : 0).i('uSpan', set.span ? 1 : 0).i('uRotor', set.rotor ? 1 : 0).i('uBend', set.bend ? 1 : 0).f('uFoot', set.foot);
      const ahead = set.landmark ? maxD + 400 : set.backdrop ? maxD * this.backdropDist : maxD;
      const split = set.far ? Math.min(this.lodDist, ahead) : ahead;
      this.ranges(set, sCar, 60, split, loop, r);
      if (set.adj) this.placeLandmarks(set, path, sCar, loop, r);
      for (let k = 0; k < r.length; k += 2) set.mesh.drawInstances(r[k], r[k + 1]);
      if (set.far && ahead > split) {
        const split2 = set.far2 ? Math.min(split * 2.2, ahead) : ahead;
        this.ranges(set, sCar, -split, split2, loop, r);
        for (let k = 0; k < r.length; k += 2) set.far.drawInstances(r[k], r[k + 1]);
        if (set.far2 && ahead > split2) {
          this.ranges(set, sCar, -split2, ahead, loop, r);
          for (let k = 0; k < r.length; k += 2) set.far2.drawInstances(r[k], r[k + 1]);
        }
      }
    }
  }

  drawShadows(prep: (p: Program) => void, sCar: number, loop: number, sunOff: number[], strength: number): void {
    const gl = this.gl;
    const p = this.shProg.use();
    prep(p);
    p.f('uSCar', sCar).v2('uSunOff', sunOff[0], sunOff[1]).f('uStrength', strength);
    const r: number[] = [];
    for (const set of this.sets) {
      if (!set.shadow) continue;
      p.f('uRadius', set.radius);
      this.ranges(set, sCar, 30, 260, loop, r);
      for (let k = 0; k < r.length; k += 2) set.shadow.drawInstances(r[k], r[k + 1]);
    }
  }

  /** nearest lamps ahead (for point lights at night) */
  nearLamps(sCar: number, loop: number, n: number, out: { s: number; u: number; h: number; d: number }[]): void {
    out.length = 0;
    const L = this.lamps;
    if (!L.length) return;
    let lo = 0, hi = L.length;
    const key = loop > 0 ? (((sCar - 20) % loop) + loop) % loop : sCar - 20;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (L[m].s < key) lo = m + 1;
      else hi = m;
    }
    for (let k = 0; k < L.length && out.length < n; k++) {
      const i = (lo + k) % L.length;
      if (loop <= 0 && lo + k >= L.length) break;
      let d = L[i].s - sCar;
      if (loop > 0) d = ((d + loop * 0.5) % loop + loop) % loop - loop * 0.5;
      if (d > 260) break;
      if (d < -20) continue;
      out.push({ s: L[i].s, u: L[i].u, h: L[i].h, d });
    }
  }
}
export const woodlandTrees = (t: TrackData, terrain: Terrain, waterY: number): FarTree[] => woodland(t, terrain, waterY);
