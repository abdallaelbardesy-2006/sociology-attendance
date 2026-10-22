const { callGasApi } = require('./_sheets');

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

    const result = await callGasApi('recordAttendance', {
      qrData,
      selectedGrade,
      selectedTerm,
      subjectCode,
      subjectName,
      adminEmail
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message, type: 'error' });
  }
};
