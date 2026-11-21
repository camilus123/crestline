// The scenery test: a diagnostic for devices on which roadside objects (trees, buildings) are not drawn.
// Written for a phone with a PowerVR Rogue GE8320 that showed the road, the ground and the cars but none of the
// scenery, a fault that cannot be reproduced on the machines the game is developed on.
//
// Round 1 (v3.10.3) on that phone: drawing ranges of instances works; the fragment shader, the change-over
// blend and the way ranges are reached make no difference; what does get drawn is exactly the blob shadows and
// the objects that span the road.
// Round 2 (v3.10.4): the vertex shader's numbers, read back by transform feedback, are all right except one:
// "hide" is 1 for every object and landmark, where the inputs say 0. Of 13 variants of the shader only the two
// without the rule "ordinary objects beyond the fold are left out" drew the scenery (29.3 % and 41.9 % of the
// picture, the same as on a software GPU). That rule was one line:
//   if (uLandmark == 0 && abs(u) > ext + 1.0 && uSpan == 0) hide = 1.0;
// with abs(u) about 34 and ext 700 it cannot be true, and for landmarks its first test fails too.
//
// Round 3 (this file, v3.10.5, which ships the rule rewritten without "if" and "&&"):
//  1. one frozen moment of two tracks with that rule written several ways, counting how many pixels the
//     roadside objects change in the finished picture: does the rewritten rule work, and which other
//     spellings would;
//  2. what the driver makes of each part of the old line, read back by transform feedback: the three tests
//     alone, in pairs and together, as a choice, as an "if" and as a bool, and "hide" before and after the line.
//     That says which construct to look for in the other shaders.
// The report is text, to be copied and sent.

import type { Game } from './game';
import { GL, Mesh, Program } from './render/gl';
import { glStats } from './render/prof';
import { QUALITY } from './render/renderer';
import { OBJ_FLAT_FS, OBJ_FS, OBJ_VS, Scenery } from './render/scenery';

// the frozen moments: race, name, preset, simulation steps before it, whether part 2 runs. In the first two no
// object in view is beyond the fold (on Ultra Low hardly any ever is); in the third, on Low, some are, so the rule
// has work to do: there the picture with the rule left out must differ from the shipped one, and the old
// spellings must not.
const MOMENTS: [string, string, number, number, boolean][] = [
  ['MIHJHHTLI12', 'Forest', 0, 600, true],
  ['TUORSWWUS14', 'Futuristic', 0, 600, true],
  ['MIHJHHTLI12', 'Forest where the rule has work to do', 1, 2750, false],
];
const COLS = 48, ROWS = 12;

/** `a` must be in the shader exactly once: the variants below are edits of the shipped source, not copies of it */
function swap(src: string, a: string, b: string): string {
  if (src.split(a).length !== 2) throw new Error('shader text not found once: ' + a.slice(0, 50));
  return src.replace(a, b);
}

/** the rule as shipped (must be in OBJ_VS exactly once) and as it was up to v3.10.4 */
const RULE = `  float ordinary = (uLandmark == 0 ? 1.0 : 0.0) * (uSpan == 0 ? 1.0 : 0.0);
  hide = max(hide, ordinary * (abs(u) > ext + 1.0 ? 1.0 : 0.0));
`;
const OLD = 'if (uLandmark == 0 && abs(u) > ext + 1.0 && uSpan == 0) hide = 1.0;';
const AFTER = '  float off = max(abs(u) - edge, 0.0);'; // the first line after the landmark rules
const rule = (text: string) => swap(OBJ_VS, RULE, text ? '  ' + text + '\n' : '');
/** the vertex shader with the rule written another way (label, source) */
function variants(): [string, () => string][] {
  return [
    ['as shipped: no "if", no "&&"', () => OBJ_VS],
    ['as it was up to v3.10.4', () => rule(OLD)],
    ['old, the three tests nested', () => rule('if (uLandmark == 0) { if (uSpan == 0) { if (abs(u) > ext + 1.0) hide = 1.0; } }')],
    ['old, the distance test first', () => rule('if (abs(u) > ext + 1.0 && uLandmark == 0 && uSpan == 0) hide = 1.0;')],
    ['old, the distance test last', () => rule('if (uLandmark == 0 && uSpan == 0 && abs(u) > ext + 1.0) hide = 1.0;')],
    ['old, as a choice in place of the "if"', () => rule('hide = (uLandmark == 0 && abs(u) > ext + 1.0 && uSpan == 0) ? 1.0 : hide;')],
    ['old, the two numbers worked out beforehand', () => rule('float uAbs = abs(u); float uLim = ext + 1.0; if (uLandmark == 0 && uAbs > uLim && uSpan == 0) hide = 1.0;')],
    ['old, only the distance test', () => rule('if (abs(u) > ext + 1.0) hide = 1.0;')],
    ['old, placed after the landmark rules', () => swap(rule(''), AFTER, '  if (uLandmark == 0 && abs(iSUR.y) > ext + 1.0 && uSpan == 0) hide = 1.0;\n' + AFTER)],
    ['the rule left out', () => rule('')],
  ];
}

