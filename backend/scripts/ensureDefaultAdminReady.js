require('dotenv').config();

const sequelize = require('../config/database');
const { ensureDatabaseExists } = require('../utils/databaseBootstrap');
const { ensureBootstrapAdmin } = require('../services/bootstrapAdmin');

async function ensureDefaultAdminReady() {
  const dbName = process.env.DB_NAME || 'cylinder_erp';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPassword = process.env.DB_PASSWORD || '';

  if (process.env.DB_AUTO_CREATE !== 'false' && process.env.NODE_ENV !== 'production') {
    await ensureDatabaseExists({
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: dbUser,
      password: dbPassword
    });
  }

  await sequelize.authenticate();

  const shouldAlter = process.env.DB_SYNC_ALTER === 'true';
  const shouldForce = process.env.DB_SYNC_FORCE === 'true';
  await sequelize.sync({ alter: shouldAlter, force: shouldForce });
  await ensureBootstrapAdmin();

  console.log('[SETUP] Database ready. Default super admin credentials are active from .env');
}

ensureDefaultAdminReady()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[SETUP ERROR]', error.message);
    try {
      await sequelize.close();
    } catch (closeError) {
      // ignore close errors
    }
    process.exit(1);
  });
