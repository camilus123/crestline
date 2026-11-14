// Race manager: grid, countdown, rivals, collisions, checkpoints, timing, fuel, traffic, scoring.

import { Rng } from '../core/rng';
import { DELTA, Scn } from '../track/defs';
import { TrackData } from '../track/generator';
import { Track } from '../track/track';
import { AIDriver, scenarioRivalPace, SpeedPlan } from './ai';
import { Car, CarInput, DT, EV_CHECKPOINT, EV_CRASH, EV_FINISH, EV_LAP, EV_SHUNT, NO_INPUT, SimEnv } from './car';
import { CARS, CarSpec } from './specs';

export type Mode = 'arcade' | 'championship' | 'practice' | 'attract';

/**
 * Championship fuel: the tank is sized per race so that it cannot last the distance (one stop is needed)
 * but always reaches the best-placed pit strip, and the finish after a full refill, with a margin.
 */
/** pit strips as race-distance windows (circuits: one per lap after the first) */
export function pitWindows(t: TrackData): { a: number; b: number }[] {
  const wins: { a: number; b: number }[] = [];
  if (t.circuit) for (let k = 1; k < t.laps; k++) for (const p of t.pits) wins.push({ a: k * t.lapLen + p.s0, b: k * t.lapLen + p.s1 });
  else for (const p of t.pits) wins.push({ a: p.s0, b: p.s1 });
  return wins.sort((x, y) => x.a - y.a);
}

export function fuelPlan(t: TrackData): { tank: number; bestPit: number } {
  const R = t.raceLen;
  const wins = pitWindows(t);
  let best = Infinity, bestPit = 0;
  for (const w of wins) {
    const need = Math.max(w.b, R - w.a);
    if (need < best) { best = need; bestPit = (w.a + w.b) / 2; }
  }
  return { tank: Math.max(0.62 * R, best * 1.12), bestPit };
}

export interface PlayerCfg {
  name: string;
  car: number;
  manual: boolean;
  accelButton: boolean;
  color: number; // palette index
  bot?: boolean; // testing: AI drives this player
}

export interface RivalCfg {
  name: string;
  car: number;
  color: number;
  skill: number;
  aggression: number;
}

export interface RaceCfg {
  track: TrackData;
  mode: Mode;
  difficulty: number; // 0 easy, 1 medium, 2 hard
  players: PlayerCfg[];
  rivals: RivalCfg[];
  /** grid slot (0 = pole) for each player */
  playerSlots: number[];
  fuel: boolean;
  seed: number;
  timeFactor?: number;
}

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export interface TrafficCar {
  s: number; // track s
  dist: number; // continuous distance (decreasing)
  x: number;
  v: number; // m/s (moving towards decreasing s)
  kind: number; // 0 car, 1 van, 2 truck
  color: number;
  len: number;
  ps: number;
}

export interface RaceEvent {
  t: string;
  car: number;
  value?: number;
}

export class Race {
  cfg: RaceCfg;
  track: Track;
  cars: Car[] = [];
  players: Car[] = [];
  drivers: (AIDriver | null)[] = [];
  bots: (AIDriver | null)[] = [];
  env: SimEnv;
  time = 0; // race clock (starts at green light)
  clock = 0; // total sim time incl. countdown
  countdown = 4.0;
  started = false;
  over = false;
  overReason = '';
  events: RaceEvent[] = [];
  traffic: TrafficCar[] = [];
  rng: Rng;
  // arcade
  timeLeft: number[] = [];
  segTimes: number[] = [];
  score: number[] = [];
  bestPos: number[] = [];
  segIndex: number[] = [];
  refTime = 0;
  pitNeed = 0; // fuel fraction a bot wants before leaving the pits
  private trafficTimer = 0;
  private plans = new Map<number, SpeedPlan>();
  private rnd: () => number;

