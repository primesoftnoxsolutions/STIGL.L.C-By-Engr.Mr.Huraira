const express = require('express');
const router = express.Router();
const depositController = require('../controllers/depositController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/products-empty', depositController.getEmptyProducts);
router.get('/pending-summary', depositController.getPendingCylinderSummary);
router.get('/', depositController.getAllDeposits);
router.get('/returns', depositController.getAllReturns);
router.put('/returns/:returnId', authorize('super_admin'), depositController.updateDepositReturn);
router.delete('/returns/:returnId', authorize('super_admin'), depositController.deleteDepositReturn);
router.get('/last', depositController.getLastDeposit);
router.post('/', depositController.createDeposit);
router.put('/:depositId/items/:itemId', authorize('super_admin'), depositController.updateDepositItem);
router.delete('/:depositId/items/:itemId', authorize('super_admin'), depositController.deleteDepositItem);
router.get('/customer/:customerId', depositController.getCustomerDeposits);
router.post('/return', depositController.returnDepositItems);

module.exports = router;
