require('dotenv').config();

const { ensureDatabaseExists } = require('../utils/databaseBootstrap');

async function createDatabase() {
  const DB_HOST = process.env.DB_HOST || '127.0.0.1';
  const DB_PORT = process.env.DB_PORT || '5432';
  const DB_NAME = process.env.DB_NAME || 'cylinder_testing';
  const DB_USER = process.env.DB_USER || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';

  try {
    await ensureDatabaseExists({
      host: DB_HOST,
      port: DB_PORT,
      database: DB_NAME,
      user: DB_USER,
      password: DB_PASSWORD
    });
  } catch (err) {
    console.error('Error creating database:', err.message);
    if (err.message.includes('authentication failed')) {
      console.error('Please check your DB_USER and DB_PASSWORD in .env');
    }
    process.exitCode = 1;
  }
}

createDatabase();
