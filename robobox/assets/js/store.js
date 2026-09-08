/* Robobox Sales OS - state + persistence.
 *
 * The store hides where the data lives. Today it is the browser (so the app
 * runs as a self-contained pilot with the real pipeline in it); in production
 * swap `RB.store.adapter` for the Supabase one in store-supabase.js, which
 * talks to the schema in ../../supabase/schema.sql. Nothing above this layer
 * changes.
 *
 * Adapters come in two shapes. A whole-document adapter (localStorage) just
 * implements read/write/clear. A shared-database adapter also implements the
 * granular hooks - saveSchool, saveActivity, saveUser, saveSettings - and every
 * mutation below tells commit() what actually changed, so two reps working at
 * once write their own rows instead of overwriting each other's copy of the
 * whole state.
 */
window.RB = window.RB || {};

RB.store = (function () {
  'use strict';

  var U = RB.util;
  var KEY = 'robobox.sales-os.v1';
  var listeners = [];
  var state = null;

  /* ----------------------------------------------------------- adapters */

  var localAdapter = {
    name: 'local',
    read: function () {
      try {
        var raw = window.localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    write: function (data) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        RB.store.persistError = e;
        return false;
      }
    },
    clear: function () {
      try { window.localStorage.removeItem(KEY); } catch (e) {}
    }
  };

  var adapter = localAdapter;

  /* -------------------------------------------------------------- seeding */

  function seed() {
    var src = window.ROBOBOX_SEED;
    var now = new Date().toISOString();
    return {
      version: 1,
      meta: Object.assign({}, src.meta, { seededAt: now }),
      users: src.users.map(function (u) { return Object.assign({}, u); }),
      schools: src.schools.map(function (s) {
        return Object.assign({}, s, {
          activities: [],
          createdAt: now,
          updatedAt: now
        });
      }),
      settings: {
        tamRatePerStudent: 1700,   // premium robotics-lab rate card seen in the sheet
        stalledAfterDays: 30,
        session: null
      }
    };
  }

  /* Returns a promise so a database adapter can fetch before the first paint.
   * The localStorage adapter resolves immediately. */
  function load() {
    return Promise.resolve(adapter.read()).then(function (stored) {
      if (stored && stored.schools && stored.schools.length) {
        state = migrate(stored);
      } else {
        state = seed();
        // Only a single-writer adapter seeds itself; a shared database is
        // seeded once by tools/seed_supabase.mjs, never by whoever logs in first.
        if (!adapter.saveSchool) persist();
      }
      return state;
    });
  }

  function migrate(s) {
    // Forward-compatible defaults for pilots seeded by an older build.
    s.settings = s.settings || {};
    if (s.settings.tamRatePerStudent == null) s.settings.tamRatePerStudent = 1700;
    if (s.settings.stalledAfterDays == null) s.settings.stalledAfterDays = 30;
    s.schools.forEach(function (sc) {
      if (!sc.activities) sc.activities = [];
      if (!sc.products) sc.products = [];
      if (!sc.origin) sc.origin = 'import';
    });
    s.users.forEach(function (u) {
      if (!u.targets) u.targets = { revenue: 0, schoolsApproached: 0, meetings: 0, updates: 0, placeholder: true };
    });
    return s;
  }

  function persist() {
    var ok = adapter.write(state);
    if (!ok && RB.ui && RB.ui.toast) RB.ui.toast('Could not save — browser storage is full or blocked.');
    return ok;
  }

  function emit() {
    listeners.forEach(function (fn) { fn(state); });
  }

  /* change: {type: 'school'|'activity'|'user'|'settings'|'all', ...payload}
   * A granular adapter writes just that; a whole-document adapter ignores it
   * and rewrites everything, which is correct when there is only one writer. */
  function commit(change) {
    if (adapter.saveSchool || adapter.saveActivity) {
      writeGranular(change || { type: 'all' });
    } else {
      persist();
    }
    emit();
  }

  function writeGranular(change) {
    var done;
    switch (change.type) {
      case 'school':   done = adapter.saveSchool && adapter.saveSchool(change.school); break;
      case 'activity': done = adapter.saveActivity && adapter.saveActivity(change.activity, change.school); break;
      case 'user':     done = adapter.saveUser && adapter.saveUser(change.user); break;
      case 'settings': done = adapter.saveSettings && adapter.saveSettings(state.settings); break;
      default:         done = adapter.write && adapter.write(state);
    }
    if (done && typeof done.catch === 'function') {
      done.catch(function (err) {
        if (RB.ui && RB.ui.toast) RB.ui.toast('Could not save: ' + (err.message || 'the server refused the write.'));
      });
    }
  }

  /* --------------------------------------------------------------- reads */

  function all() { return state.schools; }
  function users() { return state.users; }
  function settings() { return state.settings; }
  function meta() { return state.meta; }

  function byId(id) {
    for (var i = 0; i < state.schools.length; i++) {
      if (state.schools[i].id === id) return state.schools[i];
    }
    return null;
  }

  function userById(id) {
    for (var i = 0; i < state.users.length; i++) {
      if (state.users[i].id === id) return state.users[i];
    }
    return null;
  }

  /* -------------------------------------------------------------- writes */

  function updateSchool(id, patch) {
    var s = byId(id);
    if (!s) return null;
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    s.updatedAt = new Date().toISOString();
    recomputeDerived(s);
    commit({ type: 'school', school: s });
    return s;
  }

  function createSchool(fields, userId) {
    var now = new Date().toISOString();
    var s = Object.assign({
      id: U.uid('SCH'),
      srNo: null,
      name: '', region: null, location: null, boards: [],
      students: null, studentsMin: null, studentsMax: null,
      decisionMaker: null, owners: [], leadSource: null, leadSourceRaw: null,
      opportunityStatus: 'Needs qualification', opportunity: null,
      dealSize: null, ratePerStudent: null,
      stage: null, suggestedStage: 'New Lead', suggestedStageReason: 'Created in app',
      probability: null,
      lastContacted: null, lastContactedRaw: null, lastContactedPrecision: 'none',
      contactStatus: 'Not contacted',
      nextAction: null, nextActionDate: null,
      expectedClosure: null, expectedClosureRaw: null,
      blockers: null, blockerTags: [], competitors: [], remarks: null,
      products: [], rejectedReason: null,
      missingCount: 0, duplicateFlag: false, inActionQueue: false,
      origin: 'app', addedAt: U.iso(U.today()),
      activities: [], createdBy: userId, createdAt: now, updatedAt: now
    }, fields);
    recomputeDerived(s);
    state.schools.push(s);
    commit({ type: 'school', school: s });
    return s;
  }

  /* An activity is the only thing a rep logs. Everything the pipeline needs
   * to stay current — last contacted, stage, next action, deal size — is
   * derived from it here, which is the manual step this app removes. */
  function logActivity(schoolId, act, userId) {
    var s = byId(schoolId);
    if (!s) return null;
    var entry = {
      id: U.uid('ACT'),
      schoolId: schoolId,
      date: act.date || U.iso(U.today()),
      loggedAt: new Date().toISOString(),
      by: userId,
      type: act.type || 'Call',
      contact: act.contact || null,
      outcome: act.outcome || 'Neutral',
      notes: act.notes || null,
      stageFrom: s.stage || s.suggestedStage,
      stageTo: act.stageTo || null,
      nextAction: act.nextAction || null,
      nextActionDate: act.nextActionDate || null,
      dealSize: act.dealSize == null ? null : Number(act.dealSize),
      expectedClosure: act.expectedClosure || null,
      blockers: act.blockers || null,
      competitors: act.competitors || null,
      products: act.products || null,
      rejectedReason: act.rejectedReason || null
    };
    s.activities.push(entry);

    if (!s.lastContacted || entry.date > s.lastContacted) {
      s.lastContacted = entry.date;
      s.lastContactedPrecision = 'exact';
      s.lastContactedRaw = null;
    }
    s.contactStatus = 'Contacted';
    if (entry.stageTo) {
      s.stage = entry.stageTo;
      if (entry.stageTo === 'Won' || entry.stageTo === 'Lost') {
        s.closedAt = entry.date;
      }
    }
    if (entry.nextAction) s.nextAction = entry.nextAction;
    if (entry.nextActionDate) s.nextActionDate = entry.nextActionDate;
    if (entry.dealSize != null && !isNaN(entry.dealSize)) s.dealSize = entry.dealSize;
    if (entry.expectedClosure) s.expectedClosure = entry.expectedClosure;
    if (entry.blockers != null) {
      s.blockers = entry.blockers;
      s.blockerTags = RB.metrics.tagBlockers(entry.blockers);
    }
    if (entry.competitors) {
      s.competitors = String(entry.competitors).split(/\s*,\s*/).filter(Boolean);
    }
    if (entry.products) s.products = entry.products;
    if (entry.stageTo === 'Lost') s.rejectedReason = entry.rejectedReason || s.rejectedReason;
    if (entry.stageTo && entry.stageTo !== 'Lost') s.rejectedReason = null;
    // A product line is also inferred from what the rep just wrote, so the
    // Curriculum / Bagless split stays current without a second form field.
    if (!s.products.length) {
      s.products = RB.metrics.tagProducts([entry.notes, entry.nextAction].filter(Boolean).join(' '));
    }
    if (s.opportunityStatus === 'Needs qualification' && (entry.stageTo || entry.dealSize)) {
      s.opportunityStatus = 'Opportunity identified';
    }
    if (!s.owners.length) {
      var u = userById(userId);
      if (u && u.ownerKey) s.owners = [u.ownerKey];
    }
    s.updatedAt = new Date().toISOString();
    recomputeDerived(s);
    commit({ type: 'activity', activity: entry, school: s });
    return entry;
  }

  function deleteActivity(schoolId, activityId) {
    var s = byId(schoolId);
    if (!s) return;
    s.activities = s.activities.filter(function (a) { return a.id !== activityId; });
    recomputeDerived(s);
    commit({ type: 'school', school: s });
  }

  function activities(filterFn) {
    var out = [];
    state.schools.forEach(function (s) {
      s.activities.forEach(function (a) {
        if (!filterFn || filterFn(a, s)) out.push(Object.assign({ school: s }, a));
      });
    });
    return out;
  }

  function recomputeDerived(s) {
    s.missingCount = RB.metrics.missingFields(s).length;
    if (s.dealSize && s.students) s.ratePerStudent = Math.round(s.dealSize / s.students);
  }

  function updateTargets(userId, targets) {
    var u = userById(userId);
    if (!u) return null;
    u.targets = Object.assign({}, u.targets, targets, { placeholder: false });
    commit({ type: 'user', user: u });
    return u;
  }

  function updateSettings(patch) {
    Object.assign(state.settings, patch);
    commit({ type: 'settings' });
  }

  function resetDemo() {
    adapter.clear();
    state = seed();
    persist();
    emit();
  }

  function exportState() { return JSON.stringify(state, null, 1); }

  function importState(json) {
    var parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.schools)) throw new Error('Not a Robobox export.');
    state = migrate(parsed);
    commit();
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  return {
    load: load, all: all, byId: byId, users: users, userById: userById,
    settings: settings, meta: meta, updateSchool: updateSchool, createSchool: createSchool,
    logActivity: logActivity, deleteActivity: deleteActivity, activities: activities,
    updateSettings: updateSettings, updateTargets: updateTargets, resetDemo: resetDemo, exportState: exportState,
    importState: importState, subscribe: subscribe, commit: commit,
    get adapter() { return adapter; },
    set adapter(a) { adapter = a; },
    localAdapter: localAdapter
  };
})();
