// Per-car pit stop cost on one championship race: time in the pit zone, fuel added, time stationary.
import { generateTrack } from '../src/track/generator';
import { COURSES } from '../src/track/courses';
import { Race } from '../src/sim/race';
import { makeRivals } from '../src/sim/roster';
import { NO_INPUT } from '../src/sim/car';
import { hashString } from '../src/core/rng';
const code = process.argv[2] || 'QRLOORSLP18';
const track = generateTrack(code);
const rivals = makeRivals(hashString('championship' + 'hard' + COURSES.championship.hard.join('')), 2);
const r = new Race({ track, mode: 'championship', difficulty: 2, players: [{ name: 'BOT', car: 0, manual: false, accelButton: false, color: 0, bot: true }], rivals, playerSlots: [19], fuel: true, seed: 5 });
const inPit = new Map<number, number>(), still = new Map<number, number>(), add = new Map<number, number>(), posBefore = new Map<number, number>();
const tr = r.track;
let steps = 0;
while (!r.over && steps < 120 * 60 * 25) {
  const f0 = r.cars.map((c) => c.fuel);
  r.step([NO_INPUT]);
  for (const c of r.cars) {
    if (tr.isPit(c.s) && c.x > tr.hwL(c.s) + 0.3) {
      if (!posBefore.has(c.index)) posBefore.set(c.index, c.position);
      inPit.set(c.index, (inPit.get(c.index) ?? 0) + 1 / 120);
      if (c.v < 0.7) still.set(c.index, (still.get(c.index) ?? 0) + 1 / 120);
    }
    if (c.fuel > f0[c.index]) add.set(c.index, (add.get(c.index) ?? 0) + c.fuel - f0[c.index]);
  }
  steps++;
}
const rows = r.cars.map((c) => ({ i: c.index, bot: c.isPlayer, pos: c.position, pit: inPit.get(c.index) ?? 0, still: still.get(c.index) ?? 0, add: add.get(c.index) ?? 0, before: posBefore.get(c.index) ?? 0, end: c.fuel, t: c.finishTime }));
rows.sort((a, b) => a.pos - b.pos);
for (const w of rows) console.log(`${w.bot ? 'BOT' : '   '} P${String(w.pos).padStart(2)} car ${String(w.i).padStart(2)} in pit ${w.pit.toFixed(1)}s stationary ${w.still.toFixed(1)}s added ${(w.add * 100).toFixed(0)}% end fuel ${(w.end * 100).toFixed(0)}% pos at pit entry ${w.before} finish ${w.t.toFixed(1)}`);
