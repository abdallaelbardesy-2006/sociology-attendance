const { getFullAnalyticsDirect } = require('./_sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const result = await getFullAnalyticsDirect(req.query || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.message && error.message.includes('غير مصرح') ? 403 : 500).json({
      success: false,
      message: error.message
    });
  }
};
