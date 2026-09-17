/* TrustBridge — application shell: sidebar, topbar, omnibox, chrome badges. */
window.TB = window.TB || {};

TB.shell = (function () {
  'use strict';
  var U = TB.utils;
  var mounted = false;

  function navGroups(user) {
    var isAdmin = TB.store.isAdmin(user);
    var groups = [
      { label: 'Overview', items: [
        { icon: '▦', label: 'Dashboard', href: '/app/dashboard' }
      ] },
      { label: 'Escrow', items: [
        { icon: '⇄', label: 'Transactions', href: '/app/transactions' },
        { icon: '✓', label: 'Pending Approvals', href: '/app/approvals', count: 'approvals' }
      ] },
      { label: 'Trust & Safety', items: [
        { icon: '⚖', label: isAdmin ? 'Dispute Queue' : 'Disputes', href: '/app/disputes', count: 'disputes' },
        { icon: '⧉', label: 'Activity Log', href: '/app/activity' }
      ] },
      { label: 'Blockchain', items: [
        { icon: '⛓', label: 'On-chain Escrow', href: '/app/chain' },
        { icon: '✔', label: 'Verification', href: '/app/verify' }
      ] }
    ];

    if (user.role === 'buyer') {
      groups[1].items.unshift({ icon: '＋', label: 'Create Escrow', href: '/app/create', primary: true });
    }
    if (!isAdmin) {
      groups.push({ label: 'Money', items: [{ icon: '◈', label: 'Wallet', href: '/app/wallet' }] });
    }
    if (isAdmin) {
      groups.push({ label: 'Administration', items: [
        { icon: '◉', label: 'Admin Console', href: '/app/admin' }
      ] });
    }
    groups.push({ label: 'Account', items: [
      { icon: '◔', label: 'Notifications', href: '/app/notifications', count: 'unread' },
      { icon: '☺', label: 'Profile', href: '/app/profile' }
    ] });
    return groups;
  }

  function brandHtml(href) {
    return '<a class="brand" href="#' + href + '" data-nav aria-label="TrustBridge home">' +
      '<span class="brand-mark" aria-hidden="true">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 17h16M8 17V9.5L12 6l4 3.5V17" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 17v-4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>' +
      '</span>' +
      '<span><span class="brand-name">TrustBridge</span>' +
      '<span class="brand-sub" style="display:block">Escrow</span></span></a>';
  }

  function build() {
    var user = TB.store.currentUser();
    var root = document.getElementById('root');
    root.removeAttribute('aria-busy');
    root.innerHTML =
      '<div class="app-shell">' +
        '<aside class="sidebar" id="sidebar" aria-label="Primary navigation">' +
          brandHtml('/app/dashboard') +
          '<nav id="nav-groups"></nav>' +
          '<div class="sidebar-foot">' +
            '<div class="trust-card">' +
              '<strong><span aria-hidden="true">🛡</span> Secure escrow active</strong>' +
              'Dual-approval release, dispute protection and a full audit trail on every transaction.' +
              '<div style="margin-top:8px;color:var(--warning);font-weight:600">Simulated funds only.</div>' +
            '</div>' +
          '</div>' +
        '</aside>' +
        '<div class="app-main">' +
          '<header class="topbar">' +
            '<button class="icon-btn hamburger" id="btn-nav" type="button" aria-label="Open navigation" aria-expanded="false">☰</button>' +
            '<div class="omni">' +
              '<span class="omni-ico" aria-hidden="true">⌕</span>' +
              '<input class="input" id="omni" type="search" placeholder="Search escrows, IDs, people…" ' +
                'autocomplete="off" aria-label="Search transactions" />' +
              '<div class="omni-results" id="omni-results" role="listbox"></div>' +
            '</div>' +
            '<div class="grow"></div>' +
            '<span class="topbar-chain row-tight" id="chrome-chain"></span>' +
            '<button class="icon-btn" id="btn-theme" type="button" aria-label="Switch colour theme" title="Switch theme"></button>' +
            '<div class="menu-anchor">' +
              '<button class="icon-btn" id="btn-bell" type="button" aria-label="Notifications" aria-expanded="false">' +
                '<span aria-hidden="true">◔</span><span class="pip hidden" id="bell-pip">0</span>' +
              '</button>' +
            '</div>' +
            '<div class="menu-anchor">' +
              '<button class="user-btn" id="btn-user" type="button" aria-label="Account menu" aria-expanded="false">' +
                '<span class="avatar avatar-sm ' + U.toneFor(user.id) + '" id="chrome-avatar" aria-hidden="true">' + U.esc(U.initials(user.name)) + '</span>' +
                '<span class="u-text"><span class="u-name" id="chrome-name">' + U.esc(user.name.split(' ')[0]) + '</span>' +
                '<span class="u-role" style="display:block" id="chrome-role">' + U.esc(user.role) + '</span></span>' +
              '</button>' +
            '</div>' +
          '</header>' +
        '</div>' +
      '</div>' +
      '<div class="backdrop-mobile" id="nav-backdrop"></div>';

    wire();
    mounted = true;
  }

  function wire() {
    var byId = function (id) { return document.getElementById(id); };

    byId('btn-nav').addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    byId('nav-backdrop').addEventListener('click', function () {
      document.body.classList.remove('nav-open');
      byId('btn-nav').setAttribute('aria-expanded', 'false');
    });

    byId('btn-theme').addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      TB.app.applyTheme(next);
      TB.store.setTheme(next);
      updateChrome();
    });

    byId('btn-bell').addEventListener('click', function () { bellMenu(this); });
    byId('btn-user').addEventListener('click', function () { userMenu(this); });

    /* omnibox */
    var omni = byId('omni'), results = byId('omni-results');
    var run = U.debounce(function () { renderSearch(omni.value, results); }, 130);
    omni.addEventListener('input', run);
    omni.addEventListener('focus', function () { if (omni.value.trim()) renderSearch(omni.value, results); });
    omni.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { omni.value = ''; results.innerHTML = ''; omni.blur(); }
      if (e.key === 'Enter') {
        var first = results.querySelector('.omni-row');
        if (first) first.click();
      }
    });
    document.addEventListener('mousedown', function (e) {
      if (!results.contains(e.target) && e.target !== omni) results.innerHTML = '';
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        e.preventDefault(); omni.focus();
      }
    });
  }

  function renderSearch(term, host) {
    term = String(term || '').trim().toLowerCase();
    if (term.length < 2) { host.innerHTML = ''; return; }
    var user = TB.store.currentUser();
    var hits = TB.store.transactionsFor(user).filter(function (t) {
      var buyer = TB.store.user(t.buyerId), seller = TB.store.user(t.sellerId);
      return (t.id + ' ' + t.title + ' ' + (buyer ? buyer.name : '') + ' ' + (seller ? seller.name : '') + ' ' +
        U.statusLabel(t.status)).toLowerCase().indexOf(term) !== -1;
    }).slice(0, 7);

    var dhits = TB.store.disputesFor(user).filter(function (d) {
      return d.id.toLowerCase().indexOf(term) !== -1;
    }).slice(0, 3);

    if (!hits.length && !dhits.length) {
      host.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:.82rem">' +
        'No escrow matches “' + U.esc(term) + '”.</div>';
      return;
    }
    host.innerHTML =
      hits.map(function (t) {
        return '<button class="omni-row" type="button" data-go="/app/tx/' + U.attr(t.id) + '">' +
          U.badge(t.status) +
          '<span class="grow truncate"><span style="font-weight:600">' + U.esc(t.title) + '</span>' +
          '<span class="omni-sub" style="display:block">' + U.esc(t.id) + ' · ' + U.esc(U.money(t.amount, t.currency)) + '</span></span>' +
          '</button>';
      }).join('') +
      dhits.map(function (d) {
        return '<button class="omni-row" type="button" data-go="/app/dispute/' + U.attr(d.id) + '">' +
          U.badge(d.status) + '<span class="grow truncate">Dispute ' + U.esc(d.id) +
          '<span class="omni-sub" style="display:block">' + U.esc(d.txId) + '</span></span></button>';
      }).join('');

    U.qsa('.omni-row', host).forEach(function (b) {
      b.addEventListener('click', function () {
        host.innerHTML = '';
        document.getElementById('omni').value = '';
        TB.router.navigate(b.getAttribute('data-go'));
      });
    });
  }

  function bellMenu(anchor) {
    var user = TB.store.currentUser();
    var list = TB.store.notificationsFor(user).slice(0, 6);
    var unread = TB.store.unreadCount(user);
    var body =
      '<div class="dropdown-head row between">' +
        '<strong style="font-size:.86rem">Notifications</strong>' +
        (unread ? '<button class="btn btn-ghost btn-sm" type="button" data-all>Mark all read</button>' : '<span class="muted" style="font-size:.76rem">All caught up</span>') +
      '</div>' +
      (list.length ? list.map(function (n) {
        return '<button class="dropdown-item" type="button" data-nid="' + U.attr(n.id) + '" ' +
          'data-tx="' + U.attr(n.txId || '') + '" style="align-items:flex-start">' +
          '<span class="di-ico" aria-hidden="true" style="color:' + (n.read ? 'var(--muted)' : 'var(--brand)') + '">' +
          (n.read ? '○' : '●') + '</span>' +
          '<span class="grow" style="min-width:0">' +
            '<span style="display:block;font-weight:' + (n.read ? '550' : '700') + '">' + U.esc(n.title) + '</span>' +
            '<span style="display:block;font-size:.75rem;color:var(--muted);white-space:normal">' + U.esc(n.body) + '</span>' +
            '<span style="display:block;font-size:.7rem;color:var(--muted);margin-top:2px">' + U.esc(U.relTime(n.at)) + '</span>' +
          '</span></button>';
      }).join('') : '<div style="padding:18px;text-align:center;color:var(--muted);font-size:.82rem">Nothing yet.</div>') +
      '<div class="dropdown-sep"></div>' +
      '<a class="dropdown-item" href="#/app/notifications" data-nav data-close-menu>' +
        '<span class="di-ico" aria-hidden="true">◔</span>Open notification center</a>';

    TB.ui.dropdown(anchor, body, function (el, close) {
      var all = el.querySelector('[data-all]');
      if (all) all.addEventListener('click', function () {
        var n = TB.store.markAllRead();
        close();
        TB.ui.toast({ type: 'success', title: n ? U.pluralise(n, 'notification') + ' marked read' : 'Already up to date' });
        TB.router.refresh();
      });
      U.qsa('[data-nid]', el).forEach(function (b) {
        b.addEventListener('click', function () {
          TB.store.markRead(b.getAttribute('data-nid'), true);
          close();
          var tx = b.getAttribute('data-tx');
          TB.router.navigate(tx ? '/app/tx/' + tx : '/app/notifications');
        });
      });
    });
  }

  function userMenu(anchor) {
    var user = TB.store.currentUser();
    var body =
      '<div class="dropdown-head">' +
        '<div class="row">' +
          '<span class="avatar ' + U.toneFor(user.id) + '" aria-hidden="true">' + U.esc(U.initials(user.name)) + '</span>' +
          '<span class="grow" style="min-width:0">' +
            '<span style="display:block;font-weight:650;font-size:.87rem">' + U.esc(user.name) + '</span>' +
            '<span class="truncate" style="display:block;font-size:.74rem;color:var(--muted)">' + U.esc(user.email) + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="row-tight" style="margin-top:9px">' + U.badge(user.role === 'admin' ? 'resolved' : 'funded', { label: U.titleCase(user.role) + ' account' }) + '</div>' +
      '</div>' +
      '<a class="dropdown-item" href="#/app/profile" data-nav data-close-menu><span class="di-ico" aria-hidden="true">☺</span>Profile & settings</a>' +
      (TB.store.isAdmin(user) ? '' : '<a class="dropdown-item" href="#/app/wallet" data-nav data-close-menu><span class="di-ico" aria-hidden="true">◈</span>Wallet</a>') +
      '<a class="dropdown-item" href="#/app/activity" data-nav data-close-menu><span class="di-ico" aria-hidden="true">⧉</span>Activity log</a>' +
      '<div class="dropdown-sep"></div>' +
      '<button class="dropdown-item" type="button" data-switch><span class="di-ico" aria-hidden="true">⇄</span>Switch demo account</button>' +
      '<button class="dropdown-item" type="button" data-reset><span class="di-ico" aria-hidden="true">↺</span>Reset demo data</button>' +
      '<div class="dropdown-sep"></div>' +
      '<button class="dropdown-item danger" type="button" data-logout><span class="di-ico" aria-hidden="true">⏻</span>Log out</button>';

    TB.ui.dropdown(anchor, body, function (el, close) {
      el.querySelector('[data-logout]').addEventListener('click', function () {
        close();
        TB.ui.confirm({
          title: 'Log out of TrustBridge?',
          body: 'Your simulated escrows, balances and notifications stay saved in this browser.',
          confirmLabel: 'Log out', tone: 'danger'
        }).then(function (ok) {
          if (!ok) return;
          TB.store.logout();
          TB.ui.toast({ type: 'success', title: 'Signed out', body: 'See you soon.' });
          TB.router.navigate('/login');
        });
      });
      el.querySelector('[data-switch]').addEventListener('click', function () {
        close();
        TB.store.logout();
        TB.router.navigate('/login');
      });
      el.querySelector('[data-reset]').addEventListener('click', function () {
        close();
        TB.ui.confirm({
          title: 'Reset all demo data?',
          body: 'Every escrow, dispute, wallet balance and notification returns to the seeded demo state. This cannot be undone.',
          confirmLabel: 'Reset demo', tone: 'danger',
          warning: { title: 'This clears your local prototype data', body: 'Accounts you created will be removed.' }
        }).then(function (ok) {
          if (!ok) return;
          TB.store.resetDemo();
          TB.ui.toast({ type: 'success', title: 'Demo data reset' });
          TB.router.navigate('/login');
          TB.router.refresh();
        });
      });
    });
  }

  function renderNav() {
    var user = TB.store.currentUser();
    var host = document.getElementById('nav-groups');
    if (!host || !user) return;
    var here = TB.router.path();
    var stats = TB.store.statsFor(user);
    var counts = {
      approvals: stats.pendingApprovals.length,
      disputes: TB.store.disputesFor(user).filter(function (d) {
        return TB.store.OPEN_DISPUTE_STATES.indexOf(d.status) !== -1;
      }).length,
      unread: TB.store.unreadCount(user)
    };

    host.innerHTML = navGroups(user).map(function (g) {
      return '<div class="nav-group">' +
        '<div class="nav-label eyebrow">' + U.esc(g.label) + '</div>' +
        g.items.map(function (it) {
          var active = here === it.href || (it.href !== '/app/dashboard' && here.indexOf(it.href) === 0);
          var n = it.count ? counts[it.count] : 0;
          var cls = it.count === 'disputes' ? 'hot' : (it.count === 'unread' ? 'hot' : 'brand');
          return '<a class="nav-item" href="#' + it.href + '" data-nav' + (active ? ' aria-current="page"' : '') + '>' +
            '<span class="nav-ico" aria-hidden="true">' + it.icon + '</span>' +
            '<span class="grow">' + U.esc(it.label) + '</span>' +
            (it.count && n ? '<span class="count ' + cls + '">' + n + '</span>' : '') +
            '</a>';
        }).join('') +
        '</div>';
    }).join('');
  }

  function updateChrome() {
    if (!mounted) return;
    var user = TB.store.currentUser();
    if (!user) return;
    renderNav();

    var unread = TB.store.unreadCount(user);
    var pip = document.getElementById('bell-pip');
    if (pip) {
      pip.textContent = unread > 9 ? '9+' : String(unread);
      pip.classList.toggle('hidden', unread === 0);
    }
    var bell = document.getElementById('btn-bell');
    if (bell) bell.setAttribute('aria-label', unread ? unread + ' unread notifications' : 'Notifications');

    var theme = document.documentElement.getAttribute('data-theme');
    var tb = document.getElementById('btn-theme');
    if (tb) {
      tb.innerHTML = '<span aria-hidden="true">' + (theme === 'dark' ? '☀' : '☾') + '</span>';
      tb.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    }
    var nm = document.getElementById('chrome-name');
    if (nm) nm.textContent = user.name.split(' ')[0];
    var rl = document.getElementById('chrome-role');
    if (rl) rl.textContent = user.role === 'admin' ? 'Trust & Safety' : user.role;
    var av = document.getElementById('chrome-avatar');
    if (av) {
      av.textContent = U.initials(user.name);
      av.className = 'avatar avatar-sm ' + U.toneFor(user.id);
    }

    /* network indicator + wallet button, only once a deployment is configured */
    var chainHost = document.getElementById('chrome-chain');
    if (chainHost && TB.chain && TB.chain.ui && TB.chain.config.isConfigured()) {
      chainHost.innerHTML =
        TB.chain.ui.networkBadge({ short: true }) + TB.chain.ui.walletButton();
      TB.chain.ui.wireWalletControls(chainHost);
    }
  }

  function mount() {
    if (!mounted) build();
    var main = document.querySelector('.app-main');
    var old = document.getElementById('view');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    return main;
  }

  function unmount() {
    mounted = false;
    document.body.classList.remove('nav-open');
  }

  return { mount: mount, unmount: unmount, updateChrome: updateChrome, brandHtml: brandHtml };
})();
