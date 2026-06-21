const express = require('express');
const router = express.Router();
const {
  getAllCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  importCustomers,
  exportCustomers
} = require('../controllers/customerController');
const { protect, authorize } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.get('/export', authorize('super_admin'), exportCustomers);
router.post('/import', authorize('super_admin'), upload.single('file'), importCustomers);
router.get('/', getAllCustomers);
router.get('/:id', getCustomer);
router.post('/', authorize('manager', 'super_admin'), createCustomer);
router.put('/:id', authorize('manager', 'super_admin'), updateCustomer);
router.delete('/:id', authorize('super_admin'), deleteCustomer);

module.exports = router;
