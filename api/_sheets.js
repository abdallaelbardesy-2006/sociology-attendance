const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const { SUBJECTS, GRADES, TERMS, findSubject, parseSubjectCodes } = require('./_lib/curriculum');
const sec = require('./_lib/security');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SPREADSHEET_ID = (process.env.GOOGLE_SHEET_ID || '1lOvjgilrsXCeTWK5gvn9NTeb-gx4EuSE-cSOpu6UmFQ').trim();

const ENROLL_TYPES = ['انتظام', 'انتساب'];
const STUDENT_STATUSES = ['عام', 'حالات خاصة', 'إبصار'];
const ROLES = ['super_admin', 'doctor', 'leader'];
const STATUS_PRESENT = 'حاضر';
const STATUS_OTHER_GRADE = 'حاضر (من فرقة أخرى)';

const HEADERS = {
  Students: ['التوقيت', 'الاسم بالكامل', 'نوع القيد', 'الحالة', 'الفرقة الدراسية', 'كود الطالب', 'بيانات QR (موقعة)', 'نشط'],
  Attendance: ['التوقيت', 'التاريخ', 'الساعة', 'اسم الطالب', 'كود الطالب', 'الفرقة الدراسية', 'الترم', 'كود المادة', 'اسم المادة', 'حالة الحضور', 'إيميل الدكتور/الأدمن'],
  Admins: ['الإيميل', 'كلمة المرور (مشفرة)', 'الاسم', 'الدور', 'المواد المخصصة', 'الفرقة المخصصة', 'تاريخ الإضافة', 'نشط', 'يجب تغيير كلمة المرور', 'آخر دخول'],
  AuditLog: ['التوقيت', 'المستخدم', 'الدور', 'الإجراء', 'التفاصيل', 'IP']
};
const SUBJECT_HEADER = ['التوقيت', 'التاريخ', 'الساعة', 'اسم الطالب', 'كود الطالب', 'الفرقة الدراسية', 'الترم', 'حالة الحضور', 'إيميل الدكتور/الأدمن'];

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || {};
  }
}

// ==================== الاتصال ====================
let clientCache = null;
let serviceAccountEmail = '';

function loadCredentials() {
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (rawKey && clientEmail) {
    return { email: clientEmail.trim(), key: rawKey.replace(/\\n/g, '\n').replace(/^"|"$/g, '') };
  }
  const keyPath = path.join(process.cwd(), 'service-account-key.json');
  if (fs.existsSync(keyPath)) {
    const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    return { email: keyData.client_email, key: keyData.private_key };
  }
  throw new Error('بيانات Google Service Account غير متوفرة. تأكد من ضبط GOOGLE_PRIVATE_KEY و GOOGLE_SERVICE_ACCOUNT_EMAIL');
}

async function getSheetsClient() {
  if (global.__SOC_SHEETS_MOCK__) return { sheets: global.__SOC_SHEETS_MOCK__, spreadsheetId: SPREADSHEET_ID };
  if (clientCache) return clientCache;
  const creds = loadCredentials();
  serviceAccountEmail = creds.email;
  const auth = new google.auth.JWT({ email: creds.email, key: creds.key, scopes: SCOPES });
  clientCache = { sheets: google.sheets({ version: 'v4', auth }), spreadsheetId: SPREADSHEET_ID };
  return clientCache;
}

function getServiceAccountEmail() {
  if (!serviceAccountEmail) {
    try { serviceAccountEmail = loadCredentials().email; } catch (e) { /* mock mode */ }
  }
  return serviceAccountEmail;
}

// تنظيف اسم المادة ليناسب شروط أسماء التبويبات في جوجل شيت
function getSubjectSheetName(code, name) {
  const safeName = (name || '').replace(/[\[\]*?:/\\]/g, ' ').replace(/\s+/g, ' ').trim();
  let tabTitle = `${code} - ${safeName}`.trim();
  if (tabTitle.length > 95) tabTitle = tabTitle.substring(0, 95);
  return tabTitle;
}

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ==================== التهيئة (مرة واحدة لكل نسخة سيرفر) ====================
let ensured = false;
let knownTabs = new Set();

async function ensureSheets() {
  const { sheets, spreadsheetId } = await getSheetsClient();
  if (ensured) return { sheets, spreadsheetId };
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
    knownTabs = new Set((meta.data.sheets || []).map(s => s.properties.title));

    const missing = Object.keys(HEADERS).filter(t => !knownTabs.has(t));
    if (missing.length) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: missing.map(title => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) }
      });
      missing.forEach(t => knownTabs.add(t));
    }

    const tabs = Object.keys(HEADERS);
    const heads = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: tabs.map(t => `${t}!A1:Z1`) });
    const data = [];
    (heads.data.valueRanges || []).forEach((vr, i) => {
      const current = (vr.values && vr.values[0]) || [];
      const wanted = HEADERS[tabs[i]];
      if (current.length < wanted.length || wanted.some((h, j) => current[j] !== h)) {
        data.push({ range: `${tabs[i]}!A1:${colLetter(wanted.length)}1`, values: [wanted] });
      }
    });
    if (data.length) {
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data } });
    }
    ensured = true;
    return { sheets, spreadsheetId };
  } catch (err) {
    if (err.message && err.message.includes('The caller does not have permission')) {
      throw new Error(`يرجى مشاركة شيت جوجل مع إيميل الخدمة كـ Editor (محرر): ${getServiceAccountEmail()}`);
    }
    throw err;
  }
}

