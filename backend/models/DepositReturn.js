const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DepositReturn = sequelize.define('DepositReturn', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  returnNumber: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },
  customerId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  employeeId: {
    type: DataTypes.UUID,
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
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  totalQuantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'deposit_returns',
  timestamps: true
});

module.exports = DepositReturn;
