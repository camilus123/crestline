import { hashCheck } from '../src/track/hashcheck';
const r = hashCheck();
const out = `TRACKS ${r.lines.length} COMBINED ${r.combined}\n` + r.lines.join('\n');
const g: any = globalThis as any;
if (typeof g.print === 'function' && typeof g.process === 'undefined') g.print(out);
else console.log(out);
g.__hashResult = out;
