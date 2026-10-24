// اختبارات أمان وصلاحيات شاملة ضد سيرفر التطوير ببيانات وهمية
// شغّل أولاً: npm run dev   ثم: npm test
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
      const m = sc.match(/__Host-soc_sess=([^;]*)/);
      if (m) cookie = m[1] ? `__Host-soc_sess=${m[1]}` : '';
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
    ['PUT', '/api/students', { code: 'SOC-2026-G1-0001', name: 'hack' }], ['DELETE', '/api/students', { codes: ['SOC-2026-G1-0001'] }]]) {
    const r = await anon(m, p, b);
    check(`${m} ${p} → 401`, r.status === 401, r);
  }
  const forgedCookie = await anon('GET', '/api/analytics', undefined, { Cookie: '__Host-soc_sess=eyJlIjoiYWJkYWxsYS5lbGJhcmRlc3kxQGdtYWlsLmNvbSIsInIiOiJzdXBlcl9hZG1pbiJ9.fake' });
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
  check('الكوكي __Host- HttpOnly Secure SameSite=Strict', /^__Host-/.test(r.setCookie) && /HttpOnly/.test(r.setCookie) && /Secure/.test(r.setCookie) && /SameSite=Strict/.test(r.setCookie));
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
  r = await sa('POST', '/api/admins', { action: 'save', adminData: { role: 'owner', email: 'x@y.com', name: 'x' } });
  check('دور غير معروف مرفوض', r.status === 400);
  r = await sa('POST', '/api/admins', { action: 'save', adminData: { role: 'doctor', email: 'dr.new@test.edu', name: 'د. جديد', subjects: ['soc112', 'soc121'] } });
  check('إضافة دكتور بمادتين + كلمة مؤقتة', r.status === 200 && /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(r.data.tempPassword), r);
  const drTemp = r.data.tempPassword;

  console.log('\n[4-ب] مشرف عام إضافي');
  r = await sa('POST', '/api/admins', { action: 'save', adminData: { role: 'super_admin', email: 'second.admin@test.edu', name: 'مشرف ثاني' } });
  check('المالك يضيف مشرف عام', r.status === 200 && r.data.tempPassword, r.data);
  const sa2Temp = r.data.tempPassword;
  const sa2 = client();
  r = await sa2('POST', '/api/auth', { action: 'login', email: 'second.admin@test.edu', password: sa2Temp });
  check('المشرف الثاني يدخل كمشرف عام وليس مالكاً', r.status === 200 && r.data.user.role === 'super_admin' && r.data.user.isPrimary === false, r.data);
  await sa2('POST', '/api/auth', { action: 'changePassword', currentPassword: sa2Temp, newPassword: 'SecondAdmin2026' });
  r = await sa2('GET', '/api/analytics');
  check('المشرف الثاني يرى كل الإحصائيات', r.status === 200 && r.data.scope.length === 78);
  r = await sa2('POST', '/api/admins', { action: 'save', adminData: { role: 'leader', email: 'leader2@test.edu', name: 'ليدر تاني', grade: 'الفرقة الثانية' } });
  check('المشرف الثاني يضيف ليدر', r.status === 200);
  r = await sa2('POST', '/api/admins', { action: 'save', adminData: { role: 'super_admin', email: 'third.admin@test.edu', name: 'مشرف ثالث' } });
  check('المشرف الثاني لا يضيف مشرف عام', r.status === 403, r.data);
  r = await sa2('POST', '/api/admins', { action: 'disable', email: 'abdalla.elbardesy1@gmail.com' });
  check('المشرف الثاني لا يعطل المالك', r.status === 400);
  r = await sa2('POST', '/api/admins', { action: 'resetPassword', email: 'second.admin@test.edu' });
  check('المشرف الثاني لا يدير حسابات المشرفين', r.status === 403);
  r = await sa('GET', '/api/admins');
  check('السوبر أدمن المزور في الشيت (بدون توقيع) يظهر كغير صالح', r.data.admins.find(a => a.email === 'fake.super@test.edu').role === 'invalid');
  r = await sa('POST', '/api/admins', { action: 'save', adminData: { role: 'doctor', email: 'xss@test.edu', name: '<img src=x onerror=alert(1)>', subjects: ['soc111'] } });
  check('رفض HTML في اسم الحساب', r.status === 400);
  r = await sa('POST', '/api/admins', { action: 'disable', email: 'second.admin@test.edu' });
  check('المالك يعطل المشرف الثاني', r.status === 200);
  r = await sa2('GET', '/api/analytics');
  check('جلسة المشرف الثاني انتهت فوراً', r.status === 401);
  r = await sa('POST', '/api/admins', { action: 'enable', email: 'second.admin@test.edu' });

  console.log('\n[4-ج] قفل الحساب بعد محاولات خاطئة (يعمل على كل السيرفرات)');
  const lk = client();
  for (let i = 0; i < 5; i++) await lk('POST', '/api/auth', { action: 'login', email: 'leader2@test.edu', password: 'wrong' + i });
  r = await lk('POST', '/api/auth', { action: 'login', email: 'leader2@test.edu', password: 'wrong-final' });
  check('المحاولة السادسة تقفل الحساب', r.status === 429 && /قفل/.test(r.data.message), r.data);
  r = await sa('GET', '/api/admins');
  check('الحساب يظهر مقفلاً مؤقتاً للمشرف', r.data.admins.find(a => a.email === 'leader2@test.edu').locked === true);
  r = await sa('POST', '/api/admins', { action: 'resetPassword', email: 'leader2@test.edu' });
  const l2 = r.data.tempPassword;
  r = await lk('POST', '/api/auth', { action: 'login', email: 'leader2@test.edu', password: l2 });
  check('إعادة التعيين تفك القفل', r.status === 200, r.data);

  console.log('\n[4-د] غلق التسجيل');
  r = await sa('POST', '/api/admins', { action: 'setRegistration', open: false });
  check('غلق تسجيل الطلاب', r.status === 200 && r.data.registrationOpen === false);
  r = await anon('GET', '/api/meta');
  check('الصفحة العامة تعرف أن التسجيل مغلق', r.data.registrationOpen === false);
  r = await anon('POST', '/api/students', { name: 'طالب بعد الغلق هنا', grade: 'الفرقة الأولى', enrollType: 'انتظام', status: 'عام' });
  check('التسجيل مرفوض وهو مغلق', r.status === 403, r.data);
  r = await anon('POST', '/api/admins', { action: 'setRegistration', open: true });
  check('غير المسجل لا يغير الإعدادات', r.status === 401);
  r = await sa('POST', '/api/admins', { action: 'setRegistration', open: true });
  check('إعادة فتح التسجيل', r.data.registrationOpen === true);

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
  r = await dr('DELETE', '/api/students', { codes: ['SOC-2026-G1-0001'] });
  check('الدكتور لا يستطيع حذف طلاب', r.status === 403);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0001'), subjectCode: 'soc111' });
  check('الدكتور لا يرصد مادة غير مسندة له', r.status === 403);
  console.log('\n[5-ب] المحاضرات 1 → 15 بالترتيب');
  const lec = (c, b) => c('POST', '/api/lectures', b);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0001'), subjectCode: 'soc112' });
  check('لا رصد بدون محاضرة مفتوحة', r.data.type === 'no_lecture', r.data);
  r = await dr('GET', '/api/lectures?subject=soc112');
  check('15 محاضرة والحالية رقم 1 والباقي مقفول', r.data.lectures.length === 15 && r.data.current === 1 && r.data.lectures[0].state === 'next' && r.data.lectures[1].state === 'locked', r.data);
  r = await dr('GET', '/api/lectures?subject=soc111');
  check('الدكتور لا يرى محاضرات مادة غير مادته', r.status === 403);
  r = await lec(dr, { action: 'start', subjectCode: 'soc112', lectureNo: 2 });
  check('لا يمكن بدء المحاضرة 2 قبل 1', r.status === 400, r.data);
  r = await lec(dr, { action: 'start', subjectCode: 'soc112', lectureNo: 1 });
  check('بدء المحاضرة 1', r.status === 200, r.data);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0001'), subjectCode: 'soc112' });
  check('الدكتور يرصد مادته', r.status === 200 && r.data.success && r.data.lectureNo === 1, r.data);

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

  console.log('\n[6-ب] إنهاء المحاضرة وقفل التالية');
  r = await lec(dr, { action: 'finish', subjectCode: 'soc112', lectureNo: 1 });
  check('إنهاء المحاضرة 1 مع عدد الحضور', r.status === 200 && r.data.count === 3, r.data);
  r = await dr('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0004'), subjectCode: 'soc112' });
  check('لا رصد بعد إنهاء المحاضرة', r.data.type === 'no_lecture', r.data);
  r = await lec(dr, { action: 'start', subjectCode: 'soc112', lectureNo: 2 });
  check('المحاضرة 2 لا تفتح في نفس اليوم', r.status === 409 && r.data.code === 'SAME_DAY' && r.data.canForce === false, r.data);
  r = await lec(dr, { action: 'reopen', subjectCode: 'soc112', lectureNo: 1 });
  check('الدكتور لا يعيد فتح محاضرة', r.status === 403);
  r = await sa('GET', '/api/lectures?subject=soc112');
  check('الحالة: 1 منتهية و 2 التالية ومقفولة اليوم', r.data.lectures[0].state === 'done' && r.data.current === 2 && r.data.nextBlockedToday === true, r.data);
  r = await lec(sa, { action: 'reopen', subjectCode: 'soc112', lectureNo: 1 });
  check('المشرف العام يعيد فتح المحاضرة 1', r.status === 200, r.data);
  r = await lec(sa, { action: 'finish', subjectCode: 'soc112', lectureNo: 1 });
  r = await lec(sa, { action: 'start', subjectCode: 'soc112', lectureNo: 2, force: true });
  check('المشرف العام يفتح المحاضرة 2 استثنائياً', r.status === 200, r.data);
  r = await sa('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G1-0001'), subjectCode: 'soc112' });
  check('نفس الطالب في نفس اليوم مرفوض حتى في محاضرة أخرى', r.data.type === 'duplicate', r.data);
  r = await lec(sa, { action: 'finish', subjectCode: 'soc112', lectureNo: 2 });
  check('إنهاء المحاضرة 2', r.status === 200);

  console.log('\n[7] صلاحيات الليدر');
  const ld = client();
  r = await ld('POST', '/api/auth', { action: 'login', email: 'leader@test.edu', password: 'LeadLegacy123' });
  check('دخول الليدر (كلمة قديمة → تغيير)', r.status === 200 && r.data.user.role === 'leader' && r.data.user.mustChangePassword);
  await ld('POST', '/api/auth', { action: 'changePassword', currentPassword: 'LeadLegacy123', newPassword: 'LeaderPass2026' });
  r = await ld('GET', '/api/analytics');
  check('الليدر لا يرى الإحصائيات', r.status === 403);
  r = await ld('GET', '/api/students');
  check('الليدر لا يرى الطلاب', r.status === 403);
  r = await ld('DELETE', '/api/students', { codes: ['SOC-2026-G1-0001'] });
  check('الليدر لا يستطيع حذف طلاب', r.status === 403);
  r = await lec(ld, { action: 'start', subjectCode: 'soc211', lectureNo: 1 });
  check('الليدر لا يفتح محاضرة خارج فرقته', r.status === 403);
  r = await lec(ld, { action: 'start', subjectCode: 'soc118', lectureNo: 1 });
  check('الليدر يفتح المحاضرة', r.status === 200, r.data);
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
  const newCode = r.data.studentCode;
  const look = b => pub('POST', '/api/students', { action: 'lookup', ...b });
  r = await look({ name: 'طالب تجربة جديد تماما', grade: 'الفرقة الثالثة' });
  check('استرجاع الكارنيه بالاسم والفرقة', r.status === 200 && r.data.studentCode === newCode && r.data.qrData === newQr, r.data);
  r = await look({ name: 'طالب  تجربه جديد تمامأ', grade: 'الفرقة الثالثة' });
  check('الاسترجاع يتسامح مع الهمزات والتاء المربوطة', r.status === 200 && r.data.studentCode === newCode, r.data);
  r = await look({ name: 'طالب تجربة جديد', grade: 'الفرقة الثالثة' });
  check('جزء من الاسم لا يكفي (لا بحث جزئي)', r.status === 404, r.data);
  r = await look({ name: 'طالب تجربة جديد تماما', grade: 'الفرقة الأولى' });
  check('فرقة خاطئة لا تُظهر الكارنيه', r.status === 404, r.data);
  r = await look({ name: '<script>alert(1)</script> a b', grade: 'الفرقة الأولى' });
  check('رفض HTML في البحث', r.status === 400);
  r = await sa('POST', '/api/admins', { action: 'setSetting', key: 'lookupOpen', open: false });
  check('المشرف يوقف الاسترجاع', r.status === 200 && r.data.open === false, r.data);
  r = await look({ name: 'طالب تجربة جديد تماما', grade: 'الفرقة الثالثة' });
  check('الاسترجاع مرفوض وهو متوقف', r.status === 403, r.data);
  r = await anon('GET', '/api/meta');
  check('الصفحة العامة تعرف أن الاسترجاع متوقف', r.data.lookupOpen === false);
  r = await sa('POST', '/api/admins', { action: 'setSetting', key: 'hacked', open: false });
  check('إعداد غير معروف مرفوض', r.status === 400);
  await sa('POST', '/api/admins', { action: 'setSetting', key: 'lookupOpen', open: true });
  let lookLimited = false;
  for (let k = 0; k < 8; k++) { const x = await look({ name: 'اسم غير موجود اطلاقا', grade: 'الفرقة الثانية' }); if (x.status === 429) lookLimited = true; }
  check('حد أقصى لمحاولات البحث من نفس الجهاز', lookLimited);
  r = await sa('GET', '/api/admins?audit=1');
  check('عمليات الاسترجاع مسجلة في السجل', r.data.logs.some(l => l.action === 'استرجاع كارنيه' && l.details.includes(newCode)));
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
  await lec(sa, { action: 'start', subjectCode: 'soc311', lectureNo: 1 });
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
  r = await sa('GET', '/api/students');
  const before = r.data.students.length;
  r = await sa('DELETE', '/api/students', { codes: ['SOC-2026-G3-0070'] });
  check('حذف طالب واحد', r.status === 200 && r.data.deleted === 1, r.data);
  r = await sa('DELETE', '/api/students', { codes: ['SOC-2026-G3-0071', 'SOC-2026-G3-0073', 'SOC-2026-G3-0075'] });
  check('حذف مجموعة طلاب محددين', r.status === 200 && r.data.deleted === 3, r.data);
  r = await sa('GET', '/api/students');
  const codesLeft = r.data.students.map(x => x.code);
  check('اختفوا من الشيت والباقي سليم', r.data.students.length === before - 4 && !codesLeft.includes('SOC-2026-G3-0073') && codesLeft.includes('SOC-2026-G3-0072') && codesLeft.includes('SOC-2026-G3-0074'), r.data.students.length);
  r = await sa('POST', '/api/attendance', { qrData: buildQrPayload('SOC-2026-G3-0071'), subjectCode: 'soc311' });
  check('كارنيه الطالب المحذوف لم يعد يُقبل', r.data.type === 'not_found', r.data);
  r = await sa('DELETE', '/api/students', { codes: [] });
  check('حذف بدون تحديد مرفوض', r.status === 400);
  r = await sa('POST', '/api/setup', {});
  check('تأمين الشيت: قفل التبويبات وتشفير كلمات المرور', r.status === 200 && r.data.protectedTabs >= 80 && r.data.hashedPasswords >= 1 && r.data.createdTabs > 70 && r.data.lectureRows > 1100 && r.data.numberedRecords > 200, r.data);
  r = await sa('POST', '/api/setup', {});
  check('التأمين آمن للتكرار', r.status === 200 && r.data.protectedTabs === 0 && r.data.createdTabs === 0 && r.data.lectureRows === 0 && r.data.numberedRecords === 0, r.data);
  r = await sa('GET', '/api/lectures?subject=soc111');
  check('ترقيم السجلات القديمة: soc111 المحاضرات 1-3 منتهية والحالية 4', r.data.lectures.slice(0, 3).every(l => l.state === 'done' && l.count > 0) && r.data.current === 4, r.data.current);
  r = await sa('GET', '/api/analytics?subject=soc111');
  check('الإحصائيات بأرقام المحاضرات', r.data.sessions.map(x => x.lectureNo).sort().join() === '1,2,3' && r.data.subjects[0].lecturesDone === 3, r.data.sessions.map(x => x.lectureNo));
  r = await sa('GET', '/api/admins?audit=1');
  check('سجل العمليات يسجل الكارنيه المزور ومحاولات الدخول', r.status === 200 && r.data.logs.some(l => /مزور/.test(l.action)) && r.data.logs.some(l => /فشل/.test(l.action)));
  r = await sa('POST', '/api/auth', { action: 'logout' });
  check('تسجيل الخروج يمسح الكوكي', /Max-Age=0/.test(r.setCookie || ''));
  r = await sa('GET', '/api/analytics');
  check('بعد الخروج → 401', r.status === 401);

  console.log(`\nالنتيجة: ${passed} نجح، ${failed} فشل`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
