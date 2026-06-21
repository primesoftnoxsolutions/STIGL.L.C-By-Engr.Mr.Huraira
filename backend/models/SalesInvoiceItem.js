const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SalesInvoiceItem = sequelize.define('SalesInvoiceItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  invoiceId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'sales_invoices',
      key: 'id'
    }
  },
  cylinderId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'cylinders',
      key: 'id'
    }
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'products',
      key: 'id'
    }
  },
  inventoryItemId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'inventory_items',
      key: 'id'
    }
  },
  saleType: {
    type: DataTypes.ENUM('Gas', 'Full Cylinder', 'Empty Cylinder', 'Tool'),
    allowNull: true,
    comment: 'Type of sale: Gas, Full Cylinder, Empty Cylinder, Tool'
  },
  productName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  unitPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  tax: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  totalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  notes: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'sales_invoice_items',
  timestamps: true
});

module.exports = SalesInvoiceItem;
