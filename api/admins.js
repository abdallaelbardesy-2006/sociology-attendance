const { getAdminsListDirect, addOrUpdateAdminDirect, deleteAdminDirect } = require('./_sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const requesterEmail = (req.query.requesterEmail || req.body?.requesterEmail || '').trim().toLowerCase();
  const superAdminEmail = 'abdalla.elbardesy1@gmail.com';

  if (req.method === 'GET') {
    try {
      if (requesterEmail !== superAdminEmail && requesterEmail !== (process.env.ADMIN_EMAIL || '').toLowerCase().trim()) {
        return res.status(403).json({ success: false, message: 'غير مصرح لغير السوبر أدمن بإدارة المستخدمين' });
      }
      const admins = await getAdminsListDirect();
      return res.status(200).json({ success: true, admins });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      if (requesterEmail !== superAdminEmail && requesterEmail !== (process.env.ADMIN_EMAIL || '').toLowerCase().trim()) {
        return res.status(403).json({ success: false, message: 'غير مصرح لغير السوبر أدمن بإدارة المستخدمين' });
      }

      const { action, adminData, targetEmail } = req.body || {};

      if (action === 'add' || action === 'update') {
        const result = await addOrUpdateAdminDirect(adminData);
        return res.status(200).json(result);
      } else if (action === 'delete') {
        const result = await deleteAdminDirect(targetEmail);
        return res.status(200).json(result);
      } else {
        return res.status(400).json({ success: false, message: 'إجراء غير معروف' });
      }
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
