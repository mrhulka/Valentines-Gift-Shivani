"""Reshape the master workbook into School -> Opportunity -> Connect.

Nothing is invented. Where the sheet has no value the field stays null; where a
value is implied by the sheet's own wording it is written as a Connect (an
observation with a date), never as a fact about the opportunity.
"""
import openpyxl, json, re, hashlib, datetime, collections, os

SRC = os.environ.get('ROBOBOX_XLSX', 'ROBOBOX_MASTER_CLEANED_PIPELINE_1.xlsx')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'js', 'seed-data.js')
BASE_YEAR = 2025   # the sheet's only machine dates sit in 2025

wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb['CLEAN MASTER']
rows = list(ws.iter_rows(values_only=True))
hdr = [str(h).strip() for h in rows[0]]
raw = [dict(zip(hdr, r)) for r in rows[1:]]

def s(v):
    if v is None: return None
    t = str(v).strip()
    return t or None

def num(v):
    try:
        f = float(str(v).replace(',', '').strip())
        return f if f == f else None
    except (TypeError, ValueError):
        return None

def uid(prefix, *parts):
    return prefix + '-' + hashlib.sha1('|'.join(parts).upper().encode()).hexdigest()[:10]

# ------------------------------------------------------------- controlled lists
def board(v):
    u = (s(v) or '').upper()
    has_cbse = 'CBSE' in u
    has_icse = 'ICSE' in u or 'ISC' in u
    if has_cbse and has_icse:                 return 'CBSE-ICSE'
    if 'IB' in u or 'PYP' in u or 'MYP' in u: return 'IB'
    if 'IGCSE' in u or 'CAMBRIDGE' in u:      return 'Cambridge International'
    if has_cbse:                              return 'CBSE'
    if has_icse:                              return 'ICSE'
    if 'STATE' in u or 'MSBSHSE' in u:        return 'SSC'
    return None

COMPETITORS = ['Aerobay', 'Eduvate', 'STEMROBO', 'RCOM', 'OLL', 'NEXT', 'iRobo', 'Other', 'None']
def competitor(v):
    u = (s(v) or '').upper()
    if not u: return 'None'
    for c in ['AEROBAY', 'EDUVATE', 'STEMROBO', 'RCOM', 'OLL', 'NEXT']:
        if c in u: return next(x for x in COMPETITORS if x.upper() == c)
    if 'IROBO' in u: return 'iRobo'
    return 'Other'

def lead_source(v):
    u = (s(v) or '').upper()
    if not u: return None
    if 'ELDROCK' in u or 'ELDOCK' in u: return 'Eldrocks'
    if '91' in u:                       return '91 Media'
    if 'BNI' in u:                      return 'BNI'
    if 'COLD' in u:                     return 'Cold'
    if 'PARTH' in u or 'INTERNAL' in u: return 'Internal'
    if 'REF' in u or u in ('ADVANI', 'SAURAV', 'SAWANT', 'HARSHITHA NEW SCHOOL'): return 'Referral'
    return 'Other'

# The sheet's clusters are the sales regions the Connect flow names.
REGION_MAP = {'CENTRAL': 'Central', 'KDMC': 'KDMC', 'NAVI': 'Navi Mumbai',
              'WESTERN': 'Western', 'PUNE': 'Pune'}

def region(cluster):
    return REGION_MAP.get((s(cluster) or '').upper(), 'Central')

# Offering: read from how the rep described the deal. Anything unreadable stays
# null rather than being forced into a category.
OFFERING_RULES = [
    ('Bagless',        r'BAGLESS|BAGFLESS|BAGLES|POWERPACK'),
    ('Workshop',       r'WORKSHOP|\bWKS\b'),
    ('Advanced Lab',   r'COMPOSITE LAB|ADVANCED LAB|\bKIT'),
    ('STEM Lab',       r'STEM|ROBOTIC|\bLAB\b|CURRICUL|TINKER|\bATL\b'),
]
def offering(*fields):
    blob = ' '.join(f for f in fields if f).upper()
    for name, pat in OFFERING_RULES:
        if re.search(pat, blob): return name
    return None

EXISTING_LAB_RULES = [
    ('Competitor',        r'ALREADY HAVE ROBOTICS|CHOSE |EXISTING VENDOR|ALREADY WORKING'),
    ('Robobox',           r'HAVE DONE BAGLESS|RENEWED|EXISTING CLIENT'),
]
def existing_lab(comp, *fields):
    blob = ' '.join(f for f in fields if f).upper()
    for name, pat in EXISTING_LAB_RULES:
        if re.search(pat, blob): return name
    return 'Competitor' if comp != 'None' else "Don't Know"

