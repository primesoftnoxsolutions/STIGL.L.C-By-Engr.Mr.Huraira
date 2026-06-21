const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MaintenanceRun = sequelize.define('MaintenanceRun', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  status: {
    type: DataTypes.ENUM('success', 'failed'),
    allowNull: false,
    defaultValue: 'success'
  },
  bytesCleaned: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0
  },
  message: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true
  },
  ranAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'maintenance_runs',
  timestamps: true
});

module.exports = MaintenanceRun;
