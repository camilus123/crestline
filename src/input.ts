// Keyboard + Gamepad input with per-player bindings, analogue steering/throttle and menu navigation.

import { CarInput } from './sim/car';

export type Action = 'left' | 'right' | 'up' | 'down' | 'accel' | 'brake' | 'gearUp' | 'gearDown' | 'pause';
export const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'accel', 'brake', 'gearUp', 'gearDown', 'pause'];
export const ACTION_LABELS: Record<Action, string> = {
  left: 'Steer left', right: 'Steer right', up: 'Up (accelerate in Up mode)', down: 'Down (brake)', accel: 'Accelerate button',
  brake: 'Brake button', gearUp: 'Gear up', gearDown: 'Gear down', pause: 'Pause',
};

/** binding: keyboard code ("KeyA") or gamepad ("pad:b0" button, "pad:a1-" axis negative) */
export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings[] = [
  {
    left: ['ArrowLeft', 'pad:b14', 'pad:a0-'], right: ['ArrowRight', 'pad:b15', 'pad:a0+'], up: ['ArrowUp', 'pad:b12'], down: ['ArrowDown', 'pad:b13'],
    accel: ['Space', 'Numpad0', 'pad:b0', 'pad:b7'], brake: ['pad:b6', 'pad:b2'], gearUp: ['ShiftRight', 'KeyX', 'pad:b5', 'pad:b3'], gearDown: ['ControlRight', 'KeyZ', 'pad:b4', 'pad:b1'],
    pause: ['Escape', 'KeyP', 'pad:b9'],
  },
  {
    left: ['KeyA', 'pad:b14', 'pad:a0-'], right: ['KeyD', 'pad:b15', 'pad:a0+'], up: ['KeyW', 'pad:b12'], down: ['KeyS', 'pad:b13'],
    accel: ['ShiftLeft', 'pad:b0', 'pad:b7'], brake: ['pad:b6', 'pad:b2'], gearUp: ['KeyE', 'pad:b5', 'pad:b3'], gearDown: ['KeyQ', 'pad:b4', 'pad:b1'],
    pause: ['Escape', 'pad:b9'],
  },
];

export interface PlayerControl {
  manual: boolean;
  accelButton: boolean;
}

const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'PageUp', 'PageDown', 'Home', 'End', 'Backspace']);

export type MenuKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'tab';

