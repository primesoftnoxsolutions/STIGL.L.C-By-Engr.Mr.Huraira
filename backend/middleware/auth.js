const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { parseUaeDateInput, toUaeDateKey, getUaeDayRange } = require('../utils/uaeTime');
const { normalizeRole } = require('../utils/roles');

// Verify JWT token and attach user to request
exports.protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader) {
    const parts = String(authHeader).trim().split(/\s+/);
    if (parts.length === 2 && /^bearer$/i.test(parts[0])) {
      token = parts[1];
    } else if (parts.length === 1) {
      token = parts[0];
    }
  }

  if (!token && req.headers['x-access-token']) {
    token = req.headers['x-access-token'];
  }

  if (typeof token === 'string') {
    token = token.trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
    if (!token || token === 'null' || token === 'undefined') {
      token = null;
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!req.user || !req.user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

// Role-based authorization
exports.authorize = (...roles) => {
  const allowedRoles = roles.map((role) => normalizeRole(role));
  return (req, res, next) => {
    const userRole = normalizeRole(req.user.role);
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }
    next();
  };
};

// Block employees from management-only routes (collections, rentals, etc.)
exports.blockEmployee = (req, res, next) => {
  if (normalizeRole(req.user.role) === 'employee') {
    return res.status(403).json({
      success: false,
      message: 'Employees are not authorized to access this route'
    });
  }
  next();
};

// Check if user can modify past dates (only super_admin)
exports.checkDateRestriction = (req, res, next) => {
  if (req.user.role === 'super_admin') {
    return next();
  }

  const dateField = req.body.invoiceDate || req.body.quotationDate || req.body.paymentDate;
  if (dateField) {
    const requestedDate = parseUaeDateInput(dateField);
    const todayRange = getUaeDayRange(toUaeDateKey());

    if (requestedDate && todayRange && requestedDate < todayRange.start) {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can create records with past dates'
      });
    }
  }

  next();
};
