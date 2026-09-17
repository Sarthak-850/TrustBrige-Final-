/* TrustBridge — bootstrap */
window.TB = window.TB || {};

TB.app = (function () {
  'use strict';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    var meta = document.querySelector('meta[name=color-scheme]');
    if (meta) meta.setAttribute('content', theme === 'light' ? 'light dark' : 'dark light');
  }

  function start() {
    var state = TB.store.init();
    applyTheme((state.prefs && state.prefs.theme) || 'dark');

    /* keep sidebar counts, the bell pip and the theme icon in sync with state */
    TB.store.subscribe(function () {
      if (TB.shell.updateChrome) TB.shell.updateChrome();
    });

    /* the shell renders synchronously; a short skeleton beat avoids a flash */
    TB.router.start();

    /* Boot the Soroban layer: restores a wallet connection and starts the
       contract event subscription. Silent no-op when nothing is deployed, so
       the simulated app is unaffected. */
    if (TB.chain && TB.chain.init) {
      TB.chain.init().then(function () {
        if (TB.shell.updateChrome) TB.shell.updateChrome();
      }, function (e) {
        console.error('[TB chain] init failed', e);
      });
      if (TB.chain.wallets) {
        TB.chain.wallets.subscribe(function () {
          if (TB.shell.updateChrome) TB.shell.updateChrome();
        });
      }
    }

    /* dismiss transient UI on Escape from anywhere */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') TB.ui.closeDropdowns();
    });

    /* surface unexpected failures instead of dying silently */
    window.addEventListener('error', function (e) {
      console.error(e.error || e.message);
    });

    /* cross-tab sync: another tab acting on the same demo data */
    window.addEventListener('storage', function (e) {
      if (e.key !== 'trustbridge.state.v3') return;
      TB.store.init();
      TB.router.refresh();
      TB.ui.toast({ type: 'info', title: 'Updated in another tab', body: 'This view has been refreshed.' });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  return { applyTheme: applyTheme };
})();
