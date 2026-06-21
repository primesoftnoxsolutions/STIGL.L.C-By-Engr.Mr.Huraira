const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  generateCode,
  importProducts,
  exportProducts
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.get('/categories/list', getCategories);
router.post('/generate-code', generateCode);
router.get('/export', authorize('super_admin'), exportProducts);
router.post('/import', authorize('super_admin'), upload.single('file'), importProducts);
router.get('/', getAllProducts);
router.get('/:id', getProduct);
router.post('/', authorize('manager', 'super_admin'), createProduct);
router.put('/:id', authorize('manager', 'super_admin'), updateProduct);
router.delete('/:id', authorize('super_admin'), deleteProduct);

module.exports = router;
