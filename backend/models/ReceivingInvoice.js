const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReceivingInvoice = sequelize.define('ReceivingInvoice', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  rcNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  customerId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  rcDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  paymentMethod: {
    type: DataTypes.ENUM('cash', 'check', 'bank_transfer', 'credit_card', 'debit_card', 'other'),
    allowNull: false
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  bankName: {
    type: DataTypes.STRING(100)
  },
  checkNumber: {
    type: DataTypes.STRING(100)
  },
  signature: {
    type: DataTypes.TEXT('long')
  },
  notes: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.ENUM('active', 'cancelled'),
    defaultValue: 'active'
  }
}, {
  tableName: 'receiving_invoices',
  timestamps: true
});

module.exports = ReceivingInvoice;
