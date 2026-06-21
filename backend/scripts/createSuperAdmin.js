const { User, sequelize } = require('../models');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function createSuperAdmin() {
  try {
    console.log('\n=== Create Super Admin User ===\n');

    // Connect to database
    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    // Get user input
    const fullName = await question('Full Name: ');
    const username = await question('Username: ');
    const email = await question('Email: ');
    const password = await question('Password: ');
    const phone = await question('Phone (optional): ');

    // Validate required fields
    if (!fullName || !username || !email || !password) {
      console.error('\n✗ Error: All fields except phone are required');
      process.exit(1);
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: { email }
    });

    if (existingUser) {
      console.error('\n✗ Error: User with this email already exists');
      process.exit(1);
    }

    // Create super admin
    const user = await User.create({
      fullName,
      username,
      email,
      password,
      phone: phone || null,
      role: 'super_admin',
      isActive: true
    });

    console.log('\n✓ Super Admin created successfully!');
    console.log('\nLogin Credentials:');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('\n⚠️  Please save these credentials securely and change the password after first login.\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error creating super admin:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

createSuperAdmin();
