const { route } = require('./_lib/http');
const { setupAndSecure } = require('./_sheets');

// تهيئة الشيت وتنسيقه وحمايته وتشفير كلمات المرور القديمة: للسوبر أدمن فقط
module.exports = route({ methods: ['POST'], roles: ['super_admin'] }, async ({ user, ip }) => {
  return setupAndSecure(user, ip);
});
