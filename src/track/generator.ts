// Deterministic track generator. The same code produces bit-identical data in every engine:
// only integer RNG, IEEE basic arithmetic and the deterministic trig in dmath are used.

import { dcos, dhann, dsin, clamp, lerp, PI } from '../core/dmath';
import { hashBytes, hashString, Rng } from '../core/rng';
import { decodeCode, normalizeCode, TrackParams } from './codes';
import {
  DELTA, F_CLIFF_L, F_CLIFF_R, F_PIT, F_PROTECT, F_RUMBLE_L, F_RUMBLE_R, F_WALL_L, F_WALL_R,
  HAZARD_BLOCKING, Hz, O, RoadsideRule, SCENARIOS, ScenarioDef, Scn,
} from './defs';

export interface Hazard {
  kind: Hz;
  s: number; // start (track s)
  len: number;
  u0: number; // lateral range (metres from centre, +right)
  u1: number;
  a: number; // kind-specific parameters
  b: number;
  c: number;
  d: number;
}

export interface ObjectSet {
  count: number;
  s: Float32Array;
  u: Float32Array;
  type: Uint8Array;
  scale: Float32Array;
  rot: Float32Array;
  hue: Float32Array; // -1..1 colour variation
  radius: Float32Array;
}

export interface TrackData {
  code: string;
  name: string;
  params: TrackParams;
  scen: ScenarioDef;
  circuit: boolean;
  n: number; // samples
  sOff: number; // track s of sample 0 is -sOff
  lapLen: number; // circuits: lap length; stages: 0
  geoLen: number; // n * DELTA
  raceLen: number; // total race distance
  laps: number;
  curv: Float32Array;
  grade: Float32Array;
  Y: Float32Array;
  hwL: Float32Array;
  hwR: Float32Array;
  sand: Float32Array;
  flags: Uint8Array;
  X: Float32Array;
  Z: Float32Array;
  heading: Float32Array;
  checkpoints: number[]; // race distances; last one = finish
  pits: { s0: number; s1: number }[];
  hazards: Hazard[];
  objects: ObjectSet;
  hash: string;
}

const PIT_WIDTH = 6.5;

