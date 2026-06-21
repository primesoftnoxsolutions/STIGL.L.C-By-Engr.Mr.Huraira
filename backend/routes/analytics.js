const express = require('express');
const router = express.Router();
const {
  getOverview,
  getEmployeeReport,
  getEmployeesList,
  exportAnalytics
} = require('../controllers/analyticsController');
const { protect, authorize } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// @route   GET /api/analytics/overview
router.get('/overview', authorize('super_admin'), getOverview);

// @route   GET /api/analytics/employees
router.get('/employees', authorize('super_admin'), getEmployeesList);

// @route   GET /api/analytics/employee/:userId
router.get('/employee/:userId', getEmployeeReport);

// @route   GET /api/analytics/export
router.get('/export', authorize('super_admin'), exportAnalytics);

module.exports = router;
