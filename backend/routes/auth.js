const express = require('express');
const router = express.Router();
const { register, login, getMe, updateSignature } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

router.post('/register', protect, authorize('super_admin'), register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/signature', protect, updateSignature);

module.exports = router;
