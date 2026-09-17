/* TrustBridge — charts.
   Deliberately single-series everywhere: identity comes from the axis label,
   never from hue, so no categorical palette is in play. The one series colour
   (--brand) was validated against both surfaces with the palette validator.

   Charts are drawn at the container's real pixel width at mount time (and on
   resize) rather than scaled from a fixed viewBox — a scaled viewBox shrinks
   axis text below legibility on narrow screens.

   Marks: thin, 4px-rounded free data end anchored to the baseline, recessive
   gridlines, selective direct labels, hover + keyboard tooltip, table view. */
window.TB = window.TB || {};

TB.charts = (function () {
  'use strict';
  var U = TB.utils;
  var registry = {};

  /* ---------- geometry ---------- */

  /** Column: only the top (free data end) is rounded; base sits on the baseline. */
  function pathTop(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    return 'M' + x + ',' + (y + h) +
      'L' + x + ',' + (y + r) +
      'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'L' + (x + w - r) + ',' + y +
      'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      'L' + (x + w) + ',' + (y + h) + 'Z';
  }

  /** Horizontal bar: only the right (free data end) is rounded. */
  function pathRight(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w, h / 2));
    return 'M' + x + ',' + y +
      'L' + (x + w - r) + ',' + y +
      'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      'L' + (x + w) + ',' + (y + h - r) +
      'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w - r) + ',' + (y + h) +
      'L' + x + ',' + (y + h) + 'Z';
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / mag;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  function formatter(opts) {
    return {
      tick: opts.money ? function (v) { return U.moneyCompact(v, opts.currency); }
                       : function (v) { return String(Math.round(v)); },
      full: opts.money ? function (v) { return U.money(v, opts.currency); }
                       : function (v) { return String(Math.round(v)); }
    };
  }

  /* ---------- table view (always present) ---------- */

  function tableView(rows, opts, fmtFull) {
    var head = '<tr><th>' + U.esc(opts.keyHeader || 'Category') + '</th>' +
      '<th class="n">' + U.esc(opts.valueHeader || 'Value') + '</th>' +
      (opts.metaHeader ? '<th class="n">' + U.esc(opts.metaHeader) + '</th>' : '') + '</tr>';
    var body = rows.map(function (r) {
      return '<tr><td>' + U.esc(r.label) + '</td>' +
        '<td class="n">' + U.esc(fmtFull(r.value)) + '</td>' +
        (opts.metaHeader ? '<td class="n">' + U.esc(r.meta === undefined ? '—' : r.meta) + '</td>' : '') + '</tr>';
    }).join('');
    return '<details class="viz-table-details">' +
      '<summary>View as table</summary>' +
      '<table class="viz-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
      '</details>';
  }

  /* ---------- public builders ---------- */

  function columns(rows, opts) { return host('columns', rows, opts || {}); }
  function bars(rows, opts) { return host('bars', rows, opts || {}); }

  function host(kind, rows, opts) {
    var id = U.rid('viz');
    registry[id] = { kind: kind, rows: rows, opts: opts };
    var f = formatter(opts);
    return '<div class="viz" data-viz-id="' + id + '">' +
        '<div class="viz-plot" role="group" aria-label="' + U.attr(opts.aria || 'Chart') + '"></div>' +
        '<div class="viz-tip" aria-hidden="true"></div>' +
      '</div>' +
      tableView(rows, opts, f.full);
  }

  /* ---------- renderers (pixel-accurate at the measured width) ---------- */

  function svgColumns(rows, opts, W) {
    var f = formatter(opts);
    var H = Math.round(U.clamp(W * 0.42, 180, 260));
    var pad = { t: 22, r: 10, b: 30, l: W < 420 ? 40 : 54 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([0])));

    var band = iw / Math.max(1, rows.length);
    var bw = Math.max(6, Math.min(46, band - Math.max(8, band * 0.42)));
    var peak = rows.reduce(function (a, r, i) { return r.value > rows[a].value ? i : a; }, 0);

    var grid = '', ticks = 4, i;
    for (i = 0; i <= ticks; i++) {
      var y = pad.t + ih - ih * (i / ticks);
      grid += '<line x1="' + pad.l + '" y1="' + y.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + y.toFixed(1) + '"/>' +
        '<text class="viz-axis" x="' + (pad.l - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' +
        U.esc(f.tick(max * (i / ticks))) + '</text>';
    }

    var marks = '', labels = '', hits = '';
    var everyOther = band < 42;
    rows.forEach(function (r, idx) {
      var h = max > 0 ? (r.value / max) * ih : 0;
      var x = pad.l + band * idx + (band - bw) / 2;
      var y = pad.t + ih - h;
      if (h > 0.6) marks += '<path class="viz-bar" data-idx="' + idx + '" d="' + pathTop(x, y, bw, h, 4) + '"/>';
      if (!everyOther || idx % 2 === 0) {
        labels += '<text class="viz-axis" x="' + (pad.l + band * idx + band / 2).toFixed(1) +
          '" y="' + (H - 10) + '" text-anchor="middle">' + U.esc(r.label) + '</text>';
      }
      if (idx === peak && r.value > 0) {
        labels += '<text class="viz-value" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 7).toFixed(1) +
          '" text-anchor="middle">' + U.esc(f.tick(r.value)) + '</text>';
      }
      hits += '<rect class="viz-bar-hit" data-idx="' + idx + '" x="' + (pad.l + band * idx).toFixed(1) +
        '" y="' + pad.t + '" width="' + band.toFixed(1) + '" height="' + ih + '" tabindex="0" role="img" ' +
        'aria-label="' + U.attr(r.label + ': ' + f.full(r.value) + (r.meta ? ' · ' + r.meta : '')) + '"/>';
    });

    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="false">' +
      '<g class="viz-grid">' + grid + '</g>' +
      '<line class="viz-baseline" x1="' + pad.l + '" y1="' + (pad.t + ih) + '" x2="' + (W - pad.r) + '" y2="' + (pad.t + ih) + '"/>' +
      marks + labels + hits + '</svg>';
  }

  function svgBars(rows, opts, W) {
    var f = formatter(opts);
    var rowH = 28, gap = 9;
    var labelW = Math.round(U.clamp(W * 0.34, 96, opts.labelWidth || 150));
    var valueW = opts.money ? 88 : 34;
    var pad = { t: 4, l: labelW + 10, r: valueW };
    var H = pad.t * 2 + rows.length * rowH;
    var iw = Math.max(24, W - pad.l - pad.r);
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([0])) || 1;

    var body = '', hits = '';
    rows.forEach(function (r, idx) {
      var y = pad.t + idx * rowH;
      var bh = rowH - gap;
      var w = (r.value / max) * iw;
      body += '<text class="viz-label" x="' + labelW + '" y="' + (y + bh / 2 + 4).toFixed(1) +
        '" text-anchor="end">' + U.esc(r.label) + '</text>';
      if (w > 0.6) {
        body += '<path class="viz-bar" data-idx="' + idx + '" d="' +
          pathRight(pad.l, y, Math.max(w, 3), bh, 4) + '"/>';
      }
      body += '<text class="viz-value" x="' + (pad.l + Math.max(w, 3) + 8).toFixed(1) +
        '" y="' + (y + bh / 2 + 4).toFixed(1) + '">' + U.esc(f.full(r.value)) + '</text>';
      hits += '<rect class="viz-bar-hit" data-idx="' + idx + '" x="0" y="' + y + '" width="' + W +
        '" height="' + rowH + '" tabindex="0" role="img" aria-label="' +
        U.attr(r.label + ': ' + f.full(r.value) + (r.meta ? ' · ' + r.meta : '')) + '"/>';
    });

    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="false">' +
      '<line class="viz-baseline" x1="' + pad.l + '" y1="' + pad.t + '" x2="' + pad.l + '" y2="' + (H - pad.t) + '"/>' +
      body + hits + '</svg>';
  }

  /* ---------- mount, draw, hover ---------- */

  function draw(el) {
    var spec = registry[el.getAttribute('data-viz-id')];
    if (!spec) return;
    var plot = el.querySelector('.viz-plot');
    var w = Math.round(plot.clientWidth || el.clientWidth || 0) || 640;
    if (el.dataset.drawnAt === String(w)) return;
    el.dataset.drawnAt = String(w);

    plot.innerHTML = spec.kind === 'columns'
      ? svgColumns(spec.rows, spec.opts, w)
      : svgBars(spec.rows, spec.opts, w);

    var tip = el.querySelector('.viz-tip');
    U.qsa('.viz-bar-hit', el).forEach(function (hit) {
      var idx = Number(hit.getAttribute('data-idx'));
      function show() {
        var r = spec.rows[idx];
        if (!r) return;
        var f = formatter(spec.opts);
        tip.innerHTML = '<div class="tip-k">' + U.esc(r.label) + '</div>' +
          '<div class="tip-v">' + U.esc(f.full(r.value)) + '</div>' +
          (r.meta ? '<div class="tip-k">' + U.esc(r.meta) + '</div>' : '');
        var mark = el.querySelector('.viz-bar[data-idx="' + idx + '"]') || hit;
        var mb = mark.getBoundingClientRect(), eb = el.getBoundingClientRect();
        tip.style.left = U.clamp(mb.left - eb.left + mb.width / 2, 60, Math.max(60, eb.width - 60)) + 'px';
        tip.style.top = (mb.top - eb.top) + 'px';
        tip.classList.add('on');
        el.classList.add('dimmed');
        U.qsa('.viz-bar', el).forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-idx') === String(idx));
        });
      }
      function hide() {
        tip.classList.remove('on');
        el.classList.remove('dimmed');
        U.qsa('.viz-bar.active', el).forEach(function (b) { b.classList.remove('active'); });
      }
      hit.addEventListener('mouseenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('mouseleave', hide);
      hit.addEventListener('blur', hide);
    });
  }

  function mount(root) {
    U.qsa('[data-viz-id]', root || document).forEach(draw);
  }

  var redraw = U.debounce(function () {
    U.qsa('[data-viz-id]').forEach(function (el) {
      el.dataset.drawnAt = '';
      draw(el);
    });
  }, 160);
  window.addEventListener('resize', redraw);

  return { columns: columns, bars: bars, mount: mount, redraw: redraw };
})();
