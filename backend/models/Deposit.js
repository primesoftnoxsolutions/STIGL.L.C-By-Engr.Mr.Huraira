const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Deposit = sequelize.define('Deposit', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  customerId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  invoiceNumber: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  paymentType: {
    type: DataTypes.ENUM('Cash', 'Check'),
    allowNull: false,
    defaultValue: 'Cash'
  },
  bankName: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  checkNumber: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  customerSignature: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  employeeSignature: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  authorizedById: {
    type: DataTypes.UUID,
    allowNull: true
  },
  authorizedByName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  authorizedBySignature: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  receivedByName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  sourceType: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  sourceReferenceId: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  totalAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('open', 'partial', 'returned'),
    allowNull: false,
    defaultValue: 'open'
  }
}, {
  tableName: 'deposits',
  timestamps: true
});

module.exports = Deposit;
