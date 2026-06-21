const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DepositItem = sequelize.define('DepositItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  depositId: {
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
  },
  price: {
    type: DataTypes.DECIMAL(12,2),
    allowNull: false,
    defaultValue: 0
  },
  amount: {
    type: DataTypes.DECIMAL(12,2),
    allowNull: false,
    defaultValue: 0
  },
  returned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  returnedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  returnedQuantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'deposit_items',
  timestamps: true
});

module.exports = DepositItem;
