// Rival / bot driver. Produces the same CarInput a human would, so rivals obey the same physics.

import { DELTA, Hz, SCENARIOS } from '../track/defs';
import { Hazard } from '../track/generator';
import { gustWarning, hazardActive, Track } from '../track/track';
import { Car, CarInput } from './car';
import { CarSpec } from './specs';

const G = 9.81;

/** Per-track, per-car speed plan: the fastest sensible speed at every sample. */
export class SpeedPlan {
  readonly v: Float32Array;
  readonly line: Float32Array;
  constructor(track: Track, spec: CarSpec, margin: number) {
    const d = track.d;
    const n = d.n;
    const vLim = new Float32Array(n);
    const scenGrip = d.scen.grip;
    const gEff = spec.grip * scenGrip * margin;
    const look = Math.round(14 / DELTA);
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let k = -2; k <= look; k++) {
        const j = d.circuit ? (i + k + n) % n : Math.max(0, Math.min(n - 1, i + k));
        c = Math.max(c, Math.abs(d.curv[j]));
      }
      let v = Math.sqrt(gEff / Math.max(c, 1e-6));
      // avoid launching off big crests at full speed
      const j0 = i, j1 = d.circuit ? (i + 2) % n : Math.min(n - 1, i + 2);
      const vc = (d.grade[j1] - d.grade[j0]) / (2 * DELTA);
      if (vc < -1e-4) v = Math.min(v, Math.sqrt((G * 1.6) / -vc));
      vLim[i] = Math.min(v, spec.vTop * 1.02);
    }
    // hazards that need lifting
    for (const h of d.hazards) {
      let cap = 0;
      if (h.kind === Hz.FLOOD) cap = 24;
      else if (h.kind === Hz.STREAM) cap = 34;
      if (!cap) continue;
      const i0 = Math.round((h.s + d.sOff) / DELTA), i1 = Math.round((h.s + h.len + d.sOff) / DELTA);
      for (let i = i0; i <= i1; i++) {
        const j = d.circuit ? ((i % n) + n) % n : i;
        if (j >= 0 && j < n) vLim[j] = Math.min(vLim[j], cap);
      }
    }
    // braking pass (backwards), twice round for circuits
    const b = spec.brake * 0.72 * Math.min(1, scenGrip + 0.15);
    const v = Float32Array.from(vLim);
    const passes = d.circuit ? 2 : 1;
    for (let p = 0; p < passes; p++) {
      for (let i = n - 1; i >= 0; i--) {
        const next = d.circuit ? v[(i + 1) % n] : i + 1 < n ? v[i + 1] : v[i];
        const lim = Math.sqrt(next * next + 2 * b * DELTA);
        if (v[i] > lim) v[i] = lim;
      }
    }
    this.v = v;
    // racing line: drift to the inside ahead of the apex
    const line = new Float32Array(n);
    const ahead = Math.round(26 / DELTA);
    for (let i = 0; i < n; i++) {
      const j = d.circuit ? (i + ahead) % n : Math.min(n - 1, i + ahead);
      const c = d.curv[j];
      const hw = Math.min(d.hwL[i], d.hwR[i]);
      line[i] = Math.sign(c) * Math.min(1, Math.abs(c) * 260) * Math.max(0, hw - 1.7);
    }
    // smooth
    const sm = new Float32Array(n);
    const r = 10;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) {
        const j = d.circuit ? (i + k + n) % n : Math.max(0, Math.min(n - 1, i + k));
        s += line[j];
      }
      sm[i] = s / (2 * r + 1);
    }
    this.line = sm;
  }
  at(track: Track, arr: Float32Array, s: number): number {
    const f = track.fi(s);
    const i = Math.floor(f);
    const j = track.circuit ? (i + 1) % track.n : Math.min(i + 1, track.n - 1);
    return arr[i] + (arr[j] - arr[i]) * (f - i);
  }
}

export interface AIProfile {
  skill: number; // multiplies planned speed
  aggression: number; // 0..1 blocking tendency
  laneBias: number; // personal lateral preference (m)
  consistency: number; // 0..1, lower = more wobble
}

const AVOID = new Set<number>([Hz.OIL, Hz.MUD, Hz.PUDDLE, Hz.BARRIER, Hz.ROCK, Hz.FALLEN_TREE, Hz.CONE, Hz.ICE, Hz.DRIFT, Hz.SNOWBANK, Hz.POTHOLE]);
const MUST_AVOID = new Set<number>([Hz.BARRIER, Hz.ROCK, Hz.FALLEN_TREE, Hz.CONE]);

