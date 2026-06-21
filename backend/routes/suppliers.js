const express = require('express');
const router = express.Router();
const {
  getAllSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier
} = require('../controllers/supplierController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getAllSuppliers);
router.get('/:id', getSupplier);
router.post('/', authorize('manager', 'super_admin'), createSupplier);
router.put('/:id', authorize('manager', 'super_admin'), updateSupplier);
router.delete('/:id', authorize('super_admin'), deleteSupplier);

module.exports = router;
