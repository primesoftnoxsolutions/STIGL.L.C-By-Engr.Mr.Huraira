const { MongoClient } = require('mongodb');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const getDbNameFromUri = (uri) => {
  try {
    const parsed = new URL(uri);
    const dbName = (parsed.pathname || '').replace(/^\//, '').trim();
    return dbName || null;
  } catch (error) {
    return null;
  }
};

const main = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/syyed_tayyab_industrial_gases_llc';
  const dbName = getDbNameFromUri(uri);

  if (!dbName) {
    throw new Error('Could not parse database name from MONGO_URI');
  }

  if (['admin', 'config', 'local'].includes(dbName)) {
    throw new Error(`Refusing to clear system database: ${dbName}`);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();

  const dropped = await client.db(dbName).dropDatabase();
  console.log(`[mongo:clear] uri=${uri}`);
  console.log(`[mongo:clear] db=${dbName}`);
  console.log(`[mongo:clear] dropped=${dropped}`);

  await client.close();
};

main().catch((error) => {
  console.error('[mongo:clear] failed:', error.message);
  process.exit(1);
});
