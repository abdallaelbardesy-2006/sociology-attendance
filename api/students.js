const { getSheetsInstance, ensureSheetsInitialized } = require('./_sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { sheets, spreadsheetId } = await getSheetsInstance();
    await ensureSheetsInitialized(sheets, spreadsheetId);

    // 1. تسجيل طالب جديد
    if (req.method === 'POST') {
      const { name, enrollType, status, grade } = req.body || {};
      if (!name || !enrollType || !status || !grade) {
        return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
      }

      const gradeMap = {
        'الفرقة الأولى': '1',
        'الفرقة الثانية': '2',
        'الفرقة الثالثة': '3',
        'الفرقة الرابعة': '4'
      };
      const gNum = gradeMap[grade] || '1';
      const year = new Date().getFullYear();

      // حساب الكود التسلسلي الفريد
      const current = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Students!A2:H'
      });
      const rows = current.data.values || [];
      const prefix = `SOC-${year}-${gNum}`;
      let maxSeq = 0;

      rows.forEach(r => {
        const c = String(r[5] || '');
        if (c.startsWith(prefix)) {
          const num = parseInt(c.split('-').pop(), 10);
          if (num > maxSeq) maxSeq = num;
        }
      });

      const studentCode = `${prefix}-${String(maxSeq + 1).padStart(4, '0')}`;
      const qrData = JSON.stringify({
        code: studentCode,
        name: name.trim(),
        grade: grade.trim(),
        enrollType: enrollType.trim(),
        status: status.trim()
      });

      const now = new Date().toISOString();
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Students!A:H',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[now, name.trim(), enrollType.trim(), status.trim(), grade.trim(), studentCode, qrData, 'نشط']]
        }
      });

      return res.status(200).json({ success: true, studentCode, qrData });
    }

    // 2. جلب قائمة الطلاب
    if (req.method === 'GET') {
      const { grade, search } = req.query || {};
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Students!A2:H'
      });
      const rows = result.data.values || [];

      let list = rows.map((r, i) => ({
        rowIndex: i + 2,
        name: r[1] || '',
        enrollType: r[2] || '',
        status: r[3] || '',
        grade: r[4] || '',
        code: r[5] || '',
        qrData: r[6] || '',
        active: r[7] || 'نشط'
      }));

      if (grade && grade.trim() !== '') {
        list = list.filter(s => s.grade === grade);
      }
      if (search && search.trim() !== '') {
        const q = search.trim().toLowerCase();
        list = list.filter(s => String(s.name).toLowerCase().includes(q) || String(s.code).toLowerCase().includes(q));
      }

      return res.status(200).json({ success: true, students: list });
    }

    // 3. تعديل بيانات طالب
    if (req.method === 'PUT') {
      const { code, name, enrollType, status, grade } = req.body || {};
      if (!code) return res.status(400).json({ success: false, error: 'كود الطالب مطلوب' });

      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Students!A2:H'
      });
      const rows = result.data.values || [];

      const idx = rows.findIndex(r => String(r[5] || '').trim() === String(code).trim());
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'الطالب غير موجود في قاعدة البيانات' });
      }

      const rowNum = idx + 2;
      const updatedQrData = JSON.stringify({
        code: code.trim(),
        name: (name || rows[idx][1]).trim(),
        grade: (grade || rows[idx][4]).trim(),
        enrollType: (enrollType || rows[idx][2]).trim(),
        status: (status || rows[idx][3]).trim()
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Students!B${rowNum}:G${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            name || rows[idx][1],
            enrollType || rows[idx][2],
            status || rows[idx][3],
            grade || rows[idx][4],
            code,
            updatedQrData
          ]]
        }
      });

      return res.status(200).json({ success: true, message: 'تم تحديث بيانات الطالب بنجاح' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
