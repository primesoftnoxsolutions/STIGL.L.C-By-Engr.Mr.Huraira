const sequelize = require('../config/database');

async function addSalesItemColumns() {
  try {
    console.log('Adding new columns to sales_invoice_items table...');
    
    // Add productId column
    try {
      await sequelize.query(`ALTER TABLE sales_invoice_items ADD COLUMN productId VARCHAR(36);`);
      console.log('✅ productId column added');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('⚠️ productId column already exists');
      } else {
        console.log('⚠️ productId:', e.message);
      }
    }
    
    // Add inventoryItemId column
    try {
      await sequelize.query(`ALTER TABLE sales_invoice_items ADD COLUMN inventoryItemId VARCHAR(36);`);
      console.log('✅ inventoryItemId column added');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('⚠️ inventoryItemId column already exists');
      } else {
        console.log('⚠️ inventoryItemId:', e.message);
      }
    }
    
    // Add saleType column
    try {
      await sequelize.query(`ALTER TABLE sales_invoice_items ADD COLUMN saleType VARCHAR(20);`);
      console.log('✅ saleType column added');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('⚠️ saleType column already exists');
      } else {
        console.log('⚠️ saleType:', e.message);
      }
    }
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration error:', error.message);
  } finally {
    process.exit(0);
  }
}

addSalesItemColumns();
