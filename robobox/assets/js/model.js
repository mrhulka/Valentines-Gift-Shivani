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

    /* Opportunity type, as the Connect flow names them. */
    offering: ['STEM Lab', 'Advanced Lab', 'Bagless', 'Workshop'],

    coreOfferings: ['STEM Lab', 'Advanced Lab', 'Bagless', 'Workshop'],

    /* What each offering includes - shown under the picker so the rep chooses
     * the right one without a price list open. */
    offeringDetail: {
      'STEM Lab':      'STEM lab with teachers · curriculum',
      'Advanced Lab':  'Lab with teachers · kits · curriculum',
      'Bagless':       'Bagless skills, sold per activity',
      'Workshop':      'Paid workshops run for the school'
    },

    baglessActivity: ['Robotics', 'Coding', 'Drone', '3D Printing', 'AI / ML',
                      'Electronics', 'Astronomy', 'Other'],

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
  function invalidate() { cache = null; }

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

    cache[opp.id] = v;
    return v;
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
    board:      { label: 'Board',       get: function (v) { return v.school ? v.school.board : '—'; } },
    stage:      { label: 'Stage',       get: function (v) { return v.stage; } },
    blocker:    { label: 'Blocker',     get: function (v) { return v.blocker || 'None'; } },
    lossReason: { label: 'Loss reason', get: function (v) { return v.opp.lossReason || '—'; } },
    leadSource: { label: 'Lead source', get: function (v) { return v.school && v.school.leadSource || 'Not recorded'; } },
    competitor: { label: 'Competitor',  get: function (v) { return v.school && v.school.competitor || 'None'; } },
    interest:   { label: 'Interest',    get: function (v) { return v.interest || '—'; } },
    existingLab:{ label: 'Existing lab', get: function (v) { return v.school && v.school.existingLab || '—'; } },
    board:      { label: 'School type',  get: function (v) { return v.school && v.school.board || '—'; } }
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
  function dayActivity(dateISO, filter) {
    var vs = filter ? filter(views()) : views();
    var keep = {};
    vs.forEach(function (v) { keep[v.opp.id] = true; });

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
      return {
        user: u, planned: planned, done: done,
        kept: planned.filter(function (c) { return keptIds[c.opportunityId]; }).length,
        newConnects: done.filter(function (c) { return c.kind === 'New'; }).length,
        reconnects: done.filter(function (c) { return c.kind === 'Reconnect'; }).length,
        meetings: done.filter(function (c) { return /Meeting|Visit|Demo/.test(c.mode || ''); }).length,
        quoted: U.sum(done, function (c) { return (c.commercial && c.commercial.quoted) || 0; })
      };
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

  return {
    V: V, STAGES: STAGES, RANK: RANK, CLOSED: CLOSED, suggestStage: suggestStage, DIMENSIONS: DIMENSIONS,
    connectsFor: connectsFor, view: view, views: views, invalidate: invalidate,
    tasks: tasks, calendar: calendar, scorecard: scorecard, RANGES: RANGES,
    funnel: funnel, commercialFunnel: commercialFunnel, groupBy: groupBy, rollup: rollup,
    attention: attention, inRange: inRange, dayActivity: dayActivity, ownerOf: ownerOf
  };
})();
