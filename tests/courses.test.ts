// Bot runs every built-in course track: arcade (time limit beatable?) and championship (top ten?).
import { generateTrack } from '../src/track/generator';
import { COURSES } from '../src/track/courses';
import { SCENARIO_NAMES } from '../src/track/defs';
import { Race } from '../src/sim/race';
import { makeRivals } from '../src/sim/roster';
import { NO_INPUT } from '../src/sim/car';
import { hashString } from '../src/core/rng';

const only = process.argv[2];
let fails = 0, n = 0;
const margins: number[] = [];
for (const mode of ['arcade', 'championship'] as const) {
  for (const course of ['easy', 'medium', 'hard'] as const) {
    if (only && only !== `${mode}:${course}`) continue;
    const diff = course === 'easy' ? 0 : course === 'medium' ? 1 : 2;
    const rivals = makeRivals(hashString(mode + course + COURSES[mode][course].join('')), diff);
    for (const code of COURSES[mode][course]) {
      const track = generateTrack(code);
      const r = new Race({ track, mode, difficulty: diff, players: [{ name: 'BOT', car: 0, manual: false, accelButton: false, color: 0, bot: true }], rivals, playerSlots: [19], fuel: mode === 'championship', seed: 5 });
      let steps = 0, crashes = 0;
      const pitted = new Set<number>(), dry = new Set<number>();
      while (!r.over && steps < 120 * 60 * 25) {
        r.step([NO_INPUT]);
        for (const e of r.events) if (e.t === 'crash' || e.t === 'headon') crashes++;
        if (r.cfg.fuel) for (const c of r.cars) { if (c.pitting) pitted.add(c.index); if (c.fuel <= 0 && !c.finished) dry.add(c.index); }
        steps++;
      }
      const p = r.players[0];
      let ok: boolean, info: string;
      if (mode === 'arcade') {
        ok = p.finished;
        const total = r.segTimes.reduce((a, b) => a + b, 0);
        const used = r.time;
        const margin = (total - used) / total;
        margins.push(margin);
        info = `t=${used.toFixed(0)}s limit=${total}s margin=${(margin * 100).toFixed(1)}% left=${r.timeLeft[0].toFixed(1)}`;
      } else {
        ok = p.position <= 10;
        info = `pos=${p.position} fuel=${p.fuel.toFixed(2)} pitted=${pitted.size}/20 dry=${dry.size}`;
        if (dry.size) ok = false;
      }
      n++;
      if (!ok) fails++;
      console.log(`${ok ? 'OK ' : 'BAD'} ${mode.padEnd(12)} ${course.padEnd(6)} ${code} ${SCENARIO_NAMES[track.params.scenario].padEnd(10)} ${(track.raceLen / 1000).toFixed(1)}km ${info} crashes=${crashes}`);
    }
  }
}
if (margins.length) console.log(`arcade margin: min ${(Math.min(...margins) * 100).toFixed(1)}% max ${(Math.max(...margins) * 100).toFixed(1)}%`);
console.log(fails ? `${fails}/${n} FAILURES` : `ALL ${n} PASSED`);
