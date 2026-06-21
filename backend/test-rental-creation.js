const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function testRentalCreation() {
  try {
    // First login to get a token
    console.log('📝 Logging in...');
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    
    const token = loginRes.data.token;
    console.log('✓ Login successful\n');

    // Get customers and products
    console.log('📋 Fetching customers and products...');
    const [customersRes, productsRes] = await Promise.all([
      axios.get(`${API_BASE}/customers`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      axios.get(`${API_BASE}/products`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);

    const customer = customersRes.data.data[0];
    const products = productsRes.data.data.filter(p => p.productType === 'Cylinder' || p.productType === 'Tool');
    
    console.log(`✓ Found customer: ${customer.name}`);
    console.log(`✓ Found ${products.length} products\n`);

    if (products.length < 2) {
      console.log('⚠ Need at least 2 products for testing');
      return;
    }

    // Create rental with items
    console.log('🆕 Creating rental with items...');
    const rentalData = {
      customerId: customer.id,
      startDate: new Date().toISOString().split('T')[0],
      items: [
        {
          productId: products[0].id,
          quantity: 2,
          rentalDays: 30
        },
        {
          productId: products[1].id,
          quantity: 1,
          rentalDays: 30
        }
      ],
      rentalAmount: 600,
      securityDeposit: 0,
      signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    };

    const rentalRes = await axios.post(`${API_BASE}/rentals`, rentalData, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✓ Rental created successfully!');
    console.log('\n📊 Rental Details:');
    console.log(`  - ID: ${rentalRes.data.data.id}`);
    console.log(`  - Number: ${rentalRes.data.data.rentalNumber}`);
    console.log(`  - Customer: ${rentalRes.data.data.customer.name}`);
    console.log(`  - Items: ${rentalRes.data.data.items.length}`);
    console.log(`  - Amount: ${rentalRes.data.data.rentalAmount}`);
    
    console.log('\n📦 Items:');
    rentalRes.data.data.items.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.product.productName} - Qty: ${item.quantity}, Days: ${item.rentalDays}, Total: ${item.totalAmount}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('Server is not running on port 5000');
    }
    if (error.response?.data?.errors) {
      console.error('Validation Errors:', error.response.data.errors);
    }
  }
}

testRentalCreation();
