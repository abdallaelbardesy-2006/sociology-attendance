const { validateAdminDirect } = require('./_sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, key } = req.body || {};
  const userEmail = (email || '').trim().toLowerCase();
  const userKey = (key || '').trim();

  if (!userEmail || !userKey) {
    return res.status(400).json({ valid: false, message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
  }

  try {
    const adminUser = await validateAdminDirect(userEmail, userKey);
    return res.status(200).json(adminUser);
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ valid: false, message: error.message });
  }
};