async function ensureSubjectSheet(tabTitle) {
  const { sheets, spreadsheetId } = await ensureSheets();
  if (knownTabs.has(tabTitle)) return;
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  knownTabs = new Set((meta.data.sheets || []).map(s => s.properties.title));
  if (knownTabs.has(tabTitle)) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tabTitle, gridProperties: { frozenRowCount: 1 }, tabColor: { red: 0.1, green: 0.25, blue: 0.65 } } } }] }
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabTitle}'!A1:I1`,
    valueInputOption: 'RAW',
    requestBody: { values: [SUBJECT_HEADER] }
  });
  knownTabs.add(tabTitle);
}

// ==================== أدوات الوقت (توقيت القاهرة) ====================
function cairoNow(d = new Date()) {
  const parts = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(d).forEach(p => { parts[p.type] = p.value; });
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const h = parseInt(parts.hour, 10);
  const time = `${String(h % 12 || 12).padStart(2, '0')}:${parts.minute} ${h < 12 ? 'ص' : 'م'}`;
  return { date, time, stamp: `${date} ${parts.hour}:${parts.minute}:${parts.second}`, year: parts.year };
}

function cleanText(v, max = 120) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// تطبيع الأسماء العربية لاكتشاف التسجيل المكرر
function normalizeArabic(s) {
  return cleanText(s).toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ');
}

// ==================== سجل العمليات ====================
async function audit(actor, role, action, details, ip) {
  try {
    const { sheets, spreadsheetId } = await ensureSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'AuditLog!A:F',
      valueInputOption: 'RAW',
      requestBody: { values: [[cairoNow().stamp, cleanText(actor, 120), role || '', action, cleanText(details, 400), ip || '']] }
    });
  } catch (e) {
    console.error('audit failed:', e.message);
  }
}

async function readAudit(limit = 300) {
  const { sheets, spreadsheetId } = await ensureSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'AuditLog!A2:F' });
  return (res.data.values || []).slice(-limit).reverse().map(r => ({
    time: r[0] || '', actor: r[1] || '', role: r[2] || '', action: r[3] || '', details: r[4] || '', ip: r[5] || ''
  }));
}

// ==================== المستخدمين والصلاحيات ====================
let adminsCache = { at: 0, list: null };

async function readAdmins(fresh = false) {
  if (!fresh && adminsCache.list && Date.now() - adminsCache.at < 15000) return adminsCache.list;
  const { sheets, spreadsheetId } = await ensureSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Admins!A2:J' });
  const list = (res.data.values || []).map((r, i) => ({
    row: i + 2,
    email: String(r[0] || '').trim().toLowerCase(),
    password: String(r[1] || '').trim(),
    name: String(r[2] || '').trim(),
    role: String(r[3] || '').trim(),
    subjects: parseSubjectCodes(r[4]),
    grade: String(r[5] || 'الكل').trim() || 'الكل',
    createdAt: String(r[6] || '').trim(),
    active: String(r[7] || 'نعم').trim() !== 'لا',
    mustChange: String(r[8] || '').trim() === 'نعم',
    lastLogin: String(r[9] || '').trim()
  })).filter(a => a.email);
  adminsCache = { at: Date.now(), list };
  return list;
}

function subjectsToCell(codes) {
  return codes.map(c => {
    const s = findSubject(c);
    return s ? `${s.code} - ${s.name}` : c;
  }).join(' | ');
}

function adminRowValues(a) {
  return [a.email, a.password, a.name, a.role, a.role === 'doctor' ? subjectsToCell(a.subjects) : 'الكل', a.grade || 'الكل', a.createdAt || '', a.active ? 'نعم' : 'لا', a.mustChange ? 'نعم' : 'لا', a.lastLogin || ''];
}

async function writeAdminRow(a) {
  const { sheets, spreadsheetId } = await ensureSheets();
  if (a.row) {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `Admins!A${a.row}:J${a.row}`, valueInputOption: 'RAW', requestBody: { values: [adminRowValues(a)] }
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: 'Admins!A:J', valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [adminRowValues(a)] }
    });
  }
  adminsCache = { at: 0, list: null };
}

function effectiveRole(admin) {
  if (admin.email === sec.SUPER_ADMIN_EMAIL) return 'super_admin';
  if (admin.role === 'doctor' || admin.role === 'leader') return admin.role;
  return null; // لا يوجد سوبر أدمن غير المالك الأساسي
}

function publicUser(admin, mustChange) {
  const role = effectiveRole(admin);
  return {
    email: admin.email,
    name: admin.name || admin.email,
    role,
    subjects: role === 'doctor' ? admin.subjects.map(c => findSubject(c)).filter(Boolean) : [],
    grade: role === 'leader' ? admin.grade : 'الكل',
    mustChangePassword: !!mustChange
  };
}

const LOGIN_FAIL = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';

