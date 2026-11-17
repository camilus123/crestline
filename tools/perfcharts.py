#!/usr/bin/env python3
"""Draws the charts of docs/performance.md from docs/perf/benchmarks.json.

    python3 tools/perfcharts.py

Each chart is written twice (…-light.svg, …-dark.svg); the page picks one by the reader's colour scheme.
Plain SVG, no dependencies. Colours: four categorical hues in a fixed order (checked for colour-blind separation
on both surfaces), text always in ink colours, one axis per plot.
"""
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'docs', 'perf')
RUNS = json.load(open(os.path.join(OUT, 'benchmarks.json')))['runs']

THEME = {
    'light': dict(surface='#fcfcfb', ink='#0b0b0b', ink2='#52514e', muted='#898781', grid='#e1e0d9', axis='#c3c2b7',
                  series=['#2a78d6', '#eb6834', '#1baf7a', '#eda100'], quiet='#c3c2b7', border='rgba(11,11,11,0.10)'),
    'dark': dict(surface='#1a1a19', ink='#f0efec', ink2='#c3c2b7', muted='#898781', grid='#2c2c2a', axis='#383835',
                 series=['#3987e5', '#d95926', '#199e70', '#c98500'], quiet='#52514e', border='rgba(255,255,255,0.10)'),
}
FONT = 'system-ui,-apple-system,&quot;Segoe UI&quot;,sans-serif'


def vkey(v):
    return tuple(int(x) for x in v.split('.'))


def mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs)


def pick(device, browser, version=None, pacing=None):
    rs = [r for r in RUNS if r['device'] == device and r['browser'] == browser
          and (version is None or r['version'] == version) and (pacing is None or r['pacing'] == pacing)]
    return sorted(rs, key=lambda r: (vkey(r['version']), r['pacing']))


def preset(run, name):
    """the four cases of a preset; `name` also matches the player's own settings when they were that preset"""
    for k, cases in run['presets'].items():
        if k == name or k == 'Yours: ' + name:
            return cases
    if name == 'Admiral':  # before it was a preset it was the player's own settings: the same four values
        y = run.get('yours') or {}
        if y.get('diff') == 'msaa 8>0, dist 1.45>1.2, particles 1.5>1.25, weather 1.4>1.2':
            return run['presets'].get('Yours: ' + y['name'])
    return None


