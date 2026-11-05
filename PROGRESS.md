# CRESTLINE: Maximum Drive — progress log

Playable file: `dist/crestline.html` (double-click; works from `file://`, no server, no network).
Rebuild: `npm install` once, then `npm run build`.

## Decisions (approved defaults)
- Title **CRESTLINE: Maximum Drive**; cars **Vantor Stiletto GT** (wedge supercar), **Kestrel Sprite R** (roadster), **Axiom Halo X** (concept).
- Custom WebGL2 renderer (no three.js), TypeScript, esbuild-wasm, single inlined HTML (fonts decoded from inlined data, no requests).
- Two players: top/bottom split, full width, horizontal FOV capped at ~112°; one pad + 2 players → pad goes to player 2.
- Music: four live Web Audio sequencer tracks + effects-only. Points 25-18-15-12-10-8-6-4-2-1. A full tank ≈ 15 km.

## Architecture
- `src/core` deterministic maths (`dmath.ts`: sin/cos from + − × ÷ only) and seeded sfc32 RNG.
- `src/track` codes (9 letters + 2 digits), generator, runtime sampling, 64 course codes, `hashcheck.ts`.
- `src/sim` 120 Hz car physics in road coordinates, AI (shared with the test bot), race manager, roster.
- `src/render` bent-path renderer (road ahead integrated each frame into camera-relative space, relative heading
  soft-clamped so bends sweep sideways and never fold back); HDR + MSAA + bloom + radial speed blur + ACES.
- `src/audio` synthesized engines/SFX and a small tracker with four songs.
- `src/ui` DOM menus with keyboard/gamepad/mouse focus navigation, HUD, track constructor.
- `tests/` bot races, 64-course runner, keyboard-driver test, gearbox test, fuel test, determinism hash,
  headless screenshot / flow / frame-sequence harnesses, review-pass runner.

## Milestones — all done
- [x] M1 Greybox · [x] M2 Generator, codes, constructor · [x] M3 Rivals, modes, pits, seasons
- [x] M4 13 scenarios + hazards · [x] M5 Audio, menus, title/attract, HUD · [x] M6 Two-player, rebinding, presets, F3, benchmark
- [x] M7 Review loop: 3 passes × 13 scenarios × (1920x1080 + 3440x1440) in `review/pass1..3`, notes in `review/NOTES.md`

## Test status (final)
- Determinism: 100 tracks hash identically (combined `4dd29e0e`) in Node/V8, headless Chromium 153 and SpiderMonkey 115 (gjs). Open `crestline.html?hashcheck` in any browser to compare.
- All 64 course tracks: bot beats every arcade limit (margin 4.8–25.5 %) and finishes top ten in every championship race.
- Keyboard-tapping driver (8 Hz, 150 ms reaction) laps within 2–5 % of the analogue bot with no crashes (Mountains excepted).
- `file://` with all network blocked: menus from title to race, zero console errors, zero network requests.

## Known issues / not verified
- Frame rate not measured on the target PC (headless uses a software GPU). Use F3 and Settings → Benchmark.
- Firefox browser itself not run (only its JS engine); audio not listened to; gamepads not physically tested.