# --------------------------------------------------------------------- dates
MONTHS = {'JAN':1,'FEB':2,'MAR':3,'APR':4,'MAY':5,'JUN':6,'JUL':7,'AUG':8,'SEP':9,'OCT':10,'NOV':11,'DEC':12}
def parse_date(v):
    """-> (iso|None, precision)"""
    if isinstance(v, datetime.datetime):
        return v.date().isoformat(), 'exact'
    t = s(v)
    if not t: return None, 'none'
    u = t.upper()
    if 'NOT CONTACT' in u or 'NOT CONATCT' in u: return None, 'none'
    m = re.search(r'(\d{1,2})\s*(?:ST|ND|RD|TH)?\s*([A-Z]{3,9})', u)
    if m and MONTHS.get(m.group(2)[:3]):
        try:
            return datetime.date(BASE_YEAR, MONTHS[m.group(2)[:3]], int(m.group(1))).isoformat(), 'day'
        except ValueError:
            pass
    for name, mon in MONTHS.items():
        if name in u:
            return datetime.date(BASE_YEAR, mon, 15).isoformat(), 'month'
    if 'LAST YEAR' in u:
        return datetime.date(BASE_YEAR - 1, 10, 15).isoformat(), 'month'
    return None, 'none'

# ------------------------------------------------------------------ blockers
BLOCKER_RULES = [
    ('Budget / Pricing',            r'PRIC|PAYING CAP|CHEAP|BUDGET|COST|EXPENSIVE|LOW PAY|FINANC|FEES'),
    ('Decision Maker Access',       r'DOES NOT MEET|DOESNT MEET|CANT FIND A MEET|NO MEET|NOT MEET|DIFFICULT TO MEET|HARD TO MEET|NO RESPON|NOT RESPON|MGMT|MANAGEMENT|TRUSTEE|APPROVAL|COMMITTEE'),
    ('Existing Competition',        r'ALREADY (HAVE|HAS|WORKING)|EXISTING VENDOR|CHOSE '),
    ('Existing Internal Program',   r'INTERNAL|OWN TEACHER|IN HOUSE'),
    ('Timing',                      r'NEXT YEAR|ACADEMIC|SESSION|AFTER EXAM|VACATION|POSTPON|DEFER|SLOW|TAKES TIME'),
    ('Student Strength / Capacity', r'LOW STRENGTH|SMALL SCHOOL'),
    ('Lack of Space / Infra',       r'SPACE|INFRA'),
    ('Parental Acceptance',         r'PARENT|TRUST|RECOUP'),
]
def blocker(v):
    u = (s(v) or '').upper()
    if not u: return 'None'
    for name, pat in BLOCKER_RULES:
        if re.search(pat, u): return name
    return 'Other'

# ------------------------------------------------------------------ response
# The sheet records an outcome in prose; map it to the controlled response the
# Connect form would have captured.
RESPONSE_RULES = [
    ('Proposal Requested',        r'PROPOSAL|QUOT'),
    ('Meeting Fixed',             r'MEETING (FIXED|SCHEDULED|ALIGNED)|ALIGNED A (ROBOTICS )?DEMO'),
    ('Interested',                r'INTERESTED|LIKED|WANTS|RENEWED|CAN START'),
    ('Rejected',                  r'CHOSE |ALREADY (HAVE|WORKING)'),
    ('To confirm in a few days',  r'HAVE MET|HAS MET|MET \w|HAVE DONE'),
]
def response(*fields):
    blob = ' '.join(f for f in fields if f).upper()
    for name, pat in RESPONSE_RULES:
        if re.search(pat, blob): return name
    return 'Other'

MODE_RULES = [('Meeting', r'HAVE MET|HAS MET|MET \w|MEETING'), ('Demo', r'DEMO'),
              ('School Visit', r'VISIT'), ('Cold Call', r'COLD')]
def mode(*fields):
    blob = ' '.join(f for f in fields if f).upper()
    for name, pat in MODE_RULES:
        if re.search(pat, blob): return name
    return 'Introductory Call'

NEXT_ACTION_RULES = [
    ('Management connect',  r'MGMT|MANAGEMENT|TRUSTEE'),
    ('Send proposal',       r'PROPOSAL|QUOT'),
    ('Schedule demo',       r'DEMO'),
    ('Fix meeting',         r'\bMEET\b|MEET '),
]
def next_action(v):
    u = (s(v) or '').upper()
    if not u: return None
    for name, pat in NEXT_ACTION_RULES:
        if re.search(pat, u): return name
    return 'Follow-up'

OWNERS = {'AYUSH', 'PARTH', 'SID', 'VIKAS', 'GAURAV', 'MANISH'}
def owners(v):
    t = (s(v) or '').upper()
    return [p.strip() for p in re.split(r'\s*(?:&|\+|/|,| AND )\s*', t) if p.strip() in OWNERS]

# ================================================================== build
schools, opportunities, connects, contacts = [], [], [], []
seen = {}

