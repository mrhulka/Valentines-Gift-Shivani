/* One check for the dashboard's money logic.
 *
 *   node tools/test_model.js
 *
 * A fixture with known wins, losses, stages and dates, asserted against every
 * headline formula the CEO dashboard prints. If a formula drifts, this fails.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The app's files assume a browser: `window` is the global object itself.
const ctx = { console, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
['util.js', 'model.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', f), 'utf8'), ctx, f);
});
const RB = ctx.window.RB, M = RB.model, U = RB.util;

const today = U.iso(U.today());
const ago = n => U.addDays(today, -n);
const ahead = n => U.addDays(today, n);

const D = {
  users: [{ id: 'a', name: 'A', ownerKey: 'A', role: 'sales' },
          { id: 'b', name: 'B', ownerKey: 'B', role: 'sales' }],
  schools: [
    { id: 'S1', name: 'Alpha', region: 'Pune', board: 'CBSE', students: 2000, leadSource: 'Referral',
      competitor: 'None', existingLab: 'None', stemLab: 'No', ownerKey: 'A' },
    { id: 'S2', name: 'Beta', region: 'Western', board: 'ICSE', students: 900, leadSource: 'Cold',
      competitor: 'Eduvate', existingLab: 'Competitor', stemLab: 'Yes', labSpend: 500000, ownerKey: 'B' },
    { id: 'S3', name: 'Gamma', region: 'Pune', board: 'CBSE', students: 2500, leadSource: 'Referral',
      competitor: 'None', existingLab: "Don't Know", ownerKey: 'A' }
  ],
  contacts: [{ id: 'C1', schoolId: 'S1', name: 'P', role: 'Principal' }],
  opportunities: [
    // won: created 100d ago, closed 40d ago for 12L (expected was 10L)
    { id: 'O1', schoolId: 'S1', offering: 'STEM Lab', ownerKey: 'A', initialPotential: 1000000,
      status: 'Won', closedValue: 1200000, closedAt: ago(40), createdAt: ago(100) },
    // lost: value at loss 800000, "current" would otherwise be 900000
    { id: 'O2', schoolId: 'S2', offering: 'Bagless', ownerKey: 'B', initialPotential: 900000,
      status: 'Lost', finalValue: 800000, closedAt: ago(10), createdAt: ago(60) },
    // open + fully qualified, 50% of 20L, closing in 15 days
    { id: 'O3', schoolId: 'S1', offering: 'STEM Lab', ownerKey: 'A', initialPotential: 2000000,
      status: 'Open', createdAt: ago(30), currentNeed: 'Lab', decisionMaker: 'P' },
    // open, unqualified (no next action, no contact, no need)
    { id: 'O4', schoolId: 'S3', offering: 'Workshop', ownerKey: 'A', initialPotential: 300000,
      status: 'Open', createdAt: ago(200) }
  ],
  connects: [
    { id: 'K1', schoolId: 'S1', opportunityId: 'O1', by: 'a', kind: 'New', mode: 'Meeting',
      response: 'Interested', stage: 'Won', at: ago(41) + 'T10:00:00', commercial: {} },
    { id: 'K2', schoolId: 'S2', opportunityId: 'O2', by: 'b', kind: 'New', mode: 'Introductory Call',
      response: 'Rejected', stage: 'Lost', at: ago(11) + 'T10:00:00', commercial: {} },
    { id: 'K3', schoolId: 'S1', opportunityId: 'O3', by: 'a', kind: 'Reconnect', mode: 'Demo',
      response: 'Proposal Requested', stage: 'Proposal', blocker: 'Budget / Pricing',
      expectedValue: 2000000, probability: 50, expectedClosure: ahead(15),
      nextAction: 'Send proposal', nextActionOwner: 'A', nextActionAt: ahead(3) + 'T10:00:00',
      at: ago(5) + 'T11:30:00', commercial: {} },
    { id: 'K4', schoolId: 'S3', opportunityId: 'O4', by: 'a', kind: 'New', mode: 'WhatsApp',
      at: ago(200) + 'T09:00:00', commercial: {} }
  ]
};
const byId = (l, id) => l.filter(x => x.id === id)[0] || null;
RB.store = {
  users: () => D.users, schools: () => D.schools, contacts: () => D.contacts,
  opportunities: () => D.opportunities, connects: () => D.connects,
  schoolById: id => byId(D.schools, id), opportunityById: id => byId(D.opportunities, id),
  userById: id => byId(D.users, id), contactById: id => byId(D.contacts, id),
  contactsFor: id => D.contacts.filter(c => c.schoolId === id),
  opportunitiesFor: id => D.opportunities.filter(o => o.schoolId === id)
};

const vs = M.views();
const v = id => vs.filter(x => x.opp.id === id)[0];
const all = { from: '0000-01-01', to: '9999-12-31' };
const b = M.business(vs, all, D.schools);

/* --- the five headline numbers ----------------------------------------- */
// Potential revenue: everything not Lost that carries a value. 12L + 20L + 3L.
assert.strictEqual(b.potential, 1200000 + 2000000 + 300000, 'potential revenue');
assert.strictEqual(b.potentialCount, 3);