async function login(email, password, ip) {
  const cleanEmail = cleanText(email, 120).toLowerCase();
  const pw = String(password || '');
  if (!cleanEmail || !pw || pw.length > 200) throw new HttpError(400, 'يرجى إدخال البريد الإلكتروني وكلمة المرور');

  const ipLimit = sec.rateLimit(`login-ip:${ip}`, 30, 900);
  const userLimit = sec.rateLimit(`login-user:${cleanEmail}`, 8, 900);
  if (!ipLimit.allowed || !userLimit.allowed) {
    await audit(cleanEmail, '', 'حظر مؤقت لتسجيل الدخول', 'محاولات كثيرة خاطئة', ip);
    throw new HttpError(429, `محاولات كثيرة. حاول مرة أخرى بعد ${Math.ceil(Math.max(ipLimit.retryAfter, userLimit.retryAfter) / 60)} دقيقة`);
  }

  const admins = await readAdmins(true);
  let admin = admins.find(a => a.email === cleanEmail);
  const isPrimary = cleanEmail === sec.SUPER_ADMIN_EMAIL;
  const envKey = (process.env.ADMIN_SECRET_KEY || '').trim();
  let ok = false;
  let legacy = false;

  if (admin) {
    if (sec.isHashed(admin.password)) {
      ok = sec.verifyPassword(pw, admin.password);
    } else if (admin.password) {
      ok = sec.safeEqual(pw, admin.password);
      legacy = ok;
    }
    if (!ok && isPrimary && !sec.isHashed(admin.password) && envKey && sec.safeEqual(pw, envKey)) {
      ok = true;
      legacy = true;
    }
  } else if (isPrimary && envKey && sec.safeEqual(pw, envKey)) {
    ok = true;
    legacy = true;
    admin = { row: 0, email: cleanEmail, password: '', name: 'المشرف العام', role: 'super_admin', subjects: [], grade: 'الكل', createdAt: cairoNow().date, active: true, mustChange: true, lastLogin: '' };
  }

  if (!ok || !admin) {
    await audit(cleanEmail, '', 'فشل تسجيل الدخول', '', ip);
    throw new HttpError(401, LOGIN_FAIL);
  }
  if (!admin.active) {
    await audit(cleanEmail, admin.role, 'دخول حساب معطل', '', ip);
    throw new HttpError(403, 'تم تعطيل هذا الحساب من قِبل المشرف العام');
  }
  const role = effectiveRole(admin);
  if (!role) {
    await audit(cleanEmail, admin.role, 'دور غير صالح', admin.role, ip);
    throw new HttpError(403, 'هذا الحساب لا يملك صلاحية صالحة. تواصل مع المشرف العام');
  }

  // أي كلمة مرور قديمة غير مشفرة تُشفر فوراً ويُطلب تغييرها
  if (legacy) {
    admin.password = sec.hashPassword(pw);
    admin.mustChange = true;
  }
  if (role === 'super_admin') admin.role = 'super_admin';
  admin.lastLogin = cairoNow().stamp;
  await writeAdminRow(admin);
  sec.clearRateLimit(`login-user:${cleanEmail}`);
  await audit(cleanEmail, role, 'تسجيل دخول', legacy ? 'كلمة مرور قديمة - مطلوب تغييرها' : '', ip);

  const now = Math.floor(Date.now() / 1000);
  const token = sec.signToken({ e: admin.email, r: role, pv: sec.passwordFingerprint(admin.password), iat: now, exp: now + sec.SESSION_TTL_SEC });
  return { token, user: publicUser(admin, admin.mustChange) };
}

// التحقق من الجلسة في كل طلب: التوقيع + الحساب ما زال نشطاً + نفس الدور + نفس كلمة المرور
async function authenticate(req, allowedRoles, opts = {}) {
  const token = sec.parseCookies(req)[sec.SESSION_COOKIE];
  const payload = sec.verifyToken(token);
  if (!payload) throw new HttpError(401, 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى', { code: 'NO_SESSION' });
  const admins = await readAdmins();
  const admin = admins.find(a => a.email === payload.e);
  if (!admin || !admin.active) throw new HttpError(401, 'تم إيقاف هذا الحساب', { code: 'NO_SESSION' });
  const role = effectiveRole(admin);
  if (!role || role !== payload.r || sec.passwordFingerprint(admin.password) !== payload.pv) {
    throw new HttpError(401, 'تغيرت صلاحيات الحساب. يرجى تسجيل الدخول مرة أخرى', { code: 'NO_SESSION' });
  }
  if (admin.mustChange && !opts.allowMustChange) {
    throw new HttpError(403, 'يجب تغيير كلمة المرور أولاً', { code: 'MUST_CHANGE_PASSWORD' });
  }
  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new HttpError(403, 'غير مصرح لك بهذا الإجراء');
  }
  return { ...publicUser(admin, admin.mustChange), subjectCodes: role === 'doctor' ? admin.subjects : [], _admin: admin };
}

async function changeOwnPassword(user, currentPassword, newPassword, ip) {
  const admin = (await readAdmins(true)).find(a => a.email === user.email);
  if (!admin || !sec.verifyPassword(String(currentPassword || ''), admin.password)) {
    throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة');
  }
  const weak = sec.validatePasswordStrength(newPassword);
  if (weak) throw new HttpError(400, weak);
  if (sec.verifyPassword(newPassword, admin.password)) throw new HttpError(400, 'اختر كلمة مرور مختلفة عن الحالية');
  admin.password = sec.hashPassword(newPassword);
  admin.mustChange = false;
  await writeAdminRow(admin);
  await audit(user.email, user.role, 'تغيير كلمة المرور', '', ip);
  const now = Math.floor(Date.now() / 1000);
  const token = sec.signToken({ e: admin.email, r: effectiveRole(admin), pv: sec.passwordFingerprint(admin.password), iat: now, exp: now + sec.SESSION_TTL_SEC });
  return { token, user: publicUser(admin, false) };
}

async function listAdminsSafe() {
  const admins = await readAdmins(true);
  return admins.map(a => ({
    email: a.email,
    name: a.name,
    role: effectiveRole(a) || a.role,
    isPrimary: a.email === sec.SUPER_ADMIN_EMAIL,
    subjects: a.subjects.map(c => findSubject(c)).filter(Boolean),
    grade: a.grade,
    createdAt: a.createdAt,
    active: a.active,
    mustChange: a.mustChange,
    lastLogin: a.lastLogin,
    passwordSecured: sec.isHashed(a.password)
  }));
}

