// Frame orchestration: per-view bent path, chase camera, all scene passes and post-processing.

import { Car, EV_CRASH, EV_LAND, EV_LASER, EV_SCRAPE, EV_SHUNT, Spray } from '../sim/car';
import { Race, TrafficCar } from '../sim/race';
import { LIVERIES } from '../sim/roster';
import { Hz, Scn } from '../track/defs';
import { TrackData } from '../track/generator';
import { gustWarning, hazardActive, laserWarning, Track } from '../track/track';
import { CarDraw, CarRenderer } from './cars';
import { FX, PT } from './fx';
import { createTexture, GL, Mesh, MSTarget, perspective, Program, Target, viewFromBasis, mul4, invert4, ortho, SHADOW_UNIT, SHADOW_UNIT2 } from './gl';
import { Ground, ROWS } from './ground';
import { HazardRenderer } from './hazards';
import { Look, LOOKS } from './looks';
import { buildTraffic } from './models';
import { BentPath, PATH_N, PATH_STEP } from './path';
import { Terrain } from './terrain';
import { Post, PostParams } from './post';
import { Scenery } from './scenery';
import { Sky } from './sky';
import { MaterialTextures } from './textures';

export interface Quality {
  name: string;
  scale: number; // render resolution (fraction of the output)
  minScale: number; // dynamic resolution never goes below this
  msaa: number; // samples (clamped to what the GPU supports)
  bloom: number; // bloom levels (0 = no bloom)
  dist: number; // draw distance factor
  particles: number;
  weather: number;
  scenery: number; // fraction of roadside objects drawn (small clutter thinned first)
  woods: number; // deep Forest woodland draw distance factor (0 = off)
  lamps: number; // street lamps that light the scene
  lite: boolean; // cheap post-processing (no speed blur, heat haze or lens rain)
  shadows: number; // sun shadow map size in texels (0 = blob shadows only)
  ssao: boolean; // screen-space ambient occlusion
  dpr: number; // device-pixel-ratio cap for the 3D view (phones: fewer pixels, the HUD stays sharp)
  lod: number; // metres ahead beyond which trees, bushes and rocks are drawn with their lighter models
  terrLite: boolean; // terrain mesh with about 40 % of the vertices
  cap60: boolean; // the resolution scaler aims for 60 fps even on a faster screen (a 120 Hz phone)
}
export const QUALITY: Quality[] = [
  { name: 'Ultra Low', scale: 0.75, minScale: 0.5, msaa: 0, bloom: 0, dist: 0.36, particles: 0.25, weather: 0.3, scenery: 0.5, woods: 0, lamps: 4, lite: true, shadows: 0, ssao: false, dpr: 1, lod: 40, terrLite: true, cap60: true },
  { name: 'Low', scale: 0.8, minScale: 0.4, msaa: 0, bloom: 3, dist: 0.6, particles: 0.4, weather: 0.4, scenery: 0.8, woods: 0.4, lamps: 6, lite: true, shadows: 0, ssao: false, dpr: 1.25, lod: 70, terrLite: true, cap60: true },
  { name: 'Medium', scale: 0.8, minScale: 0.5, msaa: 2, bloom: 4, dist: 0.8, particles: 0.7, weather: 0.7, scenery: 1, woods: 0.65, lamps: 12, lite: false, shadows: 0, ssao: false, dpr: 2, lod: 110, terrLite: false, cap60: false },
  { name: 'High', scale: 1.0, minScale: 0.6, msaa: 4, bloom: 5, dist: 1.0, particles: 1, weather: 1, scenery: 1, woods: 0.8, lamps: 16, lite: false, shadows: 0, ssao: false, dpr: 2, lod: 170, terrLite: false, cap60: false },
  { name: 'Ultra', scale: 1.0, minScale: 0.75, msaa: 4, bloom: 6, dist: 1.2, particles: 1.25, weather: 1.2, scenery: 1, woods: 0.9, lamps: 16, lite: false, shadows: 0, ssao: false, dpr: 2, lod: 260, terrLite: false, cap60: false },
  { name: 'Psycho', scale: 1.0, minScale: 0.85, msaa: 8, bloom: 6, dist: 1.45, particles: 1.5, weather: 1.4, scenery: 1, woods: 1.1, lamps: 16, lite: false, shadows: 4096, ssao: true, dpr: 2, lod: 450, terrLite: false, cap60: false },
];
/** index of the default preset (High) */
export const Q_DEFAULT = 3;

export interface View {
  car: Car;
  rect: [number, number, number, number]; // css pixels, from the top-left
  shake: number;
  lookBack?: boolean;
}

export interface FrameIn {
  race: Race;
  alpha: number;
  time: number;
  dt: number;
  views: View[];
  fade: number;
  hit: number[];
  attract?: boolean;
  orbit?: number; // attract-mode camera
}

import { Profiler } from './prof';

const tmp4 = [0, 0, 0, 0];

export class Renderer {
  gl: GL;
  canvas: HTMLCanvasElement;
  hdr = true;
  fmt: { internal: number; format: number; type: number };
  tex: MaterialTextures;
  sky: Sky;
  ground: Ground;
  cars: CarRenderer;
  fx: FX;
  post: Post;
  scenery: Scenery | null = null;
  hazards: HazardRenderer | null = null;
  traffic: Mesh[] = [];
  trafficData = new Float32Array(32 * 6);
  ms: MSTarget;
  plain: Target; // non-MSAA scene target (also MSAA resolve target)
  pathTex: WebGLTexture;
  path = new BentPath();
  track: Track | null = null;
  look: Look = LOOKS[0];
  quality: Quality = QUALITY[2];
  dynScale = 1;
  /** benchmark resolution test: render at exactly this scale, ignoring the preset's limits */
  forceScale: number | null = null;
  // sun shadow map (Psycho)
  private dummyShadow: WebGLTexture;
  private shadowTex: WebGLTexture | null = null;
  private shadowFB: WebGLFramebuffer | null = null;
  private shadowSize = 0;
  private viewBox = [0, 0, 1, 1];
  private shadowVP = new Float32Array(16);
  private shadowTex2: WebGLTexture | null = null;
  private shadowFB2: WebGLFramebuffer | null = null;
  private shadowVP2 = new Float32Array(16);
  private shadowP2 = [0, 0, 0, 0];
  private shadowLive = false;
  private curTarget: { bind(): void } | null = null;
  // scene depth copy for ambient occlusion (Psycho)
  private depthFB: WebGLFramebuffer | null = null;
  private depthTex: WebGLTexture | null = null;
  private depthW = 0;
  private depthH = 0;
  private lastProj = new Float32Array(16);

