const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MaintenanceNotificationDismissal = sequelize.define('MaintenanceNotificationDismissal', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  maintenanceRunId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'maintenance_runs',
      key: 'id'
    }
  },
  dismissedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'maintenance_notification_dismissals',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'maintenanceRunId']
    }
  ]
});

module.exports = MaintenanceNotificationDismissal;
