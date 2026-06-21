const { sequelize } = require('../models');

async function addSignatureColumns() {
  try {
    console.log('🔄 Checking and adding signature columns...');
    
    // Function to check if column exists
    const checkColumn = async (table, column) => {
      const [results] = await sequelize.query(`PRAGMA table_info(${table})`);
      return results.some(col => col.name === column);
    };
    
    // Add signature column to users table
    const hasUserSignature = await checkColumn('users', 'signature');
    if (!hasUserSignature) {
      await sequelize.query('ALTER TABLE users ADD COLUMN signature TEXT;');
      console.log('✅ Added signature column to users table');
    } else {
      console.log('✓ Users table already has signature column');
    }
    
    // Add signature columns to sales_invoices table
    const hasEmployeeSignature = await checkColumn('sales_invoices', 'employeeSignature');
    if (!hasEmployeeSignature) {
      await sequelize.query('ALTER TABLE sales_invoices ADD COLUMN employeeSignature TEXT;');
      console.log('✅ Added employeeSignature column to sales_invoices table');
    } else {
      console.log('✓ sales_invoices table already has employeeSignature column');
    }
    
    const hasReceivedBySignature = await checkColumn('sales_invoices', 'receivedBySignature');
    if (!hasReceivedBySignature) {
      await sequelize.query('ALTER TABLE sales_invoices ADD COLUMN receivedBySignature TEXT;');
      console.log('✅ Added receivedBySignature column to sales_invoices table');
    } else {
      console.log('✓ sales_invoices table already has receivedBySignature column');
    }
    
    const hasReceivedByName = await checkColumn('sales_invoices', 'receivedByName');
    if (!hasReceivedByName) {
      await sequelize.query('ALTER TABLE sales_invoices ADD COLUMN receivedByName VARCHAR(100);');
      console.log('✅ Added receivedByName column to sales_invoices table');
    } else {
      console.log('✓ sales_invoices table already has receivedByName column');
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('All signature columns are now available.');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error(error.message);
    process.exit(1);
  }
}

addSignatureColumns();
