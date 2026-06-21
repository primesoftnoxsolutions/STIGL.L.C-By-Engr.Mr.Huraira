const { Sequelize } = require('sequelize');
require('dotenv').config();

const {
  DATABASE_URL,
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_LOGGING = 'false'
} = process.env;

const logging = DB_LOGGING === 'true' ? console.log : false;
const sslOptions = { require: true, rejectUnauthorized: false };
const baseOptions = {
  dialect: 'postgres',
  logging,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

let sequelize;

if (DATABASE_URL) {
  sequelize = new Sequelize(DATABASE_URL, {
    ...baseOptions,
    dialectOptions: {
      ssl: sslOptions
    }
  });
} else {
  if (!DB_HOST || !DB_PORT || !DB_NAME || !DB_USER) {
    throw new Error(
      'Missing database configuration. Set DATABASE_URL or DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.'
    );
  }

  sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port: Number(DB_PORT),
    ...baseOptions,
    dialectOptions:
      process.env.NODE_ENV === 'production'
        ? { ssl: sslOptions }
        : undefined
  });
}

module.exports = sequelize;

