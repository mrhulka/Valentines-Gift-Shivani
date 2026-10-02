/* Does every field the app writes survive a trip to the database and back?
 *
 *   node tools/test_store_map.js
 *
 * A column that is missing from the schema, or absent from the adapter's map,
 * loses that field silently - the write succeeds and the value is simply gone.
 * Stage is the one that hurts most: the whole pipeline is derived from it, so
 * dropping it flattens every deal to "New School" with no error anywhere.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let checks = 0;
const raw = require('assert');
const check = new Proxy(raw, {
  get(t, k) { const v = t[k];
    return typeof v === 'function' ? (...a) => { checks++; return v.apply(t, a); } : v; }
});

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// store-supabase.js assumes a browser; give it just enough of one.
const ctx = {
  console, fetch: () => Promise.reject(new Error('no network in this test')),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
ctx.window.RB = { config: { supabaseUrl: '', supabaseAnonKey: '' } };
vm.runInContext(read('assets/js/store-supabase.js'), ctx, 'store-supabase.js');
const S = ctx.window.RB.supabase;

/* ---- the adapter's map and the SQL schema agree ------------------------- */
const sql = read('supabase/schema.sql');
const columns = table => {
  const m = sql.match(new RegExp('create table ' + table + ' \\((.*?)\\n\\);', 's'));
  assert.ok(m, 'schema has a ' + table + ' table');
  return new Set([...m[1].matchAll(/^\s{2}(\w+)/gm)].map(x => x[1]));
};
for (const [entity, map] of Object.entries(S.MAPS)) {
  const have = columns(entity);
  for (const [field, col] of Object.entries(map)) {
    check.ok(have.has(col),
      entity + '.' + field + ' -> column "' + col + '" exists in schema.sql');
  }
}

/* ---- every field store.js writes is carried ---------------------------- */
const store = read('assets/js/store.js');
const written = fn => {
  const m = store.match(new RegExp('function ' + fn + '\\(fields\\) \\{.*?Object\\.assign\\(\\{(.*?)\\}, fields\\)', 's'));
  assert.ok(m, 'found ' + fn + ' in store.js');
  // Strip comments first: "The flow's rule:" inside the literal reads as a
  // field name otherwise, and the test starts failing on prose.
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return [...body.matchAll(/(\w+)\s*:/g)].map(x => x[1]);
};
const SKIP = { connect: ['by'] };          // `by` is remapped to the auth uid
for (const [entity, fn] of [['school', 'addSchool'], ['contact', 'addContact'],
                            ['opportunity', 'addOpportunity'], ['connect', 'logConnect']]) {
  for (const field of written(fn)) {
    if ((SKIP[entity] || []).includes(field)) continue;
    check.ok(S.MAPS[entity][field],
      'store.js writes ' + entity + '.' + field + ', and the adapter maps it');
  }
}
check.ok(S.MAPS.connect.by === 'logged_by', 'the connect author maps to logged_by');

/* ---- round trip loses nothing ------------------------------------------ */
const conn = {
  id: 'c1', schoolId: 's1', opportunityId: 'o1', by: 'u1', kind: 'New', mode: 'Call',
  contactId: null, response: 'Interested', interest: 'Hot', blocker: 'None',
  blockerDetail: null, changed: null, commercial: { quoted: 500000 }, notes: 'n',
  remarks: 'r', stage: 'Proposal', expectedValue: 1200000, probability: 60,
  expectedClosure: '2026-12-01', nextAction: 'Send proposal', nextActionOwner: 'SID',
  nextActionAt: '2026-10-09T10:00:00', origin: 'app', at: '2026-10-02T09:00:00Z'
};
const back = S.fromRow('connect', S.toRow('connect', conn));
Object.keys(conn).forEach(k => check.deepStrictEqual(
  JSON.stringify(back[k]), JSON.stringify(conn[k]), 'connect.' + k + ' survives the round trip'));
check.strictEqual(S.toRow('connect', conn).stage, 'Proposal',
  'stage reaches the database - the pipeline is derived from it');
check.strictEqual(S.toRow('connect', conn).expected_value, 1200000);

/* undefined is left out so a partial update does not blank a column... */
check.strictEqual('notes' in S.toRow('connect', { id: 'x' }), false,
  'a field that was never set is not sent');
/* ...but an explicit null IS sent, because clearing a value is a real edit. */
check.strictEqual(S.toRow('connect', { id: 'x', notes: null }).notes, null,
  'an explicit null is sent, so a cleared field is actually cleared');

/* ---- ids are insertable into a uuid column ----------------------------- */
const util = { window: ctx, console };
util.window = util; util.globalThis = util;
util.crypto = ctx.crypto;
vm.createContext(util);
util.window.RB = {};
vm.runInContext(read('assets/js/util.js'), util, 'util.js');
const id = util.window.RB.util.uid('SCH');
check.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id),
  'uid() returns a uuid a uuid column accepts, got ' + id);

console.log('store mapping: all ' + checks + ' assertions passed');