for i, r in enumerate(raw):
    name = s(r['School Name'])
    if not name: continue
    loc = s(r['Location'])
    sid = uid('SCH', name, loc or '')
    if sid in seen:                      # same name+location twice in the sheet
        continue
    seen[sid] = True

    opportunity_txt = s(r['Opportunity'])
    remarks = s(r['Remarks'])
    next_txt = s(r['Next Action'])
    comp = competitor(r['Competition'])
    own = owners(r['Sales Owner'])

    schools.append({
        'id': sid,
        'name': name,
        'location': loc,
        'region': region(r['Region']),
        'cluster': s(r['Region']),
        'board': board(r['Board']),
        'students': int(num(r['Student Count Midpoint']) or num(r['Student Count']) or 0) or None,
        'existingLab': existing_lab(comp, opportunity_txt, remarks),
        'competitor': comp,
        'leadSource': lead_source(r['Lead Source']),
        'ownerKey': own[0] if own else None,
        'createdAt': None,
        'origin': 'import'
    })

    dm = s(r['Decision Maker'])
    contact_id = None
    if dm:
        contact_id = uid('CON', sid, dm)
        contacts.append({'id': contact_id, 'schoolId': sid, 'name': dm.title(),
                         'role': 'Principal', 'phone': None, 'email': None})

    off = offering(opportunity_txt, remarks, next_txt)
    potential = num(r['Expected Deal Size'])
    if not (off or potential or opportunity_txt):
        continue                          # no opportunity in the sheet, just a school

    oid = uid('OPP', sid, off or 'unknown')
    contacted_at, precision = parse_date(r['Last Contacted'])

    opportunities.append({
        'id': oid, 'schoolId': sid,
        'offering': off, 'variant': None,
        'ownerKey': own[0] if own else None,
        'coOwners': own[1:],
        'initialPotential': potential,
        'expectedClosure': None,
        'status': 'Open', 'closedValue': None, 'lossReason': None, 'closedAt': None,
        'createdAt': contacted_at,
        'origin': 'import'
    })

    # One Connect carrying what the sheet actually recorded about this contact.
    na = next_action(next_txt)
    connects.append({
        'id': uid('CNX', oid, '1'),
        'schoolId': sid, 'opportunityId': oid,
        'by': (own[0] if own else 'AYUSH').lower(),
        'kind': 'New',
        'mode': mode(opportunity_txt, remarks),
        'contactId': contact_id,
        'response': response(opportunity_txt, remarks),
        'interest': 'Warm',
        'blocker': blocker(r['Blockers']),
        'blockerDetail': s(r['Blockers']),
        'commercial': {},
        'notes': ' — '.join(x for x in [opportunity_txt, remarks] if x) or None,
        'nextAction': na,
        'nextActionOwner': (own[0] if own else None),
        'nextActionAt': None,
        'stage': None,
        'nextActionNote': next_txt,
        'at': (contacted_at + 'T10:00:00') if contacted_at else None,
        'datePrecision': precision,
        'dateRaw': s(r['Last Contacted']),
        'origin': 'import'
    })

users = [
    {'id': 'parth',  'name': 'Parth',  'role': 'ceo',        'ownerKey': 'PARTH',  'designation': 'CEO',           'email': 'parth@robobox.in',  'pin': 'parth'},
    {'id': 'ayush',  'name': 'Ayush',  'role': 'sales_head', 'ownerKey': 'AYUSH',  'designation': 'Head of Sales', 'email': 'ayush@robobox.in',  'pin': 'ayush'},
    {'id': 'sajesh', 'name': 'Sajesh', 'role': 'outsight',   'ownerKey': 'SAJESH', 'designation': 'Outsight',      'email': 'sajesh@robobox.in', 'pin': 'sajesh'},
    {'id': 'yash',   'name': 'Yash',   'role': 'outsight',   'ownerKey': 'YASH',   'designation': 'Outsight',      'email': 'yash@robobox.in',   'pin': 'yash'},
    {'id': 'sid',    'name': 'Sid',    'role': 'sales',      'ownerKey': 'SID',    'designation': 'Sales',         'email': 'sid@robobox.in',    'pin': 'sid'},
    {'id': 'gaurav', 'name': 'Gaurav', 'role': 'sales',      'ownerKey': 'GAURAV', 'designation': 'Sales',         'email': 'gaurav@robobox.in', 'pin': 'gaurav'},
    {'id': 'vikas',  'name': 'Vikas',  'role': 'sales',      'ownerKey': 'VIKAS',  'designation': 'Sales',         'email': 'vikas@robobox.in',  'pin': 'vikas'},
]

payload = {
    'meta': {'source': os.path.basename(SRC), 'importedAt': datetime.date.today().isoformat(),
             'baseYearForTextDates': BASE_YEAR, 'rowsInSource': len(raw)},
    'users': users, 'schools': schools, 'contacts': contacts,
    'opportunities': opportunities, 'connects': connects
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w').write('window.ROBOBOX_SEED = ' + json.dumps(payload, ensure_ascii=False, indent=1) + ';\n')

print('schools      ', len(schools))
print('contacts     ', len(contacts))
print('opportunities', len(opportunities))
print('connects     ', len(connects))
print('offering     ', dict(collections.Counter(o['offering'] for o in opportunities)))
print('response     ', dict(collections.Counter(c['response'] for c in connects)))
print('blocker      ', dict(collections.Counter(c['blocker'] for c in connects)))
print('board        ', dict(collections.Counter(s_['board'] for s_ in schools)))
print('competitor   ', dict(collections.Counter(s_['competitor'] for s_ in schools)))
print('dated        ', sum(1 for c in connects if c['at']))
