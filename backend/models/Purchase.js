const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Purchase = sequelize.define('Purchase', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  purchaseNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  supplierId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'suppliers',
      key: 'id'
    }
  },
  supplierInvoiceNumber: {
    type: DataTypes.STRING(100),
    allowNull: false
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
  },
  purchaseDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'cancelled'),
    defaultValue: 'pending',
    comment: 'Pending until confirmed in Inventory'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'purchases',
  timestamps: true
});

module.exports = Purchase;
