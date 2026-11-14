// Car physics in road coordinates: distance along the track, lateral offset, speed, gear, revs.
// No world heading, no spin-outs, no damage. Bends push the car outwards by curvature x speed^2.

import { Hazard } from '../track/generator';
import { Hz, O, Scn, Surf } from '../track/defs';
import { hazardActive, Track } from '../track/track';
import { CarSpec, torqueCurve } from './specs';

export const DT = 1 / 120;
const G = 9.81;
const CRR = 0.012;

export interface CarInput {
  steer: number; // -1..1 (+right)
  throttle: number; // 0..1
  brake: number; // 0..1
  shiftUp: boolean; // edge
  shiftDown: boolean; // edge
  digitalSteer: boolean;
}
export const NO_INPUT: CarInput = { steer: 0, throttle: 0, brake: 0, shiftUp: false, shiftDown: false, digitalSteer: true };

export const enum Spray { NONE = 0, DUST = 1, WATER = 2, SNOW = 3, MUD = 4, SAND = 5, SMOKE = 6, GRASS = 7 }

// event bits (cleared each tick)
export const EV_CRASH = 1, EV_SHUNT = 2, EV_POTHOLE = 4, EV_CONE = 8, EV_LASER = 16, EV_LAND = 32,
  EV_SHIFT = 64, EV_SPLASH = 128, EV_JUMP = 256, EV_SCRAPE = 512, EV_CHECKPOINT = 1024, EV_LAP = 2048, EV_FINISH = 4096,
  EV_LIMITER = 8192;

export interface SimEnv {
  time: number;
  scen: number;
  fuel: boolean;
  tank: number; // metres a full tank lasts at full throttle (Championship sizes it per race)
  hzBuf: Hazard[];
  objBuf: number[];
  knocked: Set<Hazard>;
  coneHits: { s: number; u: number; t: number }[];
}

export class Car {
  readonly spec: CarSpec;
  readonly index: number;
  name = '';
  color = 0;
  isPlayer = false;
  dist = 0;
  s = 0;
  x = 0;
  v = 0;
  vx = 0;
  gear = 1;
  rpm = 900;
  manual = false;
  steer = 0;
  throttle = 0;
  brake = 0;
  shiftTimer = 0;
  limiter = false;
  airborne = false;
  yW = 0;
  vy = 0;
  hAir = 0;
  fuel = 1;
  fuelUsed = 0;
  stun = 0;
  // derived
  latAccel = 0;
  longAccel = 0;
  slip = 0;
  spray: Spray = Spray.NONE;
  sprayAmt = 0;
  offroad = false;
  rumble = 0;
  wall = 0;
  load = 1;
  yawVis = 0;
  rollVis = 0;
  pitchVis = 0;
  wheelAngle = 0;
  steerVis = 0;
  bump = 0;
  events = 0;
  extLat = 0;
  grip = 1;
  private lastPothole: Hazard | null = null;
  private lastLaserS = -1e9;
  private prevGround = 0;
  private prevV = 0;
  private prevVx = 0;
  // race bookkeeping (managed by Race)
  finished = false;
  finishTime = 0;
  lap = 0;
  nextCp = 0;
  position = 0;
  pitting = false;
  // previous state for interpolation
  ps = 0; px = 0; pdist = 0; pyaw = 0; proll = 0; ppitch = 0; phAir = 0; psteer = 0; pwheel = 0;

  constructor(spec: CarSpec, index: number) {
    this.spec = spec;
    this.index = index;
    this.rpm = spec.idle;
  }

  savePrev(): void {
    this.ps = this.s; this.px = this.x; this.pdist = this.dist; this.pyaw = this.yawVis; this.proll = this.rollVis;
    this.ppitch = this.pitchVis; this.phAir = this.hAir; this.psteer = this.steerVis; this.pwheel = this.wheelAngle;
  }

  place(track: Track, dist: number, x: number): void {
    this.dist = dist;
    this.s = track.trackS(dist);
    this.x = x;
    this.v = 0;
    this.vx = 0;
    this.gear = 1;
    this.yW = track.y(this.s);
    this.prevGround = this.yW;
    this.airborne = false;
    this.hAir = 0;
    this.savePrev();
  }

  wheelRpm(): number {
    return ((this.v / this.spec.wheelR) * this.spec.gears[this.gear - 1] * 60) / (2 * Math.PI);
  }

