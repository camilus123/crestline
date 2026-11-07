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
- Determinism: 100 tracks hash identically (combined `a0d30c1d`) in Node/V8, headless Chromium 153 and SpiderMonkey 115 (gjs). Open `crestline.html?hashcheck` in any browser to compare.
- All 64 course tracks: bot beats every arcade limit (margin 4.8–25.5 %); championship (every race now with a fuel stop):
  31/32 top ten in the single-seed run, the 32nd (Storm, Hard) makes the top ten in 7 of 8 seeds (6 of 8 before fuel).
- Keyboard-tapping driver (8 Hz, 150 ms reaction) laps within 2–5 % of the analogue bot with no crashes (Mountains excepted).
- `file://` with all network blocked: menus from title to race, zero console errors, zero network requests.

## Fixes after first playtest (2026-11-05)
- Dust/spray behind a pack (Rally, Marsh, also Storm/Snow/Desert): lighter puffs, rivals throw up less,
  puffs that would cover a large part of the screen thin out, and a density budget caps the total haze ahead.
- Futuristic buildings over the road with no collision: towers were up to ~40 m wide, randomly rotated, 18 m
  from the edge, with a smaller collision box. Buildings, fences and signs now face the road; every roadside rule
  in every scenario keeps its drawn model off the road and its collision box covering its solid part
  (`tests/footprint.test.ts` checks this). Scenery now bends with the road along its length, and the far-distance
  squeeze can no longer pull a building towards the road.
- Car rears: the Stiletto and Halo had a black rear panel; now body colour with proper lamp clusters (Stiletto),
  a light blade (Halo), round red + amber lamps (Sprite), red lenses that read red when unlit, red light spilling
  onto the paint around them, and glows shaped like the lamps instead of four round blobs. Brake glow toned down.
- Re-tested: all 64 courses pass (arcade margin 4.8–25.5 %), hashes identical in V8/Chromium/SpiderMonkey,
  `file://` flow zero errors / zero requests. Before/after shots in `review/fix4/`.

## Fixes after second playtest (2026-11-05)
- "Warp speed" stars and turbines: the radial speed blur streaked the whole screen. Every opaque surface now
  writes a motion weight (falls off as 1/distance, like real forward motion) and the sky writes none, so near
  road and verges still streak while stars, turbines and distant scenery stay sharp. Stars are now small
  round twinkling dots of varied colour instead of filled square cells.
- Forest depth: a dense, purely visual woodland band (about 13–85 m beyond the road edge, ~1.7 trees per metre
  per side) generated in the renderer from the track code, kept clear of every other stretch of road; track
  data, hashes and race results are unchanged. The ground under the trees is now a dark, dappled forest floor.

## Fixes after third playtest (2026-11-06)
- Esc in fullscreen: Chrome/Edge now use Keyboard Lock, so Esc reaches the game (back / pause) and the browser
  asks you to hold Esc to leave fullscreen. Browsers without it (Firefox) still spend the first Esc on leaving
  fullscreen, but that exit is now treated as the press: it pauses a race or goes back in a menu.
- F3 monitor: refresh estimate was only updated with dynamic resolution on (stuck at 60 Hz otherwise); now always.
  Shows FPS to 0.1 with 1 % low, frame interval avg/max, CPU time per frame, GPU time per frame (timer query,
  where the browser exposes it) and headroom — the frame interval alone always equals the refresh period.
- Benchmark: live on-screen counter (elapsed / 30 s, current fps), anything left over the race is removed,
  focus loss no longer pauses it, report adds CPU and GPU time per frame.

## Fixes after fourth playtest (2026-11-06)
- Driving through Desert mesas (and other big landmarks): a landmark was placed clear of the road beside it,
  but the road could curve back through it further on (and a mesa could be wider than its placement distance).
  Each rigid landmark now checks the road ahead for several footprints either side and moves outwards until
  it clears every stretch; if it cannot fit, it is left out. Render-only, so track data is unchanged.
- Mouse cursor hides during a race after 1.2 s without mouse movement; it returns on movement and in menus/pause.

