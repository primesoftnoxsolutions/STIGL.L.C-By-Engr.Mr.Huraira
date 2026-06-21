const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MonthlyDashboardSnapshot = sequelize.define('MonthlyDashboardSnapshot', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  monthKey: {
    type: DataTypes.STRING(7),
    allowNull: false,
    unique: true
  },
  periodStart: {
    type: DataTypes.DATE,
    allowNull: false
  },
  periodEnd: {
    type: DataTypes.DATE,
    allowNull: false
  },
  data: {
    type: DataTypes.JSON,
    allowNull: false
  },
  generatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  timezone: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'Asia/Dubai'
  }
}, {
  tableName: 'monthly_dashboard_snapshots',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['monthKey'] }
  ]
});

module.exports = MonthlyDashboardSnapshot;
