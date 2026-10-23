const { HttpError, authenticate } = require('../_sheets');
const { clientIp } = require('./security');

// غلاف موحد لكل الـ API: نفس الأصل فقط، تحقق الجلسة والدور، ورسائل أخطاء آمنة
function route(config, fn) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const method = req.method || 'GET';
    const methods = config.methods || ['GET'];
    if (!methods.includes(method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
      if (method !== 'GET') {
        // حماية CSRF: الطلبات المعدِّلة يجب أن تأتي من نفس الموقع وبصيغة JSON
        const origin = req.headers.origin;
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        if (origin) {
          let originHost = '';
          try { originHost = new URL(origin).host; } catch (e) { /* invalid */ }
          if (originHost !== host) throw new HttpError(403, 'طلب من مصدر غير مسموح');
        } else if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') {
          throw new HttpError(403, 'طلب من مصدر غير مسموح');
        }
        if (!String(req.headers['content-type'] || '').includes('application/json')) {
          throw new HttpError(415, 'صيغة الطلب غير مدعومة');
        }
        if (typeof req.body === 'string') {
          try { req.body = JSON.parse(req.body); } catch (e) { throw new HttpError(400, 'JSON غير صالح'); }
        }
        req.body = req.body || {};
      }

      const ip = clientIp(req);
      const roles = typeof config.roles === 'function' ? config.roles(req) : config.roles;
      const user = roles ? await authenticate(req, roles, { allowMustChange: config.allowMustChange }) : null;
      const result = await fn({ req, res, user, ip, body: req.body || {}, query: req.query || {} });
      if (result !== undefined && !res.headersSent) return res.status(200).json(result);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error('API error:', err);
      const message = status >= 500 ? 'حدث خطأ في الخادم. حاول مرة أخرى' : err.message;
      return res.status(status).json({ success: false, message, ...(err.extra || {}) });
    }
  };
}

module.exports = { route, HttpError };
