/* Robobox Sales OS - Supabase storage + auth.
 *
 * Include this AFTER store.js and auth.js and BEFORE app.js, together with the
 * supabase-js UMD build, to move the app off browser storage and onto the
 * shared database in ../../supabase/schema.sql:
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
 *   <script src="assets/js/store-supabase.js"></script>
 *   <script>RB.supabase.connect({ url: '...', anonKey: '...' });</script>
 *   <script src="assets/js/app.js"></script>
 *
 * The anon key is a public, publishable key - it is safe in page source
 * because every table is behind row-level security, so what a signed-in
 * person can read is decided in Postgres and not here. Never put the
 * service-role key on the page.
 */
window.RB = window.RB || {};

RB.supabase = (function () {
  'use strict';

  var client = null;

  function connect(cfg) {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('supabase-js did not load. Check the CDN script tag.');
    }
    client = window.supabase.createClient(cfg.url, cfg.anonKey);
    RB.store.adapter = adapter;
    if (cfg.useSupabaseAuth !== false) installAuth();
    return client;
  }

  /* ------------------------------------------------------------ mapping */
  /* Postgres uses snake_case and separate tables; the app uses camelCase and
   * one nested object. The translation lives here and nowhere else. */

  function schoolFromRow(row, owners, activities) {
    return {
      id: row.id,
      srNo: row.source_sr_no,
      name: row.name,
      region: row.region,
      location: row.location,
      boards: row.boards || [],
      students: row.students,
      studentsMin: row.students_min,
      studentsMax: row.students_max,
      decisionMaker: row.decision_maker,
      owners: owners || [],
      leadSource: row.lead_source,
      leadSourceRaw: row.lead_source_raw,
      opportunityStatus: row.opportunity_status,
      opportunity: row.opportunity,
      dealSize: row.deal_size == null ? null : Number(row.deal_size),
      ratePerStudent: row.rate_per_student,
      stage: row.stage,
      suggestedStage: row.suggested_stage,
      suggestedStageReason: row.suggested_stage_reason,
      probability: row.probability,
      lastContacted: row.last_contacted,
      lastContactedRaw: row.last_contacted_raw,
      lastContactedPrecision: row.last_contacted_precision,
      contactStatus: row.contact_status,
      nextAction: row.next_action,
      nextActionDate: row.next_action_date,
      expectedClosure: row.expected_closure,
      expectedClosureRaw: row.expected_closure_raw,
      blockers: row.blockers,
      blockerTags: row.blocker_tags || [],
      competitors: row.competitors || [],
      products: row.products || [],
      rejectedReason: row.rejected_reason,
      remarks: row.remarks,
      duplicateFlag: !!row.duplicate_flag,
      origin: row.origin || 'import',
      addedAt: row.added_at,
      closedAt: row.closed_at,
      missingCount: 0,
      inActionQueue: false,
      activities: activities || [],
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function schoolToRow(s) {
    return {
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
      rejected_reason: s.rejectedReason,
      remarks: s.remarks,
      duplicate_flag: s.duplicateFlag,
      origin: s.origin,
      added_at: s.addedAt,
      closed_at: s.closedAt || null
      // rate_per_student is a generated column; updated_at is set by a trigger.
    };
  }

  function activityFromRow(r) {
    return {
      id: r.id, schoolId: r.school_id, date: r.happened_on, loggedAt: r.logged_at,
      by: r.logged_by, type: r.type, contact: r.contact, outcome: r.outcome,
      notes: r.notes, stageFrom: r.stage_from, stageTo: r.stage_to,
      nextAction: r.next_action, nextActionDate: r.next_action_date,
      dealSize: r.deal_size == null ? null : Number(r.deal_size),
      expectedClosure: r.expected_closure, blockers: r.blockers,
      products: r.products, rejectedReason: r.rejected_reason
    };
  }

  function activityToRow(a) {
    return {
      id: a.id, school_id: a.schoolId, logged_by: a.by, happened_on: a.date,
      type: a.type, contact: a.contact, outcome: a.outcome, notes: a.notes,
      stage_from: a.stageFrom, stage_to: a.stageTo, next_action: a.nextAction,
      next_action_date: a.nextActionDate, deal_size: a.dealSize,
      expected_closure: a.expectedClosure, blockers: a.blockers,
      products: a.products, rejected_reason: a.rejectedReason
    };
  }

  function userFromRow(r) {
    return {
      id: r.id, name: r.name, email: r.email, role: r.role,
      ownerKey: r.owner_key, targets: r.targets || {}
    };
  }

  /* ------------------------------------------------------------ adapter */

  var adapter = {
    name: 'supabase',

    /* One round trip per table, then joined in the browser. At a few thousand
     * schools this is far cheaper than a per-row fetch, and RLS has already
     * narrowed the rows to what this person may see. */
    read: function () {
      return Promise.all([
        client.from('school').select('*'),
        client.from('school_owner').select('school_id, app_user(owner_key)'),
        client.from('activity').select('*').order('happened_on', { ascending: true }),
        client.from('app_user').select('*'),
        client.from('app_setting').select('*')
      ]).then(function (res) {
        res.forEach(function (r) { if (r.error) throw new Error(r.error.message); });

        var ownersBySchool = {};
        res[1].data.forEach(function (r) {
          var key = r.app_user && r.app_user.owner_key;
          if (!key) return;
          (ownersBySchool[r.school_id] = ownersBySchool[r.school_id] || []).push(key);
        });

        var actsBySchool = {};
        res[2].data.forEach(function (r) {
          (actsBySchool[r.school_id] = actsBySchool[r.school_id] || []).push(activityFromRow(r));
        });

        var settings = {};
        res[4].data.forEach(function (r) { settings[camel(r.key)] = r.value; });

        return {
          version: 1,
          meta: { source: 'supabase', importedAt: null, baseYearForTextDates: 2025,
                  rowsInSource: res[0].data.length },
          users: res[3].data.map(userFromRow),
          schools: res[0].data.map(function (row) {
            return schoolFromRow(row, ownersBySchool[row.id], actsBySchool[row.id]);
          }),
          settings: {
            tamRatePerStudent: settings.tamRatePerStudent || 1700,
            stalledAfterDays: settings.stalledAfterDays || 30
          }
        };
      });
    },

    saveSchool: function (s) {
      return client.from('school').upsert(schoolToRow(s)).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        return syncOwners(s);
      });
    },

    /* Only the activity is written. The database trigger rolls it into the
     * school row, so the two can never disagree - and a rep who loses their
     * connection mid-save leaves no half-updated school behind. */
    saveActivity: function (a) {
      return client.from('activity').insert(activityToRow(a)).then(function (r) {
        if (r.error) throw new Error(r.error.message);
      });
    },

    saveUser: function (u) {
      return client.from('app_user').update({ targets: u.targets }).eq('id', u.id)
        .then(function (r) { if (r.error) throw new Error(r.error.message); });
    },

    saveSettings: function (settings) {
      return client.from('app_setting').upsert([
        { key: 'tam_rate_per_student', value: settings.tamRatePerStudent },
        { key: 'stalled_after_days', value: settings.stalledAfterDays }
      ]).then(function (r) { if (r.error) throw new Error(r.error.message); });
    },

    clear: function () {
      throw new Error('Resetting the shared database from the browser is not allowed.');
    }
  };

  function syncOwners(s) {
    return client.from('app_user').select('id, owner_key').in('owner_key', s.owners.length ? s.owners : ['__none__'])
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        return client.from('school_owner').delete().eq('school_id', s.id).then(function () {
          if (!r.data.length) return;
          return client.from('school_owner').insert(r.data.map(function (u) {
            return { school_id: s.id, user_id: u.id };
          }));
        });
      });
  }

  function camel(k) {
    return String(k).replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }

  /* --------------------------------------------------------------- auth */
  /* Replaces the demo access-code check with real Supabase sessions. The
   * permission map, visibleSchools() and can() in auth.js are untouched -
   * only how a person proves who they are changes. */

  function installAuth() {
    RB.auth.signIn = function (email, password) {
      return client.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) return { ok: false, error: res.error.message };
          return adoptSession(res.data.user);
        });
    };

    RB.auth.restore = function () {
      return client.auth.getUser().then(function (res) {
        if (res.error || !res.data.user) return null;
        var r = adoptSession(res.data.user);
        return r.ok ? r.user : null;
      });
    };

    RB.auth.signOut = function () { return client.auth.signOut(); };
  }

  function adoptSession(authUser) {
    var u = RB.store.userById(authUser.id);
    if (!u) {
      return { ok: false, error: 'That login is not set up as a Robobox user yet.' };
    }
    RB.auth.setUser(u);
    return { ok: true, user: u };
  }

  return { connect: connect, adapter: adapter, get client() { return client; } };
})();
