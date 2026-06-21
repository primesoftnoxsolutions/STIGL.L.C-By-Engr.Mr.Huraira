const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Rental = sequelize.define('Rental', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  rentalNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  customerId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  cylinderId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'cylinders',
      key: 'id'
    }
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  endDate: {
    type: DataTypes.DATE
  },
  rentalPeriod: {
    type: DataTypes.INTEGER, // in days
    allowNull: true
  },
  rentalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  securityDeposit: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  paidAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  balanceAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('active', 'completed', 'cancelled', 'overdue'),
    defaultValue: 'active'
  },
  returnDate: {
    type: DataTypes.DATE
  },
  signature: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'rentals',
  timestamps: true
});

module.exports = Rental;
