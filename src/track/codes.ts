// Track codes: nine letters (one per slider, A=0% ... Z=100% in 4% steps) plus two digits
// encoding Type and Scenario as type*13 + scenario. Any other text is hashed into a valid code.

import { hashString, Rng } from '../core/rng';
import { SCENARIO_COUNT } from './defs';

export const SLIDERS = [
  'curves', 'sharpness', 'length', 'hills', 'steepness', 'difficulty', 'scenery', 'scatter', 'obstacles',
] as const;
export type SliderKey = (typeof SLIDERS)[number];
export const SLIDER_LABELS: Record<SliderKey, string> = {
  curves: 'Curves', sharpness: 'Sharpness', length: 'Length', hills: 'Hills', steepness: 'Steepness',
  difficulty: 'Difficulty', scenery: 'Scenery', scatter: 'Scatter', obstacles: 'Obstacles',
};

export interface TrackParams {
  curves: number; sharpness: number; length: number; hills: number; steepness: number;
  difficulty: number; scenery: number; scatter: number; obstacles: number; // 0..25
  scenario: number; // 0..12
  type: 0 | 1; // 0 = laps (circuit), 1 = stages
}

export function encodeCode(p: TrackParams): string {
  let s = '';
  for (const k of SLIDERS) s += String.fromCharCode(65 + Math.max(0, Math.min(25, Math.round(p[k]))));
  const n = p.type * SCENARIO_COUNT + p.scenario;
  return s + (n < 10 ? '0' : '') + n;
}

const CODE_RE = /^[A-Z]{9}[0-9]{2}$/;

/** Turn any text into a canonical code. Returns the code and whether the input was already one. */
export function normalizeCode(text: string): { code: string; direct: boolean } {
  const compact = (text || '').toUpperCase().replace(/[\s\-_.]/g, '');
  if (CODE_RE.test(compact)) {
    const p = decodeCanonical(compact);
    return { code: encodeCode(p), direct: true };
  }
  const src = (text || '').trim();
  const rng = new Rng(hashString('crestline-code:' + (src.length ? src : 'empty')));
  const p: TrackParams = {
    curves: 0, sharpness: 0, length: 0, hills: 0, steepness: 0, difficulty: 0, scenery: 0, scatter: 0, obstacles: 0,
    scenario: rng.int(SCENARIO_COUNT), type: rng.chance(0.5) ? 1 : 0,
  };
  for (const k of SLIDERS) {
    // gently biased towards the middle so random names give fun, playable tracks
    p[k] = Math.round((rng.float() + rng.float()) * 12.5);
  }
  return { code: encodeCode(p), direct: false };
}

function decodeCanonical(code: string): TrackParams {
  const p = {} as TrackParams;
  SLIDERS.forEach((k, i) => (p[k] = code.charCodeAt(i) - 65));
  const n = parseInt(code.slice(9, 11), 10);
  p.scenario = n % SCENARIO_COUNT;
  p.type = (Math.floor(n / SCENARIO_COUNT) % 2) as 0 | 1;
  return p;
}

export function decodeCode(text: string): TrackParams {
  return decodeCanonical(normalizeCode(text).code);
}

export const DEFAULT_CODE = 'KJGJHHMLH00';
