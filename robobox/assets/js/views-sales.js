/* Robobox Sales OS - the sales team's screens.
 * Everything here is scoped by RB.auth.visibleSchools(), so a rep only ever
 * sees their own accounts and the head of sales sees the team's.
 */
window.RB = window.RB || {};

RB.viewsSales = (function () {
  'use strict';

  var U = RB.util, M = RB.metrics, C = RB.charts, UI = RB.ui;

  function rows() { return RB.auth.visibleSchools(); }
  function settings() { return RB.store.settings(); }
  function opts() { return { tamRate: settings().tamRatePerStudent, stalledAfterDays: settings().stalledAfterDays }; }

  function head(title, sub, actions) {
    return '<div class="page-head"><div><h1>' + U.esc(title) + '</h1><p>' + U.esc(sub) + '</p></div>' +
      (actions ? '<div class="spacer">' + actions + '</div>' : '') + '</div>';
  }

  function bindCommon(host) {
    host.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { UI.schoolDetail(b.getAttribute('data-open')); });
    });
    host.querySelectorAll('[data-log]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); UI.logActivityForm(b.getAttribute('data-log')); });
    });
    host.querySelectorAll('[data-new-school]').forEach(function (b) {
      b.addEventListener('click', function () { UI.schoolForm(null); });
    });
  }

  /* =========================================================== MY DAY ==== */
  function myDay(host) {
    var mine = rows();
    var s = M.summarise(mine, opts());
    var limit = settings().stalledAfterDays;
    var user = RB.auth.user();

    var overdue = U.sortBy(mine.filter(M.isOverdue), function (r) { return r.nextActionDate; }, 'asc');
    var dueSoon = U.sortBy(mine.filter(function (r) { return M.dueWithin(r, 7) && !M.isOverdue(r); }), function (r) { return r.nextActionDate; }, 'asc');
    var quiet = U.sortBy(mine.filter(function (r) { return M.isStalled(r, limit) && !M.isOverdue(r); }), M.dealSize, 'desc');
    var noPlan = mine.filter(function (r) { return M.isOpen(r) && M.isWorking(r) && !r.nextAction; });

    var acts30 = [];
    mine.forEach(function (r) {
      r.activities.forEach(function (a) { if (U.daysSince(a.date) <= 30) acts30.push(a); });
    });

    host.innerHTML =
      head('Good to see you, ' + user.name,
           'Everything you owe someone a follow-up on, in one place.',
           '<button class="btn" data-new-school>+ Add a school</button>') +

      UI.statRow([
        UI.stat({ label: 'Open pipeline', value: U.money(s.openValue), foot: '<span class="sec">' + s.openCount + ' quantified deals of ' + s.openAll + ' open</span>' }),
        UI.stat({ label: 'Weighted forecast', value: U.money(s.weighted), foot: '<span class="sec">stage-adjusted</span>' }),
        UI.stat({ label: 'Overdue follow-ups', value: U.count(overdue.length), tone: overdue.length ? 'critical' : null,
                  foot: '<span class="sec">' + U.money(U.sum(overdue, M.dealSize)) + ' at risk</span>' }),
        UI.stat({ label: 'Gone quiet', value: U.count(s.stalled.length), tone: s.stalled.length ? 'serious' : null,
                  foot: '<span class="sec">no contact in ' + limit + '+ days</span>' }),
        UI.stat({ label: 'Updates logged (30d)', value: U.count(acts30.length),
                  foot: '<span class="sec">' + acts30.filter(function (a) { return /Meeting|Visit|Demo/.test(a.type); }).length + ' were meetings</span>' })
      ]) +

      '<div class="grid grid-2">' +
        listCard('Overdue — do these first', overdue, 'Nothing overdue. Good.', 'critical') +
        listCard('Coming up this week', dueSoon, 'Nothing scheduled in the next 7 days.', 'accent') +
      '</div>' +

      '<div class="grid grid-2" style="margin-top:16px">' +
        listCard('Gone quiet — biggest first', quiet, 'Everything has been touched recently.', 'serious') +
        (noPlan.length
          ? '<div class="card"><div class="card-head"><h3>No next step written down</h3>' +
            '<span class="card-sub">' + noPlan.length + ' accounts</span></div>' +
            '<p class="sec small" style="margin-top:0">These cannot be forecast until someone says what happens next.</p>' +
            noPlan.slice(0, 10).map(schoolLine).join('') + '</div>'
          : '<div class="card"><div class="card-head"><h3>Next steps</h3></div><div class="empty">Every live account has a next step. Nice.</div></div>') +
      '</div>';

    bindCommon(host);
  }

  function listCard(title, list, emptyMsg, tone) {
    return '<div class="card"><div class="card-head"><h3>' + U.esc(title) + '</h3>' +
      '<span class="card-sub">' + list.length + ' account' + (list.length === 1 ? '' : 's') + '</span>' +
      (list.length ? '<span class="spacer"></span><span class="tag tag-' + tone + '">' + U.money(U.sum(list, M.dealSize)) + '</span>' : '') +
      '</div>' +
      (list.length ? list.slice(0, 10).map(schoolLine).join('') : '<div class="empty">' + U.esc(emptyMsg) + '</div>') +
      (list.length > 10 ? '<p class="small muted" style="margin:10px 0 0">+ ' + (list.length - 10) + ' more in My Pipeline.</p>' : '') +
      '</div>';
  }

  function schoolLine(s) {
    return '<div class="row wrap" style="padding:9px 0;border-bottom:1px solid var(--grid);gap:10px">' +
      '<div style="flex:1;min-width:180px">' +
        '<button class="btn-ghost" data-open="' + U.esc(s.id) + '" style="padding:0;font-weight:600;cursor:pointer;text-align:left">' + U.esc(s.name) + '</button>' +
        '<div class="small muted">' + U.esc([s.location, s.owners.join('/')].filter(Boolean).join(' · ')) +
        (s.nextAction ? ' — ' + U.esc(C.truncate(s.nextAction, 44)) : '') + '</div>' +
      '</div>' +
      '<div class="small tnum sec nowrap">' + (s.dealSize ? U.money(s.dealSize) : '—') + '</div>' +
      '<div class="small nowrap">' + (s.nextActionDate
          ? (M.isOverdue(s) ? '<span class="tag tag-critical">' + U.esc(U.fmtDate(s.nextActionDate)) + '</span>'
                            : '<span class="muted">' + U.esc(U.fmtDate(s.nextActionDate)) + '</span>')
          : '<span class="muted">' + U.esc(U.relative(s.lastContacted)) + '</span>') + '</div>' +
      '<button class="btn btn-sm" data-log="' + U.esc(s.id) + '">Log</button>' +
      '</div>';
  }

  /* ======================================================= MY PIPELINE ==== */
  var pipeState = { q: '', stage: '', region: '', health: '', owner: '' };

  function myPipeline(host) {
    var canSeeTeam = RB.auth.scope() !== 'own';
    var owners = U.uniq(RB.store.all().reduce(function (a, s) { return a.concat(s.owners); }, [])).sort();

    host.innerHTML =
      head(canSeeTeam ? 'Team pipeline' : 'My pipeline',
           canSeeTeam ? 'Every account the team owns. Click a row to open it.' : 'Every account assigned to you. Click a row to open it.',
           '<button class="btn" data-new-school>+ Add a school</button>' +
           '<button class="btn" id="export-pipeline">Download CSV</button>') +
      '<div class="filters">' +
        '<input id="f-q" class="input" style="width:210px" type="search" placeholder="Search school or contact" value="' + U.esc(pipeState.q) + '">' +
        '<span class="filter-label">Stage</span>' + UI.select('stage', M.STAGE_KEYS, pipeState.stage, { placeholder: 'All' }) +
        '<span class="filter-label">Region</span>' + UI.select('region', M.REGIONS, pipeState.region, { placeholder: 'All' }) +
        (canSeeTeam ? '<span class="filter-label">Owner</span>' + UI.select('owner', owners, pipeState.owner, { placeholder: 'All' }) : '') +
        '<span class="filter-label">Health</span>' +
          UI.select('health', ['Overdue', 'Gone quiet', 'On track', 'Open', 'Won', 'Lost'], pipeState.health, { placeholder: 'All' }) +
        '<span class="spacer"></span><button class="btn btn-sm btn-ghost" id="f-clear">Clear</button>' +
      '</div>' +
      '<div id="pipe-summary" class="stats"></div>' +
      '<div id="pipe-table"></div>';

    host.querySelectorAll('.filters select, .filters input').forEach(function (c) {
      var name = c.id === 'f-q' ? 'q' : c.getAttribute('name');
      c.addEventListener(c.tagName === 'SELECT' ? 'change' : 'input', U.debounce(function () {
        pipeState[name] = c.value;
        draw();
      }, c.tagName === 'SELECT' ? 0 : 220));
    });
    host.querySelector('#f-clear').addEventListener('click', function () {
      pipeState = { q: '', stage: '', region: '', health: '', owner: '' };
      myPipeline(host);
    });
    host.querySelector('#export-pipeline').addEventListener('click', function () {
      UI.exportSchools(filtered(), 'robobox-my-pipeline-' + U.iso(U.today()) + '.csv');
    });
    bindCommon(host);
    draw();

    function filtered() {
      var limit = settings().stalledAfterDays;
      var q = pipeState.q.trim().toLowerCase();
      return rows().filter(function (s) {
        if (q) {
          var hay = [s.name, s.location, s.region, s.decisionMaker, s.opportunity, s.nextAction, s.remarks].join(' ').toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        if (pipeState.stage && M.stage(s) !== pipeState.stage) return false;
        if (pipeState.region && s.region !== pipeState.region) return false;
        if (pipeState.owner && s.owners.indexOf(pipeState.owner) === -1) return false;
        switch (pipeState.health) {
          case 'Overdue': return M.isOverdue(s);
          case 'Gone quiet': return M.isStalled(s, limit);
          case 'On track': return M.isOpen(s) && !M.isOverdue(s) && !M.isStalled(s, limit);
          case 'Open': return M.isOpen(s);
          case 'Won': return M.isWon(s);
          case 'Lost': return M.isLost(s);
        }
        return true;
      });
    }

    function draw() {
      var list = filtered();
      var s = M.summarise(list, opts());
      host.querySelector('#pipe-summary').innerHTML = [
        UI.stat({ label: 'Accounts', value: U.count(list.length), small: true }),
        UI.stat({ label: 'Open value', value: U.money(s.openValue), small: true }),
        UI.stat({ label: 'Weighted', value: U.money(s.weighted), small: true }),
        UI.stat({ label: 'Needs attention', value: U.count(s.overdue.length + s.stalled.length), small: true,
                  tone: (s.overdue.length + s.stalled.length) ? 'serious' : null }),
        UI.stat({ label: 'Record completeness', value: Math.round(s.hygiene) + '%', small: true })
      ].join('');

      UI.table(host.querySelector('#pipe-table'), {
        rows: list,
        columns: UI.schoolColumns({ hide: RB.auth.scope() === 'own' ? ['owner'] : [] }).concat([
          { key: 'actions', label: '', sortable: false, get: function () { return ''; },
            render: function (s) { return '<button class="btn btn-sm" data-log="' + U.esc(s.id) + '">Log</button>'; } }
        ]),
        rowId: function (r) { return r.id; },
        sortKey: 'weighted',
        onRowClick: function (id) { UI.schoolDetail(id); },
        empty: 'No accounts match these filters.'
      });
      bindCommon(host.querySelector('#pipe-table'));
    }
  }

  /* ======================================================= ACTIVITY LOG === */
  function myActivity(host) {
    var me = RB.auth.user();
    var scopeAll = RB.auth.scope() !== 'own';
    var acts = RB.store.activities(function (a, s) {
      return scopeAll ? true : (a.by === me.id || s.owners.indexOf(me.ownerKey) !== -1);
    });
    acts = U.sortBy(acts, function (a) { return a.date; }, 'desc');

    host.innerHTML =
      head('Activity log', scopeAll ? 'Every update the team has logged.' : 'Every update you have logged.',
           '<button class="btn" id="export-acts">Download CSV</button>') +
      (acts.length ? '' : '<div class="insight"><span class="insight-ico">💡</span><div><strong>Nothing logged yet</strong>' +
        '<p>Open any account and hit “Log an update”. Each entry moves the stage, sets the next step and refreshes the last-contact date automatically — nobody has to touch the spreadsheet.</p></div></div>') +
      '<div id="act-table"></div>';

    host.querySelector('#export-acts').addEventListener('click', function () { UI.exportActivities(acts); });

    UI.table(host.querySelector('#act-table'), {
      rows: acts,
      rowId: function (a) { return a.schoolId; },
      sortKey: 'date',
      onRowClick: function (id) { UI.schoolDetail(id); },
      empty: 'No updates logged yet.',
      columns: [
        { key: 'date', label: 'Date', get: function (a) { return a.date; },
          render: function (a) { return '<span class="nowrap">' + U.esc(U.fmtDate(a.date)) + '</span><div class="small muted">' + U.esc(U.relative(a.date)) + '</div>'; } },
        { key: 'school', label: 'School', get: function (a) { return a.school.name; },
          render: function (a) { return '<span class="strong">' + U.esc(a.school.name) + '</span><div class="small muted">' + U.esc(a.school.location || '') + '</div>'; } },
        { key: 'type', label: 'Type', get: function (a) { return a.type; } },
        { key: 'contact', label: 'Contact', get: function (a) { return a.contact || '—'; } },
        { key: 'outcome', label: 'Outcome', get: function (a) { return a.outcome; },
          render: function (a) {
            var cls = a.outcome === 'Positive' ? 'tag-good' : a.outcome === 'Negative' ? 'tag-critical' : '';
            return '<span class="tag ' + cls + '">' + U.esc(a.outcome) + '</span>';
          } },
        { key: 'stage', label: 'Stage change', sortable: false, get: function (a) { return a.stageTo || ''; },
          render: function (a) {
            if (!a.stageTo || a.stageTo === a.stageFrom) return '<span class="muted">—</span>';
            return '<span class="small">' + U.esc(a.stageFrom) + ' → <strong>' + U.esc(a.stageTo) + '</strong></span>';
          } },
        { key: 'by', label: 'By', get: function (a) { var u = RB.store.userById(a.by); return u ? u.name : a.by; } },
        { key: 'notes', label: 'Notes', sortable: false, get: function (a) { return a.notes || ''; },
          render: function (a) { return a.notes ? '<span class="sec small">' + U.esc(C.truncate(a.notes, 70)) + '</span>' : '<span class="muted">—</span>'; } }
      ]
    });
  }

  /* ======================================================== MY PROGRESS === */
  function myProgress(host) {
    var mine = rows();
    var me = RB.auth.user();
    var s = M.summarise(mine, opts());
    var limit = settings().stalledAfterDays;

    var acts = [];
    mine.forEach(function (r) { r.activities.forEach(function (a) { acts.push(a); }); });
    var series = M.activitySeries(acts, 6);
    var f = M.funnel(mine);
    var conv = M.conversion(mine);

    var byStage = M.byDimension(mine, 'stage', opts());
    var byRegion = M.byDimension(mine, 'region', opts());
    var worked = mine.filter(M.isWorking);

    var weakest = U.sortBy(conv.filter(function (c) { return c.lost > 0; }), function (c) { return c.rate; }, 'asc')[0];

    host.innerHTML =
      head('My progress', 'How your pipeline is moving, and where it is getting stuck.',
           '<button class="btn" id="export-progress">Download my data</button>') +

      UI.statRow([
        UI.stat({ label: 'Accounts owned', value: U.count(mine.length),
                  foot: '<span class="sec">' + U.count(s.students) + ' students</span>' }),
        UI.stat({ label: 'Open pipeline', value: U.money(s.openValue),
                  foot: '<span class="sec">' + s.openCount + ' quantified deals</span>' }),
        UI.stat({ label: 'Weighted forecast', value: U.money(s.weighted),
                  foot: '<span class="sec">avg deal ' + U.money(s.avgDeal) + '</span>' }),
        UI.stat({ label: 'Won', value: U.money(s.wonValue),
                  foot: '<span class="sec">' + s.wonCount + ' deals' + (s.winRate === null ? '' : ' · ' + Math.round(s.winRate) + '% win rate') + '</span>' }),
        UI.stat({ label: 'Record completeness', value: Math.round(s.hygiene) + '%',
                  tone: s.hygiene < 60 ? 'critical' : s.hygiene < 85 ? 'warning' : null,
                  foot: '<span class="sec">' + worked.length + ' worked accounts</span>' })
      ]) +

      '<div class="grid grid-2">' +
        card('Your funnel', 'Cumulative — an account at Proposal also counts at every stage below it.',
             C.funnel({ data: f, format: U.money })) +
        card('Updates you logged', 'Last six months, by outcome.',
             acts.length
               ? C.line({
                   labels: series.map(function (m) { return U.monthLabel(m.key); }),
                   series: [
                     { label: 'Positive', color: 'var(--series-1)', points: series.map(function (m) { return { y: m.Positive }; }) },
                     { label: 'Neutral', color: 'var(--series-2)', points: series.map(function (m) { return { y: m.Neutral }; }) },
                     { label: 'Negative', color: 'var(--series-3)', points: series.map(function (m) { return { y: m.Negative + m['No response'] }; }) }
                   ],
                   height: 230
                 })
               : '<div class="empty">Log your first update and this chart starts filling in.</div>') +
      '</div>' +

      '<div class="grid grid-2" style="margin-top:16px">' +
        card('Where your pipeline value sits', 'Open deal value by stage.',
             C.hbar({ data: byStage.map(function (g) { return { key: g.key, value: g.openValue }; }),
                      format: U.money, measureLabel: 'Open value',
                      tipRows: function (d) { return [['Open value', U.money(d.value)]]; } })) +
        card('Your accounts by region', 'Schools you own in each cluster.',
             C.hbar({ data: byRegion.map(function (g) { return { key: g.key, value: g.schools }; }),
                      format: U.count, measureLabel: 'Schools',
                      tipRows: function (d) { return [['Schools', U.count(d.value)]]; } })) +
      '</div>' +

      '<div class="card" style="margin-top:16px"><div class="card-head"><h3>What to fix</h3>' +
        '<span class="card-sub">based on your own accounts</span></div>' +
        UI.insightList(personalInsights(mine, s, limit, weakest)) + '</div>' +

      '<div class="card"><div class="card-head"><h3>Records missing information</h3>' +
        '<span class="card-sub">' + s.workingCount + ' accounts you are actively working</span></div>' +
        '<div id="gap-table"></div></div>';

    host.querySelector('#export-progress').addEventListener('click', function () {
      UI.exportSchools(mine, 'robobox-' + me.id + '-' + U.iso(U.today()) + '.csv');
    });

    var gaps = U.sortBy(worked.filter(function (r) { return M.missingFields(r).length; }), M.dealSize, 'desc');
    UI.table(host.querySelector('#gap-table'), {
      rows: gaps,
      rowId: function (r) { return r.id; },
      sortKey: 'deal',
      pageSize: 10,
      onRowClick: function (id) { UI.schoolDetail(id); },
      empty: 'Every account you are working is complete. Rare and appreciated.',
      columns: [
        { key: 'name', label: 'School', get: function (r) { return r.name; },
          render: function (r) { return '<span class="strong">' + U.esc(r.name) + '</span>'; } },
        { key: 'deal', label: 'Deal size', num: true, get: function (r) { return r.dealSize || 0; },
          render: function (r) { return r.dealSize ? U.money(r.dealSize) : '<span class="muted">—</span>'; } },
        { key: 'complete', label: 'Complete', num: true, get: function (r) { return M.completeness(r); },
          render: function (r) { return UI.meter(M.completeness(r)); } },
        { key: 'missing', label: 'Missing', sortable: false, get: function (r) { return M.missingFields(r).join(', '); },
          render: function (r) { return M.missingFields(r).map(function (m) { return '<span class="tag tag-warning">' + U.esc(m) + '</span>'; }).join(' '); } },
        { key: 'go', label: '', sortable: false, get: function () { return ''; },
          render: function (r) { return '<button class="btn btn-sm" data-log="' + U.esc(r.id) + '">Fix</button>'; } }
      ]
    });
    bindCommon(host.querySelector('#gap-table'));
  }

  function personalInsights(mine, s, limit, weakest) {
    var out = [];
    if (s.overdue.length) {
      out.push({ level: 'bad', icon: '⚠️', title: s.overdue.length + ' follow-ups are past their date',
        body: U.money(U.sum(s.overdue, M.dealSize)) + ' of your pipeline is sitting past the date you set for it.' });
    }
    if (s.stalled.length) {
      out.push({ level: 'warn', icon: '⏳', title: s.stalled.length + ' accounts have gone quiet',
        body: 'No contact in over ' + limit + ' days on ' + U.money(U.sum(s.stalled, M.dealSize)) + ' of open value.' });
    }
    if (weakest && weakest.lost > 0) {
      out.push({ level: 'warn', icon: '📉', title: 'Your weakest step is ' + weakest.from + ' → ' + weakest.to,
        body: 'Only ' + Math.round(weakest.rate) + '% get through. ' + weakest.lost + ' accounts stop there, worth ' + U.money(weakest.lostValue) + '.' });
    }
    if (s.noNextAction.length) {
      out.push({ level: 'warn', icon: '❓', title: s.noNextAction.length + ' accounts have no next step',
        body: 'Write down what happens next so these can be forecast.' });
    }
    if (!out.length) {
      out.push({ level: 'good', icon: '✅', title: 'Your pipeline is clean',
        body: 'No overdue follow-ups, nothing gone quiet, and every live account has a next step.' });
    }
    return out;
  }

  function card(title, sub, body) {
    return '<div class="card"><div class="card-head"><h3>' + U.esc(title) + '</h3>' +
      (sub ? '<span class="card-sub">' + U.esc(sub) + '</span>' : '') + '</div>' + body + '</div>';
  }

  /* ========================================================= TEAM ROLLUP == */
  /* Head of sales only: the team's numbers, without the CEO's company-wide
   * market, blocker and rate-card analytics. */
  function teamRollup(host) {
    var all = rows();
    var users = RB.store.users().filter(function (u) { return u.role !== 'ceo'; });
    var cards = M.repScorecards(all, users, opts());
    var s = M.summarise(all, opts());
    var limit = settings().stalledAfterDays;

    host.innerHTML =
      head('Team roll-up', 'How the sales team is tracking. Click any rep to filter the pipeline.',
           '<button class="btn" id="export-team">Download team data</button>') +
      UI.statRow([
        UI.stat({ label: 'Team open pipeline', value: U.money(s.openValue), foot: '<span class="sec">' + s.openCount + ' quantified deals</span>' }),
        UI.stat({ label: 'Weighted forecast', value: U.money(s.weighted) }),
        UI.stat({ label: 'Accounts gone quiet', value: U.count(s.stalled.length), tone: s.stalled.length ? 'serious' : null,
                  foot: '<span class="sec">' + U.money(U.sum(s.stalled, M.dealSize)) + '</span>' }),
        UI.stat({ label: 'Unassigned schools', value: U.count(all.filter(function (r) { return !r.owners.length; }).length),
                  tone: 'warning' }),
        UI.stat({ label: 'Record completeness', value: Math.round(s.hygiene) + '%' })
      ]) +
      '<div class="grid grid-2">' +
        card('Open pipeline by rep', 'Value of everything still live.',
             C.hbar({ data: U.sortBy(cards, function (c) { return c.openValue; }, 'desc').map(function (c) { return { key: c.user.name, value: c.openValue }; }),
                      format: U.money, measureLabel: 'Open value' })) +
        card('Accounts gone quiet by rep', 'No contact in over ' + limit + ' days.',
             C.hbar({ data: U.sortBy(cards, function (c) { return c.stalled.length; }, 'desc').map(function (c) { return { key: c.user.name, value: c.stalled.length }; }),
                      format: U.count, measureLabel: 'Accounts',
                      color: function () { return 'var(--serious)'; } })) +
      '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card-head"><h3>Rep scorecards</h3></div><div id="rep-table"></div></div>';

    host.querySelector('#export-team').addEventListener('click', function () { UI.exportSchools(all, 'robobox-team-' + U.iso(U.today()) + '.csv'); });

    UI.table(host.querySelector('#rep-table'), {
      rows: cards, rowId: function (c) { return c.user.id; }, sortKey: 'open', pageSize: 20,
      empty: 'No reps configured.',
      columns: repColumns()
    });
  }

  function repColumns() {
    return [
      { key: 'name', label: 'Rep', get: function (c) { return c.user.name; },
        render: function (c) { return '<span class="strong">' + U.esc(c.user.name) + '</span><div class="small muted">' + U.esc(RB.auth.roleLabel(c.user.role)) + '</div>'; } },
      { key: 'accounts', label: 'Accounts', num: true, get: function (c) { return c.schools; },
        render: function (c) { return U.count(c.schools); } },
      { key: 'open', label: 'Open pipeline', num: true, get: function (c) { return c.openValue; },
        render: function (c) { return U.money(c.openValue); } },
      { key: 'weighted', label: 'Weighted', num: true, get: function (c) { return c.weighted; },
        render: function (c) { return U.money(c.weighted); } },
      { key: 'avg', label: 'Avg deal', num: true, get: function (c) { return c.avgDeal; },
        render: function (c) { return U.money(c.avgDeal); } },
      { key: 'acts', label: 'Updates', num: true, get: function (c) { return c.activityCount; },
        render: function (c) { return U.count(c.activityCount) + '<div class="small muted">' + c.meetingCount + ' meetings</div>'; } },
      { key: 'stalled', label: 'Gone quiet', num: true, get: function (c) { return c.stalledPct; },
        render: function (c) { return '<span class="' + (c.stalledPct > 50 ? 'delta-down' : '') + '">' + Math.round(c.stalledPct) + '%</span>' +
          '<div class="small muted">' + c.stalled.length + ' accounts</div>'; } },
      { key: 'hygiene', label: 'Data quality', num: true, get: function (c) { return c.hygiene; },
        render: function (c) { return UI.meter(c.hygiene / 100); } },
      { key: 'last', label: 'Last update', num: true, get: function (c) { return c.lastActivity ? -U.daysSince(c.lastActivity) : -99999; },
        render: function (c) { return c.lastActivity ? U.esc(U.relative(c.lastActivity)) : '<span class="muted">never</span>'; } }
    ];
  }

  return {
    myDay: myDay, myPipeline: myPipeline, myActivity: myActivity, myProgress: myProgress,
    teamRollup: teamRollup, card: card, head: head, repColumns: repColumns, bindCommon: bindCommon
  };
})();
