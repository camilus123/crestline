// "Human-ish" keyboard driver: digital steering/throttle/brake with reaction delay.
// Checks the car is controllable with on/off inputs (handling precision).
import { generateTrack } from '../src/track/generator';
import { Race } from '../src/sim/race';
import { makeRivals } from '../src/sim/roster';
import { CarInput, NO_INPUT } from '../src/sim/car';
import { AIDriver } from '../src/sim/ai';
import { COURSES } from '../src/track/courses';

const codes = [COURSES.arcade.easy[0], COURSES.arcade.medium[3], COURSES.arcade.hard[2], COURSES.arcade.medium[8], COURSES.championship.hard[1], COURSES.arcade.hard[10]];
for (const car of [0, 1, 2]) for (const code of codes) {
  const track = generateTrack(code);
  const mk = (bot: boolean) => new Race({ track, mode: 'arcade', difficulty: 1, players: [{ name: 'P', car, manual: false, accelButton: false, color: 0, bot }], rivals: makeRivals(1, 1).slice(0, 0), playerSlots: [0], fuel: false, seed: 1 });
  // analog reference
  const ra = mk(true);
  while (!ra.over && ra.clock < 900) ra.step([NO_INPUT]);
  // keyboard driver
  const r = mk(false);
  const p = r.players[0];
  const ai = new AIDriver(p, (ra as any).planFor(p.spec, 0.9), { skill: 0.97, aggression: 0, laneBias: 0, consistency: 1 });
  ai.isBot = true;
  const delay: CarInput[] = [];
  let st = 0, crashes = 0, off = 0, acc = 0, tick = 0;
  while (!r.over && r.clock < 900) {
    const a = ai.drive(r.track, r.cars, r.time, [], [], 0, Math.random);
    // a player tapping keys ~8 times a second: pulse-density modulation of the wanted steering
    tick++;
    if (tick % 15 === 0) { acc += a.steer; st = Math.max(-1, Math.min(1, Math.round(acc))); acc -= st; }
    delay.push({ steer: st, throttle: a.throttle > 0.5 ? 1 : 0, brake: a.brake > 0.3 ? 1 : 0, shiftUp: false, shiftDown: false, digitalSteer: true });
    const inp = delay.length > 18 ? delay.shift()! : NO_INPUT; // 150 ms reaction
    r.step([inp]);
    for (const e of r.events) if (e.t === 'crash') crashes++;
    if (p.offroad) off++;
  }
  console.log(`car ${car} ${code} ${track.scen.name.padEnd(10)} analog ${ra.time.toFixed(1)}s  keyboard ${p.finished ? r.time.toFixed(1) + 's' : 'DNF'}  (+${((r.time / ra.time - 1) * 100).toFixed(1)}%) crashes ${crashes} offroad ${(off / 120).toFixed(1)}s`);
}
