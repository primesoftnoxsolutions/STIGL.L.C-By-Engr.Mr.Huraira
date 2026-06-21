const express = require('express');
const router = express.Router();
const {
  getAllCylinders,
  getCylinder,
  createCylinder,
  updateCylinder,
  deleteCylinder,
  getCylinderStats
} = require('../controllers/cylinderController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/stats', getCylinderStats);
router.get('/', getAllCylinders);
router.get('/:id', getCylinder);
router.post('/', authorize('super_admin'), createCylinder);
router.put('/:id', authorize('super_admin'), updateCylinder);
router.delete('/:id', authorize('super_admin'), deleteCylinder);

module.exports = router;
