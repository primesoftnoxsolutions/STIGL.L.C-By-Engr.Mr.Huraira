/**
 * Adds walk-in customer support to quotations.
 * Run: node migrations/addQuotationWalkInCustomer.js
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
        CREATE TYPE "enum_quotations_customerType" AS ENUM ('existing', 'walk_in');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS "customerType" "enum_quotations_customerType" DEFAULT 'existing';
    `);

    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS "walkInCustomerName" VARCHAR(200);
    `);

    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS "walkInTrNumber" VARCHAR(100);
    `);

    await client.query(`
      ALTER TABLE quotations
      ALTER COLUMN "customerId" DROP NOT NULL;
    `);

    console.log('[MIGRATION] Quotation walk-in customer columns added.');
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error('[MIGRATION] Failed:', error.message);
  process.exit(1);
});
