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
      empty: 'Nothing needs action today.',
      columns: [
        { key: 'school', label: 'School', get: function (i) { return i.v.school ? i.v.school.name : ''; },
          render: function (i) { return '<span class="strong">' + U.esc(i.v.school ? i.v.school.name : '—') + '</span>' +
            '<div class="small muted">' + U.esc([i.v.school && i.v.school.region, i.v.opp.offering].filter(Boolean).join(' · ')) + '</div>'; } },
        { key: 'stage', label: 'Stage', get: function (i) { return i.v.stageRank; }, render: function (i) { return UI.stageTag(i.v); } },
        { key: 'value', label: 'Value', num: true, get: function (i) { return i.v.current || 0; },
          render: function (i) { return U.money(i.v.current); } },
        { key: 'problem', label: 'Problem', get: function (i) { return i.problem; },
          render: function (i) { return '<span class="tag tag-red">' + U.esc(i.problem) + '</span>'; } },
        { key: 'action', label: 'Next Step', get: function (i) { return i.action; } },
        { key: 'owner', label: 'Owner', get: function (i) { return i.v.owner || 'Unassigned'; },
          render: function (i) { return i.v.owner ? U.esc(i.v.owner) : '<span class="tag tag-red">Unassigned</span>'; } }
      ]
    });
  }

  function attentionSheet(items) {
    return { name: 'Needs Action', rows: items, columns: [
      { label: 'School', get: function (i) { return i.v.school && i.v.school.name; } },
      { label: 'Opportunity', get: function (i) { return i.v.opp.offering; } },
      { label: 'Value', type: 'money', get: function (i) { return i.v.current; } },
      { label: 'Problem', width: 34, get: function (i) { return i.problem; } },
      { label: 'Next Step', width: 34, get: function (i) { return i.action; } },
      { label: 'Owner', get: function (i) { return i.v.owner; } }
    ] };
  }

  /* ====================================================== 1. BUSINESS ===== */
  function business(host) {
    var s = slice(), vs = s.vs, range = s.range;
    var b = M.business(vs, range, s.schools);
    var steps = M.journey(vs);
    var bands = M.health(vs);
    var fit = M.fitModel(vs);
    var act = M.needsAttention(vs, fit).slice(0, 5);
    var regions = M.groupBy(vs, 'region').map(function (g) {
      g.expected = U.sum(g.rows.filter(function (v) { return v.status === 'Open'; }),
                         function (v) { return v.weighted; });
      g.schools = U.uniq(g.rows.map(function (v) { return v.opp.schoolId; })).length;
      return g;
    });

    host.innerHTML = frame('business', 'Business Overview',
      'How much business we have, whether it is moving, what is stuck, what needs action.') +

      /* 1. How much business do we have? Four numbers, nothing else. */
      '<div class="kpis">' +
        kpi('Total Business', U.money(b.potential), U.count(b.potentialCount) + ' potential deals', 'pot',
            'Every potential deal that is not lost and has a value on it.') +
        kpi('Business in Play', U.money(b.activePipeline), U.count(b.open.length) + ' being pursued', 'play',
            'Value of potential deals still open.') +
        kpi('Expected Business', U.money(b.weighted),
            b.noProbability.length ? U.count(b.noProbability.length) + ' have no likelihood set' : 'value × likelihood',
            'expected', 'Deal value multiplied by its likelihood of closing.') +
        kpi('Business Won', U.money(b.wonValue), U.count(b.wonCount) + ' closed', 'won',
            'Actual value of deals closed as won in the selected period.') +
      '</div>' +

      /* 2. Is it moving? */
      '<div class="section-title">The journey</div>' +
      '<div class="journey">' + steps.map(function (st, i) {
        return '<button type="button" class="jstep" data-step="' + U.esc(st.key) + '"' +
          (i === steps.length - 1 ? ' data-last="1"' : '') + '>' +
          '<span class="jstep-n">' + U.esc(U.count(st.n)) + '</span>' +
          '<span class="jstep-k">' + U.esc(st.key) + '</span>' +
          '<span class="jstep-v">' + U.esc(U.money(st.value)) + '</span></button>';
      }).join('') + '</div>' +

      /* 3. What is stuck? */
      '<div class="section-title">Business Health</div>' +
      '<div class="kpis kpis-4">' + bands.map(function (h) {
        return kpi(h.key, U.count(h.n), U.money(h.value) + ' · ' + h.note, 'h-' + h.key,
                   // Colour only when there is something to act on - a red zero
                   // means nothing.
                   h.note, !h.n ? '' : h.key === 'Overdue' ? 'is-risk' : 'is-warn');
      }).join('') + '</div>' +

      /* 4. What needs action? */
      '<div class="section-title">Needs Action<span class="st-sub">top 5 of ' +
        U.count(M.needsAttention(vs, fit).length) + '</span></div>' +
      '<div id="act"></div>' +

      '<div class="section-title">Business by Region</div><div id="reg"></div>';

    bind(host, function () { business(host); }, function () {
      return [
        { name: 'Business Overview', rows: [
            { label: 'Total Business', value: b.potential, n: b.potentialCount },
            { label: 'Business in Play', value: b.activePipeline, n: b.open.length },
            { label: 'Expected Business', value: b.weighted, n: b.open.length },
            { label: 'Business Won', value: b.wonValue, n: b.wonCount }
          ].concat(bands.map(function (h) { return { label: h.key, value: h.value, n: h.n }; })),
          columns: [{ label: 'Measure', width: 26, get: function (r) { return r.label; } },
                    { label: 'Value', type: 'money', get: function (r) { return r.value; } },
                    { label: 'Deals', type: 'number', get: function (r) { return r.n; } }] },
        { name: 'The journey', rows: steps, columns: [
          { label: 'Step', get: function (g) { return g.key; } },
          { label: 'Deals', type: 'number', get: function (g) { return g.n; } },
          { label: 'Value', type: 'money', get: function (g) { return g.value; } }
        ] },
        { name: 'By region', rows: regions, columns: [
          { label: 'Region', get: function (g) { return g.key; } },
          { label: 'Schools', type: 'number', get: function (g) { return g.schools; } },
          { label: 'Potential deals', type: 'number', get: function (g) { return g.count; } },
          { label: 'Business in Play', type: 'money', get: function (g) { return g.pipeline; } },
          { label: 'Expected Business', type: 'money', get: function (g) { return g.expected; } },
          { label: 'Business Won', type: 'money', get: function (g) { return g.closed; } }
        ] },
        attentionSheet(M.needsAttention(vs, fit)),
        RB.excel.opportunitySheet('Potential deals', vs)
      ];
    }, 'robobox-business');

    UI.table(host.querySelector('#act'), {
      rows: act, rowId: function (i) { return i.v.opp.id; }, sortKey: 'value', pageSize: 5,
      onRowClick: function (id) { RB.views.school(RB.store.opportunityById(id).schoolId); },
      empty: 'Nothing needs intervention today.',
      columns: [
        { key: 'school', label: 'School', get: function (i) { return i.v.school ? i.v.school.name : ''; },
          render: function (i) { return '<span class="strong">' + U.esc(i.v.school ? i.v.school.name : '—') + '</span>' +
            '<div class="small muted">' + U.esc([i.v.school && i.v.school.region, i.v.opp.offering].filter(Boolean).join(' · ')) + '</div>'; } },
        { key: 'value', label: 'Value', num: true, get: function (i) { return i.v.current || 0; },
          render: function (i) { return '<span class="strong">' + U.esc(U.money(i.v.current)) + '</span>'; } },
        { key: 'problem', label: 'Problem', get: function (i) { return i.problem; },
          render: function (i) { return '<span class="tag tag-red">' + U.esc(i.problem) + '</span>'; } },
        { key: 'owner', label: 'Owner', get: function (i) { return i.v.owner || 'Unassigned'; },
          render: function (i) { return i.v.owner ? U.esc(i.v.owner) : '<span class="tag tag-red">Unassigned</span>'; } },
        { key: 'step', label: 'Next Step', sortable: false, get: function (i) { return i.action; } }
      ]
    });

    UI.table(host.querySelector('#reg'), {
      rows: regions, rowId: function (g) { return g.key; }, sortKey: 'pipeline', pageSize: 8,
      onRowClick: function (k) {
        var g = regions.filter(function (x) { return x.key === k; })[0];
        if (g) UI.drill(g.key, g.rows);
      },
      columns: [
        { key: 'key', label: 'Region', get: function (g) { return g.key; },
          render: function (g) { return '<span class="strong">' + U.esc(g.key) + '</span>'; } },
        { key: 'schools', label: 'Schools', num: true, get: function (g) { return g.schools; },
          render: function (g) { return U.count(g.schools); } },
        { key: 'pipeline', label: 'In Play', num: true, get: function (g) { return g.pipeline; },
          render: function (g) { return U.money(g.pipeline); } },
        { key: 'expected', label: 'Expected', num: true, get: function (g) { return g.expected; },
          render: function (g) { return g.expected ? U.money(g.expected) : '<span class="muted">—</span>'; } },
        { key: 'closed', label: 'Won', num: true, get: function (g) { return g.closed; },
          render: function (g) { return g.closed ? U.money(g.closed) : '<span class="muted">—</span>'; } }
      ]
    });

    host.querySelectorAll('[data-step]').forEach(function (el) {
      el.addEventListener('click', function () {
        var st = steps.filter(function (x) { return x.key === el.getAttribute('data-step'); })[0];
        if (st) UI.drill(st.key, st.rows);
      });
    });

    var map = {
      pot: ['Total Business', b.identified], play: ['Business in Play', b.open],
      expected: ['Expected Business', b.open], won: ['Business Won', b.won]
    };
    bands.forEach(function (h) { map['h-' + h.key] = [h.key, h.rows]; });
    drillOn(host, map);
  }

  /* A headline number. Colour carries meaning only: plain by default,
   * yellow for attention, red for overdue or at risk. */
  function kpi(label, value, foot, click, title, tone) {
    return '<button type="button" class="kpi ' + (tone || '') + '" data-stat="' + U.esc(click) + '"' +
      (title ? ' title="' + U.esc(title) + '"' : '') + '>' +
      '<span class="kpi-label">' + U.esc(label) + '</span>' +
      '<span class="kpi-value">' + U.esc(value) + '</span>' +
      '<span class="kpi-foot">' + U.esc(foot) + '</span></button>';
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
      'Who is selling, what they did with their day, and whether business moved because of it.') +
      (att.length ? attentionStrip(att) : '') +

      '<div class="section-title">Performance</div>' +
      '<div class="tabs">' + Object.keys(dims).map(function (k) {
        return '<button type="button" data-dim="' + k + '" aria-pressed="' + (k === perfDim) + '">' +
          U.esc(dims[k]) + '</button>';
      }).join('') + '</div>' +
      '<div class="grid grid-2">' +
        UI.card('Business in Play', 'Business in play, ' + dims[perfDim].toLowerCase(),
          C.hbar({ data: groups.map(function (g) { return { key: g.key, value: g.qualifiedValue }; }),
                   format: U.money, measureLabel: 'Ready', labelW: 150, onClick: true,
                   empty: 'Nothing is ready to forecast yet — see Missing Information on Business Overview.' })) +
        UI.card('Business Moved', 'Business that advanced a step in the period',
          C.hbar({ data: groups.map(function (g) { return { key: g.key, value: g.movedValue }; }),
                   format: U.money, measureLabel: 'Moved', labelW: 150, onClick: true,
                   empty: 'No business advanced a step in this period.',
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
            UI.stat({ small: true, label: 'Business Moved',
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
        perfSheet('Offering', 'Offering', offer),
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
    if (strip) strip.addEventListener('click', function () { UI.drill('Needs Action', att.map(function (i) { return i.v; })); });
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
        { key: 'moved', label: 'Business Moved', num: true, get: function (r) { return r.movedValue; },
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
      columns: perfColumns('Offering')
    });
  }

  function perfColumns(label) {
    return [
      { key: 'key', label: label, get: function (g) { return g.key; },
        render: function (g) { return '<span class="strong">' + U.esc(g.key) + '</span>'; } },
      { key: 'leads', label: 'Leads', num: true, get: function (g) { return g.leads; },
        render: function (g) { return U.count(g.leads); } },
      { key: 'created', label: 'Deals', num: true, get: function (g) { return g.created; },
        render: function (g) { return U.count(g.created); } },
      { key: 'qualifiedValue', label: 'Ready to forecast', num: true, get: function (g) { return g.qualifiedValue; },
        render: function (g) { return g.qualifiedValue ? U.money(g.qualifiedValue) : '<span class="muted">—</span>'; } },
      { key: 'pipeline', label: 'Business in Play', num: true, get: function (g) { return g.pipeline; },
        render: function (g) { return U.money(g.pipeline); } },
      { key: 'closed', label: 'Business Won', num: true, get: function (g) { return g.closed; },
        render: function (g) { return g.closed ? U.money(g.closed) : '<span class="muted">—</span>'; } },
      { key: 'winRate', label: 'Win rate', num: true, get: function (g) { return g.winRate == null ? -1 : g.winRate; },
        render: function (g) { return g.winRate == null ? '<span class="muted">—</span>' : pctText(g.winRate); } },
      { key: 'avgDeal', label: 'Avg deal', num: true, get: function (g) { return g.avgDeal; },
        render: function (g) { return g.avgDeal ? U.money(g.avgDeal) : '<span class="muted">—</span>'; } },
      { key: 'avgDays', label: 'Avg. days to close', num: true,
        get: function (g) { return g.avgDays == null ? 1e9 : g.avgDays; },
        render: function (g) { return g.avgDays == null ? '<span class="muted">—</span>' : Math.round(g.avgDays) + 'd'; } },
      { key: 'movedValue', label: 'Business Moved', num: true, get: function (g) { return g.movedValue; },
        render: function (g) { return g.movedValue ? U.money(g.movedValue) : '<span class="muted">—</span>'; } }
    ];
  }

  function perfSheet(name, label, groups) {
    return { name: name, rows: groups, columns: [
      { label: label, get: function (g) { return g.key; } },
      { label: 'Leads', type: 'number', get: function (g) { return g.leads; } },
      { label: 'Potential deals created', type: 'number', get: function (g) { return g.created; } },
      { label: 'Business in Play', type: 'money', get: function (g) { return g.qualifiedValue; } },
      { label: 'Business in Play', type: 'money', get: function (g) { return g.pipeline; } },
      { label: 'Expected Business', type: 'money', get: function (g) { return g.weighted; } },
      { label: 'Business Won', type: 'money', get: function (g) { return g.closed; } },
      { label: 'Won', type: 'number', get: function (g) { return g.wonCount; } },
      { label: 'Lost', type: 'number', get: function (g) { return g.lostCount; } },
      { label: 'Win rate %', type: 'percent', get: function (g) { return g.winRate; } },
      { label: 'Avg deal', type: 'money', get: function (g) { return g.avgDeal; } },
      { label: 'Avg. days to close', type: 'number', get: function (g) { return g.avgDays; } },
      { label: 'Business Moved', type: 'money', get: function (g) { return g.movedValue; } }
    ] };
  }

  function daySheet(date, rows) {
    return { name: 'Team day ' + date, rows: rows, columns: [
      { label: 'Salesperson', get: function (r) { return r.user.name; } }
    ].concat(M.MODE_COLUMNS.map(function (m) {
      return { label: m.label, type: 'number', get: function (r) { return r[m.key]; } };
    })).concat([
      { label: 'Connects logged', type: 'number', get: function (r) { return r.done.length; } },
      { label: 'Potential deals created', type: 'number', get: function (r) { return r.createdCount; } },
      { label: 'Business Moved', type: 'money', get: function (r) { return r.movedValue; } },
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
        UI.stat({ small: true, cls: 'stat-brand', label: 'Business Moved', value: U.money(row.movedValue) }),
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

    /* One row per region: what Robobox holds, what the field holds, and the
     * competitors actually present — named, with counts. Nine colour bands in
     * one bar told nobody anything; a table does. */
    var regionRows = regions.map(function (r) {
      var mine = cell(r, 'Robobox');
      var rivals = players.filter(function (pl) { return pl !== 'Robobox'; })
        .map(function (pl) { return { key: pl, value: cell(r, pl) }; })
        .filter(function (x) { return x.value; });
      rivals = U.sortBy(rivals, function (x) { return x.value; }, 'desc');
      var theirs = U.sum(rivals, function (x) { return x.value; });
      return { key: r, mine: mine, theirs: theirs, total: mine + theirs, rivals: rivals,
               share: (mine + theirs) ? (mine / (mine + theirs)) * 100 : null };
    });

    var b = M.business(vs, s.range, s.schools);
    var list = M.listValue(b.open);

    host.innerHTML = frame('market', 'Market',
      'Where Robobox is playing, who it is up against, and which segments are worth the effort.') +
      (att.length ? attentionStrip(att) : '') +

      '<div class="section-title">Reach</div>' +
      UI.stats([
        UI.stat({ label: 'Schools on file', value: U.count(b.schoolsTapped), onClick: 'schools',
                  foot: U.count(b.noOpportunity.length) + ' with no potential deal yet' }),
        UI.stat({ label: 'Students represented', value: U.count(b.students), foot: 'counted once per school' }),
        UI.stat({ label: 'No STEM lab yet', value: U.count(b.untapped.length),
                  foot: 'confirmed untapped', onClick: 'untapped' }),
        UI.stat({ label: 'In play at list price', value: list.value ? U.money(list.value) : '—',
                  foot: list.value ? U.count(list.unpriced.length) + ' not priceable yet' : 'set the rate card in Settings',
                  title: 'Rate-card price × (students ÷ base students) for open deals.' }),
        UI.stat({ label: 'Market whitespace', value: b.untapped.length ? U.money(b.whitespace) : '—',
                  foot: b.untapped.length
                    ? U.count(b.untapped.length) + ' × ' + U.money(b.whitespaceBasis.value)
                    : 'nobody has been asked yet',
                  title: 'An assumption, not a measurement. Set the average lab value in Settings.' })
      ]) +
      (b.notAsked.length
        ? '<button type="button" class="action-item yellow" id="ask-lab">' +
          '<span class="action-ico">?</span><span><strong>' + U.count(b.notAsked.length) +
          ' schools have not been asked whether a STEM lab already exists</strong>' +
          '<small>Answering that turns them into measurable whitespace.</small></span>' +
          '<span class="chev">›</span></button>'
        : '') +

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
      '</div>' +
      '<div id="comp"></div>' +

      '<div class="section-title">Who holds which region' +
        '<span class="st-sub">Robobox against everyone else, by ' + U.esc(measures[matrixMeasure].toLowerCase()) + '</span></div>' +
      '<div class="tabs">' + Object.keys(measures).map(function (k) {
        return '<button type="button" data-mx="' + k + '" aria-pressed="' + (k === matrixMeasure) + '">' +
          U.esc(measures[k]) + '</button>';
      }).join('') + '</div>' +
      '<div id="reg"></div>' +

      '<div class="section-title">Board intelligence</div>' +
      UI.card('Business in play by board', 'Which boards Robobox is actually building business in',
        C.hbar({ data: boards.map(function (g) { return { key: g.key, value: g.pipeline }; }),
                 format: U.money, measureLabel: 'In Play', labelW: 190, onClick: true })) +
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
        { name: 'Who holds which region', rows: regionRows, columns: [
          { label: 'Region', get: function (r) { return r.key; } },
          { label: 'Robobox', type: matrixMeasure === 'observed' ? 'money' : 'number',
            get: function (r) { return r.mine; } },
          { label: 'Competition', type: matrixMeasure === 'observed' ? 'money' : 'number',
            get: function (r) { return r.theirs; } },
          { label: 'Robobox share %', type: 'percent', get: function (r) { return r.share; } },
          { label: 'Competitors present', width: 44,
            get: function (r) { return r.rivals.map(function (x) { return x.key + ' (' + x.value + ')'; }).join(', '); } }
        ] },
        segmentSheet('Boards', 'Board', boards),
        { name: 'Lead sources', rows: sources, columns: [
          { label: 'Lead source', get: function (g) { return g.key; } },
          { label: 'Leads', type: 'number', get: function (g) { return g.leads; } },
          { label: 'Potential deals', type: 'number', get: function (g) { return g.count; } },
          { label: 'Business in Play', type: 'money', get: function (g) { return g.qualifiedValue; } },
          { label: 'In Play', type: 'money', get: function (g) { return g.pipeline; } },
          { label: 'Business Won', type: 'money', get: function (g) { return g.closed; } },
          { label: 'Win rate %', type: 'percent', get: function (g) { return g.winRate; } },
          { label: 'Avg deal', type: 'money', get: function (g) { return g.avgDeal; } },
          { label: 'Lead to deal %', type: 'percent', get: function (g) { return g.toOpportunity; } },
          { label: 'Lead to win %', type: 'percent', get: function (g) { return g.toWin; } },
          { label: 'In Play per lead', type: 'money', get: function (g) { return g.pipelinePerLead; } },
          { label: 'Revenue per lead', type: 'money', get: function (g) { return g.revenuePerLead; } }
        ] },
        RB.excel.opportunitySheet('Opportunities', vs)
      ];
    }, 'robobox-market');

    host.querySelectorAll('[data-mx]').forEach(function (el) {
      el.addEventListener('click', function () { matrixMeasure = el.getAttribute('data-mx'); market(host); });
    });
    host.querySelectorAll('[data-stat="schools"],[data-stat="untapped"]').forEach(function (el) {
      var untapped = el.getAttribute('data-stat') === 'untapped';
      el.addEventListener('click', function () {
        schoolListModal(untapped ? 'Schools with no STEM lab' : 'Schools on file',
                        untapped ? b.untapped : b.schools);
      });
    });
    var ask = host.querySelector('#ask-lab');
    if (ask) ask.addEventListener('click', function () {
      schoolListModal('Lab status not recorded', b.notAsked);
    });
    var strip = host.querySelector('#att-strip');
    if (strip) strip.addEventListener('click', function () { UI.drill('Needs Action', att.map(function (i) { return i.v; })); });
    host.querySelectorAll('.viz [data-key]').forEach(function (g) {
      g.addEventListener('click', function () {
        var k = g.getAttribute('data-key');
        var grp = boards.filter(function (x) { return x.key === k; })[0];
        if (grp) return UI.drill(grp.key, grp.rows);
        var c = comps.filter(function (x) { return x.key === k; })[0];
        if (c) schoolListModal(k + ' — schools', c.schools);
      });
    });

    var fmt = matrixMeasure === 'observed' ? U.money : U.count;
    UI.table(host.querySelector('#reg'), {
      rows: regionRows, rowId: function (r) { return r.key; }, sortKey: 'mine', pageSize: 10,
      empty: 'No regions in this filter.',
      columns: [
        { key: 'key', label: 'Region', get: function (r) { return r.key; },
          render: function (r) { return '<span class="strong">' + U.esc(r.key) + '</span>'; } },
        { key: 'share', label: 'Robobox share', sortable: false, get: function (r) { return r.share || 0; },
          render: function (r) {
            return '<span class="share"><span class="share-bar">' +
              '<span style="width:' + (r.share || 0).toFixed(1) + '%"></span></span>' +
              '<span class="share-pct">' + (r.share == null ? '—' : Math.round(r.share) + '%') + '</span></span>';
          } },
        { key: 'mine', label: 'Robobox', num: true, get: function (r) { return r.mine; },
          render: function (r) { return r.mine ? '<span class="strong">' + U.esc(fmt(r.mine)) + '</span>'
                                               : '<span class="muted">—</span>'; } },
        { key: 'theirs', label: 'Competition', num: true, get: function (r) { return r.theirs; },
          render: function (r) { return r.theirs ? U.esc(fmt(r.theirs)) : '<span class="muted">—</span>'; } },
        { key: 'rivals', label: 'Who is there', sortable: false,
          get: function (r) { return r.rivals.length; },
          render: function (r) {
            return r.rivals.length
              ? r.rivals.slice(0, 4).map(function (x) {
                  return '<span class="tag">' + U.esc(x.key) + ' ' + U.esc(fmt(x.value)) + '</span>';
                }).join(' ') + (r.rivals.length > 4 ? ' <span class="small muted">+' + (r.rivals.length - 4) + '</span>' : '')
              : '<span class="muted">nobody recorded</span>';
          } }
      ]
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
        { key: 'count', label: 'Deals', num: true, get: function (g) { return g.count; },
          render: function (g) { return U.count(g.count); } },
        { key: 'toOpportunity', label: 'Lead → deal', num: true,
          get: function (g) { return g.toOpportunity == null ? -1 : g.toOpportunity; },
          render: function (g) { return pctText(g.toOpportunity); } },
        { key: 'qualifiedValue', label: 'Ready to forecast', num: true, get: function (g) { return g.qualifiedValue; },
          render: function (g) { return g.qualifiedValue ? U.money(g.qualifiedValue) : '<span class="muted">—</span>'; } },
        { key: 'pipeline', label: 'In Play', num: true, get: function (g) { return g.pipeline; },
          render: function (g) { return U.money(g.pipeline); } },
        { key: 'pipelinePerLead', label: 'In Play / lead', num: true, get: function (g) { return g.pipelinePerLead; },
          render: function (g) { return U.money(g.pipelinePerLead); } },
        { key: 'closed', label: 'Business Won', num: true, get: function (g) { return g.closed; },
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
      { key: 'pipeline', label: 'In Play', num: true, get: function (g) { return g.pipeline; },
        render: function (g) { return U.money(g.pipeline); } },
      { key: 'closed', label: 'Business Won', num: true, get: function (g) { return g.closed; },
        render: function (g) { return g.closed ? U.money(g.closed) : '<span class="muted">—</span>'; } },
      { key: 'winRate', label: 'Win rate', num: true, get: function (g) { return g.winRate == null ? -1 : g.winRate; },
        render: function (g) { return g.winRate == null ? '<span class="muted">—</span>' : pctText(g.winRate); } },
      { key: 'avgWon', label: 'Avg won deal', num: true, get: function (g) { return g.avgWon || 0; },
        render: function (g) { return g.avgWon ? U.money(g.avgWon) : '<span class="muted">—</span>'; } },
      { key: 'avgDays', label: 'Avg. days to close', num: true,
        get: function (g) { return g.avgDays == null ? 1e9 : g.avgDays; },
        render: function (g) { return g.avgDays == null ? '<span class="muted">—</span>' : Math.round(g.avgDays) + 'd'; } }
    ];
  }

  function segmentSheet(name, label, groups) {
    return { name: name, rows: groups, columns: [
      { label: label, get: function (g) { return g.key; } },
      { label: 'Schools', type: 'number', get: function (g) { return g.schools; } },
      { label: 'Students', type: 'number', get: function (g) { return g.students; } },
      { label: 'Potential deals', type: 'number', get: function (g) { return g.count; } },
      { label: 'In Play', type: 'money', get: function (g) { return g.pipeline; } },
      { label: 'Business Won', type: 'money', get: function (g) { return g.closed; } },
      { label: 'Win rate %', type: 'percent', get: function (g) { return g.winRate; } },
      { label: 'Avg won deal', type: 'money', get: function (g) { return g.avgWon; } },
      { label: 'Avg. days to close', type: 'number', get: function (g) { return g.avgDays; } }
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
    var dims = { board: 'Board', region: 'Region', offering: 'Offering',
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
        UI.stat({ cls: 'stat-hero', label: 'Avg. days to close',
                  value: speed.avg == null ? '—' : Math.round(speed.avg) + 'd',
                  foot: speed.n ? 'across ' + speed.n + ' won deals' : 'no business won yet',
                  title: 'Average of (won date − the day the deal was created).' }),
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
              UI.stat({ small: true, label: 'Avg. days to close',
                        value: profile.avgDays == null ? '—' : Math.round(profile.avgDays) + 'd' }) +
            '</div>')
        : '<div class="empty">A winning profile needs at least ' + profile.need + ' won opportunities to mean anything. ' +
          'There ' + (profile.have === 1 ? 'is' : 'are') + ' ' + profile.have + ' so far — the profile appears automatically once the ' +
          (profile.need - profile.have) + ' remaining close.</div>') +

      '<div class="section-title">Where revenue is getting stuck</div>' +
      '<div class="grid">' +
        UI.card('Top blockers by urgency', 'Ranked by business at risk × how long it has been stuck',
          blockers.length
            ? '<ol class="blockers">' + blockers.slice(0, 5).map(function (bl) {
                return '<li><button type="button" data-blocker="' + U.esc(bl.key) + '">' +
                  '<span class="bl-name">' + U.esc(bl.key) + '</span>' +
                  '<span class="bl-n">' + U.esc(U.count(bl.schools)) +
                    '<small>' + (bl.schools === 1 ? 'school' : 'schools') + '</small></span>' +
                  '<span class="bl-v">' + U.esc(U.money(bl.value)) + '<small>business</small></span>' +
                '</button></li>';
              }).join('') + '</ol>'
            : '<div class="empty">No blockers recorded on open deals.</div>') +
      '</div>' +
      (blockers.length && blockers.every(function (x) { return !x.weightedKnown; })
        ? '<p class="small muted">Ranked by business at risk × how long it has been stuck. ' +
          'No likelihood has been recorded on any connect yet, so the ranking uses the full ' +
          'business value rather than value × likelihood.</p>'
        : '') +

      '<div class="section-title">Schools that look like a Robobox win' +
        '<span class="st-sub">fit basis: ' + U.esc(fit.basis) +
        (fit.useWinRate ? '' : ' — switches to win rate after ' + fit.need + ' deals are won') + '</span></div>' +
      '<div class="fitcards">' + looks.slice(0, 8).map(function (r) {
        return '<button type="button" class="fitcard" data-fit="' + U.esc(r.school.id) + '">' +
          '<span class="fit-score' + (r.fit >= 75 ? ' is-strong' : '') + '">' + r.fit + '</span>' +
          '<span class="fit-body"><strong>' + U.esc(r.school.name) + '</strong>' +
          '<small>' + U.esc([r.school.region, r.school.board,
            r.school.students ? U.count(r.school.students) + ' students' : null].filter(Boolean).join(' · ')) + '</small>' +
          '<span class="fit-meta">' + U.esc(U.money(r.value)) + ' · ' + U.esc(r.action) + '</span></span>' +
        '</button>';
      }).join('') + '</div>' +
      '<div id="look"></div>' +

      (att.length ? '<div class="section-title">Needs Action · ' + att.length + '</div><div id="att"></div>' : '');

    bind(host, function () { win(host); }, function () {
      return [
        segmentSheet('Sales cycle by ' + dims[cycleDim], dims[cycleDim], cycle),
        { name: 'Blockers', rows: blockers, columns: [
          { label: 'Blocker', width: 28, get: function (b) { return b.key; } },
          { label: 'Business at risk', type: 'money', get: function (b) { return b.atRisk; } },
          { label: 'Business value', type: 'money', get: function (b) { return b.value; } },
          { label: 'Potential deals', type: 'number', get: function (b) { return b.count; } },
          { label: 'Avg days stuck', type: 'number', get: function (b) { return b.avgStuck; } },
          { label: 'Share of business %', type: 'percent', get: function (b) { return b.share; } },
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
          { label: 'Next Step', get: function (r) { return r.action; } },
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
    if (strip) strip.addEventListener('click', function () { UI.drill('Needs Action', att.map(function (i) { return i.v; })); });
    if (att.length) attentionTable(host.querySelector('#att'), att);
    host.querySelectorAll('[data-blocker]').forEach(function (el) {
      el.addEventListener('click', function () {
        var bl = blockers.filter(function (x) { return x.key === el.getAttribute('data-blocker'); })[0];
        if (bl) UI.drill(bl.key, bl.rows);
      });
    });
    host.querySelectorAll('[data-fit]').forEach(function (el) {
      el.addEventListener('click', function () {
        var l = looks.filter(function (x) { return x.school.id === el.getAttribute('data-fit'); })[0];
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
