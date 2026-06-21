const { ReceivingInvoice, ReceivingInvoiceItem, Customer, User, SalesInvoice, sequelize } = require('../models');
const { Op } = require('sequelize');
const { buildUaeDateRange } = require('../utils/uaeTime');

// @desc    Get all receiving invoices
// @route   GET /api/receiving-invoices
// @access  Private
exports.getAllReceivingInvoices = async (req, res) => {
  try {
    const { customerId, startDate, endDate, status } = req.query;
    const where = {};

    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (startDate && endDate) {
      const range = buildUaeDateRange(startDate, endDate);
      if (range) {
        where.rcDate = {
          [Op.between]: [range.start, range.end]
        };
      }
    }

    const receivingInvoices = await ReceivingInvoice.findAll({
      where,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'customerCode', 'phone']
        },
        {
          model: User,
          as: 'employee',
          attributes: ['id', 'fullName', 'email']
        },
        {
          model: ReceivingInvoiceItem,
          as: 'items',
          include: [
            {
              model: SalesInvoice,
              as: 'salesInvoice',
              attributes: ['id', 'invoiceNumber', 'total']
            }
          ]
        }
      ],
      order: [['rcDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: receivingInvoices.length,
      data: receivingInvoices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single receiving invoice
// @route   GET /api/receiving-invoices/:id
// @access  Private
exports.getReceivingInvoice = async (req, res) => {
  try {
    const receivingInvoice = await ReceivingInvoice.findByPk(req.params.id, {
      include: [
        {
          model: Customer,
          as: 'customer'
        },
        {
          model: User,
          as: 'employee'
        },
        {
          model: ReceivingInvoiceItem,
          as: 'items',
          include: [
            {
              model: SalesInvoice,
              as: 'salesInvoice'
            }
          ]
        }
      ]
    });

    if (!receivingInvoice) {
      return res.status(404).json({
        success: false,
        message: 'Receiving invoice not found'
      });
    }

    res.status(200).json({
      success: true,
      data: receivingInvoice
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete receiving invoice
// @route   DELETE /api/receiving-invoices/:id
// @access  Private (Admin)
exports.deleteReceivingInvoice = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const receivingInvoice = await ReceivingInvoice.findByPk(req.params.id, { transaction: t });

    if (!receivingInvoice) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Receiving invoice not found'
      });
    }

    // Mark as cancelled instead of deleting
    await receivingInvoice.update({ status: 'cancelled' }, { transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: 'Receiving invoice cancelled successfully'
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get receiving invoices statistics
// @route   GET /api/receiving-invoices/stats
// @access  Private
exports.getReceivingInvoiceStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = { status: 'active' };

    if (startDate && endDate) {
      const range = buildUaeDateRange(startDate, endDate);
      if (range) {
        where.rcDate = {
          [Op.between]: [range.start, range.end]
        };
      }
    }

    const totalReceived = await ReceivingInvoice.sum('totalAmount', { where });
    const rcCount = await ReceivingInvoice.count({ where });

    res.status(200).json({
      success: true,
      data: {
        totalReceived: totalReceived || 0,
        rcCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
