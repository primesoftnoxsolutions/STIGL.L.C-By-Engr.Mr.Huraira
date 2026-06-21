const express = require('express');
const router = express.Router();
const { getNotifications, markAllRead, clearAll } = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getNotifications);
router.post('/mark-read', markAllRead);
router.delete('/clear', clearAll);

module.exports = router;
