process.env.TZ = 'Asia/Dubai';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sequelize = require('./config/database');
const { startDailyStockScheduler } = require('./services/dailyStockScheduler');
const { startDailyCleanupScheduler } = require('./services/dailyCleanupScheduler');
const { ensureBootstrapAdmin } = require('./services/bootstrapAdmin');
const { ensureDatabaseExists } = require('./utils/databaseBootstrap');

const app = express();
// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Cylinder Management ERP API is running'
  });
});

// Import routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/cylinders', require('./routes/cylinders'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/sales-invoices', require('./routes/salesInvoices'));
app.use('/api/rentals', require('./routes/rentals'));
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/receiving-invoices', require('./routes/receivingInvoices'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/products', require('./routes/products'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/deposits', require('./routes/deposits'));
app.use('/api/stock-transfers', require('./routes/stockTransfers'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/customer-item-rates', require('./routes/customerItemRates'));
app.use('/api/system', require('./routes/system'));
app.use('/api/time', require('./routes/time'));

// Error handler
app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', {
    method: req?.method,
    path: req?.originalUrl || req?.url,
    message: err?.message,
    stack: err?.stack
  });
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Global error handling for uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

const startServer = async () => {
  try {
    console.log('About to start database authentication...');
    const dbName = process.env.DB_NAME || 'cylinder_erp';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbPassword = process.env.DB_PASSWORD || '';

    if (process.env.DB_AUTO_CREATE !== 'false' && process.env.NODE_ENV !== 'production') {
      await ensureDatabaseExists({
        host: dbHost,
        port: dbPort,
        database: dbName,
        user: dbUser,
        password: dbPassword
      });
    }

    await sequelize.authenticate();
    console.log('Database connected successfully');

    const shouldAlter = process.env.DB_SYNC_ALTER === 'true';
    const shouldForce = process.env.DB_SYNC_FORCE === 'true';
    if (shouldAlter || shouldForce) {
      console.log(`[DB] sync options: alter=${shouldAlter} force=${shouldForce}`);
    }
    await sequelize.sync({ alter: shouldAlter, force: shouldForce });
    console.log('Database synced successfully');
    await ensureBootstrapAdmin();
    await startDailyStockScheduler();
    startDailyCleanupScheduler();

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('[DATABASE ERROR]', err);
    process.exit(1);
  }
};

startServer();
