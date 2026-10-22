const { getSheetsInstance, ensureSheetsInitialized } = require('./_sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { sheets, spreadsheetId } = await getSheetsInstance();
    await ensureSheetsInitialized(sheets, spreadsheetId);

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetsList = (meta.data.sheets || []).map(s => s.properties.title);

    return res.status(200).json({
      success: true,
      message: 'تم فحص وتهيئة قاعدة بيانات Google Sheets بنجاح',
      spreadsheetId,
      sheets: sheetsList
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
