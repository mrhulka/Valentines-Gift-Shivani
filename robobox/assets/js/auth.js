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
   *  sales      - own pipeline only. Can export their own data.
   *  sales_head - Ayush. Own pipeline + the whole team's records and a team
   *               roll-up, but not the CEO's company-wide analytics.
   *  ceo        - Parth. Everything, including the analytics dashboard.
   */
  var PERMISSIONS = {
    sales: {
      scope: 'own',
      ceoDashboard: false,
      teamRollup: false,
      exportOwn: true,
      exportAll: false,
      editAny: false,
      manageSettings: false
    },
    sales_head: {
      scope: 'team',
      ceoDashboard: false,
      teamRollup: true,
      exportOwn: true,
      exportAll: true,
      editAny: true,
      manageSettings: false
    },
    ceo: {
      scope: 'all',
      ceoDashboard: true,
      teamRollup: true,
      exportOwn: true,
      exportAll: true,
      editAny: true,
      manageSettings: true
    }
  };

  var ROLE_LABEL = { sales: 'Sales', sales_head: 'Head of Sales', ceo: 'CEO' };

  function signIn(userId, pin) {
    var u = RB.store.userById(userId);
    if (!u) return { ok: false, error: 'Unknown user.' };
    if (String(pin || '').trim().toLowerCase() !== String(u.pin).toLowerCase()) {
      return { ok: false, error: 'That access code is not right.' };
    }
    current = u;
    try { sessionStorage.setItem(SESSION_KEY, u.id); } catch (e) {}
    return { ok: true, user: u };
  }

  function restore() {
    var id = null;
    try { id = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!id) return null;
    current = RB.store.userById(id);
    return current;
  }

  function signOut() {
    current = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
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
    var rows = RB.store.all();
    if (scope() !== 'own') return rows;
    var key = current && current.ownerKey;
    return rows.filter(function (s) {
      return s.owners.indexOf(key) !== -1 ||
             s.activities.some(function (a) { return a.by === current.id; });
    });
  }

  function ownsRow(s) {
    if (scope() !== 'own') return true;
    return s.owners.indexOf(current.ownerKey) !== -1;
  }

  return {
    signIn: signIn, restore: restore, signOut: signOut, user: user, role: role,
    roleLabel: roleLabel, can: can, scope: scope, visibleSchools: visibleSchools,
    ownsRow: ownsRow, PERMISSIONS: PERMISSIONS
  };
})();
