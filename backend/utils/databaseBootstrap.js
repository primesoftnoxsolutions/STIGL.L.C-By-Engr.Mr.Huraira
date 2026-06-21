const { Client } = require('pg');
require('dotenv').config();

function escapeIdentifier(identifier) {
  return String(identifier).replace(/"/g, '""');
}

function getBootstrapClientConfig({ connectionString, host, port, user, password }) {
  if (connectionString) {
    return {
      connectionString,
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    };
  }

  if (!host || !port || !user) {
    throw new Error(
      'Missing database bootstrap configuration. Set DATABASE_URL or DB_HOST, DB_PORT, DB_USER, DB_PASSWORD.'
    );
  }

  const config = {
    host,
    port,
    user,
    password,
    database: 'postgres'
  };

  if (process.env.NODE_ENV === 'production') {
    config.ssl = {
      require: true,
      rejectUnauthorized: false
    };
  }

  return config;
}

async function ensureDatabaseExists({
  connectionString,
  host,
  port,
  database,
  user,
  password,
  logger = console
}) {
  const client = new Client(getBootstrapClientConfig({ connectionString, host, port, user, password }));

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
