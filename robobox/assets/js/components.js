/* Robobox Sales OS - shared UI pieces used by both the sales and CEO views. */
window.RB = window.RB || {};

RB.ui = (function () {
  'use strict';

  var U = RB.util, M = RB.metrics;

  /* ----------------------------------------------------------------- toast */
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* ----------------------------------------------------------------- modal */
  function modal(title, body, opts) {
    opts = opts || {};
    var root = document.getElementById('modal-root');
    root.querySelector('.modal').classList.toggle('wide', !!opts.wide);
    document.getElementById('modal-title').textContent = title;
    var host = document.getElementById('modal-body');
    host.innerHTML = '';
    if (typeof body === 'string') host.innerHTML = body; else host.appendChild(body);
    root.hidden = false;
    if (opts.onMount) opts.onMount(host);
    return host;
  }
  function closeModal() { document.getElementById('modal-root').hidden = true; }

  /* ------------------------------------------------------------ stat tiles */
  function stat(o) {
    var tone = o.tone ? ' style="color:var(--' + o.tone + ')"' : '';
    return '<div class="stat' + (o.onClick ? ' clickable' : '') + '"' +
      (o.onClick ? ' data-stat="' + U.esc(o.onClick) + '" role="button" tabindex="0"' : '') +
      (o.title ? ' title="' + U.esc(o.title) + '"' : '') + '>' +
      '<div class="stat-label">' + U.esc(o.label) + '</div>' +
      '<div class="stat-value' + (o.small ? ' sm' : '') + '"' + tone + '>' + (o.valueHTML || U.esc(o.value)) + '</div>' +
      (o.foot ? '<div class="stat-foot">' + o.foot + '</div>' : '') +
      (o.spark || '') +
    '</div>';
  }

  function statRow(items) { return '<div class="stats">' + items.join('') + '</div>'; }

  /* ------------------------------------------------------------------ tags */
  function stageTag(s) {
    var st = M.stage(s);
    var cls = st === 'Won' ? 'tag-good' : st === 'Lost' ? 'tag-critical' : st === 'On Hold' ? 'tag-warning' : 'tag-accent';
    var confirmed = M.stageConfirmed(s);
    return '<span class="tag ' + cls + '"' +
      (confirmed ? '' : ' title="Suggested from the imported wording: &quot;' + U.esc(s.suggestedStageReason || '') + '&quot;. Confirm it to lock it in."') +
      '>' + U.esc(st) + (confirmed ? '' : ' <em style="font-style:normal;opacity:.7">?</em>') + '</span>';
  }

  function healthTag(s, limit) {
    if (!M.isOpen(s)) return '<span class="tag">Closed</span>';
    if (M.isOverdue(s)) return '<span class="tag tag-critical">⚠ Overdue</span>';
    if (M.isStalled(s, limit)) return '<span class="tag tag-serious">◷ Gone quiet</span>';
    if (M.isDueToday(s)) return '<span class="tag tag-warning">● Due today</span>';
    return '<span class="tag tag-good">✓ On track</span>';
  }

  function meter(fraction) {
    var pct = Math.round(fraction * 100);
    var cls = pct >= 85 ? 'good' : pct >= 55 ? 'warn' : 'bad';
    return '<span class="row" style="gap:6px"><span class="meter ' + cls + '" style="width:52px"><span style="width:' + pct + '%"></span></span>' +
      '<span class="small tnum muted">' + pct + '%</span></span>';
  }

  /* ----------------------------------------------------------------- table */
  /* columns: [{key,label,get,render,num,sortable,width}] */
  function table(container, cfg) {
    var state = {
      sortKey: cfg.sortKey || null,
      sortDir: cfg.sortDir || 'desc',
      page: 0,
      pageSize: cfg.pageSize || 25
    };

    function sorted() {
      var rows = cfg.rows.slice();
      if (!state.sortKey) return rows;
      var col = cfg.columns.filter(function (c) { return c.key === state.sortKey; })[0];
      if (!col) return rows;
      return U.sortBy(rows, col.sortValue || col.get, state.sortDir);
    }

    function render() {
      var rows = sorted();
      var total = rows.length;
      var pages = Math.max(1, Math.ceil(total / state.pageSize));
      if (state.page >= pages) state.page = pages - 1;
      var slice = rows.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);

      var head = cfg.columns.map(function (c) {
        var arrow = state.sortKey === c.key ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
        return '<th class="' + (c.num ? 'num ' : '') + (c.sortable === false ? '' : 'sortable') + '"' +
          (c.sortable === false ? '' : ' data-sort="' + U.esc(c.key) + '"') +
          (c.width ? ' style="width:' + c.width + '"' : '') + '>' + U.esc(c.label) + arrow + '</th>';
      }).join('');

      var body = slice.length ? slice.map(function (r, i) {
        return '<tr' + (cfg.onRowClick ? ' class="row-link" data-row="' + U.esc(cfg.rowId(r)) + '"' : '') + '>' +
          cfg.columns.map(function (c) {
            return '<td class="' + (c.num ? 'num ' : '') + (c.cls || '') + '">' +
              (c.render ? c.render(r, i) : U.esc(c.get(r))) + '</td>';
          }).join('') + '</tr>';
      }).join('') : '<tr><td colspan="' + cfg.columns.length + '"><div class="table-empty">' +
        U.esc(cfg.empty || 'Nothing here yet.') + '</div></td></tr>';

      container.innerHTML =
        '<div class="table-wrap"><table class="data"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>' +
        (total > state.pageSize ?
          '<div class="table-foot"><span>Showing ' + (state.page * state.pageSize + 1) + '–' +
          Math.min(total, (state.page + 1) * state.pageSize) + ' of ' + U.count(total) + '</span>' +
          '<span class="spacer"></span>' +
          '<button class="btn btn-sm" data-page="prev"' + (state.page === 0 ? ' disabled' : '') + '>Previous</button>' +
          '<button class="btn btn-sm" data-page="next"' + (state.page >= pages - 1 ? ' disabled' : '') + '>Next</button></div>'
          : '<div class="table-foot"><span>' + U.count(total) + ' row' + (total === 1 ? '' : 's') + '</span></div>') +
        '</div>';

      container.querySelectorAll('th[data-sort]').forEach(function (th) {
        th.addEventListener('click', function () {
          var k = th.getAttribute('data-sort');
          if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          else { state.sortKey = k; state.sortDir = 'desc'; }
          render();
        });
      });
      container.querySelectorAll('[data-page]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.page += b.getAttribute('data-page') === 'next' ? 1 : -1;
          render();
          container.scrollIntoView({ block: 'nearest' });
        });
      });
      if (cfg.onRowClick) {
        container.querySelectorAll('tr[data-row]').forEach(function (tr) {
          tr.addEventListener('click', function (e) {
            if (e.target.closest('button, a, select, input')) return;
            cfg.onRowClick(tr.getAttribute('data-row'));
          });
        });
      }
    }

    render();
    return { render: render, setRows: function (r) { cfg.rows = r; state.page = 0; render(); } };
  }

  /* --------------------------------------------------- standard column set */
  function schoolColumns(opts) {
    opts = opts || {};
    var limit = RB.store.settings().stalledAfterDays;
    var cols = [
      { key: 'name', label: 'School', get: function (s) { return s.name; },
        render: function (s) {
          return '<div class="strong">' + U.esc(s.name) + '</div><div class="small muted">' +
            U.esc([s.location, s.region].filter(Boolean).join(' · ')) +
            (s.boards.length ? ' · ' + U.esc(s.boards.join('/')) : '') + '</div>';
        } },
      { key: 'students', label: 'Students', num: true, get: function (s) { return s.students; },
        render: function (s) { return s.students ? U.count(s.students) : '<span class="muted">—</span>'; } },
      { key: 'owner', label: 'Owner', get: function (s) { return s.owners.join(', '); },
        render: function (s) { return s.owners.length ? U.esc(s.owners.join(', ')) : '<span class="tag tag-warning">Unassigned</span>'; } },
      { key: 'stage', label: 'Stage', get: function (s) { return M.stageIdx(s); },
        render: function (s) { return stageTag(s); } },
      { key: 'deal', label: 'Deal size', num: true, get: function (s) { return s.dealSize || 0; },
        render: function (s) { return s.dealSize ? U.money(s.dealSize) : '<span class="muted">—</span>'; } },
      { key: 'weighted', label: 'Weighted', num: true, get: function (s) { return M.weighted(s); },
        render: function (s) { return s.dealSize ? U.money(M.weighted(s)) : '<span class="muted">—</span>'; } },
      { key: 'contacted', label: 'Last contact', num: true,
        get: function (s) { return s.lastContacted ? -U.daysSince(s.lastContacted) : -99999; },
        render: function (s) {
          if (!s.lastContacted) return '<span class="muted">' + U.esc(s.lastContactedRaw || 'never') + '</span>';
          var d = U.daysSince(s.lastContacted);
          var approx = s.lastContactedPrecision === 'month' ? '≈' : '';
          return '<span class="nowrap">' + approx + U.esc(U.fmtDate(s.lastContacted)) + '</span>' +
            '<div class="small ' + (d > limit ? 'muted' : 'muted') + '">' + U.esc(U.relative(s.lastContacted)) + '</div>';
        } },
      { key: 'next', label: 'Next action', get: function (s) { return s.nextAction || ''; },
        render: function (s) {
          if (!s.nextAction) return '<span class="tag tag-warning">Not set</span>';
          return '<div>' + U.esc(RB.charts.truncate(s.nextAction, 46)) + '</div>' +
            (s.nextActionDate ? '<div class="small ' + (M.isOverdue(s) ? '' : 'muted') + '">' +
              (M.isOverdue(s) ? '<span class="tag tag-critical">due ' + U.esc(U.fmtDate(s.nextActionDate)) + '</span>' : 'due ' + U.esc(U.fmtDate(s.nextActionDate))) + '</div>' : '');
        } },
      { key: 'health', label: 'Health', get: function (s) { return M.isOverdue(s) ? 3 : M.isStalled(s, limit) ? 2 : 1; },
        render: function (s) { return healthTag(s, limit); } }
    ];
    if (opts.only) {
      cols = opts.only.map(function (k) { return cols.filter(function (c) { return c.key === k; })[0]; }).filter(Boolean);
    }
    if (opts.hide) cols = cols.filter(function (c) { return opts.hide.indexOf(c.key) === -1; });
    if (opts.extra) cols = cols.concat(opts.extra);
    return cols;
  }

  /* ---------------------------------------------------------------- export */
  var EXPORT_COLUMNS = [
    { label: 'School', get: function (s) { return s.name; } },
    { label: 'Region', get: function (s) { return s.region; } },
    { label: 'Location', get: function (s) { return s.location; } },
    { label: 'Board', get: function (s) { return s.boards.join(' / '); } },
    { label: 'Students', get: function (s) { return s.students; } },
    { label: 'Decision maker', get: function (s) { return s.decisionMaker; } },
    { label: 'Sales owner', get: function (s) { return s.owners.join(', '); } },
    { label: 'Lead source', get: function (s) { return s.leadSource; } },
    { label: 'Pipeline status', get: function (s) { return s.opportunityStatus; } },
    { label: 'Opportunity', get: function (s) { return s.opportunity; } },
    { label: 'Stage', get: function (s) { return M.stage(s); } },
    { label: 'Stage confirmed', get: function (s) { return M.stageConfirmed(s) ? 'Yes' : 'No (suggested)'; } },
    { label: 'Probability %', get: function (s) { return M.probability(s); } },
    { label: 'Deal size (INR)', get: function (s) { return s.dealSize; } },
    { label: 'Weighted value (INR)', get: function (s) { return s.dealSize ? Math.round(M.weighted(s)) : ''; } },
    { label: 'Rate per student', get: function (s) { return s.ratePerStudent; } },
    { label: 'Last contacted', get: function (s) { return s.lastContacted || s.lastContactedRaw; } },
    { label: 'Date precision', get: function (s) { return s.lastContactedPrecision; } },
    { label: 'Days since contact', get: function (s) { return M.daysSinceContact(s); } },
    { label: 'Next action', get: function (s) { return s.nextAction; } },
    { label: 'Next action due', get: function (s) { return s.nextActionDate; } },
    { label: 'Expected closure', get: function (s) { return s.expectedClosure || s.expectedClosureRaw; } },
    { label: 'Blockers', get: function (s) { return s.blockers; } },
    { label: 'Blocker category', get: function (s) { return s.blockerTags.map(M.blockerLabel).join('; '); } },
    { label: 'Competition', get: function (s) { return s.competitors.join(', '); } },
    { label: 'Remarks', get: function (s) { return s.remarks; } },
    { label: 'Activities logged', get: function (s) { return s.activities.length; } },
    { label: 'Missing fields', get: function (s) { return M.missingFields(s).join('; '); } },
    { label: 'Record completeness %', get: function (s) { return Math.round(M.completeness(s) * 100); } }
  ];

  function exportSchools(rows, filename) {
    U.download(filename || 'robobox-pipeline-' + U.iso(U.today()) + '.csv', U.toCSV(rows, EXPORT_COLUMNS));
    toast('Downloaded ' + rows.length + ' rows.');
  }

  var ACTIVITY_EXPORT = [
    { label: 'Date', get: function (a) { return a.date; } },
    { label: 'School', get: function (a) { return a.school.name; } },
    { label: 'Region', get: function (a) { return a.school.region; } },
    { label: 'Logged by', get: function (a) { var u = RB.store.userById(a.by); return u ? u.name : a.by; } },
    { label: 'Type', get: function (a) { return a.type; } },
    { label: 'Contact', get: function (a) { return a.contact; } },
    { label: 'Outcome', get: function (a) { return a.outcome; } },
    { label: 'Stage before', get: function (a) { return a.stageFrom; } },
    { label: 'Stage after', get: function (a) { return a.stageTo; } },
    { label: 'Next action', get: function (a) { return a.nextAction; } },
    { label: 'Next action due', get: function (a) { return a.nextActionDate; } },
    { label: 'Notes', get: function (a) { return a.notes; } }
  ];

  function exportActivities(acts, filename) {
    U.download(filename || 'robobox-activity-' + U.iso(U.today()) + '.csv', U.toCSV(acts, ACTIVITY_EXPORT));
    toast('Downloaded ' + acts.length + ' activities.');
  }

  /* ------------------------------------------------------------ form parts */
  function select(name, options, value, opts) {
    opts = opts || {};
    var items = options.map(function (o) {
      var v = typeof o === 'string' ? o : o.value;
      var l = typeof o === 'string' ? o : o.label;
      return '<option value="' + U.esc(v) + '"' + (String(value) === String(v) ? ' selected' : '') + '>' + U.esc(l) + '</option>';
    }).join('');
    return '<select class="input" name="' + U.esc(name) + '"' + (opts.required ? ' required' : '') + '>' +
      (opts.placeholder ? '<option value=""' + (value ? '' : ' selected') + '>' + U.esc(opts.placeholder) + '</option>' : '') +
      items + '</select>';
  }

  function field(label, control, hint) {
    return '<label class="field"><span class="field-label">' + U.esc(label) + '</span>' + control +
      (hint ? '<span class="field-hint">' + U.esc(hint) + '</span>' : '') + '</label>';
  }

  function formValues(form) {
    var out = {};
    new FormData(form).forEach(function (v, k) { out[k] = typeof v === 'string' ? v.trim() : v; });
    return out;
  }

  /* ------------------------------------------------------- log-activity form */
  function logActivityForm(schoolId) {
    var s = RB.store.byId(schoolId);
    if (!s) return;
    var stages = M.STAGE_KEYS.map(function (k) { return { value: k, label: k + ' (' + M.STAGE_PROB[k] + '%)' }; });
    var today = U.iso(U.today());

    var html =
      '<form id="act-form">' +
      '<p class="sec" style="margin-top:0">Log what happened with <strong>' + U.esc(s.name) + '</strong>. ' +
      'The pipeline updates itself from this — last contact, stage, next step and deal size all follow.</p>' +
      '<div class="field-row">' +
        field('Date', '<input class="input" type="date" name="date" value="' + today + '" max="' + today + '" required>') +
        field('What happened', select('type', M.ACTIVITY_TYPES, 'Meeting')) +
      '</div>' +
      '<div class="field-row">' +
        field('Who did you speak to', '<input class="input" name="contact" placeholder="Name and role" value="' + U.esc(s.decisionMaker || '') + '">') +
        field('How did it go', select('outcome', M.OUTCOMES, 'Positive')) +
      '</div>' +
      field('Notes', '<textarea class="input" name="notes" placeholder="What was said, what they care about, what they objected to…"></textarea>') +
      '<div class="section-title">Where does this leave the deal?</div>' +
      '<div class="field-row">' +
        field('Stage now', select('stageTo', stages, M.stage(s)), M.stageConfirmed(s) ? '' : 'Currently a suggestion — saving confirms it.') +
        field('Deal size (₹)', '<input class="input" type="number" name="dealSize" min="0" step="1000" value="' + (s.dealSize || '') + '" placeholder="e.g. 1360000">',
          s.students ? s.students + ' students × ₹1,700 = ' + U.money(s.students * 1700, { full: true }) : '') +
      '</div>' +
      '<div class="field-row">' +
        field('Expected closure', '<input class="input" type="date" name="expectedClosure" value="' + U.esc(s.expectedClosure || '') + '">') +
        field('Blockers', '<input class="input" name="blockers" value="' + U.esc(s.blockers || '') + '" placeholder="What is standing in the way?">') +
      '</div>' +
      '<div class="section-title">Next step</div>' +
      '<div class="field-row">' +
        field('What happens next', '<input class="input" name="nextAction" value="' + U.esc(s.nextAction || '') + '" placeholder="e.g. Meet the trustee with pricing" required>') +
        field('By when', '<input class="input" type="date" name="nextActionDate" value="' + U.esc(s.nextActionDate || U.addDays(today, 7)) + '" required>') +
      '</div>' +
      '<div class="modal-actions"><button type="button" class="btn" data-close="1">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">Save update</button></div>' +
      '</form>';

    modal('Log an update', html, {
      onMount: function (host) {
        host.querySelector('#act-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var v = formValues(this);
          RB.store.logActivity(schoolId, {
            date: v.date, type: v.type, contact: v.contact, outcome: v.outcome, notes: v.notes,
            stageTo: v.stageTo, dealSize: v.dealSize === '' ? null : Number(v.dealSize),
            expectedClosure: v.expectedClosure || null, blockers: v.blockers || null,
            nextAction: v.nextAction, nextActionDate: v.nextActionDate
          }, RB.auth.user().id);
          closeModal();
          toast('Update saved — ' + s.name + ' is now at ' + v.stageTo + '.');
          RB.app.refresh();
        });
      }
    });
  }

  /* ----------------------------------------------------- school record form */
  function schoolForm(schoolId) {
    var s = schoolId ? RB.store.byId(schoolId) : null;
    var isNew = !s;
    var owners = RB.store.users().filter(function (u) { return u.ownerKey; }).map(function (u) { return u.ownerKey; });
    var stages = [{ value: '', label: 'Not confirmed yet' }].concat(M.STAGE_KEYS.map(function (k) { return { value: k, label: k }; }));

    var html =
      '<form id="school-form">' +
      '<div class="section-title" style="margin-top:0">School</div>' +
      '<div class="field-row">' +
        field('School name', '<input class="input" name="name" required value="' + U.esc(s ? s.name : '') + '">') +
        field('Location', '<input class="input" name="location" value="' + U.esc(s && s.location || '') + '">') +
      '</div>' +
      '<div class="field-row">' +
        field('Region', select('region', M.REGIONS, s && s.region, { placeholder: 'Select region' })) +
        field('Board(s)', '<input class="input" name="boards" value="' + U.esc(s ? s.boards.join(', ') : '') + '" placeholder="CBSE, ICSE">') +
        field('Student count', '<input class="input" type="number" name="students" min="0" value="' + (s && s.students || '') + '">') +
      '</div>' +
      '<div class="section-title">Ownership &amp; source</div>' +
      '<div class="field-row">' +
        field('Sales owner', select('owner', owners, s && s.owners[0], { placeholder: 'Unassigned' })) +
        field('Lead source', select('leadSource', M.LEAD_SOURCES, s && s.leadSource, { placeholder: 'Not recorded' })) +
        field('Decision maker', '<input class="input" name="decisionMaker" value="' + U.esc(s && s.decisionMaker || '') + '">') +
      '</div>' +
      '<div class="section-title">Opportunity</div>' +
      field('What is the opportunity', '<textarea class="input" name="opportunity" placeholder="What are we selling them and why would they buy?">' + U.esc(s && s.opportunity || '') + '</textarea>') +
      '<div class="field-row">' +
        field('Stage', select('stage', stages, s && s.stage || '')) +
        field('Deal size (₹)', '<input class="input" type="number" name="dealSize" min="0" step="1000" value="' + (s && s.dealSize || '') + '">') +
        field('Expected closure', '<input class="input" type="date" name="expectedClosure" value="' + U.esc(s && s.expectedClosure || '') + '">') +
      '</div>' +
      '<div class="section-title">Working the account</div>' +
      '<div class="field-row">' +
        field('Next action', '<input class="input" name="nextAction" value="' + U.esc(s && s.nextAction || '') + '">') +
        field('Next action due', '<input class="input" type="date" name="nextActionDate" value="' + U.esc(s && s.nextActionDate || '') + '">') +
      '</div>' +
      '<div class="field-row">' +
        field('Blockers', '<input class="input" name="blockers" value="' + U.esc(s && s.blockers || '') + '">') +
        field('Competition', '<input class="input" name="competitors" value="' + U.esc(s ? s.competitors.join(', ') : '') + '">') +
      '</div>' +
      field('Remarks', '<textarea class="input" name="remarks">' + U.esc(s && s.remarks || '') + '</textarea>') +
      '<div class="modal-actions"><button type="button" class="btn" data-close="1">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' + (isNew ? 'Add school' : 'Save changes') + '</button></div>' +
      '</form>';

    modal(isNew ? 'Add a school' : 'Edit ' + s.name, html, {
      wide: true,
      onMount: function (host) {
        host.querySelector('#school-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var v = formValues(this);
          var patch = {
            name: v.name, location: v.location || null, region: v.region || null,
            boards: v.boards ? v.boards.split(/\s*,\s*/).filter(Boolean).map(function (b) { return b.toUpperCase(); }) : [],
            students: v.students ? Number(v.students) : null,
            owners: v.owner ? [v.owner] : [],
            leadSource: v.leadSource || null,
            decisionMaker: v.decisionMaker || null,
            opportunity: v.opportunity || null,
            stage: v.stage || null,
            dealSize: v.dealSize ? Number(v.dealSize) : null,
            expectedClosure: v.expectedClosure || null,
            nextAction: v.nextAction || null,
            nextActionDate: v.nextActionDate || null,
            blockers: v.blockers || null,
            blockerTags: M.tagBlockers(v.blockers),
            competitors: v.competitors ? v.competitors.split(/\s*,\s*/).filter(Boolean) : [],
            remarks: v.remarks || null
          };
          if (patch.opportunity || patch.dealSize || patch.stage) patch.opportunityStatus = 'Opportunity identified';
          if (isNew) {
            var created = RB.store.createSchool(patch, RB.auth.user().id);
            closeModal(); toast(created.name + ' added.'); RB.app.refresh();
          } else {
            RB.store.updateSchool(schoolId, patch);
            closeModal(); toast('Saved.'); RB.app.refresh();
          }
        });
      }
    });
  }

  /* --------------------------------------------------------- school 360 view */
  function schoolDetail(schoolId) {
    var s = RB.store.byId(schoolId);
    if (!s) return;
    var limit = RB.store.settings().stalledAfterDays;
    var missing = M.missingFields(s);
    var canEdit = RB.auth.can('editAny') || RB.auth.ownsRow(s);

    var acts = s.activities.slice().sort(function (a, b) { return b.date.localeCompare(a.date) || b.loggedAt.localeCompare(a.loggedAt); });

    var timeline = acts.length ? '<ul class="timeline">' + acts.map(function (a) {
      var u = RB.store.userById(a.by);
      var cls = a.outcome === 'Negative' ? 'neg' : a.outcome === 'Positive' ? '' : 'neu';
      return '<li class="' + cls + '">' +
        '<div class="tl-head"><strong>' + U.esc(a.type) + '</strong>' +
          (a.contact ? '<span class="sec">with ' + U.esc(a.contact) + '</span>' : '') +
          '<span class="tag">' + U.esc(a.outcome) + '</span>' +
          '<span class="tl-date">' + U.esc(U.fmtDate(a.date)) + ' · ' + U.esc(u ? u.name : a.by) + '</span></div>' +
        (a.stageTo && a.stageTo !== a.stageFrom ? '<div class="small sec">Stage moved ' + U.esc(a.stageFrom) + ' → <strong>' + U.esc(a.stageTo) + '</strong></div>' : '') +
        (a.notes ? '<div class="tl-body">' + U.esc(a.notes) + '</div>' : '') +
        (a.nextAction ? '<div class="small muted" style="margin-top:4px">Next: ' + U.esc(a.nextAction) +
          (a.nextActionDate ? ' by ' + U.esc(U.fmtDate(a.nextActionDate)) : '') + '</div>' : '') +
      '</li>';
    }).join('') + '</ul>' :
      '<div class="empty">No updates logged yet. Everything below came from the imported sheet.</div>';

    var html =
      '<div class="row wrap" style="gap:8px;margin-bottom:14px">' +
        stageTag(s) + healthTag(s, limit) +
        (s.duplicateFlag ? '<span class="tag tag-warning">Possible duplicate</span>' : '') +
        '<span class="tag">' + U.esc(s.opportunityStatus || '—') + '</span>' +
        '<span class="spacer" style="margin-left:auto"></span>' +
        (canEdit ? '<button class="btn btn-primary btn-sm" data-act="log">Log an update</button>' +
                   '<button class="btn btn-sm" data-act="edit">Edit record</button>' : '') +
      '</div>' +
      '<div class="grid grid-2">' +
      '<div><div class="section-title" style="margin-top:0">Account</div><dl class="kv">' +
        row('Region / location', [s.region, s.location].filter(Boolean).join(' · ') || '—') +
        row('Board', s.boards.join(' / ') || '—') +
        row('Students', s.students ? U.count(s.students) : '—') +
        row('Decision maker', s.decisionMaker || '—') +
        row('Sales owner', s.owners.join(', ') || 'Unassigned') +
        row('Lead source', s.leadSource || 'Not recorded') +
        row('TAM value', s.students ? U.money(s.students * RB.store.settings().tamRatePerStudent, { full: true }) : '—') +
      '</dl></div>' +
      '<div><div class="section-title" style="margin-top:0">Deal</div><dl class="kv">' +
        row('Deal size', s.dealSize ? U.money(s.dealSize, { full: true }) : '—') +
        row('Rate per student', s.ratePerStudent ? '₹' + U.count(s.ratePerStudent) + ' · ' + M.rateBand(s.ratePerStudent) : '—') +
        row('Probability', M.probability(s) + '%') +
        row('Weighted value', s.dealSize ? U.money(M.weighted(s), { full: true }) : '—') +
        row('Last contacted', s.lastContacted
              ? U.fmtDate(s.lastContacted) + ' (' + U.relative(s.lastContacted) + ')' +
                (s.lastContactedPrecision !== 'exact' ? ' <span class="tag tag-warning">' + U.esc(s.lastContactedRaw || s.lastContactedPrecision) + '</span>' : '')
              : '<span class="muted">' + U.esc(s.lastContactedRaw || 'never') + '</span>') +
        row('Expected closure', s.expectedClosure ? U.fmtDate(s.expectedClosure) : (s.expectedClosureRaw || '—')) +
        row('Next action', s.nextAction ? U.esc(s.nextAction) + (s.nextActionDate ? ' <span class="small muted">by ' + U.fmtDate(s.nextActionDate) + '</span>' : '') : '<span class="tag tag-warning">Not set</span>') +
      '</dl></div></div>' +
      (s.opportunity || s.remarks || s.blockers || s.competitors.length ?
        '<div class="section-title">Context from the field</div><dl class="kv">' +
        (s.opportunity ? row('Opportunity', U.esc(s.opportunity)) : '') +
        (s.blockers ? row('Blockers', U.esc(s.blockers) + '<div class="small muted">' + s.blockerTags.map(M.blockerLabel).join(', ') + '</div>') : '') +
        (s.competitors.length ? row('Competition', U.esc(s.competitors.join(', '))) : '') +
        (s.remarks ? row('Remarks', U.esc(s.remarks)) : '') +
        '</dl>' : '') +
      (missing.length ? '<div class="insight warn" style="margin-top:16px"><span class="insight-ico">📋</span><div>' +
        '<strong>' + missing.length + ' required field' + (missing.length === 1 ? '' : 's') + ' still empty</strong>' +
        '<p>' + U.esc(missing.join(', ')) + '. Logging an update fills most of these in.</p></div></div>' : '') +
      '<div class="section-title">Activity history</div>' + timeline;

    modal(s.name, html, {
      wide: true,
      onMount: function (host) {
        var log = host.querySelector('[data-act="log"]');
        if (log) log.addEventListener('click', function () { logActivityForm(schoolId); });
        var ed = host.querySelector('[data-act="edit"]');
        if (ed) ed.addEventListener('click', function () { schoolForm(schoolId); });
      }
    });
  }

  function row(k, v) { return '<dt>' + U.esc(k) + '</dt><dd>' + v + '</dd>'; }

  /* --------------------------------------------------------------- insights */
  function insightList(items, onClick) {
    if (!items.length) return '<div class="empty">Nothing needs attention right now.</div>';
    return items.map(function (i) {
      return '<div class="insight ' + (i.level === 'bad' ? 'bad' : i.level === 'good' ? 'good' : 'warn') + '"' +
        (onClick && i.dim ? ' data-insight="' + U.esc(i.dim) + '" style="cursor:pointer"' : '') + '>' +
        '<span class="insight-ico">' + i.icon + '</span><div><strong>' + U.esc(i.title) + '</strong><p>' + U.esc(i.body) + '</p></div></div>';
    }).join('');
  }

  return {
    toast: toast, modal: modal, closeModal: closeModal, stat: stat, statRow: statRow,
    stageTag: stageTag, healthTag: healthTag, meter: meter, table: table,
    schoolColumns: schoolColumns, exportSchools: exportSchools, exportActivities: exportActivities,
    select: select, field: field, formValues: formValues, logActivityForm: logActivityForm,
    schoolForm: schoolForm, schoolDetail: schoolDetail, insightList: insightList,
    EXPORT_COLUMNS: EXPORT_COLUMNS
  };
})();
