const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RentalItem = sequelize.define('RentalItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  rentalId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'rentals',
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
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  rentalDays: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  pricePerDay: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'rental_items',
  timestamps: true
});

module.exports = RentalItem;