class Svg:
    def __init__(self, w, h, t, title, subtitle):
        self.w, self.h, self.t, self.p = w, h, t, []
        self.p.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="{FONT}" role="img" aria-label="{title}">')
        self.p.append(f'<rect x="0.5" y="0.5" width="{w - 1}" height="{h - 1}" rx="8" fill="{t["surface"]}" stroke="{t["border"]}"/>')
        self.text(20, 28, title, size=15, weight=600)
        self.text(20, 47, subtitle, size=12, fill=t['ink2'])

    def text(self, x, y, s, size=11, fill=None, anchor='start', weight=400):
        s = s.replace('&', '&amp;').replace('<', '&lt;')
        self.p.append(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{fill or self.t["ink"]}" text-anchor="{anchor}" font-weight="{weight}">{s}</text>')

    def line(self, x1, y1, x2, y2, stroke, width=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        self.p.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{width}"{d}/>')

    def path(self, pts, stroke):
        d = ' '.join(('M' if i == 0 else 'L') + f'{x:.1f} {y:.1f}' for i, (x, y) in enumerate(pts))
        self.p.append(f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>')

    def dot(self, x, y, fill, r=4):
        self.p.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{fill}" stroke="{self.t["surface"]}" stroke-width="2"/>')

    def bar(self, x, y, w, h, fill):
        """a horizontal bar from a baseline at x: square at the baseline, rounded at the data end"""
        w = max(w, 1.5)
        r = min(4, h / 2, w)
        self.p.append(f'<path d="M{x:.1f} {y:.1f}h{w - r:.1f}a{r} {r} 0 0 1 {r} {r}v{h - 2 * r:.1f}a{r} {r} 0 0 1 -{r} {r}h-{w - r:.1f}z" fill="{fill}"/>')

    def legend(self, x, y, items, kind='line'):
        for name, col in items:
            if kind == 'line':
                self.line(x, y - 4, x + 14, y - 4, col, 2)
                self.dot(x + 7, y - 4, col, 3)
            else:
                self.p.append(f'<rect x="{x}" y="{y - 9}" width="12" height="10" rx="2" fill="{col}"/>')
            self.text(x + (20 if kind == 'line' else 17), y, name, size=11, fill=self.t['ink2'])
            x += (20 if kind == 'line' else 17) + 6.2 * len(name) + 18

    def save(self, name, mode):
        self.p.append('</svg>')
        open(os.path.join(OUT, f'{name}-{mode}.svg'), 'w').write('\n'.join(self.p) + '\n')


def line_chart(name, mode, title, subtitle, versions, series, ymax, ystep, unit, fmt, ref=None, right=128, h=380):
    """series: [(label, {version: value})]; one y axis; every series labelled at its last point"""
    t = THEME[mode]
    w = 760
    s = Svg(w, h, t, title, subtitle)
    L, R, T, B = 46, w - right, 92, h - 40
    X = lambda i: L + 14 + (R - L - 28) * i / max(1, len(versions) - 1)
    Y = lambda v: B - (B - T) * v / ymax
    s.legend(20, 70, [(lab, t['series'][i]) for i, (lab, _) in enumerate(series)])
    if ref:  # the reference line is named in the legend row: inside the plot its label would sit on the lines
        x = 20 + sum(20 + 6.2 * len(lab) + 24 for lab, _ in series)
        s.line(x, 66, x + 18, 66, t['muted'], 1, '5 4')
        s.text(x + 24, 70, ref[1], size=11, fill=t['ink2'])
    v = 0
    while v <= ymax + 1e-9:
        s.line(L, Y(v), R, Y(v), t['axis'] if v == 0 else t['grid'])
        s.text(L - 8, Y(v) + 4, fmt(v), fill=t['muted'], anchor='end')
        v += ystep
    s.text(L - 8, T - 12, unit, fill=t['muted'], anchor='end')
    for i, ver in enumerate(versions):
        s.text(X(i), B + 18, ver, size=10, fill=t['muted'], anchor='middle')
    s.text((L + R) / 2, h - 8, 'version', size=10, fill=t['muted'], anchor='middle')
    if ref:
        s.line(L, Y(ref[0]), R, Y(ref[0]), t['muted'], 1, '5 4')
    ends = []
    for i, (lab, vals) in enumerate(series):
        pts = [(X(k), Y(vals[ver])) for k, ver in enumerate(versions) if ver in vals]
        s.path(pts, t['series'][i])
        for x, y in pts[:-1]:
            s.dot(x, y, t['series'][i], 2.5)
        s.dot(pts[-1][0], pts[-1][1], t['series'][i])
        last = [vals[ver] for ver in versions if ver in vals][-1]
        ends.append([pts[-1][1], pts[-1][0], f'{lab}  {fmt(last)} {unit}'])
    # end labels beside the last point; pushed apart only if two would touch (none do with these data)
    ends.sort()
    for k in range(1, len(ends)):
        ends[k][0] = max(ends[k][0], ends[k - 1][0] + 13)
    for y, x, lab in ends:
        s.text(x + 10, y + 4, lab, size=11)
    s.save(name, mode)


def pc_frame_cost(mode):
    runs = [r for r in pick('pc', 'Edge', pacing=False)]
    versions = [r['version'] for r in runs]
    series = []
    for nm in ['Low', 'High', 'Psycho', 'Admiral']:
        vals = {}
        for r in runs:
            c = preset(r, nm)
            if c:
                vals[r['version']] = mean(x['costMs'] for x in c)
        series.append((nm, vals))
    line_chart('pc-frame-cost', mode, 'PC: time to draw one frame, by version',
               'Radeon RX 9070, 3440x1440, Edge. Average of four tracks, GPU made to finish. Lower is better.',
               versions, series, 7, 1, 'ms', lambda v: f'{v:.2f}' if v % 1 else f'{v:.0f}',
               ref=(1000 / 240, 'one refresh at 240 Hz (4.17 ms)'))
    return versions, series


def shader_compile(mode):
    series, allv = [], set()
    for br in ['Edge', 'Firefox']:
        vals = {r['version']: r['compileAllMs'] / 1000 for r in pick('pc', br, pacing=False) if r['compileAllMs']}
        allv |= set(vals)
        series.append((br, vals))
    versions = sorted(allv, key=vkey)
    line_chart('shader-compile', mode, 'PC: time to compile the shaders at start-up, by version',
               'All shader programs built from scratch, no cache (what a first start waits for). Lower is better.',
               versions, series, 10, 2, 's', lambda v: f'{v:.1f}' if v % 1 else f'{v:.0f}', right=120, h=330)
    return versions, series


PHONE_BEFORE, PHONE_AFTER = '3.7.1', '3.9.1'


def phone_pacing(mode):
    t = THEME[mode]
    before = pick('phone', 'Mi Browser', PHONE_BEFORE, False)[0]
    after = pick('phone', 'Mi Browser', PHONE_AFTER, True)[0]
    names = ['Low', 'High', 'Admiral', 'Psycho']
    panels = [('Stalls in 20 s of racing', lambda c: sum(x['hitches'] for x in c), 160, 40, lambda v: f'{v:.0f}'),
              ('Longest frame, ms', lambda c: max(x['worst'] for x in c), 160, 40, lambda v: f'{v:.0f}')]
    w, h = 760, 330
    s = Svg(w, h, t, 'Phone: stalls before and after frame pacing',
            'Xiaomi 17T, Mi Browser, 120 Hz. Four tracks of 5 s per preset. Lower is better.')
    s.legend(20, 70, [(f'v{PHONE_BEFORE}, no pacing', t['quiet']), (f'v{PHONE_AFTER}, pacing on', t['series'][0])], kind='box')
    out = []
    for k, (ptitle, f, xmax, xstep, fmt) in enumerate(panels):
        L = 86 + k * 372
        R = L + 250
        T, B = 112, h - 38
        s.text(L, 96, ptitle, size=12, weight=600)
        X = lambda v: L + (R - L) * v / xmax
        v = 0
        while v <= xmax:
            s.line(X(v), T, X(v), B, t['axis'] if v == 0 else t['grid'])
            s.text(X(v), B + 16, fmt(v), size=10, fill=t['muted'], anchor='middle')
            v += xstep
        band = (B - T) / len(names)
        for i, nm in enumerate(names):
            y = T + band * i + band / 2
            s.text(L - 10, y + 4, nm, anchor='end', fill=t['ink2'])
            a, b = f(preset(before, nm)), f(preset(after, nm))
            out.append((ptitle, nm, a, b))
            s.bar(L, y - 13, X(a) - L, 12, t['quiet'])
            s.text(X(a) + 6, y - 3, fmt(a), size=11)
            s.bar(L, y + 1, X(b) - L, 12, t['series'][0])
            s.text(X(b) + 6, y + 11, fmt(b), size=11)
    s.save('phone-pacing', mode)
    return out


def phone_presets(mode):
    t = THEME[mode]
    run = pick('phone', 'Mi Browser', PHONE_AFTER, True)[0]
    rows = []
    for nm in ['Low', 'Commodore', 'Admiral', 'High', 'Psycho']:
        c = preset(run, nm)
        rows.append((nm, mean(x['fps'] for x in c), mean(x['costMs'] for x in c), sum(x['hitches'] for x in c),
                     sorted(set(round(x['rhythm']) for x in c))))
    rows.sort(key=lambda r: -r[1])
    w, h = 760, 300
    s = Svg(w, h, t, f'Phone: frame rate of each preset (v{PHONE_AFTER}, frame pacing on)',
            'Xiaomi 17T, Mi Browser, 120 Hz screen. Average of four tracks. Higher is better.')
    L, R, T, B = 104, 520, 74, h - 40
    X = lambda v: L + (R - L) * v / 120
    for v, lab in [(0, '0'), (30, '30'), (40, '40'), (60, '60'), (120, '120 fps')]:
        s.line(X(v), T, X(v), B, t['axis'] if v == 0 else t['grid'])
        s.text(X(v), B + 16, lab, size=10, fill=t['muted'], anchor='middle')
    s.text(R + 64, T - 6, 'a frame is drawn on', size=10, fill=t['muted'])
    band = (B - T) / len(rows)
    o = {1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th'}
    for i, (nm, fps, cost, hit, rh) in enumerate(rows):
        y = T + band * i + band / 2
        s.text(L - 10, y + 4, nm, anchor='end', fill=t['ink2'])
        s.bar(L, y - 8, X(fps) - L, 16, t['series'][0])
        s.text(X(fps) + 7, y + 4, f'{fps:.1f}', size=11)
        lab = 'every refresh' if rh == [1] else f'every {o[rh[0]]} refresh' if len(rh) == 1 else f'every {o[rh[0]]} to {o[rh[-1]]} refresh'
        s.text(R + 64, y + 4, lab, size=11, fill=t['ink2'])
    s.save('phone-presets', mode)
    return rows


if __name__ == '__main__':
    for mode in ('light', 'dark'):
        a = pc_frame_cost(mode)
        b = shader_compile(mode)
        c = phone_pacing(mode)
        d = phone_presets(mode)
    print('versions', a[0])
    for lab, vals in a[1]:
        print(lab, {k: round(v, 2) for k, v in vals.items()})
    for lab, vals in b[1]:
        print(lab, {k: round(v, 2) for k, v in vals.items()})
    for row in c:
        print(row)
    for row in d:
        print(row[0], round(row[1], 1), round(row[2], 2), row[3], row[4])
