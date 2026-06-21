const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Supplier = sequelize.define('Supplier', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  supplierName: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  trNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Tax Registration Number'
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  contactPerson: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'suppliers',
  timestamps: true
});

module.exports = Supplier;
