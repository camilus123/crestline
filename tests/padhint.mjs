// The key hints at the bottom of the menus: no gamepad button is named without a gamepad; with one connected the
// hints say "PAD A" / "PAD B", and those buttons confirm and go back.
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(root + '/')('playwright');
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await br.newPage({ viewport: { width: 320, height: 180 } }); p.setDefaultTimeout(120000);
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.addInitScript(() => {
  // a gamepad that can be plugged in and whose buttons can be pressed from the test
  window.__pad = null;
  navigator.getGamepads = () => [window.__pad];
  window.__plug = () => { window.__pad = { index: 0, connected: true, id: 'test pad', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; };
  window.__press = (i, down) => { window.__pad.buttons[i] = { pressed: down, value: down ? 1 : 0 }; };
});
await p.goto('file://' + path.join(root, 'dist/crestline.html') + '?screen=settings&q=0', { waitUntil: 'commit' });
await p.waitForSelector('.hint');
await p.waitForTimeout(1500);
const visibleHint = () => p.evaluate(() => { const e = [...document.querySelectorAll('.hint')].find((x) => x.offsetParent); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; });
const without = await visibleHint();
await p.evaluate(() => window.__plug());
await p.waitForFunction(() => document.body.classList.contains('haspad'));
const withPad = await visibleHint();
// PAD B (button 1) goes back from Settings; then PAD A (button 0) confirms whatever has the focus
const scr0 = await p.evaluate(() => window.__crest.screenId);
await p.evaluate(() => window.__press(1, true)); await p.waitForTimeout(2500); await p.evaluate(() => window.__press(1, false));
await p.waitForTimeout(1500);
const scr1 = await p.evaluate(() => window.__crest.screenId);
await p.evaluate(() => window.__press(0, true)); await p.waitForTimeout(2500); await p.evaluate(() => window.__press(0, false));
await p.waitForTimeout(1500);
const scr2 = await p.evaluate(() => window.__crest.screenId);
// keyboard A and B do nothing in a menu
await p.keyboard.press('KeyB'); await p.keyboard.press('KeyA'); await p.waitForTimeout(1500);
const scr3 = await p.evaluate(() => window.__crest.screenId);
console.log(JSON.stringify({ without, withPad, screens: [scr0, scr1, scr2, scr3], errors }));
await br.close();
const ok = !/PAD|\/ A|\/ B/.test(without) && /ENTER CONFIRM/i.test(without) && /ENTER \/ PAD A CONFIRM/i.test(withPad) && /ESC \/ PAD B BACK/i.test(withPad)
  && scr0 === 'settings' && scr1 !== 'settings' && scr2 !== scr1 && scr3 === scr2 && !errors.length;
if (!ok) { console.log('FAILED'); process.exit(1); }
