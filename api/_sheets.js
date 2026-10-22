const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// الاتصال عبر Google Apps Script Web App (الأسهل والأسرع والمباشر مع شيت جوجل)
async function callGasApi(action, payload = {}) {
  const gasUrl = (process.env.GOOGLE_APPS_SCRIPT_URL || '').trim();
  if (!gasUrl) {
    throw new Error('متغير GOOGLE_APPS_SCRIPT_URL غير موجود في إعدادات البيئة.');
  }

  const response = await fetch(gasUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, payload })
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('استجابة غير صالحة من Google Apps Script (تأكد من نشر نسخة جديدة New Version تحتوي على doPost): ' + text.substring(0, 150));
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
