/* TrustBridge — minimal static web server for local development.
   Node's standard library only: no npm install, no dependencies.

     node serve.js            → http://localhost:3000
     node serve.js 8080       → http://localhost:8080

   Serves this directory, sets the same security headers as the production
   host config, and returns 404.html for unknown paths. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

/* Stellar endpoints the app must be able to reach. Everything else stays
   first-party. Keep this list identical in netlify.toml and vercel.json. */
const STELLAR_ORIGINS = [
  'https://soroban-testnet.stellar.org',
  'https://horizon-testnet.stellar.org',
  'https://friendbot.stellar.org',
  'https://mainnet.sorobanrpc.com',
  'https://horizon.stellar.org'
].join(' ');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${STELLAR_ORIGINS}`,
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'"
].join('; ');

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', CSP);
}

function send(res, status, body, type, extra) {
  securityHeaders(res);
  res.setHeader('Content-Type', type || 'text/plain; charset=utf-8');
  Object.keys(extra || {}).forEach(function (k) { res.setHeader(k, extra[k]); });
  res.writeHead(status);
  res.end(body);
}

function notFound(res) {
  const page = path.join(ROOT, '404.html');
  fs.readFile(page, function (err, buf) {
    if (err) return send(res, 404, 'Not found');
    send(res, 404, buf, TYPES['.html']);
  });
}

const server = http.createServer(function (req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method not allowed', undefined, { Allow: 'GET, HEAD' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname || '/');
  } catch (e) {
    return send(res, 400, 'Bad request');
  }

  if (pathname === '/trustbridge' || pathname === '/trustbridge/') {
    res.writeHead(301, { Location: '/' });
    return res.end();
  }
  if (pathname.startsWith('/trustbridge/')) {
    res.writeHead(301, { Location: pathname.replace(/^\/trustbridge/, '') });
    return res.end();
  }

  if (pathname.endsWith('/')) pathname += 'index.html';

  /* keep the server inside ROOT no matter what the request says */
  const target = path.normalize(path.join(ROOT, pathname));
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'Forbidden');
  }
  /* development-only directory is not part of the site */
  if (target.startsWith(path.join(ROOT, 'tools') + path.sep)) return notFound(res);

  fs.stat(target, function (err, stat) {
    if (err || stat.isDirectory()) return notFound(res);

    const ext = path.extname(target).toLowerCase();
    const cache = pathname === '/index.html'
      ? 'public, max-age=0, must-revalidate'
      : (pathname.indexOf('/assets/') === 0 ? 'public, max-age=604800' : 'public, max-age=300');

    securityHeaders(res);
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', cache);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());

    if (req.method === 'HEAD') { res.writeHead(200); return res.end(); }

    res.writeHead(200);
    fs.createReadStream(target).pipe(res);
  });
});

server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use. Try: node serve.js ' + (PORT + 1));
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, function () {
  console.log('');
  console.log('  TrustBridge running at  http://localhost:' + PORT + '/');
  console.log('  Serving               ' + ROOT);
  console.log('  Demo accounts         buyer@ / seller@ / admin@trustbridge.app  ·  demo1234');
  console.log('  Stop                  Ctrl+C');
  console.log('');
});
