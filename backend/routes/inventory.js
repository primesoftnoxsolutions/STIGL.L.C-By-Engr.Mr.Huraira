const express = require('express');
const router = express.Router();
const {
  getAllInventory,
  getInventoryByCategory,
  getInventorySummary,
  getStockMutations,
  deductStock,
  getAvailableEmptyCylinders
} = require('../controllers/inventoryController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getAllInventory);
router.get('/mutations', getStockMutations);
router.get('/summary', getInventorySummary);
router.get('/available-empty-cylinders', getAvailableEmptyCylinders);
router.get('/category/:category', getInventoryByCategory);
router.post('/:id/deduct', deductStock);

module.exports = router;
