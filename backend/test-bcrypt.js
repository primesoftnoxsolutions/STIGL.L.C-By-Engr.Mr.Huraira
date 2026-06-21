const bcrypt = require('bcryptjs');

async function test() {
  console.log('Testing bcryptjs...');
  const password = 'admin123';
  const salt = await bcrypt.genSalt(10);
  console.log('Generated salt');
  const hash = await bcrypt.hash(password, salt);
  console.log('Generated hash:', hash);
  const isMatch = await bcrypt.compare(password, hash);
  console.log('Compare result:', isMatch);
}

test().catch(console.error);