// ---- what the driver makes of the rule's parts, read back
const REC = 28; // floats per recorded vertex
const TF = ['dbg0', 'dbg1', 'dbg2', 'dbg3', 'dbg4', 'dbg5', 'gl_Position'];
const FAR = 'abs(iSUR.y) > ext + 1.0'; // (u is iSUR.y where the rule stands, for everything but the backdrop)
/** `base` with the read-back outputs added at the end of main; `between`: also "hide" noted before and after the old line */
function captureVs(base: string, between: boolean): string {
  let s = swap(base, 'out float vFade;', 'out float vFade;\nout vec4 dbg0; out vec4 dbg1; out vec4 dbg2; out vec4 dbg3; out vec4 dbg4; out vec4 dbg5;');
  if (between) {
    s = swap(s, '  ' + OLD + '\n', `  float hA = hide;\n  ${OLD}\n  float hB = hide;\n`);
    s = swap(s, AFTER, '  float hC = hide;\n' + AFTER);
  }
  s = swap(s, '  vHide = hide;', `  float tIf = 0.0; if (uLandmark == 0 && ${FAR} && uSpan == 0) tIf = 1.0;
  bool tB = uLandmark == 0 && ${FAR} && uSpan == 0;
  dbg0 = vec4(iSUR.x, iSUR.y, ext, d);
  dbg1 = vec4(float(uLandmark), float(uSpan), float(uBend), float(uSkyObj));
  dbg2 = vec4(${between ? 'hA, hB, hC' : '-1.0, -1.0, -1.0'}, hide);
  dbg3 = vec4(${FAR} ? 1.0 : 0.0, uLandmark == 0 ? 1.0 : 0.0, uSpan == 0 ? 1.0 : 0.0, (uLandmark == 0 && ${FAR} && uSpan == 0) ? 1.0 : 0.0);
  dbg4 = vec4((uLandmark == 0 && ${FAR}) ? 1.0 : 0.0, (${FAR} && uSpan == 0) ? 1.0 : 0.0, (uLandmark == 0 && uSpan == 0) ? 1.0 : 0.0, (uLandmark == 1 && uBend == 0 && uSpan == 0) ? 1.0 : 0.0);
  dbg5 = vec4(tIf, tB ? 1.0 : 0.0, (uLandmark == 1 && abs(iSUR.y) > ext) ? 1.0 : 0.0, u);
  vHide = hide;`);
  return s;
}

interface Capture { set: number; type: number; kind: string; first: number; cpu: number[][]; gpu: Float32Array; err: number }

/** records the first vertex of up to `per` instances from the middle of the first range of up to `sets` object types */
function makeCapture(gl: GL, out: Capture[], sets: number, per: number): NonNullable<typeof Scenery.debug.onRange> {
  const seen = new Set<number>();
  return (mesh: Mesh, set, first, n) => {
    if (seen.has(set.type) || seen.size >= sets || n < 1) return;
    seen.add(set.type);
    const k = Math.min(per, n), from = first + Math.floor((n - k) / 2);
    const buf = gl.createBuffer()!, tfo = gl.createTransformFeedback()!;
    const res = new Float32Array(k * REC).fill(-12345);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, res.byteLength, gl.STREAM_READ);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tfo);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buf);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    mesh.drawInstancePoints(from, k, 1);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, res);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.deleteBuffer(buf);
    gl.deleteTransformFeedback(tfo);
    const cpu: number[][] = [];
    for (let i = 0; i < k; i++) cpu.push(Array.from(set.data.subarray((from + i) * 9, (from + i) * 9 + 9)));
    out.push({ set: seen.size, type: set.type, kind: (set.landmark ? 'landmark' : 'object') + (set.bend ? ', bends with the road' : '') + (set.adj ? ', placed each frame' : ''), first: from, cpu, gpu: res, err: gl.getError() });
  };
}