export function generateTrack(input: string): TrackData {
  const { code } = normalizeCode(input);
  const p = decodeCode(code);
  const scen = SCENARIOS[p.scenario];
  const rng = new Rng(hashString(code));
  const T = (v: number) => v / 25;
  const tC = T(p.curves), tS = T(p.sharpness), tL = T(p.length), tH = T(p.hills), tSt = T(p.steepness);
  const tD = T(p.difficulty), tSc = T(p.scenery), tSa = T(p.scatter), tO = T(p.obstacles);
  const circuit = p.type === 0;
  const D = DELTA;

  // ---------- lengths ----------
  let raceLen = Math.round((5000 + tL * 20000) / D) * D;
  let lapLen = 0, laps = 1, sOff = 0, n: number;
  if (circuit) {
    const lapTarget = 2600 + rng.float() * 1800 + tL * 1200;
    laps = clamp(Math.round(raceLen / lapTarget), 2, 9);
    lapLen = Math.round(raceLen / laps / D) * D;
    raceLen = lapLen * laps;
    n = lapLen / D;
  } else {
    sOff = 240;
    n = (sOff + raceLen + 2000) / D;
  }
  const geoLen = n * D;
  const idxOf = (s: number) => Math.round((s + sOff) / D);
  const sOf = (i: number) => i * D - sOff;

  // checkpoints (race distances)
  const checkpoints: number[] = [];
  if (circuit) {
    for (let l = 1; l <= laps; l++) checkpoints.push(l * lapLen);
  } else {
    const stages = clamp(Math.round(raceLen / 3200), 2, 8);
    let acc = 0;
    const w: number[] = [];
    for (let k = 0; k < stages; k++) {
      const v = 0.85 + rng.float() * 0.3;
      w.push(v);
      acc += v;
    }
    let s = 0;
    for (let k = 0; k < stages - 1; k++) {
      s += (raceLen * w[k]) / acc;
      checkpoints.push(Math.round(s / D) * D);
    }
    checkpoints.push(raceLen);
  }

  // ---------- protected zones (straight, flat, no hazards) ----------
  const prot = new Uint8Array(n);
  const mark = (s0: number, s1: number) => {
    for (let s = s0; s <= s1; s += D) {
      let i = idxOf(s);
      if (circuit) i = ((i % n) + n) % n;
      if (i >= 0 && i < n) prot[i] = 1;
    }
  };
  const pits: { s0: number; s1: number }[] = [];
  if (circuit) {
    mark(-170, 430);
    pits.push({ s0: 70, s1: 370 });
  } else {
    mark(-sOff, 230);
    for (let k = 0; k < checkpoints.length - 1; k++) {
      mark(checkpoints[k] - 70, checkpoints[k] + 410);
      pits.push({ s0: checkpoints[k] + 70, s1: checkpoints[k] + 370 });
    }
    mark(raceLen - 70, raceLen + 160);
  }

  // ---------- curvature ----------
  const cT = new Float64Array(n);
  const H = new Float64Array(n + 1); // heading history (running)
  {
    const cs = scen.curveScale;
    const rmin = lerp(380, 34, tS) / cs;
    const rmax = lerp(1500, 280, tS * 0.7 + tC * 0.3) / Math.sqrt(cs);
    let i = 0;
    let sBendNext = false;
    let lastDir = rng.sign();
    var loopTarget = rng.sign() * 2 * PI;
    while (i < n) {
      if (prot[i]) {
        H[i + 1] = H[i];
        i++;
        continue;
      }
      // straight
      const baseStraight = lerp(720, 70, tC) / Math.sqrt(cs);
      const sl = sBendNext ? 10 + rng.float() * 40 : baseStraight * (0.35 + 1.3 * rng.float());
      const steps = Math.max(1, Math.round(sl / D));
      for (let k = 0; k < steps && i < n; k++, i++) H[i + 1] = H[i];
      if (i >= n) break;
      let room = 0;
      while (i + room < n && !prot[i + room] && room < 3000) room++;
      if (room * D < 70) {
        for (let k = 0; k < room; k++, i++) H[i + 1] = H[i];
        continue;
      }
      const u = rng.float();
      const curvature = lerp(1 / rmax, 1 / rmin, Math.min(1, u * u * (0.4 + 0.6 * tS) + u * 0.6 * tS));
      let angle = ((lerp(16, 34, tC) + rng.float() * lerp(30, 115, tS * 0.6 + tC * 0.4)) * PI) / 180;
      angle = Math.min(angle, (165 * PI) / 180);
      let arc = angle / curvature;
      let ramp = clamp(arc * 0.35, 14, 90);
      const avail = room * D - 30;
      if (2 * ramp + arc > avail) {
        const f = avail / (2 * ramp + arc);
        ramp *= f;
        arc *= f;
      }
      // direction with heading budget so the road never folds back within view;
      // circuits are steered towards one full turn so they read as a loop on the map
      let dir = sBendNext ? -lastDir : rng.sign();
      if (circuit && !sBendNext) {
        const remainFrac = Math.max(0.05, 1 - i / n);
        const deficit = (loopTarget - H[i]) / (2 * PI * remainFrac);
        dir = rng.float() < 0.5 + Math.max(-0.42, Math.min(0.42, deficit * 0.6)) ? 1 : -1;
      }
      const back = Math.max(0, i - Math.round(700 / D));
      const recent = H[i] - H[back];
      const turn = curvature * (arc + ramp);
      if (Math.abs(recent + dir * turn) > 2.5) dir = -dir;
      lastDir = dir;
      sBendNext = rng.chance(0.15 + 0.35 * tC);
      const total = Math.round((2 * ramp + arc) / D);
      const rs = Math.max(1, Math.round(ramp / D));
      for (let k = 0; k < total && i < n; k++, i++) {
        let prof = 1;
        if (k < rs) prof = k / rs;
        else if (k > total - rs) prof = (total - k) / rs;
        prof = prof * prof * (3 - 2 * prof);
        cT[i] = dir * curvature * prof;
        H[i + 1] = H[i] + cT[i] * D;
      }
    }
  }
  const curv = smoothArray(cT, 8, circuit, 2);
  if (circuit) {
    // make the total turning exactly one loop by scaling bends in proportion to their curvature
    let tot = 0, abs = 0;
    for (let i = 0; i < n; i++) { tot += curv[i] * D; abs += Math.abs(curv[i]) * D; }
    const target = tot >= 0 ? 2 * PI : -2 * PI;
    const e = target - tot;
    if (abs > 1e-6) for (let i = 0; i < n; i++) curv[i] += (e * Math.abs(curv[i]) * D) / abs / D;
  }

  // ---------- elevation ----------
  const grade = new Float64Array(n);
  {
    const hs = scen.hillsScale;
    const count = Math.round(lerp(0.15, 3.2, tH) * hs * (geoLen / 1000));
    let sign = rng.sign();
    for (let b = 0; b < count; b++) {
      const c = rng.float() * geoLen;
      const lam = lerp(lerp(520, 170, tSt), lerp(260, 70, tSt), rng.float());
      const A = lerp(0.012, 0.125, tSt) * (0.35 + 0.65 * rng.float()) * sign * Math.min(1.4, hs);
      if (rng.chance(0.75)) sign = -sign;
      const i0 = Math.floor((c - lam) / D), i1 = Math.ceil((c + lam) / D);
      for (let i = i0; i <= i1; i++) {
        let j = i;
        if (circuit) j = ((i % n) + n) % n;
        else if (j < 0 || j >= n) continue;
        grade[j] += A * dhann((i * D - c) / lam);
      }
    }
    for (let i = 0; i < n; i++) grade[i] = clamp(grade[i], -0.15, 0.15);
    // flatten protected zones smoothly
    const pm = smoothArray(Float64Array.from(prot), 20, circuit, 2);
    for (let i = 0; i < n; i++) grade[i] *= 1 - clamp(pm[i] * 1.6, 0, 1);
    if (circuit) {
      // make elevation periodic: remove the net climb, outside protected zones only
      let sum = 0, wsum = 0;
      for (let i = 0; i < n; i++) {
        sum += grade[i];
        wsum += 1 - clamp(pm[i] * 1.6, 0, 1);
      }
      const corr = wsum > 0 ? sum / wsum : 0;
      for (let i = 0; i < n; i++) grade[i] -= corr * (1 - clamp(pm[i] * 1.6, 0, 1));
    }
  }
  const gradeS = smoothArray(grade, 6, circuit, 2);
  const Y = new Float32Array(n);
  {
    let y = 0;
    for (let i = 0; i < n; i++) {
      Y[i] = y;
      y += gradeS[i] * D;
    }
  }

  // ---------- width ----------
  const hwL = new Float32Array(n), hwR = new Float32Array(n);
  {
    const base = scen.halfWidth * lerp(1.12, 0.86, tD);
    const wn = new Float64Array(n);
    const bumps = Math.round(geoLen / 600);
    for (let b = 0; b < bumps; b++) {
      const c = rng.float() * geoLen, lam = 60 + rng.float() * 160, A = (rng.float() - 0.5) * 0.18;
      const i0 = Math.floor((c - lam) / D), i1 = Math.ceil((c + lam) / D);
      for (let i = i0; i <= i1; i++) {
        let j = i;
        if (circuit) j = ((i % n) + n) % n;
        else if (j < 0 || j >= n) continue;
        wn[j] += A * dhann((i * D - c) / lam);
      }
    }
    for (let i = 0; i < n; i++) {
      const w = base * (1 + clamp(wn[i], -0.12, 0.12) * (prot[i] ? 0 : 1));
      hwL[i] = w;
      hwR[i] = w;
    }
    for (const pz of pits) {
      for (let s = pz.s0 - 40; s <= pz.s1 + 40; s += D) {
        const i = wrapIdx(idxOf(s), n, circuit);
        if (i < 0) continue;
        let f = 1;
        if (s < pz.s0) f = (s - (pz.s0 - 40)) / 40;
        else if (s > pz.s1) f = (pz.s1 + 40 - s) / 40;
        f = f * f * (3 - 2 * f);
        hwR[i] += PIT_WIDTH * f;
      }
    }
  }

  // ---------- flags ----------
  const flags = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (prot[i]) flags[i] |= F_PROTECT;
  for (const pz of pits)
    for (let s = pz.s0; s <= pz.s1; s += D) {
      const i = wrapIdx(idxOf(s), n, circuit);
      if (i >= 0) flags[i] |= F_PIT;
    }
  if (scen.rumble) {
    for (let i = 0; i < n; i++) {
      if (Math.abs(curv[i]) > 1 / 650) {
        for (let k = -12; k <= 12; k++) {
          const j = wrapIdx(i + k, n, circuit);
          if (j >= 0) flags[j] |= F_RUMBLE_L | F_RUMBLE_R;
        }
      }
    }
  }
  if (scen.walls === 'mountain') {
    let i = 0;
    let side = rng.sign();
    while (i < n) {
      const len = Math.round((1200 + rng.float() * 1800) / D);
      for (let k = 0; k < len && i < n; k++, i++) {
        flags[i] |= side < 0 ? F_WALL_L | F_CLIFF_R : F_WALL_R | F_CLIFF_L;
      }
      side = -side;
    }
  } else if (scen.walls === 'motorway') {
    for (let i = 0; i < n; i++) flags[i] |= F_WALL_L | F_WALL_R;
  }

  // ---------- desert sand ----------
  const sand = new Float32Array(n);
  if (p.scenario === Scn.DESERT) {
    const sn = new Float64Array(n);
    const bumps = Math.round(geoLen / 250);
    for (let b = 0; b < bumps; b++) {
      const c = rng.float() * geoLen, lam = 40 + rng.float() * 140, A = rng.float();
      const i0 = Math.floor((c - lam) / D), i1 = Math.ceil((c + lam) / D);
      for (let i = i0; i <= i1; i++) {
        const j = wrapIdx(i, n, circuit);
        if (j >= 0) sn[j] += A * dhann((i * D - c) / lam);
      }
    }
    for (let i = 0; i < n; i++) sand[i] = (0.5 + clamp(sn[i], 0, 1.6) * lerp(1.0, 1.8, tD)) * (prot[i] ? 0.4 : 1);
  }

  // ---------- hazards ----------
  const hazards: Hazard[] = [];
  {
    const rate = scen.hazardRate * lerp(0.08, 1.0, tO) * lerp(0.8, 1.3, tD);
    const blockers: number[] = [];
    const near = (s: number, dist: number) => blockers.some((b) => Math.abs(b - s) < dist);
    if (rate > 0) {
      const gapMean = 1000 / rate;
      const sEnd = circuit ? lapLen : raceLen;
      let s = circuit ? 450 : 260;
      const weights = scen.hazards.map((h) => h.weight);
      while (s < sEnd - 120) {
        s += gapMean * (0.3 + 1.4 * rng.float());
        if (s >= sEnd - 120) break;
        const i = wrapIdx(idxOf(s), n, circuit);
        if (i < 0 || prot[i]) continue;
        const kind = scen.hazards[rng.weighted(weights)].kind;
        const L = hwL[i], R = hwR[i], W = L + R;
        const h: Hazard = { kind, s, len: 4, u0: -L, u1: R, a: 0, b: 0, c: 0, d: 0 };
        const span = (w: number) => {
          const c0 = -L + w / 2 + 0.2, c1 = R - w / 2 - 0.2;
          const c = c1 > c0 ? lerp(c0, c1, rng.float()) : 0;
          h.u0 = c - w / 2;
          h.u1 = c + w / 2;
        };
        const fromEdge = (w: number) => {
          if (rng.chance(0.5)) {
            h.u0 = -L - 0.5;
            h.u1 = -L + w;
          } else {
            h.u0 = R - w;
            h.u1 = R + 0.5;
          }
        };
        switch (kind) {
          case Hz.PUDDLE: h.len = 5 + rng.float() * 10; span(2 + rng.float() * 3.2); break;
          case Hz.MUD: h.len = 10 + rng.float() * 22; span(3 + rng.float() * 4.5); break;
          case Hz.OIL: h.len = 5 + rng.float() * 5; span(1.6 + rng.float() * 1.8); break;
          case Hz.FLOOD: h.len = 25 + rng.float() * 40; h.u0 = -L - 3; h.u1 = R + 3; break;
          case Hz.STREAM: h.len = 5 + rng.float() * 5; h.u0 = -L - 4; h.u1 = R + 4; break;
          case Hz.ICE: h.len = 15 + rng.float() * 30; span(3 + rng.float() * (W - 3)); break;
          case Hz.POTHOLE: {
            h.len = 1.4; span(1.4);
            // small clusters
            const extra = rng.int(3);
            for (let k = 0; k < extra; k++) {
              const h2 = { ...h, s: s + 3 + rng.float() * 8 };
              const c = clamp(h.u0 + 0.7 + (rng.float() - 0.5) * 3, -L + 0.8, R - 0.8);
              h2.u0 = c - 0.7; h2.u1 = c + 0.7;
              hazards.push(h2);
            }
            break;
          }
          case Hz.SNOWBANK: h.len = 8 + rng.float() * 14; fromEdge(1.2 + rng.float() * 1.4); break;
          case Hz.DRIFT: h.len = 6 + rng.float() * 8; fromEdge(1.8 + rng.float() * 2.4); break;
          case Hz.CONE: {
            if (near(s, 120)) continue;
            h.len = 50 + rng.float() * 90;
            const closeW = Math.max(1.2, W - 4.0);
            h.a = rng.sign(); // closed side
            if (h.a < 0) { h.u0 = -L; h.u1 = -L + closeW; } else { h.u0 = R - closeW; h.u1 = R; }
            blockers.push(s, s + h.len);
            break;
          }
          case Hz.BARRIER: {
            if (near(s, 110)) continue;
            h.len = 1.4; fromEdge(Math.min(W - 4.3, 2.4 + rng.float() * 1.4));
            blockers.push(s);
            break;
          }
          case Hz.ROCK: {
            if (near(s, 110)) continue;
            const r = scen.walls === 'mountain' ? 0.55 + rng.float() * 0.45 : 0.7 + rng.float() * 0.7;
            h.len = r * 2;
            const c = lerp(-L + r + 0.3, R - r - 0.3, rng.float());
            const gapL = c - r + L, gapR = R - (c + r);
            if (Math.max(gapL, gapR) < 4.3) continue;
            h.u0 = c - r; h.u1 = c + r;
            blockers.push(s);
            break;
          }
          case Hz.FALLEN_TREE: {
            if (near(s, 120)) continue;
            h.len = 1.3; fromEdge(Math.max(2, W - 4.6 - rng.float() * 2));
            blockers.push(s);
            break;
          }
          case Hz.LOG: {
            h.len = 0.9; h.u0 = -L - 1; h.u1 = R + 1;
            if (near(s, 40)) continue;
            break;
          }
          case Hz.LASER: {
            if (near(s, 80)) continue;
            h.len = 0.6; h.u0 = -L - 1.5; h.u1 = R + 1.5;
            h.a = 1.8 + rng.float() * 1.3; h.b = 0.26 + rng.float() * 0.12; h.c = rng.float();
            blockers.push(s);
            break;
          }
          case Hz.MAGNET: {
            h.len = 40; h.a = rng.sign(); h.b = 3.2 + rng.float() * 3.2 * (0.6 + 0.6 * tD);
            if (h.a < 0) { h.u0 = -L - 2.2; h.u1 = -L - 1.2; } else { h.u0 = R + 1.2; h.u1 = R + 2.2; }
            h.c = rng.float();
            break;
          }
          case Hz.GUST: {
            h.len = 160 + rng.float() * 260; h.a = rng.sign(); h.b = 3.4 + rng.float() * 3.2 * (0.6 + 0.7 * tD);
            h.c = rng.float(); h.d = 5 + rng.float() * 4;
            h.u0 = -L - 30; h.u1 = R + 30;
            break;
          }
        }
        // never inside pits / protected zones
        const ie = wrapIdx(idxOf(s + h.len), n, circuit);
        if (ie < 0 || prot[ie]) continue;
        if (HAZARD_BLOCKING.has(kind) && !passable(h, L, R)) continue;
        hazards.push(h);
      }
      // Forest: put a jump log ahead of some fallen trees and streams
      if (p.scenario === Scn.FOREST) {
        const extra: Hazard[] = [];
        for (const h of hazards) {
          if ((h.kind === Hz.STREAM || h.kind === Hz.FALLEN_TREE) && rng.chance(0.45)) {
            const sl = h.s - 22 - rng.float() * 10;
            const i = wrapIdx(idxOf(sl), n, circuit);
            if (i < 0 || prot[i]) continue;
            extra.push({ kind: Hz.LOG, s: sl, len: 0.9, u0: -hwL[i] - 1, u1: hwR[i] + 1, a: 0, b: 0, c: 0, d: 0 });
          }
        }
        hazards.push(...extra);
      }
    }
    hazards.sort((a, b) => a.s - b.s);
  }

  // ---------- roadside objects ----------
  const objs: { s: number; u: number; type: number; scale: number; rot: number; hue: number; radius: number }[] = [];
  {
    const orng = rng.fork(77);
    const sStart = circuit ? 0 : -sOff + 4;
    const sEnd = circuit ? lapLen : raceLen + 1900;
    const density = lerp(1.6, 15, tSc) * scen.densityMul; // per side per 100 m
    const spacing = 100 / density;
    const tidy = tSa < 0.3;
    const edgeAt = (s: number, side: number) => {
      const i = wrapIdx(idxOf(s), n, circuit);
      if (i < 0) return 6;
      return side < 0 ? hwL[i] : hwR[i];
    };
    // buildings, fences and signs face the road so their drawn footprint matches their collision box
    const alignRot = (rule: RoadsideRule, side: number, rot: number) =>
      rule.align === 'face' ? (side > 0 ? 0 : PI) : rule.align === 'grid' ? Math.round(rot / (PI / 2)) * (PI / 2) : rot;
    const add = (s: number, u: number, rule: RoadsideRule, scale: number, rot: number, hue: number) => {
      if (!circuit && (s < -sOff || s > geoLen - sOff)) return;
      const ws = circuit ? ((s % lapLen) + lapLen) % lapLen : s;
      objs.push({ s: ws, u, type: rule.type, scale, rot, hue, radius: rule.radius * scale });
    };
    for (const side of [-1, 1]) {
      const rules = scen.roadside.filter((r) => (r.side ?? 0) === 0 || r.side === side).filter((r) => r.far > 0);
      const rowRules = rules.filter((r) => r.row);
      const weights = rules.map((r) => r.weight);
      let s = sStart + orng.float() * spacing;
      let runEnd = -1e9;
      let runRule: RoadsideRule = rules[0];
      let runOff = 0, runSpacing = spacing, runScale = 1, runHue = 0;
      while (s < sEnd) {
        if (tidy) {
          if (s > runEnd) {
            runEnd = s + 250 + orng.float() * 450;
            runRule = (rowRules.length ? rowRules : rules)[orng.weighted((rowRules.length ? rowRules : rules).map((r) => r.weight))];
            runOff = lerp(runRule.near, runRule.far, orng.float() * 0.6);
            runSpacing = clamp(spacing * (0.8 + orng.float() * 0.8), 4, 60);
            runScale = lerp(runRule.scale[0], runRule.scale[1], 0.5);
            runHue = (orng.float() - 0.5) * 0.3;
          }
          const j = tSa * 2; // small jitter even when tidy
          const u = side * (edgeAt(s, side) + runOff);
          add(s, u, runRule, runScale * (1 + (orng.float() - 0.5) * j * 0.3), side > 0 ? 0 : PI, runHue + (orng.float() - 0.5) * j * 0.3);
          s += runSpacing;
        } else {
          const rule = rules[orng.weighted(weights)];
          const sj = s + (orng.float() - 0.5) * spacing * tSa;
          const f = orng.float();
          const off = lerp(rule.near, rule.far, f * f * 0.7 + f * 0.3);
          const sc = lerp(rule.scale[0], rule.scale[1], orng.float());
          const rot = alignRot(rule, side, orng.float() * PI * 2);
          const hue = (orng.float() * 2 - 1) * lerp(0.3, 1, tSa);
          add(sj, side * (edgeAt(sj, side) + off), rule, sc, rot, hue);
          if (rule.cluster && rule.cluster > 1 && orng.chance(0.25 + 0.5 * tSa)) {
            const k = 1 + orng.int(rule.cluster - 1);
            for (let c = 0; c < k; c++) {
              const s2 = sj + (orng.float() - 0.5) * 12;
              const off2 = Math.max(rule.near, off + (orng.float() - 0.5) * 10);
              add(s2, side * (edgeAt(s2, side) + off2), rule, lerp(rule.scale[0], rule.scale[1], orng.float()), alignRot(rule, side, orng.float() * PI * 2), (orng.float() * 2 - 1) * lerp(0.3, 1, tSa));
            }
          }
          s += spacing * (0.5 + orng.float());
        }
      }
    }
    // spanning objects (arches, gantries) – one pass
    const spanRule = scen.roadside.find((r) => r.far === 0 && r.near === 0);
    if (spanRule) {
      let s = sStart + 300;
      while (s < sEnd - 200) {
        s += lerp(900, 350, tSc) * (0.6 + orng.float() * 0.8);
        const i = wrapIdx(idxOf(s), n, circuit);
        if (i < 0 || prot[i]) continue;
        add(s, 0, spanRule, 1, 0, (orng.float() - 0.5) * 0.6);
      }
    }
    // start / finish / checkpoint arches
    const arch: RoadsideRule = { type: O.ARCH, weight: 0, near: 0, far: 0, radius: 0, scale: [1, 1] };
    add(0, 0, arch, 1, 0, 0);
    if (!circuit) for (const cp of checkpoints) add(cp, 0, arch, 1, 0, cp === raceLen ? 1 : 0.5);
    // pit signs
    if (scen.pitSigns) {
      const sign: RoadsideRule = { type: O.PITSIGN, weight: 0, near: 0, far: 0, radius: 0.4, scale: [1, 1] };
      for (const pz of pits) {
        for (const d of [-180, -100, -20]) add(pz.s0 + d, edgeAt(pz.s0 + d, 1) + 2.2, sign, 1, 0, d);
      }
    }
    // chevrons on the outside of sharp bends
    if (p.scenario !== Scn.FUTURE) {
      const chev: RoadsideRule = { type: O.CHEVRON, weight: 0, near: 0, far: 0, radius: 0.25, scale: [1, 1] };
      for (let i = 0; i < n; i += 7) {
        const c = curv[i];
        if (Math.abs(c) > 1 / 140 && !(flags[i] & F_PIT)) {
          const side = c > 0 ? -1 : 1; // outside of the bend
          const s = sOf(i);
          add(s, side * (edgeAt(s, side) + 1.6), chev, 1, side > 0 ? 0 : PI, 0);
        }
      }
    }
    // rally crowds on the outside of bends
    if (p.scenario === Scn.RALLY) {
      const crowd = scen.roadside.find((r) => r.type === O.CROWD)!;
      for (let i = 0; i < n; i += 25) {
        if (Math.abs(curv[i]) > 1 / 200 && orng.chance(0.35)) {
          const side = curv[i] > 0 ? -1 : 1;
          const s = sOf(i);
          for (let k = 0; k < 4; k++) add(s + k * 3.5, side * (edgeAt(s, side) + 5 + orng.float() * 2), crowd, 1, side > 0 ? -PI / 2 : PI / 2, orng.float() * 2 - 1);
        }
      }
    }
    // landmarks
    for (const lm of scen.landmarks) {
      let s = sStart + orng.float() * lm.every;
      const rule: RoadsideRule = { type: lm.type, weight: 0, near: 0, far: 0, radius: 0, scale: lm.scale };
      while (s < sEnd) {
        let side = orng.sign();
        if (scen.walls === 'mountain') {
          const fi = wrapIdx(idxOf(s), n, circuit);
          if (fi >= 0) side = flags[fi] & F_CLIFF_L ? -1 : 1;
        }
        const dist = lerp(lm.dist[0], lm.dist[1], orng.float());
        const u = dist === 0 ? 0 : side * (edgeAt(s, side) + dist);
        const i = wrapIdx(idxOf(s), n, circuit);
        if (!(dist === 0 && i >= 0 && prot[i])) add(s, u, rule, lerp(lm.scale[0], lm.scale[1], orng.float()), orng.float() * PI * 2, orng.float() * 2 - 1);
        s += lm.every * (0.6 + orng.float() * 0.8);
      }
    }
  }
  objs.sort((a, b) => a.s - b.s || a.u - b.u);
  const oc = objs.length;
  const objects: ObjectSet = {
    count: oc,
    s: new Float32Array(oc), u: new Float32Array(oc), type: new Uint8Array(oc), scale: new Float32Array(oc),
    rot: new Float32Array(oc), hue: new Float32Array(oc), radius: new Float32Array(oc),
  };
  objs.forEach((o, k) => {
    objects.s[k] = o.s; objects.u[k] = o.u; objects.type[k] = o.type; objects.scale[k] = o.scale;
    objects.rot[k] = o.rot; objects.hue[k] = o.hue; objects.radius[k] = o.radius;
  });

  // ---------- map geometry ----------
  const X = new Float32Array(n), Z = new Float32Array(n), heading = new Float32Array(n);
  {
    let th = 0, x = 0, z = 0;
    for (let i = 0; i < n; i++) {
      X[i] = x; Z[i] = z; heading[i] = th;
      th += curv[i] * D;
      x += dsin(th) * D;
      z += dcos(th) * D;
    }
  }

  const curvF = Float32Array.from(curv);
  const gradeF = Float32Array.from(gradeS);
  const data: TrackData = {
    code, name: code, params: p, scen, circuit, n, sOff, lapLen, geoLen, raceLen, laps,
    curv: curvF, grade: gradeF, Y, hwL, hwR, sand, flags, X, Z, heading,
    checkpoints, pits, hazards, objects, hash: '',
  };
  data.hash = trackHash(data);
  return data;
}

