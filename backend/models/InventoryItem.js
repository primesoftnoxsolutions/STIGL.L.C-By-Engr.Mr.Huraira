const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const InventoryItem = sequelize.define('InventoryItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id'
    }
  },
  inventoryCategory: {
    type: DataTypes.ENUM('Full Cylinder', 'Empty Cylinder', 'Tool'),
    allowNull: false,
    comment: 'Category for inventory display'
  },
  stockQuantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Current stock quantity (can be 0 but item remains visible)'
  },
  totalPurchased: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total quantity ever purchased'
  },
  totalSold: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total quantity ever sold'
  },
  lastPurchaseDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastSaleDate: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'inventory_items',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['productId', 'inventoryCategory']
    }
  ]
});

module.exports = InventoryItem;
