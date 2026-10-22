const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function getSheetsInstance() {
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  const privateKey = rawKey.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!privateKey || !clientEmail || !spreadsheetId) {
    throw new Error('متغيرات البيئة الخاصة بـ Google Sheets غير مكتملة (تأكد من إعداد GOOGLE_SHEET_ID و GOOGLE_SERVICE_ACCOUNT_EMAIL و GOOGLE_PRIVATE_KEY في Vercel).');
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: SCOPES
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, spreadsheetId };
}

// تهيئة أوراق العمل تلقائياً إذا كانت جديدة
async function ensureSheetsInitialized(sheets, spreadsheetId) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetTitles = (meta.data.sheets || []).map(s => s.properties.title);

    const requiredSheets = ['Students', 'Admins', 'Attendance'];
    const addRequests = [];

    requiredSheets.forEach(title => {
      if (!sheetTitles.includes(title)) {
        addRequests.push({ addSheet: { properties: { title } } });
      }
    });

    if (addRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: addRequests }
      });
    }

    // فحص وإضافة العناوين لكل ورقة إن كانت فارغة
    const [stRes, adRes, attRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Students!A1:H1' }).catch(() => ({ data: {} })),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Admins!A1:C1' }).catch(() => ({ data: {} })),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Attendance!A1:K1' }).catch(() => ({ data: {} }))
    ]);

    const headerUpdates = [];
    if (!stRes.data.values || stRes.data.values.length === 0) {
      headerUpdates.push({
        range: 'Students!A1:H1',
        values: [['التوقيت', 'الاسم بالكامل', 'نوع القيد', 'الحالة', 'الفرقة الدراسية', 'كود الطالب', 'بيانات QR', 'نشط']]
      });
    }
    if (!adRes.data.values || adRes.data.values.length === 0) {
      headerUpdates.push({
        range: 'Admins!A1:C1',
        values: [['الإيميل', 'الدور', 'تاريخ الإضافة']]
      });
    }
    if (!attRes.data.values || attRes.data.values.length === 0) {
      headerUpdates.push({
        range: 'Attendance!A1:K1',
        values: [['التوقيت', 'التاريخ', 'الساعة', 'اسم الطالب', 'كود الطالب', 'الفرقة الدراسية', 'الترم', 'كود المادة', 'اسم المادة', 'حالة الحضور', 'إيميل الدكتور/الأدمن']]
      });
    }

    if (headerUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: headerUpdates
        }
      });
    }
  } catch (err) {
    console.warn('تنبيه أثناء تهيئة الأوراق التلقائية:', err.message);
  }
}

module.exports = { getSheetsInstance, ensureSheetsInitialized };
