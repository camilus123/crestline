import { O } from '../src/track/defs';
import { buildModel, buildFarTree } from '../src/render/models';
for (const [k, v] of Object.entries(O)) { if (typeof v !== 'number') continue; const a = buildModel(v, 0).vertexCount, l = buildModel(v, 0, true).vertexCount, f = buildFarTree(v, 0).vertexCount; if (l < a * 0.8 || f < a) console.log(k.padEnd(14), a, 'lod', l, 'far', f); }
