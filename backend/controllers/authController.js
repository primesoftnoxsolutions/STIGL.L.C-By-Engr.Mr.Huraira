const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { Op, fn, col, where: sequelizeWhere } = require('sequelize');
const { normalizeRole } = require('../utils/roles');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your_jwt_secret', {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

// @desc    Register user (Super Admin only)
// @route   POST /api/auth/register
// @access  Private (Super Admin)
exports.register = async (req, res) => {
  try {
    const { username, email, password, fullName, role, phone, address } = req.body;

    // SECURITY: Only Super Admin can create Super Admin accounts
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can create Super Admin accounts'
      });
    }

    // SECURITY: Prevent non-Super Admins from creating any Super Admin
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Cannot create Super Admin accounts'
      });
    }

    // Check if user exists
    const userExists = await User.findOne({
      where: { email }
    });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Create user (restrict role to employee/admin if not Super Admin)
    const allowedRole = req.user.role === 'super_admin' ? role : 
                       (role === 'super_admin' ? 'employee' : role);

    const user = await User.create({
      username,
      email,
      password,
      fullName,
      role: allowedRole || 'employee',
      phone,
      address
    });

    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role
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

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, username, emailOrUsername, password, role } = req.body;
    const identifier = (emailOrUsername || email || username || '').toString().trim();
    const normalizedIdentifier = identifier.toLowerCase();

    // Validate identifier & password
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email/username and password'
      });
    }

    // Check for user by email OR username (supports both old/new clients)
    const user = await User.findOne({
      where: {
        [Op.or]: [
          sequelizeWhere(fn('lower', col('email')), normalizedIdentifier),
          sequelizeWhere(fn('lower', col('username')), normalizedIdentifier)
        ]
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Upgrade legacy/plain-text hashes to bcrypt after successful authentication.
    if (user.needsPasswordRehash && user.needsPasswordRehash()) {
      try {
        await user.update({ password });
      } catch (rehashError) {
        console.warn('[AUTH] Password rehash skipped:', rehashError.message);
      }
    }

    // If role provided, verify it matches the user's role
    if (role) {
      // Normalize incoming role values (allow friendly names)
      const normalized = (role || '').toString().toLowerCase();
      const roleMap = {
        'super administrator': 'super_admin',
        'super_admin': 'super_admin',
        'superadmin': 'super_admin',
        'administrator': 'manager',
        'admin': 'manager',
        'manager': 'manager',
        'employee': 'employee'
      };
      const expected = roleMap[normalized] || normalizeRole(normalized);
      const userRole = normalizeRole(user.role);
      if (userRole !== expected) {
        return res.status(401).json({ success: false, message: 'Invalid role selected for this account.' });
      }
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account is inactive'
      });
    }

    // Update last login
    await user.update({ lastLogin: new Date() });

    // Create token
    const token = generateToken(user.id);

    res.status(200).json({
      success: true,
      token,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        signature: user.signature
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

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
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

// @desc    Update user signature
// @route   PUT /api/auth/signature
// @access  Private
exports.updateSignature = async (req, res) => {
  try {
    const { signature } = req.body;

    await req.user.update({ signature });

    res.status(200).json({
      success: true,
      message: 'Signature updated successfully',
      data: {
        signature: req.user.signature
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
