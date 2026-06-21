const axios = require('axios');

async function quickTest() {
  try {
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@example.com',
      password: 'admin123'
    });
    
    const token = loginRes.data.token;
    console.log('✓ Login successful');
    
    const rentalRes = await axios.post('http://localhost:5000/api/rentals', {
      customerId: 'c1a96d0f-bddf-4d91-9914-043f0e023e38',
      startDate: '2026-02-02',
      items: [
        { productId: '1', quantity: 1, rentalDays: 30 }
      ],
      rentalAmount: 300,
      securityDeposit: 0,
      signature: null
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✓ Rental created:', rentalRes.data.data.id);
  } catch (error) {
    console.error('❌ Error:', {
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      message: error.message,
      response: error.response?.data
    });
  }
}

quickTest();