  step(inp: CarInput, track: Track, env: SimEnv): void {
    const sp = this.spec;
    const dt = DT;
    this.events = 0;
    const s = this.s;
    const v = this.v;

    // ---------- inputs ----------
    if (inp.digitalSteer) {
      const target = inp.steer;
      const rate = (target === 0 || Math.sign(target) !== Math.sign(this.steer) ? 7.5 : sp.steerRate) * dt;
      this.steer += Math.max(-rate, Math.min(rate, target - this.steer));
    } else {
      this.steer += (inp.steer - this.steer) * Math.min(1, 16 * dt);
    }
    this.throttle = this.stun > 0 ? 0 : inp.throttle;
    this.brake = inp.brake;
    if (this.stun > 0) this.stun -= dt;
    const outOfFuel = env.fuel && this.fuel <= 0;
    if (outOfFuel) this.throttle = 0;

    // ---------- surface and hazards ----------
    const hwL = track.hwL(s), hwR = track.hwR(s);
    let grip = track.d.scen.grip;
    let respMul = track.d.scen.response;
    let drag = 0; // extra deceleration m/s^2
    let spray: Spray = Spray.NONE;
    let sprayAmt = 0;
    const scen = env.scen;
    if (scen === Scn.RALLY) { spray = Spray.DUST; sprayAmt = 0.5; }
    else if (scen === Scn.SNOW) { spray = Spray.SNOW; sprayAmt = 0.55; }
    else if (scen === Scn.STORM) { spray = Spray.WATER; sprayAmt = 0.6; }
    else if (scen === Scn.MARSH) { spray = Spray.WATER; sprayAmt = 0.2; }
    const edgeL = -hwL, edgeR = hwR;
    this.offroad = false;
    this.rumble = 0;
    if (this.x < edgeL - 0.25 || this.x > edgeR + 0.25) {
      const over = this.x < edgeL ? edgeL - this.x : this.x - edgeR;
      const f = Math.min(1, over / 1.2);
      this.offroad = f > 0.2;
      drag += (2.2 + 0.105 * v) * f * track.d.scen.offroadDrag;
      grip *= 1 - 0.3 * f;
      const sc = scen === Scn.DESERT ? Spray.SAND : scen === Scn.SNOW ? Spray.SNOW : scen === Scn.MARSH ? Spray.MUD : scen === Scn.FUTURE || scen === Scn.MOTORWAY || scen === Scn.ROADWORKS ? Spray.DUST : Spray.GRASS;
      spray = sc;
      sprayAmt = Math.max(sprayAmt, f);
      this.rumble = Math.max(this.rumble, 0.6 * f);
    } else {
      const dl = this.x - edgeL, dr = edgeR - this.x;
      if (Math.min(dl, dr) < 1.1) {
        const fl = track.flags(s);
        if (fl & 3) this.rumble = 1;
      }
    }
    // desert sand creeping in from the edges
    if (scen === Scn.DESERT) {
      const sw = track.sand(s);
      const dl = this.x - edgeL, dr = edgeR - this.x;
      const into = Math.max(sw - dl, sw - dr);
      if (into > 0) {
        const f = Math.min(1, into / 1.5);
        drag += 3.2 * f;
        grip *= 1 - 0.25 * f;
        spray = Spray.SAND;
        sprayAmt = Math.max(sprayAmt, f);
      }
    }
    // walls (mountains: rock wall / cliff rail; motorway: crash barriers)
    this.wall = 0;
    const walls = track.d.scen.walls;
    if (walls !== 'none') {
      const m = walls === 'mountain' ? 0.45 : 3.1;
      const wl = edgeL - m, wr = edgeR + m;
      if (this.x < wl + 0.95 || this.x > wr - 0.95) {
        const side = this.x < wl + 0.95 ? -1 : 1;
        const impact = Math.abs(this.vx);
        this.x = side < 0 ? wl + 0.95 : wr - 0.95;
        if (this.vx * side > 0) this.vx = -this.vx * 0.3;
        this.v *= 1 - Math.min(0.2, impact * 0.012);
        drag += 4;
        this.wall = side;
        this.events |= EV_SCRAPE;
      }
    }

    // on-road hazards under the car footprint
    if (!this.airborne || this.hAir < 0.4) {
      const hz = track.hazardsIn(s - 2.2, s + 2.2, env.hzBuf);
      for (let k = 0; k < hz.length; k++) {
        const h = hz[k];
        if (this.x + 0.9 < h.u0 || this.x - 0.9 > h.u1) continue;
        if (this.airborne && h.kind !== Hz.LASER) continue;
        switch (h.kind) {
          case Hz.PUDDLE: drag += 3 + v * 0.03; grip *= 0.72; spray = Spray.WATER; sprayAmt = 1; this.events |= EV_SPLASH; break;
          case Hz.STREAM: drag += 4 + v * 0.05; grip *= 0.7; spray = Spray.WATER; sprayAmt = 1; this.events |= EV_SPLASH; break;
          case Hz.FLOOD: drag += 4 + v * 0.085; grip *= 0.6; spray = Spray.WATER; sprayAmt = 1.4; this.events |= EV_SPLASH; break;
          case Hz.MUD: drag += 3 + v * 0.04; grip *= 0.55; respMul *= 0.7; spray = Spray.MUD; sprayAmt = 1; break;
          case Hz.OIL: grip *= 0.22; respMul *= 0.35; break;
          case Hz.ICE: grip *= 0.3; respMul *= 0.45; break;
          case Hz.SNOWBANK: drag += 4 + v * 0.06; grip *= 0.6; spray = Spray.SNOW; sprayAmt = 1.2; this.bump = Math.max(this.bump, 0.4); break;
          case Hz.DRIFT: drag += 3 + v * 0.06; grip *= 0.62; spray = Spray.SAND; sprayAmt = 1.2; this.bump = Math.max(this.bump, 0.5); break;
          case Hz.POTHOLE:
            if (this.lastPothole !== h) {
              this.lastPothole = h;
              this.v *= 0.95;
              this.bump = 1;
              this.events |= EV_POTHOLE;
            }
            break;
          case Hz.CONE: {
            // inside the closed lane: knock cones over
            const last = env.coneHits.length ? env.coneHits[env.coneHits.length - 1] : null;
            if (!last || Math.abs(last.s - s) > 3.5 || last.t < env.time - 2) {
              env.coneHits.push({ s, u: this.x, t: env.time });
              if (env.coneHits.length > 64) env.coneHits.shift();
              this.v *= 0.93;
              this.events |= EV_CONE;
            }
            break;
          }
          case Hz.BARRIER:
          case Hz.ROCK:
          case Hz.FALLEN_TREE: {
            // recover on the side with the open gap so the car is never trapped
            const gapL = h.u0 + hwL, gapR = hwR - h.u1;
            this.crash(gapL >= gapR ? Math.max(-hwL + 1, h.u0 - 1.7) : Math.min(hwR - 1, h.u1 + 1.7), track);
            break;
          }
          case Hz.LOG:
            if (!this.airborne && this.v > 8) {
              this.airborne = true;
              this.vy = 3.2 + this.v * 0.07;
              this.yW = track.y(s) + 0.05;
              this.events |= EV_JUMP;
            }
            break;
          case Hz.LASER:
            if (hazardActive(h, env.time) > 0 && Math.abs(this.lastLaserS - h.s) > 1) {
              this.lastLaserS = h.s;
              this.v *= 0.55;
              this.events |= EV_LASER;
            }
            break;
        }
      }
    }
    // laser/magnet/gust zones are checked over a wider window
    this.extLat = 0;
    if (scen === Scn.FUTURE || scen === Scn.WIND) {
      const hz = track.hazardsIn(s - 30, s + 30, env.hzBuf);
      for (const h of hz) {
        if (h.kind === Hz.MAGNET) {
          const ds = track.delta(h.s + h.len / 2, s);
          const fs = Math.max(0, 1 - Math.abs(ds) / (h.len / 2));
          const pole = h.a < 0 ? h.u0 : h.u1;
          const dx = pole - this.x;
          const fx = Math.max(0, 1 - Math.abs(dx) / 14);
          const pulse = 0.65 + 0.35 * Math.sin(env.time * 5 + h.c * 6.28);
          this.extLat += Math.sign(dx) * h.b * fs * fx * pulse;
        } else if (h.kind === Hz.GUST) {
          const ds = track.delta(h.s, s);
          if (ds >= 0 && ds <= h.len) {
            const edge = Math.min(1, ds / 30, (h.len - ds) / 30);
            this.extLat += h.a * h.b * hazardActive(h, env.time) * edge;
          }
        }
      }
    }

    // external shoves never exceed what full steering can counter (gusts/magnets are beatable)
    const extCap = sp.sMax * 0.62 * Math.min(1, grip + 0.1);
    if (this.extLat > extCap) this.extLat = extCap;
    else if (this.extLat < -extCap) this.extLat = -extCap;

    // ---------- vertical: crests make the car light, big crests launch it ----------
    const ground = track.y(s);
    const grade = track.grade(s);
    const vcurv = track.vcurv(s);
    if (!this.airborne) {
      const aReq = v * v * vcurv;
      this.load = Math.max(0.12, Math.min(1.35, 1 + aReq / G));
      if (aReq < -G * 1.02 && v > 20) {
        this.airborne = true;
        this.vy = v * grade;
        this.yW = ground;
        this.events |= EV_JUMP;
      } else {
        this.yW = ground;
        this.vy = v * grade;
      }
    }
    if (this.airborne) {
      this.vy -= G * dt;
      this.yW += this.vy * dt;
      this.load = 0;
      if (this.yW <= ground) {
        const impact = v * grade - this.vy;
        this.airborne = false;
        this.yW = ground;
        this.load = 1;
        if (impact > 3) {
          this.v *= 1 - Math.min(0.08, impact * 0.006);
          this.bump = Math.min(1, impact / 8);
          this.events |= EV_LAND;
        }
      }
    }
    this.hAir = this.airborne ? this.yW - ground : 0;
    this.prevGround = ground;

    // ---------- longitudinal ----------
    const nG = sp.gears.length;
    const auto = !this.manual;
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    let wheelRpm = this.wheelRpm();
    if (this.shiftTimer <= 0) {
      if (auto) {
        const n = wheelRpm / sp.redline;
        if (this.gear < nG && n > 0.93 && this.throttle > 0.1) this.shift(1, 0.22);
        else if (this.gear > 1) {
          const lower = (wheelRpm * sp.gears[this.gear - 2]) / sp.gears[this.gear - 1] / sp.redline;
          if (lower < (this.brake > 0.2 ? 0.86 : 0.78) && n < (this.brake > 0.2 ? 0.62 : 0.5)) this.shift(-1, 0.16);
        }
      } else {
        if (inp.shiftUp && this.gear < nG) this.shift(1, 0.12);
        else if (inp.shiftDown && this.gear > 1) this.shift(-1, 0.12);
      }
    }
    wheelRpm = this.wheelRpm();
    // clutch slip at launch
    const launch = sp.idle + this.throttle * (0.62 * sp.redline - sp.idle);
    let engRpm = Math.max(wheelRpm, sp.idle);
    if (this.gear === 1 && wheelRpm < launch) engRpm = Math.max(engRpm, launch);
    if (this.shiftTimer > 0) engRpm = Math.max(sp.idle, engRpm * 0.98);
    let drive = 0;
    const n = engRpm / sp.redline;
    this.limiter = false;
    if (n >= 1.0) {
      this.limiter = true;
      this.events |= EV_LIMITER;
    }
    const traction = sp.traction * G * sp.mass * Math.min(1, grip + 0.2) * (this.airborne ? 0 : Math.min(1.1, this.load));
    if (this.shiftTimer <= 0 && !this.limiter && !this.airborne) {
      const torque = torqueCurve(n) * sp.tMax * this.throttle;
      drive = (torque * sp.gears[this.gear - 1] * 0.9) / sp.wheelR;
      drive = Math.min(drive, traction);
    }
    // the rpm the tacho shows: smooth towards engine rpm (free-revving in the air)
    const targetRpm = this.airborne ? Math.min(sp.redline * 1.01, engRpm + this.throttle * 1800) : engRpm;
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * (this.shiftTimer > 0 ? 18 : 30));
    if (this.limiter) this.rpm = sp.redline * (0.985 + 0.015 * Math.sin(env.time * 90));

