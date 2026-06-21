const fs = require('fs/promises');
const path = require('path');

const TEMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const getCleanupDirectories = () => {
  const backendRoot = path.join(__dirname, '..');
  const uploadPath = process.env.UPLOAD_PATH
    ? path.resolve(backendRoot, process.env.UPLOAD_PATH)
    : path.join(backendRoot, 'uploads');

  return [
    path.join(backendRoot, 'temp'),
    path.join(backendRoot, 'cache'),
    uploadPath
  ];
};

const ensureDirectory = async (directoryPath) => {
  await fs.mkdir(directoryPath, { recursive: true });
};

const removePathRecursive = async (targetPath, stats) => {
  const entryStat = await fs.stat(targetPath);
  if (entryStat.isDirectory()) {
    const children = await fs.readdir(targetPath);
    for (const child of children) {
      await removePathRecursive(path.join(targetPath, child), stats);
    }
    return;
  }

  stats.removedFiles += 1;
  stats.bytesReclaimed += entryStat.size;
  await fs.unlink(targetPath);
};

const cleanDirectory = async (directoryPath, maxAgeMs = TEMP_FILE_MAX_AGE_MS) => {
  const stats = { removedFiles: 0, bytesReclaimed: 0, scannedFiles: 0 };
  await ensureDirectory(directoryPath);

  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const now = Date.now();

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    const entryStat = await fs.stat(entryPath);
    stats.scannedFiles += 1;

    const isExpired = now - entryStat.mtimeMs >= maxAgeMs;
    const isTempFile = /\.tmp$/i.test(entry.name) || entry.name.startsWith('temp-');

    if (!isExpired && !isTempFile) {
      continue;
    }

    if (entryStat.isDirectory()) {
      await removePathRecursive(entryPath, stats);
      await fs.rmdir(entryPath).catch(() => {});
      continue;
    }

    stats.removedFiles += 1;
    stats.bytesReclaimed += entryStat.size;
    await fs.unlink(entryPath);
  }

  return stats;
};

const cleanManagedDirectories = async () => {
  const directories = getCleanupDirectories();
  const aggregate = {
    removedFiles: 0,
    bytesReclaimed: 0,
    scannedFiles: 0,
    directories: []
  };

  for (const directoryPath of directories) {
    const result = await cleanDirectory(directoryPath);
    aggregate.removedFiles += result.removedFiles;
    aggregate.bytesReclaimed += result.bytesReclaimed;
    aggregate.scannedFiles += result.scannedFiles;
    aggregate.directories.push({
      path: directoryPath,
      ...result
    });
  }

  return aggregate;
};

module.exports = {
  getCleanupDirectories,
  cleanManagedDirectories
};
