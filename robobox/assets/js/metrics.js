/* Robobox Sales OS - derived metrics.
 * Pure functions over the school array. No DOM, no state.
 */
window.RB = window.RB || {};

RB.metrics = (function () {
  'use strict';

  var U = RB.util;

  /* ---------------------------------------------------------- vocabulary */

  var STAGES = [
    { key: 'New Lead',            prob: 10,  open: true },
    { key: 'Contacted',           prob: 25,  open: true },
    { key: 'Meeting Fixed',       prob: 40,  open: true },
    { key: 'Meeting Done',        prob: 60,  open: true },
    { key: 'Demo',                prob: 70,  open: true },
    { key: 'Proposal',            prob: 80,  open: true },
    { key: 'Negotiation',         prob: 90,  open: true },
    { key: 'Verbal Confirmation', prob: 95,  open: true },
    { key: 'Won',                 prob: 100, open: false },
    { key: 'Lost',                prob: 0,   open: false },
    { key: 'On Hold',             prob: 0,   open: false }
  ];
  var STAGE_KEYS = STAGES.map(function (s) { return s.key; });
  var FUNNEL_KEYS = STAGE_KEYS.slice(0, 9);           // New Lead .. Won
  var STAGE_INDEX = {};
  var STAGE_PROB = {};
  STAGES.forEach(function (s, i) { STAGE_INDEX[s.key] = i; STAGE_PROB[s.key] = s.prob; });

  var ACTIVITY_TYPES = ['Call', 'Meeting', 'School Visit', 'Demo', 'Workshop', 'Proposal Sent', 'Email', 'WhatsApp', 'Other'];
  var OUTCOMES = ['Positive', 'Neutral', 'Negative', 'No response'];
  var LEAD_SOURCES = ['COLD', 'ELDROCKS', '91 MEDIA', 'BNI', 'REFERRAL', 'INTERNAL', 'EXISTING', 'CHANNEL PARTNER', 'OTHER'];
  var REGIONS = ['CENTRAL', 'WESTERN', 'NAVI', 'KDMC'];
  var BOARDS = ['CBSE', 'ICSE', 'STATE BOARD', 'CAMBRIDGE', 'IB'];

  var PRODUCTS = ['Curriculum', 'Bagless', 'Workshop'];

  var PRODUCT_RULES = [
    ['Bagless',    /BAGLESS|BAGFLESS|BAGLES|POWERPACK/],
    ['Curriculum', /ROBOTIC|CURRICUL|COMPOSITE LAB|\bLAB\b|STEM|TINKER|\bATL\b|AFTER SCHOOL/],
    ['Workshop',   /WORKSHOP|\bWKS\b/]
  ];

  function tagProducts(text) {
    if (!text) return [];
    var u = String(text).toUpperCase();
    return PRODUCT_RULES.filter(function (r) { return r[1].test(u); }).map(function (r) { return r[0]; });
  }

  var REJECT_REASONS = ['Price', 'Chose a competitor', 'No budget this year',
                        'Not a fit', 'No management interest', 'Other'];

  var BLOCKER_LABEL = {
    PRICE: 'Price / paying capacity',
    ACCESS: 'Cannot get a meeting',
    DECISION: 'Slow management decision',
    INCUMBENT: 'Incumbent vendor in place',
    TRUST: 'Trust / proof of value',
    TIMING: 'Academic-calendar timing',
    CAPACITY: 'School size or infrastructure',
    OTHER: 'Other'
  };

  var BLOCKER_RULES = [
    ['PRICE',     /PRIC|PAYING CAP|CHEAP|BUDGET|COST|EXPENSIVE|LOW PAY|FINANC|FEES/],
    ['ACCESS',    /DOES NOT MEET|DOESNT MEET|CANT FIND A MEET|NO MEET|NOT MEET|DIFFICULT TO MEET|HARD TO MEET|NO RESPON|NOT RESPON|UNAVAIL/],
    ['DECISION',  /MGMT|MANAGEMENT|TRUSTEE|DECISION|SLOW|TAKES TIME|APPROVAL|BOARD|DOUBTFUL|COMMITTEE/],
    ['INCUMBENT', /ALREADY (HAVE|HAS|WORKING)|EXISTING VENDOR|TIED UP|CONTRACT|CHOSE /],
    ['TRUST',     /TRUST|RECOUP|CONVINC|CONFIDEN|PROOF|DOUBT/],
    ['TIMING',    /NEXT YEAR|ACADEMIC|SESSION|AFTER EXAM|VACATION|HOLIDAY|POSTPON|DEFER/],
    ['CAPACITY',  /LOW STRENGTH|SMALL SCHOOL|SPACE|INFRA|LAB/]
  ];

  function tagBlockers(text) {
    if (!text) return [];
    var u = String(text).toUpperCase();
    var tags = BLOCKER_RULES.filter(function (r) { return r[1].test(u); }).map(function (r) { return r[0]; });
    return tags.length ? tags : ['OTHER'];
  }

  /* --------------------------------------------------------- row helpers */

  // The confirmed stage if the team set one, otherwise the stage suggested
  // from the sheet's own wording. Never silently promoted to "confirmed".
  function stage(s) { return s.stage || s.suggestedStage || 'New Lead'; }
  function stageConfirmed(s) { return !!s.stage; }
  function stageIdx(s) { return STAGE_INDEX[stage(s)] != null ? STAGE_INDEX[stage(s)] : 0; }
  function isOpen(s) { var k = stage(s); return k !== 'Won' && k !== 'Lost' && k !== 'On Hold'; }
  function isWon(s) { return stage(s) === 'Won'; }
  function isLost(s) { return stage(s) === 'Lost'; }

  function probability(s) {
    if (s.probability != null) return s.probability;
    return STAGE_PROB[stage(s)] != null ? STAGE_PROB[stage(s)] : 0;
  }

  function dealSize(s) { return s.dealSize || 0; }
  function weighted(s) { return dealSize(s) * probability(s) / 100; }

  function tamValue(s, rate) {
    if (!s.students) return 0;
    return s.students * (rate || 1700);
  }

  // A school counts as "approached" once anyone has touched it.
  function isApproached(s) {
    return !!(s.lastContacted || s.activities.length || s.opportunity ||
              (s.contactStatus && /existing/i.test(s.contactStatus)));
  }
  function isQualified(s) { return s.opportunityStatus === 'Opportunity identified'; }

  function daysSinceContact(s) {
    return s.lastContacted ? U.daysSince(s.lastContacted) : null;
  }

  function isStalled(s, limitDays) {
    if (!isOpen(s) || !isApproached(s)) return false;
    var d = daysSinceContact(s);
    return d === null ? true : d > (limitDays || 30);
  }

  /* The three states the sales dashboard reports on, in the team's words.
   * Silent = we reached out and nothing came back for a while. Rejected =
   * someone actually said no; it is never inferred from silence. */
  function isRejected(s) { return stage(s) === 'Lost'; }

  function isSilent(s, limitDays) {
    if (!isApproached(s) || !isOpen(s)) return false;
    var d = daysSinceContact(s);
    return d === null ? true : d > (limitDays || 30);
  }

  function isClosedWon(s) { return stage(s) === 'Won'; }

  function hasProduct(s, product) { return (s.products || []).indexOf(product) !== -1; }

  /* Schools the team added in the app, not the ones that arrived with the
   * workbook — "new schools added this month" would otherwise be all 343. */
  function addedWithin(rows, months) {
    var cut = new Date();
    cut.setMonth(cut.getMonth() - months);
    var cutISO = U.iso(cut);
    return rows.filter(function (s) {
      if (s.origin === 'import') return false;
      var when = s.addedAt || (s.createdAt ? s.createdAt.slice(0, 10) : null);
      return when && when >= cutISO;
    });
  }

  function isOverdue(s) {
    if (!s.nextActionDate || !isOpen(s)) return false;
    return U.daysSince(s.nextActionDate) > 0;
  }

  function isDueToday(s) {
    return !!s.nextActionDate && U.daysSince(s.nextActionDate) === 0;
  }

  function dueWithin(s, days) {
    if (!s.nextActionDate || !isOpen(s)) return false;
    var d = -U.daysSince(s.nextActionDate);
    return d >= 0 && d <= days;
  }

  /* The seven fields the workbook calls critical. Drives the hygiene score. */
  var CRITICAL = [
    { key: 'owners',          label: 'Sales owner',      has: function (s) { return s.owners.length > 0; } },
    { key: 'opportunity',     label: 'Opportunity',      has: function (s) { return !!s.opportunity; } },
    { key: 'stage',           label: 'Stage',            has: function (s) { return !!s.stage; } },
    { key: 'dealSize',        label: 'Deal size',        has: function (s) { return !!s.dealSize; } },
    { key: 'lastContacted',   label: 'Last contacted',   has: function (s) { return !!s.lastContacted; } },
    { key: 'nextAction',      label: 'Next action',      has: function (s) { return !!s.nextAction; } },
    { key: 'expectedClosure', label: 'Expected closure', has: function (s) { return !!s.expectedClosure; } }
  ];

  function missingFields(s) {
    return CRITICAL.filter(function (f) { return !f.has(s); }).map(function (f) { return f.label; });
  }
  function completeness(s) {
    var have = CRITICAL.filter(function (f) { return f.has(s); }).length;
    return have / CRITICAL.length;
  }

  /* Only rows the team is actually working carry a hygiene obligation —
   * scoring 343 untouched TAM rows as "incomplete" would drown the signal. */
  function isWorking(s) { return isQualified(s) || isApproached(s); }

  /* --------------------------------------------------------- aggregates */

  function summarise(rows, opts) {
    opts = opts || {};
    var rate = opts.tamRate || 1700;
    var stall = opts.stalledAfterDays || 30;
    var open = rows.filter(isOpen);
    var won = rows.filter(isWon);
    var lost = rows.filter(isLost);
    var approached = rows.filter(isApproached);
    var qualified = rows.filter(isQualified);
    var working = rows.filter(isWorking);
    var decided = won.length + lost.length;

    return {
      schools: rows.length,
      students: U.sum(rows, function (s) { return s.students || 0; }),
      tamValue: U.sum(rows, function (s) { return tamValue(s, rate); }),
      approached: approached.length,
      coverage: U.pctVal(approached.length, rows.length),
      qualified: qualified.length,
      openCount: open.filter(function (r) { return dealSize(r) > 0; }).length,
      openAll: open.length,
      openValue: U.sum(open, dealSize),
      studentsKnown: rows.filter(function (r) { return r.students; }).length,
      weighted: U.sum(open, weighted),
      wonCount: won.length,
      wonValue: U.sum(won, dealSize),
      lostCount: lost.length,
      lostValue: U.sum(lost, dealSize),
      winRate: decided ? (won.length / decided) * 100 : null,
      avgDeal: open.filter(function (r) { return dealSize(r) > 0; }).length
        ? U.sum(open, dealSize) / open.filter(function (r) { return dealSize(r) > 0; }).length : 0,
      medianDeal: U.median(open.map(dealSize).filter(Boolean)),
      stalled: rows.filter(function (s) { return isStalled(s, stall); }),
      overdue: rows.filter(isOverdue),
      noNextAction: open.filter(function (s) { return isWorking(s) && !s.nextAction; }),
      hygiene: working.length ? U.sum(working, completeness) / working.length * 100 : 100,
      workingCount: working.length,
      stageConfirmedPct: working.length
        ? U.pctVal(working.filter(stageConfirmed).length, working.length) : 0,
      activities: U.sum(rows, function (s) { return s.activities.length; }),

      /* The sales dashboard's own vocabulary. */
      silent: rows.filter(function (s) { return isSilent(s, stall); }),
      rejected: rows.filter(isRejected),
      // Of everything worked, how much actually closed.
      conversion: approached.length ? U.pctVal(won.length, approached.length) : 0,
      potentialRevenue: U.sum(open, dealSize),
      revenueGenerated: U.sum(won, dealSize),
      newLast1: addedWithin(rows, 1).length,
      newLast2: addedWithin(rows, 2).length,
      newLast3: addedWithin(rows, 3).length,
      wonByProduct: PRODUCTS.reduce(function (acc, p) {
        acc[p] = won.filter(function (s) { return hasProduct(s, p); });
        return acc;
      }, {}),
      openByProduct: PRODUCTS.reduce(function (acc, p) {
        acc[p] = open.filter(function (s) { return hasProduct(s, p); });
        return acc;
      }, {})
    };
  }

  /* Funnel as a cumulative "reached at least this stage" curve — the shape a
   * conversion read needs. A Won deal counts in every stage below it. */
  function funnel(rows) {
    var openish = rows.filter(function (s) { return !isLost(s); });
    return FUNNEL_KEYS.map(function (key, i) {
      var at = openish.filter(function (s) { return stageIdx(s) >= i; });
      return {
        key: key,
        n: at.length,
        value: U.sum(at, dealSize),
        rows: at,
        atStage: rows.filter(function (s) { return stage(s) === key; })
      };
    });
  }

  function conversion(rows) {
    var f = funnel(rows);
    return f.slice(1).map(function (step, i) {
      var prev = f[i];
      return {
        from: prev.key,
        to: step.key,
        rate: prev.n ? (step.n / prev.n) * 100 : 0,
        lost: prev.n - step.n,
        lostValue: prev.value - step.value
      };
    });
  }

  function byDimension(rows, dim, opts) {
    var getter = DIMENSIONS[dim];
    if (!getter) return [];
    var out = U.tally(rows, getter.get, dealSize).map(function (g) {
      var s = summarise(g.rows, opts);
      s.key = g.key;
      s.rows = g.rows;
      return s;
    });
    return U.sortBy(out, function (g) { return g.openValue + g.wonValue; }, 'desc');
  }

  var DIMENSIONS = {
    region:     { label: 'Region',      get: function (s) { return s.region; } },
    location:   { label: 'Location',    get: function (s) { return s.location; } },
    board:      { label: 'Board',       get: function (s) { return s.boards.length ? s.boards : ['—']; } },
    owner:      { label: 'Sales owner', get: function (s) { return s.owners.length ? s.owners : ['Unassigned']; } },
    leadSource: { label: 'Lead source', get: function (s) { return s.leadSource || 'Not recorded'; } },
    stage:      { label: 'Stage',       get: function (s) { return stage(s); } },
    blocker:    { label: 'Blocker',     get: function (s) { return s.blockerTags.length ? s.blockerTags.map(blockerLabel) : ['None recorded']; } },
    competitor: { label: 'Competitor',  get: function (s) { return s.competitors.length ? s.competitors : ['None recorded']; } },
    sizeBand:   { label: 'School size', get: function (s) { return sizeBand(s.students); } },
    rateCard:   { label: 'Rate card',   get: function (s) { return rateBand(s.ratePerStudent); } },
    status:     { label: 'Pipeline status', get: function (s) { return s.opportunityStatus || '—'; } },
    product:    { label: 'Product line',  get: function (s) { return (s.products || []).length ? s.products : ['Not recorded']; } }
  };

  function blockerLabel(tag) { return BLOCKER_LABEL[tag] || tag; }

  var SIZE_BANDS = ['< 500', '500–999', '1,000–1,999', '2,000–3,499', '3,500+'];
  function sizeBand(n) {
    if (!n) return 'Unknown';
    if (n < 500) return SIZE_BANDS[0];
    if (n < 1000) return SIZE_BANDS[1];
    if (n < 2000) return SIZE_BANDS[2];
    if (n < 3500) return SIZE_BANDS[3];
    return SIZE_BANDS[4];
  }

  function rateBand(r) {
    if (!r) return 'Not priced';
    if (r <= 600) return '₹400 band (workshop)';
    if (r <= 2200) return '₹1,700 band (lab)';
    return 'Above ₹2,200';
  }

  var AGE_BANDS = ['0–14 days', '15–30 days', '31–60 days', '61–90 days', '90+ days', 'Never contacted'];
  function ageBand(s) {
    var d = daysSinceContact(s);
    if (d === null) return AGE_BANDS[5];
    if (d <= 14) return AGE_BANDS[0];
    if (d <= 30) return AGE_BANDS[1];
    if (d <= 60) return AGE_BANDS[2];
    if (d <= 90) return AGE_BANDS[3];
    return AGE_BANDS[4];
  }

  /* Activity volume per month, split by outcome — the rep-effort series. */
  function activitySeries(acts, months) {
    var keys = lastMonths(months || 6);
    var byMonth = {};
    keys.forEach(function (k) { byMonth[k] = { key: k, total: 0, Positive: 0, Neutral: 0, Negative: 0, 'No response': 0 }; });
    acts.forEach(function (a) {
      var k = U.monthKey(a.date);
      if (byMonth[k]) { byMonth[k].total++; byMonth[k][a.outcome] = (byMonth[k][a.outcome] || 0) + 1; }
    });
    return keys.map(function (k) { return byMonth[k]; });
  }

  function lastMonths(n) {
    var out = [], d = U.today();
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push(x.getFullYear() + '-' + (x.getMonth() + 1 < 10 ? '0' : '') + (x.getMonth() + 1));
    }
    return out;
  }

  /* Contact-recency distribution across the months present in the data —
   * used for the "when was this pipeline last touched" trend. */
  function contactSeries(rows, months) {
    var keys = {};
    rows.forEach(function (s) {
      var k = U.monthKey(s.lastContacted);
      if (k) keys[k] = (keys[k] || 0) + 1;
    });
    var sorted = Object.keys(keys).sort();
    if (months && sorted.length > months) sorted = sorted.slice(-months);
    return sorted.map(function (k) { return { key: k, n: keys[k] }; });
  }

  /* Per-rep scorecard, the CEO's team view. */
  function repScorecards(rows, users, opts) {
    return users.filter(function (u) { return u.ownerKey; }).map(function (u) {
      var mine = rows.filter(function (s) { return s.owners.indexOf(u.ownerKey) !== -1; });
      var s = summarise(mine, opts);
      var acts = [];
      mine.forEach(function (r) { acts = acts.concat(r.activities); });
      var meetings = acts.filter(function (a) { return /Meeting|Visit|Demo|Workshop/.test(a.type); });
      s.user = u;
      s.rows = mine;
      s.activityCount = acts.length;
      s.meetingCount = meetings.length;
      s.lastActivity = acts.length ? acts.map(function (a) { return a.date; }).sort().pop() : null;
      s.stalledPct = mine.length ? U.pctVal(s.stalled.length, mine.length) : 0;
      s.updatesToday = updatesOn(mine, U.iso(U.today()), u.id);
      return s;
    });
  }

  /* Activities logged on a given day — the "did the team update anything
   * today" number the sales dashboard leads with. */
  function updatesOn(rows, dayISO, userId) {
    var day = dayISO || U.iso(U.today());
    var n = 0;
    rows.forEach(function (s) {
      s.activities.forEach(function (a) {
        if (a.loggedAt && a.loggedAt.slice(0, 10) === day && (!userId || a.by === userId)) n++;
      });
    });
    return n;
  }

  function activitiesInMonth(rows, userId) {
    var month = U.iso(U.today()).slice(0, 7);
    var out = [];
    rows.forEach(function (s) {
      s.activities.forEach(function (a) {
        if (a.date.slice(0, 7) === month && (!userId || a.by === userId)) out.push(a);
      });
    });
    return out;
  }

  /* Target vs achievement for the current month. Targets are per person and
   * editable; the seeded ones are placeholders until someone sets real ones. */
  function scorecardVsTarget(rows, user, opts) {
    var t = (user && user.targets) || {};
    var month = U.iso(U.today()).slice(0, 7);
    var acts = activitiesInMonth(rows, user && user.id);
    var wonThisMonth = rows.filter(function (s) {
      return isWon(s) && s.closedAt && s.closedAt.slice(0, 7) === month;
    });
    var approachedThisMonth = rows.filter(function (s) {
      return s.lastContacted && s.lastContacted.slice(0, 7) === month;
    });
    return {
      placeholder: !!t.placeholder,
      rows: [
        { key: 'revenue', label: 'Revenue closed', target: t.revenue || 0,
          actual: U.sum(wonThisMonth, dealSize), money: true },
        { key: 'schoolsApproached', label: 'Schools approached', target: t.schoolsApproached || 0,
          actual: approachedThisMonth.length },
        { key: 'meetings', label: 'Meetings held', target: t.meetings || 0,
          actual: acts.filter(function (a) { return /Meeting|Visit|Demo|Workshop/.test(a.type); }).length },
        { key: 'updates', label: 'Updates logged', target: t.updates || 0, actual: acts.length }
      ]
    };
  }

  /* Ranked, plain-language problems worth acting on this week. */
  function insights(rows, opts) {
    opts = opts || {};
    var out = [];
    var s = summarise(rows, opts);
    var stall = opts.stalledAfterDays || 30;

    var stalledValue = U.sum(s.stalled, dealSize);
    if (s.stalled.length) {
      out.push({
        level: stalledValue > s.openValue * 0.3 ? 'bad' : 'warn',
        icon: '⏳',
        title: s.stalled.length + ' opportunities have gone quiet',
        body: U.money(stalledValue) + ' of pipeline has had no contact for over ' + stall +
              ' days. That is ' + U.pct(stalledValue, s.openValue) + ' of everything open.',
        dim: 'stalled'
      });
    }

    if (s.noNextAction.length) {
      out.push({
        level: 'warn', icon: '❓',
        title: s.noNextAction.length + ' live opportunities have no next step',
        body: 'Nobody has written down what happens next on ' + U.money(U.sum(s.noNextAction, dealSize)) +
              ' of pipeline, so none of it can be forecast.',
        dim: 'noNextAction'
      });
    }

    var unassigned = rows.filter(function (r) { return !r.owners.length; });
    if (unassigned.length) {
      out.push({
        level: 'warn', icon: '👤',
        title: unassigned.length + ' schools have no owner',
        body: U.count(U.sum(unassigned, function (r) { return r.students || 0; })) +
              ' students of addressable market sit with nobody accountable for them.',
        dim: 'unassigned'
      });
    }

    var blockers = byDimension(rows.filter(function (r) { return r.blockerTags.length; }), 'blocker', opts);
    if (blockers.length) {
      var top = blockers[0];
      out.push({
        level: 'bad', icon: '🚧',
        title: top.key + ' is the biggest blocker',
        body: 'It is holding up ' + top.schools + ' schools worth ' + U.money(top.openValue) +
              '. Fixing it is worth more than any single deal.',
        dim: 'blocker'
      });
    }

    if (s.hygiene < 70 && s.workingCount) {
      out.push({
        level: 'warn', icon: '📋',
        title: 'Pipeline records are ' + Math.round(s.hygiene) + '% complete',
        body: 'Across ' + s.workingCount + ' worked accounts, required fields are missing. ' +
              'Forecasts built on this will be wrong.',
        dim: 'hygiene'
      });
    }

    if (s.coverage < 50) {
      out.push({
        level: 'warn', icon: '🗺️',
        title: 'Only ' + Math.round(s.coverage) + '% of the market has been approached',
        body: (rows.length - s.approached) + ' schools have never been contacted, worth ' +
              U.money(s.tamValue - U.sum(rows.filter(isApproached), function (r) { return tamValue(r, opts.tamRate); })) +
              ' of untouched TAM.',
        dim: 'uncontacted'
      });
    }

    var priced = rows.filter(function (r) { return r.ratePerStudent; });
    var lowBand = priced.filter(function (r) { return r.ratePerStudent <= 600; });
    if (priced.length && lowBand.length / priced.length > 0.5) {
      out.push({
        level: 'warn', icon: '🏷️',
        title: Math.round(lowBand.length / priced.length * 100) + '% of priced deals sit in the ₹400 band',
        body: 'Most quoted deals use the low rate card. Moving even a fifth of them to the ₹1,700 lab package is worth ' +
              U.money(U.sum(lowBand, function (r) { return (r.students || 0) * 1300; }) * 0.2) + '.',
        dim: 'rateCard'
      });
    }

    var noSize = rows.filter(function (r) { return !r.students; });
    if (noSize.length > rows.length * 0.15) {
      out.push({
        level: 'warn', icon: '🔢',
        title: noSize.length + ' schools have no student count',
        body: 'TAM is calculated from the ' + (rows.length - noSize.length) + ' schools that have one, so the real market is larger than ' +
              U.money(s.tamValue) + '. Filling these in is a one-off desk job.',
        dim: 'noStudents'
      });
    }

    var dupes = rows.filter(function (r) { return r.duplicateFlag; });
    if (dupes.length) {
      out.push({
        level: 'warn', icon: '⧉',
        title: dupes.length + ' possible duplicate records',
        body: 'Flagged during the import. Merge them before they inflate the forecast.',
        dim: 'duplicates'
      });
    }

    return out;
  }

  return {
    STAGES: STAGES, STAGE_KEYS: STAGE_KEYS, FUNNEL_KEYS: FUNNEL_KEYS, STAGE_PROB: STAGE_PROB,
    STAGE_INDEX: STAGE_INDEX, ACTIVITY_TYPES: ACTIVITY_TYPES, OUTCOMES: OUTCOMES,
    LEAD_SOURCES: LEAD_SOURCES, REGIONS: REGIONS, BOARDS: BOARDS,
    BLOCKER_LABEL: BLOCKER_LABEL, CRITICAL: CRITICAL, DIMENSIONS: DIMENSIONS,
    AGE_BANDS: AGE_BANDS, SIZE_BANDS: SIZE_BANDS,
    PRODUCTS: PRODUCTS, REJECT_REASONS: REJECT_REASONS,
    tagBlockers: tagBlockers, tagProducts: tagProducts, blockerLabel: blockerLabel,
    isRejected: isRejected, isSilent: isSilent, isClosedWon: isClosedWon,
    hasProduct: hasProduct, addedWithin: addedWithin, updatesOn: updatesOn,
    activitiesInMonth: activitiesInMonth, scorecardVsTarget: scorecardVsTarget,
    stage: stage, stageConfirmed: stageConfirmed, stageIdx: stageIdx,
    isOpen: isOpen, isWon: isWon, isLost: isLost, probability: probability,
    dealSize: dealSize, weighted: weighted, tamValue: tamValue,
    isApproached: isApproached, isQualified: isQualified, isWorking: isWorking,
    daysSinceContact: daysSinceContact, isStalled: isStalled, isOverdue: isOverdue,
    isDueToday: isDueToday, dueWithin: dueWithin,
    missingFields: missingFields, completeness: completeness,
    summarise: summarise, funnel: funnel, conversion: conversion, byDimension: byDimension,
    activitySeries: activitySeries, contactSeries: contactSeries, repScorecards: repScorecards,
    insights: insights, sizeBand: sizeBand, rateBand: rateBand, ageBand: ageBand,
    lastMonths: lastMonths
  };
})();
