/* Robobox Connect - the leadership command centre.
 *
 * Four tabs, one global filter bar, one set of formulas. Every number here is
 * computed in model.js from school -> opportunity -> connect history, so any
 * figure on screen can be clicked back to the records that produced it. There
 * is no summary table anywhere in this file.
 *
 * BUSINESS  where the money is and how real it is
 * SALES     who is selling, what they did, and did the pipeline move
 * MARKET    who we are up against and where to play
 * WIN       what a Robobox win looks like, and who looks like one next
 */
window.RB = window.RB || {};

RB.ceo = (function () {
  'use strict';

  var U = RB.util, M = RB.model, UI = RB.ui, C = RB.charts, F = RB.filters;

  var TABS = [
    { key: 'business', label: 'Business' },
    { key: 'sales',    label: 'Sales' },
    { key: 'market',   label: 'Market' },
    { key: 'win',      label: 'Win' }
  ];

  /* ------------------------------------------------------------- chrome --- */
  /* Every tab gets the same head, the same global filter bar and the same
   * export button, so a filter set on one tab means the same thing on all. */
  function frame(key, title, sub) {
    return UI.head(title, sub) +
      '<div class="tabs">' + TABS.map(function (t) {
        return '<button type="button" data-tab="' + t.key + '" aria-pressed="' + (t.key === key) + '">' +
          U.esc(t.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="toolbar">' +
        '<details class="filter-drop"' + (F.count() ? ' open' : '') + '>' +
          '<summary>Filters' + (F.count() ? ' <span class="filter-count">' + F.count() + '</span>' : '') + '</summary>' +
          F.bar(M.views(), F.CEO_KEYS) +
        '</details>' +
        '<button class="btn btn-sm" id="x-export">↓ Export Excel</button>' +
        '<span class="small muted">' + U.esc(F.describe()) + '</span>' +
      '</div>';
  }

  function bind(host, redraw, sheets, filename) {
    host.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { RB.app.go(b.getAttribute('data-tab')); });
    });
    F.bind(host, redraw);
    var x = host.querySelector('#x-export');
    if (x) x.addEventListener('click', function () {
      RB.excel.download(filename, sheets(), { filters: F.describe() });
    });
    host.querySelectorAll('[data-school]').forEach(function (b) {
      b.addEventListener('click', function () { RB.views.school(b.getAttribute('data-school')); });
    });
  }

  function slice() {
    return { vs: F.apply(M.views()), range: F.range(),
             schools: F.applySchools(RB.store.schools()) };
  }

  function drillOn(host, map) {
    host.querySelectorAll('[data-stat]').forEach(function (b) {
      b.addEventListener('click', function () {
        var hit = map[b.getAttribute('data-stat')];
        if (hit) UI.drill(hit[0], hit[1]);
      });
    });
  }

  function pctText(n, digits) {
    return n == null ? '—' : n.toFixed(digits === undefined ? 0 : digits) + '%';
  }

  /* Persistent across the dashboard: the handful of opportunities that need a
   * decision today. Full table on Business, one line everywhere else. */
  function attentionStrip(items) {
    if (!items.length) return '';
    return '<button type="button" class="action-item red" id="att-strip">' +
      '<span class="action-ico">!</span><span><strong>' + items.length +
      ' opportunities need attention</strong><small>' +
      U.esc(U.money(U.sum(items, function (i) { return i.v.current || 0; }))) +
      ' — ' + U.esc(items[0].problem) + ', and ' + (items.length - 1) + ' more</small></span>' +
      '<span class="chev">›</span></button>';
  }

  function attentionTable(container, items) {
    UI.table(container, {
      rows: items, rowId: function (i) { return i.v.opp.id; }, sortKey: 'value', pageSize: 10,
      onRowClick: function (id) { RB.views.school(RB.store.opportunityById(id).schoolId); },
      empty: 'Nothing needs a decision today.',
      columns: [
        { key: 'school', label: 'School', get: function (i) { return i.v.school ? i.v.school.name : ''; },
          render: function (i) { return '<span class="strong">' + U.esc(i.v.school ? i.v.school.name : '—') + '</span>' +
            '<div class="small muted">' + U.esc([i.v.school && i.v.school.region, i.v.opp.offering].filter(Boolean).join(' · ')) + '</div>'; } },
        { key: 'stage', label: 'Stage', get: function (i) { return i.v.stageRank; }, render: function (i) { return UI.stageTag(i.v); } },
        { key: 'value', label: 'Value', num: true, get: function (i) { return i.v.current || 0; },
          render: function (i) { return U.money(i.v.current); } },
        { key: 'problem', label: 'Problem', get: function (i) { return i.problem; },
          render: function (i) { return '<span class="tag tag-red">' + U.esc(i.problem) + '</span>'; } },
        { key: 'action', label: 'Recommended action', get: function (i) { return i.action; } },
        { key: 'owner', label: 'Owner', get: function (i) { return i.v.owner || 'Unassigned'; },
          render: function (i) { return i.v.owner ? U.esc(i.v.owner) : '<span class="tag tag-red">Unassigned</span>'; } }
      ]
    });
  }

  function attentionSheet(items) {
    return { name: 'Needs attention', rows: items, columns: [
      { label: 'School', get: function (i) { return i.v.school && i.v.school.name; } },
      { label: 'Opportunity', get: function (i) { return i.v.opp.offering; } },
      { label: 'Value', type: 'money', get: function (i) { return i.v.current; } },
      { label: 'Problem', width: 34, get: function (i) { return i.problem; } },
      { label: 'Recommended action', width: 34, get: function (i) { return i.action; } },
      { label: 'Owner', get: function (i) { return i.v.owner; } }
    ] };
  }

  /* ====================================================== 1. BUSINESS ===== */
  function business(host) {
    var s = slice(), vs = s.vs, range = s.range;
    var b = M.business(vs, range, s.schools);
    var board = M.stageBoard(vs);
    var fit = M.fitModel(vs);
    var att = M.needsAttention(vs, fit);
    var c30 = b.closure[30];
    var list = M.listValue(b.open);

    host.innerHTML = frame('business', 'Business',
      'How much market Robobox has tapped, how much of it is real, and what has closed.') +

      UI.stats([
        UI.stat({ cls: 'stat-hero', label: 'Potential revenue', value: U.money(b.potential),
                  foot: U.count(b.potentialCount) + ' opportunities', onClick: 'pot',
                  title: 'Sum of expected deal size for every opportunity that is not Lost and has a value recorded.' }),
        UI.stat({ label: 'Qualified pipeline', value: U.money(b.qualified),
                  foot: pctText(b.qualifiedShare) + ' of potential · ' + U.count(b.qualifiedCount) + ' opps',
                  onClick: 'qual',
                  title: 'Opportunity identified, decision maker known, need established, deal size, next action and follow-up date all recorded.' }),
        UI.stat({ label: 'Weighted pipeline', value: U.money(b.weighted),
                  foot: pctText(b.weightedShare) + ' of potential' +
                        (b.noProbability.length ? ' · ' + b.noProbability.length + ' without a probability' : ''),
                  footBad: b.noProbability.length > 0, onClick: 'weighted',
                  title: 'Sum of expected deal size × probability, for active opportunities only.' }),
        UI.stat({ cls: 'stat-brand', label: 'Closed won', value: U.money(b.wonValue),
                  foot: U.count(b.wonSchools) + ' schools · ' + U.count(b.wonCount) + ' opportunities',
                  onClick: 'won', title: 'Actual deal value where the stage is Won, closed inside the selected period.' }),
        UI.stat({ cls: 'stat-red', label: 'Lost', value: U.money(b.lostValue),
                  foot: U.count(b.lostCount) + ' opportunities', onClick: 'lost',
                  title: 'Deal value at the point of loss, not the number as it stands today.' }),
        UI.stat({ label: 'Expected to close, 30 days', value: U.money(c30.value),
                  foot: U.count(c30.n) + ' deals · ' + U.money(c30.gross) + ' gross', onClick: 'c30',
                  title: 'Expected deal size × probability for deals whose expected closure date falls in the next 30 days.' })
      ]) +

      '<div class="row wrap small muted" style="gap:14px;margin:-4px 0 4px">' +
        [30, 60, 90].map(function (d) {
          return '<button type="button" class="btn btn-sm" data-clo="' + d + '">Next ' + d + ' days: ' +
            U.esc(U.money(b.closure[d].value)) + ' <span class="muted">(' + b.closure[d].n + ')</span></button>';
        }).join('') + '</div>' +

      '<div class="section-title">Market opportunity</div>' +
      UI.stats([
        UI.stat({ label: 'Schools tapped', value: U.count(b.schoolsTapped), onClick: 'schools',
                  foot: b.noOpportunity.length + ' with no opportunity yet',
                  title: 'Distinct schools on the database inside the current filter.' }),
        UI.stat({ label: 'No STEM lab yet', value: U.count(b.untapped.length),
                  foot: 'confirmed untapped', onClick: 'untapped' }),
        UI.stat({ label: 'Students represented', value: U.count(b.students),
                  foot: 'counted once per school' }),
        UI.stat({ label: 'Open pipeline at list price', value: list.value ? U.money(list.value) : '—',
                  onClick: 'list',
                  foot: list.value
                    ? list.rows.length + ' priced off the rate card · ' + list.unpriced.length + ' not priceable yet'
                    : 'set the rate card in Settings',
                  title: 'Rate-card price × (school students ÷ base students), for open opportunities. What the book is worth before any negotiation.' }),
        UI.stat({ cls: b.untapped.length ? 'stat-brand' : '', label: 'Market whitespace',
                  value: b.untapped.length ? U.money(b.whitespace) : '—',
                  foot: b.untapped.length
                    ? b.untapped.length + ' × ' + U.money(b.whitespaceBasis.value) + ' — ' + b.whitespaceBasis.basis
                    : 'nobody has been asked yet',
                  title: 'An assumption, not a measurement. Change the average lab value in Settings.' })
      ]) +
      (b.notAsked.length
        ? '<button type="button" class="action-item yellow" id="ask-lab">' +
          '<span class="action-ico">?</span><span><strong>' + U.count(b.notAsked.length) +
          ' schools have not been asked whether a STEM lab already exists</strong>' +
          '<small>Answering that turns them into measurable whitespace — ' + U.count(b.hasLab.length) +
          ' schools are confirmed to have one, ' + U.count(b.untapped.length) + ' confirmed not to.</small></span>' +
          '<span class="chev">›</span></button>'
        : '') +

      '<div class="grid grid-2">' +
        UI.card('Pipeline movement', 'Cumulative — click a stage to open it',
          C.funnel({ data: board.steps, format: U.money, highlightLast: true, onClick: true }) +
          '<div class="stats" style="margin:12px 0 0">' +
            board.exits.map(function (e) {
              return UI.stat({ small: true, cls: e.key === 'Lost' ? 'stat-red' : '', label: e.key,
                               value: U.count(e.n), foot: U.money(e.value), onClick: 'exit-' + e.key });
            }).join('') + '</div>') +
        UI.card('Pipeline quality', 'Is the pipeline forecastable, and is it moving',
          UI.stats([
            UI.stat({ small: true, label: 'Qualified', value: pctText(b.qualifiedRate),
                      foot: 'of active opportunities' }),
            UI.stat({ small: true, label: 'Median age', value: b.medianAge == null ? '—' : Math.round(b.medianAge) + 'd',
                      foot: b.avgAge == null ? '' : 'average ' + Math.round(b.avgAge) + 'd' }),
            UI.stat({ small: true, cls: b.staleValue ? 'stat-red' : '', label: 'Stale pipeline',
                      value: U.money(b.staleValue), footBad: !!b.staleValue, onClick: 'stale',
                      foot: b.stale.length + ' not moved in ' + b.staleDays + '+ days' })
          ]) +
          (b.gap.length
            ? '<div class="section-title" style="margin-top:6px">Why the rest is not qualified</div>' +
              C.hbar({ data: b.gap.map(function (g) { return { key: g.label, value: g.value }; }),
                       format: U.money, measureLabel: 'Pipeline blocked', labelW: 190, onClick: true,
                       tipRows: function (d) {
                         var g = b.gap.filter(function (x) { return x.label === d.key; })[0];
                         return [['Pipeline blocked', U.money(d.value)],
                                 ['Opportunities', U.count(g ? g.missing : 0)],
                                 ['Share of active', pctText(g && g.share)]];
                       },
                       color: function () { return 'var(--red)'; } })
            : '<div class="empty">Every active opportunity is fully qualified.</div>')) +
      '</div>' +

      (att.length ? '<div class="section-title">Needs attention · ' + att.length + '</div><div id="att"></div>' : '');

    bind(host, function () { business(host); }, function () {
      return [
        { name: 'Business KPIs', rows: kpiRows(b), columns: kpiCols() },
        RB.excel.opportunitySheet('Opportunities', vs),
        { name: 'Pipeline movement', rows: board.steps.concat(board.exits), columns: [
          { label: 'Stage', get: function (g) { return g.key; } },
          { label: 'Opportunities', type: 'number', get: function (g) { return g.n; } },
          { label: 'Pipeline value', type: 'money', get: function (g) { return g.value; } }
        ] },
        { name: 'Qualification gaps', rows: b.gap, columns: [
          { label: 'Missing', width: 30, get: function (g) { return g.label; } },
          { label: 'Opportunities', type: 'number', get: function (g) { return g.missing; } },
          { label: 'Pipeline blocked', type: 'money', get: function (g) { return g.value; } },
          { label: 'Share of active %', type: 'percent', get: function (g) { return g.share; } }
        ] },
        attentionSheet(att)
      ];
    }, 'robobox-business');

    if (att.length) attentionTable(host.querySelector('#att'), att);
    var strip = host.querySelector('#att-strip');
    if (strip) strip.addEventListener('click', function () {
      UI.drill('Needs attention', att.map(function (i) { return i.v; }));
    });

    host.querySelectorAll('[data-clo]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var d = btn.getAttribute('data-clo');
        UI.drill('Expected to close in ' + d + ' days', b.closure[d].rows);
      });
    });
    host.querySelectorAll('.viz [data-key]').forEach(function (g) {
      g.addEventListener('click', function () {
        var k = g.getAttribute('data-key');
        var step = board.steps.filter(function (x) { return x.key === k; })[0];
        if (step) return UI.drill('Reached ' + k, step.rows);
        var gap = b.gap.filter(function (x) { return x.label === k; })[0];
        if (gap) UI.drill(k + ' — missing', gap.rows);
      });
    });

    var map = {
      pot: ['Potential revenue', b.identified], qual: ['Qualified pipeline', b.qualifiedRows],
      weighted: ['Weighted pipeline', b.open], won: ['Closed won', b.won], lost: ['Lost', b.lost],
      c30: ['Expected to close in 30 days', c30.rows], stale: ['Stale pipeline', b.stale],
      list: ['Priced off the rate card', list.rows.map(function (r) { return r.v; })]
    };
    board.exits.forEach(function (e) { map['exit-' + e.key] = [e.key, e.rows]; });
    drillOn(host, map);
    host.querySelectorAll('[data-stat="schools"],[data-stat="untapped"]').forEach(function (el) {
      el.addEventListener('click', function () {
        var untapped = el.getAttribute('data-stat') === 'untapped';
        schoolListModal(untapped ? 'Schools with no STEM lab' : 'Schools tapped',
                        untapped ? b.untapped : b.schools);
      });
    });
    var ask = host.querySelector('#ask-lab');
    if (ask) ask.addEventListener('click', function () {
      schoolListModal('Lab status not recorded', b.notAsked);
    });
  }

  function kpiRows(b) {
    return [
      ['Potential revenue', b.potential, b.potentialCount],
      ['Qualified pipeline', b.qualified, b.qualifiedCount],
      ['Weighted pipeline', b.weighted, b.open.length],
      ['Closed won', b.wonValue, b.wonCount],
      ['Lost', b.lostValue, b.lostCount],
      ['Expected to close — 30 days', b.closure[30].value, b.closure[30].n],
      ['Expected to close — 60 days', b.closure[60].value, b.closure[60].n],
      ['Expected to close — 90 days', b.closure[90].value, b.closure[90].n],
      ['Active pipeline', b.activePipeline, b.open.length],
      ['Stale pipeline', b.staleValue, b.stale.length],
      ['Market whitespace (assumption)', b.whitespace, b.untapped.length],
      ['Schools tapped', null, b.schoolsTapped],
      ['Schools with no STEM lab', null, b.untapped.length],
      ['Schools with a lab already', null, b.hasLab.length],
      ['Lab status not recorded', null, b.notAsked.length],
      ['Students represented', null, b.students]
    ].map(function (r) { return { label: r[0], value: r[1], n: r[2] }; });
  }
  function kpiCols() {
    return [{ label: 'Metric', width: 32, get: function (r) { return r.label; } },
            { label: 'Value', type: 'money', get: function (r) { return r.value; } },
            { label: 'Opportunities', type: 'number', get: function (r) { return r.n; } }];
  }

  function schoolListModal(title, schools) {
    var holder = document.createElement('div');
    holder.innerHTML = '<div id="st"></div>';
    UI.modal(title + ' · ' + schools.length, holder, { wide: true, onMount: function (h) {
      UI.table(h.querySelector('#st'), {
        rows: schools, rowId: function (s) { return s.id; }, sortKey: 'students', pageSize: 15,
        onRowClick: function (id) { RB.views.school(id); }, empty: 'No schools.',
        columns: [
          { key: 'name', label: 'School', get: function (s) { return s.name; },
            render: function (s) { return '<span class="strong">' + U.esc(s.name) + '</span><div class="small muted">' +
              U.esc([s.location, s.board].filter(Boolean).join(' · ')) + '</div>'; } },
          { key: 'region', label: 'Region', get: function (s) { return s.region || '—'; } },
          { key: 'students', label: 'Students', num: true, get: function (s) { return s.students || 0; },
            render: function (s) { return s.students ? U.count(s.students) : '<span class="muted">—</span>'; } },
          { key: 'lab', label: 'Existing lab', get: function (s) { return s.existingLab || '—'; } },
          { key: 'comp', label: 'Competitor', get: function (s) { return s.competitor || 'None'; } },
          { key: 'owner', label: 'Owner', get: function (s) { return s.ownerKey || '—'; } }
        ]
      });
    } });
  }

  /* ========================================================= 2. SALES ===== */
  var perfDim = 'owner';
  var dayDate = null, dayMonth = null;

  function sales(host) {
    var s = slice(), vs = s.vs, range = s.range;
    var dims = { owner: 'By sales owner', region: 'By region', offering: 'By opportunity type' };
    var groups = M.performance(vs, perfDim, range);
    var date = dayDate || U.iso(U.today());
    var day = M.dayActivity(date, F.apply);
    /* How many connects were logged on each day, so the calendar shows where
     * the activity actually is instead of making the CEO guess a date. */
    var keep = {};
    vs.forEach(function (v) { keep[v.opp.id] = true; });
    var perDay = {}, lastActive = null;
    RB.store.connects().forEach(function (c) {
      if (!c.at || (c.opportunityId && !keep[c.opportunityId])) return;
      var d = c.at.slice(0, 10);
      perDay[d] = (perDay[d] || 0) + 1;
      if (!lastActive || d > lastActive) lastActive = d;
    });
    var month = dayMonth || date.slice(0, 7);
    var fit = M.fitModel(vs);
    var att = M.needsAttention(vs, fit);
    var offer = M.performance(vs, 'offering', range);

    host.innerHTML = frame('sales', 'Sales',
      'Who is selling, what they did with their day, and whether the pipeline moved because of it.') +
      (att.length ? attentionStrip(att) : '') +

      '<div class="section-title">Performance</div>' +
      '<div class="tabs">' + Object.keys(dims).map(function (k) {
        return '<button type="button" data-dim="' + k + '" aria-pressed="' + (k === perfDim) + '">' +
          U.esc(dims[k]) + '</button>';
      }).join('') + '</div>' +
      '<div class="grid grid-2">' +
        UI.card('Qualified pipeline', 'What is real, ' + dims[perfDim].toLowerCase(),
          C.hbar({ data: groups.map(function (g) { return { key: g.key, value: g.qualifiedValue }; }),
                   format: U.money, measureLabel: 'Qualified', labelW: 150, onClick: true,
                   empty: 'Nothing is fully qualified yet — see the qualification gaps on Business.' })) +
        UI.card('Pipeline moved', 'Value that advanced a stage in the period',
          C.hbar({ data: groups.map(function (g) { return { key: g.key, value: g.movedValue }; }),
                   format: U.money, measureLabel: 'Moved', labelW: 150, onClick: true,
                   empty: 'No opportunity advanced a stage in this period.',
                   color: function () { return 'var(--brand)'; } })) +
      '</div>' +
      '<div id="perf"></div>' +

      '<div class="section-title">Sales team day</div>' +
      '<div class="grid grid-2">' +
        UI.card('Pick a day', 'The number on a day is how many connects were logged on it',
          UI.monthGrid({ month: month, selected: date, max: U.iso(U.today()),
            get: function (iso) {
              var n = perDay[iso] || 0;
              return { n: n, title: n ? n + ' connect' + (n === 1 ? '' : 's') + ' logged' : 'Nothing logged' };
            } }) +
          (lastActive && lastActive !== date
            ? '<div class="row" style="margin-top:12px"><button class="btn btn-sm" id="day-last">' +
              'Jump to the last active day — ' + U.esc(U.fmtDate(lastActive)) + '</button></div>'
            : '')) +
        UI.card(U.fmtDate(date) + (date === U.iso(U.today()) ? ' · today' : ''),
          U.count(U.sum(day, function (r) { return r.done.length; })) + ' connects logged by the team',
          UI.stats([
            UI.stat({ small: true, cls: 'stat-brand', label: 'Connects',
                      value: U.count(U.sum(day, function (r) { return r.done.length; })) }),
            UI.stat({ small: true, label: 'Opps created',
                      value: U.count(U.sum(day, function (r) { return r.createdCount; })) }),
            UI.stat({ small: true, label: 'Pipeline moved',
                      value: U.money(U.sum(day, function (r) { return r.movedValue; })) }),
            UI.stat({ small: true, label: 'Nobody logged',
                      value: U.count(day.filter(function (r) { return !r.done.length; }).length),
                      foot: day.filter(function (r) { return !r.done.length; })
                               .map(function (r) { return r.user.name; }).join(', ') || '—' })
          ])) +
      '</div>' +
      '<p class="small muted">Click a person for their day in order.</p>' +
      '<div id="day"></div>' +

      '<div class="section-title">Opportunity type</div><div id="offer"></div>';

    bind(host, function () { sales(host); }, function () {
      return [
        perfSheet(dims[perfDim], M.DIMENSIONS[perfDim].label, groups),
        daySheet(date, day),
        RB.excel.connectSheet('Connects ' + date, day.reduce(function (a, r) { return a.concat(r.done); }, [])),
        perfSheet('Opportunity type', 'Opportunity type', offer),
        RB.excel.opportunitySheet('Opportunities', vs)
      ];
    }, 'robobox-sales');

    host.querySelectorAll('[data-dim]').forEach(function (b) {
      b.addEventListener('click', function () { perfDim = b.getAttribute('data-dim'); sales(host); });
    });
    UI.bindMonthGrid(host,
      function (d) { dayDate = d; dayMonth = d.slice(0, 7); sales(host); },
      function (n) { dayMonth = U.shiftMonth(month, n); sales(host); });
    var lastBtn = host.querySelector('#day-last');
    if (lastBtn) lastBtn.addEventListener('click', function () {
      dayDate = lastActive; dayMonth = lastActive.slice(0, 7); sales(host);
    });
    var strip = host.querySelector('#att-strip');
    if (strip) strip.addEventListener('click', function () { UI.drill('Needs attention', att.map(function (i) { return i.v; })); });
    host.querySelectorAll('.viz [data-key]').forEach(function (g) {
      g.addEventListener('click', function () {
        var grp = groups.filter(function (x) { return x.key === g.getAttribute('data-key'); })[0];
        if (grp) UI.drill(grp.key, grp.rows);
      });
    });

    UI.table(host.querySelector('#perf'), {
      rows: groups, rowId: function (g) { return g.key; }, sortKey: 'qualifiedValue', pageSize: 20,
      onRowClick: function (k) {
        var grp = groups.filter(function (x) { return x.key === k; })[0];
        if (grp) UI.drill(grp.key, grp.rows);
      },
      columns: perfColumns(M.DIMENSIONS[perfDim].label)
    });

    UI.table(host.querySelector('#day'), {
      rows: day, rowId: function (r) { return r.user.id; }, sortKey: 'done', pageSize: 12,
      onRowClick: function (id) { personDay(id, date); },
      empty: 'No salespeople configured.',
      columns: [
        { key: 'name', label: 'Salesperson', get: function (r) { return r.user.name; },
          render: function (r) { return '<span class="strong">' + U.esc(r.user.name) + '</span>' +
            '<div class="small muted">' + U.esc(RB.auth.roleLabel(r.user.role)) + '</div>'; } }
      ].concat(M.MODE_COLUMNS.map(function (m) {
        return { key: m.key, label: m.label, num: true, get: function (r) { return r[m.key]; },
                 render: function (r) { return r[m.key] ? U.count(r[m.key]) : '<span class="muted">·</span>'; } };
      })).concat([
        { key: 'done', label: 'Connects', num: true, get: function (r) { return r.done.length; },
          render: function (r) { return r.done.length ? '<span class="strong">' + U.count(r.done.length) + '</span>'
                                                      : '<span class="tag tag-red">0</span>'; } },
        { key: 'created', label: 'Opps created', num: true, get: function (r) { return r.createdCount; },
          render: function (r) { return r.createdCount ? U.count(r.createdCount) : '<span class="muted">·</span>'; } },
        { key: 'moved', label: 'Pipeline moved', num: true, get: function (r) { return r.movedValue; },
          render: function (r) { return r.movedValue ? U.money(r.movedValue) : '<span class="muted">—</span>'; } },
        { key: 'planned', label: 'Planned', num: true, get: function (r) { return r.planned.length; },
          render: function (r) { return r.planned.length ? r.kept + ' / ' + r.planned.length : '<span class="muted">—</span>'; } }
      ])
    });

    UI.table(host.querySelector('#offer'), {
      rows: offer, rowId: function (g) { return g.key; }, sortKey: 'pipeline', pageSize: 10,
      onRowClick: function (k) {
        var grp = offer.filter(function (x) { return x.key === k; })[0];
        if (grp) UI.drill(grp.key, grp.rows);
      },
      columns: perfColumns('Opportunity type')
    });
  }

  function perfColumns(label) {
    return [
      { key: 'key', label: label, get: function (g) { return g.key; },
        render: function (g) { return '<span class="strong">' + U.esc(g.key) + '</span>'; } },
      { key: 'leads', label: 'Leads', num: true, get: function (g) { return g.leads; },
        render: function (g) { return U.count(g.leads); } },
      { key: 'created', label: 'Opps', num: true, get: function (g) { return g.created; },
        render: function (g) { return U.count(g.created); } },
      { key: 'qualifiedValue', label: 'Qualified', num: true, get: function (g) { return g.qualifiedValue; },
        render: function (g) { return g.qualifiedValue ? U.money(g.qualifiedValue) : '<span class="muted">—</span>'; } },
      { key: 'pipeline', label: 'Total pipeline', num: true, get: function (g) { return g.pipeline; },
        render: function (g) { return U.money(g.pipeline); } },
      { key: 'closed', label: 'Won revenue', num: true, get: function (g) { return g.closed; },
        render: function (g) { return g.closed ? U.money(g.closed) : '<span class="muted">—</span>'; } },
      { key: 'winRate', label: 'Win rate', num: true, get: function (g) { return g.winRate == null ? -1 : g.winRate; },
        render: function (g) { return g.winRate == null ? '<span class="muted">—</span>' : pctText(g.winRate); } },
      { key: 'avgDeal', label: 'Avg deal', num: true, get: function (g) { return g.avgDeal; },
        render: function (g) { return g.avgDeal ? U.money(g.avgDeal) : '<span class="muted">—</span>'; } },
      { key: 'medianDays', label: 'Median close', num: true,
        get: function (g) { return g.medianDays == null ? 1e9 : g.medianDays; },
        render: function (g) { return g.medianDays == null ? '<span class="muted">—</span>' : Math.round(g.medianDays) + 'd'; } },
      { key: 'movedValue', label: 'Pipeline moved', num: true, get: function (g) { return g.movedValue; },
        render: function (g) { return g.movedValue ? U.money(g.movedValue) : '<span class="muted">—</span>'; } }
    ];
  }

  function perfSheet(name, label, groups) {
    return { name: name, rows: groups, columns: [
      { label: label, get: function (g) { return g.key; } },
      { label: 'Leads', type: 'number', get: function (g) { return g.leads; } },
      { label: 'Opportunities created', type: 'number', get: function (g) { return g.created; } },
      { label: 'Qualified pipeline', type: 'money', get: function (g) { return g.qualifiedValue; } },
      { label: 'Total pipeline', type: 'money', get: function (g) { return g.pipeline; } },
      { label: 'Weighted pipeline', type: 'money', get: function (g) { return g.weighted; } },
      { label: 'Won revenue', type: 'money', get: function (g) { return g.closed; } },
      { label: 'Won', type: 'number', get: function (g) { return g.wonCount; } },
      { label: 'Lost', type: 'number', get: function (g) { return g.lostCount; } },
      { label: 'Win rate %', type: 'percent', get: function (g) { return g.winRate; } },
      { label: 'Avg deal', type: 'money', get: function (g) { return g.avgDeal; } },
      { label: 'Median days to close', type: 'number', get: function (g) { return g.medianDays; } },
      { label: 'Pipeline moved', type: 'money', get: function (g) { return g.movedValue; } }
    ] };
  }

  function daySheet(date, rows) {
    return { name: 'Team day ' + date, rows: rows, columns: [
      { label: 'Salesperson', get: function (r) { return r.user.name; } }
    ].concat(M.MODE_COLUMNS.map(function (m) {
      return { label: m.label, type: 'number', get: function (r) { return r[m.key]; } };
    })).concat([
      { label: 'Connects logged', type: 'number', get: function (r) { return r.done.length; } },
      { label: 'Opportunities created', type: 'number', get: function (r) { return r.createdCount; } },
      { label: 'Pipeline moved', type: 'money', get: function (r) { return r.movedValue; } },
      { label: 'Planned', type: 'number', get: function (r) { return r.planned.length; } },
      { label: 'Planned actioned', type: 'number', get: function (r) { return r.kept; } }
    ]) };
  }

  /* One person's day in order. Not a surveillance list - every row carries
   * what came out of the activity, so the question stays "what moved?". */
  function personDay(userId, date) {
    var row = M.dayActivity(date, F.apply).filter(function (r) { return r.user.id === userId; })[0];
    if (!row) return;
    var done = U.sortBy(row.done, function (c) { return c.at || ''; }, 'asc');

    UI.modal(row.user.name + ' · ' + U.fmtDate(date),
      UI.stats([
        UI.stat({ small: true, label: 'Connects', value: U.count(done.length) }),
        UI.stat({ small: true, label: 'Opps created', value: U.count(row.createdCount) }),
        UI.stat({ small: true, cls: 'stat-brand', label: 'Pipeline moved', value: U.money(row.movedValue) }),
        UI.stat({ small: true, label: 'Planned', value: row.kept + ' / ' + row.planned.length })
      ]) +
      (done.length
        ? '<ul class="timeline">' + done.map(function (c) {
            var sc = RB.store.schoolById(c.schoolId);
            var o = c.opportunityId && RB.store.opportunityById(c.opportunityId);
            return '<li><div class="tl-date">' + U.esc(c.at ? c.at.slice(11, 16) : '—') + '</div>' +
              '<div class="tl-body"><div class="tl-head"><strong>' +
                U.esc((c.mode || 'Connect') + ' — ' + (sc ? sc.name : '')) + '</strong>' +
                (o ? '<span class="tag">' + U.esc(o.offering || 'Opportunity') + '</span>' : '') +
                (c.stage ? '<span class="tag tag-dark">' + U.esc(c.stage) + '</span>' : '') + '</div>' +
              '<div class="small muted">' + U.esc([
                  c.response ? 'Outcome: ' + c.response : null,
                  c.blocker && c.blocker !== 'None' ? 'Blocker: ' + c.blocker : null,
                  c.nextAction ? 'Next: ' + c.nextAction + (c.nextActionAt ? ' by ' + U.fmtDate(c.nextActionAt.slice(0, 10)) : '') : null
                ].filter(Boolean).join(' · ')) + '</div></div></li>';
          }).join('') + '</ul>'
        : '<div class="empty">Nothing logged on this day.</div>') +
      (row.planned.length
        ? '<div class="section-title">Agenda for the day</div>' +
          row.planned.map(function (c) {
            var sc = RB.store.schoolById(c.schoolId);
            return '<div class="task"><div class="task-main"><strong>' +
              U.esc((c.nextAction || 'Follow up') + ' — ' + (sc ? sc.name : '')) + '</strong>' +
              '<small>' + U.esc(c.nextActionOwner || '') + '</small></div></div>';
          }).join('')
        : ''),
      { wide: true });
  }

  /* ======================================================== 3. MARKET ===== */
  var matrixMeasure = 'count';

  function market(host) {
    var s = slice(), vs = s.vs;
    var comps = M.competitors(vs);
    var boards = M.segments(vs, 'board', s.schools, 'board');
    var sources = M.leadSources(vs, s.schools);
    var fit = M.fitModel(vs);
    var att = M.needsAttention(vs, fit);

    var regions = U.uniq(vs.map(function (v) { return v.school && v.school.region; })).sort();
    var players = comps.map(function (c) { return c.key; });
    var measures = { count: 'Schools', students: 'Students', observed: 'Observed revenue' };
    var cell = function (region, player) {
      var row = comps.filter(function (c) { return c.key === player; })[0];
      if (!row) return 0;
      var inRegion = row.schools.filter(function (sc) { return sc.region === region; });
      if (matrixMeasure === 'count') return inRegion.length;
      if (matrixMeasure === 'students') return U.sum(inRegion, function (sc) { return sc.students || 0; });
      return U.sum(inRegion, function (sc) { return sc.labSpend || 0; });
    };
    var noSpend = comps.every(function (c) { return !c.observed; });

    host.innerHTML = frame('market', 'Market',
      'Where Robobox is playing, who it is up against, and which segments are worth the effort.') +
      (att.length ? attentionStrip(att) : '') +

      '<div class="section-title">Competition</div>' +
      (noSpend ? '<div class="empty">No competitor spend has been recorded yet. Footprint below is real; ' +
                 'observed revenue fills in as reps capture "spend on existing lab" on new school connects.</div>' : '') +
      '<div class="grid grid-2">' +
        UI.card('Competitive map',
          noSpend ? 'School footprint — observed revenue is not recorded yet'
                  : 'Footprint across, observed revenue up, students as the bubble',
          noSpend
            ? C.hbar({ data: comps.map(function (c) { return { key: c.key, value: c.count }; }),
                       format: U.count, measureLabel: 'Schools covered', labelW: 150, onClick: true,
                       tipRows: function (d) {
                         var c = comps.filter(function (x) { return x.key === d.key; })[0];
                         return [['Schools', U.count(c.count)], ['Students', U.count(c.students)]];
                       },
                       color: function (d) { return d.key === 'Robobox' ? 'var(--brand)' : 'var(--charcoal)'; } })
            : C.bubble({ data: comps.map(function (c) {
                       return { key: c.key, x: c.count, y: c.observed, r: c.students, us: !!c.us };
                     }), labelX: 'Schools covered', labelY: 'Observed revenue', labelR: 'Students' })) +
        UI.card('Region × competition', 'Switch the measure',
          '<div class="tabs" style="margin-top:0">' + Object.keys(measures).map(function (k) {
            return '<button type="button" data-mx="' + k + '" aria-pressed="' + (k === matrixMeasure) + '">' +
              U.esc(measures[k]) + '</button>';
          }).join('') + '</div>' +
          C.heatmap({ rows: regions, cols: players, get: cell,
                      format: matrixMeasure === 'observed' ? U.money : U.count,
                      measureLabel: measures[matrixMeasure], labelW: 112, cellW: 66 })) +
      '</div>' +
      '<div id="comp"></div>' +

      '<div class="section-title">Board intelligence</div>' +
      UI.card('Pipeline by board', 'Which boards Robobox is actually building business in',
        C.hbar({ data: boards.map(function (g) { return { key: g.key, value: g.pipeline }; }),
                 format: U.money, measureLabel: 'Pipeline', labelW: 190, onClick: true })) +
      '<div id="boards"></div>' +

      '<div class="section-title">Lead source</div>' +
      '<p class="small muted" style="margin:-8px 0 12px">Not called ROI: no acquisition cost is captured, so no return can honestly be computed.</p>' +
      '<div id="src"></div>';

    bind(host, function () { market(host); }, function () {
      return [
        { name: 'Competition', rows: comps, columns: [
          { label: 'Player', get: function (c) { return c.key + (c.us ? ' (us)' : ''); } },
          { label: 'Schools', type: 'number', get: function (c) { return c.count; } },
          { label: 'Students', type: 'number', get: function (c) { return c.students; } },
          { label: 'Observed revenue', type: 'money', get: function (c) { return c.observed; } },
          { label: 'Avg revenue / school', type: 'money', get: function (c) { return c.avg; } },
          { label: 'Schools with a spend figure', type: 'number', get: function (c) { return c.known; } }
        ] },
        { name: 'Region x competition', rows: regions, columns: [
          { label: 'Region', get: function (r) { return r; } }
        ].concat(players.map(function (p) {
          return { label: p, type: matrixMeasure === 'observed' ? 'money' : 'number',
                   get: function (r) { return cell(r, p); } };
        })) },
        segmentSheet('Boards', 'Board', boards),
        { name: 'Lead sources', rows: sources, columns: [
          { label: 'Lead source', get: function (g) { return g.key; } },
          { label: 'Leads', type: 'number', get: function (g) { return g.leads; } },
          { label: 'Opportunities', type: 'number', get: function (g) { return g.count; } },
          { label: 'Qualified pipeline', type: 'money', get: function (g) { return g.qualifiedValue; } },
          { label: 'Pipeline', type: 'money', get: function (g) { return g.pipeline; } },
          { label: 'Won revenue', type: 'money', get: function (g) { return g.closed; } },
          { label: 'Win rate %', type: 'percent', get: function (g) { return g.winRate; } },
          { label: 'Avg deal', type: 'money', get: function (g) { return g.avgDeal; } },
          { label: 'Lead to opportunity %', type: 'percent', get: function (g) { return g.toOpportunity; } },
          { label: 'Lead to win %', type: 'percent', get: function (g) { return g.toWin; } },
          { label: 'Pipeline per lead', type: 'money', get: function (g) { return g.pipelinePerLead; } },
          { label: 'Revenue per lead', type: 'money', get: function (g) { return g.revenuePerLead; } }
        ] },
        RB.excel.opportunitySheet('Opportunities', vs)
      ];
    }, 'robobox-market');

    host.querySelectorAll('[data-mx]').forEach(function (b) {
      b.addEventListener('click', function () { matrixMeasure = b.getAttribute('data-mx'); market(host); });
    });
    var strip = host.querySelector('#att-strip');
    if (strip) strip.addEventListener('click', function () { UI.drill('Needs attention', att.map(function (i) { return i.v; })); });
    host.querySelectorAll('.viz [data-key]').forEach(function (g) {
      g.addEventListener('click', function () {
        var k = g.getAttribute('data-key');
        var grp = boards.filter(function (x) { return x.key === k; })[0];
        if (grp) return UI.drill(grp.key, grp.rows);
        var c = comps.filter(function (x) { return x.key === k; })[0];
        if (c) schoolListModal(k + ' — schools', c.schools);
      });
    });

    UI.table(host.querySelector('#comp'), {
      rows: comps, rowId: function (c) { return c.key; }, sortKey: 'count', pageSize: 12,
      onRowClick: function (k) {
        var row = comps.filter(function (c) { return c.key === k; })[0];
        if (row) schoolListModal(k + ' — schools', row.schools);
      },
      columns: [
        { key: 'key', label: 'Player', get: function (c) { return c.key; },
          render: function (c) { return '<span class="strong">' + U.esc(c.key) + '</span>' +
            (c.us ? ' <span class="tag tag-brand">us</span>' : ''); } },
        { key: 'count', label: 'Schools', num: true, get: function (c) { return c.count; },
          render: function (c) { return U.count(c.count); } },
        { key: 'students', label: 'Students', num: true, get: function (c) { return c.students; },
          render: function (c) { return c.students ? U.count(c.students) : '<span class="muted">—</span>'; } },
        { key: 'observed', label: 'Observed revenue', num: true, get: function (c) { return c.observed; },
          render: function (c) { return c.observed ? U.money(c.observed) : '<span class="muted">not recorded</span>'; } },
        { key: 'avg', label: 'Avg / school', num: true, get: function (c) { return c.avg; },
          render: function (c) { return c.avg ? U.money(c.avg) : '<span class="muted">—</span>'; } }
      ]
    });

    UI.table(host.querySelector('#boards'), {
      rows: boards, rowId: function (g) { return g.key; }, sortKey: 'pipeline', pageSize: 12,
      onRowClick: function (k) {
        var grp = boards.filter(function (x) { return x.key === k; })[0];
        if (grp) UI.drill(grp.key, grp.rows);
      },
      columns: segmentColumns('Board')
    });

    UI.table(host.querySelector('#src'), {
      rows: sources, rowId: function (g) { return g.key; }, sortKey: 'pipeline', pageSize: 12,
      onRowClick: function (k) {
        var grp = sources.filter(function (x) { return x.key === k; })[0];
        if (grp) UI.drill(grp.key, grp.rows);
      },
      columns: [
        { key: 'key', label: 'Lead source', get: function (g) { return g.key; },
          render: function (g) { return '<span class="strong">' + U.esc(g.key) + '</span>'; } },
        { key: 'leads', label: 'Leads', num: true, get: function (g) { return g.leads; },
          render: function (g) { return U.count(g.leads); } },
        { key: 'count', label: 'Opps', num: true, get: function (g) { return g.count; },
          render: function (g) { return U.count(g.count); } },
        { key: 'toOpportunity', label: 'Lead → opp', num: true,
          get: function (g) { return g.toOpportunity == null ? -1 : g.toOpportunity; },
          render: function (g) { return pctText(g.toOpportunity); } },
        { key: 'qualifiedValue', label: 'Qualified', num: true, get: function (g) { return g.qualifiedValue; },
          render: function (g) { return g.qualifiedValue ? U.money(g.qualifiedValue) : '<span class="muted">—</span>'; } },
        { key: 'pipeline', label: 'Pipeline', num: true, get: function (g) { return g.pipeline; },
          render: function (g) { return U.money(g.pipeline); } },
        { key: 'pipelinePerLead', label: 'Pipeline / lead', num: true, get: function (g) { return g.pipelinePerLead; },
          render: function (g) { return U.money(g.pipelinePerLead); } },
        { key: 'closed', label: 'Won revenue', num: true, get: function (g) { return g.closed; },
          render: function (g) { return g.closed ? U.money(g.closed) : '<span class="muted">—</span>'; } },
        { key: 'winRate', label: 'Win rate', num: true, get: function (g) { return g.winRate == null ? -1 : g.winRate; },
          render: function (g) { return g.winRate == null ? '<span class="muted">—</span>' : pctText(g.winRate); } },
        { key: 'avgDeal', label: 'Avg deal', num: true, get: function (g) { return g.avgDeal; },
          render: function (g) { return g.avgDeal ? U.money(g.avgDeal) : '<span class="muted">—</span>'; } }
      ]
    });
  }

  function segmentColumns(label) {
    return [
      { key: 'key', label: label, get: function (g) { return g.key; },
        render: function (g) { return '<span class="strong">' + U.esc(g.key) + '</span>'; } },
      { key: 'schools', label: 'Schools', num: true, get: function (g) { return g.schools; },
        render: function (g) { return U.count(g.schools); } },
      { key: 'students', label: 'Students', num: true, get: function (g) { return g.students; },
        render: function (g) { return g.students ? U.count(g.students) : '<span class="muted">—</span>'; } },
      { key: 'pipeline', label: 'Pipeline', num: true, get: function (g) { return g.pipeline; },
        render: function (g) { return U.money(g.pipeline); } },
      { key: 'closed', label: 'Won revenue', num: true, get: function (g) { return g.closed; },
        render: function (g) { return g.closed ? U.money(g.closed) : '<span class="muted">—</span>'; } },
      { key: 'winRate', label: 'Win rate', num: true, get: function (g) { return g.winRate == null ? -1 : g.winRate; },
        render: function (g) { return g.winRate == null ? '<span class="muted">—</span>' : pctText(g.winRate); } },
      { key: 'avgWon', label: 'Avg won deal', num: true, get: function (g) { return g.avgWon || 0; },
        render: function (g) { return g.avgWon ? U.money(g.avgWon) : '<span class="muted">—</span>'; } },
      { key: 'medianDays', label: 'Median days', num: true,
        get: function (g) { return g.medianDays == null ? 1e9 : g.medianDays; },
        render: function (g) { return g.medianDays == null ? '<span class="muted">—</span>' : Math.round(g.medianDays) + 'd'; } }
    ];
  }

  function segmentSheet(name, label, groups) {
    return { name: name, rows: groups, columns: [
      { label: label, get: function (g) { return g.key; } },
      { label: 'Schools', type: 'number', get: function (g) { return g.schools; } },
      { label: 'Students', type: 'number', get: function (g) { return g.students; } },
      { label: 'Opportunities', type: 'number', get: function (g) { return g.count; } },
      { label: 'Pipeline', type: 'money', get: function (g) { return g.pipeline; } },
      { label: 'Won revenue', type: 'money', get: function (g) { return g.closed; } },
      { label: 'Win rate %', type: 'percent', get: function (g) { return g.winRate; } },
      { label: 'Avg won deal', type: 'money', get: function (g) { return g.avgWon; } },
      { label: 'Median days to close', type: 'number', get: function (g) { return g.medianDays; } }
    ] };
  }

  /* =========================================================== 4. WIN ===== */
  var cycleDim = 'board';

  function win(host) {
    var s = slice(), vs = s.vs;
    var speed = M.salesSpeed(vs);
    var profile = M.winningProfile(vs);
    var fit = M.fitModel(vs);
    var looks = M.lookalikes(vs, fit, s.schools);
    var blockers = M.blockerRisk(vs);
    var att = M.needsAttention(vs, fit);
    var dims = { board: 'Board', region: 'Region', offering: 'Opportunity type',
                 studentBand: 'Student count', schoolKind: 'New / existing', leadSource: 'Lead source',
                 owner: 'Sales owner' };
    /* Where the segment is a school attribute, count schools from the school
     * list so "Schools" means the same thing here as it does on Business. */
    var SCHOOL_FIELD = { board: 'board', region: 'region', leadSource: 'leadSource' };
    var cycle = M.segments(vs, cycleDim, s.schools, SCHOOL_FIELD[cycleDim]);

    host.innerHTML = frame('win', 'Win',
      'What a Robobox win looks like, where revenue is stuck, and which schools to go after next.') +
      (att.length ? attentionStrip(att) : '') +

      '<div class="section-title">Sales speed</div>' +
      UI.stats([
        UI.stat({ cls: 'stat-hero', label: 'Median days to close',
                  value: speed.median == null ? '—' : Math.round(speed.median) + 'd',
                  foot: speed.n ? 'across ' + speed.n + ' won deals' : 'no closed deals yet',
                  title: 'Median of (won date − opportunity creation date).' }),
        UI.stat({ label: 'Fastest 10%', value: speed.fastest == null ? '—' : Math.round(speed.fastest) + 'd',
                  foot: 'best-case realistic speed' }),
        UI.stat({ label: 'Slowest 10%', value: speed.slowest == null ? '—' : Math.round(speed.slowest) + 'd',
                  foot: '90th percentile' })
      ]) +
      '<div class="tabs">' + Object.keys(dims).map(function (k) {
        return '<button type="button" data-cyc="' + k + '" aria-pressed="' + (k === cycleDim) + '">' +
          U.esc(dims[k]) + '</button>';
      }).join('') + '</div>' +
      '<div id="cycle"></div>' +

      '<div class="section-title">Winning school profile</div>' +
      (profile.enough
        ? UI.card('The Robobox win', U.count(profile.n) + ' won opportunities',
            '<div class="grid grid-3">' + profile.traits.map(function (t) {
              return '<div class="stat"><div class="stat-label">' + U.esc(t.label) + '</div>' +
                '<div class="stat-value sm">' + U.esc(t.value) + '</div>' +
                '<div class="stat-foot">' + pctText(t.share) + ' of wins</div></div>';
            }).join('') + '</div>' +
            '<div class="stats" style="margin-top:12px">' +
              UI.stat({ small: true, label: 'Typical deal',
                        value: U.money(profile.dealLow) + ' – ' + U.money(profile.dealHigh) }) +
              UI.stat({ small: true, label: 'Median close',
                        value: profile.medianDays == null ? '—' : Math.round(profile.medianDays) + 'd' }) +
            '</div>')
        : '<div class="empty">A winning profile needs at least ' + profile.need + ' won opportunities to mean anything. ' +
          'There ' + (profile.have === 1 ? 'is' : 'are') + ' ' + profile.have + ' so far — the profile appears automatically once the ' +
          (profile.need - profile.have) + ' remaining close.</div>') +

      '<div class="section-title">Where revenue is getting stuck</div>' +
      '<div class="grid grid-2">' +
        UI.card('Top blockers by urgency', 'Money at risk × how long it has been stuck',
          blockers.length
            ? C.hbar({ data: blockers.slice(0, 5).map(function (b) { return { key: b.key, value: b.priority }; }),
                       format: U.money, measureLabel: 'Priority score', labelW: 200, onClick: true,
                       color: function () { return 'var(--red)'; } })
            : '<div class="empty">No blockers recorded on open opportunities.</div>') +
        UI.card('Lookalike engine', 'Fit basis: ' + fit.basis +
          (fit.useWinRate ? '' : ' — switches to win rate after ' + fit.need + ' closed deals'),
          C.hbar({ data: looks.slice(0, 8).map(function (r) { return { key: r.school.name, value: r.fit }; }),
                   format: function (n) { return Math.round(n) + '/100'; }, sort: false,
                   measureLabel: 'Fit score', labelW: 200, onClick: true })) +
      '</div>' +
      '<div id="blockers"></div>' +
      (blockers.length && blockers.every(function (x) { return !x.weightedKnown; })
        ? '<p class="small muted">Pipeline at risk is expected deal size × probability. No probability has been ' +
          'recorded on any connect yet, so it reads as ₹0 and the priority ranking falls back to the full ' +
          'expected value × age factor.</p>'
        : '') +

      '<div class="section-title">Schools that look like a Robobox win</div><div id="look"></div>' +

      (att.length ? '<div class="section-title">Needs attention · ' + att.length + '</div><div id="att"></div>' : '');

    bind(host, function () { win(host); }, function () {
      return [
        segmentSheet('Sales cycle by ' + dims[cycleDim], dims[cycleDim], cycle),
        { name: 'Blockers', rows: blockers, columns: [
          { label: 'Blocker', width: 28, get: function (b) { return b.key; } },
          { label: 'Pipeline at risk', type: 'money', get: function (b) { return b.atRisk; } },
          { label: 'Pipeline value', type: 'money', get: function (b) { return b.value; } },
          { label: 'Opportunities', type: 'number', get: function (b) { return b.count; } },
          { label: 'Avg days stuck', type: 'number', get: function (b) { return b.avgStuck; } },
          { label: 'Share of pipeline %', type: 'percent', get: function (b) { return b.share; } },
          { label: 'Priority score', type: 'money', get: function (b) { return b.priority; } }
        ] },
        { name: 'Lookalike schools', rows: looks, columns: [
          { label: 'School', get: function (r) { return r.school.name; } },
          { label: 'Region', get: function (r) { return r.school.region; } },
          { label: 'Board', get: function (r) { return r.school.board; } },
          { label: 'Students', type: 'number', get: function (r) { return r.school.students; } },
          { label: 'Fit score', type: 'number', get: function (r) { return r.fit; } },
          { label: 'Why it fits', width: 60, get: function (r) { return r.why; } },
          { label: 'Estimated opportunity', type: 'money', get: function (r) { return r.value; } },
          { label: 'Recommended action', get: function (r) { return r.action; } },
          { label: 'Owner', get: function (r) { return r.school.ownerKey; } }
        ] },
        attentionSheet(att),
        RB.excel.opportunitySheet('Opportunities', vs)
      ];
    }, 'robobox-win');

    host.querySelectorAll('[data-cyc]').forEach(function (b) {
      b.addEventListener('click', function () { cycleDim = b.getAttribute('data-cyc'); win(host); });
    });
    var strip = host.querySelector('#att-strip');
    if (strip) strip.addEventListener('click', function () { UI.drill('Needs attention', att.map(function (i) { return i.v; })); });
    if (att.length) attentionTable(host.querySelector('#att'), att);
    host.querySelectorAll('.viz [data-key]').forEach(function (g) {
      g.addEventListener('click', function () {
        var k = g.getAttribute('data-key');
        var b = blockers.filter(function (x) { return x.key === k; })[0];
        if (b) return UI.drill(k, b.rows);
        var l = looks.filter(function (x) { return x.school.name === k; })[0];
        if (l) fitModal(l);
      });
    });

    UI.table(host.querySelector('#cycle'), {
      rows: cycle, rowId: function (g) { return g.key; }, sortKey: 'pipeline', pageSize: 12,
      onRowClick: function (k) {
        var grp = cycle.filter(function (x) { return x.key === k; })[0];
        if (grp) UI.drill(grp.key, grp.rows);
      },
      columns: segmentColumns(dims[cycleDim])
    });

    UI.table(host.querySelector('#blockers'), {
      rows: blockers, rowId: function (b) { return b.key; }, sortKey: 'priority', pageSize: 12,
      onRowClick: function (k) {
        var b = blockers.filter(function (x) { return x.key === k; })[0];
        if (b) UI.drill(k, b.rows);
      },
      empty: 'No blockers recorded on open opportunities.',
      columns: [
        { key: 'key', label: 'Blocker', get: function (b) { return b.key; },
          render: function (b) { return '<span class="strong">' + U.esc(b.key) + '</span>'; } },
        { key: 'atRisk', label: 'Pipeline at risk', num: true, get: function (b) { return b.atRisk; },
          render: function (b) { return b.atRisk ? U.money(b.atRisk) : '<span class="muted">—</span>'; } },
        { key: 'value', label: 'Pipeline value', num: true, get: function (b) { return b.value; },
          render: function (b) { return U.money(b.value); } },
        { key: 'count', label: 'Opps', num: true, get: function (b) { return b.count; },
          render: function (b) { return U.count(b.count); } },
        { key: 'avgStuck', label: 'Avg days stuck', num: true, get: function (b) { return b.avgStuck || 0; },
          render: function (b) { return b.avgStuck == null ? '<span class="muted">—</span>' : b.avgStuck + 'd'; } },
        { key: 'share', label: '% of pipeline', num: true, get: function (b) { return b.share || 0; },
          render: function (b) { return pctText(b.share); } },
        { key: 'priority', label: 'Priority', num: true, get: function (b) { return b.priority; },
          render: function (b) { return '<span class="strong">' + U.esc(U.money(b.priority)) + '</span>'; } }
      ]
    });

    UI.table(host.querySelector('#look'), {
      rows: looks, rowId: function (r) { return r.school.id; }, sortKey: 'fit', pageSize: 15,
      onRowClick: function (id) {
        var l = looks.filter(function (x) { return x.school.id === id; })[0];
        if (l) fitModal(l);
      },
      empty: 'No schools to score yet.',
      columns: [
        { key: 'school', label: 'School', get: function (r) { return r.school.name; },
          render: function (r) { return '<span class="strong">' + U.esc(r.school.name) + '</span>' +
            '<div class="small muted">' + U.esc([r.school.region, r.school.board,
              r.school.students ? U.count(r.school.students) + ' students' : null].filter(Boolean).join(' · ')) + '</div>'; } },
        { key: 'fit', label: 'Fit score', num: true, get: function (r) { return r.fit; },
          render: function (r) { return '<span class="tag ' + (r.fit >= 75 ? 'tag-brand' : r.fit >= 55 ? 'tag-dark' : '') + '">' +
            r.fit + '/100</span>'; } },
        { key: 'why', label: 'Why it fits', sortable: false, get: function (r) { return r.why; },
          render: function (r) { return '<span class="small">' + U.esc(r.why) + '</span>'; } },
        { key: 'value', label: 'Estimated opportunity', num: true, get: function (r) { return r.value; },
          render: function (r) { return U.money(r.value); } },
        { key: 'action', label: 'Action', get: function (r) { return r.action; },
          render: function (r) { return '<span class="tag' + (r.action === 'Prioritise' ? ' tag-brand' : '') + '">' +
            U.esc(r.action) + '</span>'; } },
        { key: 'owner', label: 'Owner', get: function (r) { return r.school.ownerKey || 'Unassigned'; } }
      ]
    });
  }

  /* The score, broken into the factors that produced it. A score nobody can
   * explain is a score nobody acts on. */
  function fitModal(l) {
    UI.modal(l.school.name + ' · fit ' + l.fit + '/100',
      '<p class="sec" style="margin-top:0">' + U.esc(l.why) + '.</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>Factor</th><th>This school</th>' +
      '<th class="num">Score</th><th class="num">Weight</th></tr></thead><tbody>' +
      l.parts.map(function (p) {
        return '<tr><td class="strong">' + U.esc(p.label) + '</td>' +
          '<td>' + U.esc(p.segment) + (p.note ? ' <span class="tag">' + U.esc(p.note) + '</span>' : '') + '</td>' +
          '<td class="num">' + p.got.toFixed(1) + '</td><td class="num">' + p.weight + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="modal-actions"><button class="btn" data-close="1">Close</button>' +
      '<button class="btn btn-primary" id="open-school">Open school</button></div>',
      { wide: true, onMount: function (h) {
          h.querySelector('#open-school').addEventListener('click', function () {
            RB.views.school(l.school.id);
          });
        } });
  }

  return { business: business, sales: sales, market: market, win: win, TABS: TABS };
})();
