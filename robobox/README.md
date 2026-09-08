# Robobox Sales OS

A replacement for the manual master spreadsheet. Two products in one app:

- **Sales team** — a form-driven way to log every call, meeting and demo, and a
  personal progress view so each rep can see their own numbers.
- **CEO dashboard** — company-wide analytics that drill from a headline number
  all the way down to a single school's activity history.

The whole of `ROBOBOX_MASTER_CLEANED_PIPELINE_1.xlsx` is loaded in — 343 schools,
their owners, deal sizes, blockers and competitors — so it is usable from the
first click rather than being an empty shell.

---

## Running it

It is plain static files. No build step, no dependencies.

```bash
cd robobox
python3 -m http.server 8000
# open http://localhost:8000
```

Sign in as any of these (the access code is the first name, lowercase):

| User   | Role          | Sees                                                |
|--------|---------------|-----------------------------------------------------|
| Parth  | CEO           | Everything, including the CEO dashboard             |
| Ayush  | Head of Sales | The whole team's accounts and a team roll-up — **not** the CEO dashboard |
| Sid    | Sales         | Only their own accounts                             |
| Vikas  | Sales         | Only their own accounts                             |
| Manish | Sales         | Only their own accounts                             |

Everyone can download their data as CSV. Only Parth can open the Leadership
screens; typing `#/ceo` into the address bar as a rep bounces back to their own
home page.

---

## What the sales team does

**My day** is the landing page: overdue follow-ups, what is due this week,
accounts that have gone quiet, and anything with no next step written down.

**Log an update** is the one form that matters. A rep records what happened —
date, type, who they met, how it went, notes — and the pipeline updates itself:
last-contact date, stage, probability, next action, deal size and expected
closure all follow from that single entry. That is the manual step this app
removes; nobody edits a spreadsheet row again.

**My progress** gives each rep their own funnel, their activity trend by
outcome, their weakest conversion step, and a list of their records that are
still missing required fields.

---

## What the CEO sees

| Screen | Answers |
|---|---|
| **Command centre** | TAM, coverage, open and weighted pipeline, value at risk, and a ranked list of what needs a decision this week |
| **Funnel** | Cumulative funnel, step-by-step conversion, the value that stops at each step, and the same funnel cut by region, source, owner and board |
| **Market** | The 343-school universe, coverage by region / size / board, a region × stage heatmap, and the never-contacted schools ranked by size |
| **Team** | Per-rep pipeline, coverage, gone-quiet rate, record completeness, and every unassigned school |
| **Blockers** | Blockers grouped into categories with the value behind each, a blocker × region heatmap, competitor presence, rate-card mix, and the raw field notes |
| **Pipeline health** | Whether the numbers can be trusted: completeness, stage confirmation, contact-date quality, staleness bands, duplicates, and a chase list |
| **Deep dive** | A pivot — group by any of eleven dimensions, pick any of eleven measures, cross two dimensions into a heatmap, then open the schools behind any cell |

Every chart is clickable. A bar, a funnel step, a heatmap cell or a KPI tile
opens the rows behind it, and each row opens that school's full history. The
smallest unit is always reachable.

---

## Honest notes about the imported data

The import deliberately does not invent anything. What it did and did not do:

- **Stage was never guessed into the record.** The sheet had no stage on any of
  the 343 rows. Where the wording made it obvious ("Have met the trustee"), the
  app shows a *suggested* stage marked with a `?` and, on hover, the phrase it
  came from. It stays a suggestion until someone confirms it; Pipeline health
  reports what percentage is confirmed, and the Funnel screen says so in a
  banner while that number is low.
- **Probability is derived from stage**, not stored per school, so moving a
  stage updates the forecast on its own. The mapping is in Settings.
- **Contact dates were free text** — "1ST WEEK AUGUST", "APRIL-MAY", "LAST
  YEAR". They were parsed to real dates where possible and each carries a
  precision flag (exact / day / month / none). Bare month names resolve to 2025,
  which is where the sheet's only machine-readable dates sit. Anything
  approximate is shown with a `≈` and listed on Pipeline health.
