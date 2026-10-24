const { route, HttpError } = require('./_lib/http');
const { registerStudent, lookupStudent, readStudents, studentPublic, updateStudent, getStudentCard, deleteStudents } = require('./_sheets');

// POST: تسجيل طالب أو استرجاع كارنيه (عام ومحمي بحدود) | GET و PUT و DELETE: للسوبر أدمن فقط
module.exports = route({
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  roles: req => (req.method === 'POST' ? null : ['super_admin'])
}, async ({ req, user, body, query, ip }) => {
  if (req.method === 'POST') return body.action === 'lookup' ? lookupStudent(body, ip) : registerStudent(body, ip);

  if (req.method === 'GET') {
    if (query.card) return getStudentCard(query.card);
    const students = (await readStudents(true)).map(studentPublic);
    return { success: true, students };
  }

  if (req.method === 'DELETE') {
    if (!Array.isArray(body.codes) || !body.codes.length || body.codes.length > 2000) throw new HttpError(400, 'يرجى تحديد الطلاب المراد حذفهم');
    return deleteStudents(user, body.codes, ip);
  }

  if (!body.code) throw new HttpError(400, 'كود الطالب مطلوب');
  const updated = {};
  ['name', 'enrollType', 'status', 'grade', 'active'].forEach(k => {
    if (body[k] !== undefined) updated[k] = body[k];
  });
  return updateStudent(user, body.code, updated, ip);
});
