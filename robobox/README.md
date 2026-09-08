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

**Log an update** is the form the whole thing turns on. It sits in the top bar
on every screen: pick a school, record what happened — date, type, who they met,
how it went, notes, which product line, where it leaves the deal, what happens
next — and the pipeline rewrites itself. Last-contact date, stage, probability,
next action, deal size, expected closure and the product split all follow from
that one entry. Nobody edits a spreadsheet row again. Marking a school Lost asks
why, so rejections become an analysable list rather than a silent gap.

**Today** is the landing page and it leads with the number that matters:
updates you logged today. Under it sit overdue follow-ups, what is due today and
this week, accounts that have gone silent, this month against target, and
anything with no next step written down. Every row has its own Log button.

**My dashboard** is the rep's own scoreboard — total schools, approached,
silent, rejected, closed, conversion, potential vs generated revenue, average
deal size, new schools added over one, two and three months, performance per
region, closed deals split by Curriculum / Bagless / Workshop, target vs
achievement for the month, and the records still missing required fields.

---

## What the CEO sees

The command centre is deliberately short — four numbers, the insights, and
performance split the two ways it gets asked for. Everything heavier sits on its
own screen instead of crowding the front page.

| Screen | Answers |
|---|---|
| **Command centre** | TAM, market approached, open pipeline, won. Then insights — blockers by value held up, biggest schools, most students — and performance per region and per sales person. Plus whether anyone logged anything today |
| **Team performance** | Total accounts, updated-today, approached, conversion, potential and generated revenue, average deal size and silent count per person, with each rep's month against target |
| **Market** | The 343-school universe, coverage by region / size / board, a region × stage heatmap, and never-contacted schools ranked by size |
| **Blockers** | Blockers grouped into categories with the value behind each, a blocker × region heatmap, competitor presence, rate-card mix, and the raw field notes |
| **Deep dive** | The funnel and step conversion, then a pivot — group by any of twelve dimensions, pick any of eleven measures, cross two into a heatmap, and open the schools behind any cell |
| **Data health** | Whether the numbers can be trusted: completeness, stage confirmation, contact-date quality, staleness bands, duplicates, and a chase list |

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
- **Product lines were read from the deal wording**, since the sheet has no
  product column: Bagless in 50 schools, Curriculum (robotics, composite lab,
  after-school) in 42, Workshops in 17. The remaining 274 show as "not recorded"
  until a rep picks the line on the log form.
- **Nothing is marked Rejected.** The sheet never recorded a loss, so every
  Closed and Rejected count starts at zero and fills in as the team logs them.
  Silence is not treated as rejection — a school with no reply for 30+ days is
  "silent", which is a different problem with a different fix.
- **Monthly targets are placeholders.** Revenue, schools approached, meetings
  and updates targets ship as stand-in numbers badged "placeholder" wherever
  they appear. Ayush or Parth set the real ones in Settings.

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

## Shareable preview

`tools/build_single_file.py` bundles the whole app into one self-contained HTML
file for hosts that take a single page:

```bash
python3 tools/build_single_file.py            # -> dist/robobox-sales-os.html
```

The bundle sets `RB.PREVIEW`, which reroutes CSV exports to an on-screen
copyable panel, because sandboxed preview hosts block a page from starting its
own download. It also relies on the host supplying `<meta charset="utf-8">`; for
local use, serve the normal multi-file `index.html`, which declares its own.

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
└── tools/
    ├── import_master_workbook.py    regenerates seed-data.js from the xlsx
    └── build_single_file.py         one-file bundle for preview hosts
```

Charts are hand-rolled SVG on a colourblind-safe eight-hue palette, with a
single-hue ramp for magnitude and reserved status colours. They work in light
and dark mode and have no external dependency.
