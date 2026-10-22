const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// الاتصال عبر Google Apps Script Web App
async function callGasApi(action, payload = {}) {
  const gasUrl = (process.env.GOOGLE_APPS_SCRIPT_URL || '').trim();
  if (!gasUrl) {
    throw new Error('متغير GOOGLE_APPS_SCRIPT_URL غير محدد في Vercel.');
  }

  let response;
  try {
    response = await fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, payload })
    });
  } catch (netErr) {
    throw new Error('فشل الاتصال برابط Google Apps Script: ' + netErr.message);
  }

  const text = await response.text();

  // فحص الأخطاء الشائعة من جوجل لتقديم رسالة واضحة للمستخدم
  if (response.status === 404 || text.includes('الملف الذي طلبته غير موجود') || text.includes('not found')) {
    throw new Error('رابط الـ Web App مقيد الصلاحيات أو غير موجود. تأكد من ضبط Who has access: Anyone.');
  }

  if (text.includes('doPost') || text.includes('تعذر العثور على دالة النص البرمجي')) {
    throw new Error('نسخة الكود المنشورة في Apps Script قديمة أو لم يتم حفظها. في Apps Script: احفظ الكود واضغط Deploy -> Manage deployments -> تعديل القلم -> اختر New version واضغط Deploy.');
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    // تنظيف نص الخطأ إن كان HTML لاستخراج الرسالة الفعلية
    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error('استجابة غير متوقعة من جوجل: ' + cleanText.substring(0, 180));
  }
}

// بديل الاتصال المباشر عبر Google Service Account
async function getSheetsInstance() {
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  const privateKey = rawKey.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!privateKey || !clientEmail || !spreadsheetId) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: SCOPES
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, spreadsheetId };
}

module.exports = { callGasApi, getSheetsInstance };
