const { User } = require('../models');

async function createSuperAdmin() {
  try {
    console.log('\n=== Creating Super Admin ===\n');

    // Check if super admin already exists
    const existingAdmin = await User.findOne({
      where: { email: 'admin@example.com' }
    });

    if (existingAdmin) {
      console.log('✓ Super Admin already exists!');
      console.log('\nLogin Credentials:');
      console.log('Email: admin@example.com');
      console.log('Password: admin123');
      process.exit(0);
    }

    // Create super admin
    const superAdmin = await User.create({
      username: 'superadmin',
      email: 'admin@example.com',
      password: 'admin123',
      fullName: 'Super Admin',
      role: 'super_admin',
      phone: '+1234567890',
      address: 'Admin Office',
      isActive: true
    });

    console.log('✓ Super Admin created successfully!');
    console.log('\nLogin Credentials:');
    console.log('Email: admin@example.com');
    console.log('Password: admin123');
    console.log('\nUser ID:', superAdmin.id);

    process.exit(0);
  } catch (error) {
    console.error('Error creating Super Admin:', error.message);
    process.exit(1);
  }
}

createSuperAdmin();
