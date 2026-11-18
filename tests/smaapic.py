# Error of each anti-aliasing variant against the 4x4 supersampled frame (see smaapic.mjs).
import sys
import numpy as np
from PIL import Image

out, name, variants = sys.argv[1], sys.argv[2], sys.argv[3:]
lin = lambda a: (a.astype(np.float64) / 255.0) ** 2.2
big = lin(np.asarray(Image.open(f'{out}/{name}-truth4x.png').convert('RGB')))
h, w = big.shape[0] // 4, big.shape[1] // 4
blocks = big[:h * 4, :w * 4].reshape(h, 4, w, 4, 3)
truth = blocks.mean(axis=(1, 3))
# pixels with an edge through them: the 16 samples disagree
spread = blocks.max(axis=(1, 3)).max(axis=2) ** (1 / 2.2) - blocks.min(axis=(1, 3)).min(axis=2) ** (1 / 2.2)
mask = spread > 0.2
enc = lambda a: np.clip(a, 0, 1) ** (1 / 2.2)
Image.fromarray((enc(truth) * 255 + 0.5).astype(np.uint8)).save(f'{out}/{name}-truth.png')
load = lambda v: np.asarray(Image.open(f'{out}/{name}-{v}.png').convert('RGB')).astype(np.float64) / 255.0
err = {v: np.abs(load(v) - enc(truth)).mean(axis=2) * 255 for v in variants}
for v in variants:
    # where this variant changed the picture (against the first variant, no anti-aliasing): was it for the better?
    ch = np.abs(load(v) - load(variants[0])).max(axis=2) > 2 / 255
    line = f'{v:14s} {err[v][mask].mean():6.2f} levels of 255 mean error on the {mask.mean() * 100:.1f} % of pixels with an edge in them; {err[v][~mask].mean():5.2f} elsewhere'
    if ch.any():
        better = (err[v][ch] < err[variants[0]][ch] - 0.5).mean() * 100
        worse = (err[v][ch] > err[variants[0]][ch] + 0.5).mean() * 100
        line += f'; changed {ch.mean() * 100:.1f} % of the pixels, error there {err[variants[0]][ch].mean():.2f} -> {err[v][ch].mean():.2f} ({better:.0f} % of them closer, {worse:.0f} % further)'
        print(f'changed {v} {err[variants[0]][ch].mean():.3f} {err[v][ch].mean():.3f}', file=sys.stderr)
    print(line)
