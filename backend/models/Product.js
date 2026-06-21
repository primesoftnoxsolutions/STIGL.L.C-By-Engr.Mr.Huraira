const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  productCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  productName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  productCategory: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  productType: {
    type: DataTypes.ENUM('Gas', 'Cylinder', 'Tool'),
    allowNull: false,
    defaultValue: 'Gas'
  },
  costPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  leastSellingPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  stockQuantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'products',
  timestamps: true,
  validate: {
    priceValidation() {
      if (parseFloat(this.leastSellingPrice) < parseFloat(this.costPrice)) {
        throw new Error('Least Selling Price cannot be lower than Cost Price');
      }
    }
  }
});

module.exports = Product;
