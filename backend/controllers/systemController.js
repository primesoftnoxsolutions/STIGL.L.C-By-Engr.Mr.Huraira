const { sequelize, Customer } = require('../models');

let restartInProgress = false;

const fetchInactiveCustomers = async () => {
  const [rows] = await sequelize.query(
    `
    SELECT c.id
    FROM customers c
    WHERE NOT EXISTS (
      SELECT 1 FROM sales_invoices s WHERE s.customerId = c.id
    )
    `
  );
  return rows;
};

// @desc    System health with DB status
// @route   GET /api/system/health
// @access  Private (Admin/Super Admin)
exports.getSystemHealth = async (req, res) => {
  try {
    await sequelize.authenticate();
    const customerCount = await Customer.count();
    const inactiveRows = await fetchInactiveCustomers();

    res.status(200).json({
      success: true,
      data: {
        api: 'ok',
        db: 'ok',
        customerCount,
        inactiveCustomerCount: inactiveRows.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'System health check failed',
      error: error.message
    });
  }
};

// @desc    Restart backend (soft restart by reconnecting DB)
// @route   POST /api/system/restart
// @access  Private (Admin/Super Admin)
exports.restartBackend = async (req, res) => {
  if (restartInProgress) {
    return res.status(409).json({
      success: false,
      message: 'Restart already in progress'
    });
  }

  restartInProgress = true;
  const allowHardRestart = process.env.ALLOW_HARD_RESTART === 'true';

  try {
    await sequelize.authenticate();
    await sequelize.sync({ force: false });

    res.status(200).json({
      success: true,
      message: allowHardRestart ? 'Backend restart scheduled' : 'Backend reloaded successfully',
      data: {
        mode: allowHardRestart ? 'hard' : 'soft'
      }
    });

    if (allowHardRestart) {
      setTimeout(() => {
        process.exit(0);
      }, 1500);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Backend restart failed',
      error: error.message
    });
  } finally {
    restartInProgress = false;
  }
};
