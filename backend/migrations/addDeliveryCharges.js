const { sequelize } = require('../models');

async function addDeliveryChargesColumn() {
  try {
    console.log('🔄 Adding deliveryCharges column to sales_invoices...');
    
    // Check if column exists
    const [results] = await sequelize.query(`PRAGMA table_info(sales_invoices)`);
    const hasDeliveryCharges = results.some(col => col.name === 'deliveryCharges');
    
    if (!hasDeliveryCharges) {
      await sequelize.query('ALTER TABLE sales_invoices ADD COLUMN deliveryCharges DECIMAL(10, 2) DEFAULT 0;');
      console.log('✅ Added deliveryCharges column to sales_invoices table');
    } else {
      console.log('✓ sales_invoices table already has deliveryCharges column');
    }
    
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error(error.message);
    process.exit(1);
  }
}

addDeliveryChargesColumn();
