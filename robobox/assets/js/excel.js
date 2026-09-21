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
    // A shared preview runs in a sandbox that blocks a page from starting a
    // download. Say so plainly and show what the file holds, rather than
    // letting the button appear broken.
    if (window.RB && RB.PREVIEW) {
      sheets = sheets.map(stripMoney).filter(function (s) { return s.columns.length; });
      return RB.ui.modal('Export — ' + filename + '.xlsx',
        '<p class="sec" style="margin-top:0">This shared preview cannot download files. ' +
        'On the hosted app this button saves the workbook below straight to your machine.</p>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>Sheet</th>' +
        '<th class="num">Rows</th><th class="num">Columns</th></tr></thead><tbody>' +
        sheets.map(function (s) {
          return '<tr><td class="strong">' + U.esc(s.name) + '</td>' +
            '<td class="num">' + U.count(s.rows.length) + '</td>' +
            '<td class="num">' + s.columns.length + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (meta && meta.filters ? '<p class="small muted" style="margin-top:12px">Filters: ' +
          U.esc(meta.filters) + '</p>' : '') +
        '<div class="modal-actions"><button class="btn btn-primary" data-close="1">Got it</button></div>',
        { wide: true });
    }
    // Strip first: the CSV fallback must respect the money permission too.
    sheets = sheets.map(stripMoney).filter(function (s) { return s.columns.length; });
    if (!window.XLSX) return fallbackCSV(filename, sheets);

    var wb = XLSX.utils.book_new(), taken = {};
    sheets.forEach(function (s) {
      XLSX.utils.book_append_sheet(wb, writeSheet(s, meta), uniqueName(s.name, taken));
    });
    XLSX.writeFile(wb, filename.replace(/\.csv$/, '') + '.xlsx');
    RB.ui.toast('Downloaded ' + filename.replace(/\.csv$/, '') + '.xlsx');
  }

  /* The money permission follows the data out of the app: a role that cannot
   * see a rupee figure on screen does not get one in the workbook either.
   * One filter here covers every sheet, present and future. */
  function stripMoney(s) {
    if (!window.RB || !RB.auth || !RB.auth.user() || RB.auth.can('money')) return s;
    return Object.assign({}, s, {
      columns: s.columns.filter(function (c) { return c.type !== 'money'; })
    });
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

  /* A tab's own sheets and the shared workbook can land on the same name, and
   * SheetJS throws rather than renaming - which showed up as an export that
   * silently produced nothing. Numbering the repeat keeps both sheets. */
  function uniqueName(n, taken) {
    var base = safeName(n), name = base, i = 2;
    while (taken[name.toLowerCase()]) name = safeName(base.slice(0, 28)) + ' ' + i++;
    taken[name.toLowerCase()] = true;
    return name;
  }

  /* No SheetJS (offline, or a sandbox that blocked the CDN): still hand over
   * the data rather than failing. One CSV, every sheet in it, each under its
   * own heading - losing seven of eight sheets would be worse than the format. */
  function fallbackCSV(filename, sheets) {
    var out = sheets.map(function (s) {
      return '# ' + s.name + '\n' +
        U.toCSV(s.rows, s.columns.map(function (c) {
          return { label: c.label, get: c.get };
        }));
    }).join('\n\n');
    U.download(filename.replace(/\.xlsx$/, '') + '.csv', out);
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
        { label: 'Next Step', get: function (v) { return v.nextAction; } },
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
        { label: 'Next Step', get: function (c) { return c.nextAction; } },
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
        { label: 'Potential deals', type: 'number', get: function (g) { return g.count; } },
        { label: 'Potential', type: 'money', get: function (g) { return g.potential; } },
        { label: 'In Play', type: 'money', get: function (g) { return g.pipeline; } },
        { label: 'Quoted', type: 'money', get: function (g) { return g.quoted; } },
        { label: 'Negotiated', type: 'money', get: function (g) { return g.negotiated; } },
        { label: 'Proposals', type: 'number', get: function (g) { return g.proposals; } },
        { label: 'Won', type: 'number', get: function (g) { return g.wonCount; } },
        { label: 'Business Won', type: 'money', get: function (g) { return g.closed; } },
        { label: 'Lost', type: 'number', get: function (g) { return g.lostCount; } },
        { label: 'Lost value', type: 'money', get: function (g) { return g.lostValue; } },
        { label: 'Win rate %', type: 'percent', get: function (g) { return g.winRate; } },
        { label: 'Avg deal', type: 'money', get: function (g) { return g.avgDeal; } },
        { label: 'Realisation %', type: 'percent', get: function (g) { return g.realisation; } },
        { label: 'Stalled', type: 'number', get: function (g) { return g.stalled.length; } }
      ]
    };
  }

  /* --------------------------------------------------- salesperson x region */
  /* One sheet, two columns of identity: who, and where. Filtering the sheet on
   * Salesperson gives the person's whole book; filtering on Region gives the
   * region across everyone. That is why the two are not separate sheets. */
  function ownerRegionSheet(name, vs) {
    var M = RB.model;
    var map = new Map();
    vs.forEach(function (v) {
      var owner = v.owner || 'Unassigned';
      var region = (v.school && v.school.region) || '—';
      var k = owner + ' | ' + region;
      if (!map.has(k)) map.set(k, { owner: owner, region: region, rows: [] });
      map.get(k).rows.push(v);
    });
    var rows = [];
    map.forEach(function (g) {
      rows.push(Object.assign(M.rollup(g.owner, g.rows), { owner: g.owner, region: g.region }));
    });
    rows = RB.util.sortBy(rows, function (g) { return g.pipeline + g.closed; }, 'desc');
    var base = groupSheet(name, 'Salesperson', rows).columns.slice(1);
    return {
      name: name, rows: rows,
      columns: [
        { label: 'Salesperson', get: function (g) { return g.owner; } },
        { label: 'Region', get: function (g) { return g.region; } }
      ].concat(base)
    };
  }

  /* ------------------------------------------------------ team performance */
  /* Schools approached, and what became of them. Counted in schools, not
   * opportunities, because "approached vs converted" is a question about
   * schools - two opportunities at one school is still one school approached. */
  function teamSheet(name, vs) {
    var M = RB.model, U2 = RB.util;
    var stale = M.config().staleDays;

    function schoolsOf(list) {
      return U2.uniq(list.map(function (v) { return v.opp.schoolId; })).length;
    }
    function mainRegion(list) {
      var tally = {}, best = null;
      list.forEach(function (v) {
        var r = v.school && v.school.region;
        if (!r) return;
        tally[r] = (tally[r] || 0) + 1;
        if (!best || tally[r] > tally[best]) best = r;
      });
      if (!best) return null;
      var spread = Object.keys(tally).length;
      return spread > 1 ? best + ' +' + (spread - 1) : best;
    }
    var by = new Map();
    vs.forEach(function (v) {
      var k = v.owner || 'Unassigned';
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(v);
    });

    var rows = [];
    by.forEach(function (list, owner) { rows.push(row(owner, list)); });
    rows = U2.sortBy(rows, function (r) { return r.approached; }, 'desc');
    if (rows.length > 1) rows.push(row('ALL', vs));

    function row(owner, list) {
      var approached = schoolsOf(list);
      var won = list.filter(function (v) { return v.status === 'Won'; });
      var lost = list.filter(function (v) { return v.status === 'Lost'; });
      var open = list.filter(function (v) { return v.status === 'Open'; });
      // Progressing: live, past the first touch, and worked inside the stale window.
      var progressing = open.filter(function (v) {
        return v.stageRank > 0 && !v.stalled;
      });
      var gone = open.filter(function (v) {
        return v.stalled || v.daysSinceConnect === null || v.daysSinceConnect > stale;
      });
      var converted = schoolsOf(won);
      var u = RB.store.users().filter(function (x) { return x.ownerKey === owner; })[0];
      return {
        owner: owner,
        name: u ? u.name : owner,
        // Where they actually work, not a field nobody filled in: the region
        // holding most of their schools. Falls back to a set home region.
        region: owner === 'ALL' ? 'All regions' : (mainRegion(list) || (u && u.region) || '—'),
        approached: approached,
        connects: RB.util.sum(list, function (v) { return v.connects.length; }),
        progressing: schoolsOf(progressing),
        converted: converted,
        lost: schoolsOf(lost),
        stale: schoolsOf(gone),
        convRate: approached ? (converted / approached) * 100 : null,
        progRate: approached ? (schoolsOf(progressing) / approached) * 100 : null,
        staleRate: approached ? (schoolsOf(gone) / approached) * 100 : null,
        pipeline: RB.util.sum(open, function (v) { return v.current || 0; }),
        wonValue: RB.util.sum(won, function (v) { return v.closed || 0; }),
        avgDays: RB.util.mean(won.map(function (v) { return v.daysToClose; }).filter(function (n) { return n != null; }))
      };
    }

    return {
      name: name, rows: rows,
      columns: [
        { label: 'Salesperson', get: function (r) { return r.name; } },
        { label: 'Main region', get: function (r) { return r.region; } },
        { label: 'Schools approached', type: 'number', get: function (r) { return r.approached; } },
        { label: 'Connects logged', type: 'number', get: function (r) { return r.connects; } },
        { label: 'Progressing', type: 'number', get: function (r) { return r.progressing; } },
        { label: 'Approached → progressing %', type: 'percent', get: function (r) { return r.progRate; } },
        { label: 'Converted', type: 'number', get: function (r) { return r.converted; } },
        { label: 'Approached → converted %', type: 'percent', get: function (r) { return r.convRate; } },
        { label: 'Lost', type: 'number', get: function (r) { return r.lost; } },
        { label: 'Gone stale', type: 'number', get: function (r) { return r.stale; } },
        { label: 'Approached → stale %', type: 'percent', get: function (r) { return r.staleRate; } },
        { label: 'Business in Play', type: 'money', get: function (r) { return r.pipeline; } },
        { label: 'Business Won', type: 'money', get: function (r) { return r.wonValue; } },
        { label: 'Avg. days to close', type: 'number', get: function (r) { return r.avgDays; } }
      ]
    };
  }

  /* ----------------------------------------------------------- deal quality */
  /* Which deals are worth the week: how likely, and how big. Likelihood is the
   * probability a salesperson recorded; where none is recorded the fit score
   * (the same one the Win tab uses) stands in, and the sheet says which. Ticket
   * size is measured against this very selection, so "big" means big for the
   * period being looked at, not against some fixed number. */
  function qualitySheet(name, vs) {
    var M = RB.model, U2 = RB.util;
    var fit = M.fitModel(vs);
    var live = vs.map(function (v) { return v.current; })
                 .filter(function (n) { return typeof n === 'number' && n > 0; })
                 .sort(function (a, b) { return a - b; });
    var big = live.length ? live[Math.floor((live.length - 1) * 0.75)] : 0;
    var small = live.length ? live[Math.floor((live.length - 1) * 0.25)] : 0;

    var rows = vs.map(function (v) {
      var f = fit.score(v.school);
      var p = v.probability;
      return {
        v: v,
        prob: p,
        score: p != null ? p : (f ? f.score : null),
        basis: p != null ? 'recorded' : 'fit score',
        fit: f ? f.score : null
      };
    });
    rows = U2.sortBy(rows, function (r) { return (r.score || 0) * 1e9 + (r.v.current || 0); }, 'desc');

    function band(n) {
      if (n == null) return 'Not known';
      return n >= 60 ? 'High' : n >= 30 ? 'Medium' : 'Low';
    }
    function ticket(n) {
      if (!n) return 'Not sized';
      return n >= big ? 'Big ticket' : n <= small ? 'Small ticket' : 'Mid';
    }

    return {
      name: name, rows: rows,
      note: 'Big ticket = top quarter by value in this selection; small = bottom quarter.',
      columns: [
        { label: 'School', get: function (r) { return r.v.school && r.v.school.name; } },
        { label: 'Region', get: function (r) { return r.v.school && r.v.school.region; } },
        { label: 'Salesperson', get: function (r) { return r.v.owner; } },
        { label: 'Offering', get: function (r) { return r.v.opp.offering; } },
        { label: 'Stage', get: function (r) { return r.v.stage; } },
        { label: 'Status', get: function (r) { return r.v.status; } },
        { label: 'Likelihood', get: function (r) { return band(r.score); } },
        { label: 'Likelihood score', type: 'number', get: function (r) { return r.score; } },
        { label: 'Likelihood from', get: function (r) { return r.basis; } },
        { label: 'Value', type: 'money', get: function (r) { return r.v.current; } },
        { label: 'Ticket', get: function (r) { return ticket(r.v.current); } },
        { label: 'Students', type: 'number', get: function (r) { return r.v.school && r.v.school.students; } },
        { label: 'Days since contact', type: 'number', get: function (r) { return r.v.daysSinceConnect; } },
        { label: 'Stalled', get: function (r) { return r.v.stalled ? 'Yes' : 'No'; } },
        { label: 'Blocker', get: function (r) { return r.v.blocker; } },
        { label: 'Next Step', get: function (r) { return r.v.nextAction; } },
        { label: 'Next action due', type: 'date',
          get: function (r) { return r.v.nextActionAt ? r.v.nextActionAt.slice(0, 10) : null; } }
      ]
    };
  }

  /* ------------------------------------------------------------- workbook */
  /* The one workbook every Export button produces, so a rep, the Head of Sales
   * and the CEO all hand each other the same file with the same column names -
   * only the rows and the money columns differ, exactly as the screen does.
   * Every sheet is built from the views passed in, which are already filtered,
   * date range included. */
  function workbook(vs, opts) {
    opts = opts || {};
    var F = RB.filters, M = RB.model;
    var dated = vs.filter(F.inRange);
    var ids = {};
    dated.forEach(function (v) { ids[v.opp.id] = true; });
    var connects = RB.store.connects().filter(function (c) {
      return ids[c.opportunityId] && F.connectInRange(c);
    });

    return (opts.first || []).concat([
      opportunitySheet('Potential deals', dated),
      teamSheet('Team performance', dated),
      qualitySheet('Deal quality', dated),
      ownerRegionSheet('Salesperson x region', dated),
      groupSheet('Region rollup', 'Region', M.groupBy(dated, 'region')),
      groupSheet('Offering rollup', 'Offering', M.groupBy(dated, 'offering')),
      groupSheet('Stage rollup', 'Stage', M.groupBy(dated, 'stage')),
      connectSheet('Connects', connects)
    ]).concat(opts.last || []);
  }

  return { download: download, workbook: workbook, opportunitySheet: opportunitySheet,
           connectSheet: connectSheet, groupSheet: groupSheet,
           ownerRegionSheet: ownerRegionSheet, teamSheet: teamSheet, qualitySheet: qualitySheet };
})();
