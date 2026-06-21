const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DailyStock = sequelize.define('DailyStock', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  reportDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  openingFull: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  openingEmpty: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  openingTool: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  emptyPur: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  toolPur: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  fullPur: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  refilled: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  fullCylSales: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  emptyCylSales: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  toolSales: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  gasSales: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  depositCylinder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  returnCylinder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  transferGas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  transferCylinders: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  transferTools: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  receivedGas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  receivedCylinders: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  receivedTools: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  closingFull: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  closingEmpty: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  closingTool: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  isSnapshot: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'daily_stocks',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['reportDate', 'productId'] }
  ]
});

module.exports = DailyStock;
