const express = require('express');
const router = express.Router();
const {
  getAllQuotations,
  getQuotation,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  getQuotationStats
} = require('../controllers/quotationController');
const { protect, authorize, checkDateRestriction, blockEmployee } = require('../middleware/auth');

router.use(protect);
router.use(blockEmployee);

router.get('/stats', getQuotationStats);
router.get('/', getAllQuotations);
router.get('/:id', getQuotation);
router.post('/', checkDateRestriction, createQuotation);
router.put('/:id', updateQuotation);
router.delete('/:id', authorize('super_admin'), deleteQuotation);

module.exports = router;
