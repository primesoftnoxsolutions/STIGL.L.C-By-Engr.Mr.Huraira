const { sequelize, User, Customer, Cylinder, CompanySettings } = require('../models');

async function seedDatabase() {
  try {
    console.log('Starting database seed...\n');

    // Connect to database
    await sequelize.authenticate();
    console.log('✓ Database connected');

    // Sync models
    await sequelize.sync({ alter: true });
    console.log('✓ Database synced\n');

    // Create Super Admin
    const superAdmin = await User.findOrCreate({
      where: { email: 'admin@example.com' },
      defaults: {
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
        fullName: 'System Administrator',
        role: 'super_admin',
        phone: '+1234567890',
        isActive: true
      }
    });
    console.log('✓ Super Admin created');

    // Create Manager
    const manager = await User.findOrCreate({
      where: { email: 'viewer@example.com' },
      defaults: {
        username: 'viewer',
        email: 'viewer@example.com',
        password: 'admin123',
        fullName: 'Operations Manager',
        role: 'manager',
        phone: '+1234567891',
        isActive: true
      }
    });
    console.log('✓ Manager created');

    // Create Employee
    const employee = await User.findOrCreate({
      where: { email: 'employee@example.com' },
      defaults: {
        username: 'employee',
        email: 'employee@example.com',
        password: 'admin123',
        fullName: 'John Employee',
        role: 'employee',
        phone: '+1234567892',
        isActive: true
      }
    });
    console.log('✓ Employee created\n');

    // Create sample customers
    const customers = [
      {
        customerCode: 'CUST00001',
        name: 'ABC Restaurant',
        email: 'abc@restaurant.com',
        phone: '+1234567893',
        address: '123 Main Street',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        customerType: 'business',
        creditLimit: 5000,
        isActive: true
      },
      {
        customerCode: 'CUST00002',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567894',
        address: '456 Oak Avenue',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90001',
        customerType: 'individual',
        creditLimit: 1000,
        isActive: true
      }
    ];

    for (const customer of customers) {
      await Customer.findOrCreate({
        where: { customerCode: customer.customerCode },
        defaults: customer
      });
    }
    console.log('✓ Sample customers created');

    // Create sample cylinders
    const cylinderTypes = ['12kg', '19kg', '45kg'];
    const statuses = ['available', 'filled', 'empty', 'rented'];

    for (let i = 1; i <= 20; i++) {
      const type = cylinderTypes[Math.floor(Math.random() * cylinderTypes.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      await Cylinder.findOrCreate({
        where: { cylinderNumber: `CYL${String(i).padStart(4, '0')}` },
        defaults: {
          cylinderNumber: `CYL${String(i).padStart(4, '0')}`,
          cylinderType: type,
          capacity: parseFloat(type),
          status: status,
          location: 'Main Warehouse',
          purchaseDate: new Date(),
          purchasePrice: 50 + (Math.random() * 50)
        }
      });
    }
    console.log('✓ Sample cylinders created');

    // Create company settings
    await CompanySettings.findOrCreate({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      defaults: {
        companyName: 'Cylinder Management Company',
        email: 'info@cylinderco.com',
        phone: '+1234567890',
        address: '789 Business Street',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
        currency: 'USD',
        dateFormat: 'YYYY-MM-DD',
        timeZone: 'America/New_York',
        invoicePrefix: 'INV',
        quotationPrefix: 'QUO',
        rentalPrefix: 'RNT',
        paymentPrefix: 'PAY'
      }
    });
    console.log('✓ Company settings created\n');

    console.log('=== Database seeded successfully! ===\n');
    console.log('Login Credentials:\n');
    console.log('Super Admin:');
    console.log('  Email: admin@example.com');
    console.log('  Password: admin123\n');
    console.log('Admin (View Only):');
    console.log('  Email: viewer@example.com');
    console.log('  Password: admin123\n');
    console.log('Employee:');
    console.log('  Email: employee@example.com');
    console.log('  Password: admin123\n');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