    let force = drive - sp.cd * v * v - CRR * sp.mass * G - sp.mass * G * grade * (this.airborne ? 0 : 1);
    // engine braking when lifting
    if (this.throttle < 0.05 && v > 1) force -= sp.mass * (0.5 + 1.1 * n);
    let acc = force / sp.mass - drag;
    if (this.brake > 0 && v > 0) {
      const b = this.brake * sp.brake * Math.min(1, grip + 0.25) * (this.airborne ? 0.05 : Math.min(1.1, this.load + 0.15));
      acc -= b;
    }
    // tyre scrub when steering hard
    acc -= Math.abs(this.steer) * 0.7 * Math.min(1, v / 40);
    this.v = Math.max(0, this.v + acc * dt);
    if (this.v < 0.05 && this.throttle < 0.05) this.v = 0;
    this.longAccel = (this.v - this.prevV) / dt;
    this.prevV = this.v;

    // ---------- lateral ----------
    const vv = this.v;
    const c = track.curv(s);
    const loadF = this.airborne ? 0.08 : Math.min(1.2, this.load);
    this.grip = grip;
    const sCap = sp.sMax * Math.min(1, Math.max(vv, 2.5) / 14) * Math.min(1.1, grip) * loadF * (this.brake > 0.5 ? 0.9 : 1);
    const push = sp.kPush * c * vv * vv * (this.airborne ? 0.2 : 1);
    const target = this.steer * sCap - push + this.extLat;
    const rate = sp.response * Math.min(1.1, grip) * respMul * (this.airborne ? 0.15 : 1);
    this.vx += (target - this.vx) * (1 - Math.exp(-rate * dt));
    this.x += this.vx * dt;
    this.latAccel = (this.vx - this.prevVx) / dt + c * vv * vv;
    this.prevVx = this.vx;
    // slip: how close we are to the grip limit
    const demand = Math.abs(push - this.extLat);
    const cap = sp.sMax * Math.min(1, vv / 14) * Math.min(1.1, grip);
    const nearLimit = Math.max(0, Math.min(1, (demand / Math.max(1, cap) - 0.55) * 1.6));
    this.slip = vv > 8 ? Math.min(1, nearLimit * Math.min(1, Math.abs(this.steer) + 0.3) + Math.min(1, Math.abs(this.vx - target) / 3) * 0.5) : 0;
    if (this.brake > 0.7 && vv > 15) this.slip = Math.max(this.slip, 0.5 * this.brake * (grip < 0.8 ? 1.2 : 0.7));
    if (spray === Spray.NONE && this.slip > 0.6) {
      spray = Spray.SMOKE;
      sprayAmt = (this.slip - 0.6) * 2;
    }
    this.spray = spray;
    this.sprayAmt = sprayAmt * Math.min(1, vv / 25);

