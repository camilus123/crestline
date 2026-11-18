// Writes the game's SMAA shader sources and unpacked tables to tests/out/smaa.json for tests/smaaref.mjs.
import fs from 'node:fs';
import { SMAA_VS, SMAA_EDGE_FS, SMAA_WEIGHT_FS, SMAA_BLEND_FS } from '../src/render/smaa';
import { unpackTable } from '../src/render/inflate';
import { AREA, AREA_Z, SEARCH, SEARCH_Z } from '../src/render/smaatables';
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
fs.writeFileSync(new URL('./smaa.json', import.meta.url), JSON.stringify({
  vs: SMAA_VS, edge: SMAA_EDGE_FS, weight: SMAA_WEIGHT_FS, blend: SMAA_BLEND_FS,
  area: b64(unpackTable(AREA_Z, AREA.w, AREA.h, AREA.bpp)), search: b64(unpackTable(SEARCH_Z, SEARCH.w, SEARCH.h, SEARCH.bpp)),
}));
console.log('wrote tests/out/smaa.json');
