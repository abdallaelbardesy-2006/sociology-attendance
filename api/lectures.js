const { route, HttpError } = require('./_lib/http');
const { getLectures, startLecture, finishLecture, reopenLecture } = require('./_sheets');

// المحاضرات 1 → 15 لكل مادة: لأي حساب مصرح له بالمسح في المادة (إعادة فتح محاضرة اليوم متاحة للجميع، والأقدم للمشرف العام)
module.exports = route({ methods: ['GET', 'POST'], roles: ['super_admin', 'doctor', 'leader'] }, async ({ req, user, body, query, ip }) => {
  if (req.method === 'GET') return getLectures(user, query.subject);

  const no = parseInt(body.lectureNo, 10);
  if (!(no >= 1 && no <= 15)) throw new HttpError(400, 'رقم المحاضرة غير صالح');
  switch (body.action) {
    case 'start': return startLecture(user, body.subjectCode, no, body.force === true, ip);
    case 'finish': return finishLecture(user, body.subjectCode, no, ip);
    case 'reopen': return reopenLecture(user, body.subjectCode, no, ip);
    default: throw new HttpError(400, 'إجراء غير معروف');
  }
});
