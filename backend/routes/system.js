const express = require('express');
const router = express.Router();
const { getSystemHealth, restartBackend } = require('../controllers/systemController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('manager', 'super_admin'));

router.get('/health', getSystemHealth);
router.post('/restart', restartBackend);

module.exports = router;
