import { generateTrack } from '../src/track/generator';
import { Race } from '../src/sim/race';
import { makeRivals } from '../src/sim/roster';
import { NO_INPUT } from '../src/sim/car';
import { hashString } from '../src/core/rng';
import { COURSES } from '../src/track/courses';
for (const [course, d] of [['easy', 0], ['medium', 1], ['hard', 2]] as const) for (const code of COURSES.championship[course]) {
  const track = generateTrack(code);
  if (track.raceLen <= 15000) continue;
  const r = new Race({ track, mode: 'championship', difficulty: d, players: [{ name: 'B', car: 0, manual: false, accelButton: false, color: 0, bot: true }], rivals: makeRivals(hashString('championship' + course + COURSES.championship[course].join('')), d), playerSlots: [19], fuel: true, seed: 5 });
  while (!r.over && r.clock < 1500) r.step([NO_INPUT]);
  console.log(code, course, track.scen.name, (track.raceLen / 1000).toFixed(1) + 'km', 'pos', r.players[0].position, 'fuel left', r.players[0].fuel.toFixed(2));
}
