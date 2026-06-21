const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PurchaseHeader = sequelize.define('PurchaseHeader', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  purchaseNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Unique purchase number for the entire transaction'
  },
  supplierId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'suppliers',
      key: 'id'
    }
  },
  supplierInvoiceNumber: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  purchaseDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'cancelled'),
    defaultValue: 'pending',
    comment: 'Pending until confirmed in Inventory'
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Sum of all item totals'
  },
  vat: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: '5% VAT on subtotal'
  },
  grandTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Subtotal + VAT'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'purchase_headers',
  timestamps: true
});

module.exports = PurchaseHeader;
