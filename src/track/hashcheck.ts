// Determinism self-test: hashes the data of 100 generated tracks. Open the game with ?hashcheck
// in any browser; every browser must show the same combined value.
import { hashString } from '../core/rng';
import { COURSES } from './courses';
import { generateTrack } from './generator';

export function hashCheck(): { combined: string; lines: string[] } {
  const codes: string[] = [...Object.values(COURSES.arcade).flat(), ...Object.values(COURSES.championship).flat(), 'ZZZZZZZZZ25', 'AAAAAAAAA00', 'Grand Admiral', 'MICI THE CAT', 'hello world', ''];
  for (let i = 0; i < 30; i++) {
    let c = '';
    let h = hashString('seed' + i);
    for (let k = 0; k < 9; k++) { c += String.fromCharCode(65 + (h % 26)); h = Math.floor(h / 26) + k * 7919; }
    codes.push(c + String(i % 26).padStart(2, '0'));
  }
  let all = '';
  const lines: string[] = [];
  for (const c of codes) {
    const t = generateTrack(c);
    lines.push(`${JSON.stringify(c)} ${t.code} ${t.hash}`);
    all += t.hash;
  }
  return { combined: (hashString(all) >>> 0).toString(16), lines };
}
