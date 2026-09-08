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

## Production

1. **Database.** Create a Supabase project and run `supabase/schema.sql`. Four
   tables — school, contact, opportunity, connect — plus row-level security that
   mirrors the app's permission map, a trigger that makes `initial_potential`
   immutable, and one that makes connects append-only.

2. **Users.** Add each salesperson under Authentication → Users, then insert a
   matching `app_user` row with their `role` and `owner_key` (the name used in
   the workbook: `AYUSH`, `SID`…).

3. **Load the workbook.** Run `tools/import_master_workbook.py` to regenerate
   `assets/js/seed-data.js`, then insert those five arrays into the matching
   tables with the service-role key from a terminal. The key bypasses row-level
   security, so it never goes near the page.

4. **Point the app at it.** `assets/js/store.js` writes through one adapter
   object. Replace `RB.store.adapter` with one that implements `read()`
   (returns `{users, schools, contacts, opportunities, connects}`) and
   `save(change)` (`change.type` is `connect`, `school` or `opportunity`).
   Because a Connect is the only write a salesperson makes, `save` is a single
   insert — there is no roll-up to keep consistent.

5. **Login.** `assets/js/auth.js` checks the access code in the browser, which
   is fine for a pilot and not for production. Point `signIn` / `restore` /
   `setUser` at the host site's session or Supabase auth. The `PERMISSIONS` map,
   `visibleSchools()` and `can()` carry over untouched.

6. **Host it.** Any static host — their server, WordPress uploads, Netlify,
   Vercel, Cloudflare Pages, S3. Serve over HTTPS with
   `Content-Type: text/html; charset=utf-8` (every host does this by default;
   the ₹ signs depend on it).

## Check before handover

- Sign in as a rep: they see only their own schools, and `#/pulse` bounces them
  back to My day.
- Log a Connect as one person, sign in as another, confirm it is there. That one
  test proves the database and row-level security together.
- Log a Connect with a next action; confirm the task and calendar entry appear
  without anyone creating them.
- Open it on a phone — that is where the Connect form actually gets used.