function wrapIdx(i: number, n: number, circuit: boolean): number {
  if (circuit) return ((i % n) + n) % n;
  return i >= 0 && i < n ? i : -1;
}

function passable(h: Hazard, L: number, R: number): boolean {
  const gapL = h.u0 + L, gapR = R - h.u1;
  return Math.max(gapL, gapR) >= 4.2;
}

/** Box filter, repeated `passes` times, with wrap for circuits. */
function smoothArray(src: Float64Array, radius: number, wrap: boolean, passes: number): Float64Array {
  const n = src.length;
  let a = Float64Array.from(src);
  let b = new Float64Array(n);
  const w = 2 * radius + 1;
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        let j = i + k;
        if (wrap) j = ((j % n) + n) % n;
        else j = j < 0 ? 0 : j >= n ? n - 1 : j;
        sum += a[j];
      }
      b[i] = sum / w;
    }
    const t = a;
    a = b;
    b = t;
  }
  return a;
}

export function trackHash(t: TrackData): string {
  const parts: Uint8Array[] = [];
  const f32 = (a: Float32Array) => parts.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  f32(t.curv); f32(t.grade); f32(t.Y); f32(t.hwL); f32(t.hwR); f32(t.sand); f32(t.X); f32(t.Z); f32(t.heading);
  parts.push(t.flags);
  const o = t.objects;
  f32(o.s); f32(o.u); f32(o.scale); f32(o.rot); f32(o.hue); f32(o.radius); parts.push(o.type);
  const hz = new Float32Array(t.hazards.length * 9);
  t.hazards.forEach((h, i) => hz.set([h.kind, h.s, h.len, h.u0, h.u1, h.a, h.b, h.c, h.d], i * 9));
  f32(hz);
  f32(Float32Array.from([t.n, t.sOff, t.lapLen, t.raceLen, t.laps, ...t.checkpoints]));
  let h = 0x811c9dc5;
  for (const p of parts) h = hashBytes(p, h);
  return (h >>> 0).toString(16).padStart(8, '0');
}
