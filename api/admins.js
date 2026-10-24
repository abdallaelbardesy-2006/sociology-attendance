const { route, HttpError } = require('./_lib/http');
const { listAdminsSafe, saveAdmin, setAdminActive, resetAdminPassword, readAudit, getPublicSettings, setRegistrationOpen, setSwitch } = require('./_sheets');

// إدارة الحسابات وسجل العمليات والإعدادات: للمشرفين العامين (حسابات المشرفين العامين للمالك فقط)
module.exports = route({ methods: ['GET', 'POST'], roles: ['super_admin'] }, async ({ req, user, body, query, ip }) => {
  if (req.method === 'GET') {
    if (query.audit) return { success: true, logs: await readAudit(400) };
    if (query.settings) return { success: true, settings: await getPublicSettings() };
    return { success: true, admins: await listAdminsSafe() };
  }

  switch (body.action) {
    case 'save': return saveAdmin(user, body.adminData || {}, ip);
    case 'disable': return setAdminActive(user, body.email, false, ip);
    case 'enable': return setAdminActive(user, body.email, true, ip);
    case 'resetPassword': return resetAdminPassword(user, body.email, ip);
    case 'setRegistration': return setRegistrationOpen(user, body.open === true, ip);
    case 'setSetting': return setSwitch(user, String(body.key || ''), body.open === true, ip);
    default: throw new HttpError(400, 'إجراء غير معروف');
  }
});
