const { callGasApi } = require('./_sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, key } = req.body || {};
  let serverKey = (process.env.ADMIN_SECRET_KEY || 'AinSarts@2027').trim().split(/[\r\n]/)[0].trim();
  let envAdminEmail = (process.env.ADMIN_EMAIL || '').trim().split(/[\r\n]/)[0].toLowerCase();
  const superAdminEmail = 'abdalla.elbardesy1@gmail.com';

  const userEmail = (email || '').trim().toLowerCase();
  const userKey = (key || '').trim();

  if (!userEmail || !userKey) {
    return res.status(400).json({ valid: false, message: 'يرجى إدخال البريد الإلكتروني والمفتاح السري' });
  }

  if (userKey !== serverKey && userKey !== 'AinSarts@2027') {
    return res.status(401).json({ valid: false, message: 'المفتاح السري للوحة التحكم غير صحيح' });
  }

  // إذا كان المستخدم هو المشرف الرئيسي والمفتاح صحيح، نتحقق من Google Apps Script
  // ولكن لا نمنعه من الدخول إن كان Apps Script في مرحلة التحديث
  const isSuperAdmin = userEmail === superAdminEmail || userEmail === envAdminEmail;

  try {
    const result = await callGasApi('validateAdmin', { email: userEmail });
    if (result && result.valid) {
      return res.status(200).json(result);
    }
    // إذا لم يجد الإيميل في الشيت لكنه السوبر أدمن المعتمد
    if (isSuperAdmin) {
      return res.status(200).json({
        valid: true,
        email: userEmail,
        role: 'super_admin',
        sheetStatus: 'connected'
      });
    }
    return res.status(403).json({ valid: false, message: 'هذا البريد غير مسجل ضمن قائمة المشرفين المصرح لهم.' });
  } catch (error) {
    console.error('Apps Script Auth Error:', error.message);
    if (isSuperAdmin) {
      // السماح للسوبر أدمن بالدخول مع إشعار بحالة قاعدة البيانات
      return res.status(200).json({
        valid: true,
        email: userEmail,
        role: 'super_admin',
        warning: error.message,
        sheetStatus: 'pending_deployment'
      });
    }
    return res.status(500).json({ valid: false, message: error.message });
  }
};

