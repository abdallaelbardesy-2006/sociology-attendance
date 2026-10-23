const { route } = require('./_lib/http');
const { recordAttendance } = require('./_sheets');

// رصد الحضور: لأي حساب مسؤول، مع التحقق من صلاحية المادة على السيرفر
module.exports = route({ methods: ['POST'], roles: ['super_admin', 'doctor', 'leader'] }, async ({ user, body, ip }) => {
  return recordAttendance(user, {
    qrData: body.qrData,
    subjectCode: body.subjectCode,
    confirmOtherGrade: body.confirmOtherGrade === true
  }, ip);
});
