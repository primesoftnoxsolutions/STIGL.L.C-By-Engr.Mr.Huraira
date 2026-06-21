const { User } = require('../models');

async function checkUser() {
  try {
    const user = await User.findOne({ where: { email: 'admin@example.com' } });
    if (user) {
      console.log('User found:', user.email);
      console.log('Hashed Password:', user.password);
    } else {
      console.log('User NOT found.');
    }
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUser();
