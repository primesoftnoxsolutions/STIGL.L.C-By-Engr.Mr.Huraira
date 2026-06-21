const {
  MaintenanceRun,
  MaintenanceNotificationDismissal
} = require('../models');

const getLatestSuccessfulRun = async () => (
  MaintenanceRun.findOne({
    where: { status: 'success' },
    order: [['ranAt', 'DESC']]
  })
);

exports.getMaintenanceNotification = async (req, res) => {
  try {
    const latestRun = await getLatestSuccessfulRun();
    if (!latestRun) {
      return res.status(200).json({
        success: true,
        data: { visible: false }
      });
    }

    const dismissal = await MaintenanceNotificationDismissal.findOne({
      where: {
        userId: req.user.id,
        maintenanceRunId: latestRun.id
      }
    });

    if (dismissal) {
      return res.status(200).json({
        success: true,
        data: { visible: false }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        visible: true,
        id: latestRun.id,
        message: latestRun.message,
        bytesCleaned: Number(latestRun.bytesCleaned || 0),
        ranAt: latestRun.ranAt
      }
    });
  } catch (error) {
    console.error('Get maintenance notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.dismissMaintenanceNotification = async (req, res) => {
  try {
    const latestRun = await getLatestSuccessfulRun();
    if (!latestRun) {
      return res.status(200).json({
        success: true,
        data: { dismissed: false }
      });
    }

    const [dismissal] = await MaintenanceNotificationDismissal.findOrCreate({
      where: {
        userId: req.user.id,
        maintenanceRunId: latestRun.id
      },
      defaults: {
        dismissedAt: new Date()
      }
    });

    res.status(200).json({
      success: true,
      data: {
        dismissed: true,
        dismissedAt: dismissal.dismissedAt,
        maintenanceRunId: latestRun.id
      }
    });
  } catch (error) {
    console.error('Dismiss maintenance notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
