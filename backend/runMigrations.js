const { sequelize } = require('./models');
const fs = require('fs');
const path = require('path');

const runMigrations = async () => {
  try {
    console.log('🔄 Running migrations...\n');
    
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort();
    
    for (const file of migrationFiles) {
      try {
        const migration = require(`./migrations/${file}`);
        await migration.up(sequelize.getQueryInterface(), sequelize.constructor);
        console.log(`✓ ${file}`);
      } catch (error) {
        console.log(`⚠ ${file} - ${error.message}`);
      }
    }
    
    console.log('\n✅ Migrations completed!');
    await sequelize.close();
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  }
};

runMigrations();
