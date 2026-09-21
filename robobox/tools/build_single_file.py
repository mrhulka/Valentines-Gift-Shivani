"""Bundle the app into one self-contained HTML file.

Used for the shareable preview: the Artifact host supplies the doctype, <head>
and <body>, so this emits the page content only - <title>, the stylesheet, the
markup from index.html, and every script inlined in load order.

    python3 tools/build_single_file.py [output.html]
"""
import os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'robobox-connect.html')

def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()

html = read('index.html')

def inline_images(text):
    """The bundle is one file, so every assets/img reference becomes a data URI."""
    import base64
    def sub(m):
        path = m.group(1)
        with open(os.path.join(ROOT, path), 'rb') as f:
            return 'data:image/webp;base64,' + base64.b64encode(f.read()).decode()
    return re.sub(r'(?:\.\./|)(assets/img/[\w.-]+\.webp)', sub, text)

html = inline_images(html)

# The markup between <body> and </body>, minus the <script src> tags we inline below.
body = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body).strip()

# Load order matters: each module reads the ones above it at definition time.
SCRIPTS = ['seed-data.js', 'util.js', 'model.js', 'store.js', 'auth.js',
           'charts.js', 'ui.js', 'filters.js', 'excel.js', 'connect-form.js',
           'views.js', 'ceo.js', 'app.js']

parts = [
    '<title>Robobox Connect</title>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">',
    # The vendored copy has non-UTF-8 bytes in its codepage tables, so the
    # single-file build loads SheetJS from the CDN instead of inlining it.
    # index.html keeps the local copy, which works offline.
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>',
    '<style>\n' + inline_images(read('assets', 'css', 'app.css')) + '\n</style>',
    body,
    '<script>window.RB = { PREVIEW: true };</script>',
]
for name in SCRIPTS:
    parts.append('<script>\n/* ' + name + ' */\n' + inline_images(read('assets', 'js', name)) + '\n</script>')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n\n'.join(parts) + '\n')

print('wrote', OUT, '(%.0f KB)' % (os.path.getsize(OUT) / 1024))
