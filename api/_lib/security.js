const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// بادئة __Host- تمنع أي نطاق فرعي من ضبط أو سرقة الكوكي
const SESSION_COOKIE = '__Host-soc_sess';
const SESSION_TTL_SEC = 12 * 60 * 60;
const SUPER_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'abdalla.elbardesy1@gmail.com').trim().toLowerCase();

// ==================== الأسرار ====================
// تُقرأ من متغيرات البيئة، وإن لم توجد تُشتق من مفتاح الـ Service Account (سر لا يغادر السيرفر)
let derivedBase = null;
function getDerivedBase() {
  if (derivedBase) return derivedBase;
  let base = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"|"$/g, '').trim();
  if (!base) {
    const keyPath = path.join(process.cwd(), 'service-account-key.json');
    if (fs.existsSync(keyPath)) base = (JSON.parse(fs.readFileSync(keyPath, 'utf8')).private_key || '').trim();
  }
  if (!base) throw new Error('لا يوجد سر للتشفير. اضبط SESSION_SECRET و QR_SECRET');
  derivedBase = base;
  return base;
}

function getSecret(name) {
  const v = (process.env[name] || '').trim();
  if (v.length >= 32) return v;
  return crypto.createHash('sha256').update(`${name}:${getDerivedBase()}`).digest('hex');
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

// ==================== كلمات المرور (scrypt) ====================
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${b64url(salt)}$${b64url(hash)}`;
}

function isHashed(stored) {
  return String(stored || '').startsWith('scrypt$');
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const expected = parts[2];
  const hash = crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 });
  return safeEqual(b64url(hash), expected);
}

function validatePasswordStrength(pw) {
  const p = String(pw || '');
  if (p.length < 10) return 'كلمة المرور يجب ألا تقل عن 10 أحرف';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'كلمة المرور يجب أن تحتوي على حروف إنجليزية وأرقام';
  if (/^(.)\1+$/.test(p)) return 'كلمة المرور ضعيفة جداً';
  return null;
}

function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8, 12);
}

// بصمة قصيرة من هاش كلمة المرور: تغيير كلمة المرور يُبطل كل الجلسات القديمة
function passwordFingerprint(stored) {
  return crypto.createHash('sha256').update(String(stored || '')).digest('hex').slice(0, 12);
}

// ==================== الجلسات (توكن موقّع داخل كوكي HttpOnly) ====================
function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', getSecret('SESSION_SECRET')).update(body).digest());
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.length > 2048) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac('sha256', getSecret('SESSION_SECRET')).update(body).digest());
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

// توقيع دور المشرف العام الإضافي: تعديل الدور يدوياً في الشيت لا يمنح صلاحية
function roleSignature(email, role) {
  return b64url(crypto.createHmac('sha256', getSecret('SESSION_SECRET')).update(`soc-role:v1:${String(email).toLowerCase()}|${role}`).digest()).slice(0, 32);
}

// ==================== QR موقّع ضد التزوير ====================
// محتوى الكود: SOC3|<كود الطالب>|<توقيع HMAC>
// بدون السر لا يمكن توليد كود صالح لطالب آخر حتى لو عُرف كوده
function qrSignature(studentCode) {
  return b64url(crypto.createHmac('sha256', getSecret('QR_SECRET')).update(`soc-qr:v3:${studentCode}`).digest()).slice(0, 22);
}

function buildQrPayload(studentCode) {
  return `SOC3|${studentCode}|${qrSignature(studentCode)}`;
}

function parseQrPayload(text) {
  const raw = String(text || '').trim();
  if (raw.length > 512) return { ok: false, reason: 'invalid' };
  const parts = raw.split('|');
  if (parts.length === 3 && parts[0] === 'SOC3') {
    const code = parts[1].trim();
    if (!/^SOC-\d{4}-G[1-4]-\d{4,6}$/.test(code)) return { ok: false, reason: 'invalid' };
    if (!safeEqual(parts[2], qrSignature(code))) return { ok: false, reason: 'forged', code };
    return { ok: true, code };
  }
  if (raw.startsWith('{')) return { ok: false, reason: 'legacy' };
  return { ok: false, reason: 'invalid' };
}

// ==================== Rate limiting (لكل نسخة من السيرفر) ====================
const buckets = new Map();
function rateLimit(key, limit, windowSec) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) {
    b = { count: 0, reset: now + windowSec * 1000 };
    buckets.set(key, b);
  }
  b.count++;
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  }
  return { allowed: b.count <= limit, retryAfter: Math.ceil((b.reset - now) / 1000) };
}

function clearRateLimit(key) {
  buckets.delete(key);
}

function clientIp(req) {
  // على Vercel هذه الـ headers يضبطها الخادم نفسه ولا يمكن للمستخدم تزويرها
  return String(req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  SUPER_ADMIN_EMAIL,
  getSecret,
  safeEqual,
  hashPassword,
  isHashed,
  verifyPassword,
  validatePasswordStrength,
  generateTempPassword,
  passwordFingerprint,
  signToken,
  verifyToken,
  parseCookies,
  sessionCookie,
  buildQrPayload,
  roleSignature,
  parseQrPayload,
  rateLimit,
  clearRateLimit,
  clientIp
};
