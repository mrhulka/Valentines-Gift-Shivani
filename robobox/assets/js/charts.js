/* Robobox Sales OS - SVG chart primitives.
 *
 * Hand-rolled so the whole app stays dependency-free and drops into the
 * client's existing site as static files. Follows one house style: thin marks,
 * hairline recessive grid, 4px rounded data-ends at the value end only, a 2px
 * surface gap between adjacent fills, a legend whenever there are two or more
 * series, and a hover tooltip on every plotted mark.
 */
window.RB = window.RB || {};

RB.charts = (function () {
  'use strict';

  var U = RB.util;

  var SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
                'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];
  // Ordinal ramp: never lighter than step 250 on light / darker than 600 on dark.
  var ORDINAL = ['var(--seq-250)', 'var(--seq-300)', 'var(--seq-350)', 'var(--seq-400)',
                 'var(--seq-450)', 'var(--seq-500)', 'var(--seq-550)', 'var(--seq-600)'];
  var SEQ = ['var(--seq-100)', 'var(--seq-150)', 'var(--seq-200)', 'var(--seq-250)', 'var(--seq-300)',
             'var(--seq-350)', 'var(--seq-400)', 'var(--seq-450)', 'var(--seq-500)', 'var(--seq-550)'];
  var STATUS = { good: 'var(--good)', warning: 'var(--warning)', serious: 'var(--serious)', critical: 'var(--critical)' };

  function seriesColor(i) { return SERIES[i % SERIES.length]; }

  function ordinalColor(i, n) {
    if (n <= 1) return ORDINAL[0];
    var idx = Math.round(i / (n - 1) * (ORDINAL.length - 1));
    return ORDINAL[idx];
  }

  function seqColor(t) { // t in 0..1
    var idx = Math.max(0, Math.min(SEQ.length - 1, Math.round(t * (SEQ.length - 1))));
    return SEQ[idx];
  }

  function esc(s) { return U.esc(s); }

  function tip(title, rows) {
    var html = '<div class="tt-title">' + esc(title) + '</div>' +
      (rows || []).map(function (r) {
        return '<div class="tt-row"><span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></div>';
      }).join('');
    return esc(html);
  }

  /* Rounded only on the value end (`side`), square where it meets the baseline. */
  function bar(x, y, w, h, r, side) {
    r = Math.max(0, Math.min(r, side === 'top' ? w / 2 : h / 2, side === 'top' ? h : w));
    if (r <= 0.5) return 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
    if (side === 'top') {
      return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) +
             'h' + (w - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'V' + (y + h) + 'Z';
    }
    // right end rounded
    return 'M' + x + ',' + y + 'h' + (w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
           'v' + (h - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r + 'H' + x + 'Z';
  }

  function niceMax(v) {
    if (!v || v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / mag;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  function legend(items) {
    if (!items || items.length < 2) return '';
    return '<div class="legend">' + items.map(function (it) {
      return '<span class="legend-item"><span class="legend-swatch" style="background:' + it.color + '"></span>' +
        esc(it.label) + '</span>';
    }).join('') + '</div>';
  }

  /* ------------------------------------------------------- horizontal bar */
  /* One measure across named categories. Single hue by default (identity is
   * carried by the row label, not by colour). */
  function hbar(opts) {
    var data = opts.data || [];
    if (!data.length) return '<p class="empty">No data.</p>';
    // Ranked by default; pass sort:false where the row order carries meaning
    // (ordered bands, funnel steps) and must not be re-ranked.
    if (opts.sort !== false) data = U.sortBy(data, function (d) { return d.value || 0; }, 'desc');
    var fmt = opts.format || U.count;
    var rowH = opts.rowH || 26;
    var gap = 6;
    var labelW = opts.labelW || 148;
    var valueW = opts.valueW || 76;
    var W = 720;
    var H = data.length * rowH + 8;
    var plotW = W - labelW - valueW - 12;
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.value || 0; })));
    var colorFn = opts.color || function () { return 'var(--series-1)'; };

    var marks = data.map(function (d, i) {
      var y = i * rowH + 4;
      var h = rowH - gap;
      var w = Math.max(max ? (d.value / max) * plotW : 0, d.value > 0 ? 3 : 0);
      var c = colorFn(d, i);
      var t = tip(d.key, (opts.tipRows ? opts.tipRows(d) : [[opts.measureLabel || 'Value', fmt(d.value)]]));
      return '<g class="mark" data-tip="' + t + '"' + (opts.onClick ? ' data-key="' + esc(d.key) + '" style="cursor:pointer"' : '') + '>' +
        '<text class="axis-label" x="' + (labelW - 8) + '" y="' + (y + h / 2 + 4) + '" text-anchor="end">' +
          esc(truncate(d.label || d.key, 24)) + '</text>' +
        '<path d="' + bar(labelW, y, w, h, 4, 'right') + '" fill="' + c + '"></path>' +
        '<text class="value-label" x="' + (labelW + plotW + 10) + '" y="' + (y + h / 2 + 4) + '">' + esc(fmt(d.value)) + '</text>' +
        '<rect class="hit" x="0" y="' + y + '" width="' + W + '" height="' + rowH + '"></rect>' +
      '</g>';
    }).join('');

    return '<svg class="viz" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMinYMin meet" role="img" ' +
      'aria-label="' + esc(opts.title || 'Bar chart') + '">' + marks + '</svg>';
  }

  /* -------------------------------------------------- stacked / grouped bar */
  function stackedBar(opts) {
    var data = opts.data || [];          // [{key, parts:[{label,value}]}]
    var series = opts.series || [];      // [{label, color}]
    if (!data.length) return '<p class="empty">No data.</p>';
    var rowH = 28, gap = 8, labelW = opts.labelW || 128, valueW = 74;
    var W = 720, H = data.length * rowH + 8;
    var plotW = W - labelW - valueW - 12;
    var totals = data.map(function (d) { return U.sum(d.parts, function (p) { return p.value; }); });
    var max = niceMax(Math.max.apply(null, totals));
    var fmt = opts.format || U.count;

    var marks = data.map(function (d, i) {
      var y = i * rowH + 4, h = rowH - gap, x = labelW;
      var total = totals[i];
      var segs = d.parts.map(function (p, j) {
        if (!p.value) return '';
        var w = (p.value / max) * plotW;
        var isLast = j === lastNonZero(d.parts);
        var seg = '<g class="mark" data-tip="' + tip(d.key + ' · ' + p.label,
              [[opts.measureLabel || 'Value', fmt(p.value)], ['Share', U.pct(p.value, total)]]) + '">' +
          '<path d="' + bar(x, y, Math.max(w - 2, 1), h, isLast ? 4 : 0, 'right') + '" fill="' + (series[j] ? series[j].color : seriesColor(j)) + '"></path>' +
        '</g>';
        x += w;
        return seg;
      }).join('');
      return '<g>' +
        '<text class="axis-label" x="' + (labelW - 8) + '" y="' + (y + h / 2 + 4) + '" text-anchor="end">' + esc(truncate(d.key, 20)) + '</text>' +
        segs +
        '<text class="value-label" x="' + (labelW + plotW + 10) + '" y="' + (y + h / 2 + 4) + '">' + esc(fmt(total)) + '</text>' +
      '</g>';
    }).join('');

    return '<svg class="viz" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMinYMin meet" role="img" aria-label="' +
      esc(opts.title || 'Stacked bar chart') + '">' + marks + '</svg>' + legend(series);
  }

  function lastNonZero(parts) {
    for (var i = parts.length - 1; i >= 0; i--) if (parts[i].value) return i;
    return -1;
  }

  /* ---------------------------------------------------------------- funnel */
  /* Ordered stages -> the ordinal ramp, plus the step-to-step conversion. */
  function funnel(opts) {
    var data = opts.data || [];
    if (!data.length) return '<p class="empty">No data.</p>';
    var rowH = 42, labelW = 150, W = 720, H = data.length * rowH + 10;
    var plotW = W - labelW - 130;
    var max = Math.max.apply(null, data.map(function (d) { return d.n; })) || 1;
    var fmt = opts.format || U.count;

    var marks = data.map(function (d, i) {
      var y = i * rowH + 5, h = rowH - 12;
      var w = Math.max((d.n / max) * plotW, d.n ? 3 : 0);
      var prev = i > 0 ? data[i - 1].n : null;
      var conv = prev ? U.pct(d.n, prev) : null;
      var t = tip(d.key, [
        ['Opportunities', U.count(d.n)],
        ['Pipeline value', U.money(d.value)],
        prev ? ['Conversion from ' + data[i - 1].key, conv] : ['Share of pipeline', U.pct(d.n, max)]
      ]);
      return '<g class="mark" data-tip="' + t + '"' + (opts.onClick ? ' data-key="' + esc(d.key) + '" style="cursor:pointer"' : '') + '>' +
        '<text class="axis-label" x="' + (labelW - 10) + '" y="' + (y + h / 2 + 4) + '" text-anchor="end">' + esc(d.key) + '</text>' +
        '<path d="' + bar(labelW, y, w, h, 4, 'right') + '" fill="' + ordinalColor(i, data.length) + '"></path>' +
        '<text class="value-label strong" x="' + (labelW + w + 10) + '" y="' + (y + h / 2 + 4) + '">' + esc(U.count(d.n)) + '</text>' +
        '<text class="value-label" x="' + (W - 8) + '" y="' + (y + h / 2 + 4) + '" text-anchor="end">' + esc(fmt(d.value)) + '</text>' +
        (conv ? '<text class="value-label" x="' + (labelW + w + 10) + '" y="' + (y + h + 9) + '" fill="var(--text-muted)">' + esc(conv) + ' through</text>' : '') +
        '<rect class="hit" x="0" y="' + y + '" width="' + W + '" height="' + rowH + '"></rect>' +
      '</g>';
    }).join('');

    return '<svg class="viz" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMinYMin meet" role="img" aria-label="' +
      esc(opts.title || 'Funnel') + '">' + marks + '</svg>';
  }

  /* ------------------------------------------------------------ line / area */
  function line(opts) {
    var series = opts.series || [];               // [{label,color,points:[{x,y}]}]
    var labels = opts.labels || [];
    if (!series.length || !labels.length) return '<p class="empty">No data.</p>';
    var W = 720, H = opts.height || 240;
    var padL = 46, padR = 14, padT = 12, padB = 30;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var maxRaw = 0;
    series.forEach(function (s) { s.points.forEach(function (p) { if (p.y > maxRaw) maxRaw = p.y; }); });
    var max = niceMax(maxRaw) || 1;
    var n = labels.length;
    var xAt = function (i) { return padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW); };
    var yAt = function (v) { return padT + plotH - (v / max) * plotH; };
    var fmt = opts.format || U.count;

    var grid = '', ticks = 4;
    for (var g = 0; g <= ticks; g++) {
      var v = (max / ticks) * g, y = yAt(v);
      grid += '<line class="gridline" x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '"></line>' +
              '<text class="axis-label" x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(fmt(v)) + '</text>';
    }

    var paths = series.map(function (s, si) {
      var color = s.color || seriesColor(si);
      var d = s.points.map(function (p, i) { return (i ? 'L' : 'M') + xAt(i) + ',' + yAt(p.y); }).join('');
      var area = opts.area && series.length === 1
        ? '<path d="' + d + 'L' + xAt(n - 1) + ',' + yAt(0) + 'L' + xAt(0) + ',' + yAt(0) + 'Z" fill="' + color + '" opacity=".10"></path>' : '';
      var dots = s.points.map(function (p, i) {
        return '<circle class="mark" cx="' + xAt(i) + '" cy="' + yAt(p.y) + '" r="4" fill="' + color +
          '" stroke="var(--surface-1)" stroke-width="2" data-tip="' +
          tip(labels[i], [[s.label, fmt(p.y)]]) + '"></circle>';
      }).join('');
      var end = '<text class="value-label strong" x="' + (xAt(n - 1) + 8) + '" y="' + (yAt(s.points[n - 1].y) + 4) + '">' +
        esc(fmt(s.points[n - 1].y)) + '</text>';
      return area + '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>' + dots + (series.length === 1 ? end : '');
    }).join('');

    var xlabels = labels.map(function (l, i) {
      if (n > 9 && i % 2) return '';
      return '<text class="axis-label" x="' + xAt(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(l) + '</text>';
    }).join('');

    return '<svg class="viz" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMinYMin meet" role="img" aria-label="' +
      esc(opts.title || 'Line chart') + '">' + grid +
      '<line class="baseline" x1="' + padL + '" y1="' + yAt(0) + '" x2="' + (W - padR) + '" y2="' + yAt(0) + '"></line>' +
      paths + xlabels + '</svg>' +
      legend(series.map(function (s, i) { return { label: s.label, color: s.color || seriesColor(i) }; }));
  }

  /* ------------------------------------------------------------ column bar */
  function column(opts) {
    var data = opts.data || [];
    if (!data.length) return '<p class="empty">No data.</p>';
    var W = 720, H = opts.height || 210;
    var padL = 46, padR = 12, padT = 12, padB = 34;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; }))) || 1;
    var step = plotW / data.length;
    var bw = Math.min(step - 8, 46);
    var fmt = opts.format || U.count;
    var colorFn = opts.color || function () { return 'var(--series-1)'; };

    var grid = '';
    for (var g = 0; g <= 4; g++) {
      var v = (max / 4) * g, y = padT + plotH - (v / max) * plotH;
      grid += '<line class="gridline" x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '"></line>' +
              '<text class="axis-label" x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(fmt(v)) + '</text>';
    }

    var marks = data.map(function (d, i) {
      var h = (d.value / max) * plotH;
      var x = padL + i * step + (step - bw) / 2;
      var y = padT + plotH - h;
      return '<g class="mark" data-tip="' + tip(d.key, opts.tipRows ? opts.tipRows(d) : [[opts.measureLabel || 'Value', fmt(d.value)]]) + '"' +
        (opts.onClick ? ' data-key="' + esc(d.key) + '" style="cursor:pointer"' : '') + '>' +
        '<path d="' + bar(x, y, bw, Math.max(h, d.value ? 2 : 0), 4, 'top') + '" fill="' + colorFn(d, i) + '"></path>' +
        '<rect class="hit" x="' + (padL + i * step) + '" y="' + padT + '" width="' + step + '" height="' + plotH + '"></rect>' +
        '<text class="axis-label" x="' + (x + bw / 2) + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(truncate(d.label || d.key, 12)) + '</text>' +
      '</g>';
    }).join('');

    return '<svg class="viz" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMinYMin meet" role="img" aria-label="' +
      esc(opts.title || 'Column chart') + '">' + grid +
      '<line class="baseline" x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '"></line>' +
      marks + '</svg>';
  }

  /* --------------------------------------------------------------- heatmap */
  /* Magnitude across two dimensions: one hue, light -> dark, with a scale legend. */
  function heatmap(opts) {
    var rows = opts.rows || [], cols = opts.cols || [], get = opts.get;
    if (!rows.length || !cols.length) return '<p class="empty">No data.</p>';
    var cellW = opts.cellW || 78, cellH = 34, labelW = opts.labelW || 140, headH = 26;
    // Row labels are right-anchored inside labelW, so cap them to what fits.
    var rowChars = Math.max(8, Math.floor((labelW - 16) / 7));
    var W = labelW + cols.length * cellW, H = headH + rows.length * cellH + 6;
    var max = 0;
    rows.forEach(function (r) { cols.forEach(function (c) { var v = get(r, c) || 0; if (v > max) max = v; }); });
    var fmt = opts.format || U.count;

    var head = cols.map(function (c, j) {
      return '<text class="axis-label" x="' + (labelW + j * cellW + cellW / 2) + '" y="' + (headH - 9) + '" text-anchor="middle">' +
        esc(truncate(c, 11)) + '</text>';
    }).join('');

    var body = rows.map(function (r, i) {
      var y = headH + i * cellH;
      var cells = cols.map(function (c, j) {
        var v = get(r, c) || 0;
        var t = max ? v / max : 0;
        var x = labelW + j * cellW;
        // Ink flips to the surface colour once the fill gets dark enough to need it.
        var ink = t > 0.62 ? 'var(--surface-1)' : 'var(--text-primary)';
        return '<g class="mark" data-tip="' + tip(r + ' · ' + c, [[opts.measureLabel || 'Value', fmt(v)]]) + '"' +
          (opts.onClick ? ' data-key="' + esc(r + '||' + c) + '" style="cursor:pointer"' : '') + '>' +
          '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (cellW - 2) + '" height="' + (cellH - 2) +
            '" rx="4" fill="' + (v ? seqColor(t) : 'var(--surface-sunk)') + '"></rect>' +
          '<text class="value-label" x="' + (x + cellW / 2) + '" y="' + (y + cellH / 2 + 4) + '" text-anchor="middle" fill="' + ink + '">' +
            esc(v ? fmt(v) : '·') + '</text>' +
        '</g>';
      }).join('');
      return '<text class="axis-label" x="' + (labelW - 8) + '" y="' + (y + cellH / 2 + 4) + '" text-anchor="end">' +
        esc(truncate(r, rowChars)) + '<title>' + esc(r) + '</title></text>' + cells;
    }).join('');

    var scale = '<div class="legend"><span class="legend-item">' + esc(opts.measureLabel || 'Value') + ' &nbsp;low</span>' +
      SEQ.map(function (c) { return '<span class="legend-swatch" style="background:' + c + ';width:16px"></span>'; }).join('') +
      '<span class="legend-item">high (' + esc(fmt(max)) + ')</span></div>';

    return '<div style="overflow-x:auto"><svg class="viz" viewBox="0 0 ' + W + ' ' + H +
      '" style="min-width:' + W + 'px;max-width:none" role="img" aria-label="' +
      esc(opts.title || 'Heatmap') + '">' + head + body + '</svg></div>' + scale;
  }

  /* -------------------------------------------------------------- sparkline */
  function sparkline(values, opts) {
    opts = opts || {};
    if (!values || values.length < 2) return '';
    var W = opts.width || 72, H = opts.height || 22;
    var max = Math.max.apply(null, values) || 1;
    var d = values.map(function (v, i) {
      return (i ? 'L' : 'M') + (i / (values.length - 1) * W).toFixed(1) + ',' + (H - (v / max) * (H - 3) - 1.5).toFixed(1);
    }).join('');
    return '<svg class="viz stat-spark" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
      '<path d="' + d + '" fill="none" stroke="' + (opts.color || 'var(--series-1)') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".75"></path></svg>';
  }

  /* --------------------------------------------------------------- helpers */
  function truncate(s, n) {
    s = String(s === null || s === undefined ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* One delegated tooltip layer for every chart on the page. */
  function initTooltip() {
    var tipEl = document.getElementById('tooltip');
    if (!tipEl) return;
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!t) return;
      tipEl.innerHTML = t.getAttribute('data-tip');
      tipEl.hidden = false;
      position(e);
    });
    document.addEventListener('mousemove', function (e) {
      if (!tipEl.hidden) position(e);
    });
    document.addEventListener('mouseout', function (e) {
      var t = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (t) tipEl.hidden = true;
    });
    function position(e) {
      var pad = 14;
      var r = tipEl.getBoundingClientRect();
      var x = e.clientX + pad, y = e.clientY + pad;
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
      tipEl.style.left = Math.max(8, x) + 'px';
      tipEl.style.top = Math.max(8, y) + 'px';
    }
  }

  return {
    SERIES: SERIES, STATUS: STATUS, seriesColor: seriesColor, ordinalColor: ordinalColor, seqColor: seqColor,
    hbar: hbar, stackedBar: stackedBar, funnel: funnel, line: line, column: column,
    heatmap: heatmap, sparkline: sparkline, legend: legend, initTooltip: initTooltip, truncate: truncate
  };
})();
