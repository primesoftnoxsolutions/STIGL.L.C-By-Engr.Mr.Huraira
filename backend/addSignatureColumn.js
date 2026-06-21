const { sequelize } = require('./models');

const addSignatureColumn = async () => {
  try {
    console.log('Adding signature column to rentals table...');
    const queryInterface = sequelize.getQueryInterface();
    
    try {
      await queryInterface.addColumn('rentals', 'signature', {
        type: 'TEXT',
        allowNull: true
      });
      console.log('✓ Signature column added successfully');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('✓ Signature column already exists');
      } else {
        throw error;
      }
    }
    
    await sequelize.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

addSignatureColumn();
