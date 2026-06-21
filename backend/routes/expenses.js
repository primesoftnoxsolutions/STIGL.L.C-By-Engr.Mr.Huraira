const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', expenseController.getAllExpenses);
router.post('/', expenseController.createExpense);

module.exports = router;
