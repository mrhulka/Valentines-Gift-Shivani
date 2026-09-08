"""Convert the Robobox master workbook into the app's seed JSON.

Rules:
  - Nothing is invented. Where the source has no value the field stays null.
  - Where a stage can be *suggested* from evidence it is written to
    suggestedStage with the phrase that triggered it, never to stage.
"""
import openpyxl, json, re, hashlib, datetime, collections, os

SRC = os.environ.get('ROBOBOX_XLSX', 'ROBOBOX_MASTER_CLEANED_PIPELINE_1.xlsx')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'js', 'seed-data.js')

wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb['CLEAN MASTER']
rows = list(ws.iter_rows(values_only=True))
hdr = [str(h).strip() for h in rows[0]]
raw = [dict(zip(hdr, r)) for r in rows[1:]]

aq = wb['ACTION QUEUE']
aq_rows = list(aq.iter_rows(values_only=True))
aq_hdr = [str(h).strip() for h in aq_rows[0]]
action_keys = set()
for r in aq_rows[1:]:
    d = dict(zip(aq_hdr, r))
    action_keys.add((str(d.get('School Name') or '').strip().upper(),
                     str(d.get('Location') or '').strip().upper()))

def s(v):
    if v is None:
        return None
    t = str(v).strip()
    return t or None

def num(v):
    try:
        f = float(str(v).replace(',', '').strip())
        return f if f == f else None
    except (TypeError, ValueError):
        return None

# ---------------------------------------------------------------- owners
OWNER_FIX = {'AYUSH': 'AYUSH', 'PARTH': 'PARTH', 'SID': 'SID',
             'VIKAS': 'VIKAS', 'MANISH': 'MANISH'}

def owners(v):
    t = s(v)
    if not t:
        return []
    parts = re.split(r'\s*(?:&|\+|/|,| AND )\s*', t.upper())
    out = []
    for p in parts:
        p = p.strip()
        if p in OWNER_FIX and OWNER_FIX[p] not in out:
            out.append(OWNER_FIX[p])
    return out

# ---------------------------------------------------------------- lead source
SOURCE_FIX = {
    'ELDROCKS': 'ELDROCKS', 'ELDOCKS': 'ELDROCKS', 'PUNE ELDROCKS': 'ELDROCKS',
    'ALICE REFF-ELDROCKS': 'ELDROCKS', 'COLD': 'COLD', 'COLDS': 'COLD',
    '91 MEDIA': '91 MEDIA', 'BNI': 'BNI',
}
def source(v):
    t = s(v)
    if not t:
        return None, None
    u = t.upper()
    if u in SOURCE_FIX:
        return SOURCE_FIX[u], (t if SOURCE_FIX[u] != u else None)
    if u in ('ADVANI', 'SAURAV', 'TEJAS REF', 'SAWANT', 'HARSHITHA NEW SCHOOL'):
        return 'REFERRAL', t
    if 'PARTH' in u:
        return 'INTERNAL', t
    return 'OTHER', t

# ---------------------------------------------------------------- board
def boards(v):
    """Split the multi-board strings and fold the variants onto one vocabulary.
    IB's three programmes (PYP/MYP/DP) are one board, not three."""
    t = s(v)
    if not t:
        return []
    u = t.upper()
    out = []

    def add(b):
        if b not in out:
            out.append(b)

    if re.search(r'\bIB\b|PYP|MYP|\bDP\b', u):
        add('IB')
    if 'CBSE' in u:
        add('CBSE')
    if 'ICSE' in u or 'ISC' in u:
        add('ICSE')
    if 'STATE BOARD' in u or 'MSBSHSE' in u:
        add('STATE BOARD')
    if 'CAMBRIDGE' in u or 'IGCSE' in u:
        add('CAMBRIDGE')
    if 'STEINER' in u or 'WALDORF' in u:
        add('STEINER / WALDORF')
    return out

