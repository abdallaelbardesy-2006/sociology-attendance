// اختبارات أمان وصلاحيات شاملة ضد سيرفر التطوير ببيانات وهمية
// شغّل أولاً: node scripts/dev-server.js --mock   ثم: node scripts/test-api.js
process.env.QR_SECRET = process.env.QR_SECRET || 'dev-qr-secret-0123456789abcdef0123456789abcd';
const { buildQrPayload } = require('../api/_lib/security');

const BASE = process.env.BASE || 'http://localhost:3000';
let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓', name); } else { failed++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
}

function client() {
  let cookie = '';
  return async function call(method, path, body, headers = {}) {
    const h = { Origin: BASE, ...headers };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = h['Content-Type'] || 'application/json';
    const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    const sc = res.headers.get('set-cookie');
    if (sc) {
      const m = sc.match(/soc_sess=([^;]*)/);
      if (m) cookie = m[1] ? `soc_sess=${m[1]}` : '';
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, data, setCookie: sc };
  };
}

(async () => {
  const anon = client();
  console.log('\n[1] حماية الـ API بدون تسجيل دخول');
  for (const [m, p, b] of [['GET', '/api/analytics'], ['GET', '/api/analytics?userRole=super_admin'], ['GET', '/api/students'], ['GET', '/api/admins?requesterEmail=abdalla.elbardesy1@gmail.com'],
    ['POST', '/api/attendance', { qrData: 'x', subjectCode: 'soc111' }], ['POST', '/api/promote', { studentCodes: ['a'], targetGrade: 'الفرقة الثانية' }], ['POST', '/api/setup', {}],
    ['PUT', '/api/students', { code: 'SOC-2026-G1-0001', name: 'hack' }]]) {
    const r = await anon(m, p, b);
    check(`${m} ${p} → 401`, r.status === 401, r);
  }
  const forgedCookie = await anon('GET', '/api/analytics', undefined, { Cookie: 'soc_sess=eyJlIjoiYWJkYWxsYS5lbGJhcmRlc3kxQGdtYWlsLmNvbSIsInIiOiJzdXBlcl9hZG1pbiJ9.fake' });
  check('كوكي مزور → 401', forgedCookie.status === 401);
  const meta = await anon('GET', '/api/meta');
  check('meta عام', meta.status === 200 && meta.data.grades.length === 4);

  console.log('\n[2] CSRF والصيغة');
  const evil = await anon('POST', '/api/auth', { action: 'login', email: 'a@b.c', password: 'x' }, { Origin: 'https://evil.example' });
  check('Origin خارجي → 403', evil.status === 403, evil);
  const form = await anon('POST', '/api/auth', 'action=login', { 'Content-Type': 'application/x-www-form-urlencoded' });
  check('Content-Type غير JSON → 415', form.status === 415, form);

  console.log('\n[3] دخول السوبر أدمن وكلمة المرور القديمة');
  const sa = client();
  const tmp0 = client();
  let r = await sa('POST', '/api/auth', { action: 'login', email: 'abdalla.elbardesy1@gmail.com', password: 'wrong-pass' });
  check('كلمة مرور خاطئة → 401', r.status === 401);
  r = await tmp0('POST', '/api/auth', { action: 'login', email: 'doctor@test.edu', password: 'Bootstrap-Admin-2026' });
  check('المفتاح الرئيسي لم يعد يفتح حسابات الآخرين', r.status === 401, r);
  r = await sa('POST', '/api/auth', { action: 'login', email: 'abdalla.elbardesy1@gmail.com', password: 'Old-Leaked-Pass1' });
  check('دخول بكلمة قديمة يطلب التغيير', r.status === 200 && r.data.user.mustChangePassword === true && r.data.user.role === 'super_admin', r);
  check('الكوكي HttpOnly Secure SameSite=Strict', /HttpOnly/.test(r.setCookie) && /Secure/.test(r.setCookie) && /SameSite=Strict/.test(r.setCookie));
  r = await sa('GET', '/api/analytics');
  check('قبل تغيير كلمة المرور → 403 MUST_CHANGE', r.status === 403 && r.data.code === 'MUST_CHANGE_PASSWORD', r);
  r = await sa('POST', '/api/auth', { action: 'changePassword', currentPassword: 'Old-Leaked-Pass1', newPassword: 'short' });
  check('كلمة مرور ضعيفة مرفوضة', r.status === 400);
  r = await sa('POST', '/api/auth', { action: 'changePassword', currentPassword: 'Old-Leaked-Pass1', newPassword: 'SuperStrong2026x' });
  check('تغيير كلمة المرور', r.status === 200 && r.data.user.mustChangePassword === false, r);
  r = await sa('GET', '/api/analytics');
  check('الإحصائيات بعد التغيير → 200', r.status === 200 && r.data.scope.length === 78, r.status);
  check('أرقام حقيقية: محاضرات وطلاب', r.data.totals.sessions === 12 && r.data.totals.students === 89, r.data.totals);
  const tmp = client();
  r = await tmp('POST', '/api/auth', { action: 'login', email: 'abdalla.elbardesy1@gmail.com', password: 'Old-Leaked-Pass1' });
  check('الكلمة القديمة لا تعمل بعد التغيير', r.status === 401);
  r = await tmp('POST', '/api/auth', { action: 'login', email: 'fake.super@test.edu', password: 'FakeSuper123' });
  check('أي سوبر أدمن غير المالك يُرفض', r.status === 403, r);

  console.log('\n[4] إدارة الحسابات');
  r = await sa('GET', '/api/admins');
  check('قائمة الحسابات بدون كلمات مرور', r.status === 200 && r.data.admins.every(a => a.password === undefined), r.data.admins && r.data.admins[0]);
  r = await sa('POST', '/api/admins', { action: 'save', adminData: { role: 'super_admin', email: 'x@y.com', name: 'x' } });
  check('لا يمكن إنشاء سوبر أدمن آخر', r.status === 400);
  r = await sa('POST', '/api/admins', { action: 'save', adminData: { role: 'doctor', email: 'dr.new@test.edu', name: 'د. جديد', subjects: ['soc112', 'soc121'] } });
  check('إضافة دكتور بمادتين + كلمة مؤقتة', r.status === 200 && /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(r.data.tempPassword), r);
  const drTemp = r.data.tempPassword;

  console.log('\n[5] صلاحيات الدكتور');
  const dr = client();
  r = await dr('POST', '/api/auth', { action: 'login', email: 'dr.new@test.edu', password: drTemp });
  check('دخول الدكتور بكلمة مؤقتة يطلب التغيير', r.status === 200 && r.data.user.mustChangePassword, r);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0001'), subjectCode: 'soc112' });
  check('لا مسح قبل تغيير كلمة المرور', r.status === 403);
  r = await dr('POST', '/api/auth', { action: 'changePassword', currentPassword: drTemp, newPassword: 'DoctorPass2026' });
  check('الدكتور غيّر كلمة المرور', r.status === 200);
  r = await dr('GET', '/api/analytics?subject=soc211&grade=' + encodeURIComponent('الفرقة الثانية'));
  check('الدكتور لا يرى مادة غير مادته حتى لو طلبها', r.status === 200 && r.data.scope.length === 0, r.data.scope);
  r = await dr('GET', '/api/analytics?userRole=super_admin');
  check('الدكتور يرى مواده فقط', r.status === 200 && r.data.scope.map(s => s.code).sort().join() === 'soc112,soc121', r.data.scope);
  check('سجلات الدكتور كلها من مواده', r.data.recentRecords.every(x => ['soc112', 'soc121'].includes(x.subjectCode)) && r.data.recentRecords.length > 0);
  r = await dr('GET', '/api/analytics?subject=soc112');
  check('مادة واحدة: كشف الحاضرين بالأكواد', r.data.sessions.length === 3 && Array.isArray(r.data.sessions[0].presentCodes));
  r = await dr('GET', '/api/students');
  check('الدكتور لا يصل لبيانات الطلاب', r.status === 403);
  r = await dr('GET', '/api/admins');
  check('الدكتور لا يصل لإدارة الحسابات', r.status === 403);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0001'), subjectCode: 'soc111' });
  check('الدكتور لا يرصد مادة غير مسندة له', r.status === 403);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0001'), subjectCode: 'soc112' });
  check('الدكتور يرصد مادته', r.status === 200 && r.data.success, r.data);

  console.log('\n[6] مكافحة الغش في الحضور');
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0001'), subjectCode: 'soc112' });
  check('منع تكرار الحضور في نفس اليوم', r.data.type === 'duplicate', r.data);
  r = await dr('POST', '/api/attendance', { qrData: 'SOC3|SOC-2026-G1-0002|AAAAAAAAAAAAAAAAAAAAAA', subjectCode: 'soc112' });
  check('كارنيه مزور يُرفض', r.data.type === 'forged', r.data);
  r = await dr('POST', '/api/attendance', { qrData: JSON.stringify({ code: 'SOC-2026-G1-0002', name: 'x', v: 2 }), subjectCode: 'soc112' });
  check('كارنيه قديم غير موقع يُرفض', r.data.type === 'legacy', r.data);
  r = await dr('POST', '/api/attendance', { qrData: 'SOC-2026-G1-0002', subjectCode: 'soc112' });
  check('كتابة الكود يدوياً تُرفض', r.data.type === 'invalid', r.data);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0005'), subjectCode: 'soc112' });
  check('طالب موقوف يُرفض', r.data.type === 'inactive', r.data);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-9999'), subjectCode: 'soc112' });
  check('طالب غير مسجل يُرفض', r.data.type === 'not_found', r.data);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G2-0040'), subjectCode: 'soc112' });
  check('طالب من فرقة أخرى يحتاج تأكيد', r.data.type === 'confirm_grade', r.data);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G2-0040'), subjectCode: 'soc112', confirmOtherGrade: true });
  check('بعد التأكيد يُسجل كـ (من فرقة أخرى)', r.data.success && /فرقة أخرى/.test(r.data.status), r.data);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0003'), subjectCode: 'soc112', subjectName: 'اسم مزيف', selectedGrade: 'الفرقة الرابعة' });
  check('اسم المادة والفرقة من السيرفر لا من المتصفح', r.data.success && r.data.subjectName === 'علم النفس الاجتماعي', r.data);

  console.log('\n[7] صلاحيات الليدر');
  const ld = client();
  r = await ld('POST', '/api/auth', { action: 'login', email: 'leader@test.edu', password: 'LeadLegacy123' });
  check('دخول الليدر (كلمة قديمة → تغيير)', r.status === 200 && r.data.user.role === 'leader' && r.data.user.mustChangePassword);
  await ld('POST', '/api/auth', { action: 'changePassword', currentPassword: 'LeadLegacy123', newPassword: 'LeaderPass2026' });
  r = await ld('GET', '/api/analytics');
  check('الليدر لا يرى الإحصائيات', r.status === 403);
  r = await ld('GET', '/api/students');
  check('الليدر لا يرى الطلاب', r.status === 403);
  r = await ld('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0006'), subjectCode: 'soc118' });
  check('الليدر يرصد أي مادة في فرقته', r.data.success, r.data);
  r = await ld('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G2-0040'), subjectCode: 'soc211' });
  check('الليدر لا يرصد خارج فرقته', r.status === 403);

  console.log('\n[8] تعطيل الحساب ينهي الجلسة فوراً');
  r = await sa('POST', '/api/admins', { action: 'disable', email: 'dr.new@test.edu' });
  check('تعطيل الدكتور', r.status === 200);
  r = await dr('GET', '/api/analytics');
  check('جلسة الدكتور المعطل انتهت', r.status === 401, r);
  r = await sa('POST', '/api/admins', { action: 'resetPassword', email: 'leader@test.edu' });
  check('إعادة تعيين كلمة مرور الليدر', r.status === 200 && r.data.tempPassword);
  r = await ld('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0007'), subjectCode: 'soc118' });
  check('جلسة الليدر القديمة بطلت بعد إعادة التعيين', r.status === 401);

  console.log('\n[9] تسجيل الطلاب');
  const pub = client();
  r = await pub('POST', '/api/students', { name: 'طالب تجربة جديد تماما', grade: 'الفرقة الثالثة', enrollType: 'انتظام', status: 'عام' });
  check('تسجيل طالب جديد بكارنيه موقع', r.status === 200 && /^SOC3\|SOC-\d{4}-G3-\d{4}\|/.test(r.data.qrData), r.data);
  const newQr = r.data.qrData;
  r = await pub('POST', '/api/students', { name: 'طالب  تجربه جديد تمامأ', grade: 'الفرقة الثالثة', enrollType: 'انتظام', status: 'عام' });
  check('منع التسجيل المكرر (مع تطبيع الحروف)', r.status === 409, r);
  r = await pub('POST', '/api/students', { name: '=HYPERLINK("http://evil") اسم اسم', grade: 'الفرقة الأولى', enrollType: 'انتظام', status: 'عام' });
  check('رفض حقن المعادلات', r.status === 400);
  r = await pub('POST', '/api/students', { name: '<img src=x onerror=alert(1)> a b', grade: 'الفرقة الأولى', enrollType: 'انتظام', status: 'عام' });
  check('رفض HTML/XSS في الاسم', r.status === 400);
  r = await pub('POST', '/api/students', { name: 'اسم صحيح ثلاثي', grade: 'الفرقة العاشرة', enrollType: 'انتظام', status: 'عام' });
  check('رفض فرقة غير صالحة', r.status === 400);
  r = await pub('POST', '/api/students', { name: 'بوت سبام هنا', grade: 'الفرقة الأولى', enrollType: 'انتظام', status: 'عام', website: 'spam' });
  check('Honeypot يوقف البوتات', r.status === 400);
  r = await sa('POST', '/api/attendance', { qrData: newQr, subjectCode: 'soc311' });
  check('الطالب الجديد يُرصد فوراً', r.data.success, r.data);
  let limited = false;
  for (let i = 0; i < 6; i++) {
    const x = await pub('POST', '/api/students', { name: `طالب رقم ${'أبجدهوز'[i]} اختبار`, grade: 'الفرقة الرابعة', enrollType: 'انتظام', status: 'عام' });
    if (x.status === 429) limited = true;
  }
  check('حد أقصى للتسجيل من نفس الجهاز', limited);

  console.log('\n[10] محاولات التخمين');
  const bf = client();
  let blocked = false;
  for (let i = 0; i < 10; i++) {
    const x = await bf('POST', '/api/auth', { action: 'login', email: 'abdalla.elbardesy1@gmail.com', password: 'guess' + i });
    if (x.status === 429) blocked = true;
  }
  check('حظر مؤقت بعد محاولات كثيرة', blocked);

  console.log('\n[11] الطلاب، الترقية، التأمين، السجل');
  r = await sa('GET', '/api/students');
  check('السوبر أدمن يرى الطلاب بدون بيانات QR', r.status === 200 && r.data.students.length > 80 && r.data.students.every(s => s.qr === undefined));
  r = await sa('GET', '/api/students?card=SOC-2026-G1-0001');
  check('طباعة كارنيه طالب', r.status === 200 && r.data.qrData === buildQrPayload('SOC-2026-G1-0001'));
  r = await sa('PUT', '/api/students', { code: 'SOC-2026-G1-0002', grade: 'الفرقة التاسعة' });
  check('تعديل بقيمة غير صالحة مرفوض', r.status === 400);
  r = await sa('PUT', '/api/students', { code: 'SOC-2026-G1-0002', active: false });
  check('إيقاف طالب', r.status === 200);
  r = await sa('POST', '/api/promote', { studentCodes: ['SOC-2026-G4-0080'], targetGrade: 'خريج' });
  check('ترقية للتخرج', r.status === 200, r.data);
  r = await sa('POST', '/api/setup', {});
  check('تأمين الشيت: قفل التبويبات وتشفير كلمات المرور', r.status === 200 && r.data.protectedTabs >= 80 && r.data.hashedPasswords >= 1 && r.data.createdTabs > 70, r.data);
  r = await sa('POST', '/api/setup', {});
  check('التأمين آمن للتكرار', r.status === 200 && r.data.protectedTabs === 0 && r.data.createdTabs === 0, r.data);
  r = await sa('GET', '/api/admins?audit=1');
  check('سجل العمليات يسجل الكارنيه المزور ومحاولات الدخول', r.status === 200 && r.data.logs.some(l => /مزور/.test(l.action)) && r.data.logs.some(l => /فشل/.test(l.action)));
  r = await sa('POST', '/api/auth', { action: 'logout' });
  check('تسجيل الخروج يمسح الكوكي', /Max-Age=0/.test(r.setCookie || ''));
  r = await sa('GET', '/api/analytics');
  check('بعد الخروج → 401', r.status === 401);

  console.log(`\nالنتيجة: ${passed} نجح، ${failed} فشل`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
