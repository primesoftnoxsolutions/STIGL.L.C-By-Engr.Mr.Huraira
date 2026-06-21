const { Sequelize } = require('sequelize');
require('dotenv').config();

const {
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_NAME = 'cylinder_erp',
  DB_USER = 'postgres',
  DB_PASSWORD = '',
  DB_LOGGING = 'false'
} = process.env;

const logging = DB_LOGGING === 'true' ? console.log : false;

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: Number(DB_PORT),
  dialect: 'postgres',
  logging: logging,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

module.exports = sequelize;

