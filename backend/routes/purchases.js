const express = require('express');
const router = express.Router();
const {
  getAllPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  deletePurchase
} = require('../controllers/purchaseGroupedController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getAllPurchases);
router.get('/:id', getPurchase);
router.post('/', createPurchase);
router.put('/:id', authorize('super_admin'), updatePurchase);
router.delete('/:id', authorize('super_admin'), deletePurchase);

module.exports = router;
