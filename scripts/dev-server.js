// سيرفر تطوير محلي يحاكي Vercel: ملفات public + دوال api + نفس الـ headers
// الاستخدام:  node scripts/dev-server.js --mock   (بيانات وهمية في الذاكرة)
//            node scripts/dev-server.js          (الشيت الحقيقي عبر service-account-key.json)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.PORT || '3000', 10);
const MOCK = process.argv.includes('--mock');
process.chdir(ROOT);

if (MOCK) {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-0123456789abcdef0123456789';
  process.env.QR_SECRET = process.env.QR_SECRET || 'dev-qr-secret-0123456789abcdef0123456789abcd';
  process.env.ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'Bootstrap-Admin-2026';
  const { createMockSheets } = require('../tests/mock-sheets');
  global.__SOC_SHEETS_MOCK__ = createMockSheets(require('../tests/mock-seed')());
} else if (fs.existsSync(path.join(ROOT, '.env'))) {
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  });
}

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function applyHeaders(res, pathname) {
  for (const h of vercel.headers || []) {
    const re = new RegExp('^' + h.source.replace(/\(\.\*\)/g, '.*') + '$');
    if (re.test(pathname)) h.headers.forEach(x => res.setHeader(x.key, x.value));
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;
  applyHeaders(res, pathname);

  if (pathname.startsWith('/api/')) {
    const name = pathname.slice(5).replace(/[^a-z]/g, '');
    const file = path.join(ROOT, 'api', name + '.js');
    if (!name || name.startsWith('_') || !fs.existsSync(file)) { res.statusCode = 404; return res.end('{}'); }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    req.query = Object.fromEntries(url.searchParams);
    if (raw && String(req.headers['content-type'] || '').includes('application/json')) {
      try { req.body = JSON.parse(raw); } catch (e) { req.body = raw; }
    } else req.body = raw || undefined;
    res.status = c => { res.statusCode = c; return res; };
    res.json = obj => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); return res; };
    try { await require(file)(req, res); } catch (e) { console.error(e); res.statusCode = 500; res.end('{}'); }
    return;
  }

  const rw = (vercel.rewrites || []).find(r => r.source === pathname);
  if (rw) pathname = rw.destination;
  if (!path.extname(pathname) && fs.existsSync(path.join(ROOT, 'public', pathname + '.html'))) pathname += '.html';
  const file = path.normalize(path.join(ROOT, 'public', pathname));
  if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`dev server ${MOCK ? '(MOCK DATA)' : '(REAL SHEET)'} on http://localhost:${PORT}`));
