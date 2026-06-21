require('dotenv').config();

const { ensureDatabaseExists } = require('../utils/databaseBootstrap');

async function createDatabase() {
  const bootstrapConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      };

  try {
    await ensureDatabaseExists(bootstrapConfig);
  } catch (err) {
    console.error('Error creating database:', err.message);
    if (err.message.includes('authentication failed')) {
      console.error('Please check your DB_USER and DB_PASSWORD in .env');
    }
    process.exitCode = 1;
  }
}

createDatabase();