# ---------------------------------------------------------------- dates
MONTHS = {'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
          'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12}
# The workbook's only machine dates sit in 2025 (2025-08, 2025-11) and the
# text dates run Jan->Aug of the same cycle, so bare month names resolve to 2025.
BASE_YEAR = 2025

def parse_contacted(v):
    """-> (iso_date|None, precision, raw)  precision: exact|day|month|none"""
    if isinstance(v, datetime.datetime):
        return v.date().isoformat(), 'exact', v.date().isoformat()
    t = s(v)
    if not t:
        return None, 'none', None
    u = t.upper()
    if 'NOT CONTACT' in u or 'NOT CONATCT' in u:
        return None, 'none', t
    if 'EXISTING' in u:
        return None, 'none', t
    m = re.search(r'(\d{1,2})\s*(?:ST|ND|RD|TH)?\s*([A-Z]{3,9})', u)
    if m:
        mon = MONTHS.get(m.group(2)[:3])
        if mon:
            day = int(m.group(1))
            year = BASE_YEAR
            try:
                return datetime.date(year, mon, day).isoformat(), 'day', t
            except ValueError:
                pass
    for name, mon in MONTHS.items():
        if name in u:
            # week-of-month phrasing lands mid-month; flagged as month precision
            return datetime.date(BASE_YEAR, mon, 15).isoformat(), 'month', t
    if 'LAST YEAR' in u:
        return datetime.date(BASE_YEAR - 1, 10, 15).isoformat(), 'month', t
    return None, 'none', t

# ---------------------------------------------------------------- blockers
BLOCKER_RULES = [
    ('PRICE',        r'PRIC|PAYING CAP|CHEAP|BUDGET|COST|EXPENSIVE|LOW PAY|FINANC|FEES'),
    ('ACCESS',       r'DOES NOT MEET|DOESNT MEET|CANT FIND A MEET|NO MEET|NOT MEET|DIFFICULT TO MEET|HARD TO MEET|NO RESPON|NOT RESPON|UNAVAIL'),
    ('DECISION',     r'MGMT|MANAGEMENT|TRUSTEE|DECISION|SLOW|TAKES TIME|APPROVAL|BOARD|DOUBTFUL|COMMITTEE'),
    ('INCUMBENT',    r'ALREADY (HAVE|HAS|WORKING)|EXISTING VENDOR|TIED UP|CONTRACT|CHOSE '),
    ('TRUST',        r'TRUST|RECOUP|CONVINC|CONFIDEN|PROOF|DOUBT'),
    ('TIMING',       r'NEXT YEAR|ACADEMIC|SESSION|AFTER EXAM|VACATION|HOLIDAY|POSTPON|DEFER'),
    ('CAPACITY',     r'LOW STRENGTH|SMALL SCHOOL|SPACE|INFRA|LAB'),
]
def blocker_tags(v):
    t = s(v)
    if not t:
        return []
    u = t.upper()
    tags = [name for name, pat in BLOCKER_RULES if re.search(pat, u)]
    return tags or ['OTHER']

# ---------------------------------------------------------------- competition
COMP_FIX = {
    'RCOM CHENNAI': 'RCOM', 'KITS FROM STEMROBO': 'STEMROBO',
    'EDUVATE IN OTHER BRANCHES': 'EDUVATE', 'AEROBAY QUEST PLUS': 'AEROBAY',
    'IROBO': 'IROBOKIDZ', 'SOME COMPANY': 'UNNAMED', 'SOME DELHI COMPANY': 'UNNAMED',
}
def competitors(v):
    t = s(v)
    if not t:
        return []
    u = t.upper().strip()
    return [COMP_FIX.get(u, u)]

# ------------------------------------------------------------- products
# Robobox sells two main lines plus one-off workshops. The sheet never has a
# product column, so the line is read from how the rep described the deal.
PRODUCT_RULES = [
    ('Bagless',    r'BAGLESS|BAGFLESS|BAGLES|POWERPACK'),
    ('Curriculum', r'ROBOTIC|CURRICUL|COMPOSITE LAB|\bLAB\b|STEM|TINKER|\bATL\b|AFTER SCHOOL'),
    ('Workshop',   r'WORKSHOP|\bWKS\b'),
]

def products(*fields):
    blob = ' '.join(f for f in fields if f).upper()
    if not blob:
        return []
    return [name for name, pat in PRODUCT_RULES if re.search(pat, blob)]

# ---------------------------------------------------------------- stage
# Evidence -> suggested stage. Ordered most-advanced first; first hit wins.
STAGE_RULES = [
    ('Negotiation',   r'\bNEGOTIAT|FINAL(ISING|IZING)|CLOSING THE DEAL|RATE FINAL'),
    ('Proposal',      r'\bPROPOSAL|QUOT(E|ATION)|SENT THE (PRICE|RATE)|PRICING SHARED|SHARED THE PRICE'),
    ('Demo',          r'\bDEMO|WORKSHOP DONE|CONDUCTED|SESSION DONE|SHOW LAB'),
    ('Meeting Done',  r'\bHAVE MET|HAS MET|MET \w|MEETING DONE|HAD A MEET|DISCUSSED WITH'),
    ('Meeting Fixed', r'\bMEETING (FIXED|SCHEDULED|ALIGNED)|MEET (FIXED|ALIGNED|SCHEDULED)|ALIGNED A MEET'),
    ('Contacted',     r'\bSPOKE|CALLED|CONNECTED WITH|REACHED OUT|IN TOUCH|FOLLOW ?UP'),
]
def suggest_stage(opportunity, remarks, contact_status, contacted_iso):
    blob = ' '.join(x for x in [opportunity, remarks] if x).upper()
    for stage, pat in STAGE_RULES:
        m = re.search(pat, blob)
        if m:
            return stage, m.group(0).strip().title()
    if contact_status and 'NOT CONTACTED' in contact_status.upper():
        return 'New Lead', 'Marked not contacted'
    if contacted_iso:
        return 'Contacted', 'Has a last-contacted date'
    return 'New Lead', 'No contact evidence in source'

# ---------------------------------------------------------------- build
def slug(*parts):
    h = hashlib.sha1('|'.join(parts).upper().encode()).hexdigest()[:8]
    return 'SCH-' + h

seen = {}
schools = []
for i, r in enumerate(raw):
    name = s(r['School Name'])
    if not name:
        continue
    loc = s(r['Location'])
    sid = slug(name, loc or '')
    if sid in seen:
        sid = sid + '-' + str(i)
    seen[sid] = True

    contacted_iso, precision, contacted_raw = parse_contacted(r['Last Contacted'])
    if r['Last Contacted Exact'] is not None:
        ci, _, _ = parse_contacted(r['Last Contacted Exact'])
        if ci:
            contacted_iso, precision = ci, 'exact'

    opportunity = s(r['Opportunity'])
    remarks = s(r['Remarks'])
    contact_status = s(r['Contact Status'])
    stage_sug, stage_why = suggest_stage(opportunity, remarks, contact_status, contacted_iso)

    src, src_raw = source(r['Lead Source'])
    deal = num(r['Expected Deal Size'])
    students = num(r['Student Count Midpoint']) or num(r['Student Count'])
    rate = round(deal / students) if deal and students else None

    schools.append({
        'id': sid,
        'srNo': s(r['Sr No']),
        'name': name,
        'region': s(r['Region']),
        'location': loc,
        'boards': boards(r['Board']),
        'students': int(students) if students else None,
        'studentsMin': int(num(r['Student Count Min'])) if num(r['Student Count Min']) else None,
        'studentsMax': int(num(r['Student Count Max'])) if num(r['Student Count Max']) else None,
        'decisionMaker': s(r['Decision Maker']),
        'owners': owners(r['Sales Owner']),
        'leadSource': src,
        'leadSourceRaw': src_raw,
        'opportunityStatus': s(r['Opportunity Status']),
        'opportunity': opportunity,
        'dealSize': deal,
        'ratePerStudent': rate,
        'stage': None,                       # never inferred - the team confirms it
        'suggestedStage': stage_sug,
        'suggestedStageReason': stage_why,
        'probability': None,
        'lastContacted': contacted_iso,
        'lastContactedRaw': contacted_raw,
        'lastContactedPrecision': precision,
        'contactStatus': contact_status,
        'nextAction': s(r['Next Action']),
        'nextActionDate': None,
        'expectedClosure': None,
        'expectedClosureRaw': s(r['Expected Closure Date']),
        'products': products(opportunity, remarks, s(r['Next Action'])),
        'blockers': s(r['Blockers']),
        'blockerTags': blocker_tags(r['Blockers']),
        'competitors': competitors(r['Competition']),
        'remarks': remarks,
        'missingCount': int(num(r['Missing Critical Fields']) or 0),
        'duplicateFlag': s(r['Duplicate Check']) == 'Possible duplicate',
        'inActionQueue': (name.upper(), (loc or '').upper()) in action_keys,
        'origin': 'import',
        'addedAt': None,
        'rejectedReason': None,
        'activities': [],
        'createdAt': None,
        'updatedAt': None,
    })

meta = {
    'source': 'ROBOBOX_MASTER_CLEANED_PIPELINE_1.xlsx',
    'importedAt': datetime.date.today().isoformat(),
    'baseYearForTextDates': BASE_YEAR,
    'rowsInSource': len(raw),
    'schools': len(schools),
}

def targets(revenue, approach, meetings, updates):
    return {'revenue': revenue, 'schoolsApproached': approach,
            'meetings': meetings, 'updates': updates, 'placeholder': True}

users = [
    {'id': 'parth',  'name': 'Parth',  'role': 'ceo',        'ownerKey': 'PARTH',  'email': 'parth@robobox.in',  'pin': 'parth',  'targets': targets(5000000, 20, 30, 40)},
    {'id': 'ayush',  'name': 'Ayush',  'role': 'sales_head', 'ownerKey': 'AYUSH',  'email': 'ayush@robobox.in',  'pin': 'ayush',  'targets': targets(5000000, 25, 35, 50)},
    {'id': 'sid',    'name': 'Sid',    'role': 'sales',      'ownerKey': 'SID',    'email': 'sid@robobox.in',    'pin': 'sid',    'targets': targets(3000000, 20, 30, 40)},
    {'id': 'vikas',  'name': 'Vikas',  'role': 'sales',      'ownerKey': 'VIKAS',  'email': 'vikas@robobox.in',  'pin': 'vikas',  'targets': targets(3000000, 20, 30, 40)},
    {'id': 'manish', 'name': 'Manish', 'role': 'sales',      'ownerKey': 'MANISH', 'email': 'manish@robobox.in', 'pin': 'manish', 'targets': targets(2000000, 15, 25, 30)},
]

payload = {'meta': meta, 'users': users, 'schools': schools}
js = 'window.ROBOBOX_SEED = ' + json.dumps(payload, ensure_ascii=False, indent=1) + ';\n'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w').write(js)

print('schools:', len(schools))
print('owners :', dict(collections.Counter(o for s_ in schools for o in s_['owners'])))
print('unowned:', sum(1 for s_ in schools if not s_['owners']))
print('sugg   :', dict(collections.Counter(s_['suggestedStage'] for s_ in schools)))
print('blocker:', dict(collections.Counter(t for s_ in schools for t in s_['blockerTags'])))
print('source :', dict(collections.Counter(s_['leadSource'] for s_ in schools)))
print('rates  :', dict(collections.Counter(s_['ratePerStudent'] for s_ in schools if s_['ratePerStudent'])))
print('dates  :', dict(collections.Counter(s_['lastContactedPrecision'] for s_ in schools)))
print('inAQ   :', sum(1 for s_ in schools if s_['inActionQueue']))
print('product:', dict(collections.Counter(p for s_ in schools for p in s_['products'])))
print('noprod :', sum(1 for s_ in schools if not s_['products']))
print('bytes  :', len(js))