async function saveAdmin(actor, data, ip) {
  const email = cleanText(data.email, 120).toLowerCase();
  const name = cleanText(data.name, 80);
  const role = String(data.role || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'البريد الإلكتروني غير صالح');
  if (!name) throw new HttpError(400, 'الاسم مطلوب');
  if (email === sec.SUPER_ADMIN_EMAIL) throw new HttpError(400, 'لا يمكن تعديل حساب المشرف العام من هنا');
  if (role !== 'doctor' && role !== 'leader') throw new HttpError(400, 'الدور يجب أن يكون دكتور مادة أو ليدر دفعة');

  let subjects = [];
  let grade = 'الكل';
  if (role === 'doctor') {
    subjects = parseSubjectCodes((Array.isArray(data.subjects) ? data.subjects : [data.subjects]).join('|'));
    if (!subjects.length) throw new HttpError(400, 'يجب اختيار مادة واحدة على الأقل للدكتور');
  } else {
    grade = data.grade === 'الكل' || GRADES.includes(data.grade) ? data.grade : 'الكل';
  }

  const admins = await readAdmins(true);
  const existing = admins.find(a => a.email === email);
  let tempPassword = null;
  if (existing) {
    Object.assign(existing, { name, role, subjects, grade });
    await writeAdminRow(existing);
    await audit(actor.email, actor.role, 'تعديل صلاحيات', `${email} → ${role} ${role === 'doctor' ? subjects.join(',') : grade}`, ip);
    return { success: true, message: `تم تحديث صلاحيات (${name})` };
  }
  tempPassword = sec.generateTempPassword();
  await writeAdminRow({ row: 0, email, password: sec.hashPassword(tempPassword), name, role, subjects, grade, createdAt: cairoNow().date, active: true, mustChange: true, lastLogin: '' });
  await audit(actor.email, actor.role, 'إضافة حساب', `${email} (${role}) ${role === 'doctor' ? subjects.join(',') : grade}`, ip);
  return { success: true, message: `تم إضافة (${name}) بنجاح`, tempPassword };
}

