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
    return F.bar(views) +
      '<div class="filters" style="margin-top:-6px">' +
      '<button class="btn btn-sm" id="' + exportId + '">↓ Export Excel</button>' +
      '<span class="small muted">' + U.esc(F.describe()) + '</span></div>';
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
              U.fmtDate(U.iso(U.today())) + ' · tell the system what you just did.',
              '<button class="btn btn-primary top-log" id="log">+ Log Connect</button>') +

      UI.stats([
        UI.stat({ cls: 'stat-brand', label: 'Connects today', value: U.count(sc.totalConnects),
                  foot: sc.newConnects + ' new · ' + sc.reconnects + ' reconnect' }),
        UI.stat({ label: 'Overdue', value: U.count(buckets.Overdue.length),
                  cls: buckets.Overdue.length ? '' : '', footBad: !!buckets.Overdue.length,
                  foot: buckets.Overdue.length ? 'needs attention today' : 'all clear',
                  onClick: 'overdue' }),
        UI.stat({ label: 'Due today', value: U.count(buckets.Today.length), onClick: 'today' }),
        UI.stat({ label: 'Active pipeline', value: U.money(all.activePipeline),
                  foot: all.activeCount + ' opportunities' }),
        UI.stat({ label: 'Closed revenue', value: U.money(all.closedRevenue),
                  foot: all.wonCount + ' won' })
      ]) +

      (buckets.Overdue.length ? '<div class="section-title">Overdue</div>' + taskList(buckets.Overdue) : '') +
      '<div class="section-title">Today</div>' +
      (buckets.Today.length ? taskList(buckets.Today) : '<div class="empty">Nothing due today.</div>') +
      (buckets.Upcoming.length ? '<div class="section-title">Coming up</div>' + taskList(buckets.Upcoming.slice(0, 8)) : '');

    host.querySelector('#log').addEventListener('click', function () { RB.connectForm.open(); });
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
        '<button class="btn btn-primary btn-sm" data-log-opp="' + U.esc(t.opportunityId) + '">Connect</button>' +
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

    host.innerHTML = UI.head('My tasks', 'Generated from your Connects. Finish one by logging the next Connect.',
      '<button class="btn btn-primary top-log" id="log">+ Log Connect</button>') +
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

    host.querySelector('#log').addEventListener('click', function () { RB.connectForm.open(); });
    bindTasks(host);
  }

  /* ========================================================== CALENDAR ==== */
  function myCalendar(host) {
    var days = M.calendar(me().id, U.iso(U.today()), 21);
    var today = U.iso(U.today());
    host.innerHTML = UI.head('My calendar', 'Built from the next action on every Connect. Nothing to add by hand.',
      '<button class="btn btn-primary top-log" id="log">+ Log Connect</button>') +
      '<div class="card">' + days.map(function (day) {
        var dt = U.parseISO(day.date);
        return '<div class="cal-day"><div class="cal-date' + (day.date === today ? ' is-today' : '') + '">' +
          U.esc(U.fmtDate(day.date)) + '<small>' +
          ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()] +
          (day.date === today ? ' · today' : '') + '</small></div><div>' +
          (day.items.length
            ? day.items.map(function (t) {
                return '<div class="row wrap" style="padding:5px 0">' +
                  '<span class="tag tag-dark">' + U.esc(t.due.slice(11, 16)) + '</span>' +
                  '<strong class="small">' + U.esc(t.title) + '</strong>' +
                  '<span class="small muted">' + U.esc(U.money(t.value)) + '</span>' +
                  '<button class="btn btn-sm" style="margin-left:auto" data-log-opp="' + U.esc(t.opportunityId) + '">Connect</button>' +
                  '</div>';
              }).join('')
            : '<div class="cal-empty">—</div>') +
          '</div></div>';
      }).join('') + '</div>';

    host.querySelector('#log').addEventListener('click', function () { RB.connectForm.open(); });
    bindTasks(host);
  }

  /* ========================================================= SCORECARD ==== */
  /* No arbitrary target. The scorecard is built from what was actually done. */
  var scoreRange = 'This month';

  function myScorecard(host) {
    var key = myKey();
    var sc = M.scorecard({ ownerKey: key, range: M.RANGES()[scoreRange], filter: F.apply });
    var life = M.scorecard({ ownerKey: key, filter: F.apply });

    host.innerHTML = UI.head('My scorecard', 'Effort, opportunity, pipeline and closure — kept separate on purpose.') +
      rangeBar(scoreRange) +
      toolbar(M.views().filter(function (v) { return v.owner === key; }), 'x2') +

      '<div class="section-title">Activity</div>' +
      UI.stats([
        UI.stat({ cls: 'stat-hero', label: 'Total connects', value: U.count(sc.totalConnects) }),
        UI.stat({ label: 'New connects', value: U.count(sc.newConnects) }),
        UI.stat({ label: 'Reconnects', value: U.count(sc.reconnects) }),
        UI.stat({ label: 'Opportunities created', value: U.count(sc.opportunitiesCreated) })
      ]) +

      '<div class="section-title">Commercial</div>' +
      UI.stats([
        UI.stat({ label: 'Potential created', value: U.money(sc.potentialCreated) }),
        UI.stat({ label: 'Active pipeline', value: U.money(life.activePipeline),
                  foot: life.activeCount + ' live', onClick: 'open' }),
        UI.stat({ label: 'Quoted', value: U.money(life.quotedValue) }),
        UI.stat({ label: 'Negotiated', value: U.money(life.negotiatedValue) }),
        UI.stat({ cls: 'stat-brand', label: 'Closed revenue', value: U.money(sc.closedRevenue),
                  foot: sc.wonCount + ' won', onClick: 'won' }),
        UI.stat({ label: 'Lost value', value: U.money(sc.lostValue),
                  foot: sc.lostCount + ' lost', footBad: true, onClick: 'lost' })
      ]) +

      '<div class="grid grid-2">' +
        UI.card('Conversion', 'How effectively the pipeline progresses', convTable(life.conversion)) +
        UI.card('Realisation', 'How much of the original potential became revenue',
          '<div class="stats" style="margin:0">' +
          UI.stat({ label: 'Realisation', small: true,
                    value: life.realisation == null ? '—' : life.realisation.toFixed(1) + '%',
                    foot: 'closed ÷ initial potential' }) +
          UI.stat({ label: 'Negotiation leakage', small: true, value: U.money(life.leakage),
                    foot: 'quoted − closed' }) + '</div>') +
      '</div>' +

      '<div class="section-title">Your funnel</div>' +
      '<div class="card">' + C.funnel({ data: M.funnel(life.views), format: U.money, highlightLast: true, onClick: true }) + '</div>';

    bindRange(host, function (r) { scoreRange = r; myScorecard(host); });
    bindToolbar(host, 'x2', function () { myScorecard(host); }, function () {
      return [RB.excel.opportunitySheet('Opportunities', life.views),
              RB.excel.connectSheet('Connects — ' + scoreRange, sc.connects)];
    }, 'robobox-' + me().id + '-scorecard');
    bindStats(host, { open: ['Active pipeline', life.open], won: ['Won', life.won], lost: ['Lost', life.lost] });
    host.querySelectorAll('[data-key]').forEach(function (g) {
      g.addEventListener('click', function () {
        var step = M.funnel(life.views).filter(function (x) { return x.key === g.getAttribute('data-key'); })[0];
        if (step) UI.drill('Reached ' + step.key, step.rows);
      });
    });
  }

  function convTable(conv) {
    return '<div class="table-wrap"><table class="data"><tbody>' +
      Object.keys(conv).map(function (k) {
        var val = conv[k];
        return '<tr><td>' + U.esc(k) + '</td><td class="num" style="width:120px">' +
          (val == null ? '<span class="muted">—</span>'
            : '<span class="meter" style="display:block"><span style="width:' + Math.min(100, val) + '%"></span></span>') +
          '</td><td class="num strong" style="width:70px">' +
          (val == null ? '—' : val.toFixed(0) + '%') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
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
      U.count(vs.length) + ' of ' + U.count(all.length) + ' opportunities. Click a row for the full history.',
      '<button class="btn btn-primary top-log" id="log">+ Log Connect</button>') +
      toolbar(all, 'x1') + '<div id="t"></div>';

    host.querySelector('#log').addEventListener('click', function () { RB.connectForm.open(); });
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

  /* ====================================================== CEO: PULSE ====== */
  var ceoRange = 'This month';

  function pulse(host) {
    var sc = M.scorecard({ range: M.RANGES()[ceoRange], filter: F.apply });
    var life = M.scorecard({ filter: F.apply });
    var today = M.scorecard({ range: M.RANGES()['Today'], filter: F.apply });
    var acts = M.attention(F.apply);

    host.innerHTML = UI.head('Business pulse', 'How much is being created, moving, closing — and where it is stuck.') +
      rangeBar(ceoRange) + toolbar(M.views(), 'x3') +
      UI.stats([
        UI.stat({ cls: 'stat-brand', label: 'Connects today', value: U.count(today.totalConnects),
                  foot: today.newConnects + ' new · ' + today.reconnects + ' reconnect' }),
        UI.stat({ label: 'New opportunities', value: U.count(sc.opportunitiesCreated),
                  foot: 'created ' + ceoRange.toLowerCase() }),
        UI.stat({ label: 'Potential created', value: U.money(sc.potentialCreated) }),
        UI.stat({ cls: 'stat-hero', label: 'Active pipeline', value: U.money(life.activePipeline),
                  foot: life.activeCount + ' open', onClick: 'open' }),
        UI.stat({ label: 'Quoted value', value: U.money(life.quotedValue) }),
        UI.stat({ label: 'Closed revenue', value: U.money(sc.closedRevenue),
                  foot: sc.wonCount + ' won', onClick: 'won' }),
        UI.stat({ label: 'Lost value', value: U.money(sc.lostValue), footBad: true,
                  foot: sc.lostCount + ' lost', onClick: 'lost' })
      ]) +

      '<div class="section-title">Needs attention</div>' +
      (acts.length ? acts.map(function (a, i) {
        return '<button type="button" class="action-item ' + a.tone + '" data-act="' + i + '">' +
          '<span class="action-ico">' + U.esc(a.icon) + '</span>' +
          '<span><strong>' + U.esc(a.title) + '</strong><small>' + U.esc(a.detail) + '</small></span>' +
          '<span class="chev">›</span></button>';
      }).join('') : '<div class="empty">Nothing needs attention.</div>') +

      '<div class="grid grid-2" style="margin-top:20px">' +
        UI.card('Sales funnel', 'Cumulative — click a stage to open it',
          C.funnel({ data: M.funnel(life.views), format: U.money, highlightLast: true, onClick: true })) +
        UI.card('Commercial funnel', 'Potential → Quoted → Negotiated → Closed',
          C.funnel({ data: M.commercialFunnel(life.views), format: U.money, highlightLast: true }) +
          '<div class="stats" style="margin:14px 0 0">' +
          UI.stat({ label: 'Realisation', small: true,
                    value: life.realisation == null ? '—' : life.realisation.toFixed(1) + '%',
                    foot: 'closed ÷ potential' }) +
          UI.stat({ label: 'Negotiation leakage', small: true, value: U.money(life.leakage),
                    foot: 'quoted − closed' }) + '</div>') +
      '</div>';

    bindRange(host, function (r) { ceoRange = r; pulse(host); });
    bindToolbar(host, 'x3', function () { pulse(host); }, function () {
      // The opportunity sheets are all-time; only connects follow the range
      // picker, so the sheet name carries it.
      return [RB.excel.opportunitySheet('Opportunities', life.views),
              RB.excel.connectSheet('Connects — ' + ceoRange, sc.connects),
              RB.excel.groupSheet('By salesperson', 'Salesperson', M.groupBy(life.views, 'owner')),
              RB.excel.groupSheet('By offering', 'Offering', M.groupBy(life.views, 'offering')),
              RB.excel.groupSheet('By region', 'Region', M.groupBy(life.views, 'region')),
              RB.excel.groupSheet('By school type', 'School type', M.groupBy(life.views, 'board'))];
    }, 'robobox-business-pulse');
    bindStats(host, { open: ['Active pipeline', life.open], won: ['Won', life.won], lost: ['Lost', life.lost] });
    host.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = acts[+b.getAttribute('data-act')];
        UI.drill(a.title, a.rows);
      });
    });
    host.querySelectorAll('[data-key]').forEach(function (g) {
      g.addEventListener('click', function () {
        var step = M.funnel(life.views).filter(function (x) { return x.key === g.getAttribute('data-key'); })[0];
        if (step) UI.drill('Reached ' + step.key, step.rows);
      });
    });
  }

  /* ==================================================== CEO: TEAM DAY ===== */
  /* What the team set out to do on a given day, and what they actually did.
   * Defaults to today; the date input is native, so no picker to own. */
  var dayDate = null;

  function teamDay(host) {
    var date = dayDate || U.iso(U.today());
    var rows = M.dayActivity(date, F.apply);
    var totals = rows.reduce(function (a, r) {
      a.planned += r.planned.length; a.done += r.done.length; a.kept += r.kept;
      a.newC += r.newConnects; a.re += r.reconnects; a.meetings += r.meetings;
      return a;
    }, { planned: 0, done: 0, kept: 0, newC: 0, re: 0, meetings: 0 });

    host.innerHTML = UI.head('Team day',
      'What each person planned for the day, and what they logged.',
      '<label class="row" style="gap:8px"><span class="small muted">Date</span>' +
      '<input class="input" type="date" id="day-date" value="' + date + '" max="' + U.iso(U.today()) + '" style="width:auto"></label>') +
      toolbar(M.views(), 'x8') +

      UI.stats([
        UI.stat({ cls: 'stat-brand', label: 'Connects logged', value: U.count(totals.done),
                  foot: totals.newC + ' new · ' + totals.re + ' reconnect' }),
        UI.stat({ label: 'Planned for the day', value: U.count(totals.planned),
                  foot: totals.kept + ' of them actioned' }),
        UI.stat({ label: 'Plans kept', value: totals.planned ? Math.round(totals.kept / totals.planned * 100) + '%' : '—',
                  footBad: totals.planned > 0 && totals.kept < totals.planned / 2 }),
        UI.stat({ label: 'Meetings & visits', value: U.count(totals.meetings) }),
        UI.stat({ label: 'Nobody logged', value: U.count(rows.filter(function (r) { return !r.done.length; }).length),
                  foot: rows.filter(function (r) { return !r.done.length; }).map(function (r) { return r.user.name; }).join(', ') || '—' })
      ]) +

      rows.map(function (r) {
        return '<div class="card"><div class="card-head">' +
          '<h3>' + U.esc(r.user.name) + '</h3>' +
          '<span class="card-sub">' + U.esc(RB.auth.roleLabel(r.user.role)) + '</span>' +
          '<span class="spacer"></span>' +
          '<span class="tag' + (r.done.length ? ' tag-dark' : ' tag-red') + '">' +
            r.done.length + ' logged</span>' +
          '<span class="tag">' + r.planned.length + ' planned</span></div>' +
          '<div class="grid grid-2">' +
            '<div><div class="section-title" style="margin-top:0">Agenda</div>' +
              (r.planned.length ? r.planned.map(dayRow).join('')
                : '<div class="cal-empty">Nothing was scheduled for this day.</div>') + '</div>' +
            '<div><div class="section-title" style="margin-top:0">Done</div>' +
              (r.done.length ? r.done.map(doneRow).join('')
                : '<div class="cal-empty">No connects logged.</div>') + '</div>' +
          '</div></div>';
      }).join('');

    host.querySelector('#day-date').addEventListener('change', function () {
      dayDate = this.value; teamDay(host);
    });
    bindToolbar(host, 'x8', function () { teamDay(host); }, function () {
      var planned = [], done = [];
      rows.forEach(function (r) { planned = planned.concat(r.planned); done = done.concat(r.done); });
      return [
        { name: 'Day summary', rows: rows, columns: [
            { label: 'Salesperson', get: function (r) { return r.user.name; } },
            { label: 'Planned', type: 'number', get: function (r) { return r.planned.length; } },
            { label: 'Actioned', type: 'number', get: function (r) { return r.kept; } },
            { label: 'Connects logged', type: 'number', get: function (r) { return r.done.length; } },
            { label: 'New connects', type: 'number', get: function (r) { return r.newConnects; } },
            { label: 'Reconnects', type: 'number', get: function (r) { return r.reconnects; } },
            { label: 'Meetings & visits', type: 'number', get: function (r) { return r.meetings; } },
            { label: 'Quoted on the day', type: 'money', get: function (r) { return r.quoted; } }
          ] },
        RB.excel.connectSheet('Done ' + date, done),
        RB.excel.connectSheet('Agenda ' + date, planned)
      ];
    }, 'robobox-team-day-' + date);

    host.querySelectorAll('[data-school]').forEach(function (b) {
      b.addEventListener('click', function () { school(b.getAttribute('data-school')); });
    });
  }

  function dayRow(c) {
    var s = RB.store.schoolById(c.schoolId);
    var o = c.opportunityId && RB.store.opportunityById(c.opportunityId);
    return '<button type="button" class="pick" data-school="' + U.esc(c.schoolId) + '" style="margin-bottom:6px">' +
      '<span class="pick-main"><strong>' + U.esc(c.nextAction || 'Follow up') + ' — ' + U.esc(s ? s.name : '') + '</strong>' +
      '<small>' + U.esc([o && o.offering, c.nextActionAt ? c.nextActionAt.slice(11, 16) : null].filter(Boolean).join(' · ')) + '</small></span>' +
      '</button>';
  }

  function doneRow(c) {
    var s = RB.store.schoolById(c.schoolId);
    return '<button type="button" class="pick" data-school="' + U.esc(c.schoolId) + '" style="margin-bottom:6px">' +
      '<span class="pick-main"><strong>' + U.esc(c.mode || 'Connect') + ' — ' + U.esc(s ? s.name : '') + '</strong>' +
      '<small>' + U.esc([c.response, c.kind === 'New' ? 'New connect' : 'Reconnect',
                         c.at ? c.at.slice(11, 16) : null].filter(Boolean).join(' · ')) + '</small></span>' +
      '<span class="pick-right small muted">' +
        (c.commercial && c.commercial.quoted ? U.esc(U.money(c.commercial.quoted)) : '') + '</span>' +
      '</button>';
  }

  /* ======================================================= CEO: TEAM ====== */
  function team(host) {
    var range = M.RANGES()[ceoRange];
    var rows = RB.store.users().filter(function (u) { return u.ownerKey; }).map(function (u) {
      var sc = M.scorecard({ ownerKey: u.ownerKey, range: range, filter: F.apply });
      var life = M.scorecard({ ownerKey: u.ownerKey, filter: F.apply });
      return { user: u, sc: sc, life: life };
    });

    host.innerHTML = UI.head('Team performance', 'Click a salesperson for their full scorecard.') +
      rangeBar(ceoRange) + toolbar(M.views(), 'x4') + '<div id="t"></div>';

    bindRange(host, function (r) { ceoRange = r; team(host); });
    bindToolbar(host, 'x4', function () { team(host); }, function () {
      return [RB.excel.groupSheet('By salesperson', 'Salesperson', M.groupBy(F.apply(M.views()), 'owner')),
              RB.excel.opportunitySheet('Opportunities', F.apply(M.views()))];
    }, 'robobox-team');
    UI.table(host.querySelector('#t'), {
      rows: rows, rowId: function (r) { return r.user.id; }, sortKey: 'pipeline', pageSize: 20,
      onRowClick: function (id) { personDetail(id); },
      empty: 'No salespeople configured.',
      columns: [
        { key: 'name', label: 'Salesperson', get: function (r) { return r.user.name; },
          render: function (r) { return '<span class="strong">' + U.esc(r.user.name) + '</span><div class="small muted">' +
            U.esc(RB.auth.roleLabel(r.user.role)) + '</div>'; } },
        { key: 'new', label: 'New connects', num: true, get: function (r) { return r.sc.newConnects; },
          render: function (r) { return U.count(r.sc.newConnects); } },
        { key: 're', label: 'Reconnects', num: true, get: function (r) { return r.sc.reconnects; },
          render: function (r) { return U.count(r.sc.reconnects); } },
        { key: 'potential', label: 'Potential', num: true, get: function (r) { return r.life.potentialCreated; },
          render: function (r) { return U.money(r.life.potentialCreated); } },
        { key: 'pipeline', label: 'Pipeline', num: true, get: function (r) { return r.life.activePipeline; },
          render: function (r) { return U.money(r.life.activePipeline); } },
        { key: 'proposals', label: 'Proposals', num: true,
          get: function (r) { return r.life.views.filter(function (v) { return v.stageRank >= 3; }).length; },
          render: function (r) { return U.count(r.life.views.filter(function (v) { return v.stageRank >= 3; }).length); } },
        { key: 'won', label: 'Won', num: true, get: function (r) { return r.life.wonCount; },
          render: function (r) { return U.count(r.life.wonCount); } },
        { key: 'closed', label: 'Closed', num: true, get: function (r) { return r.life.closedRevenue; },
          render: function (r) { return r.life.closedRevenue ? U.money(r.life.closedRevenue) : '<span class="muted">—</span>'; } },
        { key: 'lost', label: 'Lost', num: true, get: function (r) { return r.life.lostValue; },
          render: function (r) { return r.life.lostValue ? U.money(r.life.lostValue) : '<span class="muted">—</span>'; } }
      ]
    });
  }

  function personDetail(userId) {
    var u = RB.store.userById(userId);
    var life = M.scorecard({ ownerKey: u.ownerKey });
    var body = UI.stats([
      UI.stat({ label: 'Total connects', value: U.count(life.totalConnects), small: true }),
      UI.stat({ label: 'Potential created', value: U.money(life.potentialCreated), small: true }),
      UI.stat({ label: 'Active pipeline', value: U.money(life.activePipeline), small: true }),
      UI.stat({ label: 'Closed revenue', value: U.money(life.closedRevenue), small: true }),
      UI.stat({ label: 'Lost value', value: U.money(life.lostValue), small: true }),
      UI.stat({ label: 'Realisation', small: true,
                value: life.realisation == null ? '—' : life.realisation.toFixed(1) + '%' })
    ]) +
    UI.card('Conversion', '', convTable(life.conversion)) +
    '<div class="section-title">Stalled · ' + life.stalled.length + '</div><div id="pd"></div>';

    UI.modal(u.name, body, { wide: true, onMount: function (h) {
      UI.table(h.querySelector('#pd'), {
        rows: life.stalled, rowId: function (v) { return v.opp.schoolId; }, sortKey: 'value', pageSize: 10,
        columns: UI.oppColumns({ hide: ['owner'] }), onRowClick: school, empty: 'Nothing stalled.'
      });
    } });
  }

  /* ==================================================== CEO: STALLED ====== */
  function stalled(host) {
    var vs = F.apply(M.views()).filter(function (v) { return v.status === 'Open' && v.stalled; });
    vs = U.sortBy(vs, function (v) { return v.current || 0; }, 'desc');

    host.innerHTML = UI.head('Stalled pipeline',
      'Flagged when the next action is overdue, there is none, or nothing has moved for 7 / 14 days. Highest value first.') +
      toolbar(M.views(), 'x5') +
      UI.stats([
        UI.stat({ cls: 'stat-hero', label: 'Stalled value', value: U.money(U.sum(vs, function (v) { return v.current || 0; })) }),
        UI.stat({ label: 'Opportunities', value: U.count(vs.length) }),
        UI.stat({ label: 'Overdue next action', value: U.count(vs.filter(function (v) { return v.overdue; }).length), footBad: true }),
        UI.stat({ label: 'No next action', value: U.count(vs.filter(function (v) { return !v.nextAction; }).length) })
      ]) + '<div id="t"></div>';

    bindToolbar(host, 'x5', function () { stalled(host); },
      function () { return [RB.excel.opportunitySheet('Stalled', vs)]; }, 'robobox-stalled');

    UI.table(host.querySelector('#t'), {
      rows: vs, rowId: function (v) { return v.opp.schoolId; }, sortKey: 'value', pageSize: 25,
      onRowClick: school, empty: 'Nothing stalled.',
      columns: UI.oppColumns().concat([
        { key: 'why', label: 'Why', sortable: false, get: function (v) { return v.stalledReasons.join(', '); },
          render: function (v) { return v.stalledReasons.map(function (r) {
            return '<span class="tag tag-red">' + U.esc(r) + '</span>'; }).join(' '); } }
      ])
    });
  }

  /* =============================================== CEO: INTELLIGENCE ====== */
  /* Blockers, losses, offerings and geography are the same shape: group the
   * opportunities, show count and value, drill through. One screen, four cuts. */
  var intelDim = 'blocker';

  function intel(host) {
    var vs = F.apply(M.views());
    var dims = { blocker: 'Blockers', lossReason: 'Loss reasons', offering: 'Offerings',
                 region: 'Geography', competitor: 'Competitors', leadSource: 'Lead sources' };
    var pool = intelDim === 'lossReason' ? vs.filter(function (v) { return v.status === 'Lost'; }) : vs;
    var groups = M.groupBy(pool, intelDim).filter(function (g) { return g.key !== 'None' || intelDim !== 'blocker'; });

    host.innerHTML = UI.head('Intelligence', 'Where opportunities stick, why they are lost, and what actually converts.') +
      '<div class="filters"><div class="seg">' +
      Object.keys(dims).map(function (k) {
        return '<button type="button" data-dim="' + k + '" aria-pressed="' + (k === intelDim) + '">' +
          U.esc(dims[k]) + '</button>';
      }).join('') + '</div></div>' + toolbar(M.views(), 'x6') +

      (intelDim === 'lossReason'
        ? UI.stats([
            UI.stat({ cls: 'stat-hero', label: 'Lost opportunities', value: U.count(pool.length) }),
            UI.stat({ label: 'Lost value', value: U.money(U.sum(pool, function (v) { return v.current || 0; })) })
          ]) : '') +

      '<div class="grid grid-2">' +
        UI.card('By value', 'Click a bar to open those opportunities',
          C.hbar({ data: groups.map(function (g) { return { key: g.key, value: intelDim === 'lossReason' ? g.lostValue : g.pipeline }; }),
                   format: U.money, measureLabel: 'Value', labelW: 190, onClick: true,
                   color: function () { return intelDim === 'lossReason' ? 'var(--red)' : 'var(--charcoal)'; } })) +
        UI.card('By count', 'How often it comes up',
          C.hbar({ data: groups.map(function (g) { return { key: g.key, value: g.count }; }),
                   format: U.count, measureLabel: 'Opportunities', labelW: 190, onClick: true })) +
      '</div>' +

      '<div class="section-title">' + U.esc(dims[intelDim]) + ' in full</div><div id="t"></div>';

    bindToolbar(host, 'x6', function () { intel(host); }, function () {
      return [RB.excel.groupSheet(dims[intelDim], M.DIMENSIONS[intelDim].label, groups),
              RB.excel.opportunitySheet('Opportunities', pool)];
    }, 'robobox-' + intelDim);

    host.querySelectorAll('[data-dim]').forEach(function (b) {
      b.addEventListener('click', function () { intelDim = b.getAttribute('data-dim'); intel(host); });
    });
    host.querySelectorAll('[data-key]').forEach(function (g) {
      g.addEventListener('click', function () {
        var grp = groups.filter(function (x) { return x.key === g.getAttribute('data-key'); })[0];
        if (grp) UI.drill(grp.key, grp.rows);
      });
    });

    UI.table(host.querySelector('#t'), {
      rows: groups, rowId: function (g) { return g.key; }, sortKey: 'pipeline', pageSize: 20,
      onRowClick: function (k) {
        var grp = groups.filter(function (x) { return x.key === k; })[0];
        if (grp) UI.drill(grp.key, grp.rows);
      },
      columns: groupColumns(M.DIMENSIONS[intelDim].label)
    });
  }

  function groupColumns(label) {
    return [
      { key: 'key', label: label, get: function (g) { return g.key; },
        render: function (g) { return '<span class="strong">' + U.esc(g.key) + '</span>'; } },
      { key: 'count', label: 'Opps', num: true, get: function (g) { return g.count; },
        render: function (g) { return U.count(g.count); } },
      { key: 'potential', label: 'Potential', num: true, get: function (g) { return g.potential; },
        render: function (g) { return U.money(g.potential); } },
      { key: 'pipeline', label: 'Pipeline', num: true, get: function (g) { return g.pipeline; },
        render: function (g) { return U.money(g.pipeline); } },
      { key: 'quoted', label: 'Quoted', num: true, get: function (g) { return g.quoted; },
        render: function (g) { return g.quoted ? U.money(g.quoted) : '<span class="muted">—</span>'; } },
      { key: 'won', label: 'Won', num: true, get: function (g) { return g.wonCount; },
        render: function (g) { return U.count(g.wonCount); } },
      { key: 'closed', label: 'Closed', num: true, get: function (g) { return g.closed; },
        render: function (g) { return g.closed ? U.money(g.closed) : '<span class="muted">—</span>'; } },
      { key: 'lost', label: 'Lost', num: true, get: function (g) { return g.lostValue; },
        render: function (g) { return g.lostValue ? U.money(g.lostValue) : '<span class="muted">—</span>'; } },
      { key: 'win', label: 'Win rate', num: true, get: function (g) { return g.winRate == null ? -1 : g.winRate; },
        render: function (g) { return g.winRate == null ? '<span class="muted">—</span>' : g.winRate.toFixed(0) + '%'; } },
      { key: 'avg', label: 'Avg deal', num: true, get: function (g) { return g.avgDeal; },
        render: function (g) { return U.money(g.avgDeal); } },
      { key: 'real', label: 'Realisation', num: true, get: function (g) { return g.realisation == null ? -1 : g.realisation; },
        render: function (g) { return g.realisation == null ? '<span class="muted">—</span>' : g.realisation.toFixed(0) + '%'; } }
    ];
  }

  /* ==================================================== CEO: OFFERINGS ==== */
  function offerings(host) {
    var vs = F.apply(M.views());
    var groups = V.coreOfferings.map(function (o) {
      return M.rollup(o, vs.filter(function (v) { return v.opp.offering === o; }));
    }).filter(function (g) { return g.count; });
    var other = vs.filter(function (v) { return V.coreOfferings.indexOf(v.opp.offering) === -1; });
    if (other.length) groups.push(M.rollup('Other / not set', other));

    host.innerHTML = UI.head('Offering performance',
      'Which products create opportunities, and which actually convert to revenue.') +
      toolbar(M.views(), 'x7') +
      '<div class="grid grid-2">' +
        UI.card('Pipeline by offering', 'Open value',
          C.hbar({ data: groups.map(function (g) { return { key: g.key, value: g.pipeline }; }),
                   format: U.money, measureLabel: 'Pipeline', labelW: 175, onClick: true })) +
        UI.card('Potential by offering', 'What was estimated at creation',
          C.hbar({ data: groups.map(function (g) { return { key: g.key, value: g.potential }; }),
                   format: U.money, measureLabel: 'Potential', labelW: 175, onClick: true })) +
      '</div>' +
      '<div class="section-title">All offerings</div><div id="t"></div>';

    bindToolbar(host, 'x7', function () { offerings(host); },
      function () { return [RB.excel.groupSheet('Offerings', 'Offering', groups),
                            RB.excel.opportunitySheet('Opportunities', vs)]; }, 'robobox-offerings');

    host.querySelectorAll('[data-key]').forEach(function (g) {
      g.addEventListener('click', function () {
        var grp = groups.filter(function (x) { return x.key === g.getAttribute('data-key'); })[0];
        if (grp) UI.drill(grp.key, grp.rows);
      });
    });
    UI.table(host.querySelector('#t'), {
      rows: groups, rowId: function (g) { return g.key; }, sortKey: 'pipeline', pageSize: 20,
      onRowClick: function (k) {
        var grp = groups.filter(function (x) { return x.key === k; })[0];
        if (grp) UI.drill(grp.key, grp.rows);
      },
      columns: groupColumns('Offering')
    });
  }

  return {
    myDay: myDay, myTasks: myTasks, myCalendar: myCalendar, myScorecard: myScorecard,
    mySchools: mySchools, school: school,
    pulse: pulse, team: team, stalled: stalled, intel: intel, offerings: offerings,
    teamDay: teamDay
  };
})();
