const { User, Cylinder } = require('../models');
const { Op } = require('sequelize');

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Super Admin)
exports.getAllUsers = async (req, res) => {
  try {
    const { role, isActive, search } = req.query;
    const where = {};

    // SECURITY: Non-Super Admins cannot see Super Admin accounts
    if (req.user.role !== 'super_admin') {
      where.role = { [Op.ne]: 'super_admin' };
    }

    if (role) {
      // Prevent non-Super Admins from querying Super Admin role
      if (role === 'super_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access'
        });
      }
      where.role = role;
    }

    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where[Op.or] = [
        { fullName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { username: { [Op.like]: `%${search}%` } }
      ];
    }

    const users = await User.findAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (Super Admin)
exports.getUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Cylinder,
          as: 'assignedCylinders',
          attributes: ['id', 'cylinderNumber', 'cylinderType', 'status']
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Super Admin)
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // SECURITY: Only Super Admin can update Super Admin accounts
    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Cannot modify Super Admin accounts'
      });
    }

    // SECURITY: Prevent changing user to Super Admin unless requester is Super Admin
    if (req.body.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Cannot assign Super Admin role'
      });
    }

    const { username, email, fullName, role, phone, address, isActive } = req.body;

    await user.update({
      username,
      email,
      fullName,
      role,
      phone,
      address,
      isActive
    });

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Super Admin)
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // SECURITY: Only Super Admin can delete Super Admin accounts
    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Cannot delete Super Admin accounts'
      });
    }

    // Prevent Super Admin from deleting themselves
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Hard delete - permanently remove from database
    await user.destroy();

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Reset user password
// @route   PUT /api/users/:id/reset-password
// @access  Private (Super Admin)
exports.resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await user.update({ password: newPassword });

    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get current user
// @route   GET /api/users/me
// @access  Private
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update user signature
// @route   PUT /api/users/signature
// @access  Private
exports.updateSignature = async (req, res) => {
  try {
    const { signature } = req.body;

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: 'Signature data is required'
      });
    }

    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await user.update({ signature });

    res.status(200).json({
      success: true,
      message: 'Signature updated successfully',
      data: { signature: user.signature }
    });
  } catch (error) {
    console.error('Error updating signature:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating signature',
      error: error.message
    });
  }
};