async function setAdminActive(actor, email, active, ip) {
  const target = cleanText(email, 120).toLowerCase();
  if (target === sec.SUPER_ADMIN_EMAIL) throw new HttpError(400, 'لا يمكن تعطيل حساب المشرف العام');
  const admin = (await readAdmins(true)).find(a => a.email === target);
  if (!admin) throw new HttpError(404, 'الحساب غير موجود');
  admin.active = !!active;
  await writeAdminRow(admin);
  await audit(actor.email, actor.role, active ? 'تفعيل حساب' : 'تعطيل حساب', target, ip);
  return { success: true, message: active ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب وإنهاء جلساته' };
}

async function resetAdminPassword(actor, email, ip) {
  const target = cleanText(email, 120).toLowerCase();
  if (target === sec.SUPER_ADMIN_EMAIL) throw new HttpError(400, 'غيّر كلمة مرورك من زر "تغيير كلمة المرور"');
  const admin = (await readAdmins(true)).find(a => a.email === target);
  if (!admin) throw new HttpError(404, 'الحساب غير موجود');
  const tempPassword = sec.generateTempPassword();
  admin.password = sec.hashPassword(tempPassword);
  admin.mustChange = true;
  await writeAdminRow(admin);
  await audit(actor.email, actor.role, 'إعادة تعيين كلمة مرور', target, ip);
  return { success: true, message: 'تم إنشاء كلمة مرور مؤقتة جديدة', tempPassword };
}

// ==================== الطلاب ====================
let studentsCache = { at: 0, list: null };

async function readStudents(fresh = false) {
  if (!fresh && studentsCache.list && Date.now() - studentsCache.at < 30000) return studentsCache.list;
  const { sheets, spreadsheetId } = await ensureSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Students!A2:H' });
  const list = (res.data.values || []).map((r, i) => ({
    row: i + 2,
    createdAt: r[0] || '',
    name: String(r[1] || '').trim(),
    enrollType: String(r[2] || '').trim(),
    status: String(r[3] || '').trim(),
    grade: String(r[4] || '').trim(),
    code: String(r[5] || '').trim(),
    qr: String(r[6] || '').trim(),
    active: String(r[7] || 'نعم').trim() !== 'لا'
  })).filter(s => s.code);
  studentsCache = { at: Date.now(), list };
  return list;
}

async function findStudent(code) {
  let s = (await readStudents()).find(x => x.code === code);
  if (!s) s = (await readStudents(true)).find(x => x.code === code);
  return s || null;
}

function studentPublic(s) {
  return { code: s.code, name: s.name, enrollType: s.enrollType, status: s.status, grade: s.grade, active: s.active, createdAt: s.createdAt };
}

const NAME_RE = /^[؀-ۿa-zA-Z\s.'-]+$/;

async function registerStudent(payload, ip) {
  if (payload.website) throw new HttpError(400, 'طلب غير صالح'); // honeypot ضد البوتات
  const name = cleanText(payload.name, 80);
  const enrollType = cleanText(payload.enrollType);
  const status = cleanText(payload.status);
  const grade = cleanText(payload.grade);

  if (!name || name.split(' ').length < 3) throw new HttpError(400, 'يرجى كتابة الاسم ثلاثياً على الأقل');
  if (!NAME_RE.test(name)) throw new HttpError(400, 'الاسم يجب أن يحتوي على حروف فقط');
  if (!ENROLL_TYPES.includes(enrollType)) throw new HttpError(400, 'نوع القيد غير صالح');
  if (!STUDENT_STATUSES.includes(status)) throw new HttpError(400, 'الحالة غير صالحة');
  if (!GRADES.includes(grade)) throw new HttpError(400, 'الفرقة الدراسية غير صالحة');

  const limit = sec.rateLimit(`register:${ip}`, 6, 3600);
  if (!limit.allowed) throw new HttpError(429, 'تم تجاوز عدد مرات التسجيل المسموح من هذا الجهاز. حاول لاحقاً');

  const students = await readStudents(true);
  const norm = normalizeArabic(name);
  const dup = students.find(s => s.grade === grade && normalizeArabic(s.name) === norm);
  if (dup) {
    await audit('طالب', 'student', 'محاولة تسجيل مكرر', `${name} - ${grade}`, ip);
    throw new HttpError(409, 'هذا الاسم مسجل بالفعل في نفس الفرقة. إذا فقدت الكارنيه تواصل مع إدارة القسم لإعادة طباعته');
  }

  const gCode = `G${GRADES.indexOf(grade) + 1}`;
  const year = cairoNow().year;
  const maxSeq = students.reduce((m, s) => {
    const mm = s.code.match(/-(\d{4,6})$/);
    return mm ? Math.max(m, parseInt(mm[1], 10)) : m;
  }, 0);
  const { sheets, spreadsheetId } = await ensureSheets();

  let seq = maxSeq + 1;
  let code = `SOC-${year}-${gCode}-${String(seq).padStart(4, '0')}`;
  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Students!A:H',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[cairoNow().stamp, name, enrollType, status, grade, code, sec.buildQrPayload(code), 'نعم']] }
  });

  // حماية من تكرار الكود عند تسجيل طالبين في نفس اللحظة
  const fresh = await readStudents(true);
  const sameSeq = fresh.filter(s => (s.code.match(/-(\d{4,6})$/) || [])[1] === String(seq).padStart(4, '0'));
  if (sameSeq.length > 1) {
    const updatedRange = (appendRes.data.updates && appendRes.data.updates.updatedRange) || '';
    const rowMatch = updatedRange.match(/!A(\d+)/);
    const myRow = rowMatch ? parseInt(rowMatch[1], 10) : 0;
    if (myRow && sameSeq.some(s => s.row < myRow)) {
      seq = fresh.reduce((m, s) => Math.max(m, parseInt((s.code.match(/-(\d{4,6})$/) || [0, 0])[1], 10)), 0) + 1;
      code = `SOC-${year}-${gCode}-${String(seq).padStart(4, '0')}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `Students!F${myRow}:G${myRow}`, valueInputOption: 'RAW', requestBody: { values: [[code, sec.buildQrPayload(code)]] }
      });
      studentsCache = { at: 0, list: null };
    }
  }

  return { success: true, message: 'تم تسجيل الطالب بنجاح', studentCode: code, qrData: sec.buildQrPayload(code), name, grade, enrollType, status };
}

async function updateStudent(actor, code, updated, ip) {
  const s = (await readStudents(true)).find(x => x.code === String(code || '').trim());
  if (!s) throw new HttpError(404, 'لم يتم العثور على كود الطالب');
  const next = { ...s };
  if (updated.name !== undefined) {
    const name = cleanText(updated.name, 80);
    if (!name || !NAME_RE.test(name)) throw new HttpError(400, 'الاسم غير صالح');
    next.name = name;
  }
  if (updated.enrollType !== undefined) {
    if (!ENROLL_TYPES.includes(updated.enrollType)) throw new HttpError(400, 'نوع القيد غير صالح');
    next.enrollType = updated.enrollType;
  }
  if (updated.status !== undefined) {
    if (!STUDENT_STATUSES.includes(updated.status)) throw new HttpError(400, 'الحالة غير صالحة');
    next.status = updated.status;
  }
  if (updated.grade !== undefined) {
    if (!GRADES.includes(updated.grade) && updated.grade !== 'خريج') throw new HttpError(400, 'الفرقة غير صالحة');
    next.grade = updated.grade;
  }
  if (updated.active !== undefined) next.active = !!updated.active;

  const { sheets, spreadsheetId } = await ensureSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Students!B${s.row}:H${s.row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[next.name, next.enrollType, next.status, next.grade, s.code, sec.buildQrPayload(s.code), next.active ? 'نعم' : 'لا']] }
  });
  studentsCache = { at: 0, list: null };
  await audit(actor.email, actor.role, 'تعديل طالب', `${s.code}: ${JSON.stringify(updated)}`, ip);
  return { success: true, message: 'تم تحديث بيانات الطالب بنجاح' };
}

async function getStudentCard(code) {
  const s = await findStudent(String(code || '').trim());
  if (!s) throw new HttpError(404, 'الطالب غير موجود');
  return { success: true, student: studentPublic(s), qrData: sec.buildQrPayload(s.code) };
}

async function promoteStudents(actor, codes, targetGrade, ip) {
  if (!GRADES.includes(targetGrade) && targetGrade !== 'خريج') throw new HttpError(400, 'الفرقة المستهدفة غير صالحة');
  const set = new Set((codes || []).map(c => String(c).trim()));
  const students = await readStudents(true);
  const data = students.filter(s => set.has(s.code)).map(s => ({ range: `Students!E${s.row}`, values: [[targetGrade]] }));
  if (!data.length) throw new HttpError(400, 'لم يتم العثور على الطلاب المحددين');
  const { sheets, spreadsheetId } = await ensureSheets();
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data } });
  studentsCache = { at: 0, list: null };
  await audit(actor.email, actor.role, 'ترقية طلاب', `${data.length} طالب → ${targetGrade}`, ip);
  return { success: true, message: `تمت ترقية ${data.length} طالب بنجاح إلى ${targetGrade}` };
}

// ==================== صلاحيات المواد ====================
function allowedSubjectsFor(user) {
  if (user.role === 'super_admin') return SUBJECTS;
  if (user.role === 'doctor') return user.subjectCodes.map(c => findSubject(c)).filter(Boolean);
  if (user.role === 'leader') return user.grade && user.grade !== 'الكل' ? SUBJECTS.filter(s => s.grade === user.grade) : SUBJECTS;
  return [];
}

function canScanSubject(user, subject) {
  return allowedSubjectsFor(user).some(s => s.code === subject.code);
}

// ==================== رصد الحضور ====================
const inFlight = new Set();

async function recordAttendance(user, payload, ip) {
  const limit = sec.rateLimit(`scan:${user.email}`, 90, 60);
  if (!limit.allowed) throw new HttpError(429, 'عدد مسح كبير جداً في دقيقة واحدة. انتظر قليلاً');

  const subject = findSubject(payload.subjectCode);
  if (!subject) throw new HttpError(400, 'المادة غير موجودة في اللائحة');
  if (!canScanSubject(user, subject)) {
    await audit(user.email, user.role, 'محاولة رصد مادة غير مصرحة', subject.code, ip);
    throw new HttpError(403, 'غير مصرح لك برصد الحضور في هذه المادة');
  }

  const qr = sec.parseQrPayload(payload.qrData);
  if (!qr.ok) {
    if (qr.reason === 'forged') {
      await audit(user.email, user.role, '⚠️ كارنيه مزور', `${qr.code} - ${subject.code}`, ip);
      return { success: false, type: 'forged', message: 'تحذير: هذا الكارنيه مزور أو تم التلاعب به! لم يتم تسجيل الحضور.' };
    }
    if (qr.reason === 'legacy') {
      return { success: false, type: 'legacy', message: 'كارنيه بإصدار قديم غير مؤمَّن. يجب على الطالب استخراج كارنيه جديد من إدارة القسم.' };
    }
    return { success: false, type: 'invalid', message: 'هذا الكود ليس كارنيه حضور صالح لقسم علم الاجتماع' };
  }

  const student = await findStudent(qr.code);
  if (!student) return { success: false, type: 'not_found', message: 'الطالب غير مسجل في قاعدة البيانات' };
  if (!student.active) return { success: false, type: 'inactive', message: `حساب الطالب ${student.name} موقوف. راجع إدارة القسم.` };

  const otherGrade = student.grade !== subject.grade;
  if (otherGrade && !payload.confirmOtherGrade) {
    return {
      success: false,
      type: 'confirm_grade',
      needsConfirm: true,
      studentName: student.name,
      studentCode: student.code,
      studentGrade: student.grade,
      message: `الطالب ${student.name} مقيد في ${student.grade} بينما المادة تخص ${subject.grade}. هل تريد تسجيله (مادة تخلف/إعادة)؟`
    };
  }

  const now = cairoNow();
  const lockKey = `${student.code}|${subject.code}|${now.date}`;
  if (inFlight.has(lockKey)) return { success: false, type: 'duplicate', message: `جاري تسجيل ${student.name} بالفعل` };
  inFlight.add(lockKey);
  try {
    const tab = getSubjectSheetName(subject.code, subject.name);
    await ensureSubjectSheet(tab);
    const { sheets, spreadsheetId } = await ensureSheets();

    const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!B2:E` });
    const prev = (existing.data.values || []).find(r => String(r[0] || '').trim() === now.date && String(r[3] || '').trim() === student.code);
    if (prev) {
      return {
        success: false,
        type: 'duplicate',
        studentName: student.name,
        studentCode: student.code,
        message: `تم تسجيل حضور ${student.name} في (${subject.name}) اليوم مسبقاً الساعة ${prev[1] || ''}`
      };
    }

    const status = otherGrade ? STATUS_OTHER_GRADE : STATUS_PRESENT;
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: `'${tab}'!A:I`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[now.stamp, now.date, now.time, student.name, student.code, student.grade, subject.term, status, user.email]] }
    });
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: 'Attendance!A:K', valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[now.stamp, now.date, now.time, student.name, student.code, student.grade, subject.term, subject.code, subject.name, status, user.email]] }
    });

    return {
      success: true,
      type: 'success',
      message: `تم رصد حضور ${student.name}`,
      studentName: student.name,
      studentCode: student.code,
      studentGrade: student.grade,
      enrollType: student.enrollType,
      subjectName: subject.name,
      status,
      time: now.time
    };
  } finally {
    inFlight.delete(lockKey);
  }
}

