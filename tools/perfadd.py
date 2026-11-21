#!/usr/bin/env python3
"""Adds benchmark reports to docs/perf/benchmarks.json.

    python3 tools/perfadd.py report.txt [more.txt ...]

A file may hold several reports (text pasted together). A report already in the data (same version and time) is
skipped; picture cost tests are skipped too (they are not benchmark runs). Then run tools/perfcharts.py.
"""
import json, os, re, sys

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'perf', 'benchmarks.json')


def device(gpu):
    if 'RX 9070' in gpu or 'R9 200' in gpu:  # (Firefox reports the same card as "R9 200 Series ... or similar")
        return 'pc', 'PC (Radeon RX 9070, Ryzen 9 5950X, 3440x1440, 240 Hz)'
    if 'Mali-G720' in gpu:
        return 'phone', 'Phone (Xiaomi 17T, Mali-G720 MC8)'
    if 'Intel' in gpu:
        return 'laptop', 'Laptop (Intel Core 5 120U, integrated graphics, 60 Hz)'
    if 'GE8320' in gpu or 'PowerVR' in gpu:
        return 'oldphone', 'Old phone (Xiaomi 23129RN51X, PowerVR Rogue GE8320, 2 GB)'  # (Edge names the GPU "PowerVR SGX Doma")
    return 'other', gpu


def browser(ua):
    return 'Mi Browser' if 'MiuiBrowser' in ua else 'Edge' if 'Edg/' in ua or 'EdgA/' in ua else 'Firefox' if 'Firefox' in ua else 'Brave' if 'Android' in ua else 'Chrome' if 'Chrome' in ua else '?'


def parse(text):
    for m in re.finditer(r'^\{"v":.*$', text, re.M):
        j = json.loads(m.group(0))
        if j.get('probe'):
            continue
        pre = text[:m.start()]
        ua = (re.findall(r'^browser\s+(.*)$', pre, re.M) or ['?'])[-1]
        st = re.findall(r'^start-up\s+([\d.]+) s', pre, re.M)
        key, name = device(j['gpu'])
        br = browser(ua)
        if key == 'oldphone' and br == 'Brave':
            br = 'Chrome'  # (its user agent is plain Chrome's; Brave would look the same)
        presets = {}
        for c in j['cases']:
            case = {
                'track': c['track'], 'fps': round(c['fps'], 2), 'low1': round(c['low1'], 2), 'costMs': c['costMs'], 'cpuMs': c['cpuMs'],
                'p99': c['p99'], 'worst': c['worst'], 'hitches': c['hitches'], 'rhythm': c.get('rhythm')}
            smaa = (c.get('stages') or {}).get('anti-aliasing (SMAA)')
            if smaa is not None:
                case['smaaMs'] = smaa  # (the stage's own time, where the option was on)
            presets.setdefault(c['settings'], []).append(case)
        cm = j.get('compileMs')
        yield {'version': j['v'], 'when': j.get('when'), 'device': key, 'deviceName': name, 'browser': br, 'refreshHz': j.get('hz'),
               'output': j.get('out'), 'pacing': bool(j.get('pace')), 'startupS': float(st[-1]) if st else None,
               'compileAllMs': cm.get('together') if isinstance(cm, dict) else None, 'yours': j.get('yours'), 'presets': presets,
               **({'gaveUp': j['gaveUp'], 'skipped': j['skipped']} if j.get('gaveUp') else {})}


def vkey(v):
    return tuple(int(x) for x in v.split('.'))


def save(d):
    d['runs'].sort(key=lambda r: (r['device'], r['browser'], vkey(r['version']), r['pacing'], r['when'] or ''))
    with open(DATA, 'w') as f:
        f.write('{\n "note": ' + json.dumps(d['note']) + ',\n "runs": [\n')
        f.write(',\n'.join('  ' + json.dumps(r, separators=(',', ':')) for r in d['runs']))
        f.write('\n ]\n}\n')


if __name__ == '__main__':
    d = json.load(open(DATA))
    have = {(r['version'], r['when']) for r in d['runs']}
    for path in sys.argv[1:]:
        for r in parse(open(path, errors='replace').read()):
            if (r['version'], r['when']) in have:
                print('already there:', r['version'], r['when'], r['device'], r['browser'])
                continue
            have.add((r['version'], r['when']))
            d['runs'].append(r)
            print('added:', r['version'], r['when'], r['device'], r['browser'], 'pacing on' if r['pacing'] else 'pacing off', list(r['presets']))
    save(d)