// Qualified: only O3 passes all six checks.
assert.strictEqual(b.qualifiedCount, 1, 'qualified count');
assert.strictEqual(b.qualified, 2000000, 'qualified pipeline');
assert.ok(!v('O4').qualified && v('O3').qualified);
assert.strictEqual(v('O4').qualification.next, false, 'O4 has no next action');

// Weighted: 20L x 50%. The unprobabilitied open deal contributes nothing.
assert.strictEqual(b.weighted, 1000000, 'weighted pipeline');

// Won uses the actual closed value, not the expected one.
assert.strictEqual(b.wonValue, 1200000, 'closed won');
assert.strictEqual(b.wonSchools, 1);

// Lost uses the value at the point of loss, not today's number.
assert.strictEqual(b.lostValue, 800000, 'lost at value');

// Expected closure: only deals whose closure date falls inside the window.
assert.strictEqual(b.closure[30].value, 1000000, 'expected closure 30d');
assert.strictEqual(b.closure[30].n, 1);

/* --- market ------------------------------------------------------------- */
assert.strictEqual(b.schoolsTapped, 3);
assert.strictEqual(b.untapped.length, 1, 'only S1 is confirmed lab-free');
assert.strictEqual(b.notAsked.length, 1, 'S3 has not been asked');
assert.strictEqual(b.students, 2000 + 900 + 2500);
assert.strictEqual(b.whitespace, 1 * b.whitespaceBasis.value);

/* --- time --------------------------------------------------------------- */
assert.strictEqual(v('O1').daysToClose, 60, 'won date - created date');
assert.strictEqual(M.salesSpeed(vs).avg, 60, 'days to close is reported as an average');
assert.strictEqual(v('O4').stageAge, 200, 'never moved since creation');
assert.ok(v('O4').stageAge > M.config().staleDays);
assert.ok(b.stale.some(x => x.opp.id === 'O4'), 'O4 is stale');

/* --- movement ----------------------------------------------------------- */
assert.ok(M.advancedIn(v('O3'), { from: ago(6), to: today }), 'O3 advanced this week');
assert.ok(!M.advancedIn(v('O3'), { from: ago(3), to: today }), 'but not in the last 3 days');
const perf = M.performance(vs, 'owner', { from: ago(6), to: today });
const A = perf.filter(g => g.key === 'A')[0];
assert.strictEqual(A.movedValue, 2000000, 'pipeline moved by A');

/* --- stage flow --------------------------------------------------------- */
const board = M.stageBoard(vs);
assert.strictEqual(board.exits.filter(e => e.key === 'Lost')[0].value, 800000);
assert.strictEqual(board.steps[0].n, 3, 'three live opportunities reached New Lead');

/* --- blockers ----------------------------------------------------------- */
const bl = M.blockerRisk(vs);
assert.strictEqual(bl.length, 1);
assert.strictEqual(bl[0].key, 'Budget / Pricing');
assert.strictEqual(bl[0].atRisk, 1000000, 'at risk = weighted');
// age factor: 30 days old -> min(30/30, 3) = 1
assert.strictEqual(Math.round(bl[0].priority), 1000000, 'priority = at risk x age factor');

/* --- lead source: leads are schools, not opportunities ------------------ */
const src = M.leadSources(vs, D.schools);
const ref = src.filter(g => g.key === 'Referral')[0];
assert.strictEqual(ref.leads, 2, 'S1 and S3 are Referral schools');
assert.strictEqual(ref.count, 3, 'three opportunities across them');
assert.ok(ref.toOpportunity > 100, 'more opportunities than leads is allowed');