  constructor(cfg: RaceCfg) {
    // always 20 cars: rivals fill the places the players do not take
    if (cfg.players.length + cfg.rivals.length > 20 && cfg.players.length) cfg = { ...cfg, rivals: cfg.rivals.slice(0, 20 - cfg.players.length) };
    this.cfg = cfg;
    this.track = new Track(cfg.track);
    this.rng = new Rng(cfg.seed);
    this.rnd = () => this.rng.float();
    this.env = { time: 0, scen: cfg.track.params.scenario, fuel: cfg.fuel, tank: cfg.fuel ? fuelPlan(cfg.track).tank : 15000, hzBuf: [], objBuf: [], knocked: new Set(), coneHits: [] };
    const total = cfg.players.length + cfg.rivals.length;
    // grid slots
    const slotOf: number[] = new Array(total).fill(-1);
    cfg.players.forEach((_, i) => (slotOf[i] = cfg.playerSlots[i]));
    const used = new Set(cfg.playerSlots);
    let next = 0;
    for (let i = cfg.players.length; i < total; i++) {
      while (used.has(next)) next++;
      slotOf[i] = next++;
    }
    const tr = this.track;
    const hw = Math.min(tr.hwL(0), tr.hwR(-20));
    const motor = cfg.track.scen.walls === 'motorway';
    const gridPos = (slot: number) => {
      const row = Math.floor(slot / 2);
      const side = slot % 2 === 0 ? -1 : 1;
      let x = side * Math.min(2.6, hw * 0.45);
      if (motor) x = side < 0 ? 1.7 : hw - 1.7;
      return { dist: -(7 + row * 9 + (slot % 2) * 4.5), x };
    };
    for (let i = 0; i < total; i++) {
      const isP = i < cfg.players.length;
      const pc = isP ? cfg.players[i] : null;
      const rc = isP ? null : cfg.rivals[i - cfg.players.length];
      const spec = CARS[isP ? pc!.car : rc!.car];
      const car = new Car(spec, i);
      car.isPlayer = isP;
      car.name = isP ? pc!.name : rc!.name;
      car.color = isP ? pc!.color : rc!.color;
      car.manual = isP ? pc!.manual : false;
      const g = gridPos(slotOf[i]);
      car.place(tr, g.dist, g.x);
      this.cars.push(car);
      if (isP) {
        this.players.push(car);
        if (pc!.bot) {
          const bot = new AIDriver(car, this.planFor(spec, cfg.track.scen.grip < 0.8 ? 0.93 : 0.97), { skill: 1, aggression: 0, laneBias: 0, consistency: 1 });
          bot.isBot = true;
          this.bots.push(bot);
        } else this.bots.push(null);
        this.drivers.push(null);
      } else {
        const prof = {
          // in arcade the clock is the opponent: rivals are traffic to pass, a touch slower
          skill: rc!.skill * scenarioRivalPace(cfg.track.params.scenario) * (cfg.mode === 'arcade' ? 0.95 : 1),
          aggression: rc!.aggression,
          laneBias: (this.rnd() - 0.5) * 2.2,
          consistency: 0.55 + 0.45 * rc!.skill,
        };
        this.drivers.push(new AIDriver(car, this.planFor(spec, 0.94), prof));
      }
    }
    // arcade time limits per segment (stage between checkpoints / lap)
    const tf = cfg.timeFactor ?? [1.32, 1.21, 1.12][cfg.difficulty] ?? 1.2;
    const ref = this.referenceTimes(CARS[cfg.players[0]?.car ?? 0]);
    this.refTime = ref.reduce((a, b) => a + b, 0);
    // first segment: allowance for passing the cars starting ahead (more on narrow roads)
    const ahead = Math.max(0, ...cfg.playerSlots.map((x) => x));
    const narrow = Math.max(0, 5.2 - hw) * 0.35 + (cfg.track.scen.grip < 0.85 ? 0.2 : 0);
    const trafficAllow = ahead * (0.35 + narrow) * (cfg.mode === 'arcade' ? 1 : 0);
    this.segTimes = ref.map((t, i) => Math.ceil(t * tf + (i === 0 ? 4 + trafficAllow : 0)));
    for (let p = 0; p < this.players.length; p++) {
      this.timeLeft.push(this.segTimes[0]);
      this.score.push(0);
      this.bestPos.push(99);
      this.segIndex.push(0);
    }
    // fuel races: rivals refuel in the pits like the players do (see AIDriver pit stop); the stops reshuffle a
    // field you start at the back of, so rivals give up 1 % pace to keep the top ten within reach on Hard
    if (cfg.fuel) for (const d of this.drivers) if (d) d.prof.skill *= 0.99;
    this.pitNeed = cfg.fuel ? 1 : 0;
  }