const n2 = (x: number) => (Number.isFinite(x) ? (Math.abs(x) >= 100000 ? x.toExponential(2) : x.toFixed(2)) : String(x));
const row = (a: ArrayLike<number>, from: number, n: number) => Array.from({ length: n }, (_, i) => n2(a[from + i])).join(' ');

export async function sceneryTest(g: Game, say: (s: string) => void): Promise<string> {
  const R = g.renderer, gl = R.gl;
  const L: string[] = [];
  const tick = () => new Promise<void>((r) => setTimeout(r, 30));
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  L.push(`CRESTLINE v${__VERSION__} (build ${__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC) — scenery test 3, ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`);
  L.push('The rule that leaves out objects beyond the fold, written several ways: what each puts in the picture, and what the driver makes of its parts.');
  L.push('');
  L.push('== Device ==');
  L.push(`GPU        ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}  (${dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)})`);
  L.push(`WebGL      ${gl.getParameter(gl.VERSION)}   output ${R.canvas.width}x${R.canvas.height} px   device pixel ratio ${devicePixelRatio}`);
  L.push(`browser    ${navigator.userAgent}`);
  L.push(`GL error before the test: ${gl.getError()}`);

  const reset = () => { Scenery.debug.prog = null; Scenery.debug.onRange = null; R.skipScenery = false; };
  const programs = Program.sources.length; // (the shaders made here are not the game's: kept out of its compile-time list)
  try {
    for (const [code, name, qi, STEPS, parts] of MOMENTS) {
      const q = QUALITY[qi]; // (Ultra Low is what a phone starts on)
      say(`Scenery test: ${name}`);
      await tick();
      g.benchRace(code, q);
      g.simulate(STEPS);
      await tick();
      g.frame(performance.now(), 0); // (the canvas takes this preset's size when a frame is drawn)
      const W = R.canvas.width, H = R.canvas.height;
      const shot = (): Uint8Array => {
        g.frame(performance.now(), 0);
        glStats.calls = glStats.instances = glStats.verts = 0;
        g.frame(performance.now(), 0);
        const buf = new Uint8Array(W * H * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return buf;
      };
      L.push('');
      L.push(`== ${name}, ${q.name}: picture ${W}x${H}, drawn at ${R.renderW}x${R.renderH} ==`);

      // ---- 1. the picture, the rule written several ways
      L.push('');
      L.push('1. Share of the picture the roadside objects change, against the same frame without them.');
      reset();
      R.skipScenery = true;
      const base = shot();
      let ship: Uint8Array | null = null;
      for (const [label, make] of variants()) {
        reset();
        let note = '';
        const cells = new Float32Array(COLS * ROWS);
        let n = 0;
        try {
          if (!label.startsWith('as shipped')) Scenery.debug.prog = new Program(gl, make(), OBJ_FS, 'objects-variant');
          const img = shot();
          const err = gl.getError();
          if (err) note = `   GL error ${err}`;
          if (!ship) ship = img;
          else { let m = 0; for (let i = 0; i < img.length; i += 4) if (Math.abs(img[i] - ship[i]) + Math.abs(img[i + 1] - ship[i + 1]) + Math.abs(img[i + 2] - ship[i + 2]) > 30) m++; note += `   differs from as shipped in ${String(m).padStart(6)} px`; }
          for (let y = 0; y < H; y++) {
            const cy = Math.min(ROWS - 1, Math.floor(((H - 1 - y) / H) * ROWS)); // (rows are read bottom-up)
            for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4;
              if (Math.abs(img[i] - base[i]) + Math.abs(img[i + 1] - base[i + 1]) + Math.abs(img[i + 2] - base[i + 2]) > 30) {
                n++;
                cells[cy * COLS + Math.min(COLS - 1, Math.floor((x / W) * COLS))]++;
              }
            }
          }
          L.push(`   ${label.padEnd(48)} pixels ${((n / (W * H)) * 100).toFixed(1).padStart(5)} %   instances ${String(glStats.instances).padStart(5)}${note}`);
        } catch (e) {
          L.push(`   ${label.padEnd(48)} COULD NOT BE DRAWN: ${String(e).slice(0, 400)}`);
        }
        reset();
        if (label.startsWith('as shipped')) {
          const per = (W / COLS) * (H / ROWS);
          for (let r = 0; r < ROWS; r++) {
            let line = '      |';
            for (let c = 0; c < COLS; c++) { const f = cells[r * COLS + c] / per; line += f > 0.6 ? '#' : f > 0.25 ? ':' : f > 0.02 ? '.' : ' '; }
            L.push(line + '|');
          }
        }
      }

      if (!parts) continue;
      // ---- 2. what the driver makes of the rule's parts (last: if a driver takes this badly, the pictures are already in)
      L.push('');
      L.push('2. The rule\'s parts as the driver works them out, for the first vertex of a few objects. 1 = true, 0 = false.');
      L.push('   far: beyond the fold (the distance test)   L0: not a landmark   S0: not a span   "bad" marks a line whose combined tests are not what their parts give');
      try {
        const runs: [string, () => string][] = [
          ['shipped rule', () => captureVs(OBJ_VS, false)],
          ['old rule', () => captureVs(rule(OLD), false)],
          ['old rule, hide noted', () => captureVs(rule(OLD), true)],
        ];
        const got: { label: string; caps: Capture[]; err: number; fail: string }[] = [];
        for (const [label, make] of runs) {
          const caps: Capture[] = [];
          let err = 0, fail = '';
          try {
            reset();
            Scenery.debug.prog = new Program(gl, make(), OBJ_FLAT_FS, 'objects-capture', TF);
            Scenery.debug.onRange = makeCapture(gl, caps, 3, 3);
            g.frame(performance.now(), 0);
            err = gl.getError();
          } catch (e) { fail = String(e).slice(0, 500); }
          reset();
          got.push({ label, caps, err, fail });
        }
        for (const r of got) if (r.fail || r.err) L.push(`   ${r.label}: ${r.fail ? 'RECORDING FAILED: ' + r.fail : 'GL error ' + r.err}`);
        const first = got.find((r) => r.caps.length);
        if (!first) L.push('   nothing recorded: no range of ordinary objects was drawn');
        else for (let ci = 0; ci < first.caps.length; ci++) {
          const c0 = first.caps[ci];
          L.push(`   kind ${c0.set} (type ${c0.type}: ${c0.kind})`);
          for (let i = 0; i < c0.cpu.length; i++) {
            const o = i * REC;
            L.push(`     object at s ${n2(c0.cpu[i][0])}, u ${n2(c0.cpu[i][1])}: fold limit ${n2(c0.gpu[o + 2])}, d ${n2(c0.gpu[o + 3])}`);
            for (const r of got) {
              const c = r.caps[ci];
              if (!c || c.type !== c0.type) { L.push(`       ${r.label.padEnd(21)} not recorded`); continue; }
              const G = c.gpu, b = (k: number) => n2(G[o + k]).replace('.00', '');
              const far = G[o + 12], l0 = G[o + 13], s0 = G[o + 14];
              const bad = G[o + 15] !== far * l0 * s0 || G[o + 20] !== far * l0 * s0 || G[o + 21] !== far * l0 * s0 || G[o + 16] !== l0 * far || G[o + 17] !== far * s0 || G[o + 18] !== l0 * s0
                || l0 !== (G[o + 4] === 0 ? 1 : 0) || s0 !== (G[o + 5] === 0 ? 1 : 0) || far !== (Math.abs(c.cpu[i][1]) > G[o + 2] + 1 ? 1 : 0);
              L.push(`       ${r.label.padEnd(21)} left out ${b(11)}${G[o + 8] >= 0 ? ` (before the rule ${b(8)}, after it ${b(9)}, after the landmark rules ${b(10)})` : ''}`
                + ` | landmark ${b(4)} span ${b(5)} bend ${b(6)} sky ${b(7)} | far ${b(12)} L0 ${b(13)} S0 ${b(14)} | all three: choice ${b(15)} if ${b(20)} bool ${b(21)}`
                + ` | L0&far ${b(16)} far&S0 ${b(17)} L0&S0 ${b(18)} | landmark rules: rigid ${b(19)} squeeze ${b(22)}${c.err ? ' | GL error ' + c.err : ''}${bad ? '   bad' : ''}`);
            }
          }
        }
      } catch (e) {
        reset();
        L.push('   RECORDING FAILED: ' + String(e).slice(0, 600));
      }
    }
  } catch (e) {
    L.push('');
    L.push('THE TEST STOPPED: ' + String(e) + (e instanceof Error && e.stack ? '\n' + e.stack.split('\n').slice(0, 4).join('\n') : ''));
  } finally { reset(); Program.sources.length = programs; }
  L.push('');
  L.push(`GL error after the test: ${gl.getError()}   context lost: ${gl.isContextLost() ? 'YES' : 'no'}`);
  return L.join('\n');
}
