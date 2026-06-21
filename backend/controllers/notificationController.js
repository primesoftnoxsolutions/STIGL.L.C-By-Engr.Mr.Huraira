const { Notification } = require('../models');
const { createDepositOverdueNotifications } = require('./depositController');

// @desc    Get notifications for current user
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
  try {
    if (req.user?.id) {
      await createDepositOverdueNotifications([req.user.id]);
    }
    const notifications = await Notification.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete all notifications for current user
// @route   DELETE /api/notifications/clear
// @access  Private
exports.clearAll = async (req, res) => {
  try {
    await Notification.destroy({ where: { userId: req.user.id } });
    res.status(200).json({ success: true, message: 'Notifications cleared' });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Mark all notifications as read
// @route   POST /api/notifications/mark-read
// @access  Private
exports.markAllRead = async (req, res) => {
  try {
    const now = new Date();
    await Notification.update(
      { readAt: now },
      { where: { userId: req.user.id, readAt: null } }
    );

    res.status(200).json({
      success: true,
      data: { readAt: now }
    });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
