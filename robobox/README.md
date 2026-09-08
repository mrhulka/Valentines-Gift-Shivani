# Robobox Connect

A sales system built around one idea: **every interaction with a school is a
Connect.** Log the Connect, and the pipeline, tasks, calendar, stage, commercial
journey and every dashboard follow from it. Nobody maintains a "last contacted"
field, a task list, or a stage — those are calculated, never typed.

Loaded with the master workbook: 338 schools, 169 opportunities, 169 connects.

## Running it

```bash
cd robobox && python3 -m http.server 8000
```

Access code is the first name, lowercase: `parth` (CEO), `ayush` (head of
sales), `sid` / `vikas` / `manish` (sales).

## The model

```
SCHOOL  (exists exactly once)
  └── OPPORTUNITY  (one per offering in play)
        └── CONNECT  ·  CONNECT  ·  CONNECT   (append-only history)
```

Four stored entities: school, contact, opportunity, connect. **Tasks and
calendar entries are not stored** — a task is the open next action on the newest
Connect of a live opportunity, so logging the next Connect closes it and the two
can never disagree. Stage is derived the same way: a response only ever moves an
opportunity forward, and a Connect whose mode was a meeting reaches the Meeting
stage whatever the response said.

**The commercial journey is four separate numbers**, never one deal value:

| | |
|---|---|
| Initial potential | the estimate at creation — written once, immutable in code and in the database |
| Quoted | what was formally quoted |
| Negotiated | the latest expected value |
| Closed | what actually closed |

From which: **realisation** = closed ÷ initial potential, **negotiation
leakage** = quoted − closed.

## The Connect form

One form, not two. The first question is New Connect or Reconnect; New captures
school, opportunity, contact and potential, Reconnect skips straight to what
happened — after showing the previous Connect for context. Fields appear only
when they apply: quoted value on "Asked for Proposal", loss reason on "Lost",
blocker detail when there is a blocker.

Date, time and salesperson are never asked for. Everything except school name,
contact name, blocker detail and notes is a controlled list, so the dataset
comes out analysable without anyone tidying it.

## Screens

**Sell** — My day (connects today, overdue, due today) · My tasks (Overdue /
Today / Upcoming / Closed) · My calendar (built from next actions) · My schools ·
My scorecard.

The scorecard has no company target. It measures **activity, opportunity,
pipeline, conversion, closure, realisation and loss as separate things** —
Connect count is effort, not performance.

**Leadership** — Business pulse (sales funnel, commercial funnel, needs
attention) · Team · Stalled · Offerings · Intelligence (blockers, loss reasons,
offerings, geography, competitors, lead sources).

Every number drills to the opportunities behind it, and every opportunity opens
its school's full Connect timeline.

## Honest notes on the imported data

- **Offerings were read from the deal wording** — the sheet has no product
  column. Bagless Skills 50, Advanced Lab 13, Robotics Workshop 6, Kit Class 2;
  98 opportunities have no offering until a rep picks one.
- **One Connect per imported row.** The sheet recorded a state, not a history,
  so each opportunity starts with a single Connect carrying what it said.
- **108 of 169 connects have a real date.** The rest were free text ("1ST WEEK
  AUGUST"); they show as undated and are excluded from every bounded period so
  they cannot inflate "this month".
- **Nothing is Won or Lost.** The sheet recorded no closures, so closed revenue,
  lost value and realisation all start at zero and fill in as the team logs them.
- **Every opportunity reads as stalled** — the workbook's newest contact is over
  a year old. That is the data, not the flag being wrong.

## Colour

Robobox Yellow `#F2BE14` · Charcoal `#23262C` · Signal Red `#E5392B` · Bench
Grey `#7C868D` · Paper `#FAF7F0` · Hi-Vis `#FFD84D`.

Charts use **no categorical palette** — every one plots a single measure, so
marks are Charcoal, magnitude uses a grey→charcoal ramp, and Yellow is a
highlight that always sits beside a direct value label (it is 1.6:1 on Paper and
can never carry meaning alone). Red is reserved for lost and overdue. Both
themes are designed, not flipped.

## Layout

```
robobox/
├── index.html
├── assets/css/app.css           tokens, both themes
├── assets/js/
│   ├── seed-data.js             the imported workbook (generated)
│   ├── util.js                  formatting, dates, CSV
│   ├── model.js                 vocabulary + every derived number
│   ├── store.js                 four entities + the storage adapter
│   ├── auth.js                  roles and the permission map
│   ├── charts.js                SVG primitives
│   ├── ui.js                    atoms: tiles, tables, choices, modals
│   ├── connect-form.js          the one form
│   ├── views.js                 every screen
│   └── app.js                   routing and boot
├── DEPLOYMENT.md
├── supabase/schema.sql          four tables, RLS, append-only connects
└── tools/
    ├── import_master_workbook.py
    └── build_single_file.py
```
