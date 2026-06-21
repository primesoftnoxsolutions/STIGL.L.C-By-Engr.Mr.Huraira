const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SystemActivityLog = sequelize.define('SystemActivityLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  action: {
    type: DataTypes.STRING(80),
    allowNull: false
  },
  module: {
    type: DataTypes.STRING(80),
    allowNull: false,
    defaultValue: 'system'
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true
  },
  actorUserId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'system_activity_logs',
  timestamps: true
});

module.exports = SystemActivityLog;
