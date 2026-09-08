/* Robobox Sales OS - shared helpers */
window.RB = window.RB || {};

RB.util = (function () {
  'use strict';

  var MS_DAY = 86400000;

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------------------------------------------------- formatting */

  // Indian digit grouping: 12,34,567
  function inGroup(n) {
    var s = String(Math.round(Math.abs(n)));
    if (s.length <= 3) return s;
    var last3 = s.slice(-3);
    var rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + last3;
  }

  function money(n, opts) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    opts = opts || {};
    var sign = n < 0 ? '-' : '';
    var a = Math.abs(n);
    if (opts.full) return sign + '₹' + inGroup(a);
    if (a >= 1e7) return sign + '₹' + trim(a / 1e7) + ' Cr';
    if (a >= 1e5) return sign + '₹' + trim(a / 1e5) + ' L';
    if (a >= 1e3) return sign + '₹' + trim(a / 1e3) + 'k';
    return sign + '₹' + Math.round(a);
  }

  function trim(x) {
    var r = x >= 100 ? Math.round(x) : Math.round(x * 10) / 10;
    return String(r);
  }

  function count(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return inGroup(n);
  }

  function pct(part, whole, digits) {
    if (!whole) return '0%';
    var v = (part / whole) * 100;
    var d = digits === undefined ? (v < 10 ? 1 : 0) : digits;
    return v.toFixed(d) + '%';
  }

  function pctVal(part, whole) { return whole ? (part / whole) * 100 : 0; }

  /* --------------------------------------------------------------- dates */

  function today() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function iso(d) {
    if (!d) return null;
    var x = (d instanceof Date) ? d : new Date(d);
    if (isNaN(x)) return null;
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function parseISO(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtDate(s) {
    var d = parseISO(s);
    if (!d) return '—';
    return d.getDate() + ' ' + MONTH_SHORT[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
  }

  function monthKey(s) {
    var d = parseISO(s);
    return d ? d.getFullYear() + '-' + pad(d.getMonth() + 1) : null;
  }

  function monthLabel(key) {
    var p = String(key).split('-');
    return MONTH_SHORT[+p[1] - 1] + " '" + String(p[0]).slice(2);
  }

  function daysBetween(a, b) {
    var da = parseISO(a), db = parseISO(b);
    if (!da || !db) return null;
    return Math.round((db - da) / MS_DAY);
  }

  function daysSince(s) { return daysBetween(s, iso(today())); }

  function addDays(dateISO, n) {
    var d = parseISO(dateISO) || today();
    return iso(new Date(d.getTime() + n * MS_DAY));
  }

  function relative(s) {
    var n = daysSince(s);
    if (n === null) return '—';
    if (n === 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 0) return 'in ' + Math.abs(n) + 'd';
    if (n < 60) return n + 'd ago';
    return Math.round(n / 30) + 'mo ago';
  }

  /* ------------------------------------------------------------ grouping */

  function groupBy(rows, keyFn) {
    var map = new Map();
    rows.forEach(function (r) {
      var keys = keyFn(r);
      if (!Array.isArray(keys)) keys = [keys];
      if (!keys.length) keys = ['—'];
      keys.forEach(function (k) {
        var key = (k === null || k === undefined || k === '') ? '—' : String(k);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(r);
      });
    });
    return map;
  }

  function tally(rows, keyFn, valueFn) {
    var out = [];
    groupBy(rows, keyFn).forEach(function (items, key) {
      out.push({
        key: key,
        rows: items,
        n: items.length,
        value: valueFn ? items.reduce(function (a, r) { return a + (valueFn(r) || 0); }, 0) : items.length
      });
    });
    return out;
  }

  function sortBy(arr, fn, dir) {
    var d = dir === 'asc' ? 1 : -1;
    return arr.slice().sort(function (a, b) {
      var x = fn(a), y = fn(b);
      if (x === null || x === undefined) x = d === 1 ? Infinity : -Infinity;
      if (y === null || y === undefined) y = d === 1 ? Infinity : -Infinity;
      if (typeof x === 'string' || typeof y === 'string') {
        return String(x).localeCompare(String(y)) * d;
      }
      return (x - y) * d;
    });
  }

  function sum(arr, fn) {
    return arr.reduce(function (a, r) { return a + (fn(r) || 0); }, 0);
  }

  function uniq(arr) {
    return Array.from(new Set(arr.filter(function (x) { return x !== null && x !== undefined && x !== ''; })));
  }

  function median(nums) {
    var a = nums.filter(function (n) { return typeof n === 'number' && !isNaN(n); }).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /* ------------------------------------------------------------------ id */

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase();
  }

  /* ----------------------------------------------------------------- csv */

  function toCSV(rows, columns) {
    var head = columns.map(function (c) { return q(c.label); }).join(',');
    var body = rows.map(function (r) {
      return columns.map(function (c) { return q(c.get(r)); }).join(',');
    });
    return [head].concat(body).join('\r\n');
  }

  function q(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function download(filename, text, mime) {
    // Sandboxed previews block a page from starting its own download, so there
    // the file is handed over as selectable text instead of failing silently.
    if (window.RB && RB.PREVIEW && RB.ui && RB.ui.modal) {
      RB.ui.modal(filename, '<p class="sec" style="margin-top:0">This preview runs in a sandbox that blocks downloads. ' +
        'The file is below \u2014 select all and copy it into a <code>' + esc(filename.split('.').pop()) +
        '</code> file. In the hosted app the button downloads directly.</p>' +
        '<textarea class="input" readonly style="min-height:320px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px">' +
        esc(text) + '</textarea>' +
        '<div class="modal-actions"><button class="btn btn-primary" data-close="1">Done</button></div>', {
        wide: true,
        onMount: function (host) {
          var ta = host.querySelector('textarea');
          ta.focus();
          ta.setSelectionRange(0, ta.value.length);
        }
      });
      return;
    }
    var blob = new Blob(['﻿' + text], { type: (mime || 'text/csv') + ';charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* -------------------------------------------------------------- dom-ish */

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }

  return {
    esc: esc, money: money, count: count, pct: pct, pctVal: pctVal, inGroup: inGroup,
    today: today, iso: iso, parseISO: parseISO, fmtDate: fmtDate, monthKey: monthKey,
    monthLabel: monthLabel, daysBetween: daysBetween, daysSince: daysSince, addDays: addDays,
    relative: relative, groupBy: groupBy, tally: tally, sortBy: sortBy, sum: sum, uniq: uniq,
    median: median, uid: uid, initials: initials, toCSV: toCSV, download: download, el: el,
    debounce: debounce, MONTH_SHORT: MONTH_SHORT
  };
})();
