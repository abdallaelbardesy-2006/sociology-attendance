const { route, HttpError } = require('./_lib/http');
const { registerStudent, readStudents, studentPublic, updateStudent, getStudentCard } = require('./_sheets');

// POST: تسجيل طالب (عام ومحمي بحدود) | GET و PUT: للسوبر أدمن فقط
module.exports = route({
  methods: ['GET', 'POST', 'PUT'],
  roles: req => (req.method === 'POST' ? null : ['super_admin'])
}, async ({ req, user, body, query, ip }) => {
  if (req.method === 'POST') return registerStudent(body, ip);

  if (req.method === 'GET') {
    if (query.card) return getStudentCard(query.card);
    const students = (await readStudents(true)).map(studentPublic);
    return { success: true, students };
  }

  if (!body.code) throw new HttpError(400, 'كود الطالب مطلوب');
  const updated = {};
  ['name', 'enrollType', 'status', 'grade', 'active'].forEach(k => {
    if (body[k] !== undefined) updated[k] = body[k];
  });
  return updateStudent(user, body.code, updated, ip);
});
