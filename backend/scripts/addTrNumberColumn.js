const sequelize = require('../config/database');

async function addTrNumberColumn() {
  try {
    console.log('Adding trNumber column to customers table...');
    
    // Add the trNumber column to customers table
    await sequelize.query(`
      ALTER TABLE customers ADD COLUMN trNumber VARCHAR(50);
    `);
    
    console.log('✅ trNumber column added successfully!');
    
  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      console.log('⚠️ Column trNumber already exists');
    } else {
      console.error('❌ Error adding column:', error.message);
    }
  } finally {
    process.exit(0);
  }
}

addTrNumberColumn();
