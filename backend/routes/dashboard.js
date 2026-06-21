const express = require('express');
const router = express.Router();
const {
  getDashboardOverview,
  getSalesChartData,
  getInactiveCustomers,
  markInactiveCustomersRead
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/overview', getDashboardOverview);
router.get('/sales-chart', getSalesChartData);
router.get('/inactive-customers', getInactiveCustomers);
router.post('/inactive-customers/mark-read', markInactiveCustomersRead);

module.exports = router;
