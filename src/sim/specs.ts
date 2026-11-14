// Fictional car specifications. Handling numbers are the heart of the game feel.

export interface CarSpec {
  id: number;
  make: string;
  model: string;
  blurb: string;
  mass: number; // kg
  power: number; // W at redline
  vTop: number; // m/s
  gears: number[]; // overall ratios (gear * final)
  redline: number;
  idle: number;
  wheelR: number;
  sMax: number; // max lateral speed from steering (m/s)
  grip: number; // lateral grip (m/s^2) used for the bend-push constant
  response: number; // lateral response rate (1/s)
  brake: number; // m/s^2
  traction: number; // longitudinal traction (g)
  steerRate: number; // keyboard steering ramp (1/s)
  // derived
  cd: number;
  tMax: number;
  kPush: number; // bend push constant: lateral m/s per (m/s^2) of cornering demand
  cylinders: number;
  stats: { speed: number; accel: number; handling: number };
}

const G = 9.81;
const CRR = 0.012;

function make(o: Omit<CarSpec, 'gears' | 'cd' | 'tMax' | 'kPush'> & { gearCount: number; firstFrac: number }): CarSpec {
  const omegaRed = (o.redline * 2 * Math.PI) / 60;
  // top gear reaches vTop exactly at redline
  const topRatio = (omegaRed * o.wheelR) / o.vTop;
  const gears: number[] = [];
  for (let g = 0; g < o.gearCount; g++) {
    const f = Math.pow(o.firstFrac, 1 - g / (o.gearCount - 1));
    // slightly closer ratios towards the top
    const v = o.vTop * Math.pow(f, 0.92);
    gears.push((omegaRed * o.wheelR) / v);
  }
  gears[o.gearCount - 1] = topRatio;
  const eta = 0.9;
  const cd = (o.power * eta / o.vTop - CRR * o.mass * G) / (o.vTop * o.vTop);
  const tMax = o.power / (0.97 * omegaRed);
  const { gearCount, firstFrac, ...rest } = o;
  void gearCount; void firstFrac;
  return { ...rest, gears, cd, tMax, kPush: o.sMax / o.grip };
}

export const CARS: CarSpec[] = [
  make({
    id: 0, make: 'Vantor', model: 'Stiletto GT', blurb: 'Wedge-shaped V12 supercar. Brutal top speed, heavy at the front.',
    mass: 1360, power: 412000, vTop: 302 / 3.6, gearCount: 6, firstFrac: 0.3, redline: 7800, idle: 900, wheelR: 0.34,
    sMax: 9.7, grip: 15.6, response: 7.2, brake: 10.8, traction: 1.05, steerRate: 4.2, cylinders: 12,
    stats: { speed: 1, accel: 0.78, handling: 0.62 },
  }),
  make({
    id: 1, make: 'Kestrel', model: 'Sprite R', blurb: 'Featherweight roadster. Instant response, lower top speed.',
    mass: 960, power: 236000, vTop: 262 / 3.6, gearCount: 5, firstFrac: 0.34, redline: 8800, idle: 1000, wheelR: 0.31,
    sMax: 11.4, grip: 17.8, response: 11.5, brake: 11.8, traction: 1.12, steerRate: 5.6, cylinders: 4,
    stats: { speed: 0.72, accel: 0.86, handling: 1 },
  }),
  make({
    id: 2, make: 'Axiom', model: 'Halo X', blurb: 'Turbine-hybrid concept car. Balanced, eager and precise.',
    mass: 1210, power: 348000, vTop: 288 / 3.6, gearCount: 6, firstFrac: 0.31, redline: 9400, idle: 1100, wheelR: 0.33,
    sMax: 10.4, grip: 16.6, response: 9.2, brake: 11.2, traction: 1.08, steerRate: 4.9, cylinders: 8,
    stats: { speed: 0.88, accel: 0.9, handling: 0.82 },
  }),
];

/** Normalised torque curve: t(n), n = rpm/redline. Power n*t(n) rises to the redline, so the
 *  fastest manual technique is shifting just before the limiter. */
export function torqueCurve(n: number): number {
  const x = Math.max(0.12, Math.min(1.05, n));
  return 0.62 + 0.9 * x - 0.55 * x * x;
}
