/* Robobox Sales OS - boot, routing, navigation. */
window.RB = window.RB || {};

RB.app = (function () {
  'use strict';

  var U = RB.util, M = RB.metrics, UI = RB.ui;
  var current = null;

  var ROUTES = {
    'my-day':    { label: 'Today',           icon: '◎', group: 'Sales', render: function (h) { RB.viewsSales.myDay(h); } },
    'progress':  { label: 'My dashboard',    icon: '◔', group: 'Sales', render: function (h) { RB.viewsSales.myProgress(h); } },
    'pipeline':  { label: 'My pipeline',     icon: '▤', group: 'Sales', render: function (h) { RB.viewsSales.myPipeline(h); } },
    'activity':  { label: 'Activity log',    icon: '✎', group: 'Sales', render: function (h) { RB.viewsSales.myActivity(h); } },
    // The CEO gets the fuller version of this under Leadership, so it is not
    // repeated in the Sales group for him.
    'team':      { label: 'Team performance', icon: '⚇', group: 'Sales', need: 'teamRollup',
                   hideFor: 'ceoDashboard', render: function (h) { RB.viewsSales.teamRollup(h); } },

    'ceo':       { label: 'Command centre',  icon: '◆', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.commandCentre(h); } },
    'ceo-team':  { label: 'Team performance', icon: '⚇', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.team(h); } },
    'ceo-market':{ label: 'Market',          icon: '⬡', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.market(h); } },
    'ceo-blocks':{ label: 'Blockers',        icon: '⚑', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.blockers(h); } },
    'ceo-deep':  { label: 'Deep dive',       icon: '⌗', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.explorer(h); } },
    'ceo-health':{ label: 'Data health',     icon: '✚', group: 'Leadership', need: 'ceoDashboard', render: function (h) { RB.viewsCEO.health(h); } },

    'settings':  { label: 'Settings',        icon: '⚙', group: 'Account', render: settings }
  };

  function allowed(key) {
    var r = ROUTES[key];
    if (!r) return false;
    if (r.need && !RB.auth.can(r.need)) return false;
    if (r.hideFor && RB.auth.can(r.hideFor)) return false;
    return true;
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

      (RB.auth.can('teamRollup')
        ? '<div class="card"><div class="card-head"><h3>Monthly targets</h3>' +
          '<span class="card-sub">what each person is measured against, per month</span></div>' +
          '<form id="targets-form"><div class="table-wrap"><table class="data"><thead><tr>' +
          '<th>Sales person</th><th class="num">Revenue (₹)</th><th class="num">Schools approached</th>' +
          '<th class="num">Meetings</th><th class="num">Updates logged</th></tr></thead><tbody>' +
          RB.store.users().map(function (u) {
            var t = u.targets || {};
            return '<tr><td class="strong">' + U.esc(u.name) +
              (t.placeholder ? ' <span class="tag tag-warning">placeholder</span>' : '') + '</td>' +
              ['revenue', 'schoolsApproached', 'meetings', 'updates'].map(function (k) {
                return '<td class="num"><input class="input" style="max-width:130px" type="number" min="0" name="' +
                  u.id + '.' + k + '" value="' + (t[k] || 0) + '"></td>';
              }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>' +
          '<button class="btn btn-primary" type="submit" style="margin-top:12px">Save targets</button></form></div>'
        : '') +

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

    var tf = host.querySelector('#targets-form');
    if (tf) tf.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formValues(this);
      var byUser = {};
      Object.keys(v).forEach(function (k) {
        var p = k.split('.');
        (byUser[p[0]] = byUser[p[0]] || {})[p[1]] = Number(v[k]) || 0;
      });
      Object.keys(byUser).forEach(function (id) { RB.store.updateTargets(id, byUser[id]); });
      UI.toast('Targets saved.');
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
    // Only stamp a theme we were actually asked for. With nothing stored we
    // leave the attribute alone, so a host page that has already set one
    // (or the OS setting, via prefers-color-scheme) still decides.
    if (stored) document.documentElement.setAttribute('data-theme', stored);

    document.getElementById('theme-toggle').addEventListener('click', function () {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('robobox.theme', next); } catch (e) {}
    });
  }

  function init() {
    RB.charts.initTooltip();
    initTheme();

    RB.store.load().then(start).catch(function (err) {
      document.body.innerHTML = '<div class="login"><div class="login-card">' +
        '<h2>Could not load the pipeline</h2>' +
        '<p class="login-sub">' + U.esc(err.message || 'The data source did not respond.') + '</p>' +
        '<p class="login-hint">Check the database settings, then reload.</p></div></div>';
    });
  }

  function start() {
    initSearch();

    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = document.getElementById('login-error');
      // signIn is synchronous in the demo build and a promise once a real auth
      // module replaces it, so treat both the same.
      Promise.resolve(RB.auth.signIn(
        document.getElementById('login-user').value,
        document.getElementById('login-pin').value
      )).then(function (res) {
        if (!res.ok) { err.textContent = res.error; err.hidden = false; return; }
        err.hidden = true;
        document.getElementById('login-pin').value = '';
        showShell();
      });
    });

    document.getElementById('logout').addEventListener('click', function () {
      Promise.resolve(RB.auth.signOut()).then(function () {
        current = null;
        showLogin();
      });
    });

    document.getElementById('top-log').addEventListener('click', function () { UI.quickLog(); });

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

    Promise.resolve(RB.auth.restore()).then(function (user) {
      if (user) showShell(); else showLogin();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { go: go, refresh: refresh, ROUTES: ROUTES };
})();
