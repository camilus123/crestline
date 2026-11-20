// The scenery test: a diagnostic for devices on which roadside objects (trees, buildings) are not drawn.
// It was written for a phone with a PowerVR GPU that showed the road, the ground and the cars but none of the
// scenery, a fault that cannot be reproduced on the machines the game is developed on. The test draws one frozen
// moment of two tracks several ways and counts, for each, how many pixels the scenery changes in the finished
// picture; and it tries the one GL feature the scenery leans on that nothing else in the frame does (drawing a
// range of instances that starts part-way into an instance buffer) on its own, away from the game's shaders.
// The report is text, to be copied and sent.

import type { Game } from './game';
import { GL, Mesh, Program, Target } from './render/gl';
import { glStats } from './render/prof';
import { QUALITY } from './render/renderer';
import { Scenery } from './render/scenery';

const TRACKS: [string, string][] = [['MIHJHHTLI12', 'Forest'], ['TUORSWWUS14', 'Futuristic']];
const PRESETS = [0, 1]; // Ultra Low, Low
const STEPS = 600; // simulation steps before the frozen moment (well away from the first instances of the track)

interface Variant { label: string; set: () => void }

// ---- part 1: instanced ranges on their own
const I_VS = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=4) in vec3 iA; // x: which of the eight cells this instance fills
layout(location=5) in vec3 iB; // its colour
out vec3 vC;
void main(){ vC = iB; gl_Position = vec4((iA.x + 0.5 + aPos.x * 0.4) / 4.0 - 1.0, aPos.y * 0.8, 0.0, 1.0); }`;
const I_FS = `#version 300 es
precision highp float;
in vec3 vC; out vec4 o;
void main(){ o = vec4(vC, 1.0); }`;

/** eight instances, each filling one cell of a strip in its own colour; returns what each cell shows per case */
function instanceTest(gl: GL): string[] {
  const out: string[] = [];
  const p = new Program(gl, I_VS, I_FS, 'diag-instances');
  const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
  const inst = new Float32Array(8 * 9);
  for (let k = 0; k < 8; k++) inst.set([k, 0, 0, (k + 1) / 8, 0.5, 0, 0, 0, 0], k * 9);
  const spec = [{ loc: 4, size: 3, type: gl.FLOAT, offset: 0 }, { loc: 5, size: 3, type: gl.FLOAT, offset: 12 }, { loc: 6, size: 3, type: gl.FLOAT, offset: 24 }];
  const mk = () => new Mesh(gl, quad, 8, [{ loc: 0, size: 2, type: gl.FLOAT, offset: 0 }], 6);
  const a = mk(), b = mk();
  a.setInstances(inst, 36, spec);
  b.shareInstances(a);
  const t = new Target(gl, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, false);
  t.resize(64, 8);
  const px = new Uint8Array(64 * 8 * 4);
  const run = (label: string, mesh: Mesh, mode: 'offset' | 'copy', first: number, n: number) => {
    t.bind();
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    p.use();
    Mesh.rangeMode = mode;
    mesh.drawInstances(first, n);
    Mesh.rangeMode = 'offset';
    gl.readPixels(0, 0, 64, 8, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let got = '', want = '';
    for (let k = 0; k < 8; k++) {
      const i = (4 * 64 + k * 8 + 4) * 4;
      // the colour says which instance was drawn there
      got += px[i + 3] < 128 ? '.' : String(Math.round((px[i] / 255) * 8) - 1);
      want += k >= first && k < first + n ? String(k) : '.';
    }
    const err = gl.getError();
    out.push(`${label.padEnd(58)} ${got}   expected ${want}   ${got === want ? 'ok' : 'WRONG'}${err ? '   GL error ' + err : ''}`);
  };
  run('all eight, from the first', a, 'offset', 0, 8);
  run('instances 4 to 7, pointers moved into the buffer', a, 'offset', 4, 4);
  run('instances 0 to 3 again, pointers moved back', a, 'offset', 0, 4);
  run('instances 2 to 4, pointers moved', a, 'offset', 2, 3);
  run('instances 4 to 7, a second mesh sharing the buffer', b, 'offset', 4, 4);
  run('instances 4 to 7, copied to a buffer of their own', a, 'copy', 4, 4);
  run('instances 2 to 4, copied', a, 'copy', 2, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindVertexArray(null);
  t.dispose();
  return out;
}

// ---- part 2: the game's own frame
const COLS = 48, ROWS = 12;

export async function sceneryTest(g: Game, say: (s: string) => void): Promise<string> {
  const R = g.renderer, gl = R.gl;
  const L: string[] = [];
  const tick = () => new Promise<void>((r) => setTimeout(r, 30));
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const fmt = (t: number) => { const f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, t); return f ? `${f.precision} bits` : '?'; };
  L.push(`CRESTLINE v${__VERSION__} (build ${__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC) — scenery test, ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`);
  L.push('What roadside objects (trees, buildings) add to the picture when drawn several ways. For a device that does not show them.');
  L.push('');
  L.push('== Device ==');
  L.push(`GPU        ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}  (${dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)})`);
  L.push(`WebGL      ${gl.getParameter(gl.VERSION)}   shading language ${gl.getParameter(gl.SHADING_LANGUAGE_VERSION)}`);
  L.push(`output     ${R.canvas.width}x${R.canvas.height} px   device pixel ratio ${devicePixelRatio}   HDR targets ${R.hdr ? 'yes' : 'no'}`);
  L.push(`limits     vertex attributes ${gl.getParameter(gl.MAX_VERTEX_ATTRIBS)}   vertex uniform vectors ${gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)}   fragment uniform vectors ${gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)}   varying vectors ${gl.getParameter(gl.MAX_VARYING_VECTORS)}   element index ${gl.getParameter(gl.MAX_ELEMENT_INDEX)}`);
  L.push(`precision  fragment shader floats: high ${fmt(gl.HIGH_FLOAT)}, medium ${fmt(gl.MEDIUM_FLOAT)}`);
  L.push(`browser    ${navigator.userAgent}`);
  L.push(`GL error before the test: ${gl.getError()}`);
  L.push('');
  L.push('== 1. Ranges of instances, away from the game\'s shaders ==');
  L.push('Eight squares in a row, each one instance with its own colour. Each line shows which instance each of the eight places shows.');
  say('Scenery test: instance ranges');
  await tick();
  try { L.push(...instanceTest(gl)); } catch (e) { L.push('FAILED: ' + String(e)); }

  const variants: Variant[] = [
    { label: 'as shipped', set: () => {} },
    { label: 'no change-over blend between near and far models', set: () => { R.pic = { ...R.pic, dissolve: false }; } },
    { label: 'plain-colour fragment shader', set: () => { Scenery.debug.flat = true; } },
    { label: 'every object from the first, no ranges, no far models', set: () => { Scenery.debug.all = true; } },
    { label: 'ranges copied to a buffer of their own', set: () => { Mesh.rangeMode = 'copy'; } },
    { label: 'ranges copied + plain-colour shader', set: () => { Mesh.rangeMode = 'copy'; Scenery.debug.flat = true; } },
    { label: 'every object from the first + plain-colour shader', set: () => { Scenery.debug.all = true; Scenery.debug.flat = true; } },
  ];
  const pic0 = R.pic;
  const reset = () => { R.pic = pic0; Scenery.debug.flat = false; Scenery.debug.all = false; Mesh.rangeMode = 'offset'; R.skipScenery = false; };
  L.push('');
  L.push('== 2. The game\'s own frame ==');
  L.push('One frozen moment per track and preset. "pixels" = share of the picture that differs from the same frame drawn without roadside objects.');
  L.push(`The small pictures: where those pixels are (${COLS}x${ROWS} cells; blank none, . some, : a quarter, # most).`);
  try {
    for (const [code, name] of TRACKS) {
      for (const qi of PRESETS) {
        const q = QUALITY[qi];
        say(`Scenery test: ${name}, ${q.name}`);
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
        reset();
        R.skipScenery = true;
        const base = shot();
        const calls0 = glStats.calls;
        L.push('');
        L.push(`${name}, ${q.name}: picture ${W}x${H}, drawn at ${R.renderW}x${R.renderH}; without roadside objects ${calls0} draw calls`);
        for (const v of variants) {
          reset();
          v.set();
          const e0 = gl.getError();
          const img = shot();
          const s2 = { calls: glStats.calls, instances: glStats.instances };
          const err = gl.getError();
          const cells = new Float32Array(COLS * ROWS);
          let n = 0;
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
          L.push(`  ${v.label.padEnd(54)} pixels ${((n / (W * H)) * 100).toFixed(1).padStart(5)} %   draw calls ${String(s2.calls).padStart(4)}, instances ${String(s2.instances).padStart(6)}${err || e0 ? `   GL error ${e0 || err}` : ''}`);
          if (v.label === 'as shipped' || v.label.startsWith('every object from the first, ') || v.label === 'ranges copied to a buffer of their own') {
            const per = (W / COLS) * (H / ROWS);
            for (let r = 0; r < ROWS; r++) {
              let row = '      |';
              for (let c = 0; c < COLS; c++) { const f = cells[r * COLS + c] / per; row += f > 0.6 ? '#' : f > 0.25 ? ':' : f > 0.02 ? '.' : ' '; }
              L.push(row + '|');
            }
          }
        }
        reset();
      }
    }
  } catch (e) {
    L.push('');
    L.push('THE TEST STOPPED: ' + String(e) + (e instanceof Error && e.stack ? '\n' + e.stack.split('\n').slice(0, 4).join('\n') : ''));
  } finally { reset(); }
  L.push('');
  L.push(`GL error after the test: ${gl.getError()}   context lost: ${gl.isContextLost() ? 'YES' : 'no'}`);
  return L.join('\n');
}
