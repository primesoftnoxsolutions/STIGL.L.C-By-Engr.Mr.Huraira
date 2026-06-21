const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function testCustomersAPI() {
  try {
    // First login to get a token
    console.log('Logging in...');
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    
    console.log('Login Status:', loginRes.status);
    console.log('Login Response:', JSON.stringify(loginRes.data, null, 2).substring(0, 500));
    const token = loginRes.data.data.token || loginRes.data.token;
    console.log('Token received:', token?.substring(0, 20) + '...');

    // Now fetch customers with the token
    console.log('\nFetching customers...');
    const customersRes = await axios.get(`${API_BASE}/customers`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('Customers Status:', customersRes.status);
    console.log('Customers Data (first 3):');
    const customers = customersRes.data.data.slice(0, 3);
    customers.forEach(customer => {
      console.log(`  - ID: ${customer.id}, Name: ${customer.name}, Email: ${customer.email}`);
    });
    
    if (customers.length > 0) {
      console.log('\nFirst customer object structure:');
      console.log(JSON.stringify(customers[0], null, 2).substring(0, 500));
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testCustomersAPI();
