const { Quotation, QuotationItem, Customer, User } = require('../models');
const { Op } = require('sequelize');
const { parseUaeDateInput, toUaeDateKey, makeUaeDateFromKey } = require('../utils/uaeTime');

const customerInclude = {
  model: Customer,
  as: 'customer',
  attributes: ['id', 'name', 'customerCode', 'phone', 'email'],
  required: false
};

const resolveQuotationCustomerFields = (body = {}) => {
  const customerType = body.customerType === 'walk_in' ? 'walk_in' : 'existing';

  if (customerType === 'walk_in') {
    const walkInCustomerName = String(body.walkInCustomerName || '').trim();
    const walkInTrNumber = String(body.walkInTrNumber || '').trim();

    if (!walkInCustomerName) {
      return { error: 'Customer name is required for walk-in quotations' };
    }
    if (!walkInTrNumber) {
      return { error: 'TR Number is required for walk-in quotations' };
    }

    return {
      customerType: 'walk_in',
      customerId: null,
      walkInCustomerName,
      walkInTrNumber
    };
  }

  if (!body.customerId) {
    return { error: 'Please select an existing customer' };
  }

  return {
    customerType: 'existing',
    customerId: body.customerId,
    walkInCustomerName: null,
    walkInTrNumber: null
  };
};

// @desc    Get all quotations
// @route   GET /api/quotations
// @access  Private
exports.getAllQuotations = async (req, res) => {
  try {
    const { status, customerId } = req.query;
    const where = {};

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (req.user.role === 'employee') {
      where.employeeId = req.user.id;
    }

    const quotations = await Quotation.findAll({
      where,
      include: [
        customerInclude,
        {
          model: User,
          as: 'employee',
          attributes: ['id', 'fullName', 'email']
        },
        {
          model: QuotationItem,
          as: 'items'
        }
      ],
      order: [['quotationDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: quotations.length,
      data: quotations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single quotation
// @route   GET /api/quotations/:id
// @access  Private
exports.getQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findByPk(req.params.id, {
      include: [
        customerInclude,
        { model: User, as: 'employee' },
        { model: QuotationItem, as: 'items' }
      ]
    });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }
    if (req.user.role === 'employee' && quotation.employeeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this quotation'
      });
    }

    res.status(200).json({
      success: true,
      data: quotation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create quotation
// @route   POST /api/quotations
// @access  Private
exports.createQuotation = async (req, res) => {
  try {
    const { quotationDate, validUntil, items, notes, termsAndConditions } = req.body;
    const customerFields = resolveQuotationCustomerFields(req.body);

    if (customerFields.error) {
      return res.status(400).json({
        success: false,
        message: customerFields.error
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one quotation item is required'
      });
    }

    const resolvedQuotationDate = parseUaeDateInput(quotationDate) || makeUaeDateFromKey(toUaeDateKey());
    const resolvedValidUntil = parseUaeDateInput(validUntil) || null;

    if (!resolvedValidUntil) {
      return res.status(400).json({
        success: false,
        message: 'Valid until date is required'
      });
    }

    // Generate quotation number
    const count = await Quotation.count();
    const quotationNumber = `QUO${String(count + 1).padStart(6, '0')}`;

    // Calculate totals
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    items.forEach(item => {
      subtotal += item.quantity * item.unitPrice;
      totalTax += item.tax || 0;
      totalDiscount += item.discount || 0;
    });

    const total = subtotal - totalDiscount + totalTax;

    // Create quotation
    const quotation = await Quotation.create({
      quotationNumber,
      ...customerFields,
      employeeId: req.user.id,
      quotationDate: resolvedQuotationDate,
      validUntil: resolvedValidUntil,
      subtotal,
      tax: totalTax,
      discount: totalDiscount,
      total,
      notes,
      termsAndConditions
    });

    // Create quotation items
    for (const item of items) {
      const totalPrice = (item.quantity * item.unitPrice) - (item.discount || 0) + (item.tax || 0);
      
      await QuotationItem.create({
        quotationId: quotation.id,
        productName: item.productName,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        tax: item.tax || 0,
        totalPrice
      });
    }

    // Fetch complete quotation
    const completeQuotation = await Quotation.findByPk(quotation.id, {
      include: [
        customerInclude,
        { model: User, as: 'employee' },
        { model: QuotationItem, as: 'items' }
      ]
    });

    res.status(201).json({
      success: true,
      data: completeQuotation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update quotation
// @route   PUT /api/quotations/:id
// @access  Private
exports.updateQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findByPk(req.params.id);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }
    if (req.user.role === 'employee' && quotation.employeeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this quotation'
      });
    }

    const updates = { ...req.body };
    if (updates.quotationDate) {
      const parsed = parseUaeDateInput(updates.quotationDate);
      if (parsed) updates.quotationDate = parsed;
    }
    if (updates.validUntil) {
      const parsed = parseUaeDateInput(updates.validUntil);
      if (parsed) updates.validUntil = parsed;
    }

    await quotation.update(updates);

    res.status(200).json({
      success: true,
      data: quotation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete quotation
// @route   DELETE /api/quotations/:id
// @access  Private (Super Admin)
exports.deleteQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findByPk(req.params.id);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    await quotation.destroy();

    res.status(200).json({
      success: true,
      message: 'Quotation deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get quotation statistics
// @route   GET /api/quotations/stats
// @access  Private
exports.getQuotationStats = async (req, res) => {
  try {
    const totalQuotations = await Quotation.count();
    const acceptedQuotations = await Quotation.count({ where: { status: 'accepted' } });
    const rejectedQuotations = await Quotation.count({ where: { status: 'rejected' } });
    const convertedQuotations = await Quotation.count({ where: { status: 'converted' } });
    const conversionRate = totalQuotations > 0 ? (convertedQuotations / totalQuotations) * 100 : 0;

    res.status(200).json({
      success: true,
      data: {
        totalQuotations,
        acceptedQuotations,
        rejectedQuotations,
        convertedQuotations,
        conversionRate: conversionRate.toFixed(2)
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
