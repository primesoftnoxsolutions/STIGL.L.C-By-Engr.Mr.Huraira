const express = require('express');
const router = express.Router();
const {
  getAllPayments,
  getPayment,
  createPayment,
  createBulkPayments,
  updatePayment,
  deletePayment,
  getPaymentStats,
  getCollectedInvoices
} = require('../controllers/paymentController');
const { protect, authorize, checkDateRestriction, blockEmployee } = require('../middleware/auth');

router.use(protect);

router.get('/stats', blockEmployee, getPaymentStats);
router.get('/collected', blockEmployee, getCollectedInvoices);
router.get('/', blockEmployee, getAllPayments);
router.get('/:id', blockEmployee, getPayment);
router.post('/', blockEmployee, checkDateRestriction, createPayment);
router.post('/bulk', blockEmployee, checkDateRestriction, createBulkPayments);
router.put('/:id', authorize('super_admin'), updatePayment);
router.delete('/:id', authorize('super_admin'), deletePayment);

module.exports = router;
