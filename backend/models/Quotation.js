const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Quotation = sequelize.define('Quotation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  quotationNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  customerId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  customerType: {
    type: DataTypes.ENUM('existing', 'walk_in'),
    allowNull: false,
    defaultValue: 'existing'
  },
  walkInCustomerName: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  walkInTrNumber: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  quotationDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  validUntil: {
    type: DataTypes.DATE,
    allowNull: false
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
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'),
    defaultValue: 'draft'
  },
  convertedToInvoiceId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT
  },
  termsAndConditions: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'quotations',
  timestamps: true
});

module.exports = Quotation;
