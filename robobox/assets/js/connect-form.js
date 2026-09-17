/* Robobox Connect - the one form, two entries.
 *
 * NEW SCHOOL CONNECT   create a lead, branch on whether a STEM lab exists,
 *                      then capture the connect.
 * EXISTING SCHOOL      find the school, pick or add an opportunity, then
 *                      capture the connect.
 *
 * Both converge on the same connect block: mode, response, blockers, next
 * action, stage, expected closure. One connect = one actionable update, and
 * it is not complete until action + owner + follow-up date are captured.
 */
window.RB = window.RB || {};

RB.connectForm = (function () {
  'use strict';

  var U = RB.util, M = RB.model, UI = RB.ui, V = RB.model.V;
  var d = null;   // draft carried across the steps of one connect

  function open(preset) {
    d = Object.assign({ kind: null, schoolId: null, opportunityId: null, contactId: null },
                      preset || {});
    if (d.opportunityId) { d.kind = 'Existing'; return stepConnect(); }
    if (d.schoolId) { d.kind = 'Existing'; return stepPickOpportunity(); }
    stepKind();
  }

  /* The school this draft is about, whichever path got us here: typed on a
   * new lead, or picked from the database on an existing one. */
  function draftSchool() {
    return d.school || RB.store.schoolById(d.schoolId) || {};
  }

  function shell(title, body, onMount) {
    return UI.modal(title, body, { onMount: function (host) {
      UI.bindDatePickers(host);
      if (onMount) onMount(host);
    } });
  }

  function owners() {
    return RB.store.users().filter(function (u) { return u.ownerKey; })
      .map(function (u) { return { value: u.ownerKey, label: u.name }; });
  }

  /* ------------------------------------------------------------- entry */
  function stepKind() {
    shell('Log a Connect',
      '<div class="cx-step"><h3>Which is it?</h3>' +
      UI.choice('kind', [
        { value: 'New', label: 'New School Connect', sub: 'Create and convert a new school lead' },
        { value: 'Existing', label: 'Existing School Connect', sub: 'Grow an opportunity at a school we know' }
      ], d.kind) + '</div>',
      function (host) {
        UI.bindChoices(host, function (_, v) {
          d.kind = v;
          v === 'New' ? stepNewLead() : stepSearchSchool();
        });
      });
  }

  /* ============================================ NEW SCHOOL CONNECT ==== */
  /* 1. Create new school lead — the name is typed, not searched. */
  function stepNewLead() {
    shell('New school lead',
      '<form id="f">' +
      '<div class="field-row">' +
        UI.field('School name', '<input class="input" name="name" required autofocus autocomplete="off">') +
        UI.field('Location', '<input class="input" name="location" required>') +
      '</div>' +
      '<div class="field-row">' +
        UI.field('Sales region', UI.select('region', V.region, null, { placeholder: 'Select', required: true })) +
        UI.field('Board', UI.select('board', V.board, null, { placeholder: 'Select', required: true })) +
        UI.field('Student count', '<input class="input" type="number" name="students" min="0" step="1" inputmode="numeric">') +
      '</div>' +
      '<div class="field-row">' +
        UI.field('Lead source', UI.select('leadSource', V.leadSource, null, { placeholder: 'Select', required: true })) +
        UI.field('Referral person', '<input class="input" name="referredBy" placeholder="Only if referred">') +
      '</div>' +
      '<div id="dupe"></div>' +
      '<div class="modal-actions"><button type="submit" class="btn btn-primary btn-lg btn-block">Continue</button></div>' +
      '</form>',
      function (host) {
        var f = host.querySelector('#f'), dupe = host.querySelector('#dupe');
        // A school exists once — warn before a second record is created.
        f.querySelector('[name=name]').addEventListener('input', U.debounce(function () {
          var t = this.value.trim();
          var hit = t.length > 2 && RB.store.schools().filter(function (s) {
            return s.name.toLowerCase().indexOf(t.toLowerCase()) !== -1;
          })[0];
          dupe.innerHTML = hit
            ? '<div class="prev-connect"><div class="pc-label">Already on file</div>' +
              U.esc(hit.name) + ' — ' + U.esc(hit.location || '') +
              '. <button type="button" class="btn btn-sm" data-use="' + U.esc(hit.id) + '">Use that school</button></div>'
            : '';
          var b = dupe.querySelector('[data-use]');
          if (b) b.addEventListener('click', function () {
            d.schoolId = b.getAttribute('data-use'); d.kind = 'Existing'; stepPickOpportunity();
          });
        }, 200));

        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var v = UI.values(this);
          d.school = {
            name: v.name, location: v.location, region: v.region, board: v.board,
            students: v.students ? Number(v.students) : null,
            leadSource: v.leadSource || null,
            referredBy: v.referredBy || null,
            ownerKey: RB.auth.user().ownerKey
          };
          stepStemLab();
        });
      });
  }

  /* 2. Does a STEM lab already exist? */
  function stepStemLab() {
    shell(d.school.name + ' · existing lab',
      '<div class="cx-step"><h3>Does a STEM lab already exist?</h3>' +
      UI.choice('stemLab', [
        { value: 'Yes', label: 'Yes', sub: 'Capture who runs it and what they spend' },
        { value: 'No', label: 'No', sub: 'Straight to the opportunity' }
      ], null) + '</div>',
      function (host) {
        UI.bindChoices(host, function (_, v) {
          d.school.stemLab = v;
          v === 'Yes' ? stepLabProfile() : stepOpportunity();
        });
      });
  }

  /* 2a. Existing lab profile. */
  function stepLabProfile() {
    shell(d.school.name + ' · existing lab profile',
      '<form id="f">' +
      UI.field('Competition name', UI.select('competitor', V.competitor2, null, { placeholder: 'Select', required: true })) +
      '<div class="field-row">' +
        UI.field('Type of lab', UI.select('labType', V.labType, null, { placeholder: 'Select' })) +
        UI.field('Spend on existing lab (₹)', '<input class="input" type="number" name="labSpend" min="0" step="any" inputmode="decimal">') +
      '</div>' +
      '<div class="modal-actions"><button type="submit" class="btn btn-primary btn-lg btn-block">Continue</button></div>' +
      '</form>',
      function (host) {
        host.querySelector('#f').addEventListener('submit', function (e) {
          e.preventDefault();
          var v = UI.values(this);
          d.school.competitor = v.competitor;
          d.school.existingLab = 'Competitor';
          d.school.labType = v.labType || null;
          d.school.labSpend = v.labSpend ? Number(v.labSpend) : null;
          stepOpportunity();
        });
      });
  }

  /* 2b / 3. The opportunity.
   *
   * The size is quoted off the CEO's rate card - price x (this school's
   * students / the base count that price buys) - so potential revenue is
   * tracked before any negotiation. It stays editable: the rate card is the
   * list price, not the deal. */
  function stepOpportunity() {
    var school = draftSchool();
    shell(school.name + ' · opportunity',
      '<form id="f">' +
      '<div class="cx-step"><h3>Opportunity type</h3>' +
      UI.choice('offering', V.offering.map(function (o) {
        return { value: o, label: V.offeringLabel[o] || o, sub: V.offeringDetail[o] };
      }), null) + '</div>' +
      '<div id="activity" hidden></div>' +
      UI.field('Opportunity size (₹)',
        '<input class="input" type="number" name="initialPotential" min="0" step="any" inputmode="decimal" required>',
        'Locked once saved, so realisation can be measured against it later.') +
      '<div id="quote" class="field-hint" style="margin:-10px 0 16px"></div>' +
      '<div class="modal-actions"><button type="submit" class="btn btn-primary btn-lg btn-block">Continue</button></div>' +
      '</form>',
      function (host) {
        var box = host.querySelector('#activity');
        var note = host.querySelector('#quote');
        var size = host.querySelector('[name=initialPotential]');
        var picked = { offering: null, activity: null };

        function quote() {
          var q = M.priceFor(picked.offering, picked.activity, school.students);
          if (!q) {
            note.textContent = picked.offering
              ? 'No rate card price for this yet — type the size in.' : '';
            return;
          }
          note.textContent = q.value
            ? 'Rate card: ' + q.note + '. Edit it if this deal is sized differently.'
            : 'Rate card: ' + q.note + '.';
          // Never overwrite a number the rep has typed over the quote.
          if (q.value && (!size.value || size.dataset.auto === '1')) {
            size.value = Math.round(q.value);
            size.dataset.auto = '1';
          }
        }
        size.addEventListener('input', function () { size.dataset.auto = '0'; });

        UI.bindChoices(host, function (name, v) {
          if (name === 'offering') {
            picked.offering = v; picked.activity = null;
            var acts = (M.CATALOGUE.filter(function (c) { return c.key === v; })[0] || {}).activities;
            box.hidden = !acts;
            if (acts) {
              box.innerHTML = '<div class="cx-step"><h3>Which activity?</h3>' +
                UI.choice('variant', acts, null, { tight: true }) + '</div>';
              UI.bindChoices(box, function (_, a) { picked.activity = a; quote(); });
            } else {
              box.innerHTML = '';
            }
          }
          quote();
        });

        host.querySelector('#f').addEventListener('submit', function (e) {
          e.preventDefault();
          var v = UI.values(this);
          if (!v.offering) return UI.toast('Pick an opportunity type.');
          var acts = (M.CATALOGUE.filter(function (c) { return c.key === v.offering; })[0] || {}).activities;
          if (acts && !v.variant) return UI.toast('Pick a bagless activity.');
          d.opportunity = { offering: v.offering, variant: v.variant || null,
                            initialPotential: Number(v.initialPotential) || null };
          stepConnect();
        });
      });
  }

  /* ======================================= EXISTING SCHOOL CONNECT ==== */
  /* 1. Search the school. */
  function stepSearchSchool() {
    var recent = recentSchools();
    shell('Existing school',
      '<input class="input" id="q" type="search" placeholder="Search school name…" autocomplete="off">' +
      '<div class="section-title" id="lbl">Recent</div><div class="pick-list" id="list"></div>',
      function (host) {
        var list = host.querySelector('#list'), q = host.querySelector('#q');
        draw(recent); q.focus();
        q.addEventListener('input', U.debounce(function () {
          var t = q.value.trim().toLowerCase();
          host.querySelector('#lbl').textContent = t ? 'Matches' : 'Recent';
          draw(t ? RB.store.schools().filter(function (s) {
            return (s.name + ' ' + (s.location || '')).toLowerCase().indexOf(t) !== -1;
          }).slice(0, 20) : recent);
        }, 140));

        function draw(items) {
          list.innerHTML = items.length ? items.map(function (s) {
            var n = RB.store.opportunitiesFor(s.id).filter(function (o) { return o.status === 'Open'; }).length;
            return '<button type="button" class="pick" data-id="' + U.esc(s.id) + '">' +
              '<span class="pick-main"><strong>' + U.esc(s.name) + '</strong><small>' +
              U.esc([s.location, s.region, s.board].filter(Boolean).join(' · ')) + '</small></span>' +
              '<span class="pick-right small muted">' + n + ' open</span></button>';
          }).join('') : '<div class="empty">No school matches. Start a New School Connect instead.</div>';
          list.querySelectorAll('[data-id]').forEach(function (b) {
            b.addEventListener('click', function () { d.schoolId = b.getAttribute('data-id'); stepPickOpportunity(); });
          });
        }
      });
  }

  function recentSchools() {
    var me = RB.auth.user(), seen = [], out = [];
    RB.store.connects().slice().sort(function (a, b) {
      return String(b.at || '').localeCompare(String(a.at || ''));
    }).forEach(function (c) {
      if (out.length >= 8 || seen.indexOf(c.schoolId) !== -1) return;
      var s = RB.store.schoolById(c.schoolId);
      if (!s || (me.role === 'sales' && s.ownerKey !== me.ownerKey)) return;
      seen.push(c.schoolId); out.push(s);
    });
    return out;
  }

  /* 2. Existing opportunity, or a new one at the same school. */
  function stepPickOpportunity() {
    var school = RB.store.schoolById(d.schoolId);
    var opps = RB.store.opportunitiesFor(d.schoolId).map(M.view)
      .filter(function (v) { return v.status === 'Open'; });

    shell(school.name,
      '<p class="sec small" style="margin-top:0">Existing opportunity, or a new one at this school?</p>' +
      '<div class="pick-list">' +
      opps.map(function (v) {
        return '<button type="button" class="pick" data-id="' + U.esc(v.opp.id) + '">' +
          '<span class="pick-main"><strong>' + U.esc(v.opp.offering || 'Opportunity') + '</strong><small>' +
          U.esc(v.stage + (v.lastAt ? ' · last ' + U.fmtDate(v.lastAt) : '')) + '</small></span>' +
          '<span class="pick-right"><strong>' + U.esc(U.money(v.current)) + '</strong></span></button>';
      }).join('') +
      '<button type="button" class="pick" data-new="1"><span class="pick-main">' +
      '<strong>+ New (additional opportunity)</strong><small>A different offering at this school</small>' +
      '</span></button></div>',
      function (host) {
        host.querySelectorAll('[data-id]').forEach(function (b) {
          b.addEventListener('click', function () { d.opportunityId = b.getAttribute('data-id'); stepContext(); });
        });
        host.querySelector('[data-new]').addEventListener('click', stepOpportunity);
      });
  }

  /* 3. Current opportunity + context. */
  function stepContext() {
    var v = M.view(RB.store.opportunityById(d.opportunityId));
    shell(v.school.name + ' · context',
      '<form id="f">' +
      '<div class="field-row">' +
        UI.field('Existing program / lab', '<input class="input" name="existingProgram" value="' +
          U.esc(v.school.labType || (v.school.competitor !== 'None' ? v.school.competitor : '')) + '">') +
        UI.field('Current need', '<input class="input" name="currentNeed" value="' + U.esc(v.opp.currentNeed || '') + '">') +
      '</div>' +
      '<div class="field-row">' +
        UI.field('Decision maker', '<input class="input" name="decisionMaker" value="' + U.esc(v.opp.decisionMaker || '') + '">') +
        UI.field('Owner', UI.select('ownerKey', owners(), v.owner || RB.auth.user().ownerKey)) +
      '</div>' +
      '<div class="modal-actions"><button type="submit" class="btn btn-primary btn-lg btn-block">Continue</button></div>' +
      '</form>',
      function (host) {
        host.querySelector('#f').addEventListener('submit', function (e) {
          e.preventDefault();
          var f = UI.values(this);
          RB.store.updateOpportunity(d.opportunityId, {
            currentNeed: f.currentNeed || null,
            decisionMaker: f.decisionMaker || null,
            ownerKey: f.ownerKey || null
          });
          if (f.existingProgram) RB.store.updateSchool(d.schoolId, { labType: f.existingProgram });
          stepConnect();
        });
      });
  }

  /* ================================= the connect itself (both flows) === */
  function stepConnect() {
    var isNew = d.kind === 'New';
    var v = d.opportunityId ? M.view(RB.store.opportunityById(d.opportunityId)) : null;
    var schoolName = v ? v.school.name : draftSchool().name;
    var contacts = d.schoolId ? RB.store.contactsFor(d.schoolId) : [];
    var prev = v && v.last;
    var today = U.iso(U.today());

    shell(schoolName + ' · connect',
      (prev
        ? '<div class="prev-connect"><div class="pc-label">Previous connect</div>' +
          U.esc([prev.at ? U.fmtDate(prev.at.slice(0, 10)) : 'undated', prev.mode,
                 prev.response, prev.nextAction ? 'next: ' + prev.nextAction : null]
                .filter(Boolean).join(' · ')) + '</div>'
        : '') +
      '<form id="f">' +

      '<div class="cx-step"><h3>Type of connect</h3>' +
      UI.choice('mode', V.connectMode, null, { tight: true }) + '</div>' +

      '<div class="field-row">' +
        UI.field('Date of connect', '<input class="input" type="date" name="date" value="' + today + '" max="' + today + '" required>') +
        UI.field(isNew ? 'Contact person / decision maker' : 'Contact person',
          contacts.length
            ? UI.select('contactId', contacts.map(function (c) { return { value: c.id, label: c.name + (c.role ? ' — ' + c.role : '') }; })
                .concat([{ value: '__new', label: '+ New contact' }]), contacts[0].id)
            : '<input class="input" name="contactName" placeholder="Name">') +
      '</div>' +
      '<div id="new-contact" hidden></div>' +

      '<div class="cx-step"><h3>Response / outcome</h3>' +
      UI.choice('response', V.response, null, { tight: true }) + '</div>' +

      '<div id="blocker-step" hidden></div>' +

      '<div class="cx-step"><h3>Next action</h3>' +
      '<p class="field-hint" style="margin:-6px 0 12px">No connect is complete until action, owner and follow-up date are captured.</p>' +
      '<div class="field-row">' +
        UI.field('Action', UI.select('nextAction', V.nextAction, null, { placeholder: 'Select action', required: true })) +
        UI.field('Owner', UI.select('nextActionOwner', owners(), RB.auth.user().ownerKey, { required: true })) +
        UI.field('Follow-up date', '<input class="input" type="date" name="nextDate" value="' + U.addDays(today, 7) + '" required>') +
      '</div></div>' +

      '<div class="cx-step"><h3>Pipeline stage</h3>' +
      UI.choice('stage', V.stage, null, { tight: true }) + '</div>' +

      '<div class="cx-step"><h3>Expected deal size &amp; closure</h3>' +
      '<div class="field-row">' +
        UI.field('Expected deal size (₹)', '<input class="input" type="number" name="expectedValue" min="0" step="any" inputmode="decimal" value="' +
          (v && v.current != null ? v.current : (d.opportunity ? d.opportunity.initialPotential : '')) + '">') +
        UI.field('Expected closure date', '<input class="input" type="date" name="expectedClosure" value="' +
          U.esc(v && v.expectedClosure ? v.expectedClosure : '') + '">') +
        UI.field('Probability (%)', UI.select('probability', V.probability, v && v.probability != null ? String(v.probability) : null, { placeholder: 'Select' })) +
      '</div>' +
      UI.field('Remarks', '<input class="input" name="remarks" placeholder="Optional">') +
      '</div>' +

      '<div id="close-wrap"></div>' +

      '<div class="modal-actions">' +
      '<button type="submit" class="btn btn-primary btn-lg btn-block">' +
      (isNew ? 'Save lead' : 'Save school + opportunity') + '</button></div>' +
      '</form>',
      function (host) {
        var blockerStep = host.querySelector('#blocker-step');

        /* Why the deal was turned down is only worth asking once it has been.
         * On any other outcome the blocker list is not shown at all, so
         * nothing gets a blocker by default. */
        function showBlockers(rejected) {
          blockerStep.hidden = !rejected;
          blockerStep.innerHTML = rejected
            ? '<div class="cx-step"><h3>Why was it rejected?</h3>' +
              UI.choice('blocker', V.blocker.filter(function (b) { return b !== 'None'; }),
                        null, { tight: true }) +
              '<div id="blocker-detail" hidden style="margin-top:12px"></div></div>'
            : '';
          if (rejected) UI.bindChoices(blockerStep, onPick);
        }
        var closeWrap = host.querySelector('#close-wrap');
        var stageGroup = host.querySelector('[data-choice="stage"]');
        var stageHidden = host.querySelector('input[name="stage"]');

        function onPick(name, val) {
          if (name === 'response' || name === 'mode') {
            // Pre-select the stage the response implies; the rep can override.
            var f = UI.values(host.querySelector('#f'));
            if (!d.stageTouched) setStage(M.suggestStage(f.response, f.mode));
            if (name === 'response') showBlockers(val === 'Rejected');
          }
          if (name === 'stage') {
            d.stageTouched = true;
            closeWrap.innerHTML = val === 'Lost' ? lossFields() : '';
          }
          if (name === 'blocker') {
            var detail = host.querySelector('#blocker-detail');
            detail.hidden = false;
            detail.innerHTML = UI.field('Blocker detail (optional)',
              '<input class="input" name="blockerDetail">');
          }
        }
        UI.bindChoices(host, onPick);
        showBlockers(false);

        function setStage(stage) {
          stageGroup.querySelectorAll('button').forEach(function (b) {
            b.setAttribute('aria-pressed', b.getAttribute('data-value') === stage);
          });
          stageHidden.value = stage;
        }

        var contactSel = host.querySelector('select[name="contactId"]');
        if (contactSel) contactSel.addEventListener('change', function () {
          var nc = host.querySelector('#new-contact');
          nc.hidden = this.value !== '__new';
          nc.innerHTML = this.value !== '__new' ? '' :
            '<div class="field-row">' +
            UI.field('Name', '<input class="input" name="contactName">') +
            UI.field('Role', UI.select('contactRole', V.contactRole, null, { placeholder: 'Select' })) +
            UI.field('Phone', '<input class="input" type="tel" name="contactPhone">') + '</div>';
        });

        host.querySelector('#f').addEventListener('submit', function (e) {
          e.preventDefault();
          submit(UI.values(this));
        });
      });
  }

  function lossFields() {
    return '<div class="cx-step"><h3>Marking this lost</h3>' +
      UI.field('Loss reason', UI.select('lossReason', V.lossReason, null, { placeholder: 'Select a reason' })) +
      '</div>';
  }

  function submit(f) {
    if (!f.mode) return UI.toast('Pick the type of connect.');
    if (!f.response) return UI.toast('Record the response.');
    if (!f.stage) return UI.toast('Set the pipeline stage.');
    if (!f.nextAction || !f.nextActionOwner || !f.nextDate) {
      return UI.toast('Next action, owner and follow-up date are all required.');
    }

    // Create the school and opportunity now, so an abandoned form leaves nothing.
    if (d.school && !d.schoolId) d.schoolId = RB.store.addSchool(d.school).id;
    if (d.opportunity && !d.opportunityId) {
      d.opportunityId = RB.store.addOpportunity(Object.assign({
        schoolId: d.schoolId, ownerKey: RB.auth.user().ownerKey
      }, d.opportunity)).id;
    }

    var contactId = f.contactId && f.contactId !== '__new' ? f.contactId : null;
    if (!contactId && f.contactName) {
      contactId = RB.store.addContact({
        schoolId: d.schoolId, name: f.contactName,
        role: f.contactRole || null, phone: f.contactPhone || null
      }).id;
    }

    var closed = M.CLOSED[f.stage];
    RB.store.logConnect({
      schoolId: d.schoolId, opportunityId: d.opportunityId, by: RB.auth.user().id,
      kind: d.kind === 'New' ? 'New' : 'Reconnect',
      mode: f.mode, contactId: contactId, response: f.response,
      blocker: f.blocker || 'None', blockerDetail: f.blockerDetail || null,
      stage: f.stage,
      expectedValue: f.expectedValue ? Number(f.expectedValue) : null,
      probability: f.probability ? Number(f.probability) : null,
      expectedClosure: f.expectedClosure || null,
      remarks: f.remarks || null,
      nextAction: f.nextAction, nextActionOwner: f.nextActionOwner,
      nextActionAt: f.nextDate + 'T11:00:00',
      at: f.date + 'T' + new Date().toTimeString().slice(0, 8),
      close: closed && closed !== 'On Hold'
        ? { status: closed, reason: f.lossReason || null,
            value: f.expectedValue ? Number(f.expectedValue) : null }
        : null
    });

    UI.closeModal();
    UI.toast(closed ? 'Marked ' + closed + '.' : 'Connect saved · follow-up ' + U.fmtDate(f.nextDate),
      { label: 'Log another', run: function () { open(); } });
    RB.app.refresh();
  }

  return { open: open };
})();
