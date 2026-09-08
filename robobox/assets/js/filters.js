/* Robobox Connect - one filter set, shared by every screen.
 *
 * The predicates are the same getters model.js already uses to group by a
 * dimension, so adding a filter means adding one line to DIMENSIONS, not a
 * new comparison here.
 */
window.RB = window.RB || {};

RB.filters = (function () {
  'use strict';
  var U = RB.util, M = RB.model;

  /* Which dimensions get a dropdown, in bar order. */
  var KEYS = ['region', 'board', 'owner', 'offering', 'stage', 'existingLab',
              'leadSource', 'competitor', 'interest', 'blocker'];

  var state = {};

  function active() {
    return KEYS.filter(function (k) { return state[k]; });
  }

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

  function bar(views) {
    var on = active();
    return '<div class="filters filter-bar">' +
      KEYS.map(function (k) {
        var opts = options(k, views);
        if (opts.length < 2 && !state[k]) return '';
        return '<label class="filter-pick"><span>' + U.esc(M.DIMENSIONS[k].label) + '</span>' +
          RB.ui.select('f_' + k, opts, state[k], { placeholder: 'All' }) + '</label>';
      }).join('') +
      (on.length ? '<button class="btn btn-sm btn-ghost" id="f-clear">Clear ' + on.length + '</button>' : '') +
      '</div>';
  }

  function bind(host, redraw) {
    host.querySelectorAll('.filter-bar select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        state[sel.getAttribute('name').slice(2)] = sel.value || null;
        redraw();
      });
    });
    var clear = host.querySelector('#f-clear');
    if (clear) clear.addEventListener('click', function () { state = {}; redraw(); });
  }

  /* A one-line description of what is filtered, for the Excel export header. */
  function describe() {
    var on = active();
    return on.length
      ? on.map(function (k) { return M.DIMENSIONS[k].label + ': ' + state[k]; }).join(' · ')
      : 'No filters — all data';
  }

  return { KEYS: KEYS, apply: apply, bar: bar, bind: bind, describe: describe,
           active: active, get state() { return state; } };
})();
