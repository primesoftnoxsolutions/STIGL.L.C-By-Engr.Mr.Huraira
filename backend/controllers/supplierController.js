const { Supplier } = require('../models');
const { Op } = require('sequelize');

// @desc    Get all suppliers
// @route   GET /api/suppliers
// @access  Private
exports.getAllSuppliers = async (req, res) => {
  try {
    const { search } = req.query;
    const where = {};

    if (search) {
      where[Op.or] = [
        { supplierName: { [Op.like]: `%${search}%` } },
        { trNumber: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } }
      ];
    }

    const suppliers = await Supplier.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers
    });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single supplier
// @route   GET /api/suppliers/:id
// @access  Private
exports.getSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    res.status(200).json({
      success: true,
      data: supplier
    });
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create supplier
// @route   POST /api/suppliers
// @access  Private
exports.createSupplier = async (req, res) => {
  try {
    const { supplierName, trNumber, phone, email, address, contactPerson, notes } = req.body;

    // Validate required fields
    if (!supplierName || !trNumber || !phone || !email || !address) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: Supplier Name, TR Number, Phone, Email, and Address'
      });
    }

    // Check if TR Number already exists
    const existingTR = await Supplier.findOne({ where: { trNumber } });
    if (existingTR) {
      return res.status(400).json({
        success: false,
        message: 'A supplier with this TR Number already exists'
      });
    }

    // Check if email already exists
    const existingEmail = await Supplier.findOne({ where: { email } });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'A supplier with this email already exists'
      });
    }

    const supplier = await Supplier.create({
      supplierName,
      trNumber,
      phone,
      email,
      address,
      contactPerson,
      notes
    });

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: supplier
    });
  } catch (error) {
    console.error('Error creating supplier:', error);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.errors.map(e => e.message).join(', ')
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update supplier
// @route   PUT /api/suppliers/:id
// @access  Private
exports.updateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    const { supplierName, trNumber, phone, email, address, contactPerson, notes } = req.body;

    // Check if TR Number is being changed and if it already exists
    if (trNumber && trNumber !== supplier.trNumber) {
      const existingTR = await Supplier.findOne({ where: { trNumber } });
      if (existingTR) {
        return res.status(400).json({
          success: false,
          message: 'A supplier with this TR Number already exists'
        });
      }
    }

    // Check if email is being changed and if it already exists
    if (email && email !== supplier.email) {
      const existingEmail = await Supplier.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'A supplier with this email already exists'
        });
      }
    }

    await supplier.update({
      supplierName: supplierName || supplier.supplierName,
      trNumber: trNumber || supplier.trNumber,
      phone: phone || supplier.phone,
      email: email || supplier.email,
      address: address || supplier.address,
      contactPerson: contactPerson !== undefined ? contactPerson : supplier.contactPerson,
      notes: notes !== undefined ? notes : supplier.notes
    });

    res.status(200).json({
      success: true,
      message: 'Supplier updated successfully',
      data: supplier
    });
  } catch (error) {
    console.error('Error updating supplier:', error);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.errors.map(e => e.message).join(', ')
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete supplier (hard delete)
// @route   DELETE /api/suppliers/:id
// @access  Private (Super Admin)
exports.deleteSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    // Hard delete - permanently remove from database
    await supplier.destroy();

    res.status(200).json({
      success: true,
      message: 'Supplier deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
