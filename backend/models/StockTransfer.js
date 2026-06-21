const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockTransfer = sequelize.define('StockTransfer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  transferNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  transferType: {
    type: DataTypes.ENUM('assign', 'return'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('assigned', 'pending', 'received', 'rejected'),
    allowNull: false,
    defaultValue: 'assigned'
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  notes: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'stock_transfers',
  timestamps: true
});

module.exports = StockTransfer;
