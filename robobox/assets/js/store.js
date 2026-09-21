/* Robobox Connect - state + persistence.
 *
 * Four entities, nothing more: school, contact, opportunity, connect. Tasks,
 * calendar entries, stages, last-contact dates and every commercial roll-up are
 * derived in model.js, so there is nothing here to keep in sync.
 *
 * The adapter hides where the data lives. Default is this browser; swap
 * RB.store.adapter for the Supabase one in store-supabase.js for a shared
 * database. Nothing above this layer changes.
 */
window.RB = window.RB || {};

RB.store = (function () {
  'use strict';

  var U = RB.util;
  var KEY = 'robobox.connect.v1';
  var listeners = [];
  var state = null;

  var localAdapter = {
    name: 'local',
    read: function () {
      try {
        var raw = window.localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    write: function (data) {
      try { window.localStorage.setItem(KEY, JSON.stringify(data)); return true; }
      catch (e) { return false; }
    },
    clear: function () { try { window.localStorage.removeItem(KEY); } catch (e) {} }
  };

  var adapter = localAdapter;

  function seed() {
    var src = window.ROBOBOX_SEED;
    return {
      version: 2,
      meta: Object.assign({}, src.meta),
      users: src.users.map(function (u) { return Object.assign({}, u); }),
      schools: src.schools.map(function (x) { return Object.assign({}, x); }),
      contacts: src.contacts.map(function (x) { return Object.assign({}, x); }),
      opportunities: src.opportunities.map(function (x) { return Object.assign({}, x); }),
      connects: src.connects.map(function (x) { return Object.assign({}, x); })
    };
  }

  function load() {
    return Promise.resolve(adapter.read()).then(function (stored) {
      state = (stored && stored.schools && stored.version === 2) ? stored : seed();
      if (!stored || stored.version !== 2) persist();
      else if (syncRoster()) persist();
      return state;
    });
  }

  /* The roster is configuration, not transactional data: a browser that
   * already holds months of Connects must still pick up a new joiner or a
   * changed role. People added inside the app (origin 'app') are left alone.
   * Returns true when anything changed. */
  function syncRoster() {
    var seeded = window.ROBOBOX_SEED.users, byId = {}, changed = false;
    seeded.forEach(function (u) { byId[u.id] = u; });
    state.users = state.users.filter(function (u) {
      var keep = u.origin === 'app' || byId[u.id];
      if (!keep) changed = true;
      return keep;
    });
    state.users.forEach(function (u) {
      var s = byId[u.id];
      if (!s || u.removed) return;
      ['name', 'role', 'ownerKey', 'designation', 'email'].forEach(function (k) {
        if (s[k] !== undefined && u[k] !== s[k]) { u[k] = s[k]; changed = true; }
      });
    });
    var have = {};
    state.users.forEach(function (u) { have[u.id] = true; });
    seeded.forEach(function (u) {
      if (!have[u.id]) { state.users.push(Object.assign({}, u)); changed = true; }
    });
    return changed;
  }

  function persist() { return adapter.write(state); }

  function commit(change) {
    RB.model.invalidate();
    if (adapter.save) {
      Promise.resolve(adapter.save(change, state)).catch(function (e) {
        if (RB.ui) RB.ui.toast('Could not save: ' + (e.message || 'server refused the write'));
      });
    } else {
      persist();
    }
    listeners.forEach(function (fn) { fn(state); });
  }

  /* ------------------------------------------------------------- reads */
  var schools = function () { return state.schools; };
  var contacts = function () { return state.contacts; };
  var opportunities = function () { return state.opportunities; };
  var connects = function () { return state.connects; };
  /* Removed people are kept as a tombstone so their name still resolves on
   * the Connects they logged, and so the seed roster does not resurrect them
   * on the next load. They are gone from every list and from sign-in. */
  var users = function () { return state.users.filter(function (u) { return !u.removed; }); };
  var meta = function () { return state.meta; };

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  var schoolById = function (id) { return byId(state.schools, id); };
  var opportunityById = function (id) { return byId(state.opportunities, id); };
  var contactById = function (id) { return byId(state.contacts, id); };
  var userById = function (id) { return byId(state.users, id); };  // tombstones included, on purpose

  function contactsFor(schoolId) {
    return state.contacts.filter(function (c) { return c.schoolId === schoolId; });
  }
  function opportunitiesFor(schoolId) {
    return state.opportunities.filter(function (o) { return o.schoolId === schoolId; });
  }
  function connectsForSchool(schoolId) {
    return state.connects.filter(function (c) { return c.schoolId === schoolId; })
      .sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
  }

  /* A school exists once. Same name in the same location is the same school. */
  function findSchool(name, location) {
    var n = String(name || '').trim().toLowerCase();
    var l = String(location || '').trim().toLowerCase();
    return state.schools.filter(function (s) {
      return s.name.trim().toLowerCase() === n &&
             (!l || String(s.location || '').trim().toLowerCase() === l);
    })[0] || null;
  }

  /* ------------------------------------------------------------ writes */

  /* A salesperson. The owner key is how every opportunity, school and connect
   * already refers to a person, so it is derived from the name rather than
   * asked for - and kept unique. */
  function addUser(fields) {
    var name = String(fields.name || '').trim();
    var base = name.split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '') || 'USER';
    var key = base, n = 2;
    while (state.users.some(function (u) { return u.ownerKey === key; })) key = base + n++;
    var id = key.toLowerCase();
    var u = {
      id: id, name: name, role: fields.role || 'sales', ownerKey: key,
      designation: fields.designation || null, region: fields.region || null,
      email: fields.email || (id + '@robobox.in'),
      pin: fields.pin || id, origin: 'app'
    };
    state.users.push(u);
    commit({ type: 'user', user: u });
    return u;
  }

  function updateUser(id, patch) {
    var u = userById(id);
    if (u) { Object.assign(u, patch); commit({ type: 'user', user: u }); }
    return u;
  }

  /* Remove a salesperson. Their records are never deleted - a school keeps the
   * owner key it was worked under, so the history stays honest. What goes is
   * the login. Returns why, if it refuses. */
  function removeUser(id) {
    var u = userById(id);
    if (!u) return { ok: false, error: 'No such person.' };
    if (u.role === 'ceo') return { ok: false, error: 'The CEO account cannot be removed.' };
    var owned = state.schools.filter(function (sc) { return sc.ownerKey === u.ownerKey; }).length;
    u.removed = true;
    commit({ type: 'user-removed', user: u });
    return { ok: true, user: u, owned: owned };
  }

  function addSchool(fields) {
    var s = Object.assign({
      id: U.uid('SCH'), name: '', location: null, region: 'Central', cluster: null,
      board: null, students: null,
      // "Does a STEM lab already exist?" and, if so, whose and how much they spend.
      stemLab: null, labType: null, labSpend: null,
      existingLab: "Don't Know", competitor: 'None',
      leadSource: null, referredBy: null, ownerKey: null, origin: 'app',
      createdAt: U.iso(U.today())
    }, fields);
    state.schools.push(s);
    return s;
  }

  function addContact(fields) {
    var c = Object.assign({ id: U.uid('CON'), schoolId: null, name: '', role: null,
                            phone: null, email: null }, fields);
    state.contacts.push(c);
    return c;
  }

  function addOpportunity(fields) {
    var o = Object.assign({
      id: U.uid('OPP'), schoolId: null, offering: null, variant: null, ownerKey: null,
      coOwners: [],
      // Set once, at creation. Nothing in the app ever writes it again.
      initialPotential: null,
      currentNeed: null, decisionMaker: null,
      expectedClosure: null, probability: null, stage: null,
      status: 'Open', closedValue: null, lossReason: null, holdReason: null,
      closedAt: null, origin: 'app', createdAt: U.iso(U.today())
    }, fields);
    state.opportunities.push(o);
    return o;
  }

  /* The only write a salesperson makes. Everything else follows from it. */
  function logConnect(fields) {
    var c = Object.assign({
      id: U.uid('CNX'), schoolId: null, opportunityId: null, by: null,
      kind: 'Reconnect', mode: null, contactId: null, response: null, interest: 'Warm',
      blocker: 'None', blockerDetail: null, commercial: {},
      // The flow's rule: a connect is not complete without action + owner + date.
      nextAction: null, nextActionOwner: null, nextActionAt: null,
      // Set explicitly on every connect rather than inferred.
      stage: null, expectedValue: null, probability: null, expectedClosure: null,
      notes: null, remarks: null,
      at: new Date().toISOString(), origin: 'app'
    }, fields);
    state.connects.push(c);

    // A Connect may close its opportunity; that is the only thing it writes
    // outside its own row, and only because Won/Lost is a state, not an event.
    var opp = opportunityById(c.opportunityId);
    if (opp && fields.close) {
      opp.status = fields.close.status;
      opp.closedAt = c.at.slice(0, 10);
      if (fields.close.status === 'Won') opp.closedValue = fields.close.value;
      else if (fields.close.status === 'On Hold') opp.holdReason = fields.close.reason;
      else { opp.lossReason = fields.close.reason; opp.finalValue = fields.close.value; }
    } else if (opp && c.stage && !RB.model.CLOSED[c.stage]) {
      // Re-opened: a later connect moved it off Won / Lost / On Hold.
      opp.status = 'Open'; opp.closedAt = null;
    }
    if (opp && c.expectedClosure) opp.expectedClosure = c.expectedClosure;
    if (opp && c.probability != null) opp.probability = c.probability;

    commit({ type: 'connect', connect: c, opportunity: opp });
    return c;
  }

  function updateSchool(id, patch) {
    var s = schoolById(id);
    if (s) { Object.assign(s, patch); commit({ type: 'school', school: s }); }
    return s;
  }

  function updateOpportunity(id, patch) {
    var o = opportunityById(id);
    if (o) { Object.assign(o, patch); commit({ type: 'opportunity', opportunity: o }); }
    return o;
  }

  function resetDemo() {
    adapter.clear();
    state = seed();
    persist();
    RB.model.invalidate();
    listeners.forEach(function (fn) { fn(state); });
  }

  function exportState() { return JSON.stringify(state, null, 1); }

  return {
    load: load, commit: commit,
    schools: schools, contacts: contacts, opportunities: opportunities,
    connects: connects, users: users, meta: meta,
    schoolById: schoolById, opportunityById: opportunityById, contactById: contactById,
    userById: userById, contactsFor: contactsFor, opportunitiesFor: opportunitiesFor,
    connectsForSchool: connectsForSchool, findSchool: findSchool,
    addUser: addUser, updateUser: updateUser, removeUser: removeUser,
    addSchool: addSchool, addContact: addContact, addOpportunity: addOpportunity,
    logConnect: logConnect, updateSchool: updateSchool, updateOpportunity: updateOpportunity,
    resetDemo: resetDemo, exportState: exportState,
    subscribe: function (fn) { listeners.push(fn); },
    get adapter() { return adapter; },
    set adapter(a) { adapter = a; }
  };
})();
