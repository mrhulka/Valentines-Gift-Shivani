/* Robobox Connect - Excel export.
 *
 * SheetJS writes the .xlsx; hand-rolling a spreadsheet format would be more of
 * my code and worse at edge cases. Numbers stay numeric, dates stay dates, and
 * every sheet gets sized columns and an autofilter over the header row, so the
 * file is usable the moment it opens.
 *
 * ponytail: the community build writes no styles - no bold headers, no frozen
 * panes. Autofilter and sized columns cover the practical need. If branded
 * headers matter, swap the CDN script for ExcelJS; only writeSheet() changes.
 */
window.RB = window.RB || {};

RB.excel = (function () {
  'use strict';
  var U = RB.util;

  var MONEY = '#,##0';
  var PCT = '0.0"%"';

  /* sheets: [{ name, columns: [{label, get, type, width}], rows, note }]
   * type: 'money' | 'number' | 'percent' | 'date' | undefined (text) */
  function download(filename, sheets, meta) {
    if (!window.XLSX) return fallbackCSV(filename, sheets);

    var wb = XLSX.utils.book_new();
    sheets.forEach(function (s) {
      XLSX.utils.book_append_sheet(wb, writeSheet(s, meta), safeName(s.name));
    });
    XLSX.writeFile(wb, filename.replace(/\.csv$/, '') + '.xlsx');
    RB.ui.toast('Downloaded ' + filename.replace(/\.csv$/, '') + '.xlsx');
  }

  function writeSheet(s, meta) {
    // Two context rows, a blank, then the table — so the file explains itself
    // when it lands in someone's inbox a week later.
    var head = [
      [s.name + (meta && meta.title ? ' — ' + meta.title : '')],
      ['Exported ' + new Date().toLocaleString() + (meta && meta.filters ? '  ·  ' + meta.filters : '')],
      []
    ];
    var aoa = head.concat([s.columns.map(function (c) { return c.label; })]);

    s.rows.forEach(function (r) {
      aoa.push(s.columns.map(function (c) {
        var v = c.get(r);
        if (v === null || v === undefined || v === '') return '';
        if (c.type === 'date') { var d = U.parseISO(v); return d || v; }
        if (c.type === 'money' || c.type === 'number' || c.type === 'percent') {
          var n = Number(v);
          return isNaN(n) ? '' : n;
        }
        return String(v);
      }));
    });

    var ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    var headerRow = head.length;                       // 0-based index of labels

    // Number formats, applied per column down the data rows.
    s.columns.forEach(function (c, ci) {
      if (!c.type || c.type === 'text') return;
      var z = c.type === 'money' ? MONEY : c.type === 'percent' ? PCT
            : c.type === 'date' ? 'dd mmm yyyy' : '#,##0';
      for (var ri = headerRow + 1; ri < aoa.length; ri++) {
        var cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
        if (cell && cell.v !== '') cell.z = z;
      }
    });

    ws['!cols'] = s.columns.map(function (c, ci) {
      if (c.width) return { wch: c.width };
      // Width from the widest value in the column, clamped so one long note
      // does not push everything else off screen.
      var w = c.label.length;
      for (var ri = headerRow + 1; ri < aoa.length; ri++) {
        var v = aoa[ri][ci];
        var len = v instanceof Date ? 11 : String(v == null ? '' : v).length;
        if (len > w) w = len;
      }
      return { wch: Math.min(Math.max(w + 2, 9), 48) };
    });
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range(
        { r: headerRow, c: 0 },
        { r: Math.max(headerRow, aoa.length - 1), c: s.columns.length - 1 })
    };
    return ws;
  }

  function safeName(n) {
    return String(n).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31);
  }

  /* No SheetJS (offline, or a sandbox that blocked the CDN): still hand over
   * the data rather than failing. */
  function fallbackCSV(filename, sheets) {
    var s = sheets[0];
    U.download(filename.replace(/\.xlsx$/, '') + '.csv',
      U.toCSV(s.rows, s.columns.map(function (c) {
        return { label: c.label, get: c.get };
      })));
  }

  /* ------------------------------------------------- standard sheet shapes */

  function opportunitySheet(name, views) {
    return {
      name: name,
      rows: views,
      columns: [
        { label: 'School', get: function (v) { return v.school && v.school.name; } },
        { label: 'Location', get: function (v) { return v.school && v.school.location; } },
        { label: 'Region', get: function (v) { return v.school && v.school.region; } },
        { label: 'School type', get: function (v) { return v.school && v.school.board; } },
        { label: 'Students', type: 'number', get: function (v) { return v.school && v.school.students; } },
        { label: 'Existing lab', get: function (v) { return v.school && v.school.existingLab; } },
        { label: 'Competitor', get: function (v) { return v.school && v.school.competitor; } },
        { label: 'Lead source', get: function (v) { return v.school && v.school.leadSource; } },
        { label: 'Offering', get: function (v) { return v.opp.offering; } },
        { label: 'Variant', get: function (v) { return v.opp.variant; } },
        { label: 'Owner', get: function (v) { return v.owner; } },
        { label: 'Stage', get: function (v) { return v.stage; } },
        { label: 'Status', get: function (v) { return v.status; } },
        { label: 'Interest', get: function (v) { return v.interest; } },
        { label: 'Initial potential', type: 'money', get: function (v) { return v.initialPotential; } },
        { label: 'Quoted', type: 'money', get: function (v) { return v.quoted; } },
        { label: 'Negotiated', type: 'money', get: function (v) { return v.negotiated; } },
        { label: 'Closed', type: 'money', get: function (v) { return v.closed; } },
        { label: 'Current value', type: 'money', get: function (v) { return v.current; } },
        { label: 'Realisation %', type: 'percent',
          get: function (v) { return v.closed && v.initialPotential ? (v.closed / v.initialPotential) * 100 : null; } },
        { label: 'New connects', type: 'number', get: function (v) { return v.newConnects; } },
        { label: 'Reconnects', type: 'number', get: function (v) { return v.reconnects; } },
        { label: 'Last connect', type: 'date', get: function (v) { return v.lastAt; } },
        { label: 'Days since', type: 'number', get: function (v) { return v.daysSinceConnect; } },
        { label: 'Next action', get: function (v) { return v.nextAction; } },
        { label: 'Next action due', type: 'date',
          get: function (v) { return v.nextActionAt ? v.nextActionAt.slice(0, 10) : null; } },
        { label: 'Blocker', get: function (v) { return v.blocker; } },
        { label: 'Loss reason', get: function (v) { return v.opp.lossReason; } },
        { label: 'Stalled', get: function (v) { return v.stalled ? 'Yes' : 'No'; } },
        { label: 'Why stalled', width: 40, get: function (v) { return v.stalledReasons.join('; '); } }
      ]
    };
  }

  function connectSheet(name, connects) {
    return {
      name: name,
      rows: connects,
      columns: [
        { label: 'Date', type: 'date', get: function (c) { return c.at ? c.at.slice(0, 10) : null; } },
        { label: 'Time', get: function (c) { return c.at ? c.at.slice(11, 16) : ''; } },
        { label: 'Salesperson', get: function (c) { var u = RB.store.userById(c.by); return u ? u.name : c.by; } },
        { label: 'School', get: function (c) { var s = RB.store.schoolById(c.schoolId); return s && s.name; } },
        { label: 'Region', get: function (c) { var s = RB.store.schoolById(c.schoolId); return s && s.region; } },
        { label: 'School type', get: function (c) { var s = RB.store.schoolById(c.schoolId); return s && s.board; } },
        { label: 'Offering', get: function (c) { var o = RB.store.opportunityById(c.opportunityId); return o && o.offering; } },
        { label: 'Type', get: function (c) { return c.kind; } },
        { label: 'Mode', get: function (c) { return c.mode; } },
        { label: 'Contact', get: function (c) { var x = c.contactId && RB.store.contactById(c.contactId); return x && x.name; } },
        { label: 'Response', get: function (c) { return c.response; } },
        { label: 'Interest', get: function (c) { return c.interest; } },
        { label: 'Quoted', type: 'money', get: function (c) { return c.commercial && c.commercial.quoted; } },
        { label: 'Negotiated', type: 'money', get: function (c) { return c.commercial && c.commercial.negotiated; } },
        { label: 'Blocker', get: function (c) { return c.blocker; } },
        { label: 'Blocker detail', width: 34, get: function (c) { return c.blockerDetail; } },
        { label: 'Notes', width: 48, get: function (c) { return c.notes; } },
        { label: 'Next action', get: function (c) { return c.nextAction; } },
        { label: 'Next action due', type: 'date',
          get: function (c) { return c.nextActionAt ? c.nextActionAt.slice(0, 10) : null; } }
      ]
    };
  }

  function groupSheet(name, label, groups) {
    return {
      name: name,
      rows: groups,
      columns: [
        { label: label, get: function (g) { return g.key; } },
        { label: 'Opportunities', type: 'number', get: function (g) { return g.count; } },
        { label: 'Potential', type: 'money', get: function (g) { return g.potential; } },
        { label: 'Pipeline', type: 'money', get: function (g) { return g.pipeline; } },
        { label: 'Quoted', type: 'money', get: function (g) { return g.quoted; } },
        { label: 'Negotiated', type: 'money', get: function (g) { return g.negotiated; } },
        { label: 'Proposals', type: 'number', get: function (g) { return g.proposals; } },
        { label: 'Won', type: 'number', get: function (g) { return g.wonCount; } },
        { label: 'Closed revenue', type: 'money', get: function (g) { return g.closed; } },
        { label: 'Lost', type: 'number', get: function (g) { return g.lostCount; } },
        { label: 'Lost value', type: 'money', get: function (g) { return g.lostValue; } },
        { label: 'Win rate %', type: 'percent', get: function (g) { return g.winRate; } },
        { label: 'Avg deal', type: 'money', get: function (g) { return g.avgDeal; } },
        { label: 'Realisation %', type: 'percent', get: function (g) { return g.realisation; } },
        { label: 'Stalled', type: 'number', get: function (g) { return g.stalled.length; } }
      ]
    };
  }

  return { download: download, opportunitySheet: opportunitySheet,
           connectSheet: connectSheet, groupSheet: groupSheet };
})();
