const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { CUSTOMER_ITEM_RATE_TYPES } = require('../utils/customerItemRate');

const CustomerItemRate = sequelize.define(
  'CustomerItemRate',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'customers',
        key: 'id'
      }
    },
    itemType: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: {
        isIn: [CUSTOMER_ITEM_RATE_TYPES]
      }
    },
    itemId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id'
      }
    },
    rate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    }
  },
  {
    tableName: 'customer_item_rates',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['customerId', 'itemType', 'itemId']
      }
    ],
    validate: {
      ratePositive() {
        if (parseFloat(this.rate) <= 0) {
          throw new Error('Rate must be greater than zero');
        }
      }
    }
  }
);

module.exports = CustomerItemRate;
