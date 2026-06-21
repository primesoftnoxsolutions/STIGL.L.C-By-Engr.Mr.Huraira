/**
 * Creates expenses table.
 * Run: node migrations/addExpensesTable.js
 */
require('dotenv').config();
const { Client } = require('pg');

const run = async () => {
  const clientConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      };

  const client = new Client(clientConfig);
  await client.connect();

  try {
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_expenses_expenseType" AS ENUM ('Diesel', 'Maintenance', 'Tyer');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id UUID PRIMARY KEY,
        "expenseType" "enum_expenses_expenseType" NOT NULL,
        "invoiceNumber" VARCHAR(50) NOT NULL UNIQUE,
        "expenseDate" DATE NOT NULL,
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        "vatAmount" NUMERIC(12, 2) NOT NULL DEFAULT 0,
        "totalAmount" NUMERIC(12, 2) NOT NULL DEFAULT 0,
        "employeeId" UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    console.log('[MIGRATION] Expenses table created.');
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error('[MIGRATION] Failed:', error.message);
  process.exit(1);
});
