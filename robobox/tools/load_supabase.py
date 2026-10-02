"""Push the imported workbook into the Supabase tables, once.

    export SUPABASE_URL=https://xxxx.supabase.co
    export SUPABASE_SERVICE_KEY=...        # Project Settings -> API -> service_role
    python3 tools/load_supabase.py [--dry-run]

The service-role key bypasses row-level security, which is why this runs in a
terminal and the key never goes near the page. Set it in the shell, not in a
file, and do not commit it.

Seed ids look like SCH-03fa483e9a; the columns are uuid. Every id is mapped to
a deterministic uuid (uuid5 of the seed id), so re-running this maps the same
row to the same uuid instead of duplicating the book.
"""
import json, os, re, sys, urllib.request, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
DRY = '--dry-run' in sys.argv

if not DRY and not (URL and KEY):
    raise SystemExit('Set SUPABASE_URL and SUPABASE_SERVICE_KEY first (see the docstring).')

NS = uuid.UUID('6f9619ff-8b86-d011-b42d-00c04fc964ff')      # any fixed namespace
def uid(seed_id):
    """Same seed id in, same uuid out - so a re-run updates instead of doubling."""
    return str(uuid.uuid5(NS, str(seed_id))) if seed_id else None

raw = open(os.path.join(ROOT, 'assets', 'js', 'seed-data.js'), encoding='utf-8').read()
seed = json.loads(raw[raw.index('=') + 1:].rstrip().rstrip(';'))

def snake(k):
    return re.sub(r'(?<!^)(?=[A-Z])', '_', k).lower()

# field -> column, mirroring assets/js/store-supabase.js
KEEP = {
    'school': ['id', 'name', 'location', 'region', 'cluster', 'board', 'students',
               'stemLab', 'labType', 'labSpend', 'existingLab', 'competitor',
               'leadSource', 'referredBy', 'ownerKey', 'origin', 'createdAt'],
    'contact': ['id', 'schoolId', 'name', 'role', 'phone', 'email'],
    'opportunity': ['id', 'schoolId', 'offering', 'variant', 'ownerKey', 'coOwners',
                    'initialPotential', 'currentNeed', 'decisionMaker', 'stage',
                    'probability', 'expectedClosure', 'status', 'closedValue',
                    'finalValue', 'lossReason', 'holdReason', 'closedAt', 'origin',
                    'createdAt'],
    'connect': ['id', 'schoolId', 'opportunityId', 'kind', 'mode', 'contactId',
                'response', 'interest', 'blocker', 'blockerDetail', 'changed',
                'commercial', 'notes', 'remarks', 'stage', 'expectedValue',
                'probability', 'expectedClosure', 'nextAction', 'nextActionOwner',
                'nextActionAt', 'origin', 'at'],
}
IDS = {'id', 'schoolId', 'opportunityId', 'contactId'}

def row(table, src, users_by_key):
    out = {}
    for f in KEEP[table]:
        if f not in src:
            continue
        v = src[f]
        if f in IDS:
            v = uid(v)
        out[snake(f)] = v
    if table == 'connect':
        # logged_by is the author's auth user id, which only exists once the
        # people are created in Authentication -> Users.
        who = src.get('by')
        auth_id = users_by_key.get(who)
        if not auth_id:
            return None
        out['logged_by'] = auth_id
        out.setdefault('kind', 'Reconnect')
    return out

def post(table, rows):
    if DRY:
        print('%-12s %4d rows' % (table, len(rows)))
        if rows:
            print('             e.g.', json.dumps(rows[0])[:160])
        return
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        req = urllib.request.Request(
            URL + '/rest/v1/' + table,
            data=json.dumps(chunk).encode(),
            headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
                     'Content-Type': 'application/json',
                     'Prefer': 'resolution=merge-duplicates,return=minimal'},
            method='POST')
        with urllib.request.urlopen(req) as r:
            r.read()
        print('%-12s %d/%d' % (table, min(i + 500, len(rows)), len(rows)))

# connects need the auth user id of whoever logged them
users_by_key = {}
if not DRY:
    req = urllib.request.Request(URL + '/rest/v1/app_user?select=id,email',
                                 headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    with urllib.request.urlopen(req) as r:
        by_email = {u['email']: u['id'] for u in json.loads(r.read())}
    for u in seed['users']:
        if u['email'] in by_email:
            users_by_key[u['id']] = by_email[u['email']]
    missing = [u['name'] for u in seed['users'] if u['id'] not in users_by_key]
    if missing:
        raise SystemExit('No app_user row yet for: ' + ', '.join(missing) +
                         '\nCreate them under Authentication -> Users, insert the '
                         'matching app_user rows, then re-run.')
else:
    users_by_key = {u['id']: uid(u['id']) for u in seed['users']}

for table, src_key in [('school', 'schools'), ('contact', 'contacts'),
                       ('opportunity', 'opportunities'), ('connect', 'connects')]:
    rows = [r for r in (row(table, x, users_by_key) for x in seed[src_key]) if r]
    skipped = len(seed[src_key]) - len(rows)
    post(table, rows)
    if skipped:
        print('             (%d %s skipped - no matching app_user)' % (skipped, table))

print('done' if not DRY else 'dry run - nothing written')
