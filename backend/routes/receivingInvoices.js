const express = require('express');
const router = express.Router();
const {
  getAllReceivingInvoices,
  getReceivingInvoice,
  deleteReceivingInvoice,
  getReceivingInvoiceStats
} = require('../controllers/receivingInvoiceController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/stats', getReceivingInvoiceStats);
router.get('/', getAllReceivingInvoices);
router.get('/:id', getReceivingInvoice);
router.delete('/:id', authorize('super_admin', 'manager'), deleteReceivingInvoice);

module.exports = router;