/* --- the day board ------------------------------------------------------ */
const day = M.dayActivity(ago(5), null);
const rowA = day.filter(r => r.user.id === 'a')[0];
assert.strictEqual(rowA.demos, 1, 'Demo counted');
assert.strictEqual(rowA.calls, 0);
assert.strictEqual(rowA.movedValue, 2000000, 'the day the stage moved');
const dayB = M.dayActivity(ago(11), null).filter(r => r.user.id === 'b')[0];
assert.strictEqual(dayB.calls, 1, '"Introductory Call" lands in Calls');

/* --- fit + lookalikes --------------------------------------------------- */
const fit = M.fitModel(vs);
assert.strictEqual(fit.useWinRate, false, 'two closed deals is under the sample floor');
const s1 = fit.score(D.schools[0]);
assert.ok(s1.score >= 0 && s1.score <= 100, 'score is a percentage');
assert.ok(s1.why.length > 10, 'the score explains itself');
const looks = M.lookalikes(vs, fit, D.schools);
assert.ok(!looks.some(l => l.school.id === 'S1'), 'a school we already won is not a lookalike');
assert.ok(looks.some(l => l.school.id === 'S3'), 'a school with no opportunity still gets scored');

/* --- the profile refuses a small sample --------------------------------- */
assert.strictEqual(M.winningProfile(vs).enough, false);
M.setConfig({ minWinSample: 1 });
assert.strictEqual(M.winningProfile(vs).enough, true, 'and answers once the floor is met');
M.setConfig({ minWinSample: 10 });

/* --- attention rules ---------------------------------------------------- */
M.setConfig({ highValue: 200000 });
const att = M.needsAttention(vs, fit);
assert.ok(att.some(i => i.v.opp.id === 'O4'), 'O4: large deal, stuck, no next action');
assert.ok(att.every(i => i.problem && i.action), 'every item names a problem and an action');
M.setConfig({ highValue: null });

/* --- the rate card: pro rata on the roll -------------------------------- */
// Unpriced means unpriced. No default rate card is ever assumed.
assert.strictEqual(M.priceFor('STEM Lab', null, 2000), null, 'no price set yet');
assert.strictEqual(M.listValue(vs).value, 0);

M.setPrice('STEM Lab', 500000, 1000);          // 5L buys 1,000 students
// S1 has 2,000 students -> twice the base -> twice the price.
assert.strictEqual(M.priceFor('STEM Lab', null, 2000).value, 1000000, 'pro rata up');
assert.strictEqual(M.priceFor('STEM Lab', null, 500).value, 250000, 'pro rata down');
assert.strictEqual(M.priceFor('STEM Lab', null, null).value, null, 'no student count, no quote');

// A bagless activity is priced on its own line, not on the parent slab.
assert.strictEqual(M.priceFor('Bagless', 'Pottery', 900), null, 'activity not priced');
M.setPrice('Bagless · Pottery', 60000, 300);
assert.strictEqual(M.priceFor('Bagless', 'Pottery', 900).value, 180000, 'activity pro rata');
assert.strictEqual(M.priceFor('Bagless', 'Hydroponics', 900), null, 'other activities unaffected');

// A price with no base student count is a flat rate, not a divide-by-zero.
M.setPrice('Kit Class', 75000, null);
assert.strictEqual(M.priceFor('Kit Class', null, 4000).value, 75000, 'flat rate');

// Two STEM Lab opportunities at S1 (2,000 students): O1 is won, so only the
// open one counts; the Bagless and Workshop rows stay unpriceable.
var lv = M.listValue(vs.filter(v => v.status === 'Open'));
assert.strictEqual(lv.value, 1000000, 'open pipeline at list price');
assert.strictEqual(lv.unpriced.length, 1, 'the unpriced Workshop is reported, not hidden');

// Every catalogue line the CEO can price, including anything already in the
// data that the catalogue does not name.
var lines = M.priceLines();
assert.strictEqual(lines.filter(l => l.activity).length, 6, 'six bagless activities');
assert.ok(lines.some(l => l.id === 'Advanced Lab Pro'));
assert.ok(lines.some(l => l.legacy && l.id === 'Workshop'), 'live offerings outside the catalogue are priceable');
M.setConfig({ pricing: {} });

/* --- the journey: six steps, cumulative ---------------------------------- */
var j = M.journey(vs);
assert.strictEqual(j.length, 6);
assert.strictEqual(j.map(s => s.key).join('|'),
  'New Schools|Connected|Meetings|Proposal|Discussion|Won');
