/* Robobox Sales OS - boot, routing, navigation. */
window.RB = window.RB || {};

RB.app = (function () {
  'use strict';

  var U = RB.util, M = RB.metrics, UI = RB.ui;
  var current = null;

  var ROUTES = {
    'my-day':    { label: 'My day',          icon: '◎', group: 'Sales', render: function (h) { RB.viewsSales.myDay(h); } },
    'pipeline':  { label: 'My pipeline',     icon: '▤', group: 'Sales', render: function (h) { RB.viewsSales.myPipeline(h); } },
    'activity':  { label: 'Activity log',    icon: '✎', group: 'Sales', render: function (h) { RB.viewsSales.myActivity(h); } },
    'progress':  { label: 'My progress',     icon: '◔', group: 'Sales', render: function (h) { RB.viewsSales.myProgress(h); } },
    'team':      { label: 'Team roll-up',    icon: '⛭', group: 'Sales', need: 'teamRollup', render: function (h) { RB.viewsSales.teamRollup(h); } },

    'ceo':       { label: 'Command centre',  icon: '◆', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.commandCenter(h); } },
    'ceo-funnel':{ label: 'Funnel',          icon: '▽', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.funnelView(h); } },
    'ceo-market':{ label: 'Market',          icon: '⬡', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.market(h); } },
    'ceo-team':  { label: 'Team',            icon: '⚇', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.team(h); } },
    'ceo-blocks':{ label: 'Blockers',        icon: '⚑', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.blockers(h); } },
    'ceo-health':{ label: 'Pipeline health', icon: '✚', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.health(h); } },
    'ceo-deep':  { label: 'Deep dive',       icon: '⌗', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.explorer(h); } },

    'settings':  { label: 'Settings',        icon: '⚙', group: 'Account', render: settings }
  };

  function allowed(key) {
    var r = ROUTES[key];
    if (!r) return false;
    return !r.need || RB.auth.can(r.need);
  }

  function defaultRoute() {
    return RB.auth.can('ceoDashboard') ? 'ceo' : 'my-day';
  }

  /* ------------------------------------------------------------- rendering */
  function nav() {
    var host = document.getElementById('sidebar');
    var mine = RB.auth.visibleSchools();
    var limit = RB.store.settings().stalledAfterDays;
    var badges = {
      'my-day': mine.filter(M.isOverdue).length,
      'pipeline': null,
      'ceo-health': RB.store.all().filter(function (s) { return M.isWorking(s) && M.missingFields(s).length; }).length
    };

    var groups = {};
    Object.keys(ROUTES).forEach(function (k) {
      if (!allowed(k)) return;
      (groups[ROUTES[k].group] = groups[ROUTES[k].group] || []).push(k);
    });

    host.innerHTML = Object.keys(groups).map(function (g) {
      return '<div class="nav-group"><h4>' + U.esc(g) + '</h4>' + groups[g].map(function (k) {
        var r = ROUTES[k];
        var b = badges[k];
        return '<button class="nav-item" data-route="' + k + '"' + (current === k ? ' aria-current="page"' : '') + '>' +
          '<span class="nav-ico">' + r.icon + '</span>' + U.esc(r.label) +
          (b ? '<span class="nav-badge' + (k === 'my-day' ? ' alarm' : '') + '">' + U.count(b) + '</span>' : '') +
          '</button>';
      }).join('') + '</div>';
    }).join('');

    host.querySelectorAll('[data-route]').forEach(function (b) {
      b.addEventListener('click', function () {
        go(b.getAttribute('data-route'));
        document.getElementById('shell').classList.remove('nav-open');
      });
    });
  }

  function go(route) {
    if (!allowed(route)) route = defaultRoute();
    current = route;
    location.hash = '#/' + route;
    nav();
    var main = document.getElementById('main');
    main.innerHTML = '';
    ROUTES[route].render(main);
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function refresh() {
    if (current) go(current);
  }

  /* -------------------------------------------------------------- settings */
  function settings(host) {
    var s = RB.store.settings();
    var me = RB.auth.user();
    var canManage = RB.auth.can('manageSettings');
    var meta = RB.store.meta();

    host.innerHTML = RB.viewsSales.head('Settings', 'Your account, and how the numbers are calculated.') +
      '<div class="grid grid-2">' +
      '<div class="card"><div class="card-head"><h3>You</h3></div><dl class="kv">' +
        '<dt>Name</dt><dd>' + U.esc(me.name) + '</dd>' +
        '<dt>Role</dt><dd>' + U.esc(RB.auth.roleLabel(me.role)) + '</dd>' +
        '<dt>Email</dt><dd>' + U.esc(me.email) + '</dd>' +
        '<dt>Sees</dt><dd>' + U.esc({ own: 'Only their own accounts', team: 'The whole team\'s accounts', all: 'Everything' }[RB.auth.scope()]) + '</dd>' +
        '<dt>CEO dashboard</dt><dd>' + (RB.auth.can('ceoDashboard') ? 'Yes' : 'No') + '</dd>' +
        '<dt>Can download data</dt><dd>Yes' + (RB.auth.can('exportAll') ? ' (all records in view)' : ' (own records)') + '</dd>' +
      '</dl></div>' +

      '<div class="card"><div class="card-head"><h3>Calculation rules</h3></div>' +
        (canManage
          ? '<form id="settings-form">' +
            UI.field('TAM rate per student (₹)', '<input class="input" type="number" name="tamRatePerStudent" min="1" value="' + s.tamRatePerStudent + '">',
                     'The sheet quotes ₹1,700 for the lab programme and ₹400 for workshops.') +
            UI.field('Treat an account as “gone quiet” after (days)', '<input class="input" type="number" name="stalledAfterDays" min="1" max="365" value="' + s.stalledAfterDays + '">') +
            '<button class="btn btn-primary" type="submit">Save</button></form>'
          : '<dl class="kv"><dt>TAM rate</dt><dd>₹' + U.count(s.tamRatePerStudent) + ' per student</dd>' +
            '<dt>Gone quiet after</dt><dd>' + s.stalledAfterDays + ' days</dd></dl>' +
            '<p class="small muted">Only the CEO can change these.</p>') +
        '<div class="section-title">Stage probabilities</div>' +
        '<div class="chip-row">' + M.STAGES.map(function (st) {
          return '<span class="tag">' + U.esc(st.key) + ' · ' + st.prob + '%</span>';
        }).join('') + '</div>' +
      '</div></div>' +

      '<div class="card"><div class="card-head"><h3>Data source</h3></div><dl class="kv">' +
        '<dt>Imported from</dt><dd>' + U.esc(meta.source) + '</dd>' +
        '<dt>Rows in source</dt><dd>' + U.count(meta.rowsInSource) + '</dd>' +
        '<dt>Schools loaded</dt><dd>' + U.count(RB.store.all().length) + '</dd>' +
        '<dt>Updates logged since</dt><dd>' + U.count(RB.store.activities().length) + '</dd>' +
        '<dt>Stored in</dt><dd>This browser (pilot mode). See the README for switching to a shared database.</dd>' +
      '</dl>' +
      '<div class="row wrap" style="margin-top:14px">' +
        '<button class="btn" id="backup">Download a full backup (JSON)</button>' +
        '<button class="btn" id="restore">Restore from a backup</button>' +
        '<input type="file" id="restore-file" accept="application/json" hidden>' +
        (canManage ? '<button class="btn btn-danger" id="reset">Reset to the imported sheet</button>' : '') +
      '</div></div>';

    var form = host.querySelector('#settings-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formValues(this);
      RB.store.updateSettings({
        tamRatePerStudent: Number(v.tamRatePerStudent) || 1700,
        stalledAfterDays: Number(v.stalledAfterDays) || 30
      });
      UI.toast('Saved.');
      refresh();
    });

    host.querySelector('#backup').addEventListener('click', function () {
      U.download('robobox-backup-' + U.iso(U.today()) + '.json', RB.store.exportState(), 'application/json');
    });
    host.querySelector('#restore').addEventListener('click', function () { host.querySelector('#restore-file').click(); });
    host.querySelector('#restore-file').addEventListener('change', function () {
      var f = this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { RB.store.importState(reader.result); UI.toast('Backup restored.'); refresh(); }
        catch (err) { UI.toast('That file is not a Robobox backup.'); }
      };
      reader.readAsText(f);
    });
    var reset = host.querySelector('#reset');
    if (reset) reset.addEventListener('click', function () {
      UI.modal('Reset everything?', '<p class="sec" style="margin-top:0">This throws away every update logged in this browser and reloads the ' +
        U.count(window.ROBOBOX_SEED.schools.length) + ' schools exactly as they came out of the master sheet. Download a backup first if you want to keep anything.</p>' +
        '<div class="modal-actions"><button class="btn" data-close="1">Cancel</button>' +
        '<button class="btn btn-danger" id="reset-yes">Reset</button></div>', {
        onMount: function (h) {
          h.querySelector('#reset-yes').addEventListener('click', function () {
            RB.store.resetDemo(); UI.closeModal(); UI.toast('Reset to the imported sheet.'); refresh();
          });
        }
      });
    });
  }

  /* --------------------------------------------------------- global search */
  function initSearch() {
    var input = document.getElementById('global-search');
    var panel = document.getElementById('search-results');
    if (!input) return;

    input.addEventListener('input', U.debounce(function () {
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) { panel.hidden = true; return; }
      var hits = RB.auth.visibleSchools().filter(function (s) {
        return [s.name, s.location, s.region, s.decisionMaker, s.opportunity].join(' ').toLowerCase().indexOf(q) !== -1;
      }).slice(0, 12);
      panel.innerHTML = hits.length
        ? hits.map(function (s) {
            return '<button data-id="' + U.esc(s.id) + '"><strong>' + U.esc(s.name) + '</strong>' +
              '<div class="sr-sub">' + U.esc([s.location, s.region, s.owners.join('/')].filter(Boolean).join(' · ')) +
              (s.dealSize ? ' · ' + U.money(s.dealSize) : '') + '</div></button>';
          }).join('')
        : '<div class="sr-empty">Nothing matching “' + U.esc(input.value) + '”.</div>';
      panel.hidden = false;
      panel.querySelectorAll('[data-id]').forEach(function (b) {
        b.addEventListener('click', function () {
          panel.hidden = true; input.value = '';
          UI.schoolDetail(b.getAttribute('data-id'));
        });
      });
    }, 180));

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.topbar-search')) panel.hidden = true;
    });
  }

  /* ------------------------------------------------------------------ boot */
  function showLogin() {
    document.getElementById('shell').hidden = true;
    var login = document.getElementById('login');
    login.hidden = false;
    var sel = document.getElementById('login-user');
    sel.innerHTML = RB.store.users().map(function (u) {
      return '<option value="' + U.esc(u.id) + '">' + U.esc(u.name) + ' — ' + U.esc(RB.auth.roleLabel(u.role)) + '</option>';
    }).join('');
  }

  function showShell() {
    document.getElementById('login').hidden = true;
    document.getElementById('shell').hidden = false;
    var u = RB.auth.user();
    document.getElementById('user-name').textContent = u.name;
    document.getElementById('user-role').textContent = RB.auth.roleLabel(u.role);
    document.getElementById('user-avatar').textContent = U.initials(u.name);
    var hash = (location.hash || '').replace('#/', '');
    go(allowed(hash) ? hash : defaultRoute());
  }

  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem('robobox.theme'); } catch (e) {}
    if (stored) document.documentElement.setAttribute('data-theme', stored);
    else document.documentElement.removeAttribute('data-theme');

    document.getElementById('theme-toggle').addEventListener('click', function () {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('robobox.theme', next); } catch (e) {}
    });
  }

  function init() {
    RB.store.load();
    RB.charts.initTooltip();
    initTheme();
    initSearch();

    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = document.getElementById('login-error');
      var res = RB.auth.signIn(document.getElementById('login-user').value, document.getElementById('login-pin').value);
      if (!res.ok) { err.textContent = res.error; err.hidden = false; return; }
      err.hidden = true;
      document.getElementById('login-pin').value = '';
      showShell();
    });

    document.getElementById('logout').addEventListener('click', function () {
      RB.auth.signOut();
      current = null;
      showLogin();
    });

    document.getElementById('nav-toggle').addEventListener('click', function () {
      document.getElementById('shell').classList.toggle('nav-open');
    });

    document.getElementById('modal-root').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) UI.closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') UI.closeModal();
    });

    window.addEventListener('hashchange', function () {
      var h = (location.hash || '').replace('#/', '');
      // go() falls back to the role's default when the route is not permitted,
      // so a hand-typed #/ceo cannot leave a rep parked on the previous screen.
      if (RB.auth.user() && h && h !== current) go(h);
    });

    if (RB.auth.restore()) showShell(); else showLogin();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { go: go, refresh: refresh, ROUTES: ROUTES };
})();
