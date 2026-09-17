/* TrustBridge — UI primitives: toasts, modals, confirmations, dropdowns,
   button busy-states and form validation helpers. No alert() anywhere. */
window.TB = window.TB || {};

TB.ui = (function () {
  'use strict';
  var U = TB.utils;

  /* =================== toasts =================== */

  var TOAST_ICON = { success: '✓', error: '✕', warn: '⚠', info: 'ⓘ' };

  function toast(opts) {
    if (typeof opts === 'string') opts = { title: opts };
    var type = opts.type || 'info';
    var region = document.getElementById('toast-region');
    if (!region) return;

    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML =
      '<span class="t-ico" aria-hidden="true">' + (TOAST_ICON[type] || 'ⓘ') + '</span>' +
      '<div class="grow">' +
        '<div class="t-title">' + U.esc(opts.title) + '</div>' +
        (opts.body ? '<div class="t-body">' + U.esc(opts.body) + '</div>' : '') +
      '</div>' +
      '<button class="t-close" type="button" aria-label="Dismiss notification">×</button>';

    region.appendChild(el);
    U.announce(opts.title + (opts.body ? '. ' + opts.body : ''));

    var timer = setTimeout(close, opts.timeout || (type === 'error' ? 7000 : 4600));
    el.querySelector('.t-close').addEventListener('click', function () { clearTimeout(timer); close(); });

    function close() {
      if (!el.parentNode) return;
      el.classList.add('leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }
    return close;
  }

  /* =================== modals =================== */

  var openModals = [];

  /**
   * modal({ title, subtitle, body, footer, size, onMount, onClose, dismissable })
   * `onMount(root, close)` receives the modal element and its closer.
   */
  function modal(opts) {
    var region = document.getElementById('modal-region');
    var lastFocus = document.activeElement;

    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    var sizeClass = opts.size === 'lg' ? ' modal-lg' : (opts.size === 'md' ? ' modal-md' : '');
    backdrop.innerHTML =
      '<div class="modal' + sizeClass + '" role="dialog" aria-modal="true" aria-label="' + U.attr(opts.title || 'Dialog') + '">' +
        '<div class="modal-head">' +
          '<div class="grow">' +
            '<h3>' + U.esc(opts.title || '') + '</h3>' +
            (opts.subtitle ? '<p>' + U.esc(opts.subtitle) + '</p>' : '') +
          '</div>' +
          (opts.dismissable === false ? '' : '<button class="modal-x" type="button" data-modal-close aria-label="Close dialog">×</button>') +
        '</div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>';

    region.appendChild(backdrop);
    document.body.style.overflow = 'hidden';
    var root = backdrop.querySelector('.modal');
    openModals.push(close);

    U.qsa('[data-modal-close]', backdrop).forEach(function (b) {
      b.addEventListener('click', function () { close(); });
    });
    if (opts.dismissable !== false) {
      backdrop.addEventListener('mousedown', function (e) { if (e.target === backdrop) close(); });
    }
    backdrop.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && opts.dismissable !== false) { e.stopPropagation(); close(); }
      if (e.key === 'Tab') trapFocus(e, root);
    });

    var focusTarget = root.querySelector('[data-autofocus]') ||
      root.querySelector('input:not([type=hidden]), select, textarea') ||
      root.querySelector('.modal-foot .btn-primary, .modal-foot .btn-danger, .modal-foot .btn') ||
      root;
    setTimeout(function () { try { focusTarget.focus(); } catch (e) {} }, 40);

    if (opts.onMount) opts.onMount(root, close);

    function close(result) {
      if (!backdrop.parentNode) return;
      openModals = openModals.filter(function (f) { return f !== close; });
      backdrop.style.opacity = '0';
      backdrop.style.transition = 'opacity .16s';
      setTimeout(function () {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        if (!openModals.length) document.body.style.overflow = '';
      }, 150);
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
      if (opts.onClose) opts.onClose(result);
    }

    return { root: root, close: close };
  }

  function trapFocus(e, root) {
    var f = U.qsa('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', root)
      .filter(function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function closeAllModals() { openModals.slice().forEach(function (c) { c(); }); }

  /* =================== confirmation =================== */

  /**
   * confirm({ title, body, rows, confirmLabel, cancelLabel, tone, requireAck })
   * → Promise<boolean>. Used for every irreversible money movement.
   */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var settled = false;
      var tone = opts.tone || 'primary';
      var btnClass = tone === 'danger' ? 'btn-danger' : (tone === 'success' ? 'btn-success' : 'btn-primary');

      var rows = (opts.rows || []).map(function (r) {
        return '<div class="money-row' + (r.total ? ' total' : '') + '">' +
          '<span class="' + (r.total ? '' : 'dim') + '">' + U.esc(r.k) + '</span>' +
          '<span class="mr-v">' + U.esc(r.v) + '</span></div>';
      }).join('');

      var body =
        (opts.body ? '<p class="dim" style="font-size:.9rem;line-height:1.6">' + opts.body + '</p>' : '') +
        (rows ? '<div style="margin-top:14px">' + rows + '</div>' : '') +
        (opts.warning ? '<div class="note note-warn" style="margin-top:16px">' +
          '<span class="note-ico" aria-hidden="true">⚠</span><div><strong>' + U.esc(opts.warning.title || 'This cannot be undone') +
          '</strong><div style="margin-top:2px">' + U.esc(opts.warning.body || '') + '</div></div></div>' : '') +
        (opts.requireAck ? '<label class="check" style="margin-top:16px"><input type="checkbox" data-ack />' +
          '<span>' + U.esc(opts.requireAck) + '</span></label>' : '');

      var m = modal({
        title: opts.title,
        subtitle: opts.subtitle,
        body: body,
        footer:
          '<button class="btn btn-outline" type="button" data-cancel>' + U.esc(opts.cancelLabel || 'Cancel') + '</button>' +
          '<button class="btn ' + btnClass + '" type="button" data-ok' + (opts.requireAck ? ' disabled' : '') + '>' +
          U.esc(opts.confirmLabel || 'Confirm') + '</button>',
        onClose: function () { if (!settled) { settled = true; resolve(false); } },
        onMount: function (root, close) {
          var ok = root.querySelector('[data-ok]');
          var ack = root.querySelector('[data-ack]');
          if (ack) ack.addEventListener('change', function () { ok.disabled = !ack.checked; });
          root.querySelector('[data-cancel]').addEventListener('click', function () { close(); });
          ok.addEventListener('click', function () {
            settled = true; resolve(true); close();
          });
        }
      });
      return m;
    });
  }

  /* =================== buttons =================== */

  function busy(btn, on) {
    if (!btn) return;
    if (on) {
      btn.dataset.wasDisabled = btn.disabled ? '1' : '';
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
    } else {
      btn.removeAttribute('aria-busy');
      btn.disabled = btn.dataset.wasDisabled === '1';
      delete btn.dataset.wasDisabled;
    }
  }

  /** Runs `fn` with a spinner on `btn` and a minimum visible latency. */
  function withBusy(btn, fn, minMs) {
    busy(btn, true);
    var started = Date.now();
    return Promise.resolve()
      .then(fn)
      .then(function (r) {
        var wait = Math.max(0, (minMs === undefined ? 480 : minMs) - (Date.now() - started));
        return U.delay(wait).then(function () { return r; });
      })
      .finally(function () { busy(btn, false); });
  }

  /* =================== dropdown =================== */

  function dropdown(anchor, html, onMount) {
    closeDropdowns();
    var wrap = anchor.closest('.menu-anchor') || anchor.parentNode;
    var el = document.createElement('div');
    el.className = 'dropdown';
    el.setAttribute('role', 'menu');
    el.innerHTML = html;
    wrap.appendChild(el);
    anchor.setAttribute('aria-expanded', 'true');

    function close() {
      if (el.parentNode) el.parentNode.removeChild(el);
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', onKey, true);
    }
    function outside(e) { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); }
    function onKey(e) { if (e.key === 'Escape') { close(); anchor.focus(); } }
    setTimeout(function () {
      document.addEventListener('mousedown', outside, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);
    U.qsa('[data-close-menu]', el).forEach(function (b) {
      b.addEventListener('click', function () { close(); });
    });
    if (onMount) onMount(el, close);
    activeDropdowns.push(close);
    return close;
  }
  var activeDropdowns = [];
  function closeDropdowns() {
    activeDropdowns.splice(0).forEach(function (c) { try { c(); } catch (e) {} });
  }

  /* =================== forms =================== */

  function fieldOf(input) { return input.closest ? input.closest('.field') : null; }

  function setError(input, msg) {
    var f = fieldOf(input);
    if (!f) return;
    f.classList.add('invalid');
    var err = f.querySelector('.err');
    if (err) err.textContent = msg;
    input.setAttribute('aria-invalid', 'true');
  }
  function clearError(input) {
    var f = fieldOf(input);
    if (!f) return;
    f.classList.remove('invalid');
    input.removeAttribute('aria-invalid');
  }
  function clearErrors(form) {
    U.qsa('.field.invalid', form).forEach(function (f) { f.classList.remove('invalid'); });
    U.qsa('[aria-invalid]', form).forEach(function (i) { i.removeAttribute('aria-invalid'); });
  }

  /**
   * validate(form, rules) — rules: { name: [ [testFn, message], ... ] }
   * Returns { ok, values, firstInvalid }.
   */
  function validate(form, rules) {
    clearErrors(form);
    var values = {};
    U.qsa('input, select, textarea', form).forEach(function (i) {
      if (!i.name) return;
      values[i.name] = i.type === 'checkbox' ? i.checked : i.value;
    });
    var firstInvalid = null;
    Object.keys(rules || {}).forEach(function (name) {
      var input = form.elements[name];
      if (!input) return;
      var el = input.length && !input.tagName ? input[0] : input;
      for (var i = 0; i < rules[name].length; i++) {
        var test = rules[name][i][0], msg = rules[name][i][1];
        if (!test(values[name], values)) {
          setError(el, msg);
          if (!firstInvalid) firstInvalid = el;
          break;
        }
      }
    });
    if (firstInvalid) {
      firstInvalid.focus();
      if (firstInvalid.scrollIntoView) firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    return { ok: !firstInvalid, values: values, firstInvalid: firstInvalid };
  }

  /* live-clear the error as soon as the user edits the field */
  document.addEventListener('input', function (e) {
    if (e.target.matches && e.target.matches('.input, .select, .textarea')) clearError(e.target);
  });

  var RULES = {
    required: function (msg) { return [function (v) { return String(v == null ? '' : v).trim().length > 0; }, msg]; },
    minLen: function (n, msg) { return [function (v) { return String(v || '').trim().length >= n; }, msg]; },
    email: [function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }, 'Enter a valid email address.'],
    positiveAmount: function (msg) {
      return [function (v) { var n = U.parseAmount(v); return isFinite(n) && n > 0; }, msg || 'Enter an amount greater than zero.'];
    },
    max: function (limit, msg) { return [function (v) { return U.parseAmount(v) <= limit; }, msg]; },
    futureDate: function (msg) {
      return [function (v) {
        if (!v) return false;
        var d = new Date(v + 'T23:59:59');
        return !isNaN(d) && d.getTime() >= Date.now() - 86400000;
      }, msg || 'Pick a date in the future.'];
    },
    match: function (other, msg) { return [function (v, all) { return v === all[other]; }, msg]; }
  };

  /* =================== misc =================== */

  function copy(text, label) {
    var done = function () { toast({ type: 'success', title: (label || 'Copied') + ' to clipboard' }); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { toast({ type: 'error', title: 'Could not copy', body: text }); }
      document.body.removeChild(ta);
    }
  }

  function skeletonRows(n, cols) {
    var out = '';
    for (var i = 0; i < (n || 5); i++) {
      out += '<tr>';
      for (var c = 0; c < (cols || 6); c++) {
        out += '<td><div class="skel skel-line" style="width:' + (45 + ((i * 13 + c * 29) % 50)) + '%"></div></td>';
      }
      out += '</tr>';
    }
    return out;
  }

  function empty(icon, title, body, actionHtml) {
    return '<div class="empty">' +
      '<div class="empty-ico" aria-hidden="true">' + icon + '</div>' +
      '<h4>' + U.esc(title) + '</h4>' +
      (body ? '<p>' + U.esc(body) + '</p>' : '') +
      (actionHtml || '') + '</div>';
  }

  function disclaimer(compact) {
    return '<div class="disclaimer">' +
      '<span aria-hidden="true">⚠</span>' +
      '<div><strong>Simulated funds.</strong> TrustBridge is a working prototype. ' +
      'No real money moves and nothing here is connected to a payment processor, bank or KYC provider.' +
      (compact ? '' : ' All balances, payouts and refunds are demo data stored in your browser.') +
      '</div></div>';
  }

  return {
    toast: toast, modal: modal, confirm: confirmDialog, closeAllModals: closeAllModals,
    busy: busy, withBusy: withBusy,
    dropdown: dropdown, closeDropdowns: closeDropdowns,
    validate: validate, RULES: RULES, setError: setError, clearError: clearError, clearErrors: clearErrors,
    copy: copy, skeletonRows: skeletonRows, empty: empty, disclaimer: disclaimer
  };
})();
