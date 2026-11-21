# Crestline: Maximum Drive

A browser racing game in the spirit of early-90s arcade racers: a road that sweeps and crests ahead of you,
twenty cars on the grid, thirteen kinds of scenery, and a code for every track. The whole game is one
self-contained HTML file, with no server, no downloads and no network requests. Every model, texture and sound is
generated in code.

| | |
|---|---|
| **Play** | https://camilus123.github.io/crestline/ (v3.10.8) |
| **Branches** | `main` is the released version; `v3` is where development continues |

## What's in it

- **Racing:** arcade courses against the clock with checkpoints, and a championship with points, fuel and pit
  stops. One player or two in split screen. Three cars with different handling; automatic or manual gears.
- **Tracks:** thirteen scenarios (Rally, Futuristic, Night, Marsh, Mountains, Snow, Roadworks, Storm, Desert, Fog,
  Motorway, Wind, Forest), each with its own surface, weather, hazards and scenery. Every track comes from an
  11-character code, and a track constructor lets you set curves, hills, length and difficulty and share the code.
- **Controls:** keyboard, gamepad, or on-screen touch controls on phones and tablets. All keys can be rebound.
- **Graphics:** a custom WebGL2 renderer. Quality presets from Ultra Low (phones) to Psycho (sun shadows,
  ambient occlusion, 8x anti-aliasing), plus Admiral (Psycho without anti-aliasing) and Commodore (shadows and
  ambient occlusion at a phone's price: 80 % resolution, SMAA anti-aliasing, simple sky), and every option a preset
  sets can be changed on its own. SMAA is a second kind of anti-aliasing (on in Commodore, an option everywhere
  else): it smooths edges after the picture is drawn, including those of leaves and road markings. The game pauses, and stops drawing, while its window is not in focus.
  A phone or tablet picks its preset on its first start by timing a few frames: Commodore if it draws that at
  30 fps with room to spare, else Low, else Ultra Low (Settings can measure again; a preset you pick is never
  changed). If the browser takes the graphics context away, the game says so and offers a restart on a lighter
  preset.
- **Benchmark:** a fixed suite (four tracks at six presets, plus your own settings if they differ; a preset that
  falls under 10 fps on a device is given up, together with the heavier ones) that reports frame rate,
  frame cost, the cost of each render stage and how long each shader program takes to compile, as text you
  can copy.
- **Performance history:** [docs/performance.md](docs/performance.md) charts how frame cost, start-up and
  phone smoothness changed from version to version, from the benchmark reports of four devices.

## Controls (defaults)

| | Player 1 | Player 2 |
|---|---|---|
| Steer | Left / Right arrows | A / D |
| Accelerate | Space | Left Shift |
| Brake | Down arrow | S |
| Gear up / down (manual) | X / Z | E / Q |
| Pause | Esc or P | |

F2 toggles fullscreen and F3 the performance monitor. Gamepads work as soon as a button is pressed.

## Build

Needs Node.js. Nothing is installed outside this folder.

```
npm install
npm run build     # writes dist/crestline.html
npm run check     # type check
```

Source is TypeScript in `src/`; `build.mjs` bundles it with esbuild into the single HTML file.

## Tests

The tests live in `tests/`. Some run in Node, some drive the built game in headless Chromium through Playwright
(not a listed dependency: install it yourself if you want to run those).

```
npm run test:gen                 # track generator
npm run test:sim                 # bots must be able to finish every course
node tests/flow.mjs              # title screen to a race: no errors, no network requests
node tests/benchrun.mjs 128x72   # the benchmark end to end (cut-down suite)
node tests/smaaref.mjs           # the SMAA passes against the upstream shader (see the header for the two steps before it)
```

## Branches

- `main`: the released version (v3.10.8), served by the play link above.
- `v3`: where development continues. v2.0.2, the previous release, is in the history of `main`.

`PROGRESS.md` is the full change history, including what was measured and what was not.

## Known issues

- **Mountains** has visual artefacts that are staying for now. The world is a strip of terrain along the road,
  bent each frame so the road ahead straightens, with a painted sky behind. With mountain-sized hills the edges of
  that strip can show, with the backdrop visible behind them.
- **Benchmark:** the last part of each run forces the graphics card to finish every frame, so the picture slows
  and stutters there; that is the measurement, not a hang, but it looks like one. On Firefox this also overstates
  the frame cost. Track loading can leak a hitch into the measured part of a run.
- Dunes on Desert can appear to move in bends; the cause is not found yet.

More in the "Known issues" section of `PROGRESS.md`.

## Licence

GPL-3.0, see `LICENSE`. Crestline uses no name, logo, asset, music or text from any existing game or car maker.

Third-party parts, each under its own licence:

- **SMAA** (the optional anti-aliasing: its two lookup tables, and shaders ported from its reference shader):
  Copyright (C) 2013 Jorge Jimenez, Jose I. Echevarria, Belen Masia, Fernando Navarro, Diego Gutierrez; MIT
  licence. Details and the licence text: `third_party/smaa/`.
- **Fonts** built into the page: Chakra Petch, Russo One and Share Tech Mono, SIL Open Font License 1.1, from
  the Fontsource packages (`node_modules/@fontsource/*/LICENSE`).
