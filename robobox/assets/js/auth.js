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

  /* Lets a replacement auth module (store-supabase.js, or the host site's own
   * session) hand the app a signed-in user without going through signIn. */
  function setUser(u) { current = u || null; return current; }

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
    signIn: signIn, restore: restore, signOut: signOut, user: user, setUser: setUser, role: role,
    roleLabel: roleLabel, can: can, scope: scope, visibleSchools: visibleSchools, mySchools: mySchools,
    ownsRow: ownsRow, PERMISSIONS: PERMISSIONS
  };
})();
