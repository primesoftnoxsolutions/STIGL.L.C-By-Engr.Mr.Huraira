const { UAE_TIMEZONE, UAE_OFFSET_MINUTES, UAE_OFFSET_MS, toUaeDateKey } = require('../utils/uaeTime');

// @desc    Get server time normalized to UAE timezone
// @route   GET /api/time
// @access  Private
exports.getUaeTime = async (req, res) => {
  const now = new Date();
  const uaeDateKey = toUaeDateKey(now);
  const uaeIso = new Date(now.getTime() + UAE_OFFSET_MS).toISOString();

  res.status(200).json({
    success: true,
    data: {
      timeZone: UAE_TIMEZONE,
      offsetMinutes: UAE_OFFSET_MINUTES,
      uaeDateKey,
      uaeMonthKey: uaeDateKey.slice(0, 7),
      uaeIso,
      utcIso: now.toISOString()
    }
  });
};
