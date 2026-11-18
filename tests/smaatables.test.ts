// The embedded SMAA lookup tables unpack to exactly the upstream bytes, and the inflater agrees with zlib on
// every kind of block.   node build.mjs --test tests/smaatables.test.ts tests/out/smaatables.mjs && node tests/out/smaatables.mjs
import { createHash, randomBytes } from 'node:crypto';
import zlib from 'node:zlib';
import { inflate, unpackTable } from '../src/render/inflate';
import { AREA, AREA_Z, SEARCH, SEARCH_Z } from '../src/render/smaatables';

let bad = 0;
const check = (what: string, ok: boolean) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) bad++; };
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

for (const [name, t, z] of [['area', AREA, AREA_Z], ['search', SEARCH, SEARCH_Z]] as const) {
  const b = unpackTable(z, t.w, t.h, t.bpp);
  check(`${name} table: ${b.length} bytes, sha256 ${sha(b).slice(0, 16)}… as upstream`, b.length === t.w * t.h * t.bpp && sha(b) === t.sha256);
}

// the inflater against zlib: stored, fixed and dynamic blocks, short and long matches, many sizes
const samples: [string, Uint8Array][] = [
  ['empty', new Uint8Array(0)],
  ['one byte', new Uint8Array([7])],
  ['zeros 100 k', new Uint8Array(100000)],
  ['random 70 k (stored blocks)', randomBytes(70000)],
  ['text', new TextEncoder().encode('the quick brown fox jumps over the lazy dog. '.repeat(900))],
  ['ramp', Uint8Array.from({ length: 50000 }, (_, i) => (i * i) >> 7)],
  ['sparse', Uint8Array.from({ length: 200000 }, (_, i) => (i % 97 === 0 ? i & 255 : 0))],
];
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
for (let k = 0; k < 40; k++) {
  const n = Math.floor(rnd() * 30000), alphabet = 1 + Math.floor(rnd() * 255), runs = rnd() < 0.5;
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = runs && i > 0 && rnd() < 0.9 ? b[i - 1] : Math.floor(rnd() * alphabet);
  samples.push([`generated ${k}`, b]);
}
let n = 0, okN = 0;
for (const [name, data] of samples) {
  for (const level of [0, 1, 6, 9]) {
    for (const strategy of [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FIXED, zlib.constants.Z_HUFFMAN_ONLY]) {
      const z = zlib.deflateRawSync(data, { level, strategy });
      n++;
      let same = false;
      try {
        const out = inflate(new Uint8Array(z), data.length);
        same = out.length === data.length && out.every((v, i) => v === data[i]);
      } catch (e) { console.log('     ', name, level, strategy, String(e)); }
      if (same) okN++;
    }
  }
}
check(`inflater equals zlib on ${okN}/${n} streams`, okN === n);
// damaged input must be refused, not accepted
let refused = 0;
const good = zlib.deflateRawSync(samples[4][1], { level: 9 });
for (let k = 0; k < 200; k++) {
  const z = new Uint8Array(good);
  z[Math.floor(rnd() * z.length)] ^= 1 << Math.floor(rnd() * 8);
  try {
    const out = inflate(z, samples[4][1].length);
    if (!out.every((v, i) => v === samples[4][1][i])) refused++; // (a wrong result of the right length: only the hash would tell)
  } catch { refused++; }
}
console.log(`     (200 streams with one bit flipped: ${refused} gave an error or a different result)`);
process.exit(bad ? 1 : 0);
