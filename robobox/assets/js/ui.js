/* Robobox Connect - shared UI atoms. */
window.RB = window.RB || {};

RB.ui = (function () {
  'use strict';
  var U = RB.util;
  var toastTimer;

  function toast(msg, action) {
    var el = document.getElementById('toast');
    el.innerHTML = '<span>' + U.esc(msg) + '</span>' +
      (action ? '<button type="button" id="toast-action">' + U.esc(action.label) + '</button>' : '');
    el.hidden = false;
    if (action) {
      el.querySelector('#toast-action').addEventListener('click', function () {
        el.hidden = true; action.run();
      });
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, action ? 7000 : 2800);
  }

  function modal(title, body, opts) {
    opts = opts || {};
    var root = document.getElementById('modal-root');
    root.querySelector('.modal').classList.toggle('wide', !!opts.wide);
    document.getElementById('modal-title').textContent = title;
    var host = document.getElementById('modal-body');
    host.innerHTML = '';
    if (typeof body === 'string') host.innerHTML = body; else host.appendChild(body);
    root.hidden = false;
    host.scrollTop = 0;
    if (opts.onMount) opts.onMount(host);
    return host;
  }
  function closeModal() { document.getElementById('modal-root').hidden = true; }

  function stat(o) {
    return '<div class="stat' + (o.cls ? ' ' + o.cls : '') + (o.onClick ? ' clickable' : '') + '"' +
      (o.onClick ? ' data-stat="' + U.esc(o.onClick) + '" role="button" tabindex="0"' : '') +
      (o.title ? ' title="' + U.esc(o.title) + '"' : '') + '>' +
      '<div class="stat-label">' + U.esc(o.label) + '</div>' +
      '<div class="stat-value' + (o.small ? ' sm' : '') + '">' + U.esc(o.value) + '</div>' +
      (o.foot ? '<div class="stat-foot' + (o.footBad ? ' bad' : '') + '">' + U.esc(o.foot) + '</div>' : '') +
      '</div>';
  }
  function stats(items) { return '<div class="stats">' + items.join('') + '</div>'; }

  function head(title, sub, actions) {
    return '<div class="page-head"><div><h1>' + U.esc(title) + '</h1>' +
      (sub ? '<p>' + U.esc(sub) + '</p>' : '') + '</div>' +
      (actions ? '<div class="spacer">' + actions + '</div>' : '') + '</div>';
  }

  function card(title, sub, body) {
    return '<div class="card"><div class="card-head"><h3>' + U.esc(title) + '</h3>' +
      (sub ? '<span class="card-sub">' + U.esc(sub) + '</span>' : '') + '</div>' + body + '</div>';
  }

  function stageTag(v) {
    var cls = v.stage === 'Won' ? 'tag-brand' : v.stage === 'Lost' ? 'tag-red' : 'tag-dark';
    return '<span class="tag ' + cls + '">' + U.esc(v.stage) + '</span>';
  }

  function interestTag(level) {
    if (!level) return '';
    return '<span class="tag tag-' + level.toLowerCase() + '">' + U.esc(level) + '</span>';
  }

  function select(name, options, value, opts) {
    opts = opts || {};
    return '<select class="input" name="' + U.esc(name) + '"' + (opts.required ? ' required' : '') + '>' +
      (opts.placeholder ? '<option value="">' + U.esc(opts.placeholder) + '</option>' : '') +
      options.map(function (o) {
        var v = typeof o === 'string' ? o : o.value, l = typeof o === 'string' ? o : o.label;
        return '<option value="' + U.esc(v) + '"' + (String(value) === String(v) ? ' selected' : '') + '>' +
          U.esc(l) + '</option>';
      }).join('') + '</select>';
  }

  function field(label, control, hint) {
    return '<label class="field"><span class="field-label">' + U.esc(label) + '</span>' + control +
      (hint ? '<span class="field-hint">' + U.esc(hint) + '</span>' : '') + '</label>';
  }

  /* Big tap targets, one choice per row group. Used everywhere a dropdown
   * would be slower than a thumb. */
  function choice(name, options, value, opts) {
    opts = opts || {};
    return '<div class="choice' + (opts.tight ? ' tight' : '') + '" data-choice="' + U.esc(name) + '">' +
      options.map(function (o) {
        var v = typeof o === 'string' ? o : o.value;
        var l = typeof o === 'string' ? o : o.label;
        var sub = typeof o === 'object' ? o.sub : null;
        return '<button type="button" data-value="' + U.esc(v) + '" aria-pressed="' + (v === value) + '">' +
          U.esc(l) + (sub ? '<small>' + U.esc(sub) + '</small>' : '') + '</button>';
      }).join('') +
      '</div><input type="hidden" name="' + U.esc(name) + '" value="' + U.esc(value || '') + '">';
  }

  /* Wire every choice group inside a container. */
  function bindChoices(host, onPick) {
    host.querySelectorAll('[data-choice]').forEach(function (group) {
      var name = group.getAttribute('data-choice');
      var hidden = group.parentNode.querySelector('input[name="' + name + '"]');
      group.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-value]');
        if (!b) return;
        group.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        if (hidden) hidden.value = b.getAttribute('data-value');
        if (onPick) onPick(name, b.getAttribute('data-value'));
      });
    });
  }

  /* Every date field in the app opens the native calendar on click instead of
   * asking anyone to type into dd/mm/yyyy boxes. */
  function bindDatePickers(host) {
    host.querySelectorAll('input[type=date]').forEach(function (i) {
      if (i.dataset.picker) return;
      i.dataset.picker = '1';
      i.addEventListener('click', function () { try { i.showPicker(); } catch (e) {} });
    });
  }

  function values(form) {
    var out = {};
    new FormData(form).forEach(function (v, k) { out[k] = typeof v === 'string' ? v.trim() : v; });
    return out;
  }

  /* ------------------------------------------------------------- calendar */
  /* One month grid. The rep's calendar and the CEO's day picker are the same
   * thing - a month, a count per day, one selected day - so there is one of
   * them. `get(iso)` returns { n, title } for a day; a day with nothing on it
   * is left plain, which is how you spot the days that have something. */
  var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function monthGrid(o) {
    var y = +o.month.slice(0, 4), m = +o.month.slice(5, 7);
    var lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;      // Monday-first
    var weeks = Math.ceil((lead + new Date(y, m, 0).getDate()) / 7);
    var todayISO = U.iso(U.today());

    var cells = '';
    for (var i = 0; i < weeks * 7; i++) {
      var d = new Date(y, m - 1, 1 - lead + i);
      var iso = U.iso(d);
      var info = (o.get && o.get(iso)) || {};
      cells += '<button type="button" class="cal-cell' +
        (d.getMonth() !== m - 1 ? ' is-out' : '') +
        (iso === todayISO ? ' is-today' : '') + '"' +
        ' data-day="' + iso + '"' +
        (iso === o.selected ? ' aria-pressed="true"' : '') +
        (o.max && iso > o.max ? ' disabled' : '') +
        (info.title ? ' title="' + U.esc(info.title) + '"' : '') + '>' +
        '<span class="cal-num">' + d.getDate() + '</span>' +
        (info.n ? '<span class="cal-dot">' + U.esc(U.count(info.n)) + '</span>' : '') +
        '</button>';
    }

    return '<div class="cal">' +
      '<div class="cal-head">' +
        '<button type="button" class="icon-btn" data-mon="-1" aria-label="Previous month">‹</button>' +
        '<strong>' + U.esc(U.monthLabel(o.month)) + '</strong>' +
        '<button type="button" class="icon-btn" data-mon="1" aria-label="Next month">›</button>' +
        '<span class="spacer"></span>' +
        (o.legend ? '<span class="small muted">' + U.esc(o.legend) + '</span>' : '') +
        '<button type="button" class="btn btn-sm" data-day="' + todayISO + '">Today</button>' +
      '</div>' +
      '<div class="cal-week">' + WEEKDAYS.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="cal-grid">' + cells + '</div></div>';
  }

  function bindMonthGrid(host, onPick, onMonth) {
    host.querySelectorAll('.cal [data-day]').forEach(function (b) {
      b.addEventListener('click', function () { onPick(b.getAttribute('data-day')); });
    });
    host.querySelectorAll('.cal [data-mon]').forEach(function (b) {
      b.addEventListener('click', function () { onMonth(+b.getAttribute('data-mon')); });
    });
  }

  /* Sortable, paged table. */
  function table(container, cfg) {
    var st = { key: cfg.sortKey || null, dir: cfg.sortDir || 'desc', page: 0, size: cfg.pageSize || 20 };
    function render() {
      var rows = cfg.rows.slice();
      if (st.key) {
        var col = cfg.columns.filter(function (c) { return c.key === st.key; })[0];
        if (col) rows = U.sortBy(rows, col.sortValue || col.get, st.dir);
      }
      var pages = Math.max(1, Math.ceil(rows.length / st.size));
      if (st.page >= pages) st.page = pages - 1;
      var slice = rows.slice(st.page * st.size, (st.page + 1) * st.size);

      container.innerHTML = '<div class="table-wrap"><table class="data"><thead><tr>' +
        cfg.columns.map(function (c) {
          var arrow = st.key === c.key ? (st.dir === 'asc' ? ' ↑' : ' ↓') : '';
          return '<th class="' + (c.num ? 'num ' : '') + (c.sortable === false ? '' : 'sortable') + '"' +
            (c.sortable === false ? '' : ' data-sort="' + U.esc(c.key) + '"') + '>' + U.esc(c.label) + arrow + '</th>';
        }).join('') + '</tr></thead><tbody>' +
        (slice.length ? slice.map(function (r, i) {
          return '<tr' + (cfg.onRowClick ? ' class="row-link" data-row="' + U.esc(cfg.rowId(r)) + '"' : '') + '>' +
            cfg.columns.map(function (c) {
              return '<td class="' + (c.num ? 'num' : '') + '">' + (c.render ? c.render(r, i) : U.esc(c.get(r))) + '</td>';
            }).join('') + '</tr>';
        }).join('') : '<tr><td colspan="' + cfg.columns.length + '"><div class="table-empty">' +
          U.esc(cfg.empty || 'Nothing here yet.') + '</div></td></tr>') +
        '</tbody></table>' +
        (rows.length > st.size
          ? '<div class="table-foot"><span>' + (st.page * st.size + 1) + '–' +
            Math.min(rows.length, (st.page + 1) * st.size) + ' of ' + U.count(rows.length) + '</span>' +
            '<span class="spacer"></span>' +
            '<button class="btn btn-sm" data-page="prev"' + (st.page === 0 ? ' disabled' : '') + '>Previous</button>' +
            '<button class="btn btn-sm" data-page="next"' + (st.page >= pages - 1 ? ' disabled' : '') + '>Next</button></div>'
          : '<div class="table-foot"><span>' + U.count(rows.length) + ' row' + (rows.length === 1 ? '' : 's') + '</span></div>') +
        '</div>';

      container.querySelectorAll('th[data-sort]').forEach(function (th) {
        th.addEventListener('click', function () {
          var k = th.getAttribute('data-sort');
          if (st.key === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.key = k; st.dir = 'desc'; }
          render();
        });
      });
      container.querySelectorAll('[data-page]').forEach(function (b) {
        b.addEventListener('click', function () {
          st.page += b.getAttribute('data-page') === 'next' ? 1 : -1; render();
        });
      });
      if (cfg.onRowClick) {
        container.querySelectorAll('tr[data-row]').forEach(function (tr) {
          tr.addEventListener('click', function (e) {
            if (e.target.closest('button,a,select,input')) return;
            cfg.onRowClick(tr.getAttribute('data-row'));
          });
        });
      }
    }
    render();
    return { render: render };
  }

  /* Standard opportunity columns, reused by every list in the app. */
  function oppColumns(opts) {
    opts = opts || {};
    var cols = [
      { key: 'school', label: 'School', get: function (v) { return v.school ? v.school.name : ''; },
        render: function (v) {
          return '<span class="strong">' + U.esc(v.school ? v.school.name : '—') + '</span>' +
            '<div class="small muted">' + U.esc([v.school && v.school.location, v.opp.offering].filter(Boolean).join(' · ')) + '</div>';
        } },
      { key: 'stage', label: 'Stage', get: function (v) { return v.stageRank; }, render: stageTag },
      { key: 'value', label: 'Value', num: true, get: function (v) { return v.current || 0; },
        render: function (v) {
          return U.money(v.current) + (v.initialPotential && v.current !== v.initialPotential
            ? '<div class="small muted">from ' + U.money(v.initialPotential) + '</div>' : '');
        } },
      { key: 'last', label: 'Last connect', num: true,
        get: function (v) { return v.lastAt ? -U.daysSince(v.lastAt) : -99999; },
        render: function (v) {
          return v.lastAt
            ? '<span class="nowrap">' + U.esc(U.fmtDate(v.lastAt)) + '</span><div class="small muted">' +
              U.esc(U.relative(v.lastAt)) + '</div>'
            : '<span class="muted">never</span>';
        } },
      { key: 'next', label: 'Next Step', get: function (v) { return v.nextAction || ''; },
        render: function (v) {
          if (!v.nextAction) return '<span class="tag tag-red">None set</span>';
          return U.esc(v.nextAction) + (v.nextActionAt
            ? '<div class="small ' + (v.overdue ? '' : 'muted') + '">' +
              (v.overdue ? '<span class="tag tag-red">overdue ' + U.esc(U.fmtDate(v.nextActionAt.slice(0, 10))) + '</span>'
                         : U.esc(U.fmtDate(v.nextActionAt.slice(0, 10)))) + '</div>' : '');
        } },
      { key: 'owner', label: 'Owner', get: function (v) { return v.owner || 'Unassigned'; },
        render: function (v) { return v.owner ? U.esc(v.owner) : '<span class="tag tag-red">Unassigned</span>'; } }
    ];
    if (opts.hide) cols = cols.filter(function (c) { return opts.hide.indexOf(c.key) === -1; });
    return cols;
  }

  /* A drill-down list of opportunities, from any number anywhere. */
  function drill(title, vs) {
    var holder = document.createElement('div');
    holder.innerHTML = '<div id="drill-table"></div>';
    modal(title + ' · ' + vs.length, holder, {
      wide: true,
      onMount: function (h) {
        table(h.querySelector('#drill-table'), {
          rows: vs, rowId: function (v) { return v.opp.id; }, sortKey: 'value', pageSize: 15,
          columns: oppColumns(), onRowClick: function (id) { RB.views.school(RB.store.opportunityById(id).schoolId); },
          empty: 'Nothing here.'
        });
      }
    });
  }

  return {
    toast: toast, modal: modal, closeModal: closeModal, stat: stat, stats: stats,
    head: head, card: card, stageTag: stageTag, interestTag: interestTag,
    select: select, field: field, choice: choice, bindChoices: bindChoices,
    values: values, bindDatePickers: bindDatePickers, table: table, oppColumns: oppColumns, drill: drill,
    monthGrid: monthGrid, bindMonthGrid: bindMonthGrid
  };
})();
