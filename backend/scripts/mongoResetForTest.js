const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const FRIENDLY_DB_NAME = 'Syyed Tayyab Industrial Gases LLC';

const getDbNameFromUri = (uri) => {
  try {
    const parsed = new URL(uri);
    const dbName = (parsed.pathname || '').replace(/^\//, '').trim();
    return dbName || null;
  } catch (error) {
    return null;
  }
};

const toSnake = (name) => name
  .replace(/\.[^.]+$/, '')
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/[^a-zA-Z0-9]+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_|_$/g, '')
  .toLowerCase();

const main = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/syyed_tayyab_industrial_gases_llc';
  const dbName = getDbNameFromUri(uri);

  if (!dbName) {
    throw new Error('Could not parse database name from MONGO_URI');
  }

  if (['admin', 'config', 'local'].includes(dbName)) {
    throw new Error(`Refusing to reset system database: ${dbName}`);
  }

  const pagesDir = path.resolve(__dirname, '..', '..', 'frontend', 'src', 'pages');
  const pageFiles = fs.readdirSync(pagesDir).filter((f) => /\.(js|jsx|ts|tsx)$/.test(f));
  const collections = [...new Set(pageFiles.map((f) => toSnake(f)).filter(Boolean))];

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();

  const db = client.db(dbName);
  await db.dropDatabase();

  for (const collectionName of collections) {
    await db.createCollection(collectionName);
  }

  await db.collection('__app_meta').updateOne(
    { key: 'display_name' },
    {
      $set: {
        key: 'display_name',
        value: FRIENDLY_DB_NAME,
        dbName,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  const finalCollections = await db.listCollections({}, { nameOnly: true }).toArray();

  console.log(`[mongo:reset:test] uri=${uri}`);
  console.log(`[mongo:reset:test] db=${dbName}`);
  console.log(`[mongo:reset:test] createdCollections=${collections.length}`);
  console.log(
    `[mongo:reset:test] finalCollections=${finalCollections.map((c) => c.name).sort().join(',')}`
  );

  await client.close();
};

main().catch((error) => {
  console.error('[mongo:reset:test] failed:', error.message);
  process.exit(1);
});