// ==================== الإحصائيات ====================
function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

async function loadRecordsForSubjects(scope) {
  const { sheets, spreadsheetId } = await ensureSheets();
  const codes = new Set(scope.map(s => s.code.toLowerCase()));
  if (scope.length <= 4) {
    const ranges = scope.map(s => `'${getSubjectSheetName(s.code, s.name)}'!A2:I`);
    const existingRanges = ranges.filter((r, i) => knownTabs.has(getSubjectSheetName(scope[i].code, scope[i].name)));
    if (!existingRanges.length) return [];
    const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: existingRanges });
    const out = [];
    (res.data.valueRanges || []).forEach(vr => {
      const title = vr.range.split('!')[0].replace(/^'|'$/g, '');
      const subj = scope.find(s => getSubjectSheetName(s.code, s.name) === title);
      (vr.values || []).forEach(r => out.push({
        stamp: r[0] || '', date: String(r[1] || '').trim(), time: r[2] || '', studentName: r[3] || '', studentCode: String(r[4] || '').trim(),
        grade: r[5] || '', term: r[6] || '', status: r[7] || STATUS_PRESENT, recorder: r[8] || '',
        subjectCode: subj ? subj.code : '', subjectName: subj ? subj.name : ''
      }));
    });
    return out;
  }
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Attendance!A2:K' });
  return (res.data.values || []).map(r => {
    const subj = findSubject(r[7]);
    return {
      stamp: r[0] || '', date: String(r[1] || '').trim(), time: r[2] || '', studentName: r[3] || '', studentCode: String(r[4] || '').trim(),
      grade: r[5] || '', term: r[6] || '', status: r[9] || STATUS_PRESENT, recorder: r[10] || '',
      subjectCode: subj ? subj.code : String(r[7] || ''), subjectName: subj ? subj.name : String(r[8] || '')
    };
  }).filter(r => codes.has(String(r.subjectCode).toLowerCase()));
}

