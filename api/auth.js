const { getSheetsInstance, ensureSheetsInitialized } = require('./_sheets');

module.exports = async function handler(req, res) {
  // تفعيل CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

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
    const { sheets, spreadsheetId } = await getSheetsInstance();
    await ensureSheetsInitialized(sheets, spreadsheetId);

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Admins!A2:C'
    });

    const rows = result.data.values || [];
    const cleanEmail = String(email).trim().toLowerCase();

    // إذا كانت ورقة المشرفين فارغة، يتم تسجيل أول إيميل كـ super_admin تلقائياً
    if (rows.length === 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Admins!A:C',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[email.trim(), 'super_admin', new Date().toISOString()]]
        }
      });
      return res.status(200).json({ valid: true, email: email.trim(), role: 'super_admin' });
    }

    const matched = rows.find(r => String(r[0] || '').trim().toLowerCase() === cleanEmail);
    if (matched) {
      return res.status(200).json({ valid: true, email: matched[0], role: matched[1] || 'admin' });
    }

    return res.status(403).json({
      valid: false,
      message: 'هذا البريد الإلكتروني غير مضاف في قائمة المشرفين المصرح لهم بقاعدة البيانات'
    });
  } catch (error) {
    return res.status(500).json({ valid: false, message: 'خطأ بالسيرفر: ' + error.message });
  }
};
