const { sequelize } = require('../models');

async function addDepositsTables() {
  try {
    console.log('🔄 Checking and creating deposits tables...');

    const checkTable = async (table) => {
      const [results] = await sequelize.query(`PRAGMA table_info(${table})`);
      return results && results.length > 0;
    };

    const hasDeposits = await checkTable('deposits');
    if (!hasDeposits) {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS deposits (
          id TEXT PRIMARY KEY,
          customerId TEXT NOT NULL,
          employeeId TEXT,
          paymentType TEXT DEFAULT 'Cash',
          bankName TEXT,
          checkNumber TEXT,
          totalAmount NUMERIC DEFAULT 0,
          status TEXT DEFAULT 'open',
          createdAt DATETIME,
          updatedAt DATETIME
        );
      `);
      console.log('✅ Created deposits table');
    } else {
      console.log('✓ deposits table already exists');
    }
    // Ensure invoiceNumber column exists
    const [depositCols2] = await sequelize.query(`PRAGMA table_info(deposits)`);
    const colNames2 = depositCols2.map(c => c.name);
    if (!colNames2.includes('invoiceNumber')) {
      await sequelize.query(`ALTER TABLE deposits ADD COLUMN invoiceNumber VARCHAR(20) DEFAULT '';`);
      console.log('✅ Added invoiceNumber column to deposits');
    }
    // Ensure signature columns exist
    const [depositCols] = await sequelize.query(`PRAGMA table_info(deposits)`);
    const colNames = depositCols.map(c => c.name);
    if (!colNames.includes('customerSignature')) {
      await sequelize.query(`ALTER TABLE deposits ADD COLUMN customerSignature TEXT;`);
      console.log('✅ Added customerSignature column to deposits');
    }
    if (!colNames.includes('employeeSignature')) {
      await sequelize.query(`ALTER TABLE deposits ADD COLUMN employeeSignature TEXT;`);
      console.log('✅ Added employeeSignature column to deposits');
    }

    const hasDepositItems = await checkTable('deposit_items');
    if (!hasDepositItems) {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS deposit_items (
          id TEXT PRIMARY KEY,
          depositId TEXT NOT NULL,
          productId TEXT NOT NULL,
          quantity INTEGER DEFAULT 1,
          price NUMERIC DEFAULT 0,
          amount NUMERIC DEFAULT 0,
          returned INTEGER DEFAULT 0,
          returnedAt DATETIME,
          createdAt DATETIME,
          updatedAt DATETIME
        );
      `);
      console.log('✅ Created deposit_items table');
    } else {
      console.log('✓ deposit_items table already exists');
    }

    console.log('\n✅ Deposits migration completed');
    process.exit(0);
  } catch (err) {
    console.error('❌ Deposits migration failed', err);
    process.exit(1);
  }
}

addDepositsTables();
