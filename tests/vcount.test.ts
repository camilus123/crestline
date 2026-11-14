import { O } from '../src/track/defs';
import { buildModel } from '../src/render/models';
for (const [k, v] of Object.entries(O)) { if (typeof v !== 'number') continue; const a = [0, 1, 2].map((i) => buildModel(v, i).vertexCount); console.log(k.padEnd(14), a.join(' ')); }
