const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PurchaseItem = sequelize.define('PurchaseItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  purchaseHeaderId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'purchase_headers',
      key: 'id'
    },
    comment: 'Links to the parent purchase transaction'
  },
  purchaseType: {
    type: DataTypes.ENUM('Gas', 'Cylinder', 'Tool'),
    allowNull: false
  },
  cylinderCondition: {
    type: DataTypes.ENUM('Empty', 'Full'),
    allowNull: true,
    comment: 'Only for Cylinder purchase type'
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id'
    },
    comment: 'Main product being purchased'
  },
  relatedProductId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'products',
      key: 'id'
    },
    comment: 'For Gas purchase (related cylinder) or Full Cylinder purchase (related gas)'
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  costPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Auto-fetched from Product Management'
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'quantity * costPrice'
  }
}, {
  tableName: 'purchase_items',
  timestamps: true
});

module.exports = PurchaseItem;
