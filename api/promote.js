const { getSheetsInstance, ensureSheetsInitialized } = require('./_sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { studentCodes, targetGrade } = req.body || {};

    if (!Array.isArray(studentCodes) || studentCodes.length === 0 || !targetGrade) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد الطلاب والفرقة المستهدفة للترقية' });
    }

    const { sheets, spreadsheetId } = await getSheetsInstance();
    await ensureSheetsInitialized(sheets, spreadsheetId);

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Students!A2:H'
    });
    const rows = result.data.values || [];

    const dataUpdates = [];
    rows.forEach((r, idx) => {
      const code = String(r[5] || '').trim();
      if (studentCodes.includes(code)) {
        const rowNum = idx + 2;
        const updatedQr = JSON.stringify({
          code: code,
          name: r[1] || '',
          grade: targetGrade.trim(),
          enrollType: r[2] || '',
          status: r[3] || ''
        });

        // تحديث الفرقة في العمود E وبيانات الـ QR في العمود G
        dataUpdates.push({
          range: `Students!E${rowNum}:G${rowNum}`,
          values: [[targetGrade.trim(), code, updatedQr]]
        });
      }
    });

    if (dataUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: dataUpdates
        }
      });
    }

    return res.status(200).json({
      success: true,
      count: dataUpdates.length,
      message: `تمت ترقية ${dataUpdates.length} طالب إلى ${targetGrade} بنجاح`
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
