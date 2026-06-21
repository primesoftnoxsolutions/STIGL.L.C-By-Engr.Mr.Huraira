/**
 * Migrates legacy "admin" role users to "manager" and updates PostgreSQL enum when possible.
 * Run: node migrations/replaceAdminWithManagerRole.js
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
    await client.query(`UPDATE users SET role = 'manager' WHERE role = 'admin'`);

    const enumCheck = await client.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'enum_users_role'
      ORDER BY e.enumsortorder
    `);

    const labels = enumCheck.rows.map((row) => row.enumlabel);
    if (!labels.includes('manager')) {
      await client.query(`ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'manager'`);
    }

    console.log('[MIGRATION] Updated admin users to manager role.');
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error('[MIGRATION] Failed:', error.message);
  process.exit(1);
});
