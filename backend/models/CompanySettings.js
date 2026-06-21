const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CompanySettings = sequelize.define('CompanySettings', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  companyName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  logo: {
    type: DataTypes.TEXT // Base64 or URL
  },
  email: {
    type: DataTypes.STRING(100)
  },
  phone: {
    type: DataTypes.STRING(20)
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
  country: {
    type: DataTypes.STRING(50)
  },
  taxId: {
    type: DataTypes.STRING(50)
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'USD'
  },
  dateFormat: {
    type: DataTypes.STRING(20),
    defaultValue: 'YYYY-MM-DD'
  },
  timeZone: {
    type: DataTypes.STRING(50),
    defaultValue: 'UTC'
  },
  fiscalYearStart: {
    type: DataTypes.STRING(10),
    defaultValue: '01-01'
  },
  invoicePrefix: {
    type: DataTypes.STRING(10),
    defaultValue: 'INV'
  },
  quotationPrefix: {
    type: DataTypes.STRING(10),
    defaultValue: 'QUO'
  },
  rentalPrefix: {
    type: DataTypes.STRING(10),
    defaultValue: 'RNT'
  },
  paymentPrefix: {
    type: DataTypes.STRING(10),
    defaultValue: 'PAY'
  },
  gasSaleInvoicePrefix: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  gasSaleInvoiceNextNumber: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  gasSaleInvoicePadding: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'company_settings',
  timestamps: true
});

module.exports = CompanySettings;
