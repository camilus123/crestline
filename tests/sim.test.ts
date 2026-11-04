// Headless bot races: every scenario, arcade + championship. Run: npm run test:sim
import { generateTrack } from '../src/track/generator';
import { encodeCode } from '../src/track/codes';
import { SCENARIO_NAMES } from '../src/track/defs';
import { Race, RaceCfg } from '../src/sim/race';
import { makeRivals } from '../src/sim/roster';
import { NO_INPUT } from '../src/sim/car';

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--scen='));
const carArg = args.find((a) => a.startsWith('--car='));
const car = carArg ? +carArg.slice(6) : 0;
const codeArg = args.find((a) => a.startsWith('--code='));

function run(code: string, mode: 'arcade' | 'championship', diff: number, slot: number, manual = false) {
  const track = generateTrack(code);
  const cfg: RaceCfg = {
    track, mode, difficulty: diff,
    players: [{ name: 'BOT', car, manual, accelButton: false, color: 0, bot: true }],
    rivals: makeRivals(1234, diff), playerSlots: [slot],
    fuel: mode === 'championship' && track.raceLen > 15000, seed: 99,
  };
  const r = new Race(cfg);
  let steps = 0;
  const maxSteps = 120 * 60 * 20;
  let crashes = 0;
  let maxV = 0;
  while (!r.over && steps < maxSteps) {
    r.step([NO_INPUT]);
    for (const e of r.events) if (e.t === 'crash' || e.t === 'headon') crashes++;
    maxV = Math.max(maxV, r.players[0].v);
    steps++;
  }
  const p = r.players[0];
  return { r, p, crashes, maxV, track };
}

const scens = only ? [+only.slice(7)] : [...Array(13).keys()];
const results: string[] = [];
let fails = 0;
for (const sc of scens) {
  for (const diff of [0, 1, 2]) {
    const code = codeArg ? codeArg.slice(7) : encodeCode({ curves: 10 + diff * 4, sharpness: 9 + diff * 5, length: 6 + diff * 3, hills: 10 + diff * 3, steepness: 9 + diff * 4, difficulty: 6 + diff * 7, scenery: 15, scatter: 15, obstacles: 8 + diff * 6, scenario: sc, type: ((sc + diff) % 2) as 0 | 1 });
    const a = run(code, 'arcade', diff, 19);
    const c = run(code, 'championship', diff, 19);
    const ok = a.p.finished && c.p.position <= 10;
    if (!ok) fails++;
    const margin = a.r.timeLeft[0];
    results.push(`${ok ? 'OK ' : 'BAD'} ${SCENARIO_NAMES[sc].padEnd(10)} d${diff} ${code} ${(a.track.raceLen / 1000).toFixed(1)}km ` +
      `arcade ${a.p.finished ? 'fin' : 'TIMEOUT'} t=${a.r.time.toFixed(0)}s ref=${a.r.refTime.toFixed(0)} left=${margin.toFixed(1)}s pos=${a.p.position} crash=${a.crashes} vmax=${(a.maxV * 3.6).toFixed(0)} | ` +
      `champ pos=${c.p.position} t=${c.r.time.toFixed(0)} crash=${c.crashes} fuel=${c.r.cfg.fuel ? c.p.fuel.toFixed(2) : '-'}`);
    console.log(results[results.length - 1]);
  }
}
console.log(fails ? `${fails} FAILURES` : 'ALL PASSED');
