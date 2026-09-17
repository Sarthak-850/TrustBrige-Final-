/* TrustBridge — hash router with auth/role guards. */
window.TB = window.TB || {};

TB.router = (function () {
  'use strict';
  var U = TB.utils;

  /* path pattern → view key in TB.views. `shell:false` renders full-page. */
  var TABLE = [
    { p: '/',                 v: 'landing',       shell: false, title: 'TrustBridge — Peer-to-Peer Escrow' },
    { p: '/login',            v: 'login',         shell: false, guest: true, title: 'Sign in · TrustBridge' },
    { p: '/signup',           v: 'signup',        shell: false, guest: true, title: 'Create account · TrustBridge' },
    { p: '/forgot',           v: 'forgot',        shell: false, guest: true, title: 'Reset password · TrustBridge' },

    { p: '/app/dashboard',    v: 'dashboard',     auth: true, title: 'Dashboard · TrustBridge' },
    { p: '/app/create',       v: 'createEscrow',  auth: true, title: 'Create escrow · TrustBridge' },
    { p: '/app/transactions', v: 'transactions',  auth: true, title: 'Transactions · TrustBridge' },
    { p: '/app/tx/:id',       v: 'txDetail',      auth: true, title: 'Transaction · TrustBridge' },
    { p: '/app/approvals',    v: 'approvals',     auth: true, title: 'Pending approvals · TrustBridge' },
    { p: '/app/disputes',     v: 'disputes',      auth: true, title: 'Dispute Center · TrustBridge' },
    { p: '/app/dispute/:id',  v: 'disputeDetail', auth: true, title: 'Dispute · TrustBridge' },
    { p: '/app/wallet',       v: 'wallet',        auth: true, title: 'Wallet · TrustBridge' },
    { p: '/app/notifications',v: 'notifications', auth: true, title: 'Notifications · TrustBridge' },
    { p: '/app/activity',     v: 'activity',      auth: true, title: 'Activity log · TrustBridge' },
    { p: '/app/profile',      v: 'profile',       auth: true, title: 'Profile · TrustBridge' },
    { p: '/app/admin',        v: 'admin',         auth: true, admin: true, title: 'Admin console · TrustBridge' },
    { p: '/app/chain',        v: 'chain',         auth: true, title: 'On-chain escrow · TrustBridge' },
    { p: '/app/verify',       v: 'verify',        auth: true, title: 'Technical verification · TrustBridge' }
  ];

  var currentRoute = null;
  var currentPath = '/';
  var currentQuery = {};
  var booted = false;

  function parseHash() {
    var raw = location.hash.replace(/^#/, '') || '/';
    if (raw.charAt(0) !== '/') raw = '/' + raw;
    var qi = raw.indexOf('?');
    var path = qi === -1 ? raw : raw.slice(0, qi);
    var query = {};
    if (qi !== -1) {
      raw.slice(qi + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      });
    }
    if (path.length > 1 && path.slice(-1) === '/') path = path.slice(0, -1);
    return { path: path, query: query };
  }

  function match(path) {
    var segs = path.split('/').filter(Boolean);
    for (var i = 0; i < TABLE.length; i++) {
      var r = TABLE[i];
      var ps = r.p.split('/').filter(Boolean);
      if (ps.length !== segs.length) continue;
      var params = {}, ok = true;
      for (var j = 0; j < ps.length; j++) {
        if (ps[j].charAt(0) === ':') params[ps[j].slice(1)] = decodeURIComponent(segs[j]);
        else if (ps[j].toLowerCase() !== segs[j].toLowerCase()) { ok = false; break; }
      }
      if (ok) return { route: r, params: params };
    }
    return null;
  }

  function navigate(path, opts) {
    opts = opts || {};
    var target = '#' + path;
    if (location.hash === target) { render(); return; }
    if (opts.replace && location.replace) {
      location.replace(location.pathname + location.search + target);
    } else {
      location.hash = path;
    }
  }

  function refresh() { render(); }

  function query() { return currentQuery; }
  function path() { return currentPath; }

  function render() {
    var parsed = parseHash();
    currentPath = parsed.path;
    currentQuery = parsed.query;

    var hit = match(currentPath);
    var user = TB.store.currentUser();

    if (!hit) {
      TB.ui.toast({ type: 'warn', title: 'Page not found', body: 'Taking you ' + (user ? 'to your dashboard' : 'home') + '.' });
      return navigate(user ? '/app/dashboard' : '/', { replace: true });
    }
    var route = hit.route;

    if (route.auth && !user) {
      return navigate('/login?next=' + encodeURIComponent(currentPath), { replace: true });
    }
    if (route.guest && user) {
      return navigate('/app/dashboard', { replace: true });
    }
    if (route.admin && !TB.store.isAdmin(user)) {
      TB.ui.toast({ type: 'error', title: 'Admin access only', body: 'Sign in with the Trust & Safety demo account to open the admin console.' });
      return navigate('/app/dashboard', { replace: true });
    }

    var view = TB.views[route.v];
    if (!view) {
      console.error('Missing view: ' + route.v);
      return;
    }

    currentRoute = route;
    document.title = route.title || 'TrustBridge';
    TB.ui.closeDropdowns();
    document.body.classList.remove('nav-open');

    var host;
    if (route.shell === false) {
      TB.shell.unmount();
      host = document.getElementById('root');
      host.innerHTML = '';
      host.removeAttribute('aria-busy');
    } else {
      host = TB.shell.mount();
    }

    var ctx = {
      params: hit.params,
      query: currentQuery,
      user: user,
      route: route,
      navigate: navigate,
      refresh: refresh
    };

    var container = document.createElement('div');
    container.className = route.shell === false ? '' : 'view view-enter';
    container.id = route.shell === false ? 'view' : 'view';
    host.appendChild(container);

    try {
      container.innerHTML = view.render(ctx) || '';
      if (view.mount) view.mount(container, ctx);
    } catch (e) {
      console.error(e);
      container.innerHTML = '<div class="card card-pad">' +
        TB.ui.empty('⚠', 'Something went wrong rendering this page',
          e && e.message ? e.message : 'Unexpected error.',
          '<button class="btn btn-outline" type="button" data-reload>Reload TrustBridge</button>') + '</div>';
      var reload = container.querySelector('[data-reload]');
      if (reload) reload.addEventListener('click', function () { location.reload(); });
    }

    TB.charts.mount(container);
    if (TB.shell.updateChrome) TB.shell.updateChrome();

    if (booted) window.scrollTo({ top: 0, behavior: 'auto' });
    booted = true;
  }

  function start() {
    window.addEventListener('hashchange', render);
    if (!location.hash) {
      var u = TB.store.currentUser();
      location.replace(location.pathname + location.search + '#' + (u ? '/app/dashboard' : '/'));
    }
    render();
  }

  /* Global link interception for in-app anchors written as href="#/path" */
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-nav]') : null;
    if (!a) return;
    e.preventDefault();
    navigate(a.getAttribute('href').replace(/^#/, ''));
  });

  return {
    start: start, render: render, refresh: refresh, navigate: navigate,
    query: query, path: path,
    route: function () { return currentRoute; }
  };
})();
