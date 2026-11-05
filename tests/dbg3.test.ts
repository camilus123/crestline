import { generateTrack } from '../src/track/generator';
import { Race } from '../src/sim/race';
import { makeRivals } from '../src/sim/roster';
import { NO_INPUT, EV_CRASH } from '../src/sim/car';
import { Hz } from '../src/track/defs';
const code = process.argv[2], diff = +(process.argv[3] ?? 1);
const track = generateTrack(code);
const r = new Race({ track, mode: 'championship', difficulty: diff, players: [{ name: 'B', car: 0, manual: false, accelButton: false, color: 0, bot: true }], rivals: makeRivals(1, diff), playerSlots: [19], fuel: track.raceLen > 15000, seed: 5 });
const p = r.players[0];
let last = 0;
while (!r.over && r.clock < 1500) {
  r.step([NO_INPUT]);
  if (p.events & EV_CRASH && r.time - last > 0.5) {
    last = r.time;
    const hz = r.track.hazardsIn(p.s - 5, p.s + 5, []).map((h) => `${h.kind}[${h.u0.toFixed(1)},${h.u1.toFixed(1)}]s${h.s.toFixed(0)}+${h.len.toFixed(1)}`);
    const objs = r.track.objectsIn(p.s - 5, p.s + 5, []).map((i) => `${track.objects.type[i]}@${track.objects.u[i].toFixed(1)}r${track.objects.radius[i].toFixed(1)}`);
    console.log(`t=${r.time.toFixed(1)} s=${p.s.toFixed(0)} x=${p.x.toFixed(1)} v=${(p.v * 3.6).toFixed(0)} hwL=${r.track.hwL(p.s).toFixed(1)} hwR=${r.track.hwR(p.s).toFixed(1)} hz=${hz} obj=${objs.slice(0, 4)}`);
  }
}
console.log('pos', p.position);
