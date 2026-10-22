const { callGasApi } = require('./_sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, key } = req.body || {};
  const serverKey = process.env.ADMIN_SECRET_KEY || 'SOC_ADMIN_2026_SECRET';

  if (!email || !key) {
    return res.status(400).json({ valid: false, message: 'يرجى إدخال البريد الإلكتروني والمفتاح السري' });
  }

  if (key.trim() !== serverKey.trim()) {
    return res.status(401).json({ valid: false, message: 'المفتاح السري للوحة التحكم غير صحيح' });
  }

  try {
    const result = await callGasApi('validateAdmin', { email: email.trim() });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ valid: false, message: error.message });
  }
};
