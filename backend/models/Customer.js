const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Customer = sequelize.define('Customer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  customerCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  fullName: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  companyName: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(100),
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  address: {
    type: DataTypes.TEXT
  },
  city: {
    type: DataTypes.STRING(50)
  },
  state: {
    type: DataTypes.STRING(50)
  },
  zipCode: {
    type: DataTypes.STRING(20)
  },
  creditLimit: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  currentBalance: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  customerType: {
    type: DataTypes.ENUM('individual', 'business'),
    defaultValue: 'individual'
  },
  taxId: {
    type: DataTypes.STRING(50)
  },
  trNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Tax Registration Number'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  notes: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'customers',
  timestamps: true
});

module.exports = Customer;
