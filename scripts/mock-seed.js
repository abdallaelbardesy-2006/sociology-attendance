// بيانات وهمية للاختبار المحلي فقط
const { buildQrPayload } = require('../api/_lib/security');
const { CURRICULUM } = require('../api/_lib/curriculum');

module.exports = function seed() {
  const first = ['أحمد', 'محمد', 'سارة', 'مريم', 'يوسف', 'نور', 'عمر', 'هدى', 'خالد', 'منة', 'علي', 'ياسمين', 'مصطفى', 'فاطمة', 'كريم'];
  const mid = ['محمود', 'حسن', 'إبراهيم', 'عبدالله', 'سعيد', 'مصطفى', 'جمال', 'عادل'];
  const last = ['السيد', 'عبدالرحمن', 'الشافعي', 'منصور', 'سالم', 'فؤاد', 'رمضان'];
  const grades = Object.keys(CURRICULUM);
  const students = [['التوقيت', 'الاسم بالكامل', 'نوع القيد', 'الحالة', 'الفرقة الدراسية', 'كود الطالب', 'بيانات QR', 'نشط']];
  let seq = 0;
  grades.forEach((g, gi) => {
    const n = [36, 24, 18, 12][gi];
    for (let i = 0; i < n; i++) {
      seq++;
      const code = `SOC-2026-G${gi + 1}-${String(seq).padStart(4, '0')}`;
      const name = `${first[(seq * 7) % first.length]} ${mid[(seq * 3) % mid.length]} ${last[seq % last.length]} ${mid[(seq * 5 + 1) % mid.length]}`;
      students.push(['2026-10-01 10:00:00', name, i % 5 === 0 ? 'انتساب' : 'انتظام', i % 11 === 0 ? 'حالات خاصة' : 'عام', g, code, buildQrPayload(code), seq === 5 ? 'لا' : 'نعم']);
    }
  });

  const attendance = [['التوقيت', 'التاريخ', 'الساعة', 'اسم الطالب', 'كود الطالب', 'الفرقة الدراسية', 'الترم', 'كود المادة', 'اسم المادة', 'حالة الحضور', 'إيميل الدكتور/الأدمن']];
  const subjectTabs = {};
  const dates = ['2026-10-05', '2026-10-12', '2026-10-19'];
  const plan = [['الفرقة الأولى', ['soc111', 'soc112', 'IIT110']], ['الفرقة الثانية', ['soc211']]];
  plan.forEach(([g, codes]) => {
    const roster = students.slice(1).filter(s => s[4] === g);
    codes.forEach((code, ci) => {
      const subj = CURRICULUM[g]['ترم أول'].find(s => s.code === code);
      const tab = `${subj.code} - ${subj.name}`;
      subjectTabs[tab] = [['التوقيت', 'التاريخ', 'الساعة', 'اسم الطالب', 'كود الطالب', 'الفرقة الدراسية', 'الترم', 'حالة الحضور', 'إيميل الدكتور/الأدمن']];
      dates.forEach((d, di) => {
        roster.forEach((s, si) => {
          if ((si + di + ci) % 4 === 0 || (si % 9 === 0 && di > 0)) return; // غياب
          const row = [`${d} 10:${String(si % 60).padStart(2, '0')}:00`, d, '10:15 ص', s[1], s[5], g, 'ترم أول'];
          subjectTabs[tab].push([...row, 'حاضر', 'doctor@test.edu']);
          attendance.push([...row, subj.code, subj.name, 'حاضر', 'doctor@test.edu']);
        });
      });
    });
  });

  return {
    Students: students,
    Attendance: attendance,
    Admins: [
      ['الإيميل', 'كلمة المرور', 'الاسم', 'الدور', 'المادة المخصصة', 'الفرقة المخصصة', 'تاريخ الإضافة', 'نشط'],
      ['abdalla.elbardesy1@gmail.com', 'Old-Leaked-Pass1', 'عبدالله البرديسي', 'super_admin', 'الكل', 'الكل', '2026-10-01', 'نعم'],
      ['doctor@test.edu', 'DocLegacy123', 'د. سامي فوزي', 'doctor', 'soc111 - مدخل إلى علم الاجتماع', 'الفرقة الأولى', '2026-10-01', 'نعم'],
      ['leader@test.edu', 'LeadLegacy123', 'ليدر أولى', 'leader', 'الكل', 'الفرقة الأولى', '2026-10-01', 'نعم'],
      ['fake.super@test.edu', 'FakeSuper123', 'سوبر مزيف', 'super_admin', 'الكل', 'الكل', '2026-10-01', 'نعم']
    ],
    ...subjectTabs
  };
};
