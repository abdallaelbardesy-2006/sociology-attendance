const { route } = require('./_lib/http');
const { CURRICULUM, GRADES, TERMS } = require('./_lib/curriculum');
const { ENROLL_TYPES, STUDENT_STATUSES, getPublicSettings } = require('./_sheets');

// بيانات اللائحة العامة (غير سرية) + هل التسجيل مفتوح
module.exports = route({ methods: ['GET'] }, async ({ res }) => {
  let registrationOpen = true;
  try { registrationOpen = (await getPublicSettings()).registrationOpen; } catch (e) { /* الشيت غير متاح: نترك القرار للسيرفر عند التسجيل */ }
  res.setHeader('Cache-Control', 'public, max-age=30');
  return { success: true, curriculum: CURRICULUM, grades: GRADES, terms: TERMS, enrollTypes: ENROLL_TYPES, statuses: STUDENT_STATUSES, registrationOpen };
});
