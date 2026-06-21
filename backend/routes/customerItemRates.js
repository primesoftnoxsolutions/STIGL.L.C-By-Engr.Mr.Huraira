const express = require('express');
const router = express.Router();
const {
  getCustomerItemRates,
  saveCustomerItemRates
} = require('../controllers/customerItemRateController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getCustomerItemRates);
router.post('/', authorize('manager', 'super_admin'), saveCustomerItemRates);

module.exports = router;
