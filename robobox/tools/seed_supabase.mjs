/* Load the imported workbook into a fresh Supabase database, once.
 *
 *   npm i @supabase/supabase-js
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=<service-role key> \
 *   node tools/seed_supabase.mjs
 *
 * Uses the service-role key, which bypasses row-level security - that is why
 * it runs from a terminal and never from the browser. Keep it out of the repo
 * and out of the page.
 *
 * Safe to re-run: every row is upserted by primary key, so a second run
 * refreshes the school records without duplicating them. It never deletes
 * activities the team has logged.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY first.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

// seed-data.js is a browser file: one assignment to window.ROBOBOX_SEED.
const raw = readFileSync(join(here, '..', 'assets', 'js', 'seed-data.js'), 'utf8');
const seed = JSON.parse(raw.slice(raw.indexOf('=') + 1).trim().replace(/;$/, ''));

const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function run() {
  // 1. Users. Each must already exist in auth.users - create them in the
  //    Supabase dashboard (or via the admin API) and paste the ids into a
  //    users.json next to this script if they differ from the seed ids.
  let users = seed.users;
  try {
    users = JSON.parse(readFileSync(join(here, 'users.json'), 'utf8'));
    console.log('Using tools/users.json for the auth ids.');
  } catch { /* fall back to the seed ids */ }

  const { error: uErr } = await db.from('app_user').upsert(users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    owner_key: u.ownerKey,
    targets: u.targets || { placeholder: true }
  })));
  if (uErr) throw new Error('app_user: ' + uErr.message);
  console.log(`users     ${users.length}`);

  // 2. Schools.
  const rows = seed.schools.map(s => ({
    id: s.id,
    source_sr_no: s.srNo,
    name: s.name,
    region: s.region,
    location: s.location,
    boards: s.boards,
    students: s.students,
    students_min: s.studentsMin,
    students_max: s.studentsMax,
    decision_maker: s.decisionMaker,
    lead_source: s.leadSource,
    lead_source_raw: s.leadSourceRaw,
    opportunity_status: s.opportunityStatus,
    opportunity: s.opportunity,
    deal_size: s.dealSize,
    stage: s.stage,
    suggested_stage: s.suggestedStage,
    suggested_stage_reason: s.suggestedStageReason,
    probability: s.probability,
    last_contacted: s.lastContacted,
    last_contacted_raw: s.lastContactedRaw,
    last_contacted_precision: s.lastContactedPrecision,
    contact_status: s.contactStatus,
    next_action: s.nextAction,
    next_action_date: s.nextActionDate,
    expected_closure: s.expectedClosure,
    expected_closure_raw: s.expectedClosureRaw,
    blockers: s.blockers,
    blocker_tags: s.blockerTags,
    competitors: s.competitors,
    products: s.products,
    remarks: s.remarks,
    duplicate_flag: s.duplicateFlag,
    origin: 'import'
  }));

  for (const batch of chunk(rows, 200)) {
    const { error } = await db.from('school').upsert(batch);
    if (error) throw new Error('school: ' + error.message);
  }
  console.log(`schools   ${rows.length}`);

  // 3. Ownership. The workbook's shared rows ("AYUSH & PARTH") become one link
  //    per person, which is why this is its own table.
  const byKey = Object.fromEntries(users.filter(u => u.ownerKey).map(u => [u.ownerKey, u.id]));
  const links = [];
  seed.schools.forEach(s => s.owners.forEach(key => {
    if (byKey[key]) links.push({ school_id: s.id, user_id: byKey[key] });
  }));

  for (const batch of chunk(links, 500)) {
    const { error } = await db.from('school_owner').upsert(batch);
    if (error) throw new Error('school_owner: ' + error.message);
  }
  console.log(`owners    ${links.length} links`);

  const unowned = seed.schools.filter(s => !s.owners.length).length;
  console.log(`\nDone. ${unowned} schools have no owner yet — assign them in the app.`);
}

run().catch(err => { console.error('\nFailed:', err.message); process.exit(1); });
