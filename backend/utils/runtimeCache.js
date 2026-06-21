const caches = new Map();

const registerCache = (name, cacheInstance) => {
  if (!name || !cacheInstance) return;
  caches.set(String(name), cacheInstance);
};

const clearRegisteredCaches = () => {
  let clearedCaches = 0;
  let bytesReclaimed = 0;

  for (const cacheInstance of caches.values()) {
    if (!cacheInstance || typeof cacheInstance.clear !== 'function') continue;
    const sizeBefore = typeof cacheInstance.size === 'number' ? cacheInstance.size : 0;
    cacheInstance.clear();
    clearedCaches += 1;
    bytesReclaimed += sizeBefore * 256;
  }

  return { clearedCaches, bytesReclaimed };
};

module.exports = {
  registerCache,
  clearRegisteredCaches
};
