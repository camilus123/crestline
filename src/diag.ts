// The scenery test: a diagnostic for devices on which roadside objects (trees, buildings) are not drawn.
// Written for a phone with a PowerVR Rogue GE8320 that shows the road, the ground and the cars but none of the
// scenery, a fault that cannot be reproduced on the machines the game is developed on.
//
// Round 1 (v3.10.3) on that phone: drawing ranges of instances works; the fragment shader, the change-over
// blend and the way ranges are reached make no difference; what does get drawn is exactly the blob shadows and
// the objects that span the road. Those two do not use an object's ground height, its scale and turn, its sway
// or its bending along the road: the fault is in the vertex shader's handling of an ordinary object.
//
// Round 2 (this file):
//  1. the numbers the vertex shader itself works out for a few objects, read back by transform feedback and
//     printed beside the numbers the game gave it;
//  2. one frozen moment of two tracks with the vertex shader changed one step at a time, counting how many
//     pixels the roadside objects change in the finished picture.
// The report is text, to be copied and sent.

import type { Game } from './game';
import { GL, Mesh, Program } from './render/gl';
import { glStats } from './render/prof';
import { QUALITY } from './render/renderer';
import { OBJ_FLAT_FS, OBJ_FS, OBJ_VS, Scenery } from './render/scenery';

const TRACKS: [string, string][] = [['MIHJHHTLI12', 'Forest'], ['TUORSWWUS14', 'Futuristic']];
const STEPS = 600; // simulation steps before the frozen moment
const COLS = 48, ROWS = 12;

/** `a` must be in the shader exactly once: the variants below are edits of the shipped source, not copies of it */
function swap(src: string, a: string, b: string): string {
  if (src.split(a).length !== 2) throw new Error('shader text not found once: ' + a.slice(0, 50));
  return src.replace(a, b);
}

const HEIGHT = 'iAdj.z * foldTaper(abs(u), edge, ext) * farTaper(d)';
/** the vertex shader with one step changed (label, source) */
function variants(): [string, () => string][] {
  const noSway = (s: string) => swap(swap(s, 'if (uRotor == 1 && aAux.x > 0.95) {', 'if (false) {'), '} else if (aAux.x > 0.0) {', '} else if (false) {');
  const noBend = (s: string) => swap(s, 'if (uBend == 1 && uSpan == 0 && uSkyObj == 0) {', 'if (false) {');
  const noTurn = (s: string) => swap(s, 'float r = iSUR.z, c = cos(r), s = sin(r);', 'float r = 0.0, c = 1.0, s = 0.0;');
  const noCloud = (s: string) => swap(s, 'cloudShade(iSUR.x, u)', '1.0');
  return [
    ['as shipped', () => OBJ_VS],
    ['ground height taken as 0', () => swap(OBJ_VS, HEIGHT, '0.0')],
    ['ground height without the two tapers', () => swap(OBJ_VS, HEIGHT, 'iAdj.z')],
    ['ground height limited to -500..500 m', () => swap(OBJ_VS, HEIGHT, 'clamp(iAdj.z, -500.0, 500.0) * foldTaper(abs(u), edge, ext) * farTaper(d)')],
    ['third instance attribute not read (all zero)', () => swap(OBJ_VS, 'layout(location=6) in vec3 iAdj;', 'const vec3 iAdj = vec3(0.0);')],
    ['no sway, no rotor', () => noSway(OBJ_VS)],
    ['no bending along the road', () => noBend(OBJ_VS)],
    ['no turn about the upright axis', () => noTurn(OBJ_VS)],
    ['no scale', () => swap(OBJ_VS, 'lp *= iSHX.x;', '')],
    ['no cloud shade look-up', () => noCloud(OBJ_VS)],
    ['never left out (hide ignored)', () => swap(swap(OBJ_VS, 'vHide = hide;', 'vHide = 0.0;'), 'gl_Position = hide > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : uViewProj * vec4(w, 1.0);', 'gl_Position = uViewProj * vec4(w, 1.0);')],
    ['not left out for being beyond the fold', () => swap(OBJ_VS, 'if (uLandmark == 0 && abs(u) > ext + 1.0 && uSpan == 0) hide = 1.0;', '')],
    ['height 0, no sway, no bend, no turn, no cloud', () => noCloud(noTurn(noBend(noSway(swap(OBJ_VS, HEIGHT, '0.0')))))],
  ];
}

