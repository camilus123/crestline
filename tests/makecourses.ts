import { encodeCode } from '../src/track/codes';
import { Rng } from '../src/core/rng';
const S = { RALLY: 0, FUTURE: 1, NIGHT: 2, MARSH: 3, MOUNTAINS: 4, SNOW: 5, ROADWORKS: 6, STORM: 7, DESERT: 8, FOG: 9, MOTORWAY: 10, WIND: 11, FOREST: 12 };
const plan: Record<string, number[]> = {
  arcade_easy: [S.RALLY, S.DESERT, S.WIND, S.NIGHT, S.FOREST, S.MOTORWAY, S.SNOW],
  arcade_medium: [S.FUTURE, S.MARSH, S.FOG, S.RALLY, S.ROADWORKS, S.STORM, S.MOUNTAINS, S.DESERT, S.SNOW, S.NIGHT],
  arcade_hard: [S.WIND, S.FUTURE, S.FOREST, S.STORM, S.MARSH, S.MOTORWAY, S.ROADWORKS, S.FOG, S.SNOW, S.DESERT, S.MOUNTAINS, S.NIGHT, S.RALLY, S.FUTURE, S.STORM],
  champ_easy: [S.MOTORWAY, S.RALLY, S.FOREST, S.DESERT, S.WIND, S.NIGHT, S.FUTURE],
  champ_medium: [S.WIND, S.SNOW, S.MARSH, S.FUTURE, S.RALLY, S.FOG, S.STORM, S.MOUNTAINS, S.ROADWORKS, S.DESERT],
  champ_hard: [S.FUTURE, S.RALLY, S.STORM, S.DESERT, S.SNOW, S.ROADWORKS, S.FOREST, S.MOTORWAY, S.NIGHT, S.MARSH, S.FOG, S.WIND, S.MOUNTAINS, S.STORM, S.FUTURE],
};
const ranges = [
  { c: [8, 13], s: [6, 11], l: [5, 9], h: [6, 12], st: [5, 10], d: [3, 9], sc: [15, 20], o: [5, 10] },
  { c: [11, 16], s: [10, 15], l: [7, 12], h: [10, 15], st: [9, 14], d: [9, 14], sc: [16, 21], o: [9, 14] },
  { c: [14, 21], s: [14, 21], l: [9, 15], h: [12, 19], st: [12, 19], d: [14, 22], sc: [17, 23], o: [13, 20] },
];
const out: Record<string, string[]> = {};
let k = 0;
for (const [key, scens] of Object.entries(plan)) {
  const diff = key.endsWith('easy') ? 0 : key.endsWith('medium') ? 1 : 2;
  const champ = key.startsWith('champ');
  const r = ranges[diff];
  const rng = new Rng(4242 + k++ * 77);
  out[key] = scens.map((scenario, i) => {
    const t = scens.length > 1 ? i / (scens.length - 1) : 0;
    const v = (a: number[]) => Math.round(a[0] + (a[1] - a[0]) * (t * 0.7 + rng.float() * 0.3));
    let length = v(r.l);
    if (champ && diff > 0 && i % 3 === 2) length = 14 + rng.int(3); // long races with a fuel stop
    return encodeCode({ curves: v(r.c), sharpness: v(r.s), length, hills: v(r.h), steepness: v(r.st), difficulty: v(r.d), scenery: v(r.sc), scatter: 6 + rng.int(18), obstacles: v(r.o), scenario, type: ((i + diff + (champ ? 1 : 0)) % 2) as 0 | 1 });
  });
}
console.log(JSON.stringify(out, null, 1));
console.log(Object.values(out).flat().length);
