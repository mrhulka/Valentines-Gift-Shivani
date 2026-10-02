/* Robobox Connect - the shared database.
 *
 * Swaps RB.store's browser-only adapter for one backed by Supabase, so the
 * seven people on the team read and write the same records instead of seven
 * private copies. Nothing above this file changes: store.js still exposes the
 * same reads and writes, and model.js still derives stage, tasks, the calendar
 * and every roll-up from connect history.
 *
 * Two things carry the design:
 *
 *   Permissions are the database's job. The app's PERMISSIONS map decides what
 *   to draw; row-level security in supabase/schema.sql decides what the server
 *   will hand over. A tampered-with page gets nothing extra, because the
 *   policies read auth.uid(), not anything the client claims.
 *
 *   A connect is the only write a salesperson makes, and it is append-only in
 *   the database too. There is no roll-up to keep consistent, so `save` is a
 *   single insert.
 *
 * Inactive unless RB.config has a URL and an anon key - see config.js.
 */
window.RB = window.RB || {};

RB.supabase = (function () {
  'use strict';

  var cfg = (RB.config || {});
  var URL_ = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  var KEY = String(cfg.supabaseAnonKey || '');
  var enabled = !!(URL_ && KEY);

  var session = null;              // { access_token, refresh_token, expires_at, user }
  var SESSION_KEY = 'robobox.connect.session';

  /* ------------------------------------------------------------- mapping */
  /* One table per entity: app field -> column. Everything not listed is not
   * stored, which keeps a typo in the app from silently inventing a column. */
  var MAPS = {
    school: {
      id: 'id', name: 'name', location: 'location', region: 'region', cluster: 'cluster',
      board: 'board', students: 'students', stemLab: 'stem_lab', labType: 'lab_type',
      labSpend: 'lab_spend', existingLab: 'existing_lab', competitor: 'competitor',
      leadSource: 'lead_source', referredBy: 'referred_by', ownerKey: 'owner_key',
      origin: 'origin', createdAt: 'created_at'
    },
    contact: {
      id: 'id', schoolId: 'school_id', name: 'name', role: 'role',
      phone: 'phone', email: 'email'
    },
    opportunity: {
      id: 'id', schoolId: 'school_id', offering: 'offering', variant: 'variant',
      ownerKey: 'owner_key', coOwners: 'co_owners', initialPotential: 'initial_potential',
      currentNeed: 'current_need', decisionMaker: 'decision_maker', stage: 'stage',
      probability: 'probability', expectedClosure: 'expected_closure', status: 'status',
      closedValue: 'closed_value', finalValue: 'final_value', lossReason: 'loss_reason',
      holdReason: 'hold_reason', closedAt: 'closed_at', origin: 'origin', createdAt: 'created_at'
    },
    connect: {
      id: 'id', schoolId: 'school_id', opportunityId: 'opportunity_id', by: 'logged_by',
      kind: 'kind', mode: 'mode', contactId: 'contact_id', response: 'response',
      interest: 'interest', blocker: 'blocker', blockerDetail: 'blocker_detail',
      changed: 'changed', commercial: 'commercial', notes: 'notes', remarks: 'remarks',
      stage: 'stage', expectedValue: 'expected_value', probability: 'probability',
      expectedClosure: 'expected_closure', nextAction: 'next_action',
      nextActionOwner: 'next_action_owner', nextActionAt: 'next_action_at',
      origin: 'origin', at: 'at'
    },
    app_user: {
      id: 'id', name: 'name', email: 'email', role: 'role',
      ownerKey: 'owner_key', active: 'active'
    }
  };

  function toRow(entity, obj) {
    var map = MAPS[entity], row = {};
    Object.keys(map).forEach(function (k) {
      if (obj[k] !== undefined) row[map[k]] = obj[k];
    });
    return row;
  }

  function fromRow(entity, row) {
    var map = MAPS[entity], obj = {};
    Object.keys(map).forEach(function (k) { obj[k] = row[map[k]]; });
    return obj;
  }

  /* --------------------------------------------------------------- wire */
  function headers(extra) {
    var h = Object.assign({
      apikey: KEY,
      Authorization: 'Bearer ' + ((session && session.access_token) || KEY),
      'Content-Type': 'application/json'
    }, extra || {});
    return h;
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch(URL_ + path, {
      method: opts.method || 'GET',
      headers: headers(opts.headers),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        if (!r.ok) {
          var msg = (data && (data.message || data.error_description || data.error)) ||
                    ('HTTP ' + r.status);
          var err = new Error(msg);
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  /* An expired access token is the one failure that looks like "the app
   * stopped saving", so every call refreshes first rather than finding out. */
  function fresh() {
    if (!session) return Promise.resolve(null);
    if (session.expires_at && session.expires_at - Date.now() > 60000) {
      return Promise.resolve(session);
    }
    if (!session.refresh_token) return Promise.resolve(session);
    return api('/auth/v1/token?grant_type=refresh_token',
               { method: 'POST', body: { refresh_token: session.refresh_token } })
      .then(keep)
      .catch(function () { session = null; forget(); return null; });
  }

  function keep(res) {
    session = {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      expires_at: Date.now() + ((res.expires_in || 3600) * 1000),
      user: res.user
    };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
    return session;
  }

  function forget() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  /* ---------------------------------------------------------------- auth */
  function signIn(email, password) {
    return api('/auth/v1/token?grant_type=password',
               { method: 'POST', body: { email: email, password: password } })
      .then(keep)
      .then(function () { return me(); })
      .then(function (u) { return { ok: true, user: u }; })
      .catch(function (e) {
        return { ok: false,
                 error: e.status === 400 ? 'That access code is not right.'
                                         : (e.message || 'Could not reach the database.') };
      });
  }

  function restore() {
    if (session) return fresh().then(function () { return me(); });
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; }
    if (!session) return Promise.resolve(null);
    return fresh().then(function (s) { return s ? me() : null; }).catch(function () { return null; });
  }

  function signOut() {
    var done = session ? api('/auth/v1/logout', { method: 'POST' }).catch(function () {}) : Promise.resolve();
    session = null;
    forget();
    return done;
  }

  /* The signed-in person's own app_user row - name, role and owner key all
   * come from the database, never from the page. */
  function me() {
    if (!session || !session.user) return Promise.resolve(null);
    return select('app_user', 'id=eq.' + session.user.id).then(function (rows) {
      return rows.length ? fromRow('app_user', rows[0]) : null;
    });
  }

  function select(table, query) {
    return fresh().then(function () {
      return api('/rest/v1/' + table + '?select=*' + (query ? '&' + query : ''));
    });
  }

  /* --------------------------------------------------------------- reads */
  /* One round trip per table, in parallel. The whole book is a few hundred
   * rows; paging it would be more code than the data is long.
   * ponytail: fine to tens of thousands of rows - add a date window on
   * connect, the only table that grows without bound, when it stops being. */
  function read() {
    if (!session) return Promise.resolve(null);
    return Promise.all([
      select('app_user', 'order=name'),
      select('school', 'order=name'),
      select('contact'),
      select('opportunity'),
      select('connect', 'order=at')
    ]).then(function (r) {
      return {
        version: 2,
        meta: { source: 'Supabase', importedAt: new Date().toISOString().slice(0, 10) },
        users: r[0].map(function (x) { return fromRow('app_user', x); }),
        schools: r[1].map(function (x) { return fromRow('school', x); }),
        contacts: r[2].map(function (x) { return fromRow('contact', x); }),
        opportunities: r[3].map(function (x) { return fromRow('opportunity', x); }),
        connects: r[4].map(function (x) { return fromRow('connect', x); })
      };
    });
  }

  /* --------------------------------------------------------------- write */
  /* store.js hands over the whole state after every change; this sends only
   * what actually changed. A connect carries the school, contact and
   * opportunity the new-school flow created alongside it, because those are
   * pushed onto state without a commit of their own. */
  function save(change, state) {
    if (!session) return Promise.reject(new Error('Not signed in.'));
    return fresh().then(function () {
      if (change.type === 'connect') return saveConnect(change, state);
      if (change.type === 'school') return upsert('school', change.school);
      if (change.type === 'opportunity') return upsert('opportunity', change.opportunity);
      if (change.type === 'user' || change.type === 'user-removed') {
        return upsert('app_user', Object.assign({}, change.user,
          { active: change.type !== 'user-removed' }));
      }
      return Promise.resolve();
    });
  }

  function saveConnect(change, state) {
    var c = change.connect;
    var school = byId(state.schools, c.schoolId);
    var opp = byId(state.opportunities, c.opportunityId);
    var contact = c.contactId ? byId(state.contacts, c.contactId) : null;

    // Parents first: a connect's foreign keys have to exist before it lands.
    var chain = Promise.resolve();
    if (school && school.origin === 'app') chain = chain.then(function () { return upsert('school', school); });
    if (contact) chain = chain.then(function () { return upsert('contact', contact); });
    if (opp) chain = chain.then(function () { return upsert('opportunity', opp); });
    return chain
      .then(function () {
        return api('/rest/v1/connect', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: toRow('connect', Object.assign({}, c, { by: session.user.id }))
        });
      });
  }

  function upsert(table, obj) {
    return api('/rest/v1/' + table, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: toRow(table === 'app_user' ? 'app_user' : table, obj)
    });
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  return {
    enabled: enabled,
    adapter: { name: 'supabase', read: read, save: save, clear: function () {} },
    signIn: signIn, restore: restore, signOut: signOut, me: me,
    // exported for the mapping test
    toRow: toRow, fromRow: fromRow, MAPS: MAPS
  };
})();

/* Switch the app over the moment credentials are present. Everything above
 * store.js keeps calling the same functions. */
if (RB.supabase.enabled) {
  RB.store.adapter = RB.supabase.adapter;
  RB.auth.useBackend(RB.supabase);
}
