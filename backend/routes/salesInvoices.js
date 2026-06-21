const express = require('express');
const router = express.Router();
const {
  getAllInvoices,
  getInvoice,
  getGasInvoiceSeries,
  setGasInvoiceSeries,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getSalesStats
} = require('../controllers/salesInvoiceController');
const { protect, authorize, checkDateRestriction } = require('../middleware/auth');

router.use(protect);

router.get('/stats', getSalesStats);
router.get('/gas-series', getGasInvoiceSeries);
router.put('/gas-series', authorize('super_admin'), setGasInvoiceSeries);
router.get('/', getAllInvoices);
router.get('/:id', getInvoice);
router.post('/', checkDateRestriction, createInvoice);
router.put('/:id', authorize('super_admin'), updateInvoice);
router.delete('/:id', authorize('super_admin'), deleteInvoice);

module.exports = router;
