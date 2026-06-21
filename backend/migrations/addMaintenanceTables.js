/**
 * Creates maintenance and activity log tables.
 * Run: node migrations/addMaintenanceTables.js
 */
require('dotenv').config();
const { Client } = require('pg');

const run = async () => {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'cylinder_erp',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  await client.connect();

  try {
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_maintenance_runs_status" AS ENUM ('success', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_runs (
        id UUID PRIMARY KEY,
        status "enum_maintenance_runs_status" NOT NULL DEFAULT 'success',
        "bytesCleaned" BIGINT NOT NULL DEFAULT 0,
        message VARCHAR(255) NOT NULL,
        details JSONB,
        "ranAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS system_activity_logs (
        id UUID PRIMARY KEY,
        action VARCHAR(80) NOT NULL,
        module VARCHAR(80) NOT NULL DEFAULT 'system',
        message TEXT NOT NULL,
        details JSONB,
        "actorUserId" UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_notification_dismissals (
        id UUID PRIMARY KEY,
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "maintenanceRunId" UUID NOT NULL REFERENCES maintenance_runs(id) ON DELETE CASCADE,
        "dismissedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("userId", "maintenanceRunId")
      );
    `);

    console.log('[MIGRATION] Maintenance tables created.');
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error('[MIGRATION] Failed:', error.message);
  process.exit(1);
});
