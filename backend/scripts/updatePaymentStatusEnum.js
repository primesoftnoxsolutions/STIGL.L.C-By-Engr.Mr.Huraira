const sequelize = require('../config/database');

async function updatePaymentStatusEnum() {
  try {
    console.log('Updating payment status enum values...');
    
    // SQLite doesn't support ALTER COLUMN for enum changes
    // We need to update existing 'unpaid' values to 'pending'
    await sequelize.query(`
      UPDATE sales_invoices 
      SET paymentStatus = 'pending' 
      WHERE paymentStatus = 'unpaid' OR paymentStatus IS NULL
    `);
    
    console.log('✅ Payment status values updated successfully!');
    
    // Show summary
    const [results] = await sequelize.query(`
      SELECT paymentStatus, COUNT(*) as count 
      FROM sales_invoices 
      GROUP BY paymentStatus
    `);
    
    console.log('\nPayment Status Summary:');
    results.forEach(r => {
      console.log(`  ${r.paymentStatus || 'null'}: ${r.count} invoices`);
    });
    
  } catch (error) {
    console.error('❌ Error updating payment status:', error.message);
  } finally {
    process.exit(0);
  }
}

updatePaymentStatusEnum();
