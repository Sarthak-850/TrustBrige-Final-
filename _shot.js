/* Screenshot / smoke harness. tools/shoot.ps1 copies this to the project root as
   _shot.js next to a generated _shot.html, then deletes both. Loaded as an
   external file so it satisfies the same `script-src 'self'` CSP the site ships.

   Params: as=buyer|seller|admin  go=/app/...  theme=dark|light
           modal=fund|resolve     diag=1 */
window.addEventListener('load', function () {
  setTimeout(function () {
    var p = new URLSearchParams(location.search);
    var as = p.get('as');
    var theme = p.get('theme');

    if (theme) { TB.app.applyTheme(theme); TB.store.setTheme(theme); }
    if (p.get('logout') === '1') TB.store.logout();
    if (as) {
      TB.store.logout();
      TB.store.login(as + '@trustbridge.app', 'demo1234', true);
    }
    location.hash = p.get('go') || '/app/dashboard';
    TB.router.render();

    if (p.get('modal') === 'fund') {
      var t = TB.store.getState().transactions.filter(function (x) {
        return x.status === 'pending' && x.buyerId === 'u_aarav';
      })[0];
      if (t) TB.actions.fund(t.id);
    }
    if (p.get('modal') === 'resolve') {
      var d = TB.store.getState().disputes.filter(function (x) {
        return TB.store.OPEN_DISPUTE_STATES.indexOf(x.status) !== -1;
      })[0];
      if (d) TB.actions.resolve(d.id);
    }

    document.title = 'shot-ready';

    /* probe=chain -> exercise the chain layer and dump results into the DOM,
       so headless --dump-dom can see what a console would have shown. */
    if (p.get('probe') === 'chain') {
      (async function () {
        var out = [];
        var say = function (k, v) { out.push(k + ': ' + v); };
        var attempt = async function (name, fn) {
          try {
            var v = await fn();
            say(name, typeof v === 'object' ? JSON.stringify(v) : String(v));
            return v;
          } catch (e) {
            say(name + ' ERROR', (e && (e.tbTitle ? e.tbTitle + ' | ' : '')) + (e && e.message) +
              (e && e.tbCause ? ' | cause=' + String(e.tbCause).slice(0, 300) : ''));
            return null;
          }
        };

        say('sdk loaded', !!window.StellarSdk);
        say('configured', TB.chain.config.isConfigured());
        say('rpcUrl', TB.chain.config.rpcUrl());
        say('escrowId', TB.chain.config.escrowId());
        await attempt('health', function () { return TB.chain.rpc.checkHealth(); });
        await attempt('latestLedger', function () { return TB.chain.rpc.latestLedger(); });
        await attempt('version', function () { return TB.chain.escrow.version(); });
        var next = await attempt('nextId', function () { return TB.chain.escrow.nextId(); });
        await attempt('get(1)', function () { return TB.chain.escrow.get(1); });
        await attempt('quote(10)', function () {
          return TB.chain.escrow.quote(TB.chain.config.toStroops(10));
        });
        var loaded = await attempt('refreshAll', function () { return TB.chain.sync.refreshAll(); });
        say('cache size', TB.chain.sync.all().length);
        await attempt('events.pollNow', function () { return TB.chain.events.pollNow(); });
        say('event status', JSON.stringify(TB.chain.events.statusSnapshot()));
        say('feed size', TB.chain.sync.events().length);

        var pre = document.createElement('pre');
        pre.id = 'diag';
        pre.textContent = out.join('\n');
        document.body.insertBefore(pre, document.body.firstChild);
        document.title = 'probe-done';
      })();
    }

    /* diag=1 → replace the page with a report of anything wider than the viewport */
    if (p.get('diag') === '1') {
      setTimeout(function () {
        var vw = document.documentElement.clientWidth;
        var out = ['viewport=' + vw + ' docScrollWidth=' + document.documentElement.scrollWidth];
        var all = document.querySelectorAll('body *');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          var r = el.getBoundingClientRect();
          if (r.width > vw + 1 || r.right > vw + 1) {
            out.push([
              el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
              (el.className && typeof el.className === 'string'
                ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
              'w=' + Math.round(r.width), 'right=' + Math.round(r.right),
              'scrollW=' + el.scrollWidth
            ].join(' '));
          }
        }
        document.body.innerHTML = '<pre id="diag">' + out.join('\n') + '</pre>';
      }, 200);
    }
  }, 120);
});
