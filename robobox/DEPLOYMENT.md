# Deploying Robobox Sales OS on the client's website

Two decisions drive everything else:

1. **Where does the data live?** The pilot keeps it in each person's browser.
   That has to become one shared database before more than one person uses it.
2. **Who says a visitor is Ayush?** The pilot checks an access code in the
   browser. That has to become a real login.

Everything else — the HTML, CSS, charts, screens, permission rules — ships
as-is. There is no build step, no framework and no CDN dependency, so the files
drop into any web host that can serve static files.

---

## Option A — Pilot on the real site, one week (half a day of work)

Good for putting it in front of Ayush and Parth on the client's own domain
before committing to a database.

1. Copy the `robobox/` folder to the site, e.g. `/sales/`.
2. Put it behind whatever the site already uses to restrict a folder —
   HTTP basic auth, an existing members area, an IP allow-list.
3. Send people to `https://theclient.com/sales/`.

**What you get:** the full app, real data, five logins.
**What you don't:** each browser holds its own copy. Sid's updates never reach
Parth. Treat it as a demo, not as the pipeline of record.

---

## Option B — Production (the real answer)

### Step 1 — Create the database

Supabase is the shortest path: it gives you Postgres, authentication and a REST
API with no server to run, and the free tier is far larger than 343 schools.
(Any Postgres works; you would then write the same queries behind your own API.)

1. Create a project at supabase.com.
2. Open the SQL editor and run `supabase/schema.sql` end to end. That creates
   the tables, the trigger that rolls a logged activity into its school row, and
   the row-level security policies.
3. Note the project URL and the **anon** key from Settings → API.

### Step 2 — Create the five users

In Authentication → Users, add each person with their real email. Copy each
generated user id.

Then create `tools/users.json` (git-ignored — it holds no secrets, but it is
environment-specific):

```json
[
  { "id": "<auth id>", "name": "Parth", "email": "parth@…", "role": "ceo",        "ownerKey": "PARTH" },
  { "id": "<auth id>", "name": "Ayush", "email": "ayush@…", "role": "sales_head", "ownerKey": "AYUSH" },
  { "id": "<auth id>", "name": "Sid",   "email": "sid@…",   "role": "sales",      "ownerKey": "SID" }
]
```

`ownerKey` must match the name used in the master sheet, or the 343 schools
won't attach to anyone.

### Step 3 — Load the data

```bash
cd robobox
npm i @supabase/supabase-js
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_KEY=<service-role key> \
node tools/seed_supabase.mjs
```

This loads the schools, the ownership links and the user records. It upserts by
id, so re-running refreshes the schools without duplicating them and without
touching activities the team has logged.

The **service-role key bypasses row-level security**. It belongs in a terminal
and a secrets manager — never in the page, never in the repo.

### Step 4 — Point the app at it

Edit `index.html`. Replace the block of `<script>` tags at the bottom with:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script src="assets/js/seed-data.js"></script>
<script src="assets/js/util.js"></script>
<script src="assets/js/store.js"></script>
<script src="assets/js/auth.js"></script>
<script src="assets/js/metrics.js"></script>
<script src="assets/js/charts.js"></script>
<script src="assets/js/components.js"></script>
<script src="assets/js/views-sales.js"></script>
<script src="assets/js/views-ceo.js"></script>
<script src="assets/js/store-supabase.js"></script>
<script>
  RB.supabase.connect({
    url: 'https://xxx.supabase.co',
    anonKey: 'eyJ…'          // the anon/publishable key, safe in page source
  });
</script>
<script src="assets/js/app.js"></script>
```

Order matters: `store-supabase.js` after `store.js` and `auth.js`, and
`app.js` last, because `connect()` swaps the adapter before the app boots.

The anon key is safe in the page. Every table sits behind row-level security,
so what a signed-in person can read is decided in Postgres — a rep calling the
API directly still sees only their own accounts.

Once connected you can delete `seed-data.js` from the page; the database is the
source of truth. Keeping it costs 400 KB and nothing else.

### Step 5 — Swap the login screen

`store-supabase.js` already replaces `RB.auth.signIn` with a real email and
password check. Change the login form's user dropdown in `index.html` to a plain
email field:

```html
<input id="login-user" class="input" type="email" placeholder="you@robobox.in" required>
```

The `PERMISSIONS` map, `visibleSchools()` and `can()` in `auth.js` do not
change. Only how someone proves who they are changes.

**If the site already has a login**, skip Supabase auth entirely: call
`RB.supabase.connect({ url, anonKey, useSupabaseAuth: false })`, then hand the
app the signed-in person yourself:

```js
RB.auth.signIn  = () => ({ ok: true, user: RB.store.userById(currentUserId) });
RB.auth.restore = () => RB.store.userById(currentUserId);
RB.auth.setUser(RB.store.userById(currentUserId));
```

You still need each person's row in `app_user` with the right `role`, and a
Supabase session (or your own JWT signed with the project's secret) for RLS to
identify them.

### Step 6 — Deploy the files

Any static host works. Pick whichever the client already uses:

| Where the site lives | How to deploy |
|---|---|
| Their own server (nginx/Apache) | Copy `robobox/` into the web root, e.g. `/var/www/site/sales/` |
| WordPress | Upload to `/wp-content/uploads/sales/`, or serve at `/sales/` outside WordPress |
| Netlify / Vercel / Cloudflare Pages | Drag the folder in, or point it at the repo |
| S3 + CloudFront | Sync the folder, set `index.html` as the root object |

Serve it over HTTPS and make sure the response carries
`Content-Type: text/html; charset=utf-8` — the ₹ signs and the check marks
depend on it. Every host does this by default; only a hand-rolled config gets
it wrong.

**Embedding in an existing page** works too — the app renders into a
full-height shell, so put it on its own route rather than inside a narrow
content column. An `<iframe>` is the least invasive option if the surrounding
site has its own CSS you'd rather not fight.

---

## What to check before handing it over

- Sign in as a rep. Confirm they see only their own schools, and that
  `/#/ceo` in the address bar bounces them back.
- Log an update as one person; sign in as another and confirm it's there.
  That single test proves the database, the trigger and RLS are all working.
- Mark a school Won. Check the Command centre's Won tile moves.
- Download a CSV. It should download, not open a copy panel — the panel only
  appears in sandboxed previews.
- Open it on a phone. The sales screens are the ones that get used in a
  corridor between meetings.

---

## Running costs

At this size, effectively nothing. Supabase's free tier covers 343 schools and
five users with room to spare; static hosting is free on every provider in the
table above. The first real cost arrives at roughly 50,000 schools or heavy
file storage, neither of which is near.

## Keeping the workbook in sync

You don't. After go-live the database is the source of truth and the sheet is
history. If you need one more bulk import — a new region, say — put it in the
same column layout, run `tools/import_master_workbook.py` to regenerate
`seed-data.js`, then re-run `tools/seed_supabase.mjs`. Existing rows are
updated by id and logged activity is never touched.
