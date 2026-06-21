const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUser,
  updateUser,
  deleteUser,
  resetPassword,
  getCurrentUser,
  updateSignature
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

// Routes available to all authenticated users
router.use(protect);
router.get('/me', getCurrentUser);
router.put('/signature', updateSignature);

// Routes only for super admin
router.use(authorize('super_admin'));
router.get('/', getAllUsers);
router.get('/:id', getUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
router.put('/:id/reset-password', resetPassword);

module.exports = router;
