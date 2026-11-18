# SMAA

Crestline's optional anti-aliasing (Graphics options → Anti-aliasing (SMAA)) is SMAA 1x:
"SMAA: Enhanced Subpixel Morphological Antialiasing", Jorge Jimenez, Jose I. Echevarria, Tiago Sousa and
Diego Gutierrez, 2012. Project: https://github.com/iryoku/smaa

Copyright (C) 2013 Jorge Jimenez, Jose I. Echevarria, Belen Masia, Fernando Navarro, Diego Gutierrez.
MIT licence: `LICENSE.txt` in this folder, as downloaded. The rest of Crestline is GPL-3.0.

## What comes from that project

| In Crestline | From | How |
|---|---|---|
| `src/render/smaatables.ts` | `Textures/AreaTex.h`, `Textures/SearchTex.h` | The two lookup tables, byte for byte the same content, stored compressed. Made by `tools/smaatables.py`; `tests/smaatables.test.ts` checks the unpacked bytes against the SHA-256 of the originals. |
| `src/render/smaa.ts` (the three shaders) | `SMAA.hlsl` | A port by hand to GLSL ES 3.00, "high" settings. The differences are listed at the top of that file. |
| `SMAA.hlsl` in this folder | `SMAA.hlsl` | Unchanged copy. Not part of the game: `tests/smaaref.mjs` compiles it and compares the port with it, texel by texel. |

Downloaded 2026-11-18 from the `master` branch. SHA-256, first 16 hex digits: `SMAA.hlsl` 4db53d92ef0b4566,
`AreaTex.h` 1933bf43ce86ba71, `SearchTex.h` 1fac315ab5f87b60.

No other part of Crestline's code comes from another project.