  private planFor(spec: CarSpec, margin: number): SpeedPlan {
    const key = spec.id * 1000 + Math.round(margin * 100);
    let p = this.plans.get(key);
    if (!p) {
      p = new SpeedPlan(this.track, spec, margin);
      this.plans.set(key, p);
    }
    return p;
  }

  /** time a near-perfect driver needs for each checkpoint segment */
  referenceTimes(spec: CarSpec): number[] {
    const plan = this.planFor(spec, 0.97);
    const tr = this.track;
    const d = tr.d;
    const out: number[] = [];
    let v = 0;
    let t = 0;
    let prev = 0;
    for (const cp of d.checkpoints) {
      for (let dist = prev; dist < cp; dist += DELTA) {
        const s = tr.trackS(dist);
        const vp = plan.at(tr, plan.v, s);
        // forward acceleration limit from engine power
        const a = Math.min(spec.traction * 9.81 * Math.min(1, d.scen.grip + 0.2), (spec.power * 0.9) / (spec.mass * Math.max(5, v))) - (spec.cd * v * v) / spec.mass - 9.81 * tr.grade(s) - 0.12;
        const vNext = Math.min(vp, Math.sqrt(Math.max(1, v * v + 2 * Math.max(0.2, a) * DELTA)));
        t += DELTA / Math.max(3, (v + vNext) / 2);
        v = vNext;
      }
      // allowance for hazards that cost time even when driven well
      for (const h of d.hazards) {
        const hd = d.circuit ? h.s : h.s;
        const inSeg = d.circuit ? true : hd >= prev && hd < cp;
        if (!inSeg) continue;
        const k = h.kind;
        const per = 1; // circuits: every lap meets every hazard
        if (k === 11) t += 1.1 * per; // laser
        else if (k === 12) t += 0.35 * per; // magnet
        else if (k === 13) t += 0.4 * per; // gust
        else if (k === 6) t += 0.5 * per; // cone closure
        else if (k === 9 || k === 7 || k === 8) t += 0.35 * per;
      }
      out.push(t);
      t = 0;
      prev = cp;
    }
    return out;
  }

  get scen(): number {
    return this.cfg.track.params.scenario;
  }

