const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DepositReturnItem = sequelize.define('DepositReturnItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  depositReturnId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  depositId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  depositItemId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  }
}, {
  tableName: 'deposit_return_items',
  timestamps: true
});

module.exports = DepositReturnItem;
