# Deploying Robobox Connect

Two questions decide everything: **where the data lives**, and **who says a
visitor is Ayush**. Everything else copies across as-is — no build step, no
framework, no bundler.

## Pilot on the client's domain (half a day)

Copy `robobox/` to the site, e.g. `/connect/`, and put it behind whatever
already restricts a folder there (basic auth, the members area, an IP
allow-list).

Each browser keeps its own copy, so Sid's Connects never reach Parth. Good for a
demo on the real domain; not the system of record.

## Production — one shared database

Until this is done every person has their own private copy in their own
browser. They can log Connects all day and nobody else will ever see one. That
is not a bug in the form; it is what "stored in this browser" means.

Everything below is written. What is left is a Supabase project and twenty
minutes.

1. **Create the project** at supabase.com (the free tier is well inside what
   seven people and a few thousand Connects need). In the SQL editor, run
   `supabase/schema.sql` whole. Four tables, plus row-level security that
   mirrors the app's permission map, a trigger that freezes
   `initial_potential`, and one that makes Connects append-only.

2. **Add the people.** Authentication → Users → Add user, for each of the
   seven, with their email and a password (that password becomes their access
   code). Then insert the matching `app_user` row for each, with the same `id`
   the auth user got, their `role` (`sales`, `sales_head`, `outsight`, `ceo`)
   and their `owner_key` — the name the workbook uses: `PARTH`, `AYUSH`,
   `SID`, `VIKAS`, `GAURAV`.

3. **Load the book.** From a terminal, never the page:

   ```bash
   export SUPABASE_URL=https://xxxx.supabase.co
   export SUPABASE_SERVICE_KEY=...        # Project Settings → API → service_role
   python3 tools/load_supabase.py --dry-run     # prints what it would write
   python3 tools/load_supabase.py
   ```

   The service-role key bypasses row-level security, which is exactly why it
   stays in the shell and never reaches `config.js`. Seed ids map to
   deterministic uuids, so a second run updates the same rows instead of
   doubling the book.

4. **Point the app at it.** Put the project URL and the **anon** key in
   `assets/js/config.js`. Both are safe in the page: the anon key grants
   nothing by itself, because every table is behind policies that read
   `auth.uid()`. Redeploy. `store-supabase.js` sees the credentials and swaps
   itself in; nothing else changes.

5. **Sign-in becomes real.** With a backend configured, the access code is
   checked by Supabase instead of by the browser, so the codes stop being
   readable in the page source. The dropdown still lists names; the permission
   map, `visibleSchools()` and `can()` carry over untouched.

### What this does and does not fix

Fixes: everyone reads and writes the same records; permissions are enforced by
the server, not just drawn by the page; the data survives a cleared browser, a
new phone, and iOS evicting local storage.

Does not: there is no offline queue. A Connect logged with no signal fails with
a message rather than saving quietly to be lost later — which is the honest
behaviour, but it does mean the form needs a connection.

## Check before handover

- Sign in as a rep: they see only their own schools, and `#/pulse` bounces them
  back to My day.
- Log a Connect as one person, sign in as another, confirm it is there. That one
  test proves the database and row-level security together.
- Log a Connect with a next action; confirm the task and calendar entry appear
  without anyone creating them.
- Open it on a phone — that is where the Connect form actually gets used.