    // ---------- advance ----------
    this.dist += this.v * dt;
    this.s = track.trackS(this.dist);

    // roadside objects
    if (!this.airborne || this.hAir < 1.2) {
      const objs = track.objectsIn(this.s - 4, this.s + 4, env.objBuf);
      const o = track.d.objects;
      for (let k = 0; k < objs.length; k++) {
        const i = objs[k];
        if (!env.fuel && o.type[i] === O.PITSIGN) continue; // no pit stops in this race: no pit signs either
        const r = o.radius[i];
        const du = this.x - o.u[i];
        if (Math.abs(du) > r + 0.9) continue;
        const ds = track.delta(o.s[i], this.s);
        if (Math.abs(ds) > r + 2.1) continue;
        const pushTo = o.u[i] + Math.sign(du || -o.u[i]) * (r + 1.0);
        // push towards the road
        const toward = o.u[i] > 0 ? o.u[i] - (r + 1.0) : o.u[i] + (r + 1.0);
        this.crash(Math.abs(pushTo) < Math.abs(toward) ? pushTo : toward, track);
        break;
      }
    }

    // fuel
    if (env.fuel && !outOfFuel) {
      const used = (this.v * dt * (0.3 + 0.7 * this.throttle)) / env.tank;
      this.fuel -= used;
      this.fuelUsed += used;
      if (this.fuel < 0) this.fuel = 0;
    }

