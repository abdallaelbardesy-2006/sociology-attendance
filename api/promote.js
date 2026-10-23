const { route, HttpError } = require('./_lib/http');
const { promoteStudents } = require('./_sheets');

module.exports = route({ methods: ['POST'], roles: ['super_admin'] }, async ({ user, body, ip }) => {
  const { studentCodes, targetGrade } = body;
  if (!Array.isArray(studentCodes) || studentCodes.length === 0 || studentCodes.length > 2000 || !targetGrade) {
    throw new HttpError(400, 'يرجى تحديد الطلاب والفرقة المستهدفة للترقية');
  }
  return promoteStudents(user, studentCodes, targetGrade, ip);
});