  step(inputs: CarInput[]): void {
    this.events.length = 0;
    this.clock += DT;
    const tr = this.track;
    for (const c of this.cars) c.savePrev();
    for (const t of this.traffic) t.ps = t.s;
    if (!this.started) {
      this.countdown -= DT;
      const prevBeep = Math.ceil(this.countdown + DT);
      const nowBeep = Math.ceil(this.countdown);
      if (nowBeep !== prevBeep && nowBeep <= 3 && nowBeep >= 1) this.events.push({ t: 'beep', car: -1, value: nowBeep });
      if (this.countdown <= 0) {
        this.started = true;
        this.events.push({ t: 'go', car: -1 });
      }
      for (const e of this.events) this.eventLog.push(e);
      // revving on the grid
      for (let i = 0; i < this.players.length; i++) {
        const c = this.players[i];
        const inp = this.bots[i] ? { ...NO_INPUT, throttle: 0.3 } : inputs[i] || NO_INPUT;
        c.rpm += ((c.spec.idle + inp.throttle * (c.spec.redline * 0.8 - c.spec.idle)) - c.rpm) * 0.1;
      }
      return;
    }
    this.time += DT;
    this.env.time = this.time;
    // traffic
    if (tr.d.scen.walls === 'motorway') this.stepTraffic();
    // drive
    const trafficPos = this.traffic;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      let inp: CarInput;
      if (car.isPlayer) {
        const bot = this.bots[i];
        if (car.finished && !bot) {
          inp = { ...NO_INPUT, throttle: 0.2, brake: 0.3 };
        } else if (bot) {
          const need = this.cfg.fuel ? this.pitAdvice(car) : 0;
          inp = bot.drive(tr, this.cars, this.time, [], trafficPos, need, this.rnd);
        } else inp = inputs[i] || NO_INPUT;
        if (this.over) inp = { ...NO_INPUT, brake: 0.5 };
      } else {
        const d = this.drivers[i]!;
        // subtle rubber band: rivals far ahead of the lead player ease off a touch, far behind push a touch
        const lead = this.leadPlayer();
        if (lead) {
          const gap = car.dist - lead.dist;
          d.pace = 1 - Math.max(-0.025, Math.min(0.025, gap / 12000));
        }
        inp = d.drive(tr, this.cars, this.time, this.players, trafficPos, this.cfg.fuel ? this.pitAdvice(car) : 0, this.rnd);
        if (car.finished) inp = { ...inp, throttle: Math.min(inp.throttle, 0.4) };
      }
      car.step(inp, tr, this.env);
    }
    this.collide();
    this.trafficCollide();
    this.bookkeeping();
    for (const c of this.cars) {
      (c as any).fxEv = ((c as any).fxEv | 0) | c.events;
      (c as any).sndEv = ((c as any).sndEv | 0) | c.events;
    }
    for (const e of this.events) this.eventLog.push(e);
  }
  /** events since the last call (for HUD and audio) */
  takeEvents(): RaceEvent[] {
    const e = this.eventLog;
    this.eventLog = [];
    return e;
  }
  eventLog: RaceEvent[] = [];

  private wins: { a: number; b: number }[] | null = null;
  /**
   * Pit strategy for a computer-driven car: the fuel level to fill to at the coming pit strip, or 0 to drive by.
   * Stop where one fill gets you to the finish; pass a strip if the next one is still within reach.
   */
  pitAdvice(car: Car): number {
    const need = this.fuelNeeded(car);
    if (car.fuel + 0.02 >= need) return 0;
    if (need <= 0.97) return need;
    const wins = (this.wins ??= pitWindows(this.cfg.track));
    const rate = car.dist > 2000 ? car.fuelUsed / car.dist : 1 / this.env.tank;
    let k = wins.findIndex((w) => w.b > car.dist);
    if (k >= 0 && wins[k].a <= car.dist + 300) k++; // the strip coming up now; can we reach the one after?
    const next = k >= 0 ? wins[k] : undefined;
    if (next && car.fuel > (next.a + 150 - car.dist) * rate * 1.1 + 0.05) return 0;
    return 1;
  }

  fuelNeeded(car: Car): number {
    // fuel fraction needed to reach the finish, plus margin
    const remain = this.cfg.track.raceLen - car.dist;
    // use the consumption actually observed so far (falls back to full-throttle burn early on)
    const rate = car.dist > 2000 ? car.fuelUsed / car.dist : 1 / this.env.tank;
    return Math.min(1, remain * rate * 1.06 + 0.04);
  }

  leadPlayer(): Car | null {
    let best: Car | null = null;
    for (const p of this.players) if (!best || p.dist > best.dist) best = p;
    return best;
  }

  private collide(): void {
    const cars = this.cars;
    const tr = this.track;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        const ds = b.dist - a.dist;
        if (Math.abs(ds) > 4.6) continue;
        if (a.hAir > 0.7 || b.hAir > 0.7) continue;
        const dx = b.x - a.x;
        if (Math.abs(dx) > 1.95) continue;
        const front = ds >= 0 ? b : a;
        const rear = ds >= 0 ? a : b;
        const overlapS = 4.5 - Math.abs(ds);
        const overlapX = 1.95 - Math.abs(dx);
        if (overlapS < overlapX * 1.6) {
          // nose-to-tail shunt
          if (rear.v > front.v) {
            const rel = rear.v - front.v;
            front.v += rel * 0.45;
            rear.v = Math.max(0, front.v - rel * 0.25 - 1.5);
            rear.events |= EV_SHUNT;
            front.events |= EV_SHUNT;
            if (rear.isPlayer || front.isPlayer) this.events.push({ t: 'shunt', car: rear.index, value: rel });
          }
          rear.dist = front.dist - 4.55;
          rear.s = tr.trackS(rear.dist);
        } else {
          // side swipe
          const sgn = dx >= 0 ? 1 : -1;
          a.x -= sgn * overlapX * 0.5;
          b.x += sgn * overlapX * 0.5;
          const rv = b.vx - a.vx;
          if (rv * sgn < 0) {
            a.vx += rv * 0.6 - sgn * 1.2;
            b.vx -= rv * 0.6 - sgn * 1.2;
          }
          a.v *= 0.997;
          b.v *= 0.997;
          a.events |= EV_SHUNT;
          b.events |= EV_SHUNT;
        }
      }
    }
  }

  private stepTraffic(): void {
    const tr = this.track;
    const lead = this.leadPlayer();
    if (!lead) return;
    // despawn passed traffic
    this.traffic = this.traffic.filter((t) => {
      let behind = true;
      for (const p of this.players) if (t.dist > p.dist - 120) behind = false;
      return !behind;
    });
    this.trafficTimer -= DT;
    const hard = this.cfg.difficulty;
    if (this.trafficTimer <= 0 && this.traffic.length < 10) {
      this.trafficTimer = (2.2 - hard * 0.4) * (0.5 + this.rnd());
      const dist = lead.dist + 900 + this.rnd() * 300;
      if (!this.cfg.track.circuit && dist > this.cfg.track.raceLen + 1500) return;
      const s = tr.trackS(dist);
      const hwL = tr.hwL(s);
      const lane = this.rnd() < 0.5 ? -hwL * 0.27 : -hwL * 0.73;
      const kind = this.rnd() < 0.2 ? 2 : this.rnd() < 0.3 ? 1 : 0;
      this.traffic.push({ s, dist, x: lane, v: (kind === 2 ? 22 : 27) + this.rnd() * 7, kind, color: Math.floor(this.rnd() * 12), len: kind === 2 ? 12 : kind === 1 ? 5.5 : 4.4, ps: s });
    }
    for (const t of this.traffic) {
      t.dist -= t.v * DT;
      t.s = tr.trackS(t.dist);
      t.x = Math.min(-1.0, Math.max(-tr.hwL(t.s) + 1.2, t.x));
    }
  }

  private trafficCollide(): void {
    for (const t of this.traffic) {
      for (const c of this.cars) {
        const ds = c.dist - t.dist;
        if (Math.abs(ds) > (t.len + 4.4) / 2) continue;
        if (Math.abs(c.x - t.x) > (t.kind === 2 ? 2.4 : 1.95)) continue;
        if (c.hAir > 1.2) continue;
        // head-on: hard stop, pushed back to our side
        c.crash(Math.max(c.x, t.x + 2.3), this.track);
        c.v = 0;
        c.stun = 1.1;
        c.events |= EV_CRASH;
        (t as any).dead = true;
        if (c.isPlayer) this.events.push({ t: 'headon', car: c.index });
        break;
      }
    }
    if (this.traffic.some((t) => (t as any).dead)) this.traffic = this.traffic.filter((t) => !(t as any).dead);
  }

  private bookkeeping(): void {
    const d = this.cfg.track;
    const tr = this.track;
    // checkpoints / laps / finish
    for (const c of this.cars) {
      if (c.events & EV_CRASH && c.isPlayer) this.events.push({ t: 'crash', car: c.index });
      while (!c.finished && c.nextCp < d.checkpoints.length && c.dist >= d.checkpoints[c.nextCp]) {
        const isFinish = c.nextCp === d.checkpoints.length - 1;
        c.nextCp++;
        if (d.circuit) c.lap = c.nextCp;
        if (isFinish) {
          c.finished = true;
          // interpolate exact finish time
          const over = (c.dist - d.raceLen) / Math.max(1, c.v);
          c.finishTime = this.time - over;
          c.events |= EV_FINISH;
          if (c.isPlayer) this.events.push({ t: 'finish', car: c.index });
        } else {
          c.events |= d.circuit ? EV_LAP : EV_CHECKPOINT;
          if (c.isPlayer) {
            const pi = this.players.indexOf(c);
            if (this.cfg.mode === 'arcade') {
              this.segIndex[pi] = c.nextCp;
              const add = this.segTimes[c.nextCp] ?? 30;
              this.timeLeft[pi] += add;
              this.score[pi] += 1000;
              this.events.push({ t: 'extend', car: c.index, value: add });
            }
            this.events.push({ t: d.circuit ? 'lap' : 'checkpoint', car: c.index, value: c.nextCp });
            if (d.circuit && c.nextCp === d.laps - 1) this.events.push({ t: 'finallap', car: c.index });
          }
        }
      }
      // refuelling: stopped on the pit strip
      c.pitting = false;
      if (this.cfg.fuel && tr.isPit(c.s) && c.x > tr.hwL(c.s) + 0.6 && c.v < 0.7 && c.fuel < 1) {
        c.fuel = Math.min(1, c.fuel + DT * 0.14);
        c.pitting = true;
      }
    }
    // positions
    const order = this.cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
    order.forEach((c, i) => (c.position = i + 1));
    // arcade timer and score
    if (this.cfg.mode === 'arcade' && !this.over) {
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.finished) continue;
        this.timeLeft[i] -= DT;
        this.score[i] += p.v * DT;
        if (p.position < this.bestPos[i]) {
          if (this.bestPos[i] !== 99) this.score[i] += 250 * (this.bestPos[i] - p.position);
          this.bestPos[i] = p.position;
        }
        if (this.timeLeft[i] <= 0) {
          this.timeLeft[i] = 0;
          this.events.push({ t: 'timeout', car: p.index });
        }
      }
      const allOut = this.players.length > 0 && this.players.every((p, i) => p.finished || this.timeLeft[i] <= 0);
      if (allOut) {
        this.over = true;
        this.overReason = this.players.some((p) => p.finished) ? 'finished' : 'timeout';
        for (let i = 0; i < this.players.length; i++) {
          const p = this.players[i];
          if (p.finished) this.score[i] += Math.round(this.timeLeft[i] * 100) + Math.max(0, 21 - p.position) * 400;
        }
      }
    } else if (!this.over) {
      if (this.players.length && this.players.every((p) => p.finished)) {
        this.over = true;
        this.overReason = 'finished';
      }
    }
  }

  /** final classification, projecting unfinished cars from their pace */
  classification(): { car: Car; time: number; projected: boolean }[] {
    const d = this.cfg.track;
    const res = this.cars.map((c) => {
      if (c.finished) return { car: c, time: c.finishTime, projected: false };
      const avg = Math.max(10, c.dist / Math.max(1, this.time));
      return { car: c, time: this.time + Math.max(0, d.raceLen - c.dist) / avg, projected: true };
    });
    res.sort((a, b) => a.time - b.time);
    return res;
  }
}

export function difficultyName(d: number): string {
  return ['Easy', 'Medium', 'Hard'][d] ?? 'Custom';
}

export { Scn };
