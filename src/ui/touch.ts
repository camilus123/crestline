// On-screen touch controls for touch-screen devices: steering on the left thumb, accelerate / brake on
// the right, plus gear buttons (manual gearbox) and pause. Shown during a race whenever touch is the
// input in use (from the start on touch-first devices, or after the first touch on a PC with a touch screen).

import type { Action, Input } from '../input';
import { h } from './dom';

type Zone = 'left' | 'right' | 'accel' | 'brake' | 'gearUp' | 'gearDown' | 'pause';

export class TouchControls {
  readonly el: HTMLDivElement;
  /** true when touch is the input in use (cleared by keyboard or gamepad use) */
  active: boolean;
  private btn = new Map<Zone, HTMLElement>();
  private ptr = new Map<number, Zone | null>();
  private shown = false;
  private manual: boolean | null = null;

  constructor(private input: Input, private onPause: () => void) {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.active = coarse && navigator.maxTouchPoints > 0;
    const b = (z: Zone, cls: string, label: string) => {
      const e = h('div', { class: 'tc-btn ' + cls }, h('span', {}, label));
      this.btn.set(z, e);
      return e;
    };
    this.el = h('div', { class: 'touch' },
      b('left', 'tc-left', '◀'), b('right', 'tc-right', '▶'),
      b('brake', 'tc-brake', 'BRAKE'), b('accel', 'tc-accel', 'GAS'),
      b('gearDown', 'tc-gdn', '▼'), b('gearUp', 'tc-gup', '▲'),
      b('pause', 'tc-pause', 'II'),
      h('div', { class: 'tc-rotate' }, 'Turn your device sideways'),
    );
    this.el.style.display = 'none';
    document.body.appendChild(this.el);

    // which control a point is on: generous zones around the buttons, so a thumb never falls between them
    const zoneAt = (x: number, y: number): Zone | null => {
      const W = innerWidth, H = innerHeight;
      for (const z of ['pause', 'gearUp', 'gearDown'] as Zone[]) {
        const e = this.btn.get(z)!;
        if (e.style.display === 'none') continue;
        const r = e.getBoundingClientRect();
        const pad = 10;
        if (x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad) return z;
      }
      if (y < H * 0.3) return null;
      if (x < W * 0.4) return x < W * 0.2 ? 'left' : 'right';
      if (x > W * 0.6) return x > W * 0.8 ? 'accel' : 'brake';
      return null;
    };
    const update = () => {
      const on = new Set(this.ptr.values());
      const t = this.input.touch;
      for (const z of ['left', 'right', 'accel', 'brake', 'gearUp', 'gearDown'] as Action[]) t[z] = on.has(z as Zone) ? 1 : 0;
      for (const [z, e] of this.btn) e.classList.toggle('on', on.has(z));
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      const z = zoneAt(e.clientX, e.clientY);
      this.ptr.set(e.pointerId, z);
      if (z === 'pause') this.onPause();
      if (z === 'gearUp' || z === 'gearDown') navigator.vibrate?.(10);
      update();
    };
    const move = (e: PointerEvent) => {
      if (!this.ptr.has(e.pointerId)) return;
      e.preventDefault();
      const z = zoneAt(e.clientX, e.clientY);
      const was = this.ptr.get(e.pointerId);
      // sliding between steering or pedal zones follows the thumb; buttons stay put once pressed
      if (z !== was && (z === 'left' || z === 'right' || z === 'accel' || z === 'brake' || z === null) && was !== 'pause') this.ptr.set(e.pointerId, z);
      update();
    };
    const up = (e: PointerEvent) => {
      if (!this.ptr.delete(e.pointerId)) return;
      update();
    };
    this.el.addEventListener('pointerdown', down, { passive: false });
    this.el.addEventListener('pointermove', move, { passive: false });
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
    this.el.addEventListener('lostpointercapture', up);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());

    // touch anywhere marks touch as the input in use; keyboard or pad use hides the controls again
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') this.active = true; }, true);
    window.addEventListener('keydown', () => { this.active = false; }, true);
  }

  /** called every frame */
  update(inRace: boolean, manual: boolean, padInUse: boolean): void {
    if (padInUse) this.active = false;
    const show = inRace && this.active;
    if (show !== this.shown) {
      this.shown = show;
      this.el.style.display = show ? '' : 'none';
      document.body.classList.toggle('touchui', show);
      if (!show) this.release();
    }
    if (manual !== this.manual) {
      this.manual = manual;
      this.btn.get('gearUp')!.style.display = manual ? '' : 'none';
      this.btn.get('gearDown')!.style.display = manual ? '' : 'none';
    }
  }

  /** lift every finger (screen change, pause) */
  release(): void {
    this.ptr.clear();
    const t = this.input.touch;
    for (const k of Object.keys(t)) t[k as Action] = 0;
    for (const e of this.btn.values()) e.classList.remove('on');
  }
}
