const express = require('express');
const router = express.Router();
const { getDailyStock, getCashPaperReport } = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/daily-stock', getDailyStock);
router.get('/cash-paper', getCashPaperReport);

module.exports = router;
