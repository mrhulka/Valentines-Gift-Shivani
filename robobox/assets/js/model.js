/* Robobox Connect - vocabulary and every derived number.
 *
 * The whole model is: a School has Opportunities; an Opportunity has Connects.
 * Nothing else is stored. Stage, last contact, current value, tasks and the
 * calendar are all computed from Connect history, so they can never drift from
 * what actually happened and a salesperson never maintains them by hand.
 */
window.RB = window.RB || {};

RB.model = (function () {
  'use strict';

  var U = RB.util;

  /* ======================================================== vocabulary ==== */
  /* Every list here is a dropdown in the UI. Free text exists only for school
   * name, contact name, blocker detail and notes. */

  var V = {
    connectKind: ['New Connect', 'Reconnect'],

    board: ['CBSE', 'ICSE', 'SSC', 'CBSE-ICSE', 'Cambridge International', 'IB', 'CISCE', 'NIOS'],

    /* Sales regions, per the Connect flow. */
    region: ['Central', 'KDMC', 'Navi Mumbai', 'Western', 'Pune'],

    /* "Does a STEM lab already exist?" — the branch at the top of a new lead. */
    stemLab: ['Yes', 'No'],
    labType: ['STEM Lab', 'Robotics Lab', 'Composite Lab', 'Tinkering / ATL', 'Computer Lab', 'Other'],
    existingLab: ['None', 'Robobox', 'Competitor', 'Internal School Program', "Don't Know"],

    competitor: ['None', 'Aerobay', 'Eduvate', 'STEMROBO', 'RCOM', 'OLL', 'NEXT', 'iRobo', 'Other'],

    leadSource: ['Cold', 'Eldrocks', '91 Media', 'BNI', 'Referral', 'Existing Relationship',
                 'Internal', 'Event / Exhibition', 'Other'],

    /* Opportunity type. The stored value stays what it has always been so the
     * imported opportunities keep resolving; only the label changed. */
    offering: ['Advanced Lab Pro', 'Advanced Lab', 'STEM Lab', 'Kit Class', 'Bagless', 'Workshop'],

    coreOfferings: ['Advanced Lab Pro', 'Advanced Lab', 'STEM Lab', 'Kit Class', 'Bagless'],

    offeringLabel: { 'Bagless': 'Bagless Skills' },

    /* What each offering includes - shown under the picker so the rep chooses
     * the right one without a price list open. */
    offeringDetail: {
      'Advanced Lab Pro': 'Top slab — lab, teachers, kits, curriculum',
      'Advanced Lab':  'Lab with teachers · kits · curriculum',
      'STEM Lab':      'STEM lab with teachers · curriculum',
      'Kit Class':     'Kits and classes, no lab build',
      'Bagless':       'Bagless skills, sold per activity',
      'Workshop':      'Paid workshops run for the school'
    },

    baglessActivity: ['Hydroponics', 'Planetarium', 'Bank in School', 'Pottery',
                      'Animal Bonding', 'Industry 4.0'],

    workshopType: ['One-day Robotics', 'Multi-day Bootcamp', 'Competition Prep',
                   'Teacher Training', 'Exhibition / Demo Day', 'Other'],

    contactRole: ['Trustee / Owner', 'CEO / Director', 'Principal', 'Vice Principal',
                  'Academic Head', 'School Coordinator', 'STEM / Robotics Coordinator',
                  'Teacher', 'Admin', 'Purchase / Procurement', 'Other'],

    /* One mode list and one response list — the flow uses the same set on both
     * sides, so there is nothing to keep in step. */
    connectMode: ['Call', 'Meeting', 'School Visit', 'Demo', 'WhatsApp', 'Email', 'Other'],

    response: ['Interested', 'Rejected', 'Meeting Fixed', 'To confirm in a few days',
               'Negotiation', 'Proposal Requested', 'Other'],

    interest: ['Hot', 'Warm', 'Cold'],

    blocker: ['None', 'Budget / Pricing', 'Decision Maker Access', 'Existing Internal Program',
              'Student Strength / Capacity', 'Lack of Space / Infra', 'Parental Acceptance',
              'Existing Competition', 'Timing', 'Other'],

    nextAction: ['Follow-up', 'Fix meeting', 'Schedule demo', 'Send proposal',
                 'Management connect', 'Calendar addition', 'Negotiation follow-up',
                 'Close by calendar addition', 'Other', 'No Further Action'],

    /* Set explicitly on every connect, not inferred. */
    stage: ['New Lead', 'Contacted', 'Meeting Fixed', 'Meeting Done', 'Demo-Presentation',
            'Proposal', 'Negotiation', 'Verbal Confirmation', 'Won', 'Lost', 'On Hold'],

    probability: ['10', '25', '40', '50', '60', '75', '90', '100'],

    opportunityKind: ['Existing (Additional / Upgrade)', 'New (Additional Opportunity)'],

    lossReason: ['Budget', 'Price', 'Competitor', 'No Requirement', 'Management Rejected',
                 'Decision Delayed', 'Existing Vendor', 'Timing', 'Unable to Reach',
                 'School Closed / Changed Plans', 'Other'],

    competitor2: ['Aerobay', 'Eduvate', 'STEMROBO', 'RCOM', 'OLL', 'NEXT', 'iRobo', 'Other']
  };

  /* ============================================================= stages ==== */
  /* Derived, never stored. A response only ever moves an opportunity forward;
   * Won and Lost come from the explicit close flow. */

  /* The pipeline stage the flow asks the rep to set on every connect. Open
   * stages in order; Won / Lost / On Hold are the three final outcomes. */
  var STAGES = ['New Lead', 'Contacted', 'Meeting Fixed', 'Meeting Done', 'Demo-Presentation',
                'Proposal', 'Negotiation', 'Verbal Confirmation', 'Won'];
  var RANK = {};
  STAGES.forEach(function (s, i) { RANK[s] = i; });
  var CLOSED = { Won: 'Won', Lost: 'Lost', 'On Hold': 'On Hold' };

  /* Only used to pre-select the stage picker from the response, so the common
   * case is one tap. The rep's choice always wins and is what gets stored. */
  var RESPONSE_STAGE = {
    'Interested': 'Contacted',
    'To confirm in a few days': 'Contacted',
    'Meeting Fixed': 'Meeting Fixed',
    'Proposal Requested': 'Proposal',
    'Negotiation': 'Negotiation',
    'Rejected': 'Lost'
  };

  function suggestStage(response, mode) {
    if (RESPONSE_STAGE[response]) return RESPONSE_STAGE[response];
    if (/^(Meeting|School Visit|Demo)$/.test(mode || '')) return 'Meeting Done';
    return 'Contacted';
  }

  /* ========================================================= derivation ==== */

  function connectsFor(oppId) {
    return RB.store.connects()
      .filter(function (c) { return c.opportunityId === oppId; })
      .sort(function (a, b) { return String(a.at || '').localeCompare(String(b.at || '')); });
  }

  /* Everything the rest of the app reads about an opportunity. Computed once
   * per render pass and cached, because the CEO screens call it per row. */
  var cache = null;
  function invalidate() { cache = null; firstOppCache = null; }

  function view(opp) {
    if (!cache) cache = {};
    if (cache[opp.id]) return cache[opp.id];

    var cs = connectsFor(opp.id);
    var last = cs[cs.length - 1] || null;
    var school = RB.store.schoolById(opp.schoolId);

    // Commercial journey: each value is the most recent one a Connect recorded.
    var quoted = null, negotiated = null;
    cs.forEach(function (c) {
      if (c.commercial && c.commercial.quoted != null) quoted = c.commercial.quoted;
      if (c.commercial && c.commercial.negotiated != null) negotiated = c.commercial.negotiated;
    });

    /* Stage is whatever the most recent connect recorded, falling back to the
     * opportunity's own field for imported rows that have no connect stage. */
    var stageSet = null;
    cs.forEach(function (c) { if (c.stage) stageSet = c.stage; });
    stageSet = stageSet || opp.stage || 'New Lead';
    var stageRank = RANK[stageSet] != null ? RANK[stageSet] : 0;
    if (quoted != null && stageRank < 3) stageRank = 3;
    if (negotiated != null && stageRank < 4) stageRank = 4;

    var status = CLOSED[stageSet] ? (stageSet === 'On Hold' ? 'On Hold' : stageSet)
               : (opp.status && opp.status !== 'Open' ? opp.status : 'Open');
    var stage = stageSet;

    /* Expected deal size, set on any connect, is the live commercial number. */
    var expected = null;
    cs.forEach(function (c) { if (c.expectedValue != null) expected = c.expectedValue; });

    var current = opp.closedValue != null ? opp.closedValue
                : negotiated != null ? negotiated
                : expected != null ? expected
                : quoted != null ? quoted
                : opp.initialPotential;

    var probability = null, closureAt = null, remarks = null;
    cs.forEach(function (c) {
      if (c.probability != null) probability = c.probability;
      if (c.expectedClosure) closureAt = c.expectedClosure;
      if (c.remarks) remarks = c.remarks;
    });

    var nextAction = null, nextAt = null;
    if (status === 'Open' && last && last.nextAction && last.nextAction !== 'No Further Action') {
      nextAction = last.nextAction;
      nextAt = last.nextActionAt;
    }

    var lastAt = last && last.at ? last.at.slice(0, 10) : null;
    var daysSince = lastAt ? U.daysSince(lastAt) : null;

    var v = {
      opp: opp, school: school, connects: cs, last: last,
      stage: stage, stageRank: stageRank, status: status,
      initialPotential: opp.initialPotential,
      quoted: quoted, negotiated: negotiated, closed: opp.closedValue,
      expected: expected, current: current,
      probability: probability != null ? probability : opp.probability,
      expectedClosure: closureAt || opp.expectedClosure,
      remarks: remarks,
      newConnects: cs.filter(function (c) { return c.kind === 'New'; }).length,
      reconnects: cs.filter(function (c) { return c.kind === 'Reconnect'; }).length,
      lastAt: lastAt, daysSinceConnect: daysSince,
      nextAction: nextAction, nextActionAt: nextAt,
      overdue: !!(nextAt && U.daysSince(nextAt.slice(0, 10)) > 0),
      blocker: last && last.blocker && last.blocker !== 'None' ? last.blocker : null,
      interest: last ? last.interest : null,
      owner: opp.ownerKey || (school && school.ownerKey) || null
    };

    /* Stalled, per the four rules the CEO asked for. */
    v.stalledReasons = [];
    if (status === 'Open') {
      if (v.overdue) v.stalledReasons.push('Next action overdue');
      if (!nextAction) v.stalledReasons.push('No next action');
      if (daysSince === null || daysSince > 7) v.stalledReasons.push('No activity for 7+ days');
      if (stageMovedDaysAgo(cs) > 14) v.stalledReasons.push('No stage movement for 14+ days');
    }
    v.stalled = v.stalledReasons.length > 0;

    /* ---- fields the leadership dashboard is built on. All derived. ---- */
    v.pipelineAge = opp.createdAt ? U.daysSince(opp.createdAt) : null;
    var movedAt = stageChangedAt(cs, opp);
    v.stageChangedAt = movedAt;
    v.stageAge = movedAt ? U.daysSince(movedAt) : null;
    v.weighted = status === 'Open' && v.probability != null
      ? (v.current || 0) * (v.probability / 100) : 0;
    v.daysToClose = status === 'Won' && opp.createdAt && opp.closedAt
      ? U.daysBetween(opp.createdAt, opp.closedAt) : null;
    // The value at the point of loss, not whatever the number says today.
    v.lostAtValue = status === 'Lost'
      ? (opp.finalValue != null ? opp.finalValue : v.current) : null;
    v.hasContact = !!(opp.decisionMaker || RB.store.contactsFor(opp.schoolId).length ||
                      cs.some(function (c) { return c.contactId; }));
    v.needEstablished = !!(opp.currentNeed || cs.some(function (c) { return c.response; }));
    /* Record every check, not just up to the first failure - the dashboard
     * reports which conditions are missing, so a short-circuit would lie. */
    v.qualification = {};
    QUAL.forEach(function (q) { v.qualification[q.key] = q.test(v); });
    v.qualified = QUAL.every(function (q) { return v.qualification[q.key]; });
    v.schoolKind = firstOpp(opp.schoolId) === opp.id ? 'New School' : 'Existing School';
    v.studentBand = studentBand(school && school.students);

    cache[opp.id] = v;
    return v;
  }

  /* The school's first opportunity is the one the new-school flow created;
   * anything after it is an existing-school opportunity. */
  var firstOppCache = null;
  function firstOpp(schoolId) {
    if (!firstOppCache) {
      firstOppCache = {};
      U.sortBy(RB.store.opportunities(), function (o) { return o.createdAt || '9999'; }, 'asc')
        .forEach(function (o) { if (!firstOppCache[o.schoolId]) firstOppCache[o.schoolId] = o.id; });
    }
    return firstOppCache[schoolId];
  }

  function stageMovedDaysAgo(cs) {
    var best = -1, movedAt = null;
    cs.forEach(function (c) {
      var r = RANK[c.stage];
      if (r != null && r > best) { best = r; movedAt = c.at; }
    });
    if (!movedAt) return Infinity;
    var d = U.daysSince(movedAt.slice(0, 10));
    return d === null ? Infinity : d;
  }

  function views(opps) { return (opps || RB.store.opportunities()).map(view); }

  /* ============================================================== tasks ==== */
  /* A task is not an entity. It is the open next action on the newest Connect
   * of a live opportunity - so logging the next Connect closes it, and the two
   * can never disagree. */

  function tasks(userId) {
    var me = userId ? RB.store.userById(userId) : null;
    return views()
      .filter(function (v) {
        if (!v.nextAction) return false;
        if (me && v.owner !== me.ownerKey) return false;
        return true;
      })
      .map(function (v) {
        var due = v.nextActionAt || null;
        var days = due ? U.daysSince(due.slice(0, 10)) : null;
        return {
          id: 'TASK-' + v.opp.id,
          title: v.nextAction + ' — ' + (v.school ? v.school.name : ''),
          opportunityId: v.opp.id,
          schoolId: v.opp.schoolId,
          offering: v.opp.offering,
          value: v.current,
          due: due,
          owner: v.owner,
          bucket: days === null ? 'Upcoming' : days > 0 ? 'Overdue' : days === 0 ? 'Today' : 'Upcoming',
          view: v
        };
      })
      .sort(function (a, b) { return String(a.due || '9999').localeCompare(String(b.due || '9999')); });
  }

  /* The calendar is the same list, grouped by day. No second source of truth. */
  function calendar(userId, fromISO, days) {
    var start = fromISO || U.iso(U.today());
    var out = [];
    for (var i = 0; i < (days || 14); i++) {
      var day = U.addDays(start, i);
      out.push({ date: day, items: tasks(userId).filter(function (t) {
        return t.due && t.due.slice(0, 10) === day;
      }) });
    }
    return out;
  }

  /* ========================================================== scorecard ==== */

  /* An undated record (the workbook rows whose contact date was free text)
   * belongs to no bounded period - counting it in "today" and "this month"
   * alike would inflate every one of them. It only shows under All time. */
  function inRange(iso, range) {
    if (!range) return true;
    if (!iso) return range.from === '0000-01-01';
    var d = iso.slice(0, 10);
    return d >= range.from && d <= range.to;
  }

  function RANGES() {
    var t = U.today(), iso = U.iso;
    var dow = (t.getDay() + 6) % 7;                       // Monday = 0
    var weekStart = new Date(t.getTime() - dow * 86400000);
    var q = Math.floor(t.getMonth() / 3) * 3;
    return {
      'Today':        { from: iso(t), to: iso(t) },
      'This week':    { from: iso(weekStart), to: iso(t) },
      'This month':   { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(t) },
      'This quarter': { from: iso(new Date(t.getFullYear(), q, 1)), to: iso(t) },
      'All time':     { from: '0000-01-01', to: '9999-12-31' }
    };
  }

  /* Activity, opportunity, pipeline, conversion, closure, realisation and loss
   * are deliberately separate - Connect count is effort, not performance. */
  function scorecard(opts) {
    opts = opts || {};
    var range = opts.range || RANGES()['All time'];
    var ownerKey = opts.ownerKey || null;

    var vs = (opts.filter ? opts.filter(views()) : views()).filter(function (v) {
      return !ownerKey || v.owner === ownerKey;
    });
    var keep = {};
    vs.forEach(function (v) { keep[v.opp.id] = true; });

    // Connects follow the same filter as the opportunities they belong to, so
    // activity and pipeline on a filtered screen describe the same slice.
    var cs = RB.store.connects().filter(function (c) {
      if (!inRange(c.at, range)) return false;
      if (c.opportunityId && !keep[c.opportunityId]) return false;
      if (!ownerKey) return true;
      var u = RB.store.userById(c.by);
      return u && u.ownerKey === ownerKey;
    });

    var created = vs.filter(function (v) { return inRange(v.opp.createdAt, range); });
    var open = vs.filter(function (v) { return v.status === 'Open'; });
    var won = vs.filter(function (v) { return v.status === 'Won' && inRange(v.opp.closedAt, range); });
    var lost = vs.filter(function (v) { return v.status === 'Lost' && inRange(v.opp.closedAt, range); });

    var reached = function (rank) {
      return vs.filter(function (v) { return v.stageRank >= rank || v.status === 'Won'; });
    };

    var potentialCreated = U.sum(created, function (v) { return v.initialPotential || 0; });
    var closedRevenue = U.sum(won, function (v) { return v.closed || 0; });
    var quotedTotal = U.sum(vs, function (v) { return v.quoted || 0; });

    return {
      range: range,
      // Activity
      newConnects: cs.filter(function (c) { return c.kind === 'New'; }).length,
      reconnects: cs.filter(function (c) { return c.kind === 'Reconnect'; }).length,
      totalConnects: cs.length,
      connects: cs,
      // Opportunity
      opportunitiesCreated: created.length,
      potentialCreated: potentialCreated,
      // Pipeline
      activeCount: open.length,
      activePipeline: U.sum(open, function (v) { return v.current || 0; }),
      quotedValue: quotedTotal,
      negotiatedValue: U.sum(vs, function (v) { return v.negotiated || 0; }),
      // Closure
      wonCount: won.length, closedRevenue: closedRevenue,
      lostCount: lost.length, lostValue: U.sum(lost, function (v) { return v.current || 0; }),
      // Realisation
      realisation: potentialCreated ? (closedRevenue / potentialCreated) * 100 : null,
      leakage: quotedTotal ? quotedTotal - closedRevenue : 0,
      // Conversion
      conversion: {
        'New Connect → Opportunity': pct(created.length, cs.filter(function (c) { return c.kind === 'New'; }).length),
        'Opportunity → Proposal': pct(reached(RANK.Proposal).length, vs.length),
        'Proposal → Negotiation': pct(reached(RANK.Negotiation).length, reached(RANK.Proposal).length),
        'Proposal → Won': pct(vs.filter(function (v) { return v.status === 'Won'; }).length, reached(RANK.Proposal).length)
      },
      views: vs, open: open, won: won, lost: lost, created: created,
      stalled: open.filter(function (v) { return v.stalled; })
    };
  }

  function pct(a, b) { return b ? (a / b) * 100 : null; }

  /* Sales funnel: cumulative "reached at least this stage". */
  function funnel(vs) {
    var live = vs.filter(function (v) { return v.status !== 'Lost' && v.status !== 'On Hold'; });
    return STAGES.map(function (name, i) {
      var at = name === 'Won'
        ? live.filter(function (v) { return v.status === 'Won'; })
        : live.filter(function (v) { return v.stageRank >= i || v.status === 'Won'; });
      return { key: name, n: at.length, value: U.sum(at, function (v) { return v.current || 0; }), rows: at };
    });
  }

  /* Commercial funnel: Potential -> Quoted -> Negotiated -> Closed. */
  function commercialFunnel(vs) {
    return [
      { key: 'Potential', value: U.sum(vs, function (v) { return v.initialPotential || 0; }),
        n: vs.filter(function (v) { return v.initialPotential; }).length,
        rows: vs.filter(function (v) { return v.initialPotential; }) },
      { key: 'Quoted', value: U.sum(vs, function (v) { return v.quoted || 0; }),
        n: vs.filter(function (v) { return v.quoted != null; }).length,
        rows: vs.filter(function (v) { return v.quoted != null; }) },
      { key: 'Negotiated', value: U.sum(vs, function (v) { return v.negotiated || 0; }),
        n: vs.filter(function (v) { return v.negotiated != null; }).length,
        rows: vs.filter(function (v) { return v.negotiated != null; }) },
      { key: 'Closed', value: U.sum(vs, function (v) { return v.closed || 0; }),
        n: vs.filter(function (v) { return v.status === 'Won'; }).length,
        rows: vs.filter(function (v) { return v.status === 'Won'; }) }
    ];
  }

  /* Group views by any dimension, with the numbers every CEO table needs. */
  var DIMENSIONS = {
    owner:      { label: 'Salesperson', get: function (v) { return v.owner || 'Unassigned'; } },
    offering:   { label: 'Offering',    get: function (v) { return v.opp.offering || 'Not set'; } },
    region:     { label: 'Region',      get: function (v) { return v.school ? v.school.region : '—'; } },
    cluster:    { label: 'Area',        get: function (v) { return v.school ? v.school.cluster : '—'; } },
    board:      { label: 'Board',       get: function (v) { return v.school && v.school.board || '—'; } },
    stage:      { label: 'Stage',       get: function (v) { return v.stage; } },
    blocker:    { label: 'Blocker',     get: function (v) { return v.blocker || 'None'; } },
    lossReason: { label: 'Loss reason', get: function (v) { return v.opp.lossReason || '—'; } },
    leadSource: { label: 'Lead source', get: function (v) { return v.school && v.school.leadSource || 'Not recorded'; } },
    competitor: { label: 'Competitor',  get: function (v) { return v.school && v.school.competitor || 'None'; } },
    interest:   { label: 'Interest',    get: function (v) { return v.interest || '—'; } },
    existingLab:{ label: 'Existing lab', get: function (v) { return v.school && v.school.existingLab || '—'; } },
    schoolKind: { label: 'School',      get: function (v) { return v.schoolKind; } },
    studentBand:{ label: 'Student count', get: function (v) { return v.studentBand; } },
    stemLab:    { label: 'STEM lab',    get: function (v) { return schoolTrait(v.school || {}, 'stemLab'); } },
    location:   { label: 'Location',    get: function (v) { return v.school && v.school.location || '—'; } }
  };

  function groupBy(vs, dim) {
    var get = DIMENSIONS[dim].get;
    var map = new Map();
    vs.forEach(function (v) {
      var k = get(v) || '—';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(v);
    });
    var out = [];
    map.forEach(function (rows, key) { out.push(rollup(key, rows)); });
    return U.sortBy(out, function (g) { return g.pipeline + g.closed; }, 'desc');
  }

  function rollup(key, rows) {
    var open = rows.filter(function (v) { return v.status === 'Open'; });
    var won = rows.filter(function (v) { return v.status === 'Won'; });
    var lost = rows.filter(function (v) { return v.status === 'Lost'; });
    var potential = U.sum(rows, function (v) { return v.initialPotential || 0; });
    var closed = U.sum(won, function (v) { return v.closed || 0; });
    var decided = won.length + lost.length;
    return {
      key: key, rows: rows, count: rows.length,
      potential: potential,
      pipeline: U.sum(open, function (v) { return v.current || 0; }),
      quoted: U.sum(rows, function (v) { return v.quoted || 0; }),
      negotiated: U.sum(rows, function (v) { return v.negotiated || 0; }),
      proposals: rows.filter(function (v) { return v.stageRank >= RANK.Proposal || v.status === 'Won'; }).length,
      wonCount: won.length, closed: closed,
      lostCount: lost.length, lostValue: U.sum(lost, function (v) { return v.current || 0; }),
      winRate: decided ? (won.length / decided) * 100 : null,
      avgDeal: won.length ? closed / won.length : (open.length ? U.sum(open, function (v) { return v.current || 0; }) / open.length : 0),
      realisation: potential ? (closed / potential) * 100 : null,
      stalled: open.filter(function (v) { return v.stalled; })
    };
  }

  /* ============================================================== a day ==== */
  /* What a salesperson planned for a date and what they actually logged on it.
   * Both come out of the connect list: a connect whose next action falls on the
   * date is a plan made for it, and one logged on the date is work done. That
   * holds for past days too, which a live task list could not do. */
  /* The connect modes the day board counts, in column order. Matched loosely
   * so imported wording ("Introductory Call") lands in the right column. */
  var MODE_COLUMNS = [
    { key: 'calls',    label: 'Calls',    re: /call/i },
    { key: 'meetings', label: 'Meetings', re: /^meeting/i },
    { key: 'visits',   label: 'Visits',   re: /visit/i },
    { key: 'demos',    label: 'Demos',    re: /demo|present/i },
    { key: 'whatsapp', label: 'WhatsApp', re: /whatsapp/i },
    { key: 'emails',   label: 'Emails',   re: /mail/i }
  ];

  function dayActivity(dateISO, filter) {
    var vs = filter ? filter(views()) : views();
    var keep = {};
    vs.forEach(function (v) { keep[v.opp.id] = true; });
    var day = { from: dateISO, to: dateISO };

    var all = RB.store.connects().filter(function (c) {
      return !c.opportunityId || keep[c.opportunityId];
    });

    return RB.store.users().filter(function (u) { return u.ownerKey; }).map(function (u) {
      var planned = all.filter(function (c) {
        return c.nextActionAt && c.nextActionAt.slice(0, 10) === dateISO &&
               ownerOf(c) === u.ownerKey && c.nextAction !== 'No Further Action';
      });
      var done = all.filter(function (c) {
        return c.at && c.at.slice(0, 10) === dateISO && c.by === u.id;
      });
      // A plan counts as kept once a later connect exists on that opportunity.
      var keptIds = {};
      done.forEach(function (c) { keptIds[c.opportunityId] = true; });
      /* Opportunities the person created that day, and the pipeline that
       * actually advanced a stage on it - activity without movement is not
       * the same thing as productive selling. */
      var created = vs.filter(function (v) {
        return v.owner === u.ownerKey && inRange(v.opp.createdAt, day);
      });
      var moved = vs.filter(function (v) {
        return v.owner === u.ownerKey && advancedIn(v, day);
      });

      var row = {
        user: u, planned: planned, done: done,
        kept: planned.filter(function (c) { return keptIds[c.opportunityId]; }).length,
        newConnects: done.filter(function (c) { return c.kind === 'New'; }).length,
        reconnects: done.filter(function (c) { return c.kind === 'Reconnect'; }).length,
        meetings: done.filter(function (c) { return /Meeting|Visit|Demo/.test(c.mode || ''); }).length,
        quoted: U.sum(done, function (c) { return (c.commercial && c.commercial.quoted) || 0; }),
        created: created, createdCount: created.length,
        moved: moved, movedValue: U.sum(moved, function (v) { return v.current || 0; })
      };
      MODE_COLUMNS.forEach(function (m) {
        row[m.key] = done.filter(function (c) { return m.re.test(c.mode || ''); }).length;
      });
      return row;
    });
  }

  function ownerOf(c) {
    var o = c.opportunityId && RB.store.opportunityById(c.opportunityId);
    if (o && o.ownerKey) return o.ownerKey;
    var s = RB.store.schoolById(c.schoolId);
    return s && s.ownerKey;
  }

  /* =========================================================== attention ==== */
  /* The CEO's action centre. Each item resolves to a list of opportunities. */

  function attention(filter) {
    var vs = filter ? filter(views()) : views();
    var open = vs.filter(function (v) { return v.status === 'Open'; });
    var out = [];

    var stalledHigh = U.sortBy(open.filter(function (v) { return v.stalled; }),
                               function (v) { return v.current || 0; }, 'desc');
    if (stalledHigh.length) {
      out.push({ icon: '◷', tone: 'red',
        title: stalledHigh.length + ' opportunities stalled',
        detail: U.money(U.sum(stalledHigh, function (v) { return v.current || 0; })) + ' not moving',
        rows: stalledHigh });
    }

    var awaiting = open.filter(function (v) { return v.stage === 'Proposal'; });
    if (awaiting.length) {
      out.push({ icon: '✎', tone: 'yellow',
        title: U.money(U.sum(awaiting, function (v) { return v.current || 0; })) + ' in proposals awaiting response',
        detail: awaiting.length + ' opportunities at proposal stage',
        rows: awaiting });
    }

    var overdue = open.filter(function (v) { return v.overdue; });
    if (overdue.length) {
      out.push({ icon: '!', tone: 'red',
        title: overdue.length + ' overdue reconnects',
        detail: 'Next action date has passed',
        rows: U.sortBy(overdue, function (v) { return v.nextActionAt; }, 'asc') });
    }

    var noNext = open.filter(function (v) { return !v.nextAction; });
    if (noNext.length) {
      out.push({ icon: '?', tone: 'grey',
        title: noNext.length + ' opportunities without a next action',
        detail: U.money(U.sum(noNext, function (v) { return v.current || 0; })) + ' unforecastable',
        rows: noNext });
    }

    var week = RANGES()['This week'];
    var lostWeek = vs.filter(function (v) { return v.status === 'Lost' && inRange(v.opp.closedAt, week); });
    if (lostWeek.length) {
      out.push({ icon: '×', tone: 'red',
        title: U.money(U.sum(lostWeek, function (v) { return v.current || 0; })) + ' potential lost this week',
        detail: lostWeek.length + ' opportunities closed lost',
        rows: lostWeek });
    }

    return out;
  }

  /* ====================================================== assumptions ==== */
  /* Nothing on the dashboard is a typed-in number. Where the spec needs an
   * assumption (whitespace value, stale threshold, what counts as a big deal)
   * it is configurable, and blank means "derive it from the data" - every
   * screen that uses one shows which number it used and where it came from. */

  var CFG_KEY = 'robobox.assumptions';
  var cfg = readConfig();

  function readConfig() {
    var d = { avgLabValue: null, staleDays: 14, highValue: null, minWinSample: 10,
             target: null, pricing: {} };
    try { return Object.assign(d, JSON.parse(window.localStorage.getItem(CFG_KEY) || '{}')); }
    catch (e) { return d; }
  }
  function config() { return cfg; }
  function setConfig(patch) {
    Object.assign(cfg, patch);
    try { window.localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function percentile(nums, p) {
    var a = nums.filter(function (n) { return typeof n === 'number' && !isNaN(n); })
                .sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var i = (a.length - 1) * (p / 100), lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
  }

  /* The average value of one STEM lab opportunity. Won deals if there are
   * enough of them, otherwise the median opportunity actually on the books. */
  function avgLabValue() {
    if (cfg.avgLabValue) return { value: cfg.avgLabValue, basis: 'set in Settings', derived: false, n: null };
    var all = views();
    var won = all.filter(function (v) { return v.status === 'Won' && v.closed; });
    var use = won.length >= 5;
    var pool = use ? won.map(function (v) { return v.closed; })
                   : all.map(function (v) { return v.initialPotential; }).filter(Boolean);
    return { value: U.median(pool) || 0, derived: true, n: pool.length,
             basis: use ? 'median won deal' : 'median opportunity size on the books' };
  }

  /* "Large deal" for the attention rules: the top quartile of what is live. */
  function highValue() {
    if (cfg.highValue) return cfg.highValue;
    return percentile(views().map(function (v) { return v.current; }).filter(Boolean), 75) || 0;
  }

  /* ====================================================== price list ==== */
  /* The CEO's rate card. A slab carries a price and the student count that
   * price buys; a school with a different roll is charged pro rata. This is
   * what turns a school's student count into a potential deal value without
   * anyone typing a number.
   *
   * Prices start empty on purpose - inventing a rate card would put made-up
   * revenue on the CEO's dashboard. Until a slab is priced it simply does not
   * auto-calculate, and the Settings screen says so.
   *
   * `stored` is the value already on record for that offering, so renaming a
   * label never orphans the 169 imported opportunities.
   */
  var CATALOGUE = [
    { key: 'Advanced Lab Pro', label: 'Advanced Lab Pro' },
    { key: 'Advanced Lab',     label: 'Advanced Lab' },
    { key: 'STEM Lab',         label: 'Stem Lab' },
    { key: 'Kit Class',        label: 'Kit Class' },
    { key: 'Bagless',          label: 'Bagless Skills', activities: [
        'Hydroponics', 'Planetarium', 'Bank in School', 'Pottery', 'Animal Bonding', 'Industry 4.0'
      ] }
  ];

  /* Every priceable line: the four labs plus one row per bagless activity,
   * plus anything already in the data that the catalogue does not name, so no
   * live opportunity is left unpriceable. */
  function priceLines() {
    var lines = [];
    CATALOGUE.forEach(function (c) {
      if (!c.activities) return lines.push({ id: c.key, offering: c.key, label: c.label });
      c.activities.forEach(function (a) {
        lines.push({ id: c.key + ' · ' + a, offering: c.key, activity: a, label: a, group: c.label });
      });
    });
    var named = {};
    CATALOGUE.forEach(function (c) { named[c.key] = true; });
    U.uniq(RB.store.opportunities().map(function (o) { return o.offering; }))
      .filter(function (o) { return !named[o]; })
      .forEach(function (o) { lines.push({ id: o, offering: o, label: o, legacy: true }); });
    return lines;
  }

  function prices() { return cfg.pricing || (cfg.pricing = {}); }

  function setPrice(id, price, baseStudents) {
    var p = prices();
    if (price == null && baseStudents == null) delete p[id];
    else p[id] = { price: price, base: baseStudents };
    setConfig({ pricing: p });
  }

  /* What one opportunity is worth at list price, pro rata on the roll.
   * Returns null - never a guess - when the slab is unpriced or the school's
   * student count is unknown. */
  function priceFor(offering, activity, students) {
    var row = prices()[activity ? offering + ' · ' + activity : offering];
    if (!row || !row.price) return null;
    var base = row.base;
    if (!base) return { value: row.price, price: row.price, base: null, students: students,
                        note: 'flat rate — no base student count set' };
    if (!students) return { value: null, price: row.price, base: base, students: null,
                            note: 'student count not recorded for this school' };
    return { value: row.price * (students / base), price: row.price, base: base, students: students,
             note: U.money(row.price) + ' per ' + U.count(base) + ' students, pro rata on ' +
                   U.count(students) };
  }

  /* List-price value of a set of opportunities, and how much of it could not
   * be priced. The CEO's "potential revenue before negotiation". */
  function listValue(vs) {
    var priced = [], unpriced = [];
    vs.forEach(function (v) {
      var q = priceFor(v.opp.offering, v.opp.variant, v.school && v.school.students);
      if (q && q.value) priced.push({ v: v, value: q.value, quote: q });
      else unpriced.push(v);
    });
    return { rows: priced, unpriced: unpriced,
             value: U.sum(priced, function (r) { return r.value; }) };
  }

  /* ==================================================== qualification ==== */
  /* All six must hold. Kept as a list so the dashboard can show which one is
   * missing rather than only that the count is low. */
  var QUAL = [
    { key: 'opportunity', label: 'Opportunity identified', test: function (v) { return !!v.opp.offering; } },
    { key: 'contact',     label: 'Decision maker known',   test: function (v) { return v.hasContact; } },
    { key: 'need',        label: 'Need established',       test: function (v) { return v.needEstablished; } },
    { key: 'value',       label: 'Deal size entered',      test: function (v) { return v.current != null; } },
    { key: 'next',        label: 'Next action entered',    test: function (v) { return !!v.nextAction; } },
    { key: 'date',        label: 'Follow-up date entered', test: function (v) { return !!v.nextActionAt; } }
  ];

  /* Where the six checks fail across a set - the CEO's "why is so little of
   * my pipeline forecastable" answer. */
  function qualificationGap(vs) {
    var open = vs.filter(function (v) { return v.status === 'Open'; });
    return QUAL.map(function (q) {
      var miss = open.filter(function (v) { return !q.test(v); });
      return { key: q.key, label: q.label, missing: miss.length, rows: miss,
               value: U.sum(miss, function (v) { return v.current || 0; }),
               share: open.length ? (miss.length / open.length) * 100 : null };
    }).filter(function (r) { return r.missing; });
  }

  /* ======================================================== stage time ==== */
  /* Stage age comes from connect history: the date of the connect that last
   * moved the opportunity forward. Never a stored "last updated" column. */
  function stageChangedAt(cs, opp) {
    var best = -1, at = null;
    cs.forEach(function (c) {
      var r = RANK[c.stage];
      if (r != null && r > best) { best = r; at = c.at; }
    });
    if (at) return at.slice(0, 10);
    return opp.createdAt || (cs[0] && cs[0].at ? cs[0].at.slice(0, 10) : null);
  }

  /* Did this opportunity advance a stage inside the period? Read off the
   * connect history, so a past month reports what was true in that month. */
  function advancedIn(v, range) {
    var best = -1, moved = false;
    v.connects.forEach(function (c) {
      var r = RANK[c.stage];
      if (r == null || r <= best) return;
      best = r;
      if (inRange(c.at, range)) moved = true;
    });
    return moved;
  }

  /* ========================================================== business ==== */
  /* Tab 1. Market tapped -> pipeline -> qualified -> weighted -> won / lost. */
  function business(vs, range, schoolList) {
    var open = vs.filter(function (v) { return v.status === 'Open'; });
    /* Not Lost, and only where a commercial value actually exists - a school
     * in the database is not pipeline until someone has sized the deal. */
    var identified = vs.filter(function (v) { return v.status !== 'Lost' && v.current != null; });
    var qual = open.filter(function (v) { return v.qualified; });
    var active = open.filter(function (v) { return v.status === 'Open'; });
    var won = vs.filter(function (v) { return v.status === 'Won' && inRange(v.opp.closedAt, range); });
    var lost = vs.filter(function (v) { return v.status === 'Lost' && inRange(v.opp.closedAt, range); });

    var potential = U.sum(identified, function (v) { return v.current || 0; });
    var weighted = U.sum(open, function (v) { return v.weighted; });
    var noProb = open.filter(function (v) { return v.probability == null; });

    var today = U.iso(U.today());
    function closureIn(days) {
      var to = U.addDays(today, days);
      var rows = open.filter(function (v) {
        return v.expectedClosure && v.expectedClosure >= today && v.expectedClosure <= to;
      });
      return { days: days, rows: rows, n: rows.length,
               value: U.sum(rows, function (v) { return v.weighted; }),
               gross: U.sum(rows, function (v) { return v.current || 0; }) };
    }

    if (!schoolList) {
      var seen = {};
      vs.forEach(function (v) { if (v.school) seen[v.school.id] = v.school; });
      schoolList = Object.keys(seen).map(function (k) { return seen[k]; });
    }
    /* Three answers, not two. A school nobody has asked about is not a school
     * without a lab, and counting it as one would invent whitespace. */
    var noLab = schoolList.filter(function (s) { return s.stemLab === 'No' || s.existingLab === 'None'; });
    var hasLab = schoolList.filter(function (s) {
      return s.stemLab === 'Yes' || s.existingLab === 'Competitor' ||
             s.existingLab === 'Robobox' || s.existingLab === 'Internal School Program';
    });
    var notAsked = schoolList.filter(function (s) {
      return noLab.indexOf(s) === -1 && hasLab.indexOf(s) === -1;
    });
    var withOpp = {};
    vs.forEach(function (v) { withOpp[v.opp.schoolId] = true; });
    var avg = avgLabValue();

    var ages = open.map(function (v) { return v.pipelineAge; }).filter(function (n) { return n != null; });
    var stale = open.filter(function (v) { return v.stageAge != null && v.stageAge > cfg.staleDays; });

    return {
      potential: potential, potentialCount: identified.length, identified: identified,
      qualified: U.sum(qual, function (v) { return v.current || 0; }),
      qualifiedCount: qual.length, qualifiedRows: qual,
      qualifiedShare: potential ? (U.sum(qual, function (v) { return v.current || 0; }) / potential) * 100 : null,
      qualifiedRate: active.length ? (qual.length / active.length) * 100 : null,
      weighted: weighted, weightedShare: potential ? (weighted / potential) * 100 : null,
      noProbability: noProb,
      wonValue: U.sum(won, function (v) { return v.closed != null ? v.closed : (v.current || 0); }),
      wonCount: won.length, won: won,
      wonSchools: U.uniq(won.map(function (v) { return v.opp.schoolId; })).length,
      lostValue: U.sum(lost, function (v) { return v.lostAtValue || 0; }),
      lostCount: lost.length, lost: lost,
      closure: { 30: closureIn(30), 60: closureIn(60), 90: closureIn(90) },
      open: open, active: active,
      activePipeline: U.sum(open, function (v) { return v.current || 0; }),
      // Market
      schools: schoolList, schoolsTapped: schoolList.length,
      untapped: noLab, hasLab: hasLab, notAsked: notAsked,
      noOpportunity: schoolList.filter(function (s) { return !withOpp[s.id]; }),
      students: U.sum(schoolList, function (s) { return s.students || 0; }),
      whitespace: noLab.length * avg.value, whitespaceBasis: avg,
      // Quality
      medianAge: U.median(ages), avgAge: ages.length ? U.sum(ages, function (n) { return n; }) / ages.length : null,
      stale: stale, staleValue: U.sum(stale, function (v) { return v.current || 0; }),
      staleDays: cfg.staleDays,
      gap: qualificationGap(vs),
      coverage: cfg.target ? (U.sum(qual, function (v) { return v.current || 0; }) / cfg.target) : null
    };
  }

  /* Pipeline movement: the nine open stages plus the two exits. */
  function stageBoard(vs) {
    var live = vs.filter(function (v) { return v.status !== 'Lost' && v.status !== 'On Hold'; });
    var steps = funnel(live);
    var exits = ['Lost', 'On Hold'].map(function (k) {
      var rows = vs.filter(function (v) { return v.status === k; });
      return { key: k, n: rows.length, rows: rows,
               value: U.sum(rows, function (v) { return (k === 'Lost' ? v.lostAtValue : v.current) || 0; }) };
    });
    return { steps: steps, exits: exits };
  }

  /* ============================================================= sales ==== */
  /* Tab 2. The same metric set, grouped by whichever dimension is selected. */
  function performance(vs, dim, range) {
    return groupBy(vs, dim).map(function (g) {
      var open = g.rows.filter(function (v) { return v.status === 'Open'; });
      var qual = open.filter(function (v) { return v.qualified; });
      var won = g.rows.filter(function (v) { return v.status === 'Won'; });
      var moved = g.rows.filter(function (v) { return advancedIn(v, range); });
      var newSchools = U.uniq(g.rows.filter(function (v) {
        return v.schoolKind === 'New School' && inRange(v.opp.createdAt, range);
      }).map(function (v) { return v.opp.schoolId; }));
      return Object.assign(g, {
        leads: newSchools.length,
        created: g.rows.filter(function (v) { return inRange(v.opp.createdAt, range); }).length,
        qualifiedValue: U.sum(qual, function (v) { return v.current || 0; }),
        qualifiedCount: qual.length,
        weighted: U.sum(open, function (v) { return v.weighted; }),
        medianDays: U.median(won.map(function (v) { return v.daysToClose; })),
        movedValue: U.sum(moved, function (v) { return v.current || 0; }),
        movedCount: moved.length, movedRows: moved
      });
    });
  }

  /* ============================================================ blockers ==== */
  /* Ranked by money at risk and how long it has been stuck, not by frequency. */
  function blockerRisk(vs) {
    var open = vs.filter(function (v) { return v.status === 'Open' && v.blocker; });
    var total = U.sum(vs.filter(function (v) { return v.status === 'Open'; }),
                      function (v) { return v.current || 0; });
    var out = [];
    U.groupBy(open, function (v) { return v.blocker; }).forEach(function (rows, key) {
      var atRisk = U.sum(rows, function (v) { return v.weighted || 0; });
      var value = U.sum(rows, function (v) { return v.current || 0; });
      var ages = rows.map(function (v) { return v.stageAge; }).filter(function (n) { return n != null && isFinite(n); });
      out.push({
        key: key, rows: rows, count: rows.length,
        atRisk: atRisk, value: value,
        avgStuck: ages.length ? Math.round(U.sum(ages, function (n) { return n; }) / ages.length) : null,
        share: total ? (value / total) * 100 : null,
        // Age factor per the spec: money stuck for 45 days outranks the same
        // money stuck for 5.
        weightedKnown: rows.filter(function (v) { return v.probability != null; }).length,
        priority: U.sum(rows, function (v) {
          var age = v.pipelineAge != null && isFinite(v.pipelineAge) ? v.pipelineAge : 0;
          return (v.weighted || v.current || 0) * Math.min(age / 30, 3);
        })
      });
    });
    return U.sortBy(out, function (g) { return g.priority; }, 'desc');
  }

  /* =========================================================== attention ==== */
  /* Five rules, each one an opportunity the CEO can act on today. */
  function needsAttention(vs, fit) {
    var open = vs.filter(function (v) { return v.status === 'Open'; });
    var big = highValue();
    var today = U.iso(U.today());
    var seen = {}, out = [];

    function push(v, problem, action) {
      if (seen[v.opp.id]) return;
      seen[v.opp.id] = true;
      out.push({ v: v, problem: problem, action: action });
    }

    U.sortBy(open, function (v) { return v.current || 0; }, 'desc').forEach(function (v) {
      var value = v.current || 0;
      if (value >= big && v.stageAge != null && v.stageAge > cfg.staleDays) {
        push(v, 'High value, stuck ' + v.stageAge + ' days', 'Management connect this week');
      } else if (v.probability >= 70 && v.nextActionAt && v.nextActionAt.slice(0, 10) < today) {
        push(v, 'Likely to close, follow-up overdue', 'Call today — ' + (v.nextAction || 'follow up'));
      } else if (value >= big && !v.nextAction) {
        push(v, 'Large deal with no next action', 'Set the next action and a date');
      } else if (v.expectedClosure && v.expectedClosure < today) {
        push(v, 'Closure date passed, still open', 'Re-forecast or close it out');
      } else if (fit && fit.score(v.school).score >= 70 && value >= big &&
                 (v.daysSinceConnect == null || v.daysSinceConnect > 21)) {
        push(v, 'Strategic school gone quiet', 'Reconnect — strong fit profile');
      }
    });
    return out;
  }

  /* ============================================================== market ==== */
  /* Observed competitive revenue only - what the team actually recorded a
   * school spending. Never an estimate of a competitor's total business. */
  function competitors(vs) {
    var schools = {};
    vs.forEach(function (v) { if (v.school) schools[v.school.id] = v.school; });
    var list = Object.keys(schools).map(function (k) { return schools[k]; });

    var out = [];
    U.groupBy(list.filter(function (s) { return s.competitor && s.competitor !== 'None'; }),
              function (s) { return s.competitor; }).forEach(function (rows, key) {
      out.push(competitorRow(key, rows));
    });

    /* Robobox counts a school as ours when a deal closed there, or the record
     * says the existing lab is ours. */
    var oursIds = {};
    vs.forEach(function (v) { if (v.status === 'Won' && v.school) oursIds[v.school.id] = true; });
    list.forEach(function (s) { if (s.existingLab === 'Robobox') oursIds[s.id] = true; });
    var ours = list.filter(function (s) { return oursIds[s.id]; });
    var row = competitorRow('Robobox', ours);
    row.us = true;
    row.observed = U.sum(vs.filter(function (v) { return v.status === 'Won'; }),
                         function (v) { return v.closed || 0; });
    row.avg = ours.length ? row.observed / ours.length : 0;
    out.unshift(row);
    return out;
  }

  function competitorRow(key, schools) {
    var observed = U.sum(schools, function (s) { return s.labSpend || 0; });
    return { key: key, schools: schools, count: schools.length,
             students: U.sum(schools, function (s) { return s.students || 0; }),
             observed: observed, avg: schools.length ? observed / schools.length : 0,
             known: schools.filter(function (s) { return s.labSpend; }).length };
  }

  /* Lead source, with the conversions the spec names. Not called ROI - no
   * acquisition cost is collected, so no return can honestly be computed. */
  function leadSources(vs, schools) {
    var leadCount = {};
    (schools || []).forEach(function (sc) {
      var k = sc.leadSource || 'Not recorded';
      leadCount[k] = (leadCount[k] || 0) + 1;
    });
    var out = [];
    U.groupBy(vs, function (v) { return (v.school && v.school.leadSource) || 'Not recorded'; })
     .forEach(function (rows, key) {
      var g = rollup(key, rows);
      var leads = leadCount[key] != null ? leadCount[key]
                : U.uniq(rows.map(function (v) { return v.opp.schoolId; })).length;
      var open = rows.filter(function (v) { return v.status === 'Open'; });
      var qual = open.filter(function (v) { return v.qualified; });
      out.push(Object.assign(g, {
        leads: leads,
        qualifiedValue: U.sum(qual, function (v) { return v.current || 0; }),
        toOpportunity: leads ? (rows.length / leads) * 100 : null,
        toWin: leads ? (g.wonCount / leads) * 100 : null,
        revenuePerLead: leads ? g.closed / leads : 0,
        pipelinePerLead: leads ? g.pipeline / leads : 0
      }));
    });
    return U.sortBy(out, function (g) { return g.pipeline + g.closed; }, 'desc');
  }

  /* Boards, with the sales-cycle column the other group tables do not carry. */
  function segments(vs, dim, schools, schoolField) {
    var bySeg = {};
    if (schools && schoolField) {
      schools.forEach(function (sc) {
        var k = sc[schoolField] || '—';
        if (!bySeg[k]) bySeg[k] = [];
        bySeg[k].push(sc);
      });
    }
    return groupBy(vs, dim).map(function (g) {
      var won = g.rows.filter(function (v) { return v.status === 'Won'; });
      var segSchools = bySeg[g.key] ||
        U.uniq(g.rows.map(function (v) { return v.school; })).filter(Boolean);
      return Object.assign(g, {
        schools: segSchools.length,
        students: U.sum(segSchools, function (s) { return s.students || 0; }),
        medianDays: U.median(won.map(function (v) { return v.daysToClose; })),
        avgWon: won.length ? U.sum(won, function (v) { return v.closed || 0; }) / won.length : null
      });
    });
  }

  /* ================================================================= win ==== */
  function salesSpeed(vs) {
    var days = vs.filter(function (v) { return v.status === 'Won'; })
                 .map(function (v) { return v.daysToClose; })
                 .filter(function (n) { return n != null; });
    return { n: days.length, median: U.median(days), fastest: percentile(days, 10),
             slowest: percentile(days, 90) };
  }

  /* The profile of a Robobox win. Refuses to answer on a small sample - a
   * "winning profile" from three deals is a story, not a finding. */
  var PROFILE_DIMS = ['board', 'region', 'offering', 'leadSource', 'stemLab', 'studentBand', 'owner', 'competitor'];

  function winningProfile(vs) {
    var won = vs.filter(function (v) { return v.status === 'Won'; });
    var need = cfg.minWinSample;
    if (won.length < need) {
      return { enough: false, have: won.length, need: need };
    }
    var traits = PROFILE_DIMS.map(function (dim) {
      var best = U.sortBy(groupBy(won, dim), function (g) { return g.count; }, 'desc')[0];
      if (!best) return null;
      return { dim: dim, label: DIMENSIONS[dim].label, value: best.key, n: best.count,
               share: (best.count / won.length) * 100 };
    }).filter(Boolean);
    var deals = won.map(function (v) { return v.closed; }).filter(Boolean);
    return {
      enough: true, n: won.length, traits: traits, rows: won,
      dealLow: percentile(deals, 25), dealHigh: percentile(deals, 75),
      medianDays: U.median(won.map(function (v) { return v.daysToClose; }))
    };
  }

  /* ------------------------------------------------------- the fit score ---
   * Rules-based today, data-driven the moment there are closed deals: each
   * factor scores a segment against the best-performing segment on the same
   * factor. The basis is reported so nobody mistakes one for the other. */
  var FIT = [
    { key: 'studentBand', w: 20, label: 'Student count' },
    { key: 'board',       w: 15, label: 'Board' },
    { key: 'offering',    w: 15, label: 'Opportunity type' },
    { key: 'stemLab',     w: 15, label: 'STEM lab status' },
    { key: 'region',      w: 10, label: 'Region' },
    { key: 'leadSource',  w: 5,  label: 'Lead source' },
    { key: 'contact',     w: 10, label: 'Decision maker access' },
    { key: 'competition', w: 10, label: 'Competitive intensity' }
  ];

  function fitModel(vs) {
    var decided = vs.filter(function (v) { return v.status === 'Won' || v.status === 'Lost'; });
    var useWinRate = decided.length >= cfg.minWinSample;
    var tables = {};

    FIT.forEach(function (f) {
      if (f.key === 'contact' || f.key === 'competition') return;   // rules, not history
      var table = {}, best = 0;
      groupBy(vs, f.key).forEach(function (g) {
        var d = g.wonCount + g.lostCount;
        var score = useWinRate
          ? (d >= 3 ? g.wonCount / d : null)
          // No closed deals yet: rank on the pipeline the segment carries per
          // school, which is real recorded data rather than a guess.
          : (g.count >= 3 ? g.pipeline / g.count : null);
        if (score != null) { table[g.key] = score; if (score > best) best = score; }
      });
      tables[f.key] = { table: table, best: best };
    });

    function score(school) {
      if (!school) return { score: 0, reasons: [], parts: [] };
      var total = 0, parts = [];
      FIT.forEach(function (f) {
        var t = 0, note = null, seg = null;
        if (f.key === 'contact') {
          var cs = RB.store.contactsFor(school.id);
          var senior = cs.filter(function (c) { return /Trustee|CEO|Director|Principal|Owner/i.test(c.role || ''); });
          t = senior.length ? 1 : cs.length ? 0.5 : 0;
          seg = senior.length ? 'Senior contact on file' : cs.length ? 'Contact on file' : 'No contact yet';
        } else if (f.key === 'competition') {
          t = !school.competitor || school.competitor === 'None' ? 1
            : school.competitor === 'Other' ? 0.6 : 0.35;
          seg = !school.competitor || school.competitor === 'None' ? 'No competitor on site' : school.competitor + ' incumbent';
        } else {
          seg = schoolTrait(school, f.key);
          var tb = tables[f.key];
          t = tb && tb.best && tb.table[seg] != null ? tb.table[seg] / tb.best : 0.5;
          if (!tb || tb.table[seg] == null) note = 'no history';
        }
        var got = t * f.w;
        total += got;
        parts.push({ label: f.label, weight: f.w, got: got, segment: seg, note: note });
      });
      var top = U.sortBy(parts, function (p) { return p.got / p.weight; }, 'desc')
                 .filter(function (p) { return p.got / p.weight >= 0.7; }).slice(0, 3);
      return {
        score: Math.round(total), parts: parts,
        reasons: top.map(function (p) { return p.segment; }),
        why: top.length
          ? 'Matches Robobox’s strongest segment on ' +
            top.map(function (p) { return p.label.toLowerCase() + ' (' + p.segment + ')'; }).join(', ')
          : 'No strong match with what Robobox has sold so far'
      };
    }

    return { score: score, basis: useWinRate ? 'win rate' : 'pipeline per school',
             useWinRate: useWinRate, decided: decided.length, need: cfg.minWinSample };
  }

  /* A school's value on a fit factor. */
  function schoolTrait(school, key) {
    if (key === 'studentBand') return studentBand(school.students);
    if (key === 'stemLab') return school.stemLab || (school.existingLab === 'None' ? 'No' : school.existingLab === "Don't Know" ? 'Not known' : 'Yes');
    if (key === 'offering') {
      var os = RB.store.opportunitiesFor(school.id);
      return (os[0] && os[0].offering) || 'Not set';
    }
    return school[key] || 'Not recorded';
  }

  function studentBand(n) {
    if (!n) return 'Not recorded';
    if (n < 500) return 'Under 500';
    if (n < 1500) return '500–1,500';
    if (n < 3000) return '1,500–3,000';
    return '3,000+';
  }

  /* Schools that look like the ones Robobox wins, ranked. Excludes anything
   * already won - a lookalike list is for where to sell next. */
  function lookalikes(vs, fit, schools) {
    var byId = {}, wonAt = {};
    (schools || []).forEach(function (sc) { byId[sc.id] = sc; });
    vs.forEach(function (v) {
      if (v.school) byId[v.school.id] = v.school;
      if (v.status === 'Won') wonAt[v.opp.schoolId] = true;
    });
    var avg = avgLabValue().value;
    var best = {};
    vs.forEach(function (v) {
      if (v.status === 'Lost' || !v.school) return;
      var cur = best[v.school.id];
      if (!cur || (v.current || 0) > cur) best[v.school.id] = v.current || 0;
    });
    return U.sortBy(Object.keys(byId).filter(function (id) { return !wonAt[id]; })
      .map(function (id) {
        var s = byId[id], f = fit.score(s);
        return { school: s, fit: f.score, why: f.why, parts: f.parts,
                 value: best[id] || avg,
                 action: f.score >= 75 ? 'Prioritise' : f.score >= 55 ? 'Work it' : 'Lower priority' };
      }), function (r) { return r.fit * 1000 + (r.value || 0) / 1e6; }, 'desc');
  }

  return {
    V: V, STAGES: STAGES, RANK: RANK, CLOSED: CLOSED, suggestStage: suggestStage, DIMENSIONS: DIMENSIONS,
    connectsFor: connectsFor, view: view, views: views, invalidate: invalidate,
    tasks: tasks, calendar: calendar, scorecard: scorecard, RANGES: RANGES,
    funnel: funnel, commercialFunnel: commercialFunnel, groupBy: groupBy, rollup: rollup,
    attention: attention, inRange: inRange, dayActivity: dayActivity, ownerOf: ownerOf,
    QUAL: QUAL, FIT: FIT, config: config, setConfig: setConfig, percentile: percentile,
    avgLabValue: avgLabValue, highValue: highValue, qualificationGap: qualificationGap,
    CATALOGUE: CATALOGUE, priceLines: priceLines, prices: prices, setPrice: setPrice,
    priceFor: priceFor, listValue: listValue,
    business: business, stageBoard: stageBoard, performance: performance, advancedIn: advancedIn,
    blockerRisk: blockerRisk, needsAttention: needsAttention, competitors: competitors,
    leadSources: leadSources, segments: segments, salesSpeed: salesSpeed,
    winningProfile: winningProfile, fitModel: fitModel, lookalikes: lookalikes,
    studentBand: studentBand, schoolTrait: schoolTrait, MODE_COLUMNS: MODE_COLUMNS
  };
})();
