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

# Stamp every local asset URL with a hash of the build. A browser holding
# yesterday's app.css against today's index.html is the whole reason a fix can
# look like it never shipped; a changed URL cannot be served from cache.
import hashlib, re

digest = hashlib.sha256()
for d, _, fs in sorted(os.walk(os.path.join(OUT, 'assets'))):
    for f in sorted(fs):
        digest.update(open(os.path.join(d, f), 'rb').read())
ver = digest.hexdigest()[:10]

index = os.path.join(OUT, 'index.html')
html = open(index).read()
html = re.sub(r'(?<=["\'])(assets/[^"\'#?]+)(?=["\'])', r'\1?v=' + ver, html)
# If the stamp ever stops matching (a new tag, a changed quote style), the
# symptom is a browser quietly serving last week's app against this week's
# HTML - which looks exactly like the fix never shipped. Fail the build here
# instead.
missed = [u for u in re.findall(r'["\'](assets/[^"\']+)["\']', html) if '?v=' not in u]
if missed:
    raise SystemExit('unstamped asset URLs: ' + ', '.join(missed))

open(index, 'w').write(html)
print('asset version', ver, '- %d urls stamped' % html.count('?v=' + ver))

n = sum(len(f) for _, _, f in os.walk(OUT))
size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(OUT) for f in fs)
print('deploy/  %d files  %.0f KB' % (n, size / 1024))
