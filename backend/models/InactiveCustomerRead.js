const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const InactiveCustomerRead = sequelize.define('InactiveCustomerRead', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  lastReadAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'inactive_customer_reads',
  timestamps: true
});

module.exports = InactiveCustomerRead;
