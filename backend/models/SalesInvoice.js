const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SalesInvoice = sequelize.define('SalesInvoice', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  invoiceNumber: {
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
  invoiceDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  dueDate: {
    type: DataTypes.DATE
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  tax: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  deliveryCharges: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  paidAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  balanceAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'paid', 'partial', 'cancelled', 'deleted'),
    defaultValue: 'active'
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'partial', 'paid'),
    defaultValue: 'pending'
  },
  paymentMethod: {
    type: DataTypes.STRING(50)
  },
  employeeSignature: {
    type: DataTypes.TEXT // Base64 encoded signature
  },
  receivedBySignature: {
    type: DataTypes.TEXT // Base64 encoded signature
  },
  receivedByName: {
    type: DataTypes.STRING(100)
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
    type: DataTypes.TEXT
  },
  notes: {
    type: DataTypes.TEXT
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  deletedBy: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'sales_invoices',
  timestamps: true,
  paranoid: false // We'll handle soft deletes manually
});

module.exports = SalesInvoice;
