const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  paymentNumber: {
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
  invoiceId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'sales_invoices',
      key: 'id'
    }
  },
  rentalId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'rentals',
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
  paymentDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  paymentMethod: {
    type: DataTypes.ENUM('cash', 'check', 'bank_transfer', 'credit_card', 'debit_card', 'other'),
    allowNull: false
  },
  referenceNumber: {
    type: DataTypes.STRING(100)
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'cancelled', 'refunded'),
    defaultValue: 'completed'
  },
  notes: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'payments',
  timestamps: true
});

module.exports = Payment;
