import { generateTrack } from '../src/track/generator';
import { Race } from '../src/sim/race';
import { makeRivals } from '../src/sim/roster';
import { NO_INPUT, EV_LASER } from '../src/sim/car';
import { hashString } from '../src/core/rng';
import { COURSES } from '../src/track/courses';
const code = process.argv[2];
const track = generateTrack(code);
const rivals = makeRivals(hashString('arcade' + 'hard' + COURSES.arcade.hard.join('')), 2);
const r = new Race({ track, mode: 'arcade', difficulty: 2, players: [{ name: 'BOT', car: 0, manual: false, accelButton: false, color: 0, bot: true }], rivals, playerSlots: [19], fuel: false, seed: 5 });
console.log('seg', r.segTimes, 'cps', track.checkpoints, 'lasers', track.hazards.filter(h=>h.kind===11).length);
let lasers = 0, t = 0;
while (!r.over && t < 120*400) { r.step([NO_INPUT]); t++; if (r.players[0].events & EV_LASER) lasers++; for (const e of r.events) if (e.t!=='beep'&&e.t!=='shunt') console.log(r.time.toFixed(1), e.t, e.value??'', 'left', r.timeLeft[0].toFixed(1), 'pos', r.players[0].position, 'lasers', lasers);
  if (t % 2400 === 0) console.log(' t', r.time.toFixed(0), 'd', r.players[0].dist.toFixed(0), 'v', (r.players[0].v*3.6).toFixed(0), 'pos', r.players[0].position); }
