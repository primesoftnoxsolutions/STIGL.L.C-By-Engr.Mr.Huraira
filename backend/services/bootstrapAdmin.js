const { User } = require('../models');
const { UniqueConstraintError } = require('sequelize');

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const ALLOWED_ROLES = new Set(['super_admin', 'manager', 'employee']);

const asBoolean = (value, fallback) => {
  if (typeof value === 'undefined') {
    return fallback;
  }
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
};

const resolveBootstrapEnabled = () => {
  // Enable bootstrap admin by default in all environments so default credentials
  // are available after a fresh database reset. Set BOOTSTRAP_DEFAULT_ADMIN=false
  // to disable in any environment.
  const defaultEnabled = true;
  return asBoolean(process.env.BOOTSTRAP_DEFAULT_ADMIN, defaultEnabled);
};

const resolveRole = () => {
  const requestedRole = (process.env.DEFAULT_ADMIN_ROLE || 'super_admin').trim().toLowerCase();
  return ALLOWED_ROLES.has(requestedRole) ? requestedRole : 'super_admin';
};

const ensureBootstrapAdmin = async () => {
  if (!resolveBootstrapEnabled()) {
    return;
  }

  const email = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
  const username = (process.env.DEFAULT_ADMIN_USERNAME || 'admin').trim();
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  const fullName = (process.env.DEFAULT_ADMIN_FULL_NAME || 'System Administrator').trim();
  const role = resolveRole();

  try {
    const existingUser = await User.findOne({
      where: { email }
    });

    if (existingUser) {
      await existingUser.update({
        username,
        password,
        fullName,
        role,
        isActive: true
      });
      console.log(`[AUTH] Ensured bootstrap admin account for ${email}.`);
    } else {
      await User.create({
        email,
        username,
        password,
        fullName,
        role,
        isActive: true
      });
      console.log(`[AUTH] Bootstrapped admin account for ${email}.`);
    }
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      console.warn('[AUTH] Bootstrap admin creation skipped due to concurrent insert.');
      return;
    }
    throw error;
  }
  if (!process.env.DEFAULT_ADMIN_PASSWORD) {
    console.warn('[AUTH] Using default bootstrap password. Set DEFAULT_ADMIN_PASSWORD to override.');
  }
};

module.exports = { ensureBootstrapAdmin };
