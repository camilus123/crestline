# CRESTLINE: Maximum Drive — progress log

Single-file browser racer in the style of a 1992 16-bit classic. Build: `npm install` once, then `npm run build` → `dist/crestline.html`.

## Decisions (approved defaults)
- Title **CRESTLINE: Maximum Drive**; cars **Vantor Stiletto GT** (wedge supercar), **Kestrel Sprite R** (roadster), **Axiom Halo X** (concept).
- Custom WebGL2 renderer (no three.js), TypeScript, esbuild-wasm, single inlined HTML.
- Two-player: top/bottom split, full width, horizontal FOV capped at ~112°.
- Music: four live Web Audio sequencer tracks (Euro-house, synth-rock, breakbeat, synthwave) + FX only.
- Arcade has all 19 rivals on track; only the clock decides. Points 25-18-15-12-10-8-6-4-2-1. A full tank ≈ 15 km.

## Architecture
- `src/core` deterministic maths (`dmath.ts`: sin/cos from + − × ÷ only) and seeded sfc32 RNG.
- `src/track` codes (9 letters + 2 digits), generator (curvature/grade/width/flags/hazards/objects/map), runtime sampling.
- `src/sim` 120 Hz car physics in road coordinates, AI (shared with the test bot), race manager, roster.
- `src/render` bent-path renderer: each frame the road ahead is integrated into camera-relative "bent space"
  (relative heading soft-clamped so bends sweep sideways and never fold back); road, terrain, scenery, hazards
  and particles are placed from that path texture in vertex shaders. HDR + MSAA + bloom + radial speed blur + ACES.
- `tests/` Node bot races (`npm run test:sim`), generator smoke test, headless screenshot harness (`tests/shot.mjs`).

## Milestones
- [x] M1 Greybox: road, terrain, sky, car models, physics, chase camera, rivals on grid. Bot finishes races in all 13 scenarios.
- [x] M2a Track generator + codes (deterministic, any text → valid code).
- [ ] M2b Track constructor UI (sliders, map, elevation profile, copy code).
- [~] M3 Rivals/AI done (lane scoring, yielding, blocking, laser timing). Modes/pit logic in sim. UI flow pending.
- [~] M4 Scenarios: all 13 have looks, objects, hazards; visual polish pending.
- [ ] M5 Audio (engine, sfx, music), menus, title/attract, HUD.
- [ ] M6 Two-player, rebinding, quality presets/dynamic res, F3 overlay, benchmark.
- [ ] M7 Review loop (screenshots ×2 passes), full tests, final build.

## Test status
- `npm run test:sim`: 39 bot races (13 scenarios × 3 difficulties × arcade+championship) — all pass after tuning
  (Roadworks hard rivals slowed 4.5%, first-segment traffic allowance on narrow roads).

## Resume notes
- Development happens in the cloud workspace copy; the folder on Marko's PC is synced at milestones.