    // ---------- visuals ----------
    const yawT = Math.atan2(this.vx - this.extLat * 0.3, Math.max(6, vv)) * 1.15 + this.steer * 0.06 * Math.min(1, vv / 20);
    this.yawVis += (yawT - this.yawVis) * Math.min(1, dt * 10);
    const rollT = Math.max(-0.09, Math.min(0.09, -this.latAccel * 0.0055 + this.vx * 0.002));
    this.rollVis += (rollT - this.rollVis) * Math.min(1, dt * 8);
    const pitchT = Math.max(-0.05, Math.min(0.05, this.longAccel * -0.0045));
    this.pitchVis += (pitchT - this.pitchVis) * Math.min(1, dt * 7);
    this.steerVis += (this.steer * 0.45 - this.steerVis) * Math.min(1, dt * 14);
    this.wheelAngle += (this.v / sp.wheelR) * dt;
    if (this.bump > 0) this.bump = Math.max(0, this.bump - dt * 3);
  }

  shift(dir: number, time: number): void {
    this.gear += dir;
    this.shiftTimer = time;
    this.events |= EV_SHIFT;
  }

  crash(safeX: number, _track: Track): void {
    void _track;
    this.events |= EV_CRASH;
    this.v = Math.min(this.v * 0.12, 3);
    this.vx = 0;
    this.x = safeX;
    this.stun = 0.7;
    this.bump = 1;
    if (!this.manual) this.gear = 1;
  }
}

export function surfaceOf(scen: number): Surf {
  return scen === Scn.RALLY ? Surf.DIRT : scen === Scn.SNOW ? Surf.SNOW : scen === Scn.FUTURE ? Surf.CITY : Surf.ASPHALT;
}