async function getAnalytics(user, q = {}) {
  let scope = allowedSubjectsFor(user);
  const fGrade = GRADES.includes(q.grade) ? q.grade : '';
  const fTerm = TERMS.includes(q.term) ? q.term : '';
  const fSubject = findSubject(q.subject);
  if (fGrade) scope = scope.filter(s => s.grade === fGrade);
  if (fTerm) scope = scope.filter(s => s.term === fTerm);
  if (fSubject) scope = scope.filter(s => s.code === fSubject.code);
  const from = isDate(q.from) ? q.from : '';
  const to = isDate(q.to) ? q.to : '';
  const threshold = Math.min(100, Math.max(1, parseInt(q.threshold, 10) || 75));

  await ensureSheets();
  const [allStudents, rawRecords] = await Promise.all([readStudents(), scope.length ? loadRecordsForSubjects(scope) : []]);
  const records = rawRecords.filter(r => r.studentCode && isDate(r.date) && (!from || r.date >= from) && (!to || r.date <= to));

  const scopeGrades = new Set(scope.map(s => s.grade));
  const students = allStudents.filter(s => s.active && scopeGrades.has(s.grade));
  const enrolledByGrade = {};
  students.forEach(s => { enrolledByGrade[s.grade] = (enrolledByGrade[s.grade] || 0) + 1; });

  // سجل واحد لكل (طالب، مادة، يوم)
  const seen = new Set();
  const unique = [];
  records.forEach(r => {
    const k = `${r.studentCode}|${r.subjectCode}|${r.date}`;
    if (!seen.has(k)) { seen.add(k); unique.push(r); }
  });

  const subjMap = {};
  scope.forEach(s => { subjMap[s.code] = { ...s, dates: new Set(), present: 0, presentOwnGrade: 0, otherGrade: 0, perDate: {} }; });
  const studentHits = {};
  unique.forEach(r => {
    const sm = subjMap[r.subjectCode];
    if (!sm) return;
    sm.dates.add(r.date);
    sm.present++;
    if (!sm.perDate[r.date]) sm.perDate[r.date] = [];
    sm.perDate[r.date].push(r.studentCode);
    if (String(r.grade).trim() === sm.grade) sm.presentOwnGrade++; else sm.otherGrade++;
    if (!studentHits[r.studentCode]) studentHits[r.studentCode] = { total: 0, bySubject: {}, last: '' };
    const h = studentHits[r.studentCode];
    h.total++;
    h.bySubject[r.subjectCode] = (h.bySubject[r.subjectCode] || 0) + 1;
    if (r.date > h.last) h.last = r.date;
  });

  const singleSubject = scope.length === 1;
  const subjects = Object.values(subjMap).map(sm => {
    const sessions = sm.dates.size;
    const enrolled = enrolledByGrade[sm.grade] || 0;
    const rate = sessions && enrolled ? Math.min(100, Math.round((sm.presentOwnGrade / (sessions * enrolled)) * 100)) : 0;
    return {
      code: sm.code, name: sm.name, grade: sm.grade, term: sm.term,
      sessions, enrolled, present: sm.present, otherGrade: sm.otherGrade,
      attendanceRate: rate, absenceRate: sessions && enrolled ? 100 - rate : 0
    };
  }).sort((a, b) => b.present - a.present || a.code.localeCompare(b.code));

  const sessions = [];
  Object.values(subjMap).forEach(sm => {
    const enrolled = enrolledByGrade[sm.grade] || 0;
    Object.keys(sm.perDate).forEach(date => {
      const codes = sm.perDate[date];
      const item = { subjectCode: sm.code, subjectName: sm.name, grade: sm.grade, date, present: codes.length, enrolled, absent: Math.max(0, enrolled - codes.length) };
      if (singleSubject) item.presentCodes = codes;
      sessions.push(item);
    });
  });
  sessions.sort((a, b) => b.date.localeCompare(a.date));

  const sessionsBySubject = {};
  subjects.forEach(s => { sessionsBySubject[s.code] = s.sessions; });
  let sumAtt = 0;
  let sumPossible = 0;
  const studentStats = students.map(s => {
    const possible = scope.filter(x => x.grade === s.grade).reduce((m, x) => m + (sessionsBySubject[x.code] || 0), 0);
    const h = studentHits[s.code] || { bySubject: {}, last: '' };
    const attended = scope.filter(x => x.grade === s.grade).reduce((m, x) => m + (h.bySubject[x.code] || 0), 0);
    sumAtt += attended;
    sumPossible += possible;
    const attRate = possible ? Math.round((attended / possible) * 100) : 0;
    return {
      code: s.code, name: s.name, grade: s.grade, enrollType: s.enrollType, status: s.status,
      attended, possible, absent: Math.max(0, possible - attended), attRate, lastSeen: h.last,
      atRisk: possible > 0 && attRate < threshold
    };
  }).sort((a, b) => a.attRate - b.attRate || a.name.localeCompare(b.name, 'ar'));

  const trendMap = {};
  unique.forEach(r => { trendMap[r.date] = (trendMap[r.date] || 0) + 1; });
  const trend = Object.keys(trendMap).sort().slice(-30).map(d => ({ date: d, count: trendMap[d] }));

  const overallRate = sumPossible ? Math.round((sumAtt / sumPossible) * 100) : 0;
  const recentRecords = records.slice().sort((a, b) => String(b.stamp).localeCompare(String(a.stamp))).slice(0, 1000);

  return {
    success: true,
    role: user.role,
    scope: scope.map(s => ({ code: s.code, name: s.name, grade: s.grade, term: s.term })),
    threshold,
    totals: {
      students: students.length,
      records: unique.length,
      sessions: sessions.length,
      attendanceRate: overallRate,
      absenceRate: sumPossible ? 100 - overallRate : 0,
      atRisk: studentStats.filter(s => s.atRisk).length,
      todayRecords: unique.filter(r => r.date === cairoNow().date).length
    },
    subjects,
    sessions: sessions.slice(0, 400),
    students: studentStats,
    trend,
    recentRecords
  };
}

