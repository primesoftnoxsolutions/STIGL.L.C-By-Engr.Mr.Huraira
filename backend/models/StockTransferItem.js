const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockTransferItem = sequelize.define('StockTransferItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  stockTransferId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'stock_transfers',
      key: 'id'
    }
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id'
    }
  },
  itemType: {
    type: DataTypes.ENUM('Empty Cylinder', 'Gas', 'Tool'),
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'stock_transfer_items',
  timestamps: true
});

module.exports = StockTransferItem;
