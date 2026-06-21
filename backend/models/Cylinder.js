const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Cylinder = sequelize.define('Cylinder', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  cylinderNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  cylinderType: {
    type: DataTypes.STRING(50),
    allowNull: false // e.g., "12kg", "19kg", "45kg"
  },
  capacity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('available', 'filled', 'empty', 'damaged', 'rented', 'in_transit'),
    defaultValue: 'available'
  },
  assignedToId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  location: {
    type: DataTypes.STRING(100)
  },
  lastFilledDate: {
    type: DataTypes.DATE
  },
  lastInspectionDate: {
    type: DataTypes.DATE
  },
  purchaseDate: {
    type: DataTypes.DATE
  },
  purchasePrice: {
    type: DataTypes.DECIMAL(10, 2)
  },
  notes: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'cylinders',
  timestamps: true
});

module.exports = Cylinder;
