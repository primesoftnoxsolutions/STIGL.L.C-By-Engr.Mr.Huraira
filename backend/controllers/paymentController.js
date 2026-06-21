const { Payment, Customer, SalesInvoice, Rental, User, ReceivingInvoice, ReceivingInvoiceItem, sequelize } = require('../models');
const { Op } = require('sequelize');
const {
  buildUaeDateRange,
  parseUaeDateInput
} = require('../utils/uaeTime');

// @desc    Get all payments
// @route   GET /api/payments
// @access  Private
exports.getAllPayments = async (req, res) => {
  try {
    const { customerId, status, startDate, endDate } = req.query;
    const where = {};

    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (startDate && endDate) {
      const range = buildUaeDateRange(startDate, endDate);
      if (range) {
        where.paymentDate = {
          [Op.between]: [range.start, range.end]
        };
      }
    }
    if (req.user.role === 'employee') {
      where.employeeId = req.user.id;
    }

    const payments = await Payment.findAll({
      where,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'customerCode', 'phone']
        },
        {
          model: SalesInvoice,
          as: 'invoice',
          attributes: ['id', 'invoiceNumber', 'total']
        },
        {
          model: Rental,
          as: 'rental',
          attributes: ['id', 'rentalNumber', 'rentalAmount']
        },
        {
          model: User,
          as: 'employee',
          attributes: ['id', 'fullName', 'email']
        }
      ],
      order: [['paymentDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: payments.length,
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single payment
// @route   GET /api/payments/:id
// @access  Private
exports.getPayment = async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id, {
      include: [
        { model: Customer, as: 'customer' },
        { model: SalesInvoice, as: 'invoice' },
        { model: Rental, as: 'rental' },
        { model: User, as: 'employee' }
      ]
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create payment
// @route   POST /api/payments
// @access  Private
exports.createPayment = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { customerId, invoiceId, rentalId, amount, paymentMethod, paymentDate, referenceNumber, notes } = req.body;
    const resolvedPaymentDate = parseUaeDateInput(paymentDate) || new Date();

    // Generate payment number
    const count = await Payment.count();
    const paymentNumber = `PAY${String(count + 1).padStart(6, '0')}`;

    // Create payment
    const payment = await Payment.create({
      paymentNumber,
      customerId,
      invoiceId,
      rentalId,
      employeeId: req.user.id,
      amount,
      paymentMethod,
      paymentDate: resolvedPaymentDate,
      referenceNumber,
      notes
    }, { transaction: t });

    // Update invoice or rental payment status
    if (invoiceId) {
      const invoice = await SalesInvoice.findByPk(invoiceId, { transaction: t });
      if (invoice) {
        const newPaidAmount = parseFloat(invoice.paidAmount) + parseFloat(amount);
        const newBalanceAmount = parseFloat(invoice.total) - newPaidAmount;
        
        let paymentStatus = 'unpaid';
        if (newBalanceAmount <= 0) {
          paymentStatus = 'paid';
        } else if (newPaidAmount > 0) {
          paymentStatus = 'partial';
        }

        await invoice.update({
          paidAmount: newPaidAmount,
          balanceAmount: Math.max(0, newBalanceAmount),
          paymentStatus
        }, { transaction: t });
      }
    }

    if (rentalId) {
      const rental = await Rental.findByPk(rentalId, { transaction: t });
      if (rental) {
        const newPaidAmount = parseFloat(rental.paidAmount) + parseFloat(amount);
        const totalAmount = parseFloat(rental.rentalAmount) + parseFloat(rental.securityDeposit);
        const newBalanceAmount = totalAmount - newPaidAmount;

        await rental.update({
          paidAmount: newPaidAmount,
          balanceAmount: Math.max(0, newBalanceAmount)
        }, { transaction: t });
      }
    }

    // Update customer balance
    const customer = await Customer.findByPk(customerId, { transaction: t });
    if (customer) {
      await customer.update({
        currentBalance: Math.max(0, parseFloat(customer.currentBalance) - parseFloat(amount))
      }, { transaction: t });
    }

    await t.commit();

    // Fetch complete payment
    const completePayment = await Payment.findByPk(payment.id, {
      include: [
        { model: Customer, as: 'customer' },
        { model: SalesInvoice, as: 'invoice' },
        { model: Rental, as: 'rental' },
        { model: User, as: 'employee' }
      ]
    });

    res.status(201).json({
      success: true,
      data: completePayment
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

// @desc    Create bulk payments (multiple invoices)
// @route   POST /api/payments/bulk
// @access  Private
exports.createBulkPayments = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!req.user || !req.user.id) {
      console.error('[Bulk Payments] No authenticated user!');
      await t.rollback();
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    
    // Extract and validate request data
    const { customerId, items, paymentMethod, bankName, checkNumber, paymentDate, notes, signature } = req.body;
    const resolvedPaymentDate = parseUaeDateInput(paymentDate) || new Date();
    
    // Validate required fields
    if (!customerId || typeof customerId !== 'string') {
      console.error('[Bulk Payments] Invalid customerId:', customerId);
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Valid customerId is required' });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.error('[Bulk Payments] Invalid items:', items);
      await t.rollback();
      return res.status(400).json({ success: false, message: 'At least one invoice item is required' });
    }
    
    // Validate payment method
    if (!paymentMethod || !['cash', 'check'].includes(paymentMethod)) {
      console.error('[Bulk Payments] Invalid payment method:', paymentMethod);
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Valid payment method is required (cash or check)' });
    }
    
    // Validate and sanitize payment method specific data
    if (paymentMethod === 'check') {
      if (!bankName || typeof bankName !== 'string' || bankName.trim() === '') {
        console.error('[Bulk Payments] Bank name required for check payment');
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Bank name is required for check payments' });
      }
      if (!checkNumber || typeof checkNumber !== 'string' || checkNumber.trim() === '') {
        console.error('[Bulk Payments] Check number required for check payment');
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Check number is required for check payments' });
      }
    }
    
    // Sanitize string inputs (prevent XSS)
    const sanitizedBankName = bankName ? String(bankName).trim().substring(0, 100) : null;
    const sanitizedCheckNumber = checkNumber ? String(checkNumber).trim().substring(0, 50) : null;
    const sanitizedNotes = notes ? String(notes).trim().substring(0, 500) : null;

    // Generate RC Number
    const rcCount = await ReceivingInvoice.count();
    const rcNumber = `RC-${String(rcCount + 1).padStart(7, '0')}`;

    const created = [];
    let totalAmount = 0;
    const rcItems = [];
    const basePaymentCount = await Payment.count();

    // Create all payments first
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const { invoiceId, amount } = it;
      
      // Validate item data
      if (!invoiceId || typeof invoiceId !== 'string') {
        console.error('[Bulk Payments] Invalid invoiceId in item:', it);
        await t.rollback();
        return res.status(400).json({ success: false, message: `Invoice ID is invalid in item ${idx + 1}` });
      }
      
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        console.error('[Bulk Payments] Invalid amount in item:', it);
        await t.rollback();
        return res.status(400).json({ success: false, message: `Amount must be greater than 0 in item ${idx + 1}` });
      }
      
      // Generate unique payment number using sequential index to avoid duplicates
      const paymentNumber = `PAY${String(basePaymentCount + idx + 1).padStart(6, '0')}`;

      try {
      const payment = await Payment.create({
        paymentNumber,
        customerId,
        invoiceId,
        employeeId: req.user.id,
        amount: parsedAmount,
        paymentMethod,
        paymentDate: resolvedPaymentDate,
        referenceNumber: sanitizedCheckNumber,
        notes: sanitizedBankName ? `${sanitizedNotes || ''} | Bank: ${sanitizedBankName}` : sanitizedNotes || null
      }, { transaction: t });
        // update invoice
      const invoice = await SalesInvoice.findByPk(invoiceId, { transaction: t });
      if (!invoice) {
        console.error(`[Bulk Payments] Invoice not found: ${invoiceId}`);
        await t.rollback();
        return res.status(404).json({ success: false, message: `Invoice ${invoiceId} not found` });
      }
      if (req.user.role === 'employee' && invoice.employeeId !== req.user.id) {
        await t.rollback();
        return res.status(403).json({ success: false, message: 'Not authorized to collect payment for this invoice' });
      }
        
        const newPaidAmount = parseFloat(invoice.paidAmount || 0) + parsedAmount;
        const newBalanceAmount = parseFloat(invoice.total || 0) - newPaidAmount;
        let paymentStatus = 'unpaid';
        if (newBalanceAmount <= 0) paymentStatus = 'paid';
        else if (newPaidAmount > 0) paymentStatus = 'partial';
        await invoice.update({ 
          paidAmount: newPaidAmount, 
          balanceAmount: Math.max(0, newBalanceAmount),
          paymentStatus,
          status: newBalanceAmount <= 0 ? 'paid' : 'active'
        }, { transaction: t });

        // update customer balance
        const customer = await Customer.findByPk(customerId, { transaction: t });
        if (customer) {
          const newBalance = Math.max(0, parseFloat(customer.currentBalance || 0) - parsedAmount);
          await customer.update({ currentBalance: newBalance }, { transaction: t });
        }

        created.push(payment);
        totalAmount += parsedAmount;
        rcItems.push({
          invoice,
          payment,
          amount: parsedAmount
        });
      } catch (err) {
        console.error(`[Bulk Payments] Error processing invoice ${invoiceId}:`, err.message);
        await t.rollback();
        return res.status(400).json({ 
          success: false, 
          message: `Error processing invoice ${invoiceId}: ${err.message}`,
          error: err.message
        });
      }
    }

    // Create Receiving Invoice
    const receivingInvoice = await ReceivingInvoice.create({
      rcNumber,
      customerId,
      employeeId: req.user.id,
      rcDate: resolvedPaymentDate,
      paymentMethod,
      totalAmount,
      bankName: sanitizedBankName,
      checkNumber: sanitizedCheckNumber,
      signature,
      notes: sanitizedNotes,
      status: 'active'
    }, { transaction: t });

    // Create Receiving Invoice Items
    for (const rcItem of rcItems) {
      await ReceivingInvoiceItem.create({
        receivingInvoiceId: receivingInvoice.id,
        salesInvoiceId: rcItem.invoice.id,
        paymentId: rcItem.payment.id,
        invoiceNumber: rcItem.invoice.invoiceNumber,
        invoiceAmount: rcItem.invoice.total,
        amountReceived: rcItem.amount
      }, { transaction: t });
    }

    await t.commit();

    // Fetch complete results
    const results = await Payment.findAll({ 
      where: { id: created.map(c => c.id) }, 
      include: [
        { model: Customer, as: 'customer' }, 
        { model: SalesInvoice, as: 'invoice' }, 
        { model: User, as: 'employee' }
      ] 
    });

    const rcFull = await ReceivingInvoice.findByPk(receivingInvoice.id, {
      include: [
        { model: ReceivingInvoiceItem, as: 'items' },
        { model: Customer, as: 'customer' },
        { model: User, as: 'employee' }
      ]
    });
    
    res.status(201).json({ 
      success: true, 
      data: results,
      receivingInvoice: rcFull
    });
  } catch (error) {
    await t.rollback();
    console.error('[Bulk Payments] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc    Update payment
// @route   PUT /api/payments/:id
// @access  Private (Super Admin)
exports.updatePayment = async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const updates = { ...req.body };
    if (updates.paymentDate) {
      const parsed = parseUaeDateInput(updates.paymentDate);
      if (parsed) updates.paymentDate = parsed;
    }

    await payment.update(updates);

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete payment
// @route   DELETE /api/payments/:id
// @access  Private (Super Admin)
exports.deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    await payment.destroy();

    res.status(200).json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get collected invoices (Receiving Invoices) for today or custom date
// @route   GET /api/payments/collected
// @access  Private
exports.getCollectedInvoices = async (req, res) => {
  try {
    const { customerId, startDate, endDate } = req.query;
    
    const where = {};
    
    if (customerId) {
      where.customerId = customerId;
    }
    if (req.user.role === 'employee') {
      where.employeeId = req.user.id;
    }

    // Only apply a date filter when explicitly provided
    if (startDate && endDate) {
      const range = buildUaeDateRange(startDate, endDate);
      if (range) {
        where.rcDate = { [Op.between]: [range.start, range.end] };
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
          model: ReceivingInvoiceItem,
          as: 'items',
          attributes: ['id', 'salesInvoiceId', 'invoiceNumber', 'invoiceAmount', 'amountReceived']
        },
        {
          model: User,
          as: 'employee',
          attributes: ['id', 'fullName', 'email']
        }
      ],
      order: [['rcDate', 'DESC']]
    });
    
    res.status(200).json({
      success: true,
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

// @desc    Get payment statistics
// @route   GET /api/payments/stats
// @access  Private
exports.getPaymentStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = { status: 'completed' };

    if (startDate && endDate) {
      const range = buildUaeDateRange(startDate, endDate);
      if (range) {
        where.paymentDate = {
          [Op.between]: [range.start, range.end]
        };
      }
    }

    const totalPayments = await Payment.sum('amount', { where });
    const paymentCount = await Payment.count({ where });
    const cashPayments = await Payment.sum('amount', { where: { ...where, paymentMethod: 'cash' } });
    const bankPayments = await Payment.sum('amount', { where: { ...where, paymentMethod: 'bank_transfer' } });

    res.status(200).json({
      success: true,
      data: {
        totalPayments: totalPayments || 0,
        paymentCount,
        cashPayments: cashPayments || 0,
        bankPayments: bankPayments || 0
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