  private depthTexture(size: number, data: Uint32Array | null): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    return t;
  }
  private bindShadowUnit(t: WebGLTexture, unit = SHADOW_UNIT): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.activeTexture(gl.TEXTURE0); // so later uploads never land on the shadow unit
  }
  private ensureShadow(size: number, size2: number): void {
    if (this.shadowSize === size && this.shadowTex) return;
    const gl = this.gl;
    const make = (old: WebGLTexture | null, fb: WebGLFramebuffer | null, sz: number): [WebGLTexture, WebGLFramebuffer] => {
      if (old) gl.deleteTexture(old);
      const t = this.depthTexture(sz, null);
      const f = fb ?? gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      return [t, f];
    };
    [this.shadowTex, this.shadowFB] = make(this.shadowTex, this.shadowFB, size);
    [this.shadowTex2, this.shadowFB2] = make(this.shadowTex2, this.shadowFB2, size2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.shadowSize = size;
  }
  renderW = 0;
  renderH = 0;
  meanY = 0;
  private lapTurn = 0;
  // lightning
  private flash = 0;
  private boltT = 0;
  private bolt = [0, 0, 0];
  private nextBolt = 6;
  thunderQueue: { at: number; power: number }[] = [];
  stats = { drawCalls: 0, w: 0, h: 0 };
  prof!: Profiler;
  lastCam = [0, 0, 0];
  private camState = new Map<Car, { y: number; ty: number; fov: number; x: number }>();
  private pitchSm = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Low-latency ('desynchronized') presentation lets the canvas skip the browser's compositor. On a desktop that
    // trims a frame of lag; on phones the screen can then show a frame that is still being drawn (brief blocks
    // of garbage, like failing video memory), so it is only asked for where there is a mouse.
    const lowLatency = !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false, desynchronized: lowLatency }) as GL | null;
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.prof = new Profiler(gl);
    const cbf = gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    this.hdr = !!cbf;
    // bent space is left-handed (x right, y up, z forward): outward faces wind clockwise on screen
    gl.frontFace(gl.CW);
    this.fmt = this.hdr ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    this.tex = new MaterialTextures(gl);
    this.sky = new Sky(gl);
    this.ground = new Ground(gl);
    this.cars = new CarRenderer(gl);
    this.fx = new FX(gl);
    this.post = new Post(gl, this.fmt);
    this.ms = new MSTarget(gl, this.fmt.internal);
    this.plain = new Target(gl, this.fmt.internal, this.fmt.format, this.fmt.type, true);
    // shadow unit: a 1x1 depth texture reading 'fully lit' until a real shadow map exists
    this.dummyShadow = this.depthTexture(1, new Uint32Array([0xffffffff]));
    this.bindShadowUnit(this.dummyShadow);
    this.bindShadowUnit(this.dummyShadow, SHADOW_UNIT2);
    this.pathTex = createTexture(gl, PATH_N, 3, gl.RGBA32F, gl.RGBA, gl.FLOAT, null, gl.NEAREST);
    for (let k = 0; k < 3; k++) {
      const mb = buildTraffic(k);
      const m = new Mesh(gl, mb.pack(), 32, [
        { loc: 0, size: 3, type: gl.FLOAT, offset: 0 },
        { loc: 1, size: 3, type: gl.FLOAT, offset: 12 },
        { loc: 2, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 24 },
        { loc: 3, size: 4, type: gl.UNSIGNED_BYTE, normalized: true, offset: 28 },
      ], mb.vertexCount);
      m.setInstances(this.trafficData, 24, [
        { loc: 4, size: 3, type: gl.FLOAT, offset: 0 },
        { loc: 5, size: 3, type: gl.FLOAT, offset: 12 },
      ], gl.DYNAMIC_DRAW);
      this.traffic.push(m);
    }
  }

  setQuality(q: Quality): void {
    const prev = this.quality;
    this.quality = q;
    this.dynScale = q.scale;
    // scenery thinning and the deep woodland are built per track: rebuild if they changed
    if (this.track && this.scenery && (prev.scenery !== q.scenery || (prev.woods > 0) !== (q.woods > 0))) {
      this.scenery = this.buildScenery(this.track, q);
    } else if (this.scenery) this.scenery.backdropDist = q.woods;
    if (this.scenery) this.scenery.lodDist = q.lod;
  }

  private buildScenery(track: Track, q: Quality): Scenery {
    const look = LOOKS[track.d.params.scenario];
    const terrain = new Terrain(track, look.terr, look.terr2);
    const sc = new Scenery(this.gl, track.d, terrain, look.terr2[3] > -20 ? look.terr2[3] : -1e9, this.pits, q.scenery, q.woods);
    sc.lodDist = q.lod;
    return sc;
  }

  /** pits: the race uses fuel stops (pit-lane markings and signs are drawn); otherwise the strip is a plain lay-by */
  pits = false;
  loadTrack(t: TrackData, pits = false): void {
    this.pits = pits;
    this.track = new Track(t);
    this.look = LOOKS[t.params.scenario];
    this.tex.setGround(this.look.groundType);
    this.scenery = this.buildScenery(this.track, this.quality);
    this.hazards = new HazardRenderer(this.gl, t);
    this.fx.parts.length = 0;
    let sum = 0;
    for (let i = 0; i < t.n; i++) sum += t.Y[i];
    this.meanY = sum / t.n;
    this.lapTurn = t.circuit ? t.heading[t.n - 1] + t.curv[t.n - 1] * 2 - t.heading[0] : 0;
    this.camState.clear();
  }

  /** true heading for the sky, continuous across laps */
  private headingAt(dist: number): number {
    const tr = this.track!;
    const d = tr.d;
    const s = tr.trackS(dist);
    const f = tr.fi(s);
    const i = Math.floor(f);
    const j = d.circuit ? (i + 1) % d.n : Math.min(i + 1, d.n - 1);
    let h1 = d.heading[j];
    if (d.circuit && j === 0) h1 = d.heading[0] + this.lapTurn;
    let h = d.heading[i] + (h1 - d.heading[i]) * (f - i);
    if (d.circuit) h += Math.floor(dist / d.lapLen) * this.lapTurn;
    return h;
  }

  private sunWorld(): number[] {
    const az = (this.look.sunAz * Math.PI) / 180, el = (this.look.sunEl * Math.PI) / 180;
    return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.dpr);
    const w = Math.max(320, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(200, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** spawn spray / sparks from car state; called every frame */
  private effects(race: Race, dt: number, viewers: Car[]): void {
    const tr = this.track!;
    const q = this.quality.particles;
    for (const c of race.cars) {
      let near = false;
      for (const v of viewers) if (Math.abs(tr.delta(v.s, c.s)) < 160) near = true;
      if (!near) continue;
      const ev = (c as any).fxEv | 0;
      (c as any).fxEv = 0;
      const v = c.v;
      if (c.sprayAmt > 0.05 && v > 4 && !c.airborne) {
        const kind = [-1, PT.DUST, PT.WATER, PT.SNOW, PT.MUD, PT.SAND, PT.SMOKE, PT.GRASS][c.spray] ?? -1;
        if (kind >= 0) {
          // rivals throw up less than the cars being followed by a camera, so a pack stays readable
          const own = viewers.includes(c) ? 1 : 0.6;
          const rate = c.sprayAmt * Math.min(1, v / 40) * (kind === PT.WATER ? 110 : kind === PT.SMOKE ? 50 : kind === PT.GRASS ? 40 : 70) * q * own;
          let n = rate * dt;
          while (n > 0) {
            if (n < 1 && Math.random() > n) break;
            n -= 1;
            const side = Math.random() < 0.5 ? -1 : 1;
            const big = kind === PT.WATER || kind === PT.DUST || kind === PT.SAND || kind === PT.SNOW;
            this.fx.spawn(kind, c.s - 1.8 - Math.random() * 0.5, c.x + side * 0.8 + (Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.2,
              v * (0.35 + Math.random() * 0.3), side * (0.6 + Math.random() * 2.5) + c.vx * 0.5, 0.8 + Math.random() * (big ? 2.5 : 1.5),
              (big ? 0.55 : 0.5) + Math.random() * 0.4, kind === PT.GRASS || kind === PT.MUD ? 0.12 : big ? 0.35 + Math.random() * 0.3 : 0.25,
              kind === PT.GRASS || kind === PT.MUD ? 0 : kind === PT.SMOKE ? 4 : 3.2, kind === PT.GRASS || kind === PT.MUD ? 9.8 : 0.4);
          }
        }
      }
      if (ev & (EV_SCRAPE | EV_CRASH | EV_SHUNT)) {
        const n = ev & EV_CRASH ? 40 : 6;
        for (let i = 0; i < n * q; i++) this.fx.spawn(PT.SPARK, c.s + (Math.random() - 0.5) * 2, c.x + (c.wall || (Math.random() - 0.5)) * 0.9, 0.3 + Math.random() * 0.5, v * 0.6 + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, 1 + Math.random() * 4, 0.3 + Math.random() * 0.4, 0.05, 0, 9.8);
        if (ev & EV_CRASH) for (let i = 0; i < 25 * q; i++) this.fx.spawn(PT.DUST, c.s + (Math.random() - 0.5) * 3, c.x + (Math.random() - 0.5) * 2, 0.3, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, Math.random() * 2, 1.2 + Math.random(), 0.6, 2.5, 0);
      }
      if (ev & EV_LASER) for (let i = 0; i < 30 * q; i++) this.fx.spawn(PT.SPARK, c.s + 1, c.x + (Math.random() - 0.5) * 1.8, 0.5 + Math.random() * 0.8, v * 0.5, (Math.random() - 0.5) * 10, 2 + Math.random() * 3, 0.4, 0.06, 0, 6);
      if (ev & EV_LAND && c.v > 10) for (let i = 0; i < 16 * q; i++) this.fx.spawn(PT.DUST, c.s - 1, c.x + (Math.random() - 0.5) * 2, 0.1, v * 0.4, (Math.random() - 0.5) * 5, Math.random() * 1.5, 0.9, 0.5, 2.5, 0);
    }
    // cones knocked
    if (this.hazards && race.env.coneHits.length) {
      const out: { s: number; u: number }[] = [];
      for (const h of race.env.coneHits) this.hazards.knock(h.s, h.u, out);
      race.env.coneHits.length = 0;
      for (const o of out) for (let i = 0; i < 8; i++) this.fx.spawn(PT.CONE, o.s, o.u, 0.4, 14 + Math.random() * 10, (Math.random() - 0.5) * 8, 3 + Math.random() * 4, 1.2, 0.12, 0, 9.8);
    }
    // gust debris telegraph (Wind)
    if (race.scen === Scn.WIND || race.scen === Scn.DESERT || race.scen === Scn.STORM) {
      for (const v of viewers) {
        const hz = tr.hazardsIn(v.s - 20, v.s + 220, []);
        for (const h of hz) {
          if (h.kind !== Hz.GUST) continue;
          const w = gustWarning(h, race.time);
          if (w <= 0) continue;
          const rate = 60 * w * q;
          for (let i = 0; i < rate * dt; i++) {
            const s = h.s + Math.random() * Math.min(h.len, 200);
            this.fx.spawn(PT.LEAF, s, -h.a * (tr.hwL(s) + 6 + Math.random() * 6), 0.3 + Math.random() * 2.5, (Math.random() - 0.5) * 4, h.a * (10 + Math.random() * 8), Math.random() * 2, 2.2, 0.09, 0, 1.0);
          }
        }
      }
    }
    this.fx.update(dt);
  }

  render(F: FrameIn): void {
    const gl = this.gl;
    const tr = this.track;
    if (!tr) return;
    this.resize();
    const race = F.race;
    const look = this.look;
    const W = this.canvas.width, H = this.canvas.height;
    const scale = this.forceScale ?? Math.max(this.quality.minScale, Math.min(this.quality.scale, this.dynScale));
    const rw = Math.max(64, Math.floor(W * scale)), rh = Math.max(64, Math.floor(H * scale));
    this.renderW = rw;
    this.renderH = rh;
    // allocate at full canvas size; render into a sub-rect when scaled
    if (this.quality.msaa > 0) this.ms.resize(W, H, this.quality.msaa);
    this.plain.resize(W, H);
    const pf = this.prof;
    pf.begin('effects (CPU)');
    this.effects(race, F.dt, F.views.map((v) => v.car));
    pf.end();
    // lightning
    if (look.lightning > 0 && race.started) {
      this.nextBolt -= F.dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 4 + Math.random() * 9;
        this.boltT = 0.9;
        this.bolt = [Math.random() * Math.PI * 2, 1, Math.random() * 100];
        this.thunderQueue.push({ at: F.time + 0.6 + Math.random() * 2.2, power: 0.6 + Math.random() * 0.4 });
      }
    }
    if (this.boltT > 0) {
      this.boltT -= F.dt;
      const t = 0.9 - this.boltT;
      this.flash = (t < 0.08 ? 1 : t < 0.15 ? 0.25 : t < 0.25 ? 0.85 : Math.max(0, 0.6 - (t - 0.25) * 2)) * look.lightning;
      this.bolt[1] = this.flash;
    } else {
      this.flash = 0;
      this.bolt[1] = 0;
    }
    if (this.hazards) this.hazards.updateLasers(race.time, hazardActive, laserWarning);

    const target = this.quality.msaa > 0 ? this.ms : this.plain;
    this.curTarget = target;
    pf.begin('clear');
    target.bind();
    gl.viewport(0, 0, rw, rh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    pf.end();
    const vpsUv: number[][] = [];
    const blur: number[][] = [];
    this.stats.w = rw;
    this.stats.h = rh;
    for (const view of F.views) {
      const [cx, cy, cw, ch] = view.rect;
      const vx = Math.round((cx / this.canvas.clientWidth) * rw);
      const vw = Math.round((cw / this.canvas.clientWidth) * rw);
      const vhh = Math.round((ch / this.canvas.clientHeight) * rh);
      const vy = rh - Math.round((cy / this.canvas.clientHeight) * rh) - vhh;
      gl.viewport(vx, vy, vw, vhh);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(vx, vy, vw, vhh);
      this.viewBox = [vx, vy, vw, vhh];
      const cam = this.drawView(view, F, vw / vhh);
      gl.disable(gl.SCISSOR_TEST);
      vpsUv.push([cx / this.canvas.clientWidth, 1 - (cy + ch) / this.canvas.clientHeight, cw / this.canvas.clientWidth, ch / this.canvas.clientHeight]);
      const spd = Math.min(1, view.car.v / view.car.spec.vTop);
      blur.push([cam[0], cam[1], this.quality.lite ? 0 : Math.max(0, spd - 0.35) * 1.4 * (F.attract ? 0.5 : 1), 0]);
    }
    if (this.quality.msaa > 0) {
      pf.begin('MSAA resolve');
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.ms.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.plain.fb);
      gl.blitFramebuffer(0, 0, rw, rh, 0, 0, rw, rh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      pf.end();
    }
    if (this.quality.ssao && F.views.length === 1) {
      pf.begin('ambient occlusion');
      if (!this.depthFB || this.depthW !== W || this.depthH !== H) {
        this.depthFB ??= gl.createFramebuffer()!;
        if (this.depthTex) gl.deleteTexture(this.depthTex);
        this.depthTex = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, W, H, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFB);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTex, 0);
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        this.depthW = W;
        this.depthH = H;
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.quality.msaa > 0 ? this.ms.fb : this.plain.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.depthFB);
      gl.blitFramebuffer(0, 0, rw, rh, 0, 0, rw, rh, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      this.post.ssao(this.depthTex!, rw, rh, W, H, this.lastProj, 0.25, 6000);
      pf.end();
    }
    const g = look.grade;
    const P: PostParams = {
      bloom: look.bloom * (this.hdr ? 1 : 0.5), exposure: g.exposure, sat: g.sat, contrast: g.contrast, tint: g.tint, lift: g.lift, vignette: g.vignette,
      blur, vps: vpsUv, flash: this.flash, haze: this.quality.lite ? 0 : look.heatHaze, time: F.time, rainLens: this.quality.lite ? 0 : look.rain * (F.views[0]?.car.v > 5 ? 0.6 : 1),
      sharpen: this.quality.lite ? 0 : scale < 0.95 ? 1 : 0.3, fade: F.fade, fadeC: [0, 0, 0], hit: Math.max(...F.hit, 0), threshold: look.bloomThreshold,
    };
    pf.begin('post (bloom, blur, tonemap)');
    this.post.run(this.plain, rw, rh, W, H, P, this.quality.bloom);
    pf.end();
  }

  /** draws one viewport; returns screen-space centre of the car (uv within the viewport) */
  private drawView(view: View, F: FrameIn, aspect: number): number[] {
    const gl = this.gl;
    const tr = this.track!;
    const look = this.look;
    const race = F.race;
    const a = F.alpha;
    const car = view.car;
    const dist = car.pdist + (car.dist - car.pdist) * a;
    const sCar = tr.trackS(dist);
    const xCar = car.px + (car.x - car.px) * a;
    const maxD = Math.min(1950, tr.d.scen.visibility * 1.15 * this.quality.dist + (tr.d.scen.visibility < 400 ? 60 : 0));
    const path = this.path;
    const pf = this.prof;
    pf.begin('road path (CPU)');
    path.build(tr, sCar, maxD);
    gl.bindTexture(gl.TEXTURE_2D, this.pathTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PATH_N, 3, gl.RGBA, gl.FLOAT, path.data);
    pf.end();

    // ---------- camera ----------
    let cs = this.camState.get(car);
    const spd = Math.min(1.2, car.v / car.spec.vTop);
    const hAir = car.phAir + (car.hAir - car.phAir) * a;
    const dCam = -6.4 - spd * 0.6;
    const roadAtCam = path.pos(dCam, xCar, 0, [0, 0, 0, 0]);
    const camH = 1.62 + spd * 0.12;
    if (!cs) {
      cs = { y: roadAtCam[1] + camH, ty: 0, fov: 0, x: xCar };
      this.camState.set(car, cs);
    }
    const kY = 1 - Math.exp(-F.dt * 9);
    cs.y += (roadAtCam[1] + camH + hAir * 0.6 - cs.y) * kY;
    cs.x += (xCar - cs.x) * (1 - Math.exp(-F.dt * 30));
    const eye = path.pos(dCam, cs.x, 0, [0, 0, 0, 0]);
    eye[1] = cs.y;
    const tgt = path.pos(15 + spd * 4, cs.x * 0.92 + xCar * 0.0, 0, [0, 0, 0, 0]);
    const tgtCar = path.pos(0, xCar, 0.9 + hAir, [0, 0, 0, 0]);
    let ty = tgt[1] * 0.35 + tgtCar[1] * 0.65 + 0.35;
    cs.ty += (ty - cs.ty) * (1 - Math.exp(-F.dt * 10));
    ty = cs.ty;
    // camera shake
    const sh = view.shake;
    const t = F.time;
    const shake = (0.012 + spd * spd * 0.035 + car.rumble * 0.06 + car.bump * 0.1 + (car.offroad ? 0.08 : 0)) * sh;
    const nx = (Math.sin(t * 37.1) + Math.sin(t * 23.7 + 1.3) * 0.6) * shake;
    const ny = (Math.sin(t * 41.3 + 2.1) + Math.sin(t * 29.9) * 0.5) * shake;
    let fwd = [tgt[0] - eye[0] + nx * 0.4, ty - eye[1] + ny, tgt[2] - eye[2]];
    if (F.orbit !== undefined) {
      // attract mode: slow swinging camera around the lead car
      const o = F.orbit;
      const r = 7.5 + Math.sin(o * 0.21) * 1.5;
      const c0 = path.pos(0, xCar, 0, [0, 0, 0, 0]);
      const ph = c0[3];
      const ang = Math.sin(o * 0.13) * 1.9;
      eye[0] = c0[0] + Math.sin(ph + Math.PI + ang) * r;
      eye[2] = c0[2] + Math.cos(ph + Math.PI + ang) * r;
      eye[1] = c0[1] + 1.4 + Math.sin(o * 0.17) * 0.6;
      fwd = [c0[0] - eye[0], c0[1] + 0.7 - eye[1], c0[2] - eye[2]];
    }
    const fl = Math.hypot(fwd[0], fwd[1], fwd[2]);
    fwd = [fwd[0] / fl, fwd[1] / fl, fwd[2] / fl];
    let right = [fwd[2], 0, -fwd[0]];
    const rl = Math.hypot(right[0], right[2]);
    right = [right[0] / rl, 0, right[2] / rl];
    // subtle roll with lateral acceleration
    const roll = -car.rollVis * 0.25 + nx * 0.02;
    let up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const r2 = [right[0] * cr + up[0] * sr, right[1] * cr + up[1] * sr, right[2] * cr + up[2] * sr];
    up = [up[0] * cr - right[0] * sr, up[1] * cr - right[1] * sr, up[2] * cr - right[2] * sr];
    right = r2;
    const view4 = viewFromBasis(new Float32Array(16), eye, right, up, fwd);
    // Hor+ field of view: fixed vertical fov, widen horizontally; cap ultra-wide split views
    const vfovBase = (52 * Math.PI) / 180;
    let vfov = vfovBase * (1 + spd * 0.14);
    const hMax = (112 * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    if (hf > hMax) vfov = 2 * Math.atan(Math.tan(hMax / 2) / aspect);
    const proj = perspective(new Float32Array(16), vfov, aspect, 0.25, 6000);
    this.lastProj.set(proj);
    const vp = mul4(new Float32Array(16), proj, view4);
    const invVP = invert4(new Float32Array(16), vp);
    this.lastCam = eye;

    // ---------- lighting set-up ----------
    const heading = this.headingAt(dist);
    if (this.scenery) { this.scenery.skyHeading = heading; this.scenery.skyRise = tr.y(sCar) - this.meanY; }
    const sw = this.sunWorld();
    const ch = Math.cos(heading), shh = Math.sin(heading);
    const sunB = [sw[0] * ch - sw[2] * shh, sw[1], sw[0] * shh + sw[2] * ch];
    const night = look.night;
    const lightsOn = look.carLights || night > 0;
    const headU = new Float32Array(16), headD = new Float32Array(16);
    let headN = 0;
    for (const p of race.players) {
      if (!lightsOn || headN >= 4) break;
      const dd = tr.delta(sCar, tr.trackS(p.pdist + (p.dist - p.pdist) * a));
      if (Math.abs(dd) > 200) continue;
      const px = p.px + (p.x - p.px) * a;
      for (const sx of [-0.55, 0.55]) {
        const pos = path.pos(dd + 2.2, px + sx, 0.65 + p.hAir, [0, 0, 0, 0]);
        const yaw = pos[3] + p.yawVis;
        const intensity = night > 0 ? 32 : look.carLights ? 14 : 0;
        headU.set([pos[0], pos[1], pos[2], intensity], headN * 4);
        const pitch = -0.045;
        headD.set([Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch), 0.86], headN * 4);
        headN++;
      }
    }
    // street lamps
    const pl = new Float32Array(64), plc = new Float32Array(64);
    let plN = 0;
    const loop = tr.circuit ? tr.d.lapLen : 0;
    if (look.streetLights && this.scenery) {
      const lamps: { s: number; u: number; h: number; d: number }[] = [];
      this.scenery.nearLamps(sCar, loop, this.quality.lamps, lamps);
      for (const l of lamps) {
        const side = l.u < 0 ? 1 : -1;
        const pos = path.pos(l.d, l.u + side * 1.7, l.h - 0.2, [0, 0, 0, 0]);
        pl.set([pos[0], pos[1], pos[2], 22], plN * 4);
        plc.set([1.0, 0.78, 0.5, 2.2], plN * 4);
        plN++;
      }
    }
    const fogDen = look.fogDensity;
    const skyRef = look.skyZenith, skyRef2 = look.skyHorizon;
    const wet = look.wet;
    const bandU = this.ground.bands(sCar, maxD);
    const pathInfo = [path.dFirst, PATH_STEP, PATH_N, maxD];
    const T = look.terr, T2 = look.terr2;
    const yCar = tr.y(sCar);
    const prep = (p: Program) => {
      p.m4('uViewProj', vp).tex('uPath', this.pathTex, 7).v4('uPathInfo', pathInfo).f('uLoopLen', loop);
      p.v4('uTerr', T).v4('uTerr2', T2).f('uYCar', yCar);
      p.v3('uSunDir', sunB).v3('uSunCol', look.sunColor).v3('uAmbTop', look.ambTop).v3('uAmbBot', look.ambBot);
      p.v3('uFogCol', look.fogColor).v3('uFogSun', look.fogSun).v4('uFog', fogDen, look.fogHeight, -20, look.fogMax).v3('uCamPos', eye);
      p.v4a('uHead', headU).v4a('uHeadDir', headD).i('uHeadN', headN);
      p.v4a('uPL', pl).v4a('uPLc', plc).i('uPLn', plN);
      p.f('uFlash', this.flash).f('uWet', wet).f('uTime', F.time);
      p.v4a('uBand', bandU);
      p.v3('uSkyRef', skyRef).v3('uSkyRef2', skyRef2).v3('uGroundRef', look.ground[0]);
      p.m4('uShadowVP', this.shadowVP).v4('uShadowP', this.shadowLive ? 1 : 0, 1 / Math.max(1, this.shadowSize), 0, 0.00022);
      p.m4('uShadowVP2', this.shadowVP2).v4('uShadowP2', this.shadowP2);
    };
    const draws = this.carDraws(race, sCar, xCar, a, maxD, lightsOn);
    const windStr = race.scen === Scn.WIND ? 1.3 : race.scen === Scn.STORM ? 1.0 : 0.25;
    let gust = 0, gustDir = 1;
    if (race.scen === Scn.WIND) {
      for (const h of tr.hazardsIn(sCar - 50, sCar + 400, [])) {
        if (h.kind !== Hz.GUST) continue;
        const a = Math.max(hazardActive(h, race.time), gustWarning(h, race.time) * 0.4);
        if (a > gust) { gust = a; gustDir = h.a; }
      }
    }
    const wind = [gustDir, windStr + gust * 1.5, gust * 1.2 * gustDir];
    const emisK = night > 0 || race.scen === Scn.FUTURE ? 1.0 : 0.25;

    // ---------- sun shadow maps (Psycho) ----------
    // Two cascades. Near: everything, a 230 m box at the camera. Far: terrain and landmarks over 2.4 km, so a
    // mountain's shadow already lies on the distant road before it comes inside the detailed map.
    this.shadowLive = false;
    if (this.quality.shadows > 0 && sunB[1] > 0.03 && night < 0.5) {
      pf.begin('sun shadow map');
      const S = this.quality.shadows, S2 = 2048;
      this.ensureShadow(S, S2);
      const fh = [fwd[0], 0, fwd[2]];
      const fhl = Math.hypot(fh[0], fh[2]) || 1;
      fh[0] /= fhl; fh[2] /= fhl;
      const sl = Math.hypot(sunB[0], sunB[1], sunB[2]);
      const lf = [-sunB[0] / sl, -sunB[1] / sl, -sunB[2] / sl];
      // right = ref x f, up = f x right (the same handedness as the camera basis)
      let lr = [fh[1] * lf[2] - fh[2] * lf[1], fh[2] * lf[0] - fh[0] * lf[2], fh[0] * lf[1] - fh[1] * lf[0]];
      const lrl = Math.hypot(lr[0], lr[1], lr[2]) || 1;
      lr = [lr[0] / lrl, lr[1] / lrl, lr[2] / lrl];
      const lu = [lf[1] * lr[2] - lf[2] * lr[1], lf[2] * lr[0] - lf[0] * lr[2], lf[0] * lr[1] - lf[1] * lr[0]];
      /** light view-projection for a box of half-size H centred `ahead` metres in front of the camera */
      const lightVP = (out: Float32Array, H: number, ahead: number, back: number, size: number) => {
        const c = [eye[0] + fh[0] * ahead, eye[1] - 1.6, eye[2] + fh[2] * ahead];
        // snap the box to whole shadow texels so edges do not crawl
        const texel = (2 * H) / size;
        const cr = c[0] * lr[0] + c[1] * lr[1] + c[2] * lr[2], cu = c[0] * lu[0] + c[1] * lu[1] + c[2] * lu[2];
        const dr = Math.round(cr / texel) * texel - cr, du = Math.round(cu / texel) * texel - cu;
        const le = [c[0] - lf[0] * back + lr[0] * dr + lu[0] * du, c[1] - lf[1] * back + lr[1] * dr + lu[1] * du, c[2] - lf[2] * back + lr[2] * dr + lu[2] * du];
        const lv = viewFromBasis(new Float32Array(16), le, lr, lu, lf);
        const lp = ortho(new Float32Array(16), -H, H, -H, H, 1, back * 2 + 50);
        mul4(out, lp, lv);
      };
      lightVP(this.shadowVP, 115, 75, 450, S);
      const H2 = 1200, back2 = 1800;
      lightVP(this.shadowVP2, H2, 950, back2, S2);
      this.shadowP2 = [1 / S2, 1.6 / (back2 * 2 + 50), (2 * H2 / S2) * 1.6, 0];
      // (the view's rectangle is remembered by render(): asking WebGL for the current viewport makes the page
      // wait for the GPU process, which cost more than the whole rest of the frame's JavaScript)
      const vpBox = this.viewBox;
      // never sample a map while it is being drawn
      this.bindShadowUnit(this.dummyShadow);
      this.bindShadowUnit(this.dummyShadow, SHADOW_UNIT2);
      gl.disable(gl.SCISSOR_TEST);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.5, 3);
      for (let pass = 0; pass < 2; pass++) {
        const sv = pass === 0 ? this.shadowVP : this.shadowVP2;
        gl.bindFramebuffer(gl.FRAMEBUFFER, pass === 0 ? this.shadowFB : this.shadowFB2);
        const sz = pass === 0 ? S : S2;
        gl.viewport(0, 0, sz, sz);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        const prepS = (p: Program) => { prep(p); p.m4('uViewProj', sv); };
        const tp = this.ground.terrP.use();
        prepS(tp);
        tp.tex('uGround', this.tex.ground, 0).tex('uNoiseT', this.tex.noise, 1);
        (this.quality.terrLite ? this.ground.terrLite : this.ground.terr).draw();
        if (pass === 0) {
          if (this.hazards) this.hazards.drawProps(prepS, sCar, F.time);
          if (this.scenery) this.scenery.draw(prepS, sCar, Math.min(maxD, 600), loop, F.time, wind, emisK, path);
          this.drawTraffic(prepS, race.traffic, sCar, Math.min(maxD, 600), a, F.time);
          this.cars.draw(prepS, draws, [0.2, 0.9, 1.0]);
        } else if (this.scenery) this.scenery.draw(prepS, sCar, maxD, loop, F.time, wind, emisK, path, true);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      this.curTarget!.bind();
      gl.viewport(vpBox[0], vpBox[1], vpBox[2], vpBox[3]);
      gl.scissor(vpBox[0], vpBox[1], vpBox[2], vpBox[3]);
      gl.enable(gl.SCISSOR_TEST);
      this.bindShadowUnit(this.shadowTex!);
      this.bindShadowUnit(this.shadowTex2!, SHADOW_UNIT2);
      this.shadowLive = true;
      pf.end();
    }

    // ---------- sky ----------
    pf.begin('sky');
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.sky.setLook(look, sw);
    this.sky.lite = this.quality.lite;
    this.sky.draw(invVP, eye, heading, (tr.y(sCar) - this.meanY) + eye[1], F.time, this.flash, this.bolt);
    pf.end();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);

    // ---------- terrain / road / water / rails ----------
    const g = this.ground;
    pf.begin('terrain');
    let p = g.terrP.use();
    prep(p);
    p.tex('uGround', this.tex.ground, 0).tex('uNoiseT', this.tex.noise, 1);
    p.v3('uG0', look.ground[0]).v3('uG1', look.ground[1]).v3('uG2', look.ground[2]).i('uGType', look.groundType);
    p.v3('uShoulder', look.road.dirt > 0.5 ? look.road.base : look.groundType === 2 ? [0.8, 0.84, 0.9] : look.groundType === 1 ? look.ground[1] : [0.32, 0.3, 0.27]);
    (this.quality.terrLite ? g.terrLite : g.terr).draw();
    pf.end();
    pf.begin('road');
    p = g.roadP.use();
    prep(p);
    const rs = look.road;
    p.tex('uAsphalt', this.tex.asphalt, 0).tex('uNoiseT', this.tex.noise, 1);
    p.v3('uRoadBase', rs.base).v3('uLine', rs.line).v3('uRumA', rs.rumbleA).v3('uRumB', rs.rumbleB);
    p.v4('uRoadStyle', rs.edge ? 1 : 0, rs.center, rs.dirt, rs.snow).v3('uSandC', look.ground[1]);
    p.v4('uRoadStyle2', rs.patch, rs.gloss, this.pits ? tr.hwL(sCar) : -tr.hwL(sCar) /* pit boundary approx; negative: no pit stops (solid edge line) */, rs.center === 4 ? 1 : 0);
    const lines = new Float32Array(12).fill(-1e6);
    lines[0] = 0;
    if (!tr.circuit) tr.d.checkpoints.forEach((c, i) => { if (i < 11) lines[i + 1] = c; });
    p.v4a('uLines', lines).f('uLoopLen2', loop);
    g.road.draw();
    pf.end();
    pf.begin('water, rails');
    if (look.terr2[3] > -20) {
      p = g.waterP.use();
      prep(p);
      p.f('uWaterY', look.terr2[3]).v3('uWaterC', look.water).tex('uNoiseT', this.tex.noise, 1);
      g.water.draw();
    }
    if (tr.d.scen.walls !== 'none') {
      p = g.railP.use();
      prep(p);
      const mot = tr.d.scen.walls === 'motorway';
      p.f('uRailOff', mot ? 3.1 : 0.7).i('uRailMode', mot ? 1 : 0).v3('uRailC', [0.3, 0.31, 0.33]);
      g.rail.draw();
    }
    void ROWS;
    pf.end();

    // ---------- decals and blob shadows ----------
    pf.begin('decals, blob shadows');
    if (this.hazards) this.hazards.drawDecals(prep, sCar);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ZERO, gl.ONE);
    gl.depthMask(false);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -2);
    const sunOff = [-sunB[0] / Math.max(0.25, sunB[1]) * 0.35, -sunB[2] / Math.max(0.25, sunB[1]) * 0.35];
    const shadowK = Math.min(0.5, (look.sunColor[0] + look.sunColor[1]) * 0.12) * (1 - night);
    // blob shadows (all presets but Psycho, where the sun shadow map replaces them)
    if (this.scenery && shadowK > 0.05 && !this.shadowLive) this.scenery.drawShadows(prep, sCar, loop, sunOff, shadowK);
    this.cars.drawShadows(prep, draws, this.shadowLive ? 0.25 : Math.max(0.35, shadowK + 0.3));
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    pf.end();

    // ---------- props / scenery / cars ----------
    pf.begin('hazards, props');
    if (this.hazards) {
      this.hazards.drawProps(prep, sCar, F.time);
      if (this.hazards.cones && this.scenery) {
        const op = this.scenery.prog.use();
        prep(op);
        op.f('uSCar', sCar).f('uTime', F.time).v3('uWind', [0, 0, 0]).f('uEmisMul', 0.6).i('uLandmark', 0).i('uSpan', 0).i('uRotor', 0);
        this.hazards.cones.drawInstances(0, this.hazards.coneCount);
      }
    }
    pf.end();
    pf.begin('scenery');
    if (this.scenery) this.scenery.draw(prep, sCar, maxD, loop, F.time, wind, emisK, path);
    pf.end();
    pf.begin('cars, traffic');
    this.drawTraffic(prep, race.traffic, sCar, maxD, a, F.time);
    this.cars.draw(prep, draws, [0.2, 0.9, 1.0]);
    pf.end();

    // ---------- particles, glows, weather ----------
    const camR = right, camU = up;
    pf.begin('particles');
    this.fx.drawParticles(prep, sCar, loop, camR, camU, look.ambTop, look.sunColor, look.fogColor, [fogDen, 0, 0, look.fogMax], eye);
    pf.end();
    pf.begin('glows, weather');
    this.fx.beginGlows();
    this.carGlows(race, sCar, a, maxD, lightsOn, night);
    if (look.streetLights || race.scen === Scn.FUTURE) {
      for (let i = 0; i < plN; i++) this.fx.glow(pl[i * 4], pl[i * 4 + 1] + 0.05, pl[i * 4 + 2], 0.65, 1.6, 1.15, 0.65);
    }
    // wet-road reflections of the glows: mirror them under the road surface
    if (look.wet > 0.25) {
      const n = this.fx.gCount;
      for (let i = 0; i < n; i++) {
        const gx = this.fx.gData[i * 8], gy = this.fx.gData[i * 8 + 1], gz = this.fx.gData[i * 8 + 2];
        const st = this.fx.gData[i * 8 + 7];
        this.fx.glow(gx, -gy * 0.9 - 0.1 + 2 * this.groundY(gx, gz), gz, this.fx.gData[i * 8 + 3] * 1.2 * (st < 0 ? -st * 0.6 : 1), this.fx.gData[i * 8 + 4] * 0.2 * look.wet, this.fx.gData[i * 8 + 5] * 0.2 * look.wet, this.fx.gData[i * 8 + 6] * 0.2 * look.wet, 3.5);
      }
    }
    this.fx.drawGlows(vp, camR, camU);
    // lasers: bright beams handled by props emissive; weather
    const velB = [Math.sin(0) * car.v, 0, car.v];
    if (look.rain > 0) this.fx.drawWeather(vp, eye, F.time, velB, 0, look.rain * this.quality.weather, [0.55, 0.6, 0.7], [race.scen === Scn.STORM ? 6 : 0, 0, 0]);
    if (look.snow > 0) this.fx.drawWeather(vp, eye, F.time, velB, 1, look.snow * this.quality.weather, [1.3, 1.35, 1.45], [7, 0, 0]);
    pf.end();
    // screen-space car position for the motion blur centre
    const cp = path.pos(0, xCar, 0.6, [0, 0, 0, 0]);
    const clip = [vp[0] * cp[0] + vp[4] * cp[1] + vp[8] * cp[2] + vp[12], vp[1] * cp[0] + vp[5] * cp[1] + vp[9] * cp[2] + vp[13], 0, vp[3] * cp[0] + vp[7] * cp[1] + vp[11] * cp[2] + vp[15]];
    return [clip[0] / clip[3] * 0.5 + 0.5, clip[1] / clip[3] * 0.5 + 0.5 + 0.12];
  }

  private groundY(x: number, z: number): number {
    // nearest path sample height (cheap): find by z
    const p = this.path;
    let best = 0, bd = 1e9;
    for (let k = 0; k < PATH_N; k += 4) {
      const d = Math.abs(p.pz[k] - z) + Math.abs(p.px[k] - x) * 0.2;
      if (d < bd) { bd = d; best = k; }
    }
    return p.py[best];
  }

  private carDraws(race: Race, sCar: number, _xCar: number, a: number, maxD: number, lights: boolean): CarDraw[] {
    const tr = this.track!;
    const out: CarDraw[] = [];
    for (const c of race.cars) {
      const dist = c.pdist + (c.dist - c.pdist) * a;
      const s = tr.trackS(dist);
      const d = tr.delta(sCar, s);
      if (d < -40 || d > Math.min(maxD, 900)) continue;
      const x = c.px + (c.x - c.px) * a;
      const h = c.phAir + (c.hAir - c.phAir) * a;
      const pos = this.path.pos(d, x, h + c.bump * 0.03 * Math.sin(race.clock * 60), tmp4);
      const yaw = pos[3] + c.pyaw + (c.yawVis - c.pyaw) * a;
      const pitch = Math.atan(this.path.slope(d)) * 0.9 + c.ppitch + (c.pitchVis - c.ppitch) * a + (c.airborne ? -0.04 : 0);
      const roll = c.proll + (c.rollVis - c.proll) * a;
      const m = modelMatrix(pos[0], pos[1], pos[2], yaw, pitch, roll);
      const sm = modelMatrix(pos[0], pos[1] - h, pos[2], yaw, Math.atan(this.path.slope(d)), 0);
      const liv = LIVERIES[c.color % LIVERIES.length];
      out.push({
        far: Math.abs(d) > this.quality.lod * 0.35,
        model: m, shadowModel: sm, geo: c.spec.id, paint: liv[0], accent: liv[1],
        spin: c.pwheel + (c.wheelAngle - c.pwheel) * a, steer: c.psteer + (c.steerVis - c.psteer) * a,
        brake: c.brake > 0.1 ? 1 : 0, lights: lights ? 1 : 0, tail: lights ? 1 : 0.25,
      });
      (c as any)._m = m;
    }
    return out;
  }

  private carGlows(race: Race, sCar: number, a: number, maxD: number, lights: boolean, night: number): void {
    const tr = this.track!;
    for (const c of race.cars) {
      const m: Float32Array | undefined = (c as any)._m;
      if (!m) continue;
      const dist = c.pdist + (c.dist - c.pdist) * a;
      const d = tr.delta(sCar, tr.trackS(dist));
      if (d < -40 || d > Math.min(maxD, 900)) { (c as any)._m = undefined; continue; }
      const geo = this.cars.geos[c.spec.id];
      const brake = c.brake > 0.1;
      // glows only show towards the camera: tail lights face backwards, headlights forwards
      const fx = m[8], fy = m[9], fz = m[10];
      const cam = this.lastCam;
      // the lamp surfaces carry most of the light; the glow is a modest halo shaped like the lamp
      const ti = (brake ? 1.0 : lights ? 0.45 : 0) * (1 + night * 0.3);
      if (ti > 0) for (const t of geo.tailLights) {
        const w = xform(m, t.p);
        const dx = cam[0] - w[0], dy = cam[1] - w[1], dz = cam[2] - w[2];
        const facing = Math.max(0, -(dx * fx + dy * fy + dz * fz) / Math.hypot(dx, dy, dz));
        if (facing > 0.05) this.fx.glow(w[0], w[1], w[2], t.size * (brake ? 1.35 : 1), ti * facing, ti * 0.06 * facing, ti * 0.035 * facing, t.stretch);
      }
      if (lights) for (const p of geo.headLights) {
        const w = xform(m, p);
        const dx = cam[0] - w[0], dy = cam[1] - w[1], dz = cam[2] - w[2];
        const facing = Math.max(0, (dx * fx + dy * fy + dz * fz) / Math.hypot(dx, dy, dz));
        if (facing > 0.05) this.fx.glow(w[0], w[1], w[2], 0.6, 2.6 * facing, 2.4 * facing, 2.1 * facing);
      }
      (c as any)._m = undefined;
    }
  }

  private drawTraffic(prep: (p: Program) => void, traffic: TrafficCar[], sCar: number, maxD: number, a: number, time: number): void {
    if (!traffic.length || !this.scenery) return;
    const tr = this.track!;
    const counts = [0, 0, 0];
    const per: number[][] = [[], [], []];
    for (const t of traffic) {
      const s = t.ps + tr.delta(t.ps, t.s) * a;
      const d = tr.delta(sCar, s);
      if (d < -30 || d > maxD) continue;
      per[t.kind].push(s, t.x, Math.PI, 1, (t.color / 6) - 1, t.color * 0.1);
      counts[t.kind]++;
      // headlights glow
      const L = t.len / 2;
      for (const sx of [-0.65, 0.65]) {
        const pos = this.path.pos(d - L, t.x + sx, 0.65, tmp4);
        this.fx.glow(pos[0], pos[1], pos[2], 0.9, 4, 3.8, 3.2);
      }
    }
    const p = this.scenery.prog.use();
    prep(p);
    p.f('uSCar', sCar).f('uTime', time).v3('uWind', [0, 0, 0]).f('uEmisMul', 1).i('uLandmark', 0).i('uSpan', 0).i('uRotor', 0);
    for (let k = 0; k < 3; k++) {
      if (!counts[k]) continue;
      const data = new Float32Array(per[k]);
      this.traffic[k].updateInstances(data);
      this.traffic[k].drawInstances(0, counts[k]);
    }
  }

  private floorProg: Program | null = null;
  private floorVao: WebGLVertexArrayObject | null = null;
  /** car-select showroom: neon floor + slowly turning car */
  renderShowroom(carId: number, livery: number, angle: number, time: number, look: Look): void {
    const gl = this.gl;
    this.resize();
    const W = this.canvas.width, H = this.canvas.height;
    const msaa = this.quality.msaa > 0;
    if (msaa) this.ms.resize(W, H, this.quality.msaa);
    this.plain.resize(W, H);
    const target = msaa ? this.ms : this.plain;
    target.bind();
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = W / H;
    const r = 6.6;
    const eye = [Math.sin(angle) * r, 1.55 + Math.sin(time * 0.3) * 0.1, Math.cos(angle) * r];
    const tgt = [0, 0.55, 0];
    let fwd = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]];
    const fl = Math.hypot(fwd[0], fwd[1], fwd[2]);
    fwd = fwd.map((v) => v / fl);
    let right = [fwd[2], 0, -fwd[0]];
    const rl = Math.hypot(right[0], right[2]);
    right = [right[0] / rl, 0, right[2] / rl];
    const up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
    const view4 = viewFromBasis(new Float32Array(16), eye, right, up, fwd);
    let vfov = (34 * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    if (hf > (80 * Math.PI) / 180) vfov = 2 * Math.atan(Math.tan((40 * Math.PI) / 180) / aspect);
    const proj = perspective(new Float32Array(16), vfov, aspect, 0.1, 500);
    const vp = mul4(new Float32Array(16), proj, view4);
    const invVP = invert4(new Float32Array(16), vp);
    // sky backdrop
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.sky.setLook(look, [0.3, 0.12, 0.95]);
    this.sky.draw(invVP, eye, time * 0.02, 0, time, 0, [0, 0, 0]);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    // floor
    if (!this.floorProg) {
      this.floorProg = new Program(gl, PRELUDE_FLOOR_VS, PRELUDE_FLOOR_FS, 'floor');
      this.floorVao = gl.createVertexArray()!;
      gl.bindVertexArray(this.floorVao);
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }
    const fp = this.floorProg.use();
    fp.m4('uViewProj', vp).f('uTime', time).v3('uCam', eye);
    gl.bindVertexArray(this.floorVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const sunB = [0.45, 0.62, -0.6];
    const prep = (p: Program) => {
      p.m4('uViewProj', vp).v3('uSunDir', sunB).v3('uSunCol', [2.2, 2.0, 1.9]).v3('uAmbTop', [0.22, 0.2, 0.4]).v3('uAmbBot', [0.12, 0.03, 0.1]);
      p.v3('uFogCol', [0, 0, 0]).v3('uFogSun', [0, 0, 0]).v4('uFog', 0, 0, 0, 0).v3('uCamPos', eye);
      p.i('uHeadN', 0).i('uPLn', 0).f('uFlash', 0).f('uWet', 0).f('uTime', time);
      p.v3('uSkyRef', [0.5, 0.3, 1.0]).v3('uSkyRef2', [1.2, 0.5, 0.8]).v3('uGroundRef', [0.05, 0.02, 0.08]);
    };
    const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const liv = LIVERIES[livery % LIVERIES.length];
    const draws: CarDraw[] = [{ model: m, shadowModel: m, geo: carId, paint: liv[0], accent: liv[1], spin: time * 2, steer: Math.sin(time * 0.7) * 0.3, brake: 0, lights: 1, tail: 1 }];
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ZERO, gl.ONE);
    gl.depthMask(false);
    this.cars.drawShadows(prep, draws, 0.8);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.cars.draw(prep, draws, [0.2, 0.9, 1.0]);
    if (msaa) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.ms.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.plain.fb);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    this.post.run(this.plain, W, H, W, H, {
      bloom: 0.12, exposure: 0.95, sat: 1.15, contrast: 1.08, tint: [1, 1, 1], lift: [0, 0, 0], vignette: 0.5, blur: [[0.5, 0.5, 0, 0]], vps: [[0, 0, 1, 1]],
      flash: 0, haze: 0, time, rainLens: 0, sharpen: 0.3, fade: 0, fadeC: [0, 0, 0], hit: 0, threshold: 1.2,
    }, this.quality.bloom);
  }
}

