/* Robobox Sales OS - the CEO dashboard.
 * Company-wide analytics with a shared filter bar; every chart drills down to
 * the school rows behind it so a number can always be taken apart.
 */
window.RB = window.RB || {};

RB.viewsCEO = (function () {
  'use strict';

  var U = RB.util, M = RB.metrics, C = RB.charts, UI = RB.ui;
  var card = RB.viewsSales.card, head = RB.viewsSales.head;

  /* Shared across every CEO screen so a filter survives navigation. */
  var F = { region: '', board: '', owner: '', source: '', stage: '', status: '', size: '', age: '' };

  function settings() { return RB.store.settings(); }
  function opts() { return { tamRate: settings().tamRatePerStudent, stalledAfterDays: settings().stalledAfterDays }; }

  function apply(rows) {
    return rows.filter(function (s) {
      if (F.region && s.region !== F.region) return false;
      if (F.board && s.boards.indexOf(F.board) === -1) return false;
      if (F.owner && (F.owner === 'Unassigned' ? s.owners.length : s.owners.indexOf(F.owner) === -1)) return false;
      if (F.source && (s.leadSource || 'Not recorded') !== F.source) return false;
      if (F.stage && M.stage(s) !== F.stage) return false;
      if (F.status && s.opportunityStatus !== F.status) return false;
      if (F.size && M.sizeBand(s.students) !== F.size) return false;
      if (F.age && M.ageBand(s) !== F.age) return false;
      return true;
    });
  }

  function activeFilters() {
    return Object.keys(F).filter(function (k) { return F[k]; })
      .map(function (k) { return { k: k, v: F[k] }; });
  }

  function filterBar() {
    var all = RB.store.all();
    var owners = U.uniq(all.reduce(function (a, s) { return a.concat(s.owners); }, [])).sort().concat(['Unassigned']);
    var sources = U.uniq(all.map(function (s) { return s.leadSource || 'Not recorded'; })).sort();
    var chips = activeFilters();
    return '<div class="filters">' +
      '<span class="filter-label">Region</span>' + UI.select('region', M.REGIONS, F.region, { placeholder: 'All' }) +
      '<span class="filter-label">Board</span>' + UI.select('board', M.BOARDS, F.board, { placeholder: 'All' }) +
      '<span class="filter-label">Owner</span>' + UI.select('owner', owners, F.owner, { placeholder: 'All' }) +
      '<span class="filter-label">Source</span>' + UI.select('source', sources, F.source, { placeholder: 'All' }) +
      '<span class="filter-label">Stage</span>' + UI.select('stage', M.STAGE_KEYS, F.stage, { placeholder: 'All' }) +
      '<span class="filter-label">Size</span>' + UI.select('size', M.SIZE_BANDS, F.size, { placeholder: 'All' }) +
      '<span class="filter-label">Last touch</span>' + UI.select('age', M.AGE_BANDS, F.age, { placeholder: 'All' }) +
      '<span class="spacer"></span>' +
      (chips.length ? '<button class="btn btn-sm btn-ghost" id="f-clear">Clear ' + chips.length + ' filter' + (chips.length === 1 ? '' : 's') + '</button>' : '') +
      '</div>';
  }

  function bindFilters(host, redraw) {
    host.querySelectorAll('.filters select').forEach(function (sel) {
      sel.addEventListener('change', function () { F[sel.getAttribute('name')] = sel.value; redraw(); });
    });
    var clear = host.querySelector('#f-clear');
    if (clear) clear.addEventListener('click', function () {
      Object.keys(F).forEach(function (k) { F[k] = ''; });
      redraw();
    });
  }

  /* Every chart with a data-key can open the rows behind it. */
  function bindDrill(host, dim, rowsFor) {
    host.querySelectorAll('[data-key]').forEach(function (g) {
      g.addEventListener('click', function () {
        var key = g.getAttribute('data-key');
        drill(dim + ': ' + key, rowsFor(key));
      });
    });
  }

  function drill(title, rows) {
    var holder = document.createElement('div');
    var s = M.summarise(rows, opts());
    holder.innerHTML =
      '<div class="stats" style="margin-bottom:14px">' +
        UI.stat({ label: 'Schools', value: U.count(rows.length), small: true }) +
        UI.stat({ label: 'Open value', value: U.money(s.openValue), small: true }) +
        UI.stat({ label: 'Weighted', value: U.money(s.weighted), small: true }) +
        UI.stat({ label: 'Students', value: U.count(s.students), small: true }) +
      '</div>' +
      '<div class="row" style="margin-bottom:10px"><span class="spacer" style="margin-left:auto"></span>' +
      '<button class="btn btn-sm" id="drill-export">Download these rows</button></div>' +
      '<div id="drill-table"></div>';
    UI.modal(title, holder, {
      wide: true,
      onMount: function (hostEl) {
        hostEl.querySelector('#drill-export').addEventListener('click', function () {
          UI.exportSchools(rows, 'robobox-' + title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.csv');
        });
        UI.table(hostEl.querySelector('#drill-table'), {
          rows: rows, rowId: function (r) { return r.id; }, sortKey: 'weighted', pageSize: 15,
          columns: UI.schoolColumns({ hide: ['next'] }),
          onRowClick: function (id) { UI.schoolDetail(id); },
          empty: 'No rows.'
        });
      }
    });
  }

  /* ==================================================== COMMAND CENTRE ==== */
  /* Deliberately short. Four numbers that describe the whole business, the
   * insights worth acting on, and performance split the two ways the CEO
   * actually asks for it — by region and by person. Anything deeper lives on
   * its own screen rather than crowding this one. */
  function commandCentre(host) {
    render();
    function render() {
      var all = RB.store.all();
      var rows = apply(all);
      var s = M.summarise(rows, opts());
      var rate = settings().tamRatePerStudent;
      var byRegion = M.byDimension(rows, 'region', opts());
      var byOwner = M.byDimension(rows, 'owner', opts());
      var blockers = topBlockers(rows).slice(0, 5);
      var biggest = U.sortBy(rows.filter(function (r) { return M.isOpen(r) && r.dealSize; }), M.dealSize, 'desc').slice(0, 8);
      var mostStudents = U.sortBy(rows.filter(function (r) { return r.students; }), function (r) { return r.students; }, 'desc').slice(0, 8);
      var updatedToday = M.updatesOn(all, U.iso(U.today()));

      host.innerHTML =
        head('Command centre',
             activeFilters().length
               ? 'Filtered to ' + U.count(rows.length) + ' of ' + U.count(all.length) + ' schools.'
               : 'The whole business on one screen.',
             '<button class="btn" id="tam-rate">TAM @ ₹' + U.count(rate) + '/student</button>' +
             '<button class="btn" id="export-all">Download everything</button>') +
        filterBar() +

        UI.statRow([
          UI.stat({ label: 'TAM', value: U.money(s.tamValue),
                    foot: '<span class="sec">' + U.count(s.schools) + ' schools · ' + U.count(s.students) + ' students</span>',
                    title: 'Student count × ₹' + U.count(rate) + '. ' + (s.schools - s.studentsKnown) +
                           ' schools have no student count yet, so the real market is larger.' }),
          UI.stat({ label: 'Market approached', value: Math.round(s.coverage) + '%',
                    tone: s.coverage < 40 ? 'critical' : s.coverage < 70 ? 'warning' : null,
                    foot: '<span class="sec">' + U.count(s.approached) + ' touched · ' + U.count(s.schools - s.approached) + ' never contacted</span>',
                    onClick: 'coverage' }),
          UI.stat({ label: 'Open pipeline', value: U.money(s.openValue),
                    foot: '<span class="sec">' + U.count(s.openCount) + ' quantified deals</span>', onClick: 'open' }),
          UI.stat({ label: 'Won', value: U.money(s.revenueGenerated),
                    tone: s.wonCount ? 'good' : null,
                    foot: '<span class="sec">' + s.wonCount + ' schools · ' +
                          (s.conversion ? s.conversion.toFixed(1) + '% conversion' : 'nothing closed yet') + '</span>',
                    onClick: 'won' })
        ]) +

        '<div class="card" style="border-left:3px solid ' + (updatedToday ? 'var(--good)' : 'var(--warning)') + '">' +
          '<div class="row wrap" style="gap:14px">' +
            '<div><div class="stat-label">Updates logged today</div>' +
              '<div class="stat-value sm">' + U.count(updatedToday) + '</div></div>' +
            '<div style="flex:1;min-width:240px" class="sec small">' +
              (updatedToday
                ? 'The numbers above include today\u2019s field work.'
                : 'Nobody has logged anything today, so everything above is as of the last update.') +
            '</div>' +
            '<button class="btn btn-sm" id="go-team">See who</button>' +
          '</div>' +
        '</div>' +

        '<div class="section-title">Insights</div>' +
        '<div class="grid grid-3">' +
          insightCard('Blockers', 'What is stopping deals, by value held up.',
            blockers.map(function (b) {
              return listRow(b.key, U.money(b.value), b.n + ' schools', 'blocker:' + b.key);
            }).join('') || '<div class="empty">None recorded.</div>') +
          insightCard('Biggest schools', 'Largest open deals in the pipeline.',
            biggest.map(function (r) {
              return listRow(r.name, U.money(r.dealSize), [r.location, r.owners.join('/')].filter(Boolean).join(' · '), 'school:' + r.id);
            }).join('') || '<div class="empty">No quantified deals.</div>') +
          insightCard('Most students', 'Where the largest student bodies are.',
            mostStudents.map(function (r) {
              return listRow(r.name, U.count(r.students), (M.isApproached(r) ? M.stage(r) : 'never contacted'), 'school:' + r.id);
            }).join('') || '<div class="empty">No student counts recorded.</div>') +
        '</div>' +

        '<div class="grid grid-2" style="margin-top:16px">' +
          card('Performance per region', 'Contacted against closed.', RB.viewsSales.perfTable(byRegion, 'Region')) +
          card('Performance per sales person', 'Contacted against closed.', RB.viewsSales.perfTable(byOwner, 'Sales person')) +
        '</div>' +

        '<div class="card" style="margin-top:16px"><div class="card-head"><h3>What needs a decision this week</h3>' +
          '<span class="card-sub">ranked by money at stake</span></div>' +
          UI.insightList(M.insights(rows, opts()).slice(0, 5)) + '</div>';

      bindFilters(host, render);
      host.querySelector('#export-all').addEventListener('click', function () { UI.exportSchools(rows, 'robobox-full-pipeline.csv'); });
      host.querySelector('#tam-rate').addEventListener('click', rateDialog);
      host.querySelector('#go-team').addEventListener('click', function () { RB.app.go('ceo-team'); });

      host.querySelectorAll('[data-stat]').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-stat');
          if (k === 'coverage') drill('Never contacted', rows.filter(function (r) { return !M.isApproached(r); }));
          if (k === 'open') drill('Open pipeline', rows.filter(M.isOpen));
          if (k === 'won') drill('Won', rows.filter(M.isWon));
        });
      });
      host.querySelectorAll('[data-go]').forEach(function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-go').split(':');
          if (v[0] === 'school') return UI.schoolDetail(v[1]);
          var bl = topBlockers(rows).filter(function (x) { return x.key === v.slice(1).join(':'); })[0];
          if (bl) drill('Blocker: ' + bl.key, bl.rows);
        });
      });
    }
  }

  function insightCard(title, sub, body) {
    return '<div class="card"><div class="card-head"><h3>' + U.esc(title) + '</h3></div>' +
      '<p class="small muted" style="margin:-8px 0 10px">' + U.esc(sub) + '</p>' + body + '</div>';
  }

  function listRow(name, value, sub, go) {
    // Name and detail stack, so a long blocker label never pushes the row to
    // two different heights from its neighbours.
    return '<button class="ql-row" data-go="' + U.esc(go) + '">' +
      '<span class="stack" style="gap:1px;min-width:0"><strong>' + U.esc(C.truncate(name, 28)) + '</strong>' +
      (sub ? '<span class="small muted">' + U.esc(C.truncate(sub, 34)) + '</span>' : '') + '</span>' +
      '<span class="tnum small nowrap">' + U.esc(value) + '</span></button>';
  }

  function topBlockers(rows) {
    return U.sortBy(Object.keys(M.BLOCKER_LABEL).map(function (tag) {
      var list = rows.filter(function (r) { return r.blockerTags.indexOf(tag) !== -1; });
      return { key: M.BLOCKER_LABEL[tag], tag: tag, rows: list, n: list.length,
               value: U.sum(list.filter(M.isOpen), M.dealSize) };
    }).filter(function (b) { return b.n; }), function (b) { return b.value || b.n; }, 'desc');
  }

  function rateDialog() {
    var rate = settings().tamRatePerStudent;
    UI.modal('TAM assumption', '<p class="sec" style="margin-top:0">The imported sheet quotes two rate cards: ' +
      '<strong>₹1,700 per student</strong> for the robotics lab programme and <strong>₹400 per student</strong> for workshops. ' +
      'Total addressable market is student count multiplied by whichever you pick.</p>' +
      '<div class="chip-row" style="margin:14px 0">' +
      [400, 1700].map(function (r) {
        return '<button class="chip" data-rate="' + r + '" aria-pressed="' + (r === rate) + '">₹' + U.count(r) + ' / student</button>';
      }).join('') + '</div>' +
      '<label class="field"><span class="field-label">Or set your own</span>' +
      '<input class="input" type="number" id="rate-custom" min="1" value="' + rate + '"></label>' +
      '<div class="modal-actions"><button class="btn" data-close="1">Cancel</button>' +
      '<button class="btn btn-primary" id="rate-save">Apply</button></div>', {
      onMount: function (host) {
        host.querySelectorAll('[data-rate]').forEach(function (b) {
          b.addEventListener('click', function () { host.querySelector('#rate-custom').value = b.getAttribute('data-rate'); });
        });
        host.querySelector('#rate-save').addEventListener('click', function () {
          var v = Number(host.querySelector('#rate-custom').value) || 1700;
          RB.store.updateSettings({ tamRatePerStudent: v });
          UI.closeModal();
          UI.toast('TAM now calculated at ₹' + U.count(v) + ' per student.');
          RB.app.refresh();
        });
      }
    });
  }

  /* ========================================================= FUNNEL ======= */
  function funnelView(host) {
    render();
    function render() {
      var rows = apply(RB.store.all());
      var f = M.funnel(rows);
      var conv = M.conversion(rows);
      var worked = rows.filter(M.isWorking);
      var confirmedPct = worked.length ? U.pctVal(worked.filter(M.stageConfirmed).length, worked.length) : 0;

      var dims = ['region', 'leadSource', 'owner', 'board'];
      var segCharts = dims.map(function (dim) {
        var groups = M.byDimension(rows, dim, opts()).slice(0, 8);
        var stageBands = ['New Lead', 'Contacted', 'Meeting Fixed', 'Meeting Done', 'Demo', 'Proposal+'];
        var series = stageBands.map(function (b, i) { return { label: b, color: C.ordinalColor(i, stageBands.length) }; });
        var data = groups.map(function (g) {
          return {
            key: g.key,
            parts: stageBands.map(function (b) {
              var n = g.rows.filter(function (r) {
                var st = M.stage(r);
                return b === 'Proposal+' ? M.stageIdx(r) >= M.STAGE_INDEX.Proposal : st === b;
              }).length;
              return { label: b, value: n };
            })
          };
        });
        return card(M.DIMENSIONS[dim].label + ' × stage', 'How far each segment has actually got.',
          C.stackedBar({ data: data, series: series, measureLabel: 'Schools' }));
      });

      host.innerHTML =
        head('Funnel & conversion', 'Where opportunities stop moving, and what that costs.') +
        filterBar() +
        (confirmedPct < 60
          ? '<div class="insight warn"><span class="insight-ico">ℹ️</span><div><strong>' +
            Math.round(confirmedPct) + '% of worked accounts have a confirmed stage</strong>' +
            '<p>The rest show a stage read from the imported wording (marked with a “?”). Treat conversion below as indicative until the team confirms them — logging one update per account fixes it.</p></div></div>'
          : '') +
        '<div class="grid grid-2">' +
          card('The funnel', 'Cumulative — an account at Proposal counts at every stage below it. Click to drill in.',
               C.funnel({ data: f, format: U.money, onClick: true })) +
          card('Step-by-step conversion', 'Share getting through each step, and the value that stops there.',
               conversionTable(conv)) +
        '</div>' +
        '<div class="section-title">Where the drop-off is worst</div>' +
        card('Value lost at each step', 'Pipeline value that never reaches the next stage.',
             C.hbar({ data: conv.map(function (c) { return { key: c.from + ' → ' + c.to, value: Math.max(c.lostValue, 0) }; }),
                      sort: false,
                      format: U.money, measureLabel: 'Value stopping here', labelW: 210,
                      color: function () { return 'var(--serious)'; } })) +
        '<div class="section-title">Segment the funnel</div>' +
        '<div class="grid grid-2">' + segCharts.join('') + '</div>';

      bindFilters(host, render);
      host.querySelectorAll('[data-key]').forEach(function (g) {
        g.addEventListener('click', function () {
          var step = f.filter(function (x) { return x.key === g.getAttribute('data-key'); })[0];
          if (step) drill('Reached ' + step.key, step.rows);
        });
      });
    }
  }

  function conversionTable(conv) {
    return '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>Step</th><th class="num">Through</th><th class="num">Stops here</th><th class="num">Value lost</th></tr></thead><tbody>' +
      conv.map(function (c) {
        var tone = c.rate < 40 ? 'bad' : c.rate < 70 ? 'warn' : 'good';
        return '<tr><td>' + U.esc(c.from) + ' → ' + U.esc(c.to) + '</td>' +
          '<td class="num">' + UI.meter(c.rate / 100) + '</td>' +
          '<td class="num">' + U.count(c.lost) + '</td>' +
          '<td class="num">' + U.money(Math.max(c.lostValue, 0)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ========================================================== MARKET ====== */
  function market(host) {
    render();
    function render() {
      var rows = apply(RB.store.all());
      var s = M.summarise(rows, opts());
      var regions = M.byDimension(rows, 'region', opts());
      var locations = M.byDimension(rows, 'location', opts()).slice(0, 18);
      var boards = M.byDimension(rows, 'board', opts());
      var sizes = M.SIZE_BANDS.concat(['Unknown']).map(function (b) {
        var list = rows.filter(function (r) { return M.sizeBand(r.students) === b; });
        return { key: b, rows: list, n: list.length, tam: U.sum(list, function (r) { return M.tamValue(r, opts().tamRate); }),
                 approached: list.filter(M.isApproached).length };
      }).filter(function (b) { return b.n; });

      var stageBands = ['New Lead', 'Contacted', 'Meeting Fixed', 'Meeting Done', 'Demo', 'Proposal', 'Won'];

      host.innerHTML =
        head('Market & territory', 'The 343-school universe, how much of it has been touched, and what is left.') +
        filterBar() +
        UI.statRow([
          UI.stat({ label: 'Schools in view', value: U.count(s.schools), foot: '<span class="sec">' + U.count(s.students) + ' students</span>' }),
          UI.stat({ label: 'TAM value', value: U.money(s.tamValue), foot: '<span class="sec">@ ₹' + U.count(opts().tamRate) + '/student</span>' }),
          UI.stat({ label: 'Approached', value: Math.round(s.coverage) + '%', foot: '<span class="sec">' + U.count(s.approached) + ' schools</span>' }),
          UI.stat({ label: 'Untouched TAM', value: U.money(U.sum(rows.filter(function (r) { return !M.isApproached(r); }), function (r) { return M.tamValue(r, opts().tamRate); })),
                    tone: 'warning', foot: '<span class="sec">' + U.count(s.schools - s.approached) + ' schools never contacted</span>', onClick: 'untouched' }),
          UI.stat({ label: 'Qualified', value: U.count(s.qualified), foot: '<span class="sec">' + U.pct(s.qualified, s.schools) + ' of the market</span>' })
        ]) +

        '<div class="grid grid-2">' +
          card('Region: market vs. what has been worked', 'TAM value against open pipeline in each cluster.',
               C.stackedBar({
                 labelW: 96,
                 data: regions.map(function (g) {
                   var untouched = U.sum(g.rows.filter(function (r) { return !M.isApproached(r); }), function (r) { return M.tamValue(r, opts().tamRate); });
                   var touchedNoDeal = U.sum(g.rows.filter(function (r) { return M.isApproached(r) && !r.dealSize; }), function (r) { return M.tamValue(r, opts().tamRate); });
                   return { key: g.key, parts: [
                     { label: 'Open pipeline', value: g.openValue },
                     { label: 'Approached, not yet quantified', value: touchedNoDeal },
                     { label: 'Never contacted', value: untouched }
                   ] };
                 }),
                 series: [{ label: 'Open pipeline', color: 'var(--series-1)' },
                          { label: 'Approached, not yet quantified', color: 'var(--series-2)' },
                          { label: 'Never contacted', color: 'var(--series-3)' }],
                 format: U.money, measureLabel: 'Value'
               })) +
          card('Coverage by school size', 'Are the big schools actually being worked?',
               C.hbar({ data: sizes.map(function (b) { return { key: b.key, value: Math.round(U.pctVal(b.approached, b.n)) }; }),
                        sort: false,
                        color: function (d, i) { return C.ordinalColor(i, sizes.length); },
                        format: function (v) { return v + '%'; }, measureLabel: 'Approached',
                        onClick: true,
                        tipRows: function (d) {
                          var b = sizes.filter(function (x) { return x.key === d.key; })[0];
                          return [['Schools', U.count(b.n)], ['Approached', U.count(b.approached)], ['TAM', U.money(b.tam)]];
                        } })) +
        '</div>' +

        '<div class="card" style="margin-top:16px"><div class="card-head"><h3>Region × stage</h3>' +
          '<span class="card-sub">how far each cluster has actually got — click a cell to open those schools</span></div>' +
          C.heatmap({
            rows: regions.map(function (g) { return g.key; }),
            cols: stageBands,
            measureLabel: 'Schools',
            get: function (r, c) {
              return rows.filter(function (x) { return x.region === r && M.stage(x) === c; }).length;
            },
            onClick: true
          }) + '</div>' +

        '<div class="grid grid-2" style="margin-top:16px">' +
          card('Top locations by untouched market', 'Where the unworked value is concentrated.',
               C.hbar({ data: U.sortBy(locations.map(function (g) {
                          return { key: g.key, value: U.sum(g.rows.filter(function (r) { return !M.isApproached(r); }), function (r) { return M.tamValue(r, opts().tamRate); }) };
                        }), function (d) { return d.value; }, 'desc').slice(0, 12),
                        format: U.money, measureLabel: 'Untouched TAM', onClick: true,
                        color: function () { return 'var(--series-2)'; } })) +
          card('Board mix', 'Schools and pipeline value by curriculum.',
               C.hbar({ data: boards.map(function (g) { return { key: g.key, value: g.schools }; }),
                        format: U.count, measureLabel: 'Schools', onClick: true,
                        tipRows: function (d) {
                          var g = boards.filter(function (x) { return x.key === d.key; })[0];
                          return [['Schools', U.count(g.schools)], ['Approached', Math.round(g.coverage) + '%'],
                                  ['Open pipeline', U.money(g.openValue)]];
                        } })) +
        '</div>' +

        '<div class="card" style="margin-top:16px"><div class="card-head"><h3>Never-contacted schools, biggest first</h3>' +
          '<span class="card-sub">the fastest place to add pipeline</span></div><div id="untouched-table"></div></div>';

      bindFilters(host, render);
      host.querySelectorAll('[data-stat]').forEach(function (b) {
        b.addEventListener('click', function () { drill('Never contacted', rows.filter(function (r) { return !M.isApproached(r); })); });
      });
      host.querySelectorAll('[data-key]').forEach(function (g) {
        g.addEventListener('click', function () {
          var key = g.getAttribute('data-key');
          if (key.indexOf('||') !== -1) {
            var p = key.split('||');
            return drill(p[0] + ' at ' + p[1], rows.filter(function (x) { return x.region === p[0] && M.stage(x) === p[1]; }));
          }
          var size = sizes.filter(function (x) { return x.key === key; })[0];
          if (size) return drill('School size: ' + key, size.rows);
          var loc = locations.filter(function (x) { return x.key === key; })[0];
          if (loc) return drill('Location: ' + key, loc.rows);
          var b = boards.filter(function (x) { return x.key === key; })[0];
          if (b) return drill('Board: ' + key, b.rows);
        });
      });

      var untouched = U.sortBy(rows.filter(function (r) { return !M.isApproached(r); }), function (r) { return r.students || 0; }, 'desc');
      UI.table(host.querySelector('#untouched-table'), {
        rows: untouched, rowId: function (r) { return r.id; }, sortKey: 'students', pageSize: 12,
        onRowClick: function (id) { UI.schoolDetail(id); },
        empty: 'Every school in this view has been approached.',
        columns: [
          { key: 'name', label: 'School', get: function (r) { return r.name; },
            render: function (r) { return '<span class="strong">' + U.esc(r.name) + '</span><div class="small muted">' + U.esc([r.location, r.region].filter(Boolean).join(' · ')) + '</div>'; } },
          { key: 'board', label: 'Board', get: function (r) { return r.boards.join('/'); } },
          { key: 'students', label: 'Students', num: true, get: function (r) { return r.students || 0; },
            render: function (r) { return r.students ? U.count(r.students) : '<span class="muted">—</span>'; } },
          { key: 'tam', label: 'TAM value', num: true, get: function (r) { return M.tamValue(r, opts().tamRate); },
            render: function (r) { return U.money(M.tamValue(r, opts().tamRate)); } },
          { key: 'owner', label: 'Owner', get: function (r) { return r.owners.join(', '); },
            render: function (r) { return r.owners.length ? U.esc(r.owners.join(', ')) : '<span class="tag tag-warning">Unassigned</span>'; } }
        ]
      });
    }
  }

  /* ============================================================ TEAM ====== */
  function team(host) {
    render();
    function render() {
      var rows = apply(RB.store.all());
      var users = RB.store.users();
      var cards = M.repScorecards(rows, users, opts());
      var withRows = cards.filter(function (c) { return c.schools; });
      var s2 = M.summarise(rows, opts());

      var updatedToday = M.updatesOn(rows, U.iso(U.today()));
      var idle = cards.filter(function (c) { return c.schools && !c.updatesToday; });

      host.innerHTML =
        head('Team performance', 'Effort against outcome, per person. Click a bar to open that rep\'s accounts.') +
        filterBar() +
        UI.statRow([
          UI.stat({ label: 'Updated data today', value: U.count(updatedToday), small: true,
                    tone: updatedToday ? 'good' : 'warning',
                    foot: '<span class="sec">' + (idle.length ? idle.map(function (c) { return c.user.name; }).join(', ') + ' yet to log' : 'everyone has logged something') + '</span>' }),
          UI.stat({ label: 'Team potential revenue', value: U.money(s2.potentialRevenue), small: true }),
          UI.stat({ label: 'Revenue generated', value: U.money(s2.revenueGenerated), small: true,
                    tone: s2.revenueGenerated ? 'good' : null }),
          UI.stat({ label: 'Conversion', value: s2.conversion.toFixed(1) + '%', small: true,
                    foot: '<span class="sec">closed ÷ approached</span>' }),
          UI.stat({ label: 'Unassigned schools', value: U.count(rows.filter(function (r) { return !r.owners.length; }).length),
                    small: true, tone: 'warning' })
        ]) +
        '<div class="card"><div class="card-head"><h3>This month against target</h3>' +
          '<span class="card-sub">per person, current month</span></div>' +
          '<div class="grid grid-3">' + cards.filter(function (c) { return c.schools; }).map(function (c) {
            var t = M.scorecardVsTarget(c.rows, c.user, opts());
            return '<div><div class="row" style="margin-bottom:6px"><strong>' + U.esc(c.user.name) + '</strong>' +
              (t.placeholder ? '<span class="tag tag-warning" style="margin-left:auto">placeholder</span>' : '') + '</div>' +
              RB.viewsSales.targetBars(t) + '</div>';
          }).join('') + '</div></div>' +
        '<div class="grid grid-2" style="margin-top:16px">' +
          card('Open pipeline by rep', 'Live value each person is carrying.',
               C.hbar({ data: U.sortBy(withRows, function (c) { return c.openValue; }, 'desc')
                          .map(function (c) { return { key: c.user.name, value: c.openValue }; }),
                        format: U.money, measureLabel: 'Open value', onClick: true,
                        tipRows: function (d) {
                          var c = byName(cards, d.key);
                          return [['Open value', U.money(c.openValue)], ['Weighted', U.money(c.weighted)],
                                  ['Accounts', U.count(c.schools)], ['Avg deal', U.money(c.avgDeal)]];
                        } })) +
          card('Market coverage by rep', 'Share of their own accounts that have ever been contacted.',
               C.hbar({ data: U.sortBy(withRows, function (c) { return c.coverage; }, 'desc')
                          .map(function (c) { return { key: c.user.name, value: Math.round(c.coverage) }; }),
                        format: function (v) { return v + '%'; }, measureLabel: 'Coverage', onClick: true })) +
        '</div>' +

        '<div class="grid grid-2" style="margin-top:16px">' +
          card('Accounts that have gone quiet', 'Share of each rep\'s book with no contact in ' + settings().stalledAfterDays + '+ days.',
               C.hbar({ data: U.sortBy(withRows, function (c) { return c.stalledPct; }, 'desc')
                          .map(function (c) { return { key: c.user.name, value: Math.round(c.stalledPct) }; }),
                        format: function (v) { return v + '%'; }, measureLabel: 'Gone quiet',
                        color: function (d) { return d.value > 50 ? 'var(--critical)' : d.value > 25 ? 'var(--serious)' : 'var(--series-1)'; },
                        onClick: true })) +
          card('Record completeness by rep', 'Required fields filled in on the accounts they are working.',
               C.hbar({ data: U.sortBy(withRows, function (c) { return c.hygiene; }, 'desc')
                          .map(function (c) { return { key: c.user.name, value: Math.round(c.hygiene) }; }),
                        format: function (v) { return v + '%'; }, measureLabel: 'Complete',
                        color: function (d) { return d.value < 55 ? 'var(--critical)' : d.value < 85 ? 'var(--serious)' : 'var(--good)'; },
                        onClick: true })) +
        '</div>' +

        '<div class="card" style="margin-top:16px"><div class="card-head"><h3>Scorecards</h3>' +
          '<span class="card-sub">sortable — click any column</span>' +
          '<span class="spacer"></span><button class="btn btn-sm" id="export-team">Download</button></div>' +
          '<div id="rep-table"></div></div>' +

        '<div class="card"><div class="card-head"><h3>Unassigned schools</h3>' +
          '<span class="card-sub">nobody is accountable for these</span></div><div id="unassigned-table"></div></div>';

      bindFilters(host, render);
      host.querySelector('#export-team').addEventListener('click', function () { UI.exportSchools(rows, 'robobox-team.csv'); });
      host.querySelectorAll('[data-key]').forEach(function (g) {
        g.addEventListener('click', function () {
          var c = byName(cards, g.getAttribute('data-key'));
          if (c) drill('Owner: ' + c.user.name, c.rows);
        });
      });

      UI.table(host.querySelector('#rep-table'), {
        rows: cards, rowId: function (c) { return c.user.id; }, sortKey: 'open', pageSize: 20,
        columns: RB.viewsSales.repColumns(), empty: 'No reps configured.'
      });

      var unassigned = U.sortBy(rows.filter(function (r) { return !r.owners.length; }), function (r) { return r.students || 0; }, 'desc');
      UI.table(host.querySelector('#unassigned-table'), {
        rows: unassigned, rowId: function (r) { return r.id; }, sortKey: 'students', pageSize: 10,
        onRowClick: function (id) { UI.schoolDetail(id); },
        empty: 'Every school has an owner.',
        columns: [
          { key: 'name', label: 'School', get: function (r) { return r.name; },
            render: function (r) { return '<span class="strong">' + U.esc(r.name) + '</span><div class="small muted">' + U.esc([r.location, r.region].filter(Boolean).join(' · ')) + '</div>'; } },
          { key: 'students', label: 'Students', num: true, get: function (r) { return r.students || 0; },
            render: function (r) { return r.students ? U.count(r.students) : '—'; } },
          { key: 'tam', label: 'TAM value', num: true, get: function (r) { return M.tamValue(r, opts().tamRate); },
            render: function (r) { return U.money(M.tamValue(r, opts().tamRate)); } },
          { key: 'status', label: 'Status', get: function (r) { return r.opportunityStatus; } }
        ]
      });
    }
  }

  /* The imported sheet stopped being updated at a point in time; if that was a
   * long while ago, say so once rather than letting every account read as
   * "gone quiet" without explanation. */
  function staleNotice(rows) {
    var dated = rows.filter(function (r) { return r.lastContacted; });
    if (!dated.length) return '';
    var newest = dated.map(function (r) { return r.lastContacted; }).sort().pop();
    var age = U.daysSince(newest);
    if (age < 60) return '';
    return '<div class="insight warn"><span class="insight-ico">🕓</span><div>' +
      '<strong>The imported sheet is ' + Math.round(age / 30) + ' months old</strong>' +
      '<p>Its most recent contact date is ' + U.esc(U.fmtDate(newest)) + '. Every age, staleness and “gone quiet” figure ' +
      'is measured against today, so the whole imported pipeline reads as stale until the team logs current activity. ' +
      'Anything logged in the app from now on is dated exactly.</p></div></div>';
  }

  function byName(cards, name) {
    return cards.filter(function (c) { return c.user.name === name; })[0];
  }

  /* ======================================================== BLOCKERS ====== */
  function blockers(host) {
    render();
    function render() {
      var rows = apply(RB.store.all());
      var withBlockers = rows.filter(function (r) { return r.blockerTags.length; });
      var byBlocker = Object.keys(M.BLOCKER_LABEL).map(function (tag) {
        var list = rows.filter(function (r) { return r.blockerTags.indexOf(tag) !== -1; });
        return { tag: tag, key: M.BLOCKER_LABEL[tag], rows: list, n: list.length,
                 value: U.sum(list.filter(M.isOpen), M.dealSize),
                 tam: U.sum(list, function (r) { return M.tamValue(r, opts().tamRate); }) };
      }).filter(function (b) { return b.n; });
      byBlocker = U.sortBy(byBlocker, function (b) { return b.value || b.n; }, 'desc');

      var comps = M.byDimension(rows.filter(function (r) { return r.competitors.length; }), 'competitor', opts());
      var priced = rows.filter(function (r) { return r.ratePerStudent; });
      var rateBands = M.byDimension(priced, 'rateCard', opts());
      var upside = U.sum(priced.filter(function (r) { return r.ratePerStudent <= 600; }),
                         function (r) { return (r.students || 0) * (1700 - r.ratePerStudent); });

      host.innerHTML =
        head('Blockers, competition & pricing', 'The recurring reasons deals do not move — grouped so they can be fixed once instead of one school at a time.') +
        filterBar() +
        UI.statRow([
          UI.stat({ label: 'Accounts with a blocker', value: U.count(withBlockers.length),
                    foot: '<span class="sec">' + U.pct(withBlockers.length, rows.length) + ' of schools in view</span>' }),
          UI.stat({ label: 'Open value blocked', value: U.money(U.sum(withBlockers.filter(M.isOpen), M.dealSize)), tone: 'serious' }),
          UI.stat({ label: 'Competitor named', value: U.count(rows.filter(function (r) { return r.competitors.length; }).length),
                    foot: '<span class="sec">' + comps.length + ' distinct competitors</span>' }),
          UI.stat({ label: 'Priced on the ₹400 card', value: U.count(priced.filter(function (r) { return r.ratePerStudent <= 600; }).length),
                    foot: '<span class="sec">of ' + priced.length + ' priced deals</span>' }),
          UI.stat({ label: 'Upside if those moved to ₹1,700', value: U.money(upside), tone: 'good',
                    title: 'Students in ₹400-band deals × the ₹1,300 per-student gap' })
        ]) +

        '<div class="grid grid-2">' +
          card('What is holding deals up', 'Open pipeline value sitting behind each category of blocker. Click to open the accounts.',
               C.hbar({ data: byBlocker.map(function (b) { return { key: b.key, value: b.value }; }),
                        format: U.money, measureLabel: 'Open value blocked', labelW: 190, onClick: true,
                        color: function () { return 'var(--serious)'; },
                        tipRows: function (d) {
                          var b = byBlocker.filter(function (x) { return x.key === d.key; })[0];
                          return [['Open value', U.money(b.value)], ['Schools', U.count(b.n)], ['TAM affected', U.money(b.tam)]];
                        } })) +
          card('How often each blocker comes up', 'Number of schools, regardless of deal value.',
               C.hbar({ data: byBlocker.map(function (b) { return { key: b.key, value: b.n }; }),
                        format: U.count, measureLabel: 'Schools', labelW: 190, onClick: true })) +
        '</div>' +

        '<div class="grid grid-2" style="margin-top:16px">' +
          card('Blocker × region', 'Is a problem local or company-wide? A local one is a coaching fix; a company-wide one is a product or pricing fix.',
               C.heatmap({
                 labelW: 200,
                 rows: byBlocker.map(function (b) { return b.key; }),
                 cols: M.REGIONS,
                 measureLabel: 'Schools',
                 get: function (r, c) {
                   var tag = Object.keys(M.BLOCKER_LABEL).filter(function (t) { return M.BLOCKER_LABEL[t] === r; })[0];
                   return rows.filter(function (x) { return x.region === c && x.blockerTags.indexOf(tag) !== -1; }).length;
                 },
                 onClick: true
               })) +
          card('Who we are up against', 'Schools where a competitor is named.',
               comps.length
                 ? C.hbar({ data: comps.map(function (g) { return { key: g.key, value: g.schools }; }),
                            format: U.count, measureLabel: 'Schools', onClick: true,
                            tipRows: function (d) {
                              var g = comps.filter(function (x) { return x.key === d.key; })[0];
                              return [['Schools', U.count(g.schools)], ['Open value', U.money(g.openValue)],
                                      ['Students', U.count(g.students)]];
                            } })
                 : '<div class="empty">No competitors recorded in this view.</div>') +
        '</div>' +

        '<div class="grid grid-2" style="margin-top:16px">' +
          card('Rate-card mix', 'Which package each priced deal is quoted on.',
               C.hbar({ data: rateBands.map(function (g) { return { key: g.key, value: g.schools }; }),
                        format: U.count, measureLabel: 'Deals', labelW: 180, onClick: true,
                        tipRows: function (d) {
                          var g = rateBands.filter(function (x) { return x.key === d.key; })[0];
                          return [['Deals', U.count(g.schools)], ['Open value', U.money(g.openValue)],
                                  ['Students', U.count(g.students)]];
                        } })) +
          card('Every recorded blocker, verbatim', 'The raw field notes behind the categories above.',
               '<div style="max-height:320px;overflow:auto">' +
               (withBlockers.length
                 ? withBlockers.slice(0, 60).map(function (r) {
                     return '<div style="padding:8px 0;border-bottom:1px solid var(--grid)">' +
                       '<button class="btn-ghost" data-open="' + U.esc(r.id) + '" style="padding:0;font-weight:600;cursor:pointer">' + U.esc(r.name) + '</button>' +
                       ' <span class="small muted">' + U.esc(r.region || '') + '</span>' +
                       '<div class="small sec">' + U.esc(r.blockers) + '</div></div>';
                   }).join('')
                 : '<div class="empty">No blockers recorded.</div>') + '</div>') +
        '</div>';

      bindFilters(host, render);
      RB.viewsSales.bindCommon(host);
      host.querySelectorAll('[data-key]').forEach(function (g) {
        g.addEventListener('click', function () {
          var key = g.getAttribute('data-key');
          if (key.indexOf('||') !== -1) {
            var p = key.split('||');
            var tag = Object.keys(M.BLOCKER_LABEL).filter(function (t) { return M.BLOCKER_LABEL[t] === p[0]; })[0];
            return drill(p[0] + ' in ' + p[1], rows.filter(function (x) { return x.region === p[1] && x.blockerTags.indexOf(tag) !== -1; }));
          }
          var b = byBlocker.filter(function (x) { return x.key === key; })[0];
          if (b) return drill('Blocker: ' + key, b.rows);
          var c = comps.filter(function (x) { return x.key === key; })[0];
          if (c) return drill('Competitor: ' + key, c.rows);
          var rb = rateBands.filter(function (x) { return x.key === key; })[0];
          if (rb) return drill('Rate card: ' + key, rb.rows);
        });
      });
    }
  }

  /* ==================================================== PIPELINE HEALTH === */
  function health(host) {
    render();
    function render() {
      var rows = apply(RB.store.all());
      var s = M.summarise(rows, opts());
      var limit = settings().stalledAfterDays;
      var worked = rows.filter(M.isWorking);

      var ageBands = M.AGE_BANDS.map(function (b) {
        var list = rows.filter(function (r) { return M.ageBand(r) === b; });
        return { key: b, rows: list, n: list.length, value: U.sum(list, M.dealSize) };
      }).filter(function (b) { return b.n; });

      var fieldGaps = M.CRITICAL.map(function (f) {
        var list = worked.filter(function (r) { return !f.has(r); });
        return { key: f.label, rows: list, value: list.length };
      });

      var precision = ['exact', 'day', 'month', 'none'].map(function (p) {
        var list = rows.filter(function (r) { return r.lastContactedPrecision === p; });
        return { key: { exact: 'Exact date', day: 'Day + month, year inferred', month: 'Month only', none: 'No usable date' }[p],
                 rows: list, value: list.length };
      }).filter(function (p) { return p.value; });

      var dupes = rows.filter(function (r) { return r.duplicateFlag; });

      host.innerHTML =
        head('Pipeline health', 'Whether the numbers on the other screens can be trusted, and what to chase to fix them.') +
        filterBar() +
        staleNotice(rows) +
        UI.statRow([
          UI.stat({ label: 'Record completeness', value: Math.round(s.hygiene) + '%',
                    tone: s.hygiene < 60 ? 'critical' : s.hygiene < 85 ? 'warning' : 'good',
                    foot: '<span class="sec">across ' + worked.length + ' worked accounts</span>' }),
          UI.stat({ label: 'Stages confirmed', value: Math.round(s.stageConfirmedPct) + '%',
                    tone: s.stageConfirmedPct < 50 ? 'warning' : null,
                    foot: '<span class="sec">rest are read from the sheet wording</span>' }),
          UI.stat({ label: 'No next step', value: U.count(s.noNextAction.length), tone: 'warning',
                    foot: '<span class="sec">' + U.money(U.sum(s.noNextAction, M.dealSize)) + ' unforecastable</span>', onClick: 'nonext' }),
          UI.stat({ label: 'Overdue follow-ups', value: U.count(s.overdue.length), tone: s.overdue.length ? 'critical' : null, onClick: 'overdue' }),
          UI.stat({ label: 'Possible duplicates', value: U.count(dupes.length), tone: dupes.length ? 'warning' : null, onClick: 'dupes' })
        ]) +

        '<div class="grid grid-2">' +
          card('How stale is the pipeline', 'Schools by how long since anyone last spoke to them.',
               C.hbar({ data: ageBands.map(function (b) { return { key: b.key, value: b.n }; }),
                        sort: false,
                        format: U.count, measureLabel: 'Schools', labelW: 150, onClick: true,
                        color: function (d, i) { return C.ordinalColor(i, ageBands.length); },
                        tipRows: function (d) {
                          var b = ageBands.filter(function (x) { return x.key === d.key; })[0];
                          return [['Schools', U.count(b.n)], ['Pipeline value', U.money(b.value)]];
                        } })) +
          card('Which fields are missing', 'Counted only on accounts the team is actually working.',
               C.hbar({ data: U.sortBy(fieldGaps, function (f) { return f.value; }, 'desc'),
                        format: U.count, measureLabel: 'Accounts missing it', labelW: 160, onClick: true,
                        color: function () { return 'var(--serious)'; } })) +
        '</div>' +

        '<div class="grid grid-2" style="margin-top:16px">' +
          card('How reliable are the contact dates', 'The imported sheet wrote most dates as free text like “1ST WEEK AUGUST”. Anything but “exact” is an approximation.',
               C.hbar({ data: precision, sort: false, format: U.count, measureLabel: 'Schools', labelW: 190, onClick: true,
                        color: function (d) { return d.key === 'Exact date' ? 'var(--good)' : d.key === 'No usable date' ? 'var(--critical)' : 'var(--serious)'; } })) +
          card('Data-quality rules', 'What the import checked, and what it refused to guess.',
               '<dl class="kv">' +
               '<dt>Rows imported</dt><dd>' + U.count(RB.store.meta().rowsInSource) + ' school rows from the master sheet\u2019s CLEAN MASTER tab</dd>' +
               '<dt>Stage</dt><dd>Never invented. Where the sheet had none, a stage is <em>suggested</em> from the wording and marked with a “?” until someone confirms it.</dd>' +
               '<dt>Probability</dt><dd>Derived from stage, not stored per school, so a stage change updates the forecast on its own.</dd>' +
               '<dt>Contact dates</dt><dd>Free text parsed to real dates where possible; bare month names resolve to ' + RB.store.meta().baseYearForTextDates + '.</dd>' +
               '<dt>Owners</dt><dd>Shared rows like “AYUSH &amp; PARTH” were split so both people are credited.</dd>' +
               '<dt>Lead source</dt><dd>Spelling variants (ELDOCKS, PUNE ELDROCKS) folded into one source.</dd>' +
               '</dl>') +
        '</div>' +

        '<div class="card" style="margin-top:16px"><div class="card-head"><h3>Worst records first</h3>' +
          '<span class="card-sub">biggest deals with the least information — chase these</span>' +
          '<span class="spacer"></span><button class="btn btn-sm" id="export-gaps">Download the chase list</button></div>' +
          '<div id="gap-table"></div></div>';

      bindFilters(host, render);
      host.querySelectorAll('[data-stat]').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-stat');
          if (k === 'nonext') drill('No next step', s.noNextAction);
          if (k === 'overdue') drill('Overdue follow-ups', s.overdue);
          if (k === 'dupes') drill('Possible duplicates', dupes);
        });
      });
      host.querySelectorAll('[data-key]').forEach(function (g) {
        g.addEventListener('click', function () {
          var key = g.getAttribute('data-key');
          var a = ageBands.filter(function (x) { return x.key === key; })[0];
          if (a) return drill('Last contact: ' + key, a.rows);
          var f = fieldGaps.filter(function (x) { return x.key === key; })[0];
          if (f) return drill('Missing: ' + key, f.rows);
          var p = precision.filter(function (x) { return x.key === key; })[0];
          if (p) return drill('Date quality: ' + key, p.rows);
        });
      });

      var gaps = U.sortBy(worked.filter(function (r) { return M.missingFields(r).length; }),
                          function (r) { return (r.dealSize || M.tamValue(r, opts().tamRate)) * (1 - M.completeness(r)); }, 'desc');
      host.querySelector('#export-gaps').addEventListener('click', function () { UI.exportSchools(gaps, 'robobox-chase-list.csv'); });
      UI.table(host.querySelector('#gap-table'), {
        rows: gaps, rowId: function (r) { return r.id; }, pageSize: 15,
        onRowClick: function (id) { UI.schoolDetail(id); },
        empty: 'Every worked account is complete.',
        columns: [
          { key: 'name', label: 'School', get: function (r) { return r.name; },
            render: function (r) { return '<span class="strong">' + U.esc(r.name) + '</span><div class="small muted">' + U.esc([r.location, r.region].filter(Boolean).join(' · ')) + '</div>'; } },
          { key: 'owner', label: 'Owner', get: function (r) { return r.owners.join(', '); },
            render: function (r) { return r.owners.length ? U.esc(r.owners.join(', ')) : '<span class="tag tag-warning">Unassigned</span>'; } },
          { key: 'deal', label: 'Deal size', num: true, get: function (r) { return r.dealSize || 0; },
            render: function (r) { return r.dealSize ? U.money(r.dealSize) : '<span class="muted">—</span>'; } },
          { key: 'complete', label: 'Complete', num: true, get: function (r) { return M.completeness(r); },
            render: function (r) { return UI.meter(M.completeness(r)); } },
          { key: 'missing', label: 'Missing fields', sortable: false, get: function (r) { return M.missingFields(r).join(', '); },
            render: function (r) { return M.missingFields(r).map(function (m) { return '<span class="tag tag-warning">' + U.esc(m) + '</span>'; }).join(' '); } }
        ]
      });
    }
  }

  /* ========================================================= EXPLORER ===== */
  /* Free-form pivot: pick a dimension and a measure, drill to the rows. */
  var X = { dim: 'region', measure: 'openValue', split: '' };

  var MEASURES = {
    schools:    { label: 'Schools', get: function (g) { return g.schools; }, fmt: U.count },
    students:   { label: 'Students', get: function (g) { return g.students; }, fmt: U.count },
    tamValue:   { label: 'TAM value', get: function (g) { return g.tamValue; }, fmt: U.money },
    openValue:  { label: 'Open pipeline value', get: function (g) { return g.openValue; }, fmt: U.money },
    weighted:   { label: 'Weighted forecast', get: function (g) { return g.weighted; }, fmt: U.money },
    wonValue:   { label: 'Won value', get: function (g) { return g.wonValue; }, fmt: U.money },
    coverage:   { label: 'Coverage %', get: function (g) { return Math.round(g.coverage); }, fmt: function (v) { return v + '%'; } },
    avgDeal:    { label: 'Average deal size', get: function (g) { return Math.round(g.avgDeal); }, fmt: U.money },
    stalled:    { label: 'Accounts gone quiet', get: function (g) { return g.stalled.length; }, fmt: U.count },
    hygiene:    { label: 'Record completeness %', get: function (g) { return Math.round(g.hygiene); }, fmt: function (v) { return v + '%'; } },
    activities: { label: 'Updates logged', get: function (g) { return g.activities; }, fmt: U.count }
  };

  function explorer(host) {
    render();
    function render() {
      var rows = apply(RB.store.all());
      var groups = M.byDimension(rows, X.dim, opts());
      var measure = MEASURES[X.measure];
      var data = U.sortBy(groups.map(function (g) { return { key: g.key, value: measure.get(g), group: g }; }),
                          function (d) { return d.value; }, 'desc');

      var splitDims = Object.keys(M.DIMENSIONS);
      var matrix = '';
      if (X.split && X.split !== X.dim) {
        var cols = M.byDimension(rows, X.split, opts()).slice(0, 8).map(function (g) { return g.key; });
        var rowKeys = groups.slice(0, 14).map(function (g) { return g.key; });
        matrix = card(M.DIMENSIONS[X.dim].label + ' × ' + M.DIMENSIONS[X.split].label,
          measure.label + ' in every combination. Click a cell to open those schools.',
          C.heatmap({
            rows: rowKeys, cols: cols, measureLabel: measure.label, format: measure.fmt, onClick: true,
            get: function (r, c) {
              var cell = cellRows(rows, r, c);
              return cell.length ? measure.get(M.summarise(cell, opts())) : 0;
            }
          }));
      }

      var f = M.funnel(rows);
      var convSteps = M.conversion(rows);

      host.innerHTML =
        head('Deep dive', 'The funnel, then any slice of the pipeline you want to take apart.') +
        filterBar() +
        '<div class="grid grid-2">' +
          card('Pipeline funnel', 'Cumulative — a school at Proposal counts at every stage below it. Click a stage to open it.',
               C.funnel({ data: f, format: U.money, onClick: true })) +
          card('Step-by-step conversion', 'Share getting through each step, and the value that stops there.',
               conversionTable(convSteps)) +
        '</div>' +
        '<div class="section-title">Slice it your way</div>' +
        '<div class="filters">' +
          '<span class="filter-label">Group by</span>' +
          UI.select('dim', Object.keys(M.DIMENSIONS).map(function (k) { return { value: k, label: M.DIMENSIONS[k].label }; }), X.dim) +
          '<span class="filter-label">Measure</span>' +
          UI.select('measure', Object.keys(MEASURES).map(function (k) { return { value: k, label: MEASURES[k].label }; }), X.measure) +
          '<span class="filter-label">Cross with</span>' +
          UI.select('split', splitDims.map(function (k) { return { value: k, label: M.DIMENSIONS[k].label }; }), X.split, { placeholder: 'Nothing' }) +
          '<span class="spacer"></span>' +
          '<button class="btn btn-sm" id="export-explore">Download this breakdown</button>' +
        '</div>' +

        card(measure.label + ' by ' + M.DIMENSIONS[X.dim].label.toLowerCase(), 'Click a bar to open those schools.',
             C.hbar({ data: data.slice(0, 20), format: measure.fmt, measureLabel: measure.label, labelW: 190, onClick: true,
                      tipRows: function (d) {
                        var g = d.group || (data.filter(function (x) { return x.key === d.key; })[0] || {}).group;
                        if (!g) return [[measure.label, measure.fmt(d.value)]];
                        return [['Schools', U.count(g.schools)], ['Open pipeline', U.money(g.openValue)],
                                ['Weighted', U.money(g.weighted)], ['Coverage', Math.round(g.coverage) + '%']];
                      } })) +

        (matrix ? '<div style="margin-top:16px">' + matrix + '</div>' : '') +

        '<div class="card" style="margin-top:16px"><div class="card-head"><h3>Full breakdown</h3></div><div id="x-table"></div></div>';

      bindFilters(host, render);
      host.querySelectorAll('.filters select[name="dim"], .filters select[name="measure"], .filters select[name="split"]').forEach(function (sel) {
        sel.addEventListener('change', function () { X[sel.getAttribute('name')] = sel.value; render(); });
      });
      host.querySelector('#export-explore').addEventListener('click', function () {
        U.download('robobox-' + X.dim + '-breakdown.csv', U.toCSV(groups, [
          { label: M.DIMENSIONS[X.dim].label, get: function (g) { return g.key; } },
          { label: 'Schools', get: function (g) { return g.schools; } },
          { label: 'Students', get: function (g) { return g.students; } },
          { label: 'TAM value', get: function (g) { return Math.round(g.tamValue); } },
          { label: 'Approached', get: function (g) { return g.approached; } },
          { label: 'Coverage %', get: function (g) { return Math.round(g.coverage); } },
          { label: 'Open pipeline', get: function (g) { return Math.round(g.openValue); } },
          { label: 'Weighted', get: function (g) { return Math.round(g.weighted); } },
          { label: 'Won value', get: function (g) { return Math.round(g.wonValue); } },
          { label: 'Gone quiet', get: function (g) { return g.stalled.length; } },
          { label: 'Completeness %', get: function (g) { return Math.round(g.hygiene); } }
        ]));
        UI.toast('Breakdown downloaded.');
      });

      host.querySelectorAll('[data-key]').forEach(function (g) {
        g.addEventListener('click', function () {
          var key = g.getAttribute('data-key');
          if (key.indexOf('||') !== -1) {
            var p = key.split('||');
            return drill(p[0] + ' × ' + p[1], cellRows(rows, p[0], p[1]));
          }
          var step = f.filter(function (x) { return x.key === key; })[0];
          if (step) return drill('Reached ' + key, step.rows);
          var grp = groups.filter(function (x) { return x.key === key; })[0];
          if (grp) drill(M.DIMENSIONS[X.dim].label + ': ' + key, grp.rows);
        });
      });

      UI.table(host.querySelector('#x-table'), {
        rows: groups, rowId: function (g) { return g.key; }, sortKey: 'open', pageSize: 25,
        onRowClick: function (key) {
          var grp = groups.filter(function (x) { return x.key === key; })[0];
          if (grp) drill(M.DIMENSIONS[X.dim].label + ': ' + key, grp.rows);
        },
        empty: 'No data.',
        columns: [
          { key: 'key', label: M.DIMENSIONS[X.dim].label, get: function (g) { return g.key; },
            render: function (g) { return '<span class="strong">' + U.esc(g.key) + '</span>'; } },
          { key: 'schools', label: 'Schools', num: true, get: function (g) { return g.schools; }, render: function (g) { return U.count(g.schools); } },
          { key: 'students', label: 'Students', num: true, get: function (g) { return g.students; }, render: function (g) { return U.count(g.students); } },
          { key: 'tam', label: 'TAM value', num: true, get: function (g) { return g.tamValue; }, render: function (g) { return U.money(g.tamValue); } },
          { key: 'cov', label: 'Coverage', num: true, get: function (g) { return g.coverage; }, render: function (g) { return UI.meter(g.coverage / 100); } },
          { key: 'open', label: 'Open pipeline', num: true, get: function (g) { return g.openValue; }, render: function (g) { return U.money(g.openValue); } },
          { key: 'weighted', label: 'Weighted', num: true, get: function (g) { return g.weighted; }, render: function (g) { return U.money(g.weighted); } },
          { key: 'won', label: 'Won', num: true, get: function (g) { return g.wonValue; }, render: function (g) { return g.wonValue ? U.money(g.wonValue) : '<span class="muted">—</span>'; } },
          { key: 'quiet', label: 'Gone quiet', num: true, get: function (g) { return g.stalled.length; }, render: function (g) { return U.count(g.stalled.length); } },
          { key: 'hyg', label: 'Completeness', num: true, get: function (g) { return g.hygiene; }, render: function (g) { return UI.meter(g.hygiene / 100); } }
        ]
      });
    }
  }

  function cellRows(rows, rKey, cKey) {
    var rGet = M.DIMENSIONS[X.dim].get, cGet = M.DIMENSIONS[X.split].get;
    return rows.filter(function (s) {
      return has(rGet(s), rKey) && has(cGet(s), cKey);
    });
  }

  function has(v, key) {
    if (Array.isArray(v)) return v.indexOf(key) !== -1;
    return String(v === null || v === undefined || v === '' ? '—' : v) === key;
  }

  return {
    commandCentre: commandCentre, market: market, team: team,
    blockers: blockers, health: health, explorer: explorer, drill: drill
  };
})();
