const { route, HttpError } = require('./_lib/http');
const { login, authenticate, changeOwnPassword, audit } = require('./_sheets');
const { sessionCookie, SESSION_TTL_SEC } = require('./_lib/security');

// GET: بيانات الجلسة الحالية | POST {action: login | logout | changePassword}
module.exports = route({ methods: ['GET', 'POST'] }, async ({ req, res, body, ip }) => {
  if (req.method === 'GET') {
    const user = await authenticate(req, null, { allowMustChange: true });
    const { _admin, subjectCodes, ...safe } = user;
    return { success: true, user: safe };
  }

  const action = body.action;
  if (action === 'login') {
    const { token, user } = await login(body.email, body.password, ip);
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL_SEC));
    return { success: true, user };
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    try {
      const user = await authenticate(req, null, { allowMustChange: true });
      await audit(user.email, user.role, 'تسجيل خروج', '', ip);
    } catch (e) { /* جلسة منتهية بالفعل */ }
    return { success: true };
  }

  if (action === 'changePassword') {
    const user = await authenticate(req, null, { allowMustChange: true });
    const { token, user: updated } = await changeOwnPassword(user, body.currentPassword, body.newPassword, ip);
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL_SEC));
    return { success: true, message: 'تم تغيير كلمة المرور بنجاح', user: updated };
  }

  throw new HttpError(400, 'إجراء غير معروف');
});
