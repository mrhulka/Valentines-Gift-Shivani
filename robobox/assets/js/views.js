/* Robobox Connect - every screen. */
window.RB = window.RB || {};

RB.views = (function () {
  'use strict';

  var U = RB.util, M = RB.model, UI = RB.ui, C = RB.charts, V = RB.model.V;

  var F = RB.filters;

  /* Every data screen gets the same filter bar and the same export button.
   * `scope` returns the views the screen is about; the export always reflects
   * exactly what is on screen, filters included. */
  function toolbar(views, exportId) {
    var on = F.active().length;
    return '<div class="toolbar">' +
      '<details class="filter-drop"' + (on ? ' open' : '') + '>' +
        '<summary>Filters' + (on ? ' <span class="filter-count">' + on + '</span>' : '') + '</summary>' +
        F.bar(views) +
      '</details>' +
      '<button class="btn btn-sm" id="' + exportId + '">↓ Export Excel</button>' +
      (on ? '<span class="small muted">' + U.esc(F.describe()) + '</span>' : '') +
    '</div>';
  }

  function bindToolbar(host, exportId, redraw, buildSheets, filename) {
    F.bind(host, redraw);
    var b = host.querySelector('#' + exportId);
    if (b) b.addEventListener('click', function () {
      RB.excel.download(filename, buildSheets(), { filters: F.describe() });
    });
  }

  function me() { return RB.auth.user(); }
  function myKey() { return me().ownerKey; }
  function scopeKey() { return me().role === 'sales' ? myKey() : null; }

  /* ============================================================ MY DAY ==== */
  function myDay(host) {
    var key = myKey();
    var sc = M.scorecard({ ownerKey: key, range: M.RANGES()['Today'] });
    var all = M.scorecard({ ownerKey: key });
    var ts = M.tasks(me().id);
    var buckets = { Overdue: [], Today: [], Upcoming: [] };
    ts.forEach(function (t) { buckets[t.bucket].push(t); });

    host.innerHTML =
      UI.head('Hello, ' + me().name,
              U.fmtDate(U.iso(U.today())) + ' · tell the system what you just did.') +

      UI.stats([
        UI.stat({ cls: 'stat-brand', label: 'Connects today', value: U.count(sc.totalConnects),
                  foot: sc.newConnects + ' new · ' + sc.reconnects + ' reconnect' }),
        UI.stat({ label: 'Overdue', value: U.count(buckets.Overdue.length),
                  cls: buckets.Overdue.length ? 'stat-red' : '', footBad: !!buckets.Overdue.length,
                  foot: buckets.Overdue.length ? 'needs attention today' : 'all clear',
                  onClick: 'overdue' }),
        UI.stat({ label: 'Due today', value: U.count(buckets.Today.length), onClick: 'today' }),
        UI.stat({ cls: 'stat-hero', label: 'Business in Play', value: U.money(all.activePipeline),
                  foot: all.activeCount + ' opportunities' }),
        UI.stat({ label: 'Business Won', value: U.money(all.closedRevenue),
                  foot: all.wonCount + ' won' })
      ]) +

      (buckets.Overdue.length ? '<div class="section-title">Overdue</div>' + taskList(buckets.Overdue) : '') +
      '<div class="section-title">Today</div>' +
      (buckets.Today.length ? taskList(buckets.Today) : '<div class="empty">Nothing due today.</div>') +
      (buckets.Upcoming.length ? '<div class="section-title">Coming up</div>' + taskList(buckets.Upcoming.slice(0, 8)) : '');
    bindTasks(host);
    bindStats(host, { overdue: ['Overdue', buckets.Overdue], today: ['Due today', buckets.Today] }, true);
  }

  function taskList(tasks) {
    return tasks.map(function (t) {
      return '<div class="task ' + (t.bucket === 'Overdue' ? 'overdue' : t.bucket === 'Today' ? 'today' : '') + '">' +
        '<div class="task-main"><strong>' + U.esc(t.title) + '</strong>' +
        '<small>' + U.esc([t.offering, t.due ? U.fmtDate(t.due.slice(0, 10)) + ' ' + t.due.slice(11, 16) : 'no date',
                           U.money(t.value)].filter(Boolean).join(' · ')) + '</small></div>' +
        '<div class="task-right">' +
        '<button class="btn btn-sm" data-open-school="' + U.esc(t.schoolId) + '">School</button>' +
        '<button class="btn btn-dark btn-sm" data-log-opp="' + U.esc(t.opportunityId) + '">Connect</button>' +
        '</div></div>';
    }).join('');
  }

  function bindTasks(host) {
    host.querySelectorAll('[data-log-opp]').forEach(function (b) {
      b.addEventListener('click', function () {
        RB.connectForm.open({ opportunityId: b.getAttribute('data-log-opp') });
      });
    });
    host.querySelectorAll('[data-open-school]').forEach(function (b) {
      b.addEventListener('click', function () { school(b.getAttribute('data-open-school')); });
    });
  }

  function bindStats(host, map, asTasks) {
    host.querySelectorAll('[data-stat]').forEach(function (b) {
      b.addEventListener('click', function () {
        var hit = map[b.getAttribute('data-stat')];
        if (!hit) return;
        if (asTasks) UI.drill(hit[0], hit[1].map(function (t) { return t.view; }));
        else UI.drill(hit[0], hit[1]);
      });
    });
  }

  /* ============================================================= TASKS ==== */
  function myTasks(host) {
    var ts = M.tasks(me().id);
    var b = { Overdue: [], Today: [], Upcoming: [] };
    ts.forEach(function (t) { b[t.bucket].push(t); });
    // "Completed" is not stored: an opportunity that closed, or whose latest
    // Connect superseded the task, simply stops appearing above.
    var closed = M.views().filter(function (v) {
      return v.owner === myKey() && v.status !== 'Open';
    });

    host.innerHTML = UI.head('My tasks', 'Generated from your Connects. Finish one by logging the next Connect.') +
      ['Overdue', 'Today', 'Upcoming'].map(function (k) {
        return '<div class="section-title">' + k + ' · ' + b[k].length + '</div>' +
          (b[k].length ? taskList(b[k]) : '<div class="empty">Nothing ' + k.toLowerCase() + '.</div>');
      }).join('') +
      '<div class="section-title">Closed · ' + closed.length + '</div>' +
      (closed.length
        ? closed.slice(0, 12).map(function (v) {
            return '<div class="task"><div class="task-main"><strong>' +
              U.esc(v.school.name) + ' — ' + U.esc(v.opp.offering || '') + '</strong>' +
              '<small>' + U.esc(v.stage + ' · ' + U.money(v.current) +
                (v.opp.lossReason ? ' · ' + v.opp.lossReason : '')) + '</small></div>' +
              '<div class="task-right">' + UI.stageTag(v) + '</div></div>';
          }).join('')
        : '<div class="empty">Nothing closed yet.</div>');
    bindTasks(host);
  }

  /* ========================================================== CALENDAR ==== */
  /* A month, not a scroll of 21 days. The badge on a day is how many next
   * actions fall on it, so the busy days are visible before you click one. */
  var calMonth = null, calDay = null;

  function myCalendar(host) {
    var today = U.iso(U.today());
    var month = calMonth || today.slice(0, 7);
    var day = calDay || today;
    var byDay = {};
    M.tasks(me().id).forEach(function (t) {
      if (!t.due) return;
      var d = t.due.slice(0, 10);
      (byDay[d] = byDay[d] || []).push(t);
    });
    var items = byDay[day] || [];

    host.innerHTML = UI.head('My calendar', 'Built from the next step on every Connect. Nothing to add by hand.') +
      '<div class="grid grid-2">' +
        UI.card('Month', 'The number on a day is how many next steps fall on it',
          UI.monthGrid({ month: month, selected: day,
            get: function (iso) {
              var n = (byDay[iso] || []).length;
              return { n: n, title: n ? n + ' next step' + (n === 1 ? '' : 's') : '' };
            } })) +
        UI.card(U.fmtDate(day) + (day === today ? ' · today' : ''),
          items.length + ' next step' + (items.length === 1 ? '' : 's'),
          items.length ? taskList(items) : '<div class="cal-empty">Nothing due on this day.</div>') +
      '</div>';
    UI.bindMonthGrid(host,
      function (d) { calDay = d; calMonth = d.slice(0, 7); myCalendar(host); },
      function (n) { calMonth = U.shiftMonth(month, n); myCalendar(host); });
    bindTasks(host);
  }

  /* ======================================================= MY PERFORMANCE ==== */
  /* Four numbers, each against the target the CEO set, then the five next
   * steps that matter most. Nothing else — a rep does not need a funnel. */
  var scoreRange = 'This month';

  function myScorecard(host) {
    var key = myKey();
    var range = M.RANGES()[scoreRange];
    var rows = M.performanceOf(key, range, F.apply);
    var steps = M.topSteps(me().id, 5);
    var noTarget = rows.every(function (r) { return !r.target; });

    host.innerHTML = UI.head('My Performance',
      'What you did ' + scoreRange.toLowerCase() + ', against target.') +
      rangeBar(scoreRange) +

      '<div class="kpis kpis-4">' + rows.map(function (r) {
        var val = r.money ? U.money(r.actual) : U.count(r.actual);
        var tone = r.pct == null ? '' : r.pct >= 100 ? '' : r.pct < 50 ? 'is-risk' : 'is-warn';
        if (r.key === 'businessWon') tone += ' kpi-dark';
        return '<div class="kpi ' + tone + '">' +
          '<span class="kpi-label">' + U.esc(r.label) + '</span>' +
          '<span class="kpi-value">' + U.esc(val) + '</span>' +
          (r.target
            ? '<span class="kpi-foot">of ' + U.esc(r.money ? U.money(r.target) : U.count(r.target)) +
              ' target · ' + Math.round(r.pct) + '%</span>' +
              '<span class="meter"><span style="width:' + Math.min(100, r.pct) + '%"></span></span>'
            : '<span class="kpi-foot">no target set</span>') +
        '</div>';
      }).join('') + '</div>' +

      (noTarget
        ? '<p class="small muted">Targets are set once by the CEO in Settings and apply to everyone.</p>'
        : '') +

      '<div class="section-title">My Actions<span class="st-sub">the 5 that matter most</span></div>' +
      (steps.length ? taskList(steps) : '<div class="empty">Nothing outstanding.</div>');
    bindRange(host, function (r) { scoreRange = r; myScorecard(host); });
    bindTasks(host);
  }

  function rangeBar(current) {
    return '<div class="filters"><div class="seg">' +
      Object.keys(M.RANGES()).map(function (k) {
        return '<button type="button" data-range="' + U.esc(k) + '" aria-pressed="' + (k === current) + '">' +
          U.esc(k) + '</button>';
      }).join('') + '</div></div>';
  }

  function bindRange(host, fn) {
    host.querySelectorAll('[data-range]').forEach(function (b) {
      b.addEventListener('click', function () { fn(b.getAttribute('data-range')); });
    });
  }

  /* ======================================================== MY SCHOOLS ==== */
  function mySchools(host) {
    var key = scopeKey();
    var all = M.views().filter(function (v) { return !key || v.owner === key; });
    var vs = F.apply(all);

    host.innerHTML = UI.head(key ? 'My schools' : 'All schools',
      U.count(vs.length) + ' of ' + U.count(all.length) + ' opportunities. Click a row for the full history.') +
      toolbar(all, 'x1') + '<div id="t"></div>';
    bindToolbar(host, 'x1', function () { mySchools(host); },
      function () { return [RB.excel.opportunitySheet('Opportunities', vs)]; }, 'robobox-schools');
    UI.table(host.querySelector('#t'), {
      rows: vs, rowId: function (v) { return v.opp.schoolId; }, sortKey: 'value', pageSize: 25,
      columns: UI.oppColumns(key ? { hide: ['owner'] } : {}),
      onRowClick: school, empty: 'Nothing matches these filters.'
    });
  }

  /* ======================================================= SCHOOL VIEW ==== */
  /* The institutional memory: profile, contacts, opportunities, and every
   * Connect ever logged, newest first. */
  function school(schoolId) {
    var s = RB.store.schoolById(schoolId);
    if (!s) return;
    var opps = RB.store.opportunitiesFor(schoolId).map(M.view);
    var cs = RB.store.connectsForSchool(schoolId);
    var contacts = RB.store.contactsFor(schoolId);

    var body =
      '<div class="row wrap" style="margin-bottom:16px">' +
        '<span class="tag tag-dark">' + U.esc(s.region || '—') + '</span>' +
        (s.board ? '<span class="tag">' + U.esc(s.board) + '</span>' : '') +
        (s.students ? '<span class="tag">' + U.count(s.students) + ' students</span>' : '') +
        (s.competitor && s.competitor !== 'None' ? '<span class="tag tag-red">' + U.esc(s.competitor) + '</span>' : '') +
        '<button class="btn btn-primary btn-sm" style="margin-left:auto" id="sv-log">+ Log Connect</button>' +
      '</div>' +

      '<div class="grid grid-2">' +
      '<div><div class="section-title" style="margin-top:0">Profile</div><dl class="kv">' +
        kv('Location', [s.location, s.cluster].filter(Boolean).join(' · ') || '—') +
        kv('Board', s.board || '—') +
        kv('Students', s.students ? U.count(s.students) : '—') +
        kv('Existing lab', s.existingLab || '—') +
        kv('Competitor', s.competitor || 'None') +
        kv('Lead source', s.leadSource || '—') +
        kv('Owner', s.ownerKey || 'Unassigned') +
      '</dl></div>' +
      '<div><div class="section-title" style="margin-top:0">Contacts</div>' +
        (contacts.length ? contacts.map(function (c) {
          return '<div style="padding:8px 0;border-bottom:1px solid var(--line)">' +
            '<strong>' + U.esc(c.name) + '</strong> <span class="tag">' + U.esc(c.role || '—') + '</span>' +
            (c.phone || c.email ? '<div class="small muted">' + U.esc([c.phone, c.email].filter(Boolean).join(' · ')) + '</div>' : '') +
            '</div>';
        }).join('') : '<div class="empty">No contacts recorded.</div>') +
      '</div></div>' +

      '<div class="section-title">Opportunities</div>' +
      (opps.length ? opps.map(function (v) {
        return '<div class="task"><div class="task-main">' +
          '<strong>' + U.esc(v.opp.offering || 'Opportunity') +
          (v.opp.variant ? ' · ' + U.esc(v.opp.variant) : '') + '</strong>' +
          '<small>' + U.esc('Potential ' + U.money(v.initialPotential) +
            (v.quoted != null ? ' → quoted ' + U.money(v.quoted) : '') +
            (v.negotiated != null ? ' → negotiated ' + U.money(v.negotiated) : '') +
            (v.closed != null ? ' → closed ' + U.money(v.closed) : '')) + '</small></div>' +
          '<div class="task-right">' + UI.stageTag(v) +
          '<strong class="tnum">' + U.esc(U.money(v.current)) + '</strong>' +
          (v.status === 'Open' ? '<button class="btn btn-primary btn-sm" data-log-opp="' + U.esc(v.opp.id) + '">Connect</button>' : '') +
          '</div></div>';
      }).join('') : '<div class="empty">No opportunities yet.</div>') +

      '<div class="section-title">Connect timeline · ' + cs.length + '</div>' +
      (cs.length ? '<ul class="timeline">' + cs.map(function (c) {
        var opp = RB.store.opportunityById(c.opportunityId);
        var contact = c.contactId ? RB.store.contactById(c.contactId) : null;
        var cls = c.kind === 'New' ? 'brand' : /Not Interested|Lost|No Response/.test(c.response || '') ? 'red' : '';
        return '<li class="' + cls + '"><div class="tl-head">' +
          '<strong>' + U.esc(c.mode || 'Connect') + '</strong>' +
          '<span class="tag">' + U.esc(c.response || '—') + '</span>' +
          (contact ? '<span class="small sec">' + U.esc(contact.name) + '</span>' : '') +
          '<span class="tl-date">' + U.esc(c.at ? U.fmtDate(c.at.slice(0, 10)) : (c.dateRaw || 'undated')) +
          ' · ' + U.esc(userName(c.by)) + '</span></div>' +
          (opp ? '<div class="small muted">' + U.esc(opp.offering || 'Opportunity') + '</div>' : '') +
          (c.commercial && (c.commercial.quoted != null || c.commercial.negotiated != null)
            ? '<div class="small"><strong>' +
              (c.commercial.quoted != null ? 'Quoted ' + U.money(c.commercial.quoted) : '') +
              (c.commercial.negotiated != null ? ' Negotiated ' + U.money(c.commercial.negotiated) : '') +
              '</strong></div>' : '') +
          (c.blocker && c.blocker !== 'None'
            ? '<div class="small"><span class="tag tag-red">' + U.esc(c.blocker) + '</span> ' +
              U.esc(c.blockerDetail || '') + '</div>' : '') +
          (c.notes ? '<div class="tl-body">' + U.esc(c.notes) + '</div>' : '') +
          (c.nextAction ? '<div class="small muted" style="margin-top:5px">Next: ' + U.esc(c.nextAction) +
            (c.nextActionAt ? ' · ' + U.esc(U.fmtDate(c.nextActionAt.slice(0, 10))) : '') + '</div>' : '') +
          '</li>';
      }).join('') + '</ul>' : '<div class="empty">No connects logged yet.</div>');

    UI.modal(s.name, body, {
      wide: true,
      onMount: function (h) {
        h.querySelector('#sv-log').addEventListener('click', function () {
          RB.connectForm.open({ schoolId: schoolId, kind: 'Reconnect' });
        });
        h.querySelectorAll('[data-log-opp]').forEach(function (b) {
          b.addEventListener('click', function () {
            RB.connectForm.open({ opportunityId: b.getAttribute('data-log-opp') });
          });
        });
      }
    });
  }

  function kv(k, v) { return '<dt>' + U.esc(k) + '</dt><dd>' + U.esc(v) + '</dd>'; }
  function userName(id) { var u = RB.store.userById(id); return u ? u.name : (id || '—'); }

  return {
    myDay: myDay, myTasks: myTasks, myCalendar: myCalendar, myScorecard: myScorecard,
    mySchools: mySchools, school: school
  };
})();
