const { Rental, RentalItem, Customer, Product, User } = require('../models');
const { Op } = require('sequelize');
const { parseUaeDateInput } = require('../utils/uaeTime');

// @desc    Get all rentals
// @route   GET /api/rentals
// @access  Private
exports.getAllRentals = async (req, res) => {
  try {
    const { status, customerId } = req.query;
    const where = {};

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (req.user.role === 'employee') {
      where.employeeId = req.user.id;
    }

    const rentals = await Rental.findAll({
      where,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'customerCode', 'phone']
        },
        {
          model: RentalItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'productName', 'productCode', 'productType']
            }
          ]
        },
        {
          model: User,
          as: 'employee',
          attributes: ['id', 'fullName', 'email']
        }
      ],
      order: [['startDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: rentals.length,
      data: rentals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single rental
// @route   GET /api/rentals/:id
// @access  Private
exports.getRental = async (req, res) => {
  try {
    const rental = await Rental.findByPk(req.params.id, {
      include: [
        { model: Customer, as: 'customer' },
        {
          model: RentalItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product'
            }
          ]
        },
        { model: User, as: 'employee' }
      ]
    });

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: 'Rental not found'
      });
    }
    if (req.user.role === 'employee' && rental.employeeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this rental'
      });
    }

    res.status(200).json({
      success: true,
      data: rental
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create rental
// @route   POST /api/rentals
// @access  Private
exports.createRental = async (req, res) => {
  try {
    const { customerId, startDate, items, rentalAmount, securityDeposit, signature } = req.body;
    const resolvedStartDate = parseUaeDateInput(startDate) || new Date();

    // Validate items array
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please add at least one item to the rental'
      });
    }

    // Verify customer exists
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Verify all products exist (batch query instead of N+1)
    const productIds = items.map(item => item.productId);
    const products = await Product.findAll({ where: { id: productIds } });
    if (products.length !== productIds.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more products not found'
      });
    }

    // Generate rental number
    const count = await Rental.count();
    const rentalNumber = `RNT${String(count + 1).padStart(6, '0')}`;

    // Create rental
    const rental = await Rental.create({
      rentalNumber,
      customerId,
      employeeId: req.user.id,
      startDate: resolvedStartDate,
      rentalAmount: parseFloat(rentalAmount),
      securityDeposit: parseFloat(securityDeposit || 0),
      balanceAmount: parseFloat(rentalAmount) + parseFloat(securityDeposit || 0),
      signature: signature || null
    });

    // Create rental items
    for (const item of items) {
      await RentalItem.create({
        rentalId: rental.id,
        productId: item.productId,
        quantity: item.quantity,
        rentalDays: item.rentalDays,
        pricePerDay: 10, // Fixed price
        totalAmount: item.quantity * 10 * item.rentalDays
      });
    }

    // Fetch complete rental with items
    const completeRental = await Rental.findByPk(rental.id, {
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'customerCode', 'phone', 'email']
        },
        {
          model: RentalItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'productName', 'productCode', 'productType']
            }
          ]
        },
        {
          model: User,
          as: 'employee',
          attributes: ['id', 'fullName', 'email']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: completeRental
    });
  } catch (error) {
    console.error('❌ [RENTAL] Create rental error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name,
      errors: error.errors ? error.errors.map(e => ({ message: e.message, type: e.type, path: e.path })) : null
    });
    let errorMessage = error.message;
    if (error.errors && error.errors.length > 0) {
      errorMessage = error.errors.map(e => e.message).join(', ');
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        errors: error.errors
      } : undefined
    });
  }
};

// @desc    Update rental
// @route   PUT /api/rentals/:id
// @access  Private
exports.updateRental = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can edit rental invoices'
      });
    }
    const rental = await Rental.findByPk(req.params.id);

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: 'Rental not found'
      });
    }
    if (req.user.role === 'employee' && rental.employeeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this rental'
      });
    }

    const { status, returnDate, paidAmount } = req.body;
    const resolvedReturnDate = parseUaeDateInput(returnDate) || returnDate;

    // Update balance amount
    if (paidAmount) {
      rental.paidAmount = parseFloat(rental.paidAmount) + parseFloat(paidAmount);
      rental.balanceAmount = parseFloat(rental.rentalAmount) + parseFloat(rental.securityDeposit) - parseFloat(rental.paidAmount);
    }

    await rental.update({
      status,
      returnDate: resolvedReturnDate,
      paidAmount: rental.paidAmount,
      balanceAmount: rental.balanceAmount
    });

    // Fetch updated rental with items
    const updatedRental = await Rental.findByPk(rental.id, {
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'customerCode', 'phone', 'email']
        },
        {
          model: RentalItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'productName', 'productCode', 'productType']
            }
          ]
        },
        {
          model: User,
          as: 'employee',
          attributes: ['id', 'fullName', 'email']
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: updatedRental
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete rental
// @route   DELETE /api/rentals/:id
// @access  Private (Super Admin)
exports.deleteRental = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can delete rental invoices'
      });
    }
    const rental = await Rental.findByPk(req.params.id);

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: 'Rental not found'
      });
    }

    // Delete associated rental items first
    await RentalItem.destroy({
      where: { rentalId: rental.id }
    });

    // Delete the rental
    await rental.destroy();

    res.status(200).json({
      success: true,
      message: 'Rental deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get rental statistics
// @route   GET /api/rentals/stats
// @access  Private
exports.getRentalStats = async (req, res) => {
  try {
    const activeRentals = await Rental.count({ where: { status: 'active' } });
    const overdueRentals = await Rental.count({ 
      where: { 
        status: 'active',
        endDate: { [Op.lt]: new Date() }
      } 
    });
    const totalRevenue = await Rental.sum('rentalAmount');
    const outstandingAmount = await Rental.sum('balanceAmount', { where: { status: 'active' } });

    res.status(200).json({
      success: true,
      data: {
        activeRentals,
        overdueRentals,
        totalRevenue: totalRevenue || 0,
        outstandingAmount: outstandingAmount || 0
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
