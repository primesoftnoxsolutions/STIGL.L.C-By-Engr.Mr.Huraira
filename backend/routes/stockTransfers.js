const express = require('express');
const router = express.Router();
const {
  createAssignTransfer,
  createReturnTransfer,
  getAssignedTransfers,
  acceptAssignedTransfer,
  rejectAssignedTransfer,
  getTransferHistory,
  getPendingReturns,
  acceptReturn
} = require('../controllers/stockTransferController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Assign stock (Super Admin)
router.post('/assign', authorize('super_admin', 'manager'), createAssignTransfer);

// Employee assigned transfers
router.get('/assigned', getAssignedTransfers);
router.post('/assigned/:id/accept', acceptAssignedTransfer);
router.post('/assigned/:id/reject', rejectAssignedTransfer);

// Assigned/returned history (month-wise default, supports date filter)
router.get('/history', getTransferHistory);

// Employee return submission
router.post('/returns', createReturnTransfer);

// List pending returns (Super Admin)
router.get('/returns', authorize('super_admin'), getPendingReturns);

// Accept return (Super Admin)
router.post('/returns/:id/accept', authorize('super_admin'), acceptReturn);

module.exports = router;
