const { Expense, User } = require('../models');
const { Op } = require('sequelize');

const EXPENSE_TYPES = ['Diesel', 'Maintenance', 'Tyer'];

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
exports.getAllExpenses = async (req, res) => {
  try {
    const { search, expenseType, fromDate, toDate } = req.query;
    const where = {};

    if (expenseType && EXPENSE_TYPES.includes(expenseType)) {
      where.expenseType = expenseType;
    }

    if (search) {
      where[Op.or] = [
        { invoiceNumber: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (fromDate || toDate) {
      where.expenseDate = {};
      if (fromDate) where.expenseDate[Op.gte] = fromDate;
      if (toDate) where.expenseDate[Op.lte] = toDate;
    }

    const expenses = await Expense.findAll({
      where,
      include: [{
        model: User,
        as: 'employee',
        attributes: ['id', 'fullName', 'role']
      }],
      order: [['expenseDate', 'DESC'], ['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: expenses.length,
      data: expenses
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create expense
// @route   POST /api/expenses
// @access  Private
exports.createExpense = async (req, res) => {
  try {
    const { expenseType, invoiceNumber, expenseDate, amount } = req.body;

    if (!expenseType || !EXPENSE_TYPES.includes(expenseType)) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid expense type (Diesel, Maintenance, Tyer)'
      });
    }

    if (!invoiceNumber || !String(invoiceNumber).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invoice number is required'
      });
    }

    if (!expenseDate) {
      return res.status(400).json({
        success: false,
        message: 'Expense date is required'
      });
    }

    const parsedAmount = roundMoney(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid amount greater than 0'
      });
    }

    const normalizedInvoice = String(invoiceNumber).trim();
    const existing = await Expense.findOne({ where: { invoiceNumber: normalizedInvoice } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An expense with this invoice number already exists'
      });
    }

    const vatAmount = roundMoney(parsedAmount * 0.05);
    const totalAmount = roundMoney(parsedAmount + vatAmount);

    const expense = await Expense.create({
      expenseType,
      invoiceNumber: normalizedInvoice,
      expenseDate,
      amount: parsedAmount,
      vatAmount,
      totalAmount,
      employeeId: req.user?.id || null
    });

    const created = await Expense.findByPk(expense.id, {
      include: [{
        model: User,
        as: 'employee',
        attributes: ['id', 'fullName', 'role']
      }]
    });

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
