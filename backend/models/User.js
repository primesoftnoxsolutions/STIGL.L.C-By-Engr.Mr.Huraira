const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const LEGACY_SHA256_SALT = 'salt_key_123';
const parsedSaltRounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || '', 10);
const BCRYPT_SALT_ROUNDS =
  Number.isInteger(parsedSaltRounds) && parsedSaltRounds >= 4 && parsedSaltRounds <= 31
    ? parsedSaltRounds
    : 10;

const hashLegacyPassword = (password) => {
  return crypto.createHash('sha256').update(password + LEGACY_SHA256_SALT).digest('hex');
};

const isBcryptHash = (value) => typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);

const shouldHashPassword = (value) =>
  typeof value === 'string' && value.length > 0 && !isBcryptHash(value);

const hashPassword = async (password) => {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
};

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fullName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('super_admin', 'manager', 'employee'),
    allowNull: false,
    defaultValue: 'employee'
  },
  phone: {
    type: DataTypes.STRING(20)
  },
  address: {
    type: DataTypes.TEXT
  },
  signature: {
    type: DataTypes.TEXT // Base64 encoded signature image
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastLogin: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    beforeCreate: async (user) => {
      if (shouldHashPassword(user.password)) {
        user.password = await hashPassword(user.password);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password') && shouldHashPassword(user.password)) {
        user.password = await hashPassword(user.password);
      }
    }
  }
});

User.prototype.comparePassword = async function(candidatePassword) {
  if (typeof candidatePassword !== 'string' || !this.password) {
    return false;
  }

  if (isBcryptHash(this.password)) {
    return bcrypt.compare(candidatePassword, this.password);
  }

  const legacyHash = hashLegacyPassword(candidatePassword);

  if (legacyHash === this.password) {
    return true;
  }

  // Fallback for old/plain-text rows so they can be upgraded on successful login.
  return candidatePassword === this.password;
};

User.prototype.needsPasswordRehash = function() {
  return !isBcryptHash(this.password);
};

module.exports = User;
