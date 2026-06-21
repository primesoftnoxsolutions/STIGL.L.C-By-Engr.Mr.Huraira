const { sequelize, User } = require('./models');

async function resetPassword() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected');
    
    // Simply update the existing user's password
    const existingUser = await User.findOne({ where: { email: 'admin@example.com' } });
    if (existingUser) {
      // Update password (which will trigger the beforeUpdate hook)
      await existingUser.update({ password: 'admin123' });
      console.log('✓ Updated user password');
      console.log('Email:', existingUser.email);
      console.log('Password hash:', existingUser.password);
      
      // Refresh from database to get updated password
      await existingUser.reload();
      
      // Test password comparison
      const testMatch = await existingUser.comparePassword('admin123');
      console.log('Password test:', testMatch ? '✓ WORKS' : '❌ FAILED');
    } else {
      console.log('❌ User not found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

resetPassword();
