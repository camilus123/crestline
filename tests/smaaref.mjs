// The game's SMAA passes against the upstream shader (third_party/smaa/SMAA.hlsl, compiled through its own GLSL
// path), on the same pictures, texel by texel:
//   pass 1  edges     the game's, with its 'as the screen shows it' step replaced by a plain read, against upstream's
//                     colour edge detection with the one line the game deliberately does differently changed too
//                     (and, for the record, how much the unchanged upstream differs)
//   pass 2  weights   against upstream, from the same edges
//   pass 3  blend     against upstream, from the same weights, mixing in plain linear light (uK = 0)
// Twice: the picture filling its texture, and filling only a corner of a larger one.
//   node build.mjs --test tests/smaadump.test.ts tests/out/smaadump.mjs && node tests/out/smaadump.mjs && node tests/smaaref.mjs
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import fs from 'node:fs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const mine = JSON.parse(fs.readFileSync(path.join(root, 'tests/out/smaa.json'), 'utf8'));
const hlsl = fs.readFileSync(path.join(root, 'third_party/smaa/SMAA.hlsl'), 'utf8');
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await br.newPage(); p.setDefaultTimeout(300000);
const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto('about:blank');
const res = await p.evaluate(async ({ mine, hlsl }) => {
  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl2', { antialias: false });
  const log = [];
  const prog = (vs, fs, name) => {
    const pr = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(sh));
      gl.attachShader(pr, sh);
    }
    gl.bindAttribLocation(pr, 0, 'aPos');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(name + ': ' + gl.getProgramInfoLog(pr));
    return pr;
  };
  // ---- upstream, through its GLSL path
  const head = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\nuniform vec4 uM;\n#define SMAA_RT_METRICS uM\n#define SMAA_GLSL_3\n#define SMAA_PRESET_HIGH\n';
  const up = (body) => head + hlsl + '\nin vec2 vT; out vec4 o;\n' + body;
  const hlslFixed = hlsl.replace('t = abs(C - Cleftleft);', 't = abs(Cleft - Cleftleft);').replace('t = abs(C - Ctoptop);', 't = abs(Ctop - Ctoptop);');
  if (hlslFixed === hlsl) throw new Error('upstream edge lines not found');
  // (and with the pixel's own edges read exactly, as the game does: see the notes in smaa.ts)
  const exact = hlsl.replace('float2 e = SMAASample(edgesTex, texcoord).rg;', 'float2 e = texelFetch(edgesTex, ivec2(gl_FragCoord.xy), 0).rg;');
  if (exact === hlsl) throw new Error('upstream own-edge read not found');
  const edgeBody = 'uniform sampler2D uScene;\nvoid main(){ vec4 off[3]; SMAAEdgeDetectionVS(vT, off); o = vec4(SMAAColorEdgeDetectionPS(vT, off, uScene), 0.0, 1.0); }';
  const U = {
    edge: prog(mine.vs, up(edgeBody), 'upstream edges'),
    edgeFixed: prog(mine.vs, head + hlslFixed + '\nin vec2 vT; out vec4 o;\n' + edgeBody, 'upstream edges, changed'),
    weightAsIs: prog(mine.vs, up('uniform sampler2D uEdges; uniform sampler2D uArea; uniform sampler2D uSearch;\nvoid main(){ vec2 pix; vec4 off[3]; SMAABlendingWeightCalculationVS(vT, pix, off); o = SMAABlendingWeightCalculationPS(vT, pix, off, uEdges, uArea, uSearch, vec4(0.0)); }'), 'upstream weights, unchanged'),
    weight: prog(mine.vs, head + exact + '\nin vec2 vT; out vec4 o;\n' + 'uniform sampler2D uEdges; uniform sampler2D uArea; uniform sampler2D uSearch;\nvoid main(){ vec2 pix; vec4 off[3]; SMAABlendingWeightCalculationVS(vT, pix, off); o = SMAABlendingWeightCalculationPS(vT, pix, off, uEdges, uArea, uSearch, vec4(0.0)); }', 'upstream weights'),
    blend: prog(mine.vs, up('uniform sampler2D uScene; uniform sampler2D uBlend;\nvoid main(){ vec4 off; SMAANeighborhoodBlendingVS(vT, off); o = SMAANeighborhoodBlendingPS(vT, off, uScene, uBlend); }'), 'upstream blend'),
  };
  // ---- the game's (edge pass: reads the picture as it is, to be comparable)
  const plainRead = mine.edge.replace(/vec3 seen\(vec2 t\)\{[^}]*\}/, 'vec3 seen(vec2 t){ return texture(uScene, min(t, uMax)).rgb; }');
  if (plainRead === mine.edge) throw new Error('seen() not found');
  const G = { edge: prog(mine.vs, plainRead, 'game edges'), weight: prog(mine.vs, mine.weight, 'game weights'), blend: prog(mine.vs, mine.blend, 'game blend') };
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const tex = (w, h, internal, format, data, filter) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const area = tex(160, 560, gl.RG8, gl.RG, bytes(mine.area), gl.LINEAR), search = tex(64, 16, gl.R8, gl.RED, bytes(mine.search), gl.NEAREST);
  const out = [];
  for (const [W, H, rw, rh, what] of [[320, 200, 320, 200, 'picture fills the texture'], [448, 320, 320, 200, 'picture in a corner of a larger texture']]) {
    // a picture with hard edges of every kind: lines at many slopes, circles, thin bars, a checker, coloured
    // patches of equal brightness, soft gradients, and a patch of noise
    let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const px = new Uint8Array(W * H * 4);
    const shapes = [];
    for (let i = 0; i < 26; i++) shapes.push({ a: rnd() * Math.PI, x: rnd() * rw, y: rnd() * rh, c: [rnd() * 255, rnd() * 255, rnd() * 255], kind: i % 4, r: 6 + rnd() * 40 });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c = [30 + x * 0.3, 40 + y * 0.4, 90];
      if (x < rw && y < rh) {
        for (const s of shapes) {
          const dx = x + 0.5 - s.x, dy = y + 0.5 - s.y;
          const along = dx * Math.cos(s.a) + dy * Math.sin(s.a), across = -dx * Math.sin(s.a) + dy * Math.cos(s.a);
          if (s.kind === 0 && across > 0 && Math.abs(along) < s.r * 2 && across < s.r) c = s.c;
          if (s.kind === 1 && dx * dx + dy * dy < s.r * s.r) c = s.c;
          if (s.kind === 2 && Math.abs(across) < 1.2 && Math.abs(along) < s.r * 3) c = s.c;
          if (s.kind === 3 && Math.abs(across) < s.r * 0.4 && Math.abs(along) < s.r * 0.4 && ((Math.floor(along / 3) + Math.floor(across / 3)) & 1)) c = s.c;
        }
        if (x > rw - 40 && y < 40) c = [rnd() * 255, rnd() * 255, rnd() * 255];
        if (x < 60 && y > rh - 30) c = (x >> 3) & 1 ? [200, 40, 40] : [40, 150, 40]; // (red and green of near-equal brightness)
      } else c = [rnd() * 255, rnd() * 255, rnd() * 255]; // outside the picture: rubbish that must not leak in
      const i = (y * W + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    const scene = tex(W, H, gl.RGBA8, gl.RGBA, px, gl.LINEAR);
    const target = (internal, format) => { const t = tex(W, H, internal, format, null, gl.LINEAR); const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, fb }; };
    const run = (pr, dst, texs, extra = {}) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(0, 0, rw, rh);
      gl.useProgram(pr);
      gl.uniform2f(gl.getUniformLocation(pr, 'uSub'), rw / W, rh / H);
      gl.uniform4f(gl.getUniformLocation(pr, 'uM'), 1 / W, 1 / H, W, H);
      gl.uniform2f(gl.getUniformLocation(pr, 'uMax'), (rw - 0.5) / W, (rh - 0.5) / H);
      for (const [k, v] of Object.entries(extra)) gl.uniform1f(gl.getUniformLocation(pr, k), v);
      texs.forEach(([name, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(gl.getUniformLocation(pr, name), i); });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const buf = new Uint8Array(rw * rh * 4);
      gl.readPixels(0, 0, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf;
    };
    const cmp = (a, b, ch) => { let n = 0, worst = 0, set = 0; for (let i = 0; i < a.length; i += 4) { let d = 0, any = 0; for (const c of ch) { d = Math.max(d, Math.abs(a[i + c] - b[i + c])); any |= a[i + c] | b[i + c]; } if (d > 0) n++; if (any) set++; worst = Math.max(worst, d); } return { differ: n, worst, nonzero: set, of: a.length / 4 }; };
    const eG = target(gl.RG8, gl.RG), eU = target(gl.RG8, gl.RG), eF = target(gl.RG8, gl.RG);
    const wG = target(gl.RGBA8, gl.RGBA), wU = target(gl.RGBA8, gl.RGBA), wA = target(gl.RGBA8, gl.RGBA), bG = target(gl.RGBA8, gl.RGBA), bU = target(gl.RGBA8, gl.RGBA);
    const edgesG = run(G.edge, eG, [['uScene', scene]]);
    const edgesU = run(U.edge, eU, [['colorTex', scene], ['uScene', scene]]);
    const edgesF = run(U.edgeFixed, eF, [['uScene', scene]]);
    // upstream samples past the picture's corner where the game clamps: compare inside, one texel in from the far sides
    const inner = (buf) => { const o = new Uint8Array(buf.length); for (let y = 0; y < rh - 2; y++) o.set(buf.subarray(y * rw * 4, (y * rw + rw - 2) * 4), y * rw * 4); return o; };
    const r = { what, edges: cmp(rw === W ? edgesG : inner(edgesG), rw === W ? edgesF : inner(edgesF), [0, 1]), edgesVsUnchangedUpstream: cmp(edgesG, edgesU, [0, 1]) };
    // passes 2 and 3 from the SAME inputs (the game's edges, then upstream's weights)
    const weightsG = run(G.weight, wG, [['uEdges', eG.t], ['uArea', area], ['uSearch', search]]);
    const weightsU = run(U.weight, wU, [['uEdges', eG.t], ['uArea', area], ['uSearch', search]]);
    r.weights = cmp(weightsG, weightsU, [0, 1, 2, 3]);
    r.weightsVsUnchangedUpstream = cmp(weightsG, run(U.weightAsIs, wA, [['uEdges', eG.t], ['uArea', area], ['uSearch', search]]), [0, 1, 2, 3]);
    for (const t of [wG.t, wU.t]) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }
    const blendG = run(G.blend, bG, [['uScene', scene], ['uBlend', wU.t]], { uK: 0 });
    const blendU = run(U.blend, bU, [['uScene', scene], ['uBlend', wU.t]]);
    r.blend = cmp(blendG, blendU, [0, 1, 2]);
    let changed = 0; for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const i = (y * rw + x) * 4, j = (y * W + x) * 4; if (Math.abs(blendG[i] - px[j]) + Math.abs(blendG[i + 1] - px[j + 1]) + Math.abs(blendG[i + 2] - px[j + 2]) > 3) changed++; }
    r.pixelsChangedByBlend = changed;
    r.glError = gl.getError();
    out.push(r);
  }
  // ---- and does it do the job? Clean shapes (straight edges at many slopes, discs) drawn with one sample per
  // pixel, against the same shapes with 8x8 samples per pixel: the error on the edge pixels before and after.
  const KINDS = [
    ['one long edge rising 1 in 25', () => ({ half: 1 / 25 })],
    ['one long edge rising 1 in 8', () => ({ half: 1 / 8 })],
    ['one long edge rising 1 in 3', () => ({ half: 1 / 3 })],
    ['bars within 12 degrees of level or upright', (rnd) => ({ disc: false, a: Math.floor(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.42 })],
    ['bars within 8 degrees of a diagonal', (rnd) => ({ disc: false, a: Math.PI / 4 + Math.floor(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.28 })],
    ['bars at any angle', (rnd) => ({ disc: false, a: rnd() * Math.PI * 2 })],
    ['discs', () => ({ disc: true, a: 0 })],
  ];
  for (const [kind, make] of KINDS) {
    const W = 320, H = 200;
    let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const shapes = [];
    for (let i = 0; i < 14; i++) shapes.push({ ...make(rnd), x: 30 + rnd() * (W - 60), y: 25 + rnd() * (H - 50), c: [40 + rnd() * 215, 40 + rnd() * 215, 40 + rnd() * 215], r: 14 + rnd() * 34 });
    const colour = (x, y) => {
      let c = [24, 28, 40];
      for (const s of shapes) {
        const dx = x - s.x, dy = y - s.y;
        if (s.half) { if (s === shapes[0] && y < 90.3 + x * s.half) c = [230, 230, 230]; continue; }
        if (s.disc ? dx * dx + dy * dy < s.r * s.r : Math.abs(dx * Math.cos(s.a) + dy * Math.sin(s.a)) < s.r * 1.6 && Math.abs(-dx * Math.sin(s.a) + dy * Math.cos(s.a)) < s.r * 0.7) c = s.c;
      }
      return c;
    };
    const px = new Uint8Array(W * H * 4), truth = new Float32Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = colour(x + 0.5, y + 0.5), i = (y * W + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
      const t = [0, 0, 0];
      for (let sy = 0; sy < 8; sy++) for (let sx = 0; sx < 8; sx++) { const q = colour(x + (sx + 0.5) / 8, y + (sy + 0.5) / 8); t[0] += q[0]; t[1] += q[1]; t[2] += q[2]; }
      truth.set(t.map((v) => v / 64), (y * W + x) * 3);
    }
    const scene = tex(W, H, gl.RGBA8, gl.RGBA, px, gl.LINEAR);
    const target = (internal, format) => { const t = tex(W, H, internal, format, null, gl.LINEAR); const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, fb }; };
    const run = (pr, dst, texs, extra = {}) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(pr);
      gl.uniform2f(gl.getUniformLocation(pr, 'uSub'), 1, 1); gl.uniform4f(gl.getUniformLocation(pr, 'uM'), 1 / W, 1 / H, W, H); gl.uniform2f(gl.getUniformLocation(pr, 'uMax'), 1, 1);
      for (const [k, v] of Object.entries(extra)) gl.uniform1f(gl.getUniformLocation(pr, k), v);
      texs.forEach(([name, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(gl.getUniformLocation(pr, name), i); });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const buf = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf); return buf;
    };
    const e = target(gl.RG8, gl.RG), w = target(gl.RGBA8, gl.RGBA), b = target(gl.RGBA8, gl.RGBA);
    gl.bindTexture(gl.TEXTURE_2D, w.t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    run(G.edge, e, [['uScene', scene]]);
    run(G.weight, w, [['uEdges', e.t], ['uArea', area], ['uSearch', search]]);
    const res = run(G.blend, b, [['uScene', scene], ['uBlend', w.t]], { uK: 0 });
    let n = 0, before = 0, after = 0, closer = 0, further = 0;
    for (let i = 0; i < W * H; i++) {
      let eb = 0, ea = 0;
      for (let c = 0; c < 3; c++) { eb += Math.abs(px[i * 4 + c] - truth[i * 3 + c]); ea += Math.abs(res[i * 4 + c] - truth[i * 3 + c]); }
      if (eb < 3 && ea < 3) continue; // (not an edge pixel, and left alone)
      n++; before += eb / 3; after += ea / 3;
      if (ea < eb - 1.5) closer++; else if (ea > eb + 1.5) further++;
    }
    out.push({ shapes: { kind, pixels: n, before: before / n, after: after / n, closer: closer / n, further: further / n } });
  }
  return out;
}, { mine, hlsl });
await br.close();
let bad = errors.length ? 1 : 0;
for (const r of res) {
  if (r.shapes) {
    const q = r.shapes;
    console.log(`${q.kind.padEnd(44)} ${q.pixels} edge pixels, mean error against 64 samples per pixel ${q.before.toFixed(1)} -> ${q.after.toFixed(1)} levels of 255 (${(q.closer * 100).toFixed(0)} % closer, ${(q.further * 100).toFixed(0)} % further)`);
    // (how far the error must fall: a little above what this version does: to 0.13, 0.22 and 0.54 of what it was
    // on the single edges, then 0.41, 0.49, 0.43 and 0.64. What is left on a single straight edge is where
    // within the pixel the true edge runs, which a method that only sees the finished pixels cannot know: the
    // staircase is the same for any position within a range that grows with the slope, so the steeper the edge
    // the more is left. On the shapes there are also their corners and the places where one covers another.)
    const need = { 'one long edge rising 1 in 25': 0.2, 'one long edge rising 1 in 8': 0.3, 'one long edge rising 1 in 3': 0.65, 'bars within 12 degrees of level or upright': 0.47, 'bars within 8 degrees of a diagonal': 0.55, 'bars at any angle': 0.5, discs: 0.7 }[q.kind];
    if (!(q.after < q.before * need) || q.pixels < 250) bad++;
    continue;
  }
  console.log(`\n${r.what}`);
  console.log(`  edges    ${r.edges.differ} of ${r.edges.of} texels differ from upstream with the one changed line (${r.edges.nonzero} are edges); from unchanged upstream ${r.edgesVsUnchangedUpstream.differ} differ`);
  console.log(`  weights  ${r.weights.differ} texels differ from upstream with the own-pixel read made exact, worst by ${r.weights.worst}/255 (${r.weights.nonzero} have a weight); from unchanged upstream ${r.weightsVsUnchangedUpstream.differ} differ (on this software GPU)`);
  console.log(`  blend    ${r.blend.differ} texels differ from upstream, worst by ${r.blend.worst}/255; the blend changed ${r.pixelsChangedByBlend} pixels of the picture; GL error ${r.glError}`);
  if (r.edges.differ || r.weights.differ || r.blend.worst > 1 || r.glError || r.weights.nonzero < 500 || r.pixelsChangedByBlend < 500) bad++;
}
if (errors.length) console.log('page errors:', errors.slice(0, 3).join('\n'));
if (bad) { console.log('FAILED'); process.exit(1); }
