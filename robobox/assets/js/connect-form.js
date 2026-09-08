/* Robobox Connect - the one form.
 *
 * New Connect and Reconnect are the same flow with different depth, not two
 * workflows. Steps appear as they become relevant, and date, time and
 * salesperson are never asked for.
 */
window.RB = window.RB || {};

RB.connectForm = (function () {
  'use strict';

  var U = RB.util, M = RB.model, UI = RB.ui, V = RB.model.V;

  /* Draft carried across the steps of one Connect. */
  var d = null;

  function open(preset) {
    d = Object.assign({
      kind: null, schoolId: null, opportunityId: null, contactId: null,
      newSchool: null, newContact: null
    }, preset || {});
    if (d.opportunityId) {
      var o = RB.store.opportunityById(d.opportunityId);
      d.schoolId = o.schoolId; d.kind = 'Reconnect';
      return stepDetail();
    }
    stepKind();
  }

  function shell(title, body, onMount) {
    return UI.modal(title, body, { wide: false, onMount: onMount });
  }

  /* ------------------------------------------------------------- step 1 */
  function stepKind() {
    shell('Log a Connect',
      '<div class="cx-step"><h3>Connect type</h3>' +
      UI.choice('kind', [
        { value: 'New Connect', label: 'New Connect', sub: 'A school or opportunity we have not worked before' },
        { value: 'Reconnect', label: 'Reconnect', sub: 'An update on something already in play' }
      ], d.kind) + '</div>',
      function (host) {
        UI.bindChoices(host, function (_, v) {
          d.kind = v;
          v === 'New Connect' ? stepNewSchool() : stepPickSchool();
        });
      });
  }

  /* ------------------------------------------ step 2: which school */
  function stepPickSchool() {
    var recent = recentSchools();
    shell('Reconnect · which school?',
      '<input class="input" id="sch-q" type="search" placeholder="Search schools…" autocomplete="off" autofocus>' +
      '<div class="section-title" id="sch-label">Recent</div>' +
      '<div class="pick-list" id="sch-list"></div>',
      function (host) {
        var list = host.querySelector('#sch-list'), q = host.querySelector('#sch-q');
        draw(recent);
        q.focus();
        q.addEventListener('input', U.debounce(function () {
          var t = q.value.trim().toLowerCase();
          host.querySelector('#sch-label').textContent = t ? 'Matches' : 'Recent';
          draw(t ? RB.store.schools().filter(function (s) {
            return (s.name + ' ' + (s.location || '')).toLowerCase().indexOf(t) !== -1;
          }).slice(0, 20) : recent);
        }, 140));

        function draw(items) {
          list.innerHTML = items.length ? items.map(function (s) {
            var opps = RB.store.opportunitiesFor(s.id).filter(function (o) { return o.status === 'Open'; });
            return '<button type="button" class="pick" data-id="' + U.esc(s.id) + '">' +
              '<span class="pick-main"><strong>' + U.esc(s.name) + '</strong>' +
              '<small>' + U.esc([s.location, s.board].filter(Boolean).join(' · ')) + '</small></span>' +
              '<span class="pick-right small muted">' + opps.length + ' open</span></button>';
          }).join('') : '<div class="empty">No school matches. Log a New Connect to add one.</div>';
          list.querySelectorAll('[data-id]').forEach(function (b) {
            b.addEventListener('click', function () { d.schoolId = b.getAttribute('data-id'); stepPickOpportunity(); });
          });
        }
      });
  }

  function recentSchools() {
    var me = RB.auth.user();
    var seen = [], out = [];
    RB.store.connects().slice().sort(function (a, b) {
      return String(b.at || '').localeCompare(String(a.at || ''));
    }).forEach(function (c) {
      if (out.length >= 8 || seen.indexOf(c.schoolId) !== -1) return;
      var s = RB.store.schoolById(c.schoolId);
      if (!s) return;
      if (me.role === 'sales' && s.ownerKey !== me.ownerKey) return;
      seen.push(c.schoolId); out.push(s);
    });
    return out;
  }

  /* -------------------------------- step 3: which opportunity (reconnect) */
  function stepPickOpportunity() {
    var school = RB.store.schoolById(d.schoolId);
    var opps = RB.store.opportunitiesFor(d.schoolId).map(M.view)
      .filter(function (v) { return v.status === 'Open'; });

    shell(school.name,
      '<p class="sec small" style="margin-top:0">Which opportunity is this about?</p>' +
      '<div class="pick-list">' +
      opps.map(function (v) {
        return '<button type="button" class="pick" data-id="' + U.esc(v.opp.id) + '">' +
          '<span class="pick-main"><strong>' + U.esc(v.opp.offering || 'Opportunity') + '</strong>' +
          '<small>' + U.esc(v.stage) + (v.lastAt ? ' · last ' + U.fmtDate(v.lastAt) : '') + '</small></span>' +
          '<span class="pick-right"><strong>' + U.esc(U.money(v.current)) + '</strong></span></button>';
      }).join('') +
      '<button type="button" class="pick" data-new="1"><span class="pick-main">' +
      '<strong>+ New opportunity at this school</strong>' +
      '<small>A different offering</small></span></button>' +
      '</div>',
      function (host) {
        host.querySelectorAll('[data-id]').forEach(function (b) {
          b.addEventListener('click', function () { d.opportunityId = b.getAttribute('data-id'); stepDetail(); });
        });
        host.querySelector('[data-new]').addEventListener('click', function () {
          d.kind = 'New Connect'; stepOpportunity();
        });
      });
  }

  /* ----------------------------------- step 2N: school info (new connect) */
  function stepNewSchool() {
    shell('New Connect · school',
      '<input class="input" id="sch-q" type="search" placeholder="Search — or type a new school name" autocomplete="off">' +
      '<div id="sch-hits" class="pick-list" style="margin-top:10px"></div>' +
      '<form id="f" style="margin-top:14px" hidden>' +
      '<div class="field-row">' +
        UI.field('School name', '<input class="input" name="name" required>') +
        UI.field('Location', '<input class="input" name="location" placeholder="e.g. Thane" required>') +
      '</div>' +
      '<div class="field-row">' +
        UI.field('Region', UI.select('region', V.region, 'Mumbai', { required: true })) +
        UI.field('Board', UI.select('board', V.board, null, { placeholder: 'Select', required: true })) +
        UI.field('Approx. students', '<input class="input" type="number" name="students" min="0" inputmode="numeric">') +
      '</div>' +
      '<div class="field-row">' +
        UI.field('Existing STEM / robotics lab', UI.select('existingLab', V.existingLab, "Don't Know")) +
        UI.field('Existing competitor', UI.select('competitor', V.competitor, 'None')) +
        UI.field('Lead source', UI.select('leadSource', V.leadSource, null, { placeholder: 'Select', required: true })) +
      '</div>' +
      '<div class="modal-actions"><button type="submit" class="btn btn-primary btn-lg btn-block">Continue</button></div>' +
      '</form>',
      function (host) {
        var q = host.querySelector('#sch-q'), hits = host.querySelector('#sch-hits'), f = host.querySelector('#f');
        q.focus();
        q.addEventListener('input', U.debounce(function () {
          var t = q.value.trim();
          f.hidden = t.length < 2;
          f.querySelector('[name=name]').value = t;
          var found = t.length < 2 ? [] : RB.store.schools().filter(function (s) {
            return s.name.toLowerCase().indexOf(t.toLowerCase()) !== -1;
          }).slice(0, 5);
          // A school exists once. If it is already here, use it.
          hits.innerHTML = found.map(function (s) {
            return '<button type="button" class="pick" data-id="' + U.esc(s.id) + '">' +
              '<span class="pick-main"><strong>' + U.esc(s.name) + '</strong>' +
              '<small>Already on file · ' + U.esc(s.location || '') + ' — use this one</small></span></button>';
          }).join('');
          hits.querySelectorAll('[data-id]').forEach(function (b) {
            b.addEventListener('click', function () { d.schoolId = b.getAttribute('data-id'); stepOpportunity(); });
          });
        }, 150));

        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var v = UI.values(this);
          var existing = RB.store.findSchool(v.name, v.location);
          d.schoolId = existing ? existing.id : RB.store.addSchool({
            name: v.name, location: v.location, region: v.region, board: v.board,
            students: v.students ? Number(v.students) : null,
            existingLab: v.existingLab, competitor: v.competitor, leadSource: v.leadSource,
            ownerKey: RB.auth.user().ownerKey
          }).id;
          stepOpportunity();
        });
      });
  }

  /* --------------------------------------------- step 3N: the opportunity */
  function stepOpportunity() {
    var school = RB.store.schoolById(d.schoolId);
    shell(school.name + ' · opportunity',
      '<form id="f">' +
      '<div class="cx-step"><h3>What are you connecting about?</h3>' +
      UI.choice('offering', V.offering.map(function (o) {
        return { value: o, label: o, sub: V.offeringDetail[o] };
      }), null) + '</div>' +
      '<div id="variant-wrap" hidden></div>' +
      UI.field('Initial potential revenue (₹)',
        '<input class="input" type="number" name="initialPotential" min="0" step="1000" inputmode="numeric" required>',
        'Your best estimate today. It is locked once saved, so realisation can be measured against it later.') +
      '<div class="modal-actions"><button type="submit" class="btn btn-primary btn-lg btn-block">Continue</button></div>' +
      '</form>',
      function (host) {
        var wrap = host.querySelector('#variant-wrap');
        UI.bindChoices(host, function (name, val) {
          if (name !== 'offering') return;
          if (val === 'Bagless Skills') {
            wrap.hidden = false;
            wrap.innerHTML = UI.field('Which activity?', UI.select('variant', V.baglessActivity, null, { placeholder: 'Select' }));
          } else if (val === 'Robotics Workshop') {
            wrap.hidden = false;
            wrap.innerHTML = UI.field('Workshop type', UI.select('variant', V.workshopType, null, { placeholder: 'Select' }));
          } else { wrap.hidden = true; wrap.innerHTML = ''; }
        });
        host.querySelector('#f').addEventListener('submit', function (e) {
          e.preventDefault();
          var v = UI.values(this);
          if (!v.offering) return UI.toast('Pick what this is about.');
          d.opportunityId = RB.store.addOpportunity({
            schoolId: d.schoolId, offering: v.offering, variant: v.variant || null,
            ownerKey: RB.auth.user().ownerKey,
            initialPotential: Number(v.initialPotential) || null
          }).id;
          stepContact();
        });
      });
  }

  /* -------------------------------------------------- step 4N: the contact */
  function stepContact() {
    var existing = RB.store.contactsFor(d.schoolId);
    shell('Who are you connecting with?',
      (existing.length
        ? '<div class="pick-list" style="margin-bottom:16px">' + existing.map(function (c) {
            return '<button type="button" class="pick" data-id="' + U.esc(c.id) + '">' +
              '<span class="pick-main"><strong>' + U.esc(c.name) + '</strong><small>' + U.esc(c.role || '') + '</small></span></button>';
          }).join('') + '</div><div class="section-title">Or add someone new</div>'
        : '') +
      '<form id="f">' +
      '<div class="cx-step"><h3>Role</h3>' + UI.choice('role', V.contactRole, null, { tight: true }) + '</div>' +
      '<div class="field-row">' +
        UI.field('Name', '<input class="input" name="name" required>') +
        UI.field('Phone', '<input class="input" type="tel" name="phone" inputmode="tel">') +
        UI.field('Email', '<input class="input" type="email" name="email">') +
      '</div>' +
      '<div class="modal-actions"><button type="submit" class="btn btn-primary btn-lg btn-block">Continue</button></div>' +
      '</form>',
      function (host) {
        host.querySelectorAll('.pick[data-id]').forEach(function (b) {
          b.addEventListener('click', function () { d.contactId = b.getAttribute('data-id'); stepDetail(); });
        });
        UI.bindChoices(host);
        host.querySelector('#f').addEventListener('submit', function (e) {
          e.preventDefault();
          var v = UI.values(this);
          if (!v.role) return UI.toast('Pick their role.');
          d.contactId = RB.store.addContact({
            schoolId: d.schoolId, name: v.name, role: v.role,
            phone: v.phone || null, email: v.email || null
          }).id;
          stepDetail();
        });
      });
  }

  /* ---------------------------- final step: what happened, and what's next */
  function stepDetail() {
    var isNew = d.kind === 'New Connect';
    var opp = RB.store.opportunityById(d.opportunityId);
    var v = M.view(opp);
    var school = RB.store.schoolById(d.schoolId);
    var contacts = RB.store.contactsFor(d.schoolId);
    var prev = v.last;

    shell(school.name + ' · ' + (opp.offering || 'Connect'),
      (prev
        ? '<div class="prev-connect"><div class="pc-label">Previous connect</div>' +
          U.esc([prev.at ? U.fmtDate(prev.at.slice(0, 10)) : 'undated',
                 contactName(prev.contactId), prev.response,
                 prev.nextAction ? 'next: ' + prev.nextAction : null].filter(Boolean).join(' · ')) +
          '</div>'
        : '') +
      '<form id="f">' +

      '<div class="cx-step"><h3>How did you connect?</h3>' +
      UI.choice('mode', isNew ? V.connectModeNew : V.connectModeRe, null, { tight: true }) + '</div>' +

      (contacts.length && !isNew
        ? '<div class="cx-step"><h3>Who with?</h3>' +
          UI.choice('contactId', contacts.map(function (c) {
            return { value: c.id, label: c.name, sub: c.role };
          }).concat([{ value: '__new', label: '+ New contact', sub: 'Someone we have not spoken to' }]),
          d.contactId || (contacts[0] && contacts[0].id), { tight: true }) +
          '<div id="new-contact" hidden style="margin-top:12px"></div></div>'
        : '') +

      '<div class="cx-step"><h3>What was the response?</h3>' +
      UI.choice('response', isNew ? V.responseNew : V.responseRe, null, { tight: true }) + '</div>' +

      '<div class="cx-step"><h3>Interest level</h3>' +
      UI.choice('interest', V.interest, 'Warm', { tight: true }) + '</div>' +

      (isNew ? '' :
        '<div class="cx-step"><h3>What changed?</h3>' +
        UI.choice('changed', V.changed, 'No Change', { tight: true }) + '</div>') +

      '<div id="commercial" hidden></div>' +
      '<div id="close-wrap" hidden></div>' +

      '<div class="cx-step"><h3>Is there a blocker?</h3>' +
      UI.choice('blocker', V.blocker, 'None', { tight: true }) +
      '<div id="blocker-detail" hidden style="margin-top:12px"></div></div>' +

      UI.field('Notes (optional)', '<textarea class="input" name="notes" placeholder="Anything worth remembering next time"></textarea>') +

      '<div class="cx-step"><h3>What happens next?</h3>' +
      UI.choice('nextAction', V.nextAction, null, { tight: true }) +
      '<div id="next-when" hidden style="margin-top:12px"><div class="field-row">' +
        UI.field('Date', '<input class="input" type="date" name="nextDate" value="' + U.addDays(U.iso(U.today()), 7) + '">') +
        UI.field('Time', '<input class="input" type="time" name="nextTime" value="11:00">') +
      '</div></div></div>' +

      '<div class="modal-actions"><button type="submit" class="btn btn-primary btn-lg btn-block">Save Connect</button></div>' +
      '</form>',
      function (host) {
        var commercial = host.querySelector('#commercial');
        var closeWrap = host.querySelector('#close-wrap');
        var blockerDetail = host.querySelector('#blocker-detail');
        var nextWhen = host.querySelector('#next-when');
        var newContact = host.querySelector('#new-contact');

        UI.bindChoices(host, function (name, val) {
          if (name === 'response') {
            // Progressive disclosure: only ask for money when the answer implies it.
            var wantsQuote = /Proposal/.test(val);
            var wantsNeg = val === 'Negotiation';
            commercial.hidden = !(wantsQuote || wantsNeg);
            commercial.innerHTML = commercial.hidden ? '' :
              '<div class="cx-step"><h3>Commercial</h3>' +
              (wantsQuote ? UI.field('Quoted value (₹)',
                '<input class="input" type="number" name="quoted" min="0" step="1000" inputmode="numeric" value="' +
                (v.quoted != null ? v.quoted : (v.initialPotential || '')) + '">') : '') +
              (wantsNeg ? UI.field('Negotiated value (₹)',
                '<input class="input" type="number" name="negotiated" min="0" step="1000" inputmode="numeric" value="' +
                (v.negotiated != null ? v.negotiated : (v.quoted || '')) + '">') : '') +
              '<p class="field-hint">Initial potential stays at ' + U.esc(U.money(v.initialPotential)) +
              '. Nothing overwrites it.</p></div>';

            var lost = val === 'Lost' || val === 'Not Interested';
            closeWrap.hidden = !lost;
            closeWrap.innerHTML = lost ? lossFields(v) : '';
          }
          if (name === 'blocker') {
            blockerDetail.hidden = val === 'None';
            blockerDetail.innerHTML = val === 'None' ? '' :
              UI.field('Blocker detail (optional)', '<input class="input" name="blockerDetail" placeholder="What exactly is in the way?">');
          }
          if (name === 'nextAction') {
            nextWhen.hidden = val === 'No Further Action';
          }
          if (name === 'contactId' && newContact) {
            newContact.hidden = val !== '__new';
            newContact.innerHTML = val !== '__new' ? '' :
              '<div class="field-row">' +
              UI.field('Name', '<input class="input" name="ncName">') +
              UI.field('Role', UI.select('ncRole', V.contactRole, null, { placeholder: 'Select' })) +
              UI.field('Phone', '<input class="input" type="tel" name="ncPhone">') + '</div>';
          }
        });

        // Won is an explicit button, not a response — it needs a closed value.
        var actions = host.querySelector('.modal-actions');
        if (v.status === 'Open') {
          var wonBtn = document.createElement('button');
          wonBtn.type = 'button';
          wonBtn.className = 'btn btn-dark btn-lg';
          wonBtn.textContent = 'Mark Won';
          wonBtn.addEventListener('click', function () { markWon(v); });
          actions.insertBefore(wonBtn, actions.firstChild);
        }

        host.querySelector('#f').addEventListener('submit', function (e) {
          e.preventDefault();
          submit(UI.values(this), v);
        });
      });
  }

  function lossFields(v) {
    return '<div class="cx-step"><h3>Marking this lost</h3>' +
      UI.field('Loss reason', UI.select('lossReason', V.lossReason, null, { placeholder: 'Select a reason', required: true })) +
      UI.field('Final opportunity value (₹)',
        '<input class="input" type="number" name="finalValue" min="0" step="1000" value="' + (v.current || '') + '">',
        'What we would have earned. Kept so lost value can be totalled.') + '</div>';
  }

  function markWon(v) {
    UI.modal('Mark Won — ' + (v.school ? v.school.name : ''),
      '<form id="won">' +
      UI.field('Closed value (₹)', '<input class="input" type="number" name="closedValue" min="0" step="1000" required value="' +
        (v.negotiated != null ? v.negotiated : (v.quoted || v.initialPotential || '')) + '">',
        'Initial potential was ' + U.money(v.initialPotential) +
        (v.quoted != null ? ', quoted ' + U.money(v.quoted) : '')) +
      UI.field('Closure date', '<input class="input" type="date" name="closedAt" value="' + U.iso(U.today()) + '" required>') +
      '<div class="modal-actions"><button type="button" class="btn" data-close="1">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">Confirm Won</button></div></form>',
      { onMount: function (h) {
          h.querySelector('#won').addEventListener('submit', function (e) {
            e.preventDefault();
            var f = UI.values(this);
            RB.store.logConnect({
              schoolId: v.opp.schoolId, opportunityId: v.opp.id, by: RB.auth.user().id,
              kind: 'Reconnect', mode: 'Meeting', response: 'Negotiation', interest: 'Hot',
              notes: 'Closed won.', nextAction: 'No Further Action',
              at: f.closedAt + 'T12:00:00',
              close: { status: 'Won', value: Number(f.closedValue) }
            });
            done(v, 'Won — ' + U.money(Number(f.closedValue)) + ' added to closed revenue.');
          });
        } });
  }

  function submit(f, v) {
    if (!f.mode) return UI.toast('How did you connect?');
    if (!f.response) return UI.toast('What was the response?');

    var contactId = f.contactId === '__new' ? null : (f.contactId || d.contactId || null);
    if (f.contactId === '__new' && f.ncName) {
      contactId = RB.store.addContact({
        schoolId: d.schoolId, name: f.ncName, role: f.ncRole || 'Other', phone: f.ncPhone || null
      }).id;
    }

    var commercial = {};
    if (f.quoted) commercial.quoted = Number(f.quoted);
    if (f.negotiated) commercial.negotiated = Number(f.negotiated);

    var payload = {
      schoolId: d.schoolId, opportunityId: d.opportunityId, by: RB.auth.user().id,
      kind: d.kind === 'New Connect' ? 'New' : 'Reconnect',
      mode: f.mode, contactId: contactId, response: f.response,
      interest: f.interest || 'Warm', blocker: f.blocker || 'None',
      blockerDetail: f.blockerDetail || null, changed: f.changed || null,
      commercial: commercial, notes: f.notes || null,
      nextAction: f.nextAction || null,
      nextActionAt: (f.nextAction && f.nextAction !== 'No Further Action' && f.nextDate)
        ? f.nextDate + 'T' + (f.nextTime || '11:00') + ':00' : null
    };

    if (f.lossReason) {
      payload.close = { status: 'Lost', reason: f.lossReason,
                        value: f.finalValue ? Number(f.finalValue) : v.current };
    }

    RB.store.logConnect(payload);

    var msg = payload.close ? 'Marked lost — ' + f.lossReason
      : payload.nextActionAt ? 'Connect saved. Task set for ' + U.fmtDate(f.nextDate) + '.'
      : 'Connect saved.';
    done(v, msg);
  }

  function done(v, msg) {
    UI.closeModal();
    UI.toast(msg, { label: 'Log another', run: function () { open(); } });
    RB.app.refresh();
  }

  function contactName(id) {
    var c = id ? RB.store.contactById(id) : null;
    return c ? c.name : null;
  }

  return { open: open };
})();
