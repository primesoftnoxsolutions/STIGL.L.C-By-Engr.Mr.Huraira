const { User, sequelize } = require('./models');
const bcrypt = require('bcryptjs');

async function testLogin() {
  try {
    console.log('=== TESTING LOGIN FLOW ===\n');
    
    // Connect to database first
    await sequelize.authenticate();
    console.log('✓ Database connected\n');
    
    // 1. Check if demo user exists
    console.log('1. Checking if demo user exists...');
    const user = await User.findOne({ where: { email: 'admin@example.com' } });
    if (!user) {
      console.log('❌ Demo user NOT found. Creating...');
      const newUser = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
        fullName: 'System Administrator',
        role: 'super_admin',
        phone: '+1234567890',
        isActive: true
      });
      console.log('✓ Demo user created');
    } else {
      console.log('✓ Demo user found:', { id: user.id, email: user.email, role: user.role, isActive: user.isActive });
      console.log('   Password hash:', user.password.substring(0, 30) + '...');
    }
    
    // 2. Test password comparison
    console.log('\n2. Testing password comparison...');
    const testUser = await User.findOne({ where: { email: 'admin@example.com' } });
    console.log('   Testing bcrypt.compare directly...');
    try {
      const directMatch = await bcrypt.compare('admin123', testUser.password);
      console.log(directMatch ? '✓ Direct bcrypt.compare works' : '❌ Direct bcrypt.compare failed');
    } catch (err) {
      console.log('❌ bcrypt.compare threw error:', err.message);
    }
    
    console.log('   Testing User.comparePassword method...');
    const isMatch = await testUser.comparePassword('admin123');
    console.log(isMatch ? '✓ User.comparePassword works' : '❌ User.comparePassword failed');
    
    // 3. Test API endpoint
    console.log('\n3. Testing API endpoint...');
    console.log('   Sending login request...');
    try {
      const response = await fetch('http://127.0.0.1:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'admin123',
          role: 'super_admin'
        })
      });
      const data = await response.json();
      if (response.ok) {
        console.log('✓ API Login successful');
        console.log('Response:', JSON.stringify(data, null, 2));
      } else {
        console.log('❌ API Login failed with status:', response.status);
        console.log('Error:', JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.log('❌ API request failed');
      console.log('Error:', error.message);
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
  } finally {
    process.exit(0);
  }
}

testLogin();