// ==================== إعداد وتأمين الشيت ====================
async function setupAndSecure(actor, ip) {
  ensured = false;
  const { sheets, spreadsheetId } = await ensureSheets();
  const summary = { createdTabs: 0, protectedTabs: 0, hashedPasswords: 0, resignedCards: 0 };

  // 1) إنشاء تبويبات المواد الناقصة
  const missing = [];
  SUBJECTS.forEach(s => {
    const t = getSubjectSheetName(s.code, s.name);
    if (!knownTabs.has(t) && !missing.includes(t)) missing.push(t);
  });
  for (let i = 0; i < missing.length; i += 25) {
    const chunk = missing.slice(i, i + 25);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: chunk.map(title => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 }, tabColor: { red: 0.1, green: 0.25, blue: 0.65 } } } })) }
    });
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: chunk.map(t => ({ range: `'${t}'!A1:I1`, values: [SUBJECT_HEADER] })) }
    });
    chunk.forEach(t => knownTabs.add(t));
  }
  summary.createdTabs = missing.length;

  // 2) تنسيق العناوين + حماية كل التبويبات (التعديل فقط لحساب الخدمة ومالك الشيت)
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title),protectedRanges(protectedRangeId,description))' });
  const sa = getServiceAccountEmail();
  const requests = [];
  (meta.data.sheets || []).forEach(sh => {
    const { sheetId, title } = sh.properties;
    const isCore = !!HEADERS[title];
    const isSubject = SUBJECTS.some(s => getSubjectSheetName(s.code, s.name) === title);
    if (!isCore && !isSubject) return;
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.1, green: 0.14, blue: 0.49 }, horizontalAlignment: 'CENTER' } },
        fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)'
      }
    });
    requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 }, rightToLeft: true }, fields: 'gridProperties.frozenRowCount,rightToLeft' } });
    const hasOurs = (sh.protectedRanges || []).some(p => p.description === 'soc-attendance-lock');
    if (!hasOurs && sa) {
      requests.push({
        addProtectedRange: {
          protectedRange: { range: { sheetId }, description: 'soc-attendance-lock', warningOnly: false, editors: { users: [sa] } }
        }
      });
      summary.protectedTabs++;
    }
  });
  for (let i = 0; i < requests.length; i += 100) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: requests.slice(i, i + 100) } });
  }

  // 3) تشفير أي كلمات مرور قديمة مكتوبة كنص واضح
  const admins = await readAdmins(true);
  for (const a of admins) {
    if (a.password && !sec.isHashed(a.password)) {
      a.password = sec.hashPassword(a.password);
      a.mustChange = true;
      await writeAdminRow(a);
      summary.hashedPasswords++;
    }
  }

  // 4) إعادة توقيع بيانات QR لكل الطلاب
  const students = await readStudents(true);
  const data = students.filter(s => s.qr !== sec.buildQrPayload(s.code)).map(s => ({ range: `Students!G${s.row}`, values: [[sec.buildQrPayload(s.code)]] }));
  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data } });
    studentsCache = { at: 0, list: null };
  }
  summary.resignedCards = data.length;

  await audit(actor.email, actor.role, 'تهيئة وتأمين الشيت', JSON.stringify(summary), ip);
  return { success: true, message: 'تم فحص وتأمين الشيت بنجاح', serviceAccount: sa, ...summary };
}

module.exports = {
  HttpError,
  ENROLL_TYPES,
  STUDENT_STATUSES,
  ROLES,
  getSheetsClient,
  getSubjectSheetName,
  ensureSheets,
  ensureSubjectSheet,
  cairoNow,
  audit,
  readAudit,
  readAdmins,
  writeAdminRow,
  login,
  authenticate,
  changeOwnPassword,
  listAdminsSafe,
  saveAdmin,
  setAdminActive,
  resetAdminPassword,
  readStudents,
  studentPublic,
  registerStudent,
  updateStudent,
  getStudentCard,
  promoteStudents,
  allowedSubjectsFor,
  recordAttendance,
  getAnalytics,
  setupAndSecure
};
