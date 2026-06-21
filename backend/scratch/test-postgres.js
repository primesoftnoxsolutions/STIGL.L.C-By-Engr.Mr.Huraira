const sequelize = require('../config/database');

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL Connection has been established successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Unable to connect to the PostgreSQL database:', error);
    process.exit(1);
  }
}

testConnection();