export class Input {
  keys = new Set<string>();
  private prevKeys = new Set<string>();
  bindings: Bindings[] = [structuredClone(DEFAULT_BINDINGS[0]), structuredClone(DEFAULT_BINDINGS[1])];
  pads: (Gamepad | null)[] = [];
  /** which gamepad index each player uses (-1 none) */
  padOf = [-1, -1];
  private padPrev: boolean[][] = [];
  private padAxPrev: number[][] = [];
  menuQueue: MenuKey[] = [];
  private repeatT = new Map<string, number>();
  listening: ((code: string) => void) | null = null;
  typing = false;
  anyInput = false;
  onFirstInput: (() => void) | null = null;
  onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.first();
      if (this.typing) {
        if (e.code === 'Escape' || e.code === 'Enter') this.menuQueue.push(e.code === 'Enter' ? 'ok' : 'back');
        return;
      }
      if (BLOCK.has(e.code) || e.code.startsWith('F') === false && e.code === 'Tab') e.preventDefault();
      if (this.listening) {
        e.preventDefault();
        const l = this.listening;
        this.listening = null;
        l(e.code);
        return;
      }
      if (!e.repeat) this.keys.add(e.code);
      this.onKey?.(e);
      const m = menuFromKey(e.code);
      // a held Esc (e.g. holding it to leave fullscreen) is one 'back', not a stream of them
      if (m && !(m === 'back' && e.repeat)) this.menuQueue.push(m);
    }, { passive: false });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (BLOCK.has(e.code)) e.preventDefault();
    });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', () => this.first());
    window.addEventListener('gamepadconnected', () => this.assignPads());
    window.addEventListener('gamepaddisconnected', () => this.assignPads());
  }
  private first(): void {
    if (!this.anyInput) {
      this.anyInput = true;
      this.onFirstInput?.();
    }
  }
  players = 1;
  assignPads(): void {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    const conn = pads.filter((p) => p && p.connected).map((p) => p!.index);
    // two players and a single pad: player 1 keeps the keyboard, the pad goes to player 2
    if (this.players > 1 && conn.length === 1) this.padOf = [-1, conn[0]];
    else this.padOf = [conn[0] ?? -1, conn[1] ?? -1];
  }

  /** poll gamepads once per frame; generates menu events from pads */
  poll(dt: number): void {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    this.pads = pads;
    if (pads.some((p) => p && p.connected) && this.padOf[0] < 0) this.assignPads();
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const prev = this.padPrev[p.index] || [];
      const pressed = p.buttons.map((b) => b.pressed || b.value > 0.5);
      if (pressed.some((b, i) => b && !prev[i])) this.first();
      if (this.listening) {
        const i = pressed.findIndex((b, k) => b && !prev[k]);
        if (i >= 0) {
          const l = this.listening;
          this.listening = null;
          l('pad:b' + i);
        }
        for (let a = 0; a < p.axes.length; a++) {
          const v = p.axes[a];
          const pv = (this.padAxPrev[p.index] || [])[a] || 0;
          if (Math.abs(v) > 0.7 && Math.abs(pv) <= 0.7 && this.listening) {
            const l = this.listening;
            this.listening = null;
            l('pad:a' + a + (v > 0 ? '+' : '-'));
          }
        }
      } else {
        const btn = (i: number, m: MenuKey) => {
          if (pressed[i] && !prev[i]) this.menuQueue.push(m);
        };
        btn(12, 'up'); btn(13, 'down'); btn(14, 'left'); btn(15, 'right'); btn(0, 'ok'); btn(1, 'back'); btn(9, 'back');
        btn(4, 'tab');
        // stick with repeat
        const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
        this.stickRepeat(p.index + 'x', ax, 'left', 'right', dt);
        this.stickRepeat(p.index + 'y', ay, 'up', 'down', dt);
      }
      this.padPrev[p.index] = pressed;
      this.padAxPrev[p.index] = Array.from(p.axes);
    }
    // keyboard held repeat for menus
    for (const [code, m] of [['ArrowUp', 'up'], ['ArrowDown', 'down'], ['ArrowLeft', 'left'], ['ArrowRight', 'right']] as [string, MenuKey][]) {
      if (this.keys.has(code)) {
        const t = (this.repeatT.get(code) ?? 0.42) - dt;
        if (t <= 0) {
          this.menuQueue.push(m);
          this.repeatT.set(code, 0.07);
        } else this.repeatT.set(code, t);
      } else this.repeatT.delete(code);
    }
    this.prevKeys = new Set(this.keys);
  }
  private stickRepeat(id: string, v: number, neg: MenuKey, pos: MenuKey, dt: number): void {
    const key = 'stick' + id;
    if (Math.abs(v) > 0.6) {
      const t = this.repeatT.get(key);
      if (t === undefined) {
        this.menuQueue.push(v < 0 ? neg : pos);
        this.repeatT.set(key, 0.4);
      } else if (t - dt <= 0) {
        this.menuQueue.push(v < 0 ? neg : pos);
        this.repeatT.set(key, 0.09);
      } else this.repeatT.set(key, t - dt);
    } else this.repeatT.delete(key);
  }
  takeMenu(): MenuKey[] {
    const q = this.menuQueue;
    this.menuQueue = [];
    return q;
  }

  /** analogue value 0..1 of one binding */
  private value(b: string, player: number): number {
    if (!b.startsWith('pad:')) return this.keys.has(b) ? 1 : 0;
    const pi = this.padOf[player];
    if (pi < 0) return 0;
    const p = this.pads[pi];
    if (!p || !p.connected) return 0;
    if (b[4] === 'b') {
      const btn = p.buttons[+b.slice(5)];
      return btn ? Math.max(btn.value, btn.pressed ? 1 : 0) : 0;
    }
    const m = /^pad:a(\d+)([+-])$/.exec(b);
    if (!m) return 0;
    const v = p.axes[+m[1]] || 0;
    const dz = 0.14;
    const s = m[2] === '+' ? v : -v;
    return s > dz ? Math.min(1, (s - dz) / (1 - dz)) : 0;
  }
  act(a: Action, player: number): number {
    let v = 0;
    for (const b of this.bindings[player][a]) v = Math.max(v, this.value(b, player));
    return v;
  }
  private isAnalog(a: Action, player: number): boolean {
    for (const b of this.bindings[player][a]) if (b.startsWith('pad:a') && this.value(b, player) > 0) return true;
    for (const b of this.bindings[player][a]) if (b.startsWith('pad:b') && this.value(b, player) > 0 && this.value(b, player) < 0.99) return true;
    return false;
  }
  private edges = [new Map<Action, boolean>(), new Map<Action, boolean>()];
  /** edge-triggered action (true once per press) */
  pressed(a: Action, player: number): boolean {
    const v = this.act(a, player) > 0.5;
    const m = this.edges[player];
    const was = m.get(a) ?? false;
    m.set(a, v);
    return v && !was;
  }

  carInput(player: number, ctl: PlayerControl): CarInput {
    const L = this.act('left', player), R = this.act('right', player);
    const analog = this.isAnalog('left', player) || this.isAnalog('right', player);
    const steer = R - L;
    const up = this.act('up', player), down = this.act('down', player);
    const accelBtn = this.act('accel', player);
    const brakeBtn = this.act('brake', player);
    let throttle: number, brake: number;
    let shiftUp = this.pressed('gearUp', player), shiftDown = this.pressed('gearDown', player);
    const upEdge = this.pressed('up', player);
    const downEdge = this.pressed('down', player);
    if (ctl.accelButton) {
      throttle = accelBtn;
      brake = Math.max(down, brakeBtn);
      if (ctl.manual && upEdge) shiftUp = true;
      void downEdge;
    } else {
      throttle = Math.max(up, accelBtn);
      brake = Math.max(down, brakeBtn);
    }
    return { steer: Math.max(-1, Math.min(1, steer)), throttle, brake, shiftUp, shiftDown, digitalSteer: !analog };
  }

  describe(b: string): string {
    if (!b.startsWith('pad:')) return b.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '').replace('Numpad', 'Num ');
    if (b[4] === 'b') return ['Pad A', 'Pad B', 'Pad X', 'Pad Y', 'Pad LB', 'Pad RB', 'Pad LT', 'Pad RT', 'Pad Back', 'Pad Start', 'Pad LS', 'Pad RS', 'Pad Up', 'Pad Down', 'Pad Left', 'Pad Right'][+b.slice(5)] ?? 'Pad ' + b.slice(5);
    const m = /^pad:a(\d+)([+-])$/.exec(b);
    if (m) return ['Stick X', 'Stick Y', 'R-Stick X', 'R-Stick Y'][+m[1]] + (m[2] === '+' ? '+' : '−');
    return b;
  }
}

function menuFromKey(code: string): MenuKey | null {
  switch (code) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'Enter': case 'NumpadEnter': case 'Space': return 'ok';
    case 'Escape': case 'Backspace': return 'back';
    case 'Tab': return 'tab';
  }
  return null;
}