function modelMatrix(x: number, y: number, z: number, yaw: number, pitch: number, roll: number): Float32Array {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // basis: forward f, right r, up u (bent space: x right, y up, z forward)
  const f = [sy * cp, sp, cy * cp];
  const r0 = [cy, 0, -sy];
  const u0 = [-sy * sp, cp, -cy * sp];
  const r = [r0[0] * cr + u0[0] * sr, r0[1] * cr + u0[1] * sr, r0[2] * cr + u0[2] * sr];
  const u = [u0[0] * cr - r0[0] * sr, u0[1] * cr - r0[1] * sr, u0[2] * cr - r0[2] * sr];
  return new Float32Array([r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, f[0], f[1], f[2], 0, x, y, z, 1]);
}
function xform(m: Float32Array, p: number[]): number[] {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}

export { Spray };

const PRELUDE_FLOOR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aQ;
uniform mat4 uViewProj;
out vec3 vW;
void main(){ vW = vec3(aQ.x * 40.0, 0.0, aQ.y * 40.0); gl_Position = uViewProj * vec4(vW, 1.0); }`;
const PRELUDE_FLOOR_FS = `#version 300 es
precision highp float;
in vec3 vW; out vec4 o; uniform float uTime; uniform vec3 uCam;
void main(){
  float r = length(vW.xz);
  vec2 g = abs(fract(vW.xz * 0.5) - 0.5);
  float line = smoothstep(0.03, 0.0, min(g.x, g.y)) * smoothstep(30.0, 4.0, r);
  float ring = smoothstep(0.05, 0.0, abs(r - 3.4)) + smoothstep(0.03, 0.0, abs(r - 3.55)) * 0.6;
  vec3 c = vec3(0.012, 0.008, 0.03) * (1.0 - smoothstep(0.0, 25.0, r));
  c += vec3(0.05, 0.6, 0.9) * line * 0.25 + vec3(1.0, 0.15, 0.45) * ring * (1.2 + 0.4 * sin(uTime * 2.0));
  c += vec3(0.25, 0.08, 0.35) * smoothstep(5.0, 0.0, r) * 0.25;
  o = vec4(c, 1.0);
}`;
