const DEFAULT_TTL_MS = 60 * 60 * 1000;

const store = new Map();

const estimateEntryBytes = (entry) => {
  if (!entry) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(entry.data || ''), 'utf8');
  } catch {
    return 64;
  }
};

const setTemp = (key, data, ttlMs = DEFAULT_TTL_MS) => {
  if (!key) return;
  const expiresAt = Date.now() + Math.max(1000, Number(ttlMs) || DEFAULT_TTL_MS);
  store.set(String(key), { data, expiresAt, createdAt: Date.now() });
};

const getTemp = (key) => {
  const entry = store.get(String(key));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(String(key));
    return null;
  }
  return entry.data;
};

const deleteTemp = (key) => {
  store.delete(String(key));
};

const cleanExpired = () => {
  const now = Date.now();
  let removedEntries = 0;
  let bytesReclaimed = 0;

  for (const [key, entry] of store.entries()) {
    if (!entry || entry.expiresAt <= now) {
      bytesReclaimed += estimateEntryBytes(entry);
      store.delete(key);
      removedEntries += 1;
    }
  }

  return { removedEntries, bytesReclaimed };
};

const getStats = () => ({
  activeEntries: store.size
});

module.exports = {
  setTemp,
  getTemp,
  deleteTemp,
  cleanExpired,
  getStats
};
