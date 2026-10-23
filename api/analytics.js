const { route } = require('./_lib/http');
const { getAnalytics } = require('./_sheets');

// الإحصائيات: السوبر أدمن يرى الكل، والدكتور يرى مواده فقط (النطاق يُحدد على السيرفر من الجلسة)
module.exports = route({ methods: ['GET'], roles: ['super_admin', 'doctor'] }, async ({ user, query }) => {
  return getAnalytics(user, query);
});
