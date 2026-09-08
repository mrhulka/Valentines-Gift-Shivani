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

    board: ['CBSE', 'ICSE', 'SSC', 'IB', 'IGCSE', 'Other'],

    region: ['Mumbai', 'Pune'],

    existingLab: ['None', 'Robobox', 'Competitor', 'Internal School Program', "Don't Know"],

    competitor: ['None', 'Aerobay', 'Eduvate', 'STEMROBO', 'RCOM', 'OLL', 'NEXT', 'iRobo', 'Other'],

    leadSource: ['Cold', 'Eldrocks', '91 Media', 'BNI', 'Referral', 'Existing Relationship',
                 'Internal', 'Event / Exhibition', 'Other'],

    offering: ['Advanced Lab Pro', 'Advanced Lab', 'STEM Lab', 'Kit Class',
               'Bagless Skills', 'Robotics Workshop', 'AMC / Recurring', 'Other'],

    /* The six that get their own performance row on the CEO dashboard. */
    coreOfferings: ['Advanced Lab Pro', 'Advanced Lab', 'STEM Lab', 'Kit Class',
                    'Bagless Skills', 'Robotics Workshop'],

    /* What each offering includes - shown under the picker so the rep chooses
     * the right one without a price list open. */
    offeringDetail: {
      'Advanced Lab Pro':  'Lab with teachers · kits · curriculum',
      'Advanced Lab':      'Lab with teachers · curriculum',
      'STEM Lab':          'STEM lab with teachers · curriculum',
      'Kit Class':         'Kits + teachers',
      'Bagless Skills':    'Individual activities, sold per activity',
      'Robotics Workshop': 'Paid workshops run for the school',
      'AMC / Recurring':   'Annual maintenance and renewals',
      'Other':             ''
    },

    baglessActivity: ['Robotics', 'Coding', 'Drone', '3D Printing', 'AI / ML',
                      'Electronics', 'Astronomy', 'Other'],

    workshopType: ['One-day Robotics', 'Multi-day Bootcamp', 'Competition Prep',
                   'Teacher Training', 'Exhibition / Demo Day', 'Other'],

    contactRole: ['Trustee / Owner', 'CEO / Director', 'Principal', 'Vice Principal',
                  'Academic Head', 'School Coordinator', 'STEM / Robotics Coordinator',
                  'Teacher', 'Admin', 'Purchase / Procurement', 'Other'],

    connectModeNew: ['Cold Call', 'Introductory Call', 'Meeting', 'School Visit', 'Demo',
                     'WhatsApp', 'Email', 'Event / Exhibition', 'Referral Introduction', 'Other'],

    connectModeRe: ['Call', 'Meeting', 'School Visit', 'Demo', 'WhatsApp', 'Email', 'Other'],

    responseNew: ['Interested', 'Very Interested', 'Neutral', 'Not Interested',
                  'Asked for Information', 'Asked for Proposal', 'Asked to Reconnect',
                  'Meeting Requested', 'Meeting Fixed', 'Decision Maker Not Available',
                  'No Response', 'Wrong Contact', 'Existing Vendor', 'Other'],

    responseRe: ['Interested', 'Progressing', 'Proposal Requested', 'Negotiation',
                 'Meeting Fixed', 'Decision Pending', 'Asked to Reconnect',
                 'Not Interested', 'Lost', 'Other'],

    interest: ['Hot', 'Warm', 'Cold'],

    blocker: ['None', 'Budget / Pricing', 'Decision Maker Access', 'Management Approval',
              'Existing Competitor', 'Existing Internal Program', 'No Immediate Requirement',
              'Timing', 'Student Strength / School Capacity', 'Parent Acceptance',
              'Trust / Credibility', 'Curriculum Fit', 'Procurement', 'Other'],

    changed: ['No Change', 'Stage Progressed', 'Commercial Changed', 'Decision Maker Changed',
              'Requirement Changed', 'Timeline Changed', 'Blocker Changed', 'Other'],

    nextAction: ['Call', 'Reconnect', 'Meeting', 'School Visit', 'Demo', 'Send Proposal',
                 'Send Information', 'Commercial Discussion', 'Management Discussion',
                 'Decision Follow-up', 'Other', 'No Further Action'],

    lossReason: ['Budget', 'Price', 'Competitor', 'No Requirement', 'Management Rejected',
                 'Decision Delayed', 'Existing Vendor', 'Timing', 'Unable to Reach',
                 'School Closed / Changed Plans', 'Other']
  };

  /* ============================================================= stages ==== */
  /* Derived, never stored. A response only ever moves an opportunity forward;
   * Won and Lost come from the explicit close flow. */

  var STAGES = ['New Connect', 'Qualified', 'Meeting', 'Proposal', 'Negotiation', 'Won'];
  var RANK = {};
  STAGES.forEach(function (s, i) { RANK[s] = i; });

  var MET_MODES = /^(Meeting|School Visit|Demo)$/;

  var RESPONSE_STAGE = {
    'Interested': 1, 'Very Interested': 1, 'Neutral': 1, 'Asked for Information': 1,
    'Asked to Reconnect': 1, 'Progressing': 1, 'Decision Pending': 1,
    'Meeting Requested': 2, 'Meeting Fixed': 2,
    'Asked for Proposal': 3, 'Proposal Requested': 3,
    'Negotiation': 4
    // Not Interested / No Response / Wrong Contact / Existing Vendor / Decision
    // Maker Not Available never advance a stage - they are the reason it stalls.
  };

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

    var stageRank = 0;
    cs.forEach(function (c) {
      var r = RESPONSE_STAGE[c.response];
      if (r != null && r > stageRank) stageRank = r;
      // Meeting in person is a fact about how the connect happened, not about
      // how it went - a lukewarm meeting is still a meeting.
      if (MET_MODES.test(c.mode || '') && stageRank < 2) stageRank = 2;
    });
    if (quoted != null && stageRank < 3) stageRank = 3;
    if (negotiated != null && stageRank < 4) stageRank = 4;

    var status = opp.status || 'Open';
    var stage = status === 'Won' ? 'Won' : status === 'Lost' ? 'Lost' : STAGES[stageRank];

    var current = opp.closedValue != null ? opp.closedValue
                : negotiated != null ? negotiated
                : quoted != null ? quoted
                : opp.initialPotential;

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
      current: current,
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
      var r = RESPONSE_STAGE[c.response];
      if (MET_MODES.test(c.mode || '') && (r == null || r < 2)) r = 2;
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
        'Opportunity → Proposal': pct(reached(3).length, vs.length),
        'Proposal → Negotiation': pct(reached(4).length, reached(3).length),
        'Proposal → Won': pct(vs.filter(function (v) { return v.status === 'Won'; }).length, reached(3).length)
      },
      views: vs, open: open, won: won, lost: lost, created: created,
      stalled: open.filter(function (v) { return v.stalled; })
    };
  }

  function pct(a, b) { return b ? (a / b) * 100 : null; }

  /* Sales funnel: cumulative "reached at least this stage". */
  function funnel(vs) {
    var live = vs.filter(function (v) { return v.status !== 'Lost'; });
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
      proposals: rows.filter(function (v) { return v.stageRank >= 3 || v.status === 'Won'; }).length,
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

    var awaiting = open.filter(function (v) { return v.stageRank === 3; });
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
    V: V, STAGES: STAGES, RANK: RANK, RESPONSE_STAGE: RESPONSE_STAGE, DIMENSIONS: DIMENSIONS,
    connectsFor: connectsFor, view: view, views: views, invalidate: invalidate,
    tasks: tasks, calendar: calendar, scorecard: scorecard, RANGES: RANGES,
    funnel: funnel, commercialFunnel: commercialFunnel, groupBy: groupBy, rollup: rollup,
    attention: attention, inRange: inRange, dayActivity: dayActivity, ownerOf: ownerOf
  };
})();
