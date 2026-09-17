/* Robobox Connect - boot, routing, navigation. */
window.RB = window.RB || {};

RB.app = (function () {
  'use strict';

  var U = RB.util, M = RB.model, UI = RB.ui;
  var current = null;

  var ROUTES = {
    'day':       { label: 'My day',        icon: '◉', group: 'Sell',       render: RB.views.myDay },
    'tasks':     { label: 'My tasks',      icon: '☑', group: 'Sell',       render: RB.views.myTasks },
    'calendar':  { label: 'My calendar',   icon: '▦', group: 'Sell',       render: RB.views.myCalendar },
    'schools':   { label: 'My schools',    icon: '◫', group: 'Sell',       render: RB.views.mySchools },
    'scorecard': { label: 'My performance', icon: '◑', group: 'Sell',      render: RB.views.myScorecard },

    /* The command centre: four tabs, one filter bar, one set of formulas. */
    'business':  { label: 'Business',      icon: '◆', group: 'Command centre', need: 'ceo', render: RB.ceo.business },
    'sales':     { label: 'Sales',         icon: '⚇', group: 'Command centre', need: 'ceo', render: RB.ceo.sales },
    'market':    { label: 'Market',        icon: '◈', group: 'Command centre', need: 'ceo', render: RB.ceo.market },
    'win':       { label: 'Win',           icon: '★', group: 'Command centre', need: 'ceo', render: RB.ceo.win },

    'settings':  { label: 'Settings',      icon: '⚙', group: 'Account',    render: settings }
  };

  function allowed(r) {
    var route = ROUTES[r];
    return !!route && (!route.need || RB.auth.can('ceoDashboard'));
  }
  function defaultRoute() { return RB.auth.can('ceoDashboard') ? 'business' : 'day'; }

  function nav() {
    var ts = M.tasks(RB.auth.user().id);
    var badges = {
      day: ts.filter(function (t) { return t.bucket === 'Overdue'; }).length,
      tasks: ts.length
    };
    if (RB.auth.can('ceoDashboard')) {
      badges.business = M.needsAttention(M.views(), M.fitModel(M.views())).length;
    }
    var groups = {};
    Object.keys(ROUTES).forEach(function (k) {
      if (!allowed(k)) return;
      (groups[ROUTES[k].group] = groups[ROUTES[k].group] || []).push(k);
    });

    var u = RB.auth.user();
    var host = document.getElementById('sidebar');
    host.innerHTML =
      '<div class="rail-brand"><span class="logo">R</span><span>Robobox<small>Connect</small></span></div>' +
      Object.keys(groups).map(function (g) {
      return '<div class="nav-group"><h4>' + U.esc(g) + '</h4>' + groups[g].map(function (k) {
        var r = ROUTES[k], b = badges[k];
        return '<button class="nav-item" data-route="' + k + '"' +
          (current === k ? ' aria-current="page"' : '') + '>' +
          '<span class="nav-ico">' + r.icon + '</span>' + U.esc(r.label) +
          (b ? '<span class="badge' + (k === 'day' ? ' alarm' : '') + '">' + U.count(b) + '</span>' : '') +
          '</button>';
      }).join('') + '</div>';
    }).join('') +
      '<div class="rail-user"><span class="avatar">' + U.esc(U.initials(u.name)) + '</span>' +
      '<span class="rail-user-meta"><strong>' + U.esc(u.name) + '</strong>' +
      '<small>' + U.esc(RB.auth.roleLabel(u.role)) + '</small></span></div>' +
      '<button class="rail-signout" id="rail-signout">Sign out</button>';

    host.querySelectorAll('[data-route]').forEach(function (b) {
      b.addEventListener('click', function () {
        go(b.getAttribute('data-route'));
        document.getElementById('shell').classList.remove('nav-open');
      });
    });
    host.querySelector('#rail-signout').addEventListener('click', signOut);
  }

  function go(route) {
    if (!allowed(route)) route = defaultRoute();
    current = route;
    location.hash = '#/' + route;
    nav();
    var main = document.getElementById('main');
    main.innerHTML = '';
    ROUTES[route].render(main);
    window.scrollTo(0, 0);
  }

  function refresh() { if (current) go(current); }

  function signOut() {
    UI.modal('Sign out?',
      '<p class="sec" style="margin-top:0">You will be returned to the sign-in screen. ' +
      'Anything you have logged stays saved.</p>' +
      '<div class="modal-actions"><button class="btn" data-close="1">Stay signed in</button>' +
      '<button class="btn btn-dark" id="so-yes">Sign out</button></div>',
      { onMount: function (h) {
          h.querySelector('#so-yes').addEventListener('click', function () {
            UI.closeModal();
            Promise.resolve(RB.auth.signOut()).then(function () { current = null; showLogin(); });
          });
        } });
  }

  /* -------------------------------------------------------------- settings */
  function settings(host) {
    var u = RB.auth.user(), meta = RB.store.meta();
    host.innerHTML = UI.head('Settings', 'Your account and where the data comes from.') +
      '<div class="grid grid-2">' +
      UI.card('You', '', '<dl class="kv">' +
        '<dt>Name</dt><dd>' + U.esc(u.name) + '</dd>' +
        '<dt>Role</dt><dd>' + U.esc(RB.auth.roleLabel(u.role)) + '</dd>' +
        '<dt>Email</dt><dd>' + U.esc(u.email) + '</dd>' +
        '<dt>Sees</dt><dd>' + (RB.auth.can('ceoDashboard') ? 'The whole organisation'
          : u.role === 'sales_head' ? "The team's schools" : 'Their own schools') + '</dd></dl>') +
      UI.card('Data', '', '<dl class="kv">' +
        '<dt>Imported from</dt><dd>' + U.esc(meta.source || '—') + '</dd>' +
        '<dt>Schools</dt><dd>' + U.count(RB.store.schools().length) + '</dd>' +
        '<dt>Opportunities</dt><dd>' + U.count(RB.store.opportunities().length) + '</dd>' +
        '<dt>Connects</dt><dd>' + U.count(RB.store.connects().length) + '</dd>' +
        '<dt>Contacts</dt><dd>' + U.count(RB.store.contacts().length) + '</dd>' +
        '<dt>Stored in</dt><dd>This browser. See DEPLOYMENT.md for the shared database.</dd></dl>' +
        '<div class="row wrap" style="margin-top:16px">' +
        '<button class="btn" id="backup">Download backup</button>' +
        (RB.auth.can('ceoDashboard') ? '<button class="btn btn-danger" id="reset">Reset to imported data</button>' : '') +
        '</div>') +
      '</div>' +
      (RB.auth.can('ceoDashboard')
        ? '<div class="section-title">Price list</div>' + pricingCard() +
          '<div class="section-title">Sales team</div>' + teamCard() +
          '<div class="section-title">Monthly targets</div>' + targetsCard()
        : '');

    if (RB.auth.can('ceoDashboard')) {
      bindPricing(host);
      bindTeam(host);
      host.querySelector('#assume').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = UI.values(this);
        M.setConfig({ targets: M.PERFORMANCE.reduce(function (a, m) {
          a[m.key] = v['t_' + m.key] ? Number(v['t_' + m.key]) : null;
          return a;
        }, {}) });
        UI.toast('Targets saved.');
        refresh();
      });
    }
    host.querySelector('#backup').addEventListener('click', function () {
      U.download('robobox-backup-' + U.iso(U.today()) + '.json', RB.store.exportState(), 'application/json');
    });
    var reset = host.querySelector('#reset');
    if (reset) reset.addEventListener('click', function () {
      UI.modal('Reset everything?',
        '<p class="sec" style="margin-top:0">Throws away every Connect logged in this browser and reloads the imported workbook.</p>' +
        '<div class="modal-actions"><button class="btn" data-close="1">Cancel</button>' +
        '<button class="btn btn-danger" id="yes">Reset</button></div>',
        { onMount: function (h) {
            h.querySelector('#yes').addEventListener('click', function () {
              RB.store.resetDemo(); UI.closeModal(); UI.toast('Reset.'); refresh();
            });
          } });
    });
  }

  /* ----------------------------------------------------------- price list */
  /* The rate card. A slab has a price and the student count that price buys;
   * a school with a different roll is charged pro rata, so a potential deal
   * value falls out of the student count without anyone typing one. */
  function pricingCard() {
    var lines = M.priceLines(), p = M.prices();
    var group = null, rows = '';
    lines.forEach(function (l) {
      if (l.group && l.group !== group) {
        group = l.group;
        rows += '<div class="price-group"><h4>' + U.esc(group) + '</h4></div>';
      }
      if (!l.group) group = null;
      var v = p[l.id] || {};
      rows += '<div class="price-row" data-price="' + U.esc(l.id) + '">' +
        '<span class="price-name">' + U.esc(l.label) +
          (l.legacy ? '<small>already used by live opportunities</small>' : '') + '</span>' +
        '<input class="input" type="number" min="0" step="any" inputmode="decimal" data-f="price" ' +
          'placeholder="Price ₹" value="' + U.esc(v.price != null ? v.price : '') + '">' +
        '<input class="input" type="number" min="1" step="1" inputmode="numeric" data-f="base" ' +
          'placeholder="Base students" value="' + U.esc(v.base != null ? v.base : '') + '">' +
        '<span class="price-out">' + U.esc(priceNote(v)) + '</span>' +
      '</div>';
    });

    return UI.card('Rate card',
      'Price × (school students ÷ base students). Leave a row blank and it simply will not auto-calculate.',
      '<div class="price-head"><span>Offering</span><span>Price (₹)</span>' +
      '<span>Base students</span><span></span></div>' + rows +
      '<p class="field-hint" style="margin-top:14px">Saved as you type. A priced slab pre-fills the ' +
      'opportunity size on a new connect, so potential revenue is tracked before any negotiation.</p>');
  }

  function priceNote(v) {
    if (!v.price) return 'not priced';
    if (!v.base) return U.money(v.price) + ' flat';
    return U.money(v.price / v.base) + ' per student';
  }

  function bindPricing(host) {
    host.querySelectorAll('.price-row').forEach(function (row) {
      row.querySelectorAll('input').forEach(function (i) {
        i.addEventListener('change', function () {
          var get = function (f) {
            var el = row.querySelector('[data-f="' + f + '"]');
            return el.value === '' ? null : Number(el.value);
          };
          var price = get('price'), base = get('base');
          M.setPrice(row.getAttribute('data-price'), price, base);
          row.querySelector('.price-out').textContent = priceNote({ price: price, base: base });
          UI.toast('Price saved.');
        });
      });
    });
  }

  /* ---------------------------------------------------------- sales team */
  function teamCard() {
    var users = RB.store.users();
    return UI.card('People', users.length + ' on the team',
      users.map(function (u) {
        return '<div class="person"><span class="avatar">' + U.esc(U.initials(u.name)) + '</span>' +
          '<span class="person-meta"><strong>' + U.esc(u.name) + '</strong><small>' +
          U.esc([u.designation || RB.auth.roleLabel(u.role), u.region, u.ownerKey]
                  .filter(Boolean).join(' · ')) + '</small></span>' +
          '<span class="spacer"></span>' +
          '<span class="tag">' + U.esc(RB.auth.roleLabel(u.role)) + '</span></div>';
      }).join('') +
      '<form id="add-person" style="margin-top:16px">' +
      '<div class="field-row">' +
        UI.field('Name', '<input class="input" name="name" required placeholder="Full name">') +
        UI.field('Designation', '<input class="input" name="designation" placeholder="e.g. Sales Executive">') +
        UI.field('Region', UI.select('region', M.V.region, null, { placeholder: 'Select' })) +
      '</div>' +
      '<div class="row wrap"><button class="btn btn-primary" type="submit">Add salesperson</button>' +
      '<span class="field-hint">They sign in with their first name in lower case as the access code, ' +
      'and see only their own schools.</span></div></form>');
  }

  function bindTeam(host) {
    host.querySelector('#add-person').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.values(this);
      if (!v.name) return UI.toast('Name is required.');
      var u = RB.store.addUser({ name: v.name, designation: v.designation, region: v.region });
      UI.toast(u.name + ' added — access code "' + u.pin + '".');
      refresh();
    });
  }

  /* Monthly targets, one set, applied to every salesperson. Everything else
   * the leadership screens need is derived from the data itself. */
  function targetsCard() {
    var c = M.config();
    return UI.card('Targets per salesperson', 'Shown against actuals on My Performance. Leave blank for no target.',
      '<form id="assume"><div class="field-row">' +
        M.PERFORMANCE.map(function (m) {
          return UI.field(m.label, '<input class="input" type="number" min="0" step="any" ' +
            'inputmode="' + (m.money ? 'decimal' : 'numeric') + '" name="t_' + m.key + '" value="' +
            U.esc((c.targets && c.targets[m.key]) || '') + '" placeholder="No target">');
        }).join('') +
      '</div>' +
      '<div class="row" style="margin-top:12px"><button class="btn btn-primary" type="submit">Save targets</button></div>' +
      '</form>');
  }

  /* ---------------------------------------------------------------- search */
  function initSearch() {
    var input = document.getElementById('global-search');
    var panel = document.getElementById('search-results');
    input.addEventListener('input', U.debounce(function () {
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) { panel.hidden = true; return; }
      var key = RB.auth.user().role === 'sales' ? RB.auth.user().ownerKey : null;
      var hits = RB.store.schools().filter(function (s) {
        if (key && s.ownerKey !== key) return false;
        return (s.name + ' ' + (s.location || '')).toLowerCase().indexOf(q) !== -1;
      }).slice(0, 10);
      panel.innerHTML = hits.length ? hits.map(function (s) {
        return '<button data-id="' + U.esc(s.id) + '"><strong>' + U.esc(s.name) + '</strong>' +
          '<div class="small muted">' + U.esc([s.location, s.board].filter(Boolean).join(' · ')) + '</div></button>';
      }).join('') : '<div style="padding:14px" class="muted">Nothing matching.</div>';
      panel.hidden = false;
      panel.querySelectorAll('[data-id]').forEach(function (b) {
        b.addEventListener('click', function () {
          panel.hidden = true; input.value = '';
          RB.views.school(b.getAttribute('data-id'));
        });
      });
    }, 160));
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.topbar-search')) panel.hidden = true;
    });
  }

  /* ------------------------------------------------------------------ boot */
  function showLogin() {
    document.getElementById('shell').hidden = true;
    document.getElementById('login').hidden = false;
    document.getElementById('login-user').innerHTML = RB.store.users().map(function (u) {
      return '<option value="' + U.esc(u.id) + '">' + U.esc(u.name) + ' — ' + U.esc(RB.auth.roleLabel(u.role)) + '</option>';
    }).join('');
  }

  function showShell() {
    document.getElementById('login').hidden = true;
    document.getElementById('shell').hidden = false;
    var h = (location.hash || '').replace('#/', '');
    go(allowed(h) ? h : defaultRoute());
  }

  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem('robobox.theme'); } catch (e) {}
    if (stored) document.documentElement.setAttribute('data-theme', stored);
    document.getElementById('theme-toggle').addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('robobox.theme', next); } catch (e) {}
    });
  }

  function init() {
    RB.charts.initTooltip();
    initTheme();
    RB.store.load().then(start).catch(function (err) {
      document.body.innerHTML = '<div class="login"><div class="login-card"><h2>Could not load</h2>' +
        '<p class="login-sub">' + U.esc(err.message || 'The data source did not respond.') + '</p></div></div>';
    });
  }

  function start() {
    initSearch();

    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = document.getElementById('login-error');
      Promise.resolve(RB.auth.signIn(document.getElementById('login-user').value,
                                     document.getElementById('login-pin').value)).then(function (res) {
        if (!res.ok) { err.textContent = res.error; err.hidden = false; return; }
        err.hidden = true;
        document.getElementById('login-pin').value = '';
        showShell();
      });
    });

    document.getElementById('logout').addEventListener('click', signOut);
    document.getElementById('nav-toggle').addEventListener('click', function () {
      document.getElementById('shell').classList.toggle('nav-open');
    });
    document.getElementById('modal-root').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) UI.closeModal();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') UI.closeModal(); });
    document.getElementById('fab').addEventListener('click', function () { RB.connectForm.open(); });
    document.getElementById('top-log').addEventListener('click', function () { RB.connectForm.open(); });
    window.addEventListener('hashchange', function () {
      var h = (location.hash || '').replace('#/', '');
      if (RB.auth.user() && h && h !== current) go(h);
    });

    Promise.resolve(RB.auth.restore()).then(function (u) { u ? showShell() : showLogin(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { go: go, refresh: refresh, ROUTES: ROUTES };
})();
