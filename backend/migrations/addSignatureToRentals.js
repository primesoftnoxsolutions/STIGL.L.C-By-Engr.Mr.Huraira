'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.addColumn('rentals', 'signature', {
        type: Sequelize.TEXT('long'),
        allowNull: true
      });
      console.log('✓ Added signature column to rentals table');
    } catch (error) {
      console.log('✓ Signature column already exists or skipped');
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.removeColumn('rentals', 'signature');
      console.log('✓ Removed signature column from rentals table');
    } catch (error) {
      console.log('✗ Error removing signature column:', error.message);
    }
  }
};