export class AIDriver {
  car: Car;
  plan: SpeedPlan;
  prof: AIProfile;
  pace = 1; // external multiplier (rubber band, scenario)
  isBot = false; // drives a player car (testing)
  pitTarget = 0; // bot: fuel level to fill to (0 = not pitting)
  private wobble = 0;
  private wobT = 0;
  private hz: Hazard[] = [];
  private blockX = 0;
  out: CarInput = { steer: 0, throttle: 0, brake: 0, shiftUp: false, shiftDown: false, digitalSteer: false };
  constructor(car: Car, plan: SpeedPlan, prof: AIProfile) {
    this.car = car;
    this.plan = plan;
    this.prof = prof;
  }

  drive(track: Track, cars: Car[], time: number, players: Car[], traffic: { s: number; x: number }[], pitNeed: number, rnd: () => number): CarInput {
    const car = this.car;
    const sp = car.spec;
    const s = car.s;
    const v = car.v;
    const d = track.d;
    const hwL = track.hwL(s), hwR = track.hwR(s);
    const motor = d.scen.walls === 'motorway';
    // ---- target speed ----
    const look = s + v * 0.12 + 2;
    let vT = this.plan.at(track, this.plan.v, look) * this.prof.skill * this.pace;
    // ---- target line ----
    let xT = this.plan.at(track, this.plan.line, s + v * 0.35) + this.prof.laneBias;
    if (motor) xT = Math.max(1.4, Math.min(hwR - 1.4, xT * 0.5 + hwR * 0.5 + this.prof.laneBias * 0.5));
    // wobble (less consistent drivers)
    this.wobT -= 1 / 120;
    if (this.wobT <= 0) {
      this.wobT = 1.5 + rnd() * 3;
      this.wobble = (rnd() - 0.5) * 2 * (1 - this.prof.consistency) * 1.5;
    }
    xT += this.wobble;

    // ---- pit stop (bots only; rivals never pit) ----
    let pitting = false;
    if (this.isBot && pitNeed > 0) {
      // decide once per pit strip: stop only if the tank cannot reach the finish
      if (this.pitTarget === 0 && car.fuel + 0.02 < pitNeed && car.fuel < 0.85) this.pitTarget = Math.min(1, pitNeed + 0.03);
      if (this.pitTarget > 0) {
        const base = hwL;
        for (const pz of d.pits) {
          const ds = track.delta(s, pz.s0);
          const de = track.delta(s, pz.s1);
          if ((ds > -10 && ds < 260) || (ds <= 0 && de > 0)) {
            pitting = true;
            xT = base + 3.2;
            const stopAt = (pz.s0 + pz.s1) / 2;
            const dd = track.delta(s, stopAt);
            const vStop = dd > 0 ? Math.sqrt(2 * 6 * Math.max(0, dd - 2)) : 0;
            vT = Math.min(vT, vStop, dd < 60 ? 14 : 99);
            if (Math.abs(dd) < 25 && v < 0.5) vT = 0;
            if (car.fuel >= this.pitTarget) {
              this.pitTarget = 0;
              pitting = false;
            }
          }
        }
      }
    }

    // ---- blocking players (aggression) ----
    if (!this.isBot && this.prof.aggression > 0) {
      for (const p of players) {
        const ds = track.delta(p.s, s); // >0: we are ahead of the player
        if (ds > 2 && ds < 22 && p.v > v - 2) {
          this.blockX += (p.x - this.blockX) * 0.02;
          const want = xT + (this.blockX - xT) * this.prof.aggression * 0.6;
          xT = Math.max(xT - 1.6, Math.min(xT + 1.6, want));
        }
      }
    }
    // ---- yielding: less aggressive drivers let faster cars through ----
    if (!this.isBot) {
      const yieldy = 1 - this.prof.aggression;
      for (const o of cars) {
        if (o === car) continue;
        const ds = track.delta(s, o.s);
        if (ds < -16 || ds > -3) continue;
        if (o.v < v - 0.5 || Math.abs(o.x - car.x) > 2.6) continue;
        const away = o.x > car.x ? -hwL + 1.1 : hwR - 1.1;
        if (o.isPlayer && this.prof.aggression > 0.45) continue;
        xT += (away - xT) * yieldy * 0.75;
        break;
      }
    }
    // ---- lane choice: score candidate lateral positions against cars and hazards ahead ----
    const ahead = Math.max(30, v * 1.4);
    const hz = track.hazardsIn(s, s + ahead, this.hz);
    const lo = -hwL + 1.0, hi = hwR - 1.0;
    const trafficClose = motor && trafficNear(track, s, traffic, 200);
    let bestX = xT, bestCost = Infinity, bestBlock: Car | null = null;
    const N = 22;
    for (let k = 0; k <= N + 1; k++) {
      const x = k === N + 1 ? xT : lo + ((hi - lo) * k) / N;
      let cost = Math.abs(x - xT) * 0.4 + Math.abs(x - car.x) * 0.12;
      let block: Car | null = null;
      for (const h of hz) {
        if (!AVOID.has(h.kind)) continue;
        const must = MUST_AVOID.has(h.kind);
        const pad = must ? 1.35 : 1.1;
        if (x > h.u0 - pad && x < h.u1 + pad) {
          const ds = track.delta(s, h.s);
          cost += must ? 400 : h.kind === Hz.OIL || h.kind === Hz.ICE ? 9 : 4 * (1 - Math.max(0, ds) / ahead);
        }
      }
      for (const o of cars) {
        if (o === car) continue;
        const ds = track.delta(s, o.s);
        if (ds < -5 || ds > 48) continue;
        if (Math.abs(x - o.x) > 2.3) continue;
        if (ds < 4.6) cost += 40; // alongside
        else {
          const closing = v - o.v;
          cost += (closing > -1 ? 7 + closing * 0.8 : 1.5) * (1 - ds / 48);
          if (!block || ds < track.delta(s, block.s)) block = o;
        }
      }
      if (motor && x < 0.8) cost += trafficClose ? 300 : 2.5;
      if (cost < bestCost) {
        bestCost = cost;
        bestX = x;
        bestBlock = block;
      }
    }
    xT = bestX;
    if (bestBlock) {
      const ds = track.delta(s, bestBlock.s);
      if (ds < 14 && Math.abs(bestBlock.x - car.x) < 2.1) vT = Math.min(vT, bestBlock.v + (ds - 7) * 0.6);
    }
    // gusts: lift a little while a gust is blowing or about to
    for (const h of hz) {
      if (h.kind !== Hz.GUST) continue;
      const ds = track.delta(s, h.s);
      if (ds < 120 && ds > -h.len && (hazardActive(h, time) > 0 || gustWarning(h, time) > 0.5)) vT *= 0.9;
    }
    // laser gates: time the arrival for the off phase by lifting a little
    for (const h of hz) {
      if (h.kind !== Hz.LASER) continue;
      const ds = track.delta(s, h.s);
      if (ds < 3 || ds > 140) continue;
      const tArr = ds / Math.max(5, v);
      if (hazardActive(h, time + tArr) > 0 || hazardActive(h, time + tArr + 0.05) > 0) {
        for (const f of this.isBot ? [0.9, 0.82, 0.74, 0.66] : [0.92, 0.85]) {
          const t2 = ds / Math.max(5, v * f);
          if (hazardActive(h, time + t2) === 0 && hazardActive(h, time + t2 + 0.06) === 0 && hazardActive(h, time + t2 - 0.06) === 0) {
            vT = Math.min(vT, v * f);
            break;
          }
        }
      }
    }
    xT = Math.max(-hwL + 1.0, Math.min(hwR - 1.0, xT));
    if (motor && !pitting && trafficClose) xT = Math.max(xT, 0.8);

    // ---- convert to inputs ----
    const c = track.curv(s);
    const push = sp.kPush * c * v * v;
    const sCap = Math.max(0.5, sp.sMax * Math.min(1, Math.max(v, 2.5) / 14) * Math.min(1.1, car.grip) * Math.min(1.2, Math.max(0.1, car.load)));
    const desired = Math.max(-sCap * 0.9, Math.min(sCap * 0.9, (xT - car.x) * 1.7 - car.vx * 0.25));
    let steer = (desired + push - car.extLat) / sCap;
    steer = Math.max(-1, Math.min(1, steer));
    const o = this.out;
    o.steer = steer;
    const err = vT - v;
    if (err > 0.5) { o.throttle = 1; o.brake = 0; }
    else if (err < -1.5) { o.throttle = 0; o.brake = Math.min(1, -err / 6); }
    else { o.throttle = 0.45; o.brake = 0; }
    if (pitting && vT === 0) { o.throttle = 0; o.brake = 1; }
    o.shiftUp = o.shiftDown = false;
    // manual-gear bots shift near the redline
    if (car.manual) {
      const n = car.rpm / sp.redline;
      if (n > 0.975 && car.gear < sp.gears.length && car.shiftTimer <= 0) o.shiftUp = true;
      else if (car.gear > 1 && car.shiftTimer <= 0) {
        const lower = (car.wheelRpm() * sp.gears[car.gear - 2]) / sp.gears[car.gear - 1] / sp.redline;
        if (lower < 0.9 && n < 0.55) o.shiftDown = true;
      }
    }
    return o;
  }
}

function trafficNear(track: Track, s: number, traffic: { s: number; x: number }[], dist: number): boolean {
  for (const t of traffic) {
    const ds = track.delta(s, t.s);
    if (ds > -5 && ds < dist) return true;
  }
  return false;
}

export function scenarioRivalPace(scen: number): number {
  return SCENARIOS[scen]?.rivalPace ?? 1;
}
