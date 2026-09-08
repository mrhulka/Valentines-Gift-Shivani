"""Assemble the deployable static site into ./deploy at the repo root.

Keeps the published surface explicit: only what the browser needs goes in, so
source, docs and build tooling are never reachable by URL.

    python3 robobox/tools/make_site.py
"""
import os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'robobox')
OUT = os.path.join(ROOT, 'deploy')

INCLUDE = ['index.html', 'assets', 'robots.txt', 'netlify.toml', 'vercel.json']

if os.path.isdir(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)

for name in INCLUDE:
    src = os.path.join(SRC, name)
    dst = os.path.join(OUT, name)
    if os.path.isdir(src):
        shutil.copytree(src, dst)
    elif os.path.isfile(src):
        shutil.copy2(src, dst)
    else:
        raise SystemExit('missing: ' + src)

# seed-data.js is generated, so ship it minified - it is a third of the payload.
seed = os.path.join(OUT, 'assets', 'js', 'seed-data.js')
raw = open(seed).read()
import json
data = json.loads(raw[raw.index('=') + 1:].rstrip().rstrip(';'))
open(seed, 'w').write('window.ROBOBOX_SEED=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';')

n = sum(len(f) for _, _, f in os.walk(OUT))
size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(OUT) for f in fs)
print('deploy/  %d files  %.0f KB' % (n, size / 1024))