// ---- what the vertex shader works out, read back
const REC = 28; // floats per recorded vertex
const TF = ['dbg0', 'dbg1', 'dbg2', 'dbg3', 'dbg4', 'dbg5', 'gl_Position'];
function captureVs(): string {
  let s = swap(OBJ_VS, 'out float vFade;', 'out float vFade;\nout vec4 dbg0; out vec4 dbg1; out vec4 dbg2; out vec4 dbg3; out vec4 dbg4; out vec4 dbg5;');
  s = swap(s, '  vHide = hide;', `  dbg0 = vec4(iSUR, d);
  dbg1 = vec4(iSHX, hide);
  dbg2 = vec4(iAdj, base);
  dbg3 = vec4(u, edge, ext, p.y);
  dbg4 = vec4(w, lp.y);
  dbg5 = vec4(foldTaper(abs(u), edge, ext), farTaper(d), p.phi, o.y);
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
  L.push(`CRESTLINE v${__VERSION__} (build ${__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC) — scenery test 2, ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`);
  L.push('What the vertex shader works out for roadside objects, and what they add to the picture with that shader changed one step at a time.');
  L.push('');
  L.push('== Device ==');
  L.push(`GPU        ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}  (${dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)})`);
  L.push(`WebGL      ${gl.getParameter(gl.VERSION)}   output ${R.canvas.width}x${R.canvas.height} px   device pixel ratio ${devicePixelRatio}`);
  L.push(`browser    ${navigator.userAgent}`);
  L.push(`GL error before the test: ${gl.getError()}`);

  const reset = () => { Scenery.debug.prog = null; Scenery.debug.onRange = null; R.skipScenery = false; };
  const programs = Program.sources.length; // (the shaders made here are not the game's: kept out of its compile-time list)
  const q = QUALITY[0]; // Ultra Low: what a phone starts on, and quick
  try {
    for (const [code, name] of TRACKS) {
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

      // ---- 1. the picture, one step of the shader changed at a time
      L.push('');
      L.push('1. Share of the picture the roadside objects change, against the same frame without them.');
      reset();
      R.skipScenery = true;
      const base = shot();
      for (const [label, make] of variants()) {
        reset();
        let note = '';
        const cells = new Float32Array(COLS * ROWS);
        let n = 0;
        try {
          if (label !== 'as shipped') Scenery.debug.prog = new Program(gl, make(), OBJ_FS, 'objects-variant');
          const img = shot();
          const err = gl.getError();
          if (err) note = `   GL error ${err}`;
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
        if (label === 'as shipped' || n / (W * H) > 0.05) {
          const per = (W / COLS) * (H / ROWS);
          for (let r = 0; r < ROWS; r++) {
            let line = '      |';
            for (let c = 0; c < COLS; c++) { const f = cells[r * COLS + c] / per; line += f > 0.6 ? '#' : f > 0.25 ? ':' : f > 0.02 ? '.' : ' '; }
            L.push(line + '|');
          }
        }
      }

      // ---- 2. the vertex shader's own numbers, read back (last: if a driver takes this badly, the pictures are already in)
      L.push('');
      L.push('2. What the vertex shader works out (first vertex of a few objects of up to three kinds). "given" is what the game put in the buffer.');
      try {
        const caps: Capture[] = [];
        reset();
        Scenery.debug.prog = new Program(gl, captureVs(), OBJ_FLAT_FS, 'objects-capture', TF);
        Scenery.debug.onRange = makeCapture(gl, caps, 3, 4);
        g.frame(performance.now(), 0);
        const e = gl.getError();
        reset();
        if (!caps.length) L.push('   nothing recorded: no range of ordinary objects was drawn');
        for (const c of caps) {
          L.push(`   kind ${c.set} (type ${c.type}: ${c.kind}), instances from ${c.first}${c.err ? '   GL error ' + c.err : ''}`);
          for (let i = 0; i < c.cpu.length; i++) {
            const o = i * REC, G = c.gpu;
            L.push(`     given   s,u,turn ${row(c.cpu[i], 0, 3)} | scale,hue,rnd ${row(c.cpu[i], 3, 3)} | third ${row(c.cpu[i], 6, 3)}`);
            L.push(`     shader  s,u,turn ${row(G, o, 3)} | scale,hue,rnd ${row(G, o + 4, 3)} | third ${row(G, o + 8, 3)}`);
            L.push(`             d ${n2(G[o + 3])}  hide ${n2(G[o + 7])}  height ${n2(G[o + 11])}  u,edge,ext ${row(G, o + 12, 3)}  road y ${n2(G[o + 15])}  tapers ${row(G, o + 20, 2)}  phi ${n2(G[o + 22])}  base y ${n2(G[o + 23])}`);
            L.push(`             world ${row(G, o + 16, 3)}  local y ${n2(G[o + 19])}  clip ${row(G, o + 24, 4)}`);
          }
        }
        if (e) L.push(`   GL error after recording: ${e}`);
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
