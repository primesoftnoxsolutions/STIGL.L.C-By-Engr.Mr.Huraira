const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReceivingInvoiceItem = sequelize.define('ReceivingInvoiceItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  receivingInvoiceId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'receiving_invoices',
      key: 'id'
    }
  },
  salesInvoiceId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'sales_invoices',
      key: 'id'
    }
  },
  paymentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'payments',
      key: 'id'
    }
  },
  invoiceNumber: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  invoiceAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  amountReceived: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  }
}, {
  tableName: 'receiving_invoice_items',
  timestamps: true
});

module.exports = ReceivingInvoiceItem;