// O1 is Won, O3 is at Proposal, O4 never moved. Lost is off the journey.
assert.strictEqual(j[0].n, 3, 'three live deals entered at New Schools');
assert.strictEqual(j[3].n, 2, 'the won deal and the proposal reached Proposal');
assert.strictEqual(j[5].n, 1, 'one won');
for (var i = 1; i < j.length; i++) {
  assert.ok(j[i].n <= j[i - 1].n, 'step ' + i + ' cannot exceed the one before it');
}
assert.strictEqual(j[5].value, 1200000, 'the journey carries value, not just counts');

/* --- business health ----------------------------------------------------- */
var hb = M.health(vs);
assert.strictEqual(hb.map(h => h.key).join('|'),
  'Stuck|Overdue|No Next Step|Missing Information');
var by = {}; hb.forEach(h => by[h.key] = h);
// O4 has not moved in 200 days; O3 moved 5 days ago.
assert.ok(by.Stuck.rows.some(v => v.opp.id === 'O4'));
assert.ok(!by.Stuck.rows.some(v => v.opp.id === 'O3'));
assert.strictEqual(by['No Next Step'].rows.length, 1, 'only O4 has no next step');
assert.ok(by['Missing Information'].rows.some(v => v.opp.id === 'O4'));
assert.ok(!by['Missing Information'].rows.some(v => v.opp.id === 'O3'), 'O3 has everything');
// Nothing is overdue until a committed date passes.
assert.strictEqual(by.Overdue.n, 0);
D.connects.push({ id: 'K5', schoolId: 'S1', opportunityId: 'O3', by: 'a', kind: 'Reconnect',
  mode: 'Call', stage: 'Proposal', nextAction: 'Follow-up', nextActionOwner: 'A',
  nextActionAt: ago(2) + 'T10:00:00', at: ago(2) + 'T10:00:00', commercial: {} });
M.invalidate();
assert.strictEqual(M.health(M.views()).filter(h => h.key === 'Overdue')[0].n, 1,
  'a passed next-step date is overdue');
D.connects.pop(); M.invalidate();

/* --- my performance: four numbers against one target set ----------------- */
M.setConfig({ targets: { connections: 4, meetings: 2, newSchools: 1, businessWon: 1000000 } });
var myPerf = M.performanceOf('A', all, null);
assert.strictEqual(myPerf.map(r => r.label).join('|'),
  'Connections|Meetings|New Schools|Business Won');
var pm = {}; myPerf.forEach(r => pm[r.key] = r);
assert.strictEqual(pm.connections.actual, 3, 'a logged three connects');
assert.strictEqual(pm.meetings.actual, 2, 'Meeting and Demo count, the WhatsApp does not');
assert.strictEqual(pm.businessWon.actual, 1200000, 'won uses the actual closed value');
assert.strictEqual(pm.connections.pct, 75, '3 of 4');
assert.ok(pm.businessWon.pct > 100, 'over target is reported, not capped');
M.setConfig({ targets: {} });
assert.strictEqual(M.performanceOf('A', all, null)[0].target, null, 'no target, no percentage');
assert.strictEqual(M.performanceOf('A', all, null)[0].pct, null);

/* --- the five next steps that matter: overdue first, then money ---------- */
var top = M.topSteps('a', 5);
assert.ok(top.length <= 5);
if (top.length > 1) {
  var rank = t => t.bucket === 'Overdue' ? 2 : t.bucket === 'Today' ? 1 : 0;
  for (var k = 1; k < top.length; k++) {
    assert.ok(rank(top[k]) <= rank(top[k - 1]), 'overdue steps come first');
  }
}

/* --- a blocker is counted in schools, not only deals --------------------- */
var b2 = M.blockerRisk(vs);
assert.strictEqual(b2[0].schools, 1, 'one school behind the budget blocker');
assert.ok(b2[0].schools <= b2[0].count, 'schools can never exceed deals');

/* --- average, not median, and it ignores deals that never closed --------- */
assert.strictEqual(U.mean([10, 20, 60]), 30);
assert.strictEqual(U.mean([]), null);
assert.strictEqual(U.mean([5, null, undefined, 15]), 10, 'blanks are skipped, not counted as zero');

console.log('model: all ' + 76 + ' assertions passed');
