/* Robobox Connect - one filter set, shared by every screen.
 *
 * The predicates are the same getters model.js already uses to group by a
 * dimension, so adding a filter means adding one line to DIMENSIONS, not a
 * new comparison here.
 *
 * The date range is separate: it does not remove opportunities from the
 * screen, it decides which activity, which creations and which closures count
 * as "in the period". Pipeline is always a snapshot of now.
 */
window.RB = window.RB || {};

RB.filters = (function () {
  'use strict';
  var U = RB.util, M = RB.model;

  /* Which dimensions get a dropdown, in bar order. */
  var KEYS = ['region', 'board', 'owner', 'offering', 'stage', 'existingLab',
              'leadSource', 'competitor', 'interest', 'blocker'];

  /* The leadership dashboard's global bar, per the spec. */
  var CEO_KEYS = ['region', 'owner', 'schoolKind', 'board', 'offering', 'leadSource'];

  var state = {};
  var from = null, to = null;

  function active() {
    return KEYS.concat(CEO_KEYS).filter(function (k, i, a) { return a.indexOf(k) === i; })
      .filter(function (k) { return state[k]; });
  }

  function range() {
    return { from: from || '0000-01-01', to: to || '9999-12-31' };
  }
  function rangeSet() { return !!(from || to); }

  function apply(views) {
    var on = active();
    if (!on.length) return views;
    return views.filter(function (v) {
      return on.every(function (k) {
        var got = M.DIMENSIONS[k].get(v);
        return Array.isArray(got) ? got.indexOf(state[k]) !== -1 : String(got) === state[k];
      });
    });
  }

  /* The same filter applied to school records. Schools with no opportunity
   * yet are still tapped market, so the market numbers cannot be derived from
   * the opportunity list. Only the school-level keys apply. */
  var SCHOOL_KEYS = { region: 'region', board: 'board', leadSource: 'leadSource',
                      owner: 'ownerKey', competitor: 'competitor', existingLab: 'existingLab',
                      location: 'location' };

  function applySchools(schools) {
    var on = active().filter(function (k) { return SCHOOL_KEYS[k]; });
    if (!on.length) return schools;
    return schools.filter(function (s) {
      return on.every(function (k) { return String(s[SCHOOL_KEYS[k]] || '—') === state[k]; });
    });
  }

  /* Options come from the data, so a filter never offers an empty result. */
  function options(key, views) {
    var seen = {};
    views.forEach(function (v) {
      var got = M.DIMENSIONS[key].get(v);
      (Array.isArray(got) ? got : [got]).forEach(function (x) {
        if (x != null && x !== '' && x !== '—') seen[x] = true;
      });
    });
    return Object.keys(seen).sort();
  }

  function bar(views, keys, opts) {
    opts = opts || {};
    var use = keys || KEYS;
    var on = active();
    return '<div class="filters filter-bar">' +
      (opts.dates === false ? '' :
        '<label class="filter-pick"><span>From</span>' +
          '<input class="input" type="date" name="f_from" value="' + U.esc(from || '') + '"></label>' +
        '<label class="filter-pick"><span>To</span>' +
          '<input class="input" type="date" name="f_to" value="' + U.esc(to || '') + '"></label>') +
      use.map(function (k) {
        var o = options(k, views);
        if (o.length < 2 && !state[k]) return '';
        return '<label class="filter-pick"><span>' + U.esc(M.DIMENSIONS[k].label) + '</span>' +
          RB.ui.select('f_' + k, o, state[k], { placeholder: 'All' }) + '</label>';
      }).join('') +
      (on.length || rangeSet()
        ? '<button class="btn btn-sm btn-ghost" id="f-clear">Clear' + (on.length ? ' ' + on.length : '') + '</button>'
        : '') +
      '</div>';
  }

  function bind(host, redraw) {
    host.querySelectorAll('.filter-bar select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        state[sel.getAttribute('name').slice(2)] = sel.value || null;
        redraw();
      });
    });
    host.querySelectorAll('.filter-bar input[type=date]').forEach(function (i) {
      i.addEventListener('change', function () {
        if (i.getAttribute('name') === 'f_from') from = i.value || null; else to = i.value || null;
        redraw();
      });
    });
    var clear = host.querySelector('#f-clear');
    if (clear) clear.addEventListener('click', function () { state = {}; from = to = null; redraw(); });
  }

  /* A one-line description of what is filtered, for the Excel export header
   * and the line under the filter bar. */
  function describe() {
    var parts = active().map(function (k) { return M.DIMENSIONS[k].label + ': ' + state[k]; });
    if (rangeSet()) parts.unshift('Dates: ' + (from ? U.fmtDate(from) : 'start') + ' – ' + (to ? U.fmtDate(to) : 'today'));
    return parts.length ? parts.join(' · ') : 'No filters — all data';
  }

  function count() { return active().length + (rangeSet() ? 1 : 0); }

  return { KEYS: KEYS, CEO_KEYS: CEO_KEYS, apply: apply, applySchools: applySchools, bar: bar, bind: bind,
           describe: describe, active: active, count: count, range: range, rangeSet: rangeSet,
           get state() { return state; } };
})();
