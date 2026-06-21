const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockMutation = sequelize.define('StockMutation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  targetType: {
    type: DataTypes.ENUM('inventory_item', 'product'),
    allowNull: false
  },
  targetId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  inventoryCategory: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  quantityBefore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  quantityAfter: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  delta: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  sourceModule: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  sourceAction: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  sourceId: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  sourceRef: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  actorUserId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'stock_mutations',
  timestamps: true,
  indexes: [
    { fields: ['targetType', 'targetId'] },
    { fields: ['productId'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = StockMutation;
