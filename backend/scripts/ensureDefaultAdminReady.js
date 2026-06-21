require('dotenv').config();

const sequelize = require('../config/database');
const { ensureDatabaseExists } = require('../utils/databaseBootstrap');
const { ensureBootstrapAdmin } = require('../services/bootstrapAdmin');

async function ensureDefaultAdminReady() {
  const shouldAutoCreate = process.env.DB_AUTO_CREATE !== 'false' && process.env.NODE_ENV !== 'production';

  if (shouldAutoCreate) {
    const bootstrapConfig = process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT),
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD
        };

    await ensureDatabaseExists(bootstrapConfig);
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
    console.error('[SETUP ERROR]', error);
    try {
      await sequelize.close();
    } catch (closeError) {
      // ignore close errors
    }
    process.exit(1);
  });
