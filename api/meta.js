const { route } = require('./_lib/http');
const { CURRICULUM, GRADES, TERMS } = require('./_lib/curriculum');
const { ENROLL_TYPES, STUDENT_STATUSES } = require('./_sheets');

// بيانات اللائحة العامة (غير سرية) لاستخدامها في الواجهات
module.exports = route({ methods: ['GET'] }, async ({ res }) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  return { success: true, curriculum: CURRICULUM, grades: GRADES, terms: TERMS, enrollTypes: ENROLL_TYPES, statuses: STUDENT_STATUSES };
});
