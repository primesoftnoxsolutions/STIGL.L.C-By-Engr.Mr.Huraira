const sequelize = require('../config/database');

async function addProductType() {
  try {
    console.log('Starting migration: Adding productType column to products table...');

    // Check if productType column already exists
    const [results] = await sequelize.query(`
      PRAGMA table_info(products);
    `);

    const hasProductType = results.some(column => column.name === 'productType');

    if (hasProductType) {
      console.log('✓ productType column already exists');
      return;
    }

    // Add productType column
    await sequelize.query(`
      ALTER TABLE products ADD COLUMN productType TEXT DEFAULT 'Gas' NOT NULL;
    `);

    console.log('✓ productType column added successfully');

    // Update existing products with default productType
    await sequelize.query(`
      UPDATE products SET productType = 'Gas' WHERE productType IS NULL;
    `);

    console.log('✓ Existing products updated with default productType');
    console.log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addProductType()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration error:', error);
      process.exit(1);
    });
}

module.exports = addProductType;
