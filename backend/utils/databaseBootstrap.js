const { Client } = require('pg');

function escapeIdentifier(identifier) {
  return String(identifier).replace(/"/g, '""');
}

async function ensureDatabaseExists({
  host,
  port,
  database,
  user,
  password,
  logger = console
}) {
  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres'
  });

  let connected = false;

  try {
    await client.connect();
    connected = true;

    const existsResult = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [database]
    );

    if (existsResult.rowCount > 0) {
      logger.log?.(`[DB] Database "${database}" already exists.`);
      return false;
    }

    logger.log?.(`[DB] Database "${database}" does not exist. Creating...`);
    await client.query(`CREATE DATABASE "${escapeIdentifier(database)}"`);
    logger.log?.(`[DB] Database "${database}" created successfully.`);
    return true;
  } catch (error) {
    throw error;
  } finally {
    if (connected) {
      await client.end();
    }
  }
}

module.exports = {
  ensureDatabaseExists
};
