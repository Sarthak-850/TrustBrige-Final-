/* TrustBridge — utilities: escaping, money, dates, ids, DOM, labels */
window.TB = window.TB || {};

TB.utils = (function () {
  'use strict';

  /* ---- escaping ---------------------------------------------------- */
  var ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) { return ENT[c]; });
  }
  function attr(v) { return esc(v); }

  /* ---- currency ---------------------------------------------------- */
  var CURRENCIES = {
    INR: { symbol: '₹', locale: 'en-IN', label: 'Indian Rupee' },
    USD: { symbol: '$', locale: 'en-US', label: 'US Dollar' },
    EUR: { symbol: '€', locale: 'en-IE', label: 'Euro' },
    GBP: { symbol: '£', locale: 'en-GB', label: 'Pound Sterling' },
    AED: { symbol: 'AED ', locale: 'en-AE', label: 'UAE Dirham' },
    SGD: { symbol: 'S$', locale: 'en-SG', label: 'Singapore Dollar' }
  };

  function currency(code) { return CURRENCIES[code] || CURRENCIES.INR; }

  function money(amount, code, opts) {
    opts = opts || {};
    var c = currency(code || 'INR');
    var n = Number(amount) || 0;
    var decimals = opts.decimals;
    if (decimals === undefined) decimals = Math.abs(n % 1) > 0.0001 ? 2 : 0;
    var body;
    try {
      body = new Intl.NumberFormat(c.locale, {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals
      }).format(Math.abs(n));
    } catch (e) {
      body = Math.abs(n).toFixed(decimals);
    }
    return (n < 0 ? '-' : '') + c.symbol + body;
  }

  /** Compact form for tiles and axis ticks: ₹4.2L, ₹1.1Cr, $12.4K */
  function moneyCompact(amount, code) {
    var c = currency(code || 'INR');
    var n = Number(amount) || 0;
    var sign = n < 0 ? '-' : '';
    var a = Math.abs(n);
    var out;
    if (c.locale === 'en-IN') {
      if (a >= 1e7) out = trim(a / 1e7) + 'Cr';
      else if (a >= 1e5) out = trim(a / 1e5) + 'L';
      else if (a >= 1e3) out = trim(a / 1e3) + 'K';
      else out = String(Math.round(a));
    } else {
      if (a >= 1e9) out = trim(a / 1e9) + 'B';
      else if (a >= 1e6) out = trim(a / 1e6) + 'M';
      else if (a >= 1e3) out = trim(a / 1e3) + 'K';
      else out = String(Math.round(a));
    }
    return sign + c.symbol + out;
  }
  function trim(x) { return (Math.round(x * 10) / 10).toString(); }

  function parseAmount(raw) {
    var n = Number(String(raw === null || raw === undefined ? '' : raw).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  /* ---- dates ------------------------------------------------------- */
  function iso(d) { return (d instanceof Date ? d : new Date(d)).toISOString(); }
  function now() { return new Date().toISOString(); }
  function daysFromNow(n, hour) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    if (hour !== undefined) d.setHours(hour, (n * 17) % 60, 0, 0);
    return d.toISOString();
  }
  function dateInput(isoStr) { return isoStr ? String(isoStr).slice(0, 10) : ''; }

  function fmtDate(isoStr) {
    if (!isoStr) return '—';
    var d = new Date(isoStr);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(isoStr) {
    if (!isoStr) return '—';
    var d = new Date(isoStr);
    if (isNaN(d)) return '—';
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }
  function relTime(isoStr) {
    if (!isoStr) return '';
    var ms = Date.now() - new Date(isoStr).getTime();
    var future = ms < 0;
    var s = Math.abs(ms) / 1000;
    var v, unit;
    if (s < 60) { return future ? 'in a moment' : 'just now'; }
    if (s < 3600) { v = Math.floor(s / 60); unit = 'min'; }
    else if (s < 86400) { v = Math.floor(s / 3600); unit = 'hr'; }
    else if (s < 2592000) { v = Math.floor(s / 86400); unit = 'day'; }
    else if (s < 31104000) { v = Math.floor(s / 2592000); unit = 'mo'; }
    else { v = Math.floor(s / 31104000); unit = 'yr'; }
    var plural = v === 1 ? '' : 's';
    return future ? 'in ' + v + ' ' + unit + plural : v + ' ' + unit + plural + ' ago';
  }
  function daysBetween(a, b) {
    return Math.round((new Date(b).setHours(12, 0, 0, 0) - new Date(a).setHours(12, 0, 0, 0)) / 86400000);
  }
  function monthKey(isoStr) { return String(isoStr).slice(0, 7); }
  function monthLabel(key) {
    var parts = String(key).split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    return d.toLocaleDateString('en-IN', { month: 'short' });
  }

  /* ---- ids & text -------------------------------------------------- */
  function pad(n, len) { return String(n).padStart(len || 4, '0'); }
  function rid(prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function titleCase(s) {
    return String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }
  function pluralise(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function bytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  /* ---- labels ------------------------------------------------------ */
  var TX_STATUS_LABELS = {
    pending: 'Pending',
    funded: 'Funded',
    in_progress: 'In Progress',
    awaiting_approval: 'Awaiting Approval',
    released: 'Released',
    disputed: 'Disputed',
    refunded: 'Refunded',
    partially_refunded: 'Partially Refunded',
    cancelled: 'Cancelled'
  };
  var DISPUTE_STATUS_LABELS = {
    open: 'Open',
    under_review: 'Under Review',
    awaiting_response: 'Awaiting Response',
    resolved: 'Resolved',
    closed: 'Closed'
  };
  var STATUS_ICON = {
    pending: '○', funded: '◆', in_progress: '◐',
    awaiting_approval: '◑', released: '✓', disputed: '⚠',
    refunded: '↩', partially_refunded: '↰', cancelled: '✕',
    open: '⚠', under_review: '◑', awaiting_response: '○',
    resolved: '✓', closed: '✕'
  };
  function statusLabel(s) { return TX_STATUS_LABELS[s] || DISPUTE_STATUS_LABELS[s] || titleCase(s); }
  function statusIcon(s) { return STATUS_ICON[s] || '○'; }

  /** Status badge — always icon + text so colour is never the only channel. */
  function badge(status, opts) {
    opts = opts || {};
    return '<span class="badge ' + (opts.large ? 'badge-lg ' : '') + 's-' + esc(status) + '">' +
      '<span aria-hidden="true">' + statusIcon(status) + '</span>' +
      esc(opts.label || statusLabel(status)) + '</span>';
  }

  /* ---- DOM --------------------------------------------------------- */
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function on(root, evt, sel, fn) {
    root.addEventListener(evt, function (e) {
      var t = e.target.closest ? e.target.closest(sel) : null;
      if (t && root.contains(t)) fn(e, t);
    });
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function announce(msg) {
    var el = document.getElementById('sr-live');
    if (el) { el.textContent = ''; setTimeout(function () { el.textContent = msg; }, 40); }
  }
  function sum(arr, pick) {
    return arr.reduce(function (a, x) { return a + (pick ? Number(pick(x)) || 0 : Number(x) || 0); }, 0);
  }
  function groupCount(arr, pick) {
    return arr.reduce(function (acc, x) {
      var k = pick(x); acc[k] = (acc[k] || 0) + 1; return acc;
    }, {});
  }
  function toneFor(id) {
    var h = 0, s = String(id || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
    return 'tone-' + (h % 6 + 1);
  }

  return {
    esc: esc, attr: attr,
    CURRENCIES: CURRENCIES, currency: currency, money: money, moneyCompact: moneyCompact, parseAmount: parseAmount,
    iso: iso, now: now, daysFromNow: daysFromNow, dateInput: dateInput,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime, relTime: relTime, daysBetween: daysBetween,
    monthKey: monthKey, monthLabel: monthLabel,
    pad: pad, rid: rid, initials: initials, titleCase: titleCase, pluralise: pluralise, bytes: bytes, clamp: clamp,
    TX_STATUS_LABELS: TX_STATUS_LABELS, DISPUTE_STATUS_LABELS: DISPUTE_STATUS_LABELS,
    statusLabel: statusLabel, statusIcon: statusIcon, badge: badge,
    qs: qs, qsa: qsa, on: on, debounce: debounce, delay: delay, announce: announce,
    sum: sum, groupCount: groupCount, toneFor: toneFor
  };
})();
