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
const tr = r.track; const c = r.players[0]; const ai = (r as any).bots[c.index];
let steps = 0, last = -1;
while (!r.over && steps < 120 * 60 * 25) {
  r.step([NO_INPUT]);
  steps++;
  const crashed = r.events.some((e) => (e.t === 'crash' || e.t === 'headon') && e.car === c.index);
  if (crashed || ai.pitTarget > 0 || ai.pitExit) {
    if (crashed || steps - last >= 120) {
      last = steps;
      const near = r.cars.filter((o) => o !== c && Math.abs(tr.delta(c.s, o.s)) < 30).map((o) => `#${o.index}(ds ${tr.delta(c.s, o.s).toFixed(0)} x ${o.x.toFixed(1)} v ${o.v.toFixed(0)})`).join(' ');
      console.log(`${crashed ? 'CRASH ' : ''}pit ${tr.isPit(c.s)} t ${r.time.toFixed(1)} s ${c.s.toFixed(0)} x ${c.x.toFixed(1)} hwL ${tr.hwL(c.s).toFixed(1)} v ${(c.v * 3.6).toFixed(0)} fuel ${c.fuel.toFixed(2)} target ${ai.pitTarget.toFixed(2)} exit ${ai.pitExit} | ${near}`);
    }
  }
}
