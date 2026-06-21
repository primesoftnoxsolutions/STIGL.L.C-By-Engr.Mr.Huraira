const { sequelize } = require('../models');

async function syncDB() {
  try {
    console.log('🔄 Syncing database schema...');
    await sequelize.sync({ force: true });
    console.log('✅ Database synced successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

syncDB();
