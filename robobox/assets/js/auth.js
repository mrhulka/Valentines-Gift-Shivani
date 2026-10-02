/* Robobox Sales OS - session + role permissions.
 *
 * Demo auth only: the access code is checked in the browser so the pilot runs
 * without a server. In production this module is replaced by the host site's
 * login (see README "Wiring into the existing website") — the permission map
 * below is the part that carries over unchanged.
 */
window.RB = window.RB || {};

RB.auth = (function () {
  'use strict';

  var SESSION_KEY = 'robobox.sales-os.session';
  var current = null;

  /* Roles
   *  sales      - own pipeline only. Sees their own numbers, money included.
   *  sales_head - Ayush. The whole team's records, their day and their
   *               performance, but no financial figures: `money` is off, so
   *               U.money() masks every amount and the Excel export drops its
   *               money columns. The money-led tabs are off with it.
   *  outsight   - Sajesh, Yash. Everything the CEO sees, minus Settings.
   *  ceo        - Parth. Everything, and the only role that can change
   *               settings (people, rate card, targets).
   *
   * Every role exports Excel; what the workbook contains follows the same
   * scope and money rules as the screen.
   */
  var PERMISSIONS = {
    sales: {
      scope: 'own',
      ceoDashboard: false,
      teamBoard: false,
      money: true,
      teamRollup: false,
      exportOwn: true,
      exportAll: false,
      editAny: false,
      manageSettings: false
    },
    sales_head: {
      scope: 'team',
      ceoDashboard: false,
      teamBoard: true,
      money: false,
      teamRollup: true,
      exportOwn: true,
      exportAll: true,
      editAny: true,
      manageSettings: false
    },
    outsight: {
      scope: 'all',
      ceoDashboard: true,
      teamBoard: true,
      money: true,
      teamRollup: true,
      exportOwn: true,
      exportAll: true,
      editAny: true,
      manageSettings: false
    },
    ceo: {
      scope: 'all',
      ceoDashboard: true,
      teamBoard: true,
      money: true,
      teamRollup: true,
      exportOwn: true,
      exportAll: true,
      editAny: true,
      manageSettings: true
    }
  };

  var ROLE_LABEL = { sales: 'Sales', sales_head: 'Head of Sales', outsight: 'Outsight', ceo: 'CEO' };

  var signIn = function (userId, pin) {
    var u = RB.store.userById(userId);
    if (!u) return { ok: false, error: 'Unknown user.' };
    if (String(pin || '').trim().toLowerCase() !== String(u.pin).toLowerCase()) {
      return { ok: false, error: 'That access code is not right.' };
    }
    current = u;
    try { sessionStorage.setItem(SESSION_KEY, u.id); } catch (e) {}
    return { ok: true, user: u };
  };

  var restore = function () {
    var id = null;
    try { id = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!id) return null;
    current = RB.store.userById(id);
    return current;
  };

  var signOut = function () {
    current = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  };

  /* Lets a replacement auth module (store-supabase.js, or the host site's own
   * session) hand the app a signed-in user without going through signIn. */
  function setUser(u) { current = u || null; return current; }

  /* Hand sign-in to a real backend. The demo compares an access code in the
   * browser, which is fine for a walkthrough and not for a system of record;
   * with a backend the server decides, and the permission map below is the
   * only part that carries over. The roster for the sign-in dropdown still
   * comes from the bundled seed, because listing people is itself behind the
   * login. */
  var backend = null;
  function useBackend(b) {
    backend = b;
    signIn = function (userId, code) {
      var seeded = (window.ROBOBOX_SEED.users || []).filter(function (u) { return u.id === userId; })[0];
      if (!seeded) return Promise.resolve({ ok: false, error: 'Unknown user.' });
      return b.signIn(seeded.email, code).then(function (res) {
        if (res.ok) current = res.user;
        return res;
      });
    };
    restore = function () {
      return Promise.resolve(b.restore()).then(function (u) { current = u || null; return current; });
    };
    signOut = function () { current = null; return b.signOut(); };
  }

  function user() { return current; }
  function role() { return current ? current.role : null; }
  function roleLabel(r) { return ROLE_LABEL[r || role()] || r; }
  function can(what) {
    var p = PERMISSIONS[role()];
    return !!(p && p[what]);
  }
  function scope() {
    var p = PERMISSIONS[role()];
    return p ? p.scope : 'own';
  }

  /* The one function every view uses to decide what rows a user may see. */
  function visibleSchools() {
    var rows = RB.store.schools();
    if (scope() !== 'own') return rows;
    var key = current && current.ownerKey;
    return rows.filter(function (s) { return s.ownerKey === key; });
  }

  /* Strictly the signed-in person's own accounts, whatever their role. The
   * personal screens use this so the CEO's "My dashboard" is his own book and
   * not a second copy of the company view. */
  function mySchools() {
    if (!current) return [];
    return RB.store.schools().filter(function (s) { return s.ownerKey === current.ownerKey; });
  }

  function ownsRow(s) {
    if (scope() !== 'own') return true;
    return s.ownerKey === current.ownerKey;
  }

  return {
    signIn: function (a, b2) { return signIn(a, b2); },
    restore: function () { return restore(); },
    signOut: function () { return signOut(); },
    useBackend: useBackend,
    user: user, setUser: setUser, role: role,
    roleLabel: roleLabel, can: can, scope: scope, visibleSchools: visibleSchools, mySchools: mySchools,
    ownsRow: ownsRow, PERMISSIONS: PERMISSIONS
  };
})();
