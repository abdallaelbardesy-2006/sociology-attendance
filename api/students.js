const { callGasApi } = require('./_sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. تسجيل طالب جديد
    if (req.method === 'POST') {
      const { name, enrollType, status, grade } = req.body || {};
      if (!name || !enrollType || !status || !grade) {
        return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
      }

      const result = await callGasApi('registerStudent', { name, enrollType, status, grade });
      return res.status(200).json(result);
    }

    // 2. جلب قائمة الطلاب
    if (req.method === 'GET') {
      const { grade, search } = req.query || {};
      const result = await callGasApi('getStudentsList', { grade, search });
      return res.status(200).json(result);
    }

    // 3. تعديل بيانات طالب
    if (req.method === 'PUT') {
      const { code, name, enrollType, status, grade } = req.body || {};
      if (!code) return res.status(400).json({ success: false, error: 'كود الطالب مطلوب' });

      const result = await callGasApi('updateStudentData', {
        code,
        updated: { name, enrollType, status, grade }
      });
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