- **The sheet's most recent contact date is in 2025.** Every staleness figure is
  measured against today, so the entire imported pipeline reads as stale until
  the team starts logging current activity. Pipeline health says this outright
  rather than letting it look like a team failure.
- **TAM uses ₹1,700 per student** by default, the lab-programme rate the sheet
  quotes most often; ₹400 (workshops) is the other one it uses. The rate is
  switchable from the Command centre. Only 181 of 343 schools carry a student
  count, so the real market is larger than the number shown — the dashboard
  flags this rather than hiding it.
- **Shared rows were split.** "AYUSH & PARTH" now credits both people.
- **Spelling variants were folded**: ELDOCKS / PUNE ELDROCKS / ALICE
  REFF-ELDROCKS → ELDROCKS; RCOM CHENNAI → RCOM; IB's PYP/MYP/DP → IB.
- **Blockers were categorised**, not rewritten. Each school keeps its verbatim
  note; the categories (price, access, decision speed, incumbent, trust, timing,
  capacity) sit on top so the same problem can be fixed once instead of 29 times.
- **10 possible duplicates** carried through the flag from the source workbook
  and are surfaced for merging rather than silently removed.

To re-run the import against a newer workbook, edit and run
`tools/import_master_workbook.py`; it rewrites `assets/js/seed-data.js`.

---

## Wiring it into the existing website

Two things are stubbed for the pilot and are the only things that change:

**1. Storage.** `assets/js/store.js` writes through a single adapter object with
`read` / `write` / `clear`. The default keeps everything in `localStorage`, which
is why the app runs with no server — but it also means each browser holds its own
copy. For a shared, multi-user deployment, replace `RB.store.adapter` with one
that talks to your API. Nothing above that layer changes.

`supabase/schema.sql` is the production shape: tables for schools, owners,
activities, users and settings; a trigger that rolls each logged activity into
its school row (the same automation the client does, enforced server-side); and
row-level security policies that are the database twin of the permission map in
`assets/js/auth.js` — a rep can only read their own rows even if they call the
API directly.

**2. Login.** `assets/js/auth.js` checks the access code in the browser, which is
fine for a pilot and not for production. Point `RB.auth.signIn` / `restore` at
the host site's existing session instead and keep the rest of the module: the
`PERMISSIONS` map, `visibleSchools()` and `can()` are what every screen reads,
and they carry over unchanged.

Everything else — `index.html`, `assets/css`, `assets/js` — can be dropped into
a subdirectory of the existing site as-is, or embedded in a page shell. There is
no bundler, no framework and no CDN dependency, so nothing to break at deploy
time.

---

## One decision left to you

The brief says the sales team can download data but cannot see the CEO
dashboard, and that Ayush heads sales. Ayush is therefore given a middle tier:
he sees the whole team's accounts and a team roll-up (pipeline, coverage,
gone-quiet rate, data quality per rep) but not the company-wide market, blocker,
pricing and deep-dive screens. If he should have the full CEO view instead,
change his `role` to `ceo` in `assets/js/seed-data.js` — or, in production, in
the `app_user` table. Nothing else needs to change.

---

## Layout

```
robobox/
├── index.html
├── assets/
│   ├── css/app.css              design tokens, light + dark
│   └── js/
│       ├── seed-data.js         the imported workbook (generated)
│       ├── util.js              formatting, dates, CSV
│       ├── store.js             state + the storage adapter to swap
│       ├── auth.js              roles and the permission map
│       ├── metrics.js           every derived number, pure functions
│       ├── charts.js            SVG chart primitives
│       ├── components.js        table, forms, school detail, exports
│       ├── views-sales.js       the sales team's screens
│       ├── views-ceo.js         the CEO dashboard
│       └── app.js               routing and boot
├── supabase/schema.sql          production tables, triggers, RLS
└── tools/import_master_workbook.py
```

Charts are hand-rolled SVG on a colourblind-safe eight-hue palette, with a
single-hue ramp for magnitude and reserved status colours. They work in light
and dark mode and have no external dependency.
