"""Bundle the app into one self-contained HTML file.

Used for the shareable preview: the Artifact host supplies the doctype, <head>
and <body>, so this emits the page content only - <title>, the stylesheet, the
markup from index.html, and every script inlined in load order.

    python3 tools/build_single_file.py [output.html]
"""
import os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'robobox-sales-os.html')

def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()

html = read('index.html')

# The markup between <body> and </body>, minus the <script src> tags we inline below.
body = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body).strip()

# Load order matters: each module reads the ones above it at definition time.
SCRIPTS = ['seed-data.js', 'util.js', 'store.js', 'auth.js', 'metrics.js',
           'charts.js', 'components.js', 'views-sales.js', 'views-ceo.js', 'app.js']

parts = [
    '<title>Robobox Sales OS</title>',
    '<style>\n' + read('assets', 'css', 'app.css') + '\n</style>',
    body,
    '<script>window.RB = { PREVIEW: true };</script>',
]
for name in SCRIPTS:
    parts.append('<script>\n/* ' + name + ' */\n' + read('assets', 'js', name) + '\n</script>')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n\n'.join(parts) + '\n')

print('wrote', OUT, '(%.0f KB)' % (os.path.getsize(OUT) / 1024))
