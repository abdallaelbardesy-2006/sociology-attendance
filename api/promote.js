const { callGasApi } = require('./_sheets');

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

    const result = await callGasApi('promoteStudentsList', {
      codes: studentCodes,
      targetGrade
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