## v1.5.0 (2026-11-06)
- Version: one source (`package.json`), shown in the browser tab title, on the title screen and in benchmark reports.
  Numbering: 1.0 first complete build, +0.1 per playtest round of fixes.
- Touch controls: steering (◀ ▶) on the left, BRAKE / GAS on the right, gear ▲ ▼ above GAS with the manual gearbox,
  pause in the top-left corner. Multi-touch; thumbs can slide between steer buttons or between pedals. Shown in a race
  when touch is the input in use (from the start on phones/tablets, after the first touch on a touch-screen PC;
  keyboard or gamepad use hides them again). HUD makes room for them; portrait shows a "turn sideways" hint.
  Menus already work by tapping. Touch-first devices start on the Medium preset if nothing was saved yet.
  Tested with Chromium phone emulation (layout, multi-touch, accelerate/steer/brake/gears); not tried on a real device.

## v1.6.0 (2026-11-06)
- Menus on phones: every screen scrolls when its content does not fit (swipe to scroll; a swipe that starts on a
  button does not press it, a tap still does). Small screens get a compact layout (tighter spacing, smaller type,
  map gets a fixed height); portrait stacks the columns into one list; touch-first devices hide the
  keyboard/gamepad hint bar. Desktop layout unchanged (checked at 1920x1080: no scrolling, same sizes).
  Tested in Chromium phone emulation at 915x412 and 412x915 (swipe scroll, no accidental press, tap START).

## v1.7.0 (2026-11-06) — fuel in every Championship race
- Before: fuel only in Championship races over 15 km (12 of 64 races), rivals never pitted (they were slowed instead),
  and pit strips were drawn on every track — so the mechanic looked missing.
- Now: every Championship race uses fuel; the tank is sized per race (62–74 % of the distance) so exactly one stop is
  needed and the best-placed pit strip is always in reach. Fuel gauge always shown; grid screen states the tank range.
- Rivals really pit: one-stop strategy (pass a strip while the next is reachable, stop where one fill reaches the
  finish, fill only what is needed); each has its own stopping spot, fills in the outer half of the pit lane and
  arrives/leaves along the inner half; approach along the road edge so nobody clips the pit signs. In fuel races
  rivals run 1 % slower (the stops reshuffle a field you start at the back of).
- Arcade (no fuel): no pit signs (removed from the sim too, no invisible posts) and no pit-lane markings — the strip is
  a hard shoulder behind a solid edge line.
- Tested: all 32 Championship races — every car pits, nobody runs dry; Arcade results unchanged.

## v1.8.0 (2026-11-06) — backlit buildings
- Buildings between the camera and a low sun looked sunlit. Direct sunlight was correct (verified with a debug
  render: camera-facing faces got no sun); the brightness came from the haze — fog in-scatter used a wide glow
  around the sun, washing anything in front of it to the sky colour — plus uniform sky fill light.
- Fog sun in-scatter now concentrated close around the sun (pow 24 instead of 6); sky fill light is directional
  with a low sun (faces turned away from the sun get less, faces towards it more; flat ground unchanged);
  Motorway haze slightly thinner and its fill light lower. Checked Motorway, Marsh, Snow.

## v1.9.0 (2026-11-06) — terrain "wall" on the inside of tight bends
- Beyond the per-frame fold limit (inside of tight bends) terrain vertices were collapsed onto the limit line and
  dropped, forming a near-vertical curtain: lit like a wall, sand texture stretched into dark vertical bands, and
  flickering because the limit was sampled at positions that slid with the car.
- Now: terrain is squeezed smoothly towards the limit (no kink), only the far remainder sinks, normals ignore the
  sinking and texture/ground-type lookups use the squeezed position (the lip shades like the ground beside it);
  the limit's coarse samples sit at fixed track positions, so it no longer jitters as the car moves.

