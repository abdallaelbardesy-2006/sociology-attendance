const { getSheetsInstance, ensureSheetsInitialized } = require('./_sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { qrData, selectedGrade, selectedTerm, subjectCode, subjectName, adminEmail } = req.body || {};

    if (!qrData || !selectedGrade || !selectedTerm || !subjectCode) {
      return res.status(400).json({ success: false, message: 'بيانات الحضور غير مكتملة', type: 'error' });
    }

    let qrInfo;
    try {
      qrInfo = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch (e) {
      return res.status(400).json({ success: false, message: 'كود الـ QR غير صالح أو غير معتمد', type: 'error' });
    }

    if (!qrInfo.code) {
      return res.status(400).json({ success: false, message: 'كود الطالب غير موجود في الـ QR', type: 'error' });
    }

    const { sheets, spreadsheetId } = await getSheetsInstance();
    await ensureSheetsInitialized(sheets, spreadsheetId);

    // 1. التحقق من وجود الطالب في ورقة الطلاب وحالته
    const stdData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Students!A2:H'
    });
    const students = stdData.data.values || [];
    const student = students.find(r => String(r[5] || '').trim() === String(qrInfo.code).trim());

    if (!student) {
      return res.status(404).json({ success: false, message: 'الطالب غير مقيد في قاعدة بيانات الكلية!', type: 'error' });
    }
    if (student[7] === 'غير نشط') {
      return res.status(403).json({ success: false, message: 'حساب وقيد الطالب معطل حالياً!', type: 'error' });
    }
    if (String(student[4] || '').trim() !== String(selectedGrade).trim()) {
      return res.status(400).json({
        success: false,
        message: `تنبيه: الطالب مقيد في (${student[4]}) وليس في (${selectedGrade})`,
        type: 'warning'
      });
    }

    // 2. فحص منع التكرار (نفس الطالب في نفس المادة في نفس اليوم)
    const attData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Attendance!A2:K'
    });
    const logs = attData.data.values || [];

    // التوقيت الحالي بتوقيت القاهرة
    const now = new Date();
    const formatterDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });
    const today = formatterDate.format(now); // yyyy-mm-dd
    const timeStr = new Intl.DateTimeFormat('ar-EG', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(now);

    const isDuplicate = logs.some(l => {
      const logDate = String(l[1] || '').trim();
      const logCode = String(l[4] || '').trim();
      const logSubj = String(l[7] || '').trim();
      return logCode === String(qrInfo.code).trim() && logSubj === String(subjectCode).trim() && logDate === today;
    });

    if (isDuplicate) {
      return res.status(400).json({
        success: false,
        message: `تنبيه: الطالب (${student[1]}) مسجل مسبقاً في هذه المادة اليوم!`,
        type: 'duplicate'
      });
    }

    // 3. إضافة الحضور في شيت Attendance
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Attendance!A:K',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          now.toISOString(),
          today,
          timeStr,
          student[1],
          qrInfo.code,
          selectedGrade,
          selectedTerm,
          subjectCode,
          subjectName || '',
          'حاضر',
          adminEmail || 'Admin'
        ]]
      }
    });

    return res.status(200).json({
      success: true,
      message: `تم تسجيل حضور: ${student[1]}`,
      studentName: student[1],
      studentCode: qrInfo.code,
      time: timeStr
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطأ بالسيرفر: ' + error.message, type: 'error' });
  }
};
