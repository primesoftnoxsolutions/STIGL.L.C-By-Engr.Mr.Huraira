const { Cylinder, User } = require('../models');
const { Op } = require('sequelize');

// @desc    Get all cylinders
// @route   GET /api/cylinders
// @access  Private
exports.getAllCylinders = async (req, res) => {
  try {
    const { status, cylinderType, assignedToId } = req.query;
    const where = {};

    // Employees can only see assigned cylinders
    if (req.user.role === 'employee') {
      where.assignedToId = req.user.id;
    } else {
      if (status) where.status = status;
      if (cylinderType) where.cylinderType = cylinderType;
      if (assignedToId) where.assignedToId = assignedToId;
    }

    const cylinders = await Cylinder.findAll({
      where,
      include: [
        {
          model: User,
          as: 'assignedEmployee',
          attributes: ['id', 'fullName', 'email']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: cylinders.length,
      data: cylinders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single cylinder
// @route   GET /api/cylinders/:id
// @access  Private
exports.getCylinder = async (req, res) => {
  try {
    const cylinder = await Cylinder.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'assignedEmployee',
          attributes: ['id', 'fullName', 'email', 'phone']
        }
      ]
    });

    if (!cylinder) {
      return res.status(404).json({
        success: false,
        message: 'Cylinder not found'
      });
    }

    // Check if employee has access
    if (req.user.role === 'employee' && cylinder.assignedToId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this cylinder'
      });
    }

    res.status(200).json({
      success: true,
      data: cylinder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create cylinder
// @route   POST /api/cylinders
// @access  Private (Super Admin)
exports.createCylinder = async (req, res) => {
  try {
    const cylinder = await Cylinder.create(req.body);

    res.status(201).json({
      success: true,
      data: cylinder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update cylinder
// @route   PUT /api/cylinders/:id
// @access  Private (Super Admin)
exports.updateCylinder = async (req, res) => {
  try {
    const cylinder = await Cylinder.findByPk(req.params.id);

    if (!cylinder) {
      return res.status(404).json({
        success: false,
        message: 'Cylinder not found'
      });
    }

    await cylinder.update(req.body);

    res.status(200).json({
      success: true,
      data: cylinder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete cylinder
// @route   DELETE /api/cylinders/:id
// @access  Private (Super Admin)
exports.deleteCylinder = async (req, res) => {
  try {
    const cylinder = await Cylinder.findByPk(req.params.id);

    if (!cylinder) {
      return res.status(404).json({
        success: false,
        message: 'Cylinder not found'
      });
    }

    await cylinder.destroy();

    res.status(200).json({
      success: true,
      message: 'Cylinder deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get cylinder statistics
// @route   GET /api/cylinders/stats
// @access  Private
exports.getCylinderStats = async (req, res) => {
  try {
    const where = req.user.role === 'employee' ? { assignedToId: req.user.id } : {};

    const stats = {
      total: await Cylinder.count({ where }),
      available: await Cylinder.count({ where: { ...where, status: 'available' } }),
      filled: await Cylinder.count({ where: { ...where, status: 'filled' } }),
      empty: await Cylinder.count({ where: { ...where, status: 'empty' } }),
      damaged: await Cylinder.count({ where: { ...where, status: 'damaged' } }),
      rented: await Cylinder.count({ where: { ...where, status: 'rented' } }),
      in_transit: await Cylinder.count({ where: { ...where, status: 'in_transit' } })
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