## v2.0.0 (2026-11-06) — detailed benchmark, Ultra Low and Psycho presets
- Benchmark (Settings → Benchmark) now runs on screen: 2 s warm-up, 30 s normal run, 6 s profiling, then 3 s at
  full and 3 s at half resolution with vsync bypassed. The report has:
  - average / 1 % / 0.1 % lows, p50/p95/p99 frame time, hitches, time below 60 fps, refresh, render resolution;
  - frame cost without vsync at full and half resolution, which tells GPU-fill-bound apart from geometry- or CPU-bound;
  - CPU time per frame, and draw calls, instances and vertices per frame;
  - a per-stage CPU/GPU table (sky, terrain, road, scenery, cars, particles, post, shadows, AO, MSAA resolve,
    simulation, HUD and the rest);
  - a plain-language "what limits this device" verdict;
  - the settings, the GPU name, WebGL limits, CPU threads, memory and browser;
  - fps for every second, with a chart of fps and render resolution, plus Copy report and Save report (.txt).
- GPU time per stage comes from GPU timer queries where the browser offers them. Otherwise the profiling phase makes
  the GPU finish at every stage boundary with a 1-pixel read-back (gl.finish() does not wait in Chrome). Stage times
  are then real, but that phase runs slower than normal play. Profiling is never active outside the benchmark.
- Ultra Low preset (new default on touch-first devices):
  - 75 % render scale with dynamic resolution down to 50 %, pixel ratio 1;
  - no MSAA, no bloom, draw distance ×0.36;
  - half the decorative scenery, no background woodland, 4 dynamic lights;
  - simplified sky and post-processing.
- Psycho preset (above Ultra):
  - a 4096² sun shadow map with 12-tap soft filtering: cars, trees, buildings, props and terrain cast real
    shadows, replacing blob shadows;
  - screen-space ambient occlusion and 8× MSAA;
  - draw distance ×1.45, with more woodland, particles and weather;
  - shadows are skipped at night and when the sun is very low.
- The presets are now Ultra Low, Low, Medium, High (default), Ultra and Psycho. Saved settings are migrated so a
  stored preset keeps its name.

## v2.0.1 (2026-11-07) — no more driving inside mesas and peaks; benchmark report scrolls
- Big rigid landmarks (Desert mesas up to 350 m across, Mountains peaks up to 900 m) could cover the road at the
  camera, so the player drove "inside" them (dark red ceiling over the road in Desert).
  - Cause: the vertex shader checked a landmark against the road only within about three footprints of its own
    stretch, and sampled the road as sparsely as 0.3 of its size. A mesa placed 1.1–1.9 km ahead, beside a stretch
    the bent view brought round towards the camera, was never tested against the road under the car. Psycho's longer
    view distance made this more common.
  - Fix (`src/render/landmarks.ts`): every frame the CPU places each landmark in view against the whole visible
    path, sampled every 10 m at fixed track positions plus both ends of the path. The landmark is pushed outwards
    until it clears every stretch, and left out if it cannot. The shader only reads the result, so the GPU does less
    work than before.
  - Test `tests/inside.test.ts` drives every course with landmarks in 6 m steps at Psycho view distance and checks
    the camera and the first 120 m of road against every landmark footprint. The old placement fails on 4 tracks
    (worst: 240 m inside a mesa on POLONNVHN21); the new one on none. Landmarks are never left out, and they never
    switch between shown and hidden.
  - `review/fix12/desert_mesa_before.png` / `_after.png`: the same frame on both builds.
- Benchmark screen on windows roughly 620–1100 px tall (most laptops, and full HD with browser bars): the screen
  body was squeezed to the window height and the panel's clipped corners hid the rest of the report, so there was
  nothing to scroll to. The body now grows with the report and the screen scrolls (mouse wheel, touch). Up / Down
  scroll it with keyboard or gamepad.

## Known issues / not verified
- Not measured: whether Ultra Low reaches ~60 fps on a mid-range phone, or what Psycho costs on the target PC.
  Only relative costs on a software GPU are known, per frame on an emulated phone: Ultra Low 1.4 s, Low 2.0 s,
  High 11.4 s, Psycho 45 s.
- Generated-track bot test (`npm run test:sim`): on Roadworks d1 the bot finishes the championship race 17th (it
  needs the top ten). v1.6.0 and v1.9.0 give the same result, so this predates the release; the 64 course tracks
  are unaffected.
- Frame rate not measured on the target PC (headless uses a software GPU). Use F3 and Settings → Benchmark.
- Firefox browser itself not run (only its JS engine); audio not listened to; gamepads not physically tested.
