const express = require('express');
const router = express.Router();
const {
  getMaintenanceNotification,
  dismissMaintenanceNotification
} = require('../controllers/maintenanceController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/notification', getMaintenanceNotification);
router.post('/notification/dismiss', dismissMaintenanceNotification);

module.exports = router;
